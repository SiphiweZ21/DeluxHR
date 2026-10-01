import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Feature,
  OnboardingMode,
  OnboardingStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CustomerOnboardingService } from '../customer-onboarding/customer-onboarding.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { UpdateOnboardingModeDto } from './dto/update-onboarding-mode.dto';

type ModuleReadinessStatus =
  | 'DISABLED'
  | 'READY'
  | 'SETUP_REQUIRED'
  | 'BLOCKED';

type ModuleReadiness = {
  enabled: boolean;
  status: ModuleReadinessStatus;
  reason?: string;
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerOnboarding: CustomerOnboardingService,
  ) {}

  async getCurrent(organizationId: string) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        include: {
          onboarding: true,
          features: true,
          payrollSettings: true,
          earlyPayPolicy: true,
          _count: {
            select: {
              departments: true,
              leaveTypes: true,
            },
          },
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    const goLive = await this.customerOnboarding.readiness(organizationId);

    const activeCompanyAdmins =
      await this.prisma.user.count({
        where: {
          organizationId,
          role: UserRole.COMPANY_ADMIN,
          isActive: true,
        },
      });

    const companyProfileComplete =
      this.isCompanyProfileComplete(
        organization,
      );

    const departmentsComplete =
      organization._count.departments > 0;

    const accessSetupComplete =
      activeCompanyAdmins > 0;

    const coreSteps = [
      companyProfileComplete,
      departmentsComplete,
      accessSetupComplete,
    ];

    const completedSteps = goLive.progress.completedSteps;
    const totalSteps = goLive.progress.totalSteps;
    const progressPercentage = goLive.progress.percentage;

    const calculatedStatus =
      this.calculateStatus(
        completedSteps,
        totalSteps,
      );

    const now = new Date();

    const onboarding =
      await this.prisma.organizationOnboarding.upsert({
        where: {
          organizationId,
        },
        create: {
          organizationId,
          status: calculatedStatus,
          companyProfileComplete,
          departmentsComplete,
          accessSetupComplete,
          startedAt:
            calculatedStatus ===
            OnboardingStatus.NOT_STARTED
              ? null
              : now,
          completedAt:
            calculatedStatus ===
            OnboardingStatus.COMPLETED
              ? now
              : null,
        },
        update: {
          status: calculatedStatus,
          companyProfileComplete,
          departmentsComplete,
          accessSetupComplete,

          ...(organization.onboarding
            ?.startedAt == null &&
          calculatedStatus !==
            OnboardingStatus.NOT_STARTED
            ? {
                startedAt: now,
              }
            : {}),

          ...(calculatedStatus ===
          OnboardingStatus.COMPLETED
            ? {
                completedAt:
                  organization.onboarding
                    ?.completedAt ?? now,
              }
            : {
                completedAt: null,
                completedByUserId: null,
              }),
        },
      });

    const modules =
      this.calculateModuleReadiness({
        features: organization.features,
        coreComplete:
          calculatedStatus ===
          OnboardingStatus.COMPLETED,
        leaveTypeCount:
          organization._count.leaveTypes,
        payrollSettingsExists:
          organization.payrollSettings !== null,
        earlyPayPolicyExists:
          organization.earlyPayPolicy !== null,
      });

    const enabledModules =
      Object.values(modules).filter(
        (module) => module.enabled,
      );

    const readyModules =
      enabledModules.filter(
        (module) =>
          module.status === 'READY',
      );

    const productReady =
      enabledModules.every(
        (module) =>
          module.status === 'READY',
      );

    return {
      status: onboarding.status,
      mode: onboarding.mode,

      progress: {
        completedSteps,
        totalSteps,
        percentage: progressPercentage,
      },

      steps: {
        companyProfile: {
          complete:
            onboarding.companyProfileComplete,
          required: true,
        },

        departments: {
          complete:
            onboarding.departmentsComplete,
          required: true,
          count:
            organization._count.departments,
        },

        accessSetup: {
          complete:
            onboarding.accessSetupComplete,
          required: true,
          activeCompanyAdmins,
        },
      },

      goLiveReadiness: goLive,

      modules,

      productReadiness: {
        ready: productReady,
        enabledModules:
          enabledModules.length,
        readyModules:
          readyModules.length,
      },

      assistanceRequested:
        onboarding.assistanceRequested,

      startedAt: onboarding.startedAt,
      completedAt: onboarding.completedAt,
    };
  }

  async updateMode(
    organizationId: string,
    dto: UpdateOnboardingModeDto,
    actor: TenantJwtUser,
  ) {
    const onboarding =
      await this.ensureOnboarding(organizationId);

    if (onboarding.mode === dto.mode) {
      return onboarding;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organizationOnboarding.update({
            where: {
              organizationId,
            },
            data: {
              mode: dto.mode,
            },
          });

        await tx.auditLog.create({
          data: {
            organizationId,
            action:
              'ONBOARDING_MODE_CHANGED',
            entity:
              'OrganizationOnboarding',
            entityId: updated.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              previousMode: onboarding.mode,
              newMode: dto.mode,
            } satisfies Prisma.InputJsonObject,
          },
        });

        return updated;
      },
    );
  }

  async requestAssistance(
    organizationId: string,
    actor: TenantJwtUser,
  ) {
    const onboarding =
      await this.ensureOnboarding(organizationId);

    if (onboarding.assistanceRequested) {
      return onboarding;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organizationOnboarding.update({
            where: {
              organizationId,
            },
            data: {
              mode: OnboardingMode.ASSISTED,
              assistanceRequested: true,
            },
          });

        await tx.auditLog.create({
          data: {
            organizationId,
            action:
              'ONBOARDING_ASSISTANCE_REQUESTED',
            entity:
              'OrganizationOnboarding',
            entityId: updated.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              previousMode: onboarding.mode,
              newMode: OnboardingMode.ASSISTED,
            } satisfies Prisma.InputJsonObject,
          },
        });

        return updated;
      },
    );
  }

  async cancelAssistance(
    organizationId: string,
    actor: TenantJwtUser,
  ) {
    const onboarding =
      await this.ensureOnboarding(organizationId);

    if (!onboarding.assistanceRequested) {
      return onboarding;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organizationOnboarding.update({
            where: {
              organizationId,
            },
            data: {
              assistanceRequested: false,
            },
          });

        await tx.auditLog.create({
          data: {
            organizationId,
            action:
              'ONBOARDING_ASSISTANCE_CANCELLED',
            entity:
              'OrganizationOnboarding',
            entityId: updated.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
          },
        });

        return updated;
      },
    );
  }

  private async ensureOnboarding(
    organizationId: string,
  ) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    return this.prisma.organizationOnboarding.upsert({
      where: {
        organizationId,
      },
      update: {},
      create: {
        organizationId,
      },
    });
  }

  private calculateModuleReadiness(input: {
    features: Array<{
      feature: Feature;
      enabled: boolean;
    }>;
    coreComplete: boolean;
    leaveTypeCount: number;
    payrollSettingsExists: boolean;
    earlyPayPolicyExists: boolean;
  }): Record<Feature, ModuleReadiness> {
    const enabledFeatures = new Set(
      input.features
        .filter((item) => item.enabled)
        .map((item) => item.feature),
    );

    const modules = {} as Record<
      Feature,
      ModuleReadiness
    >;

    for (const feature of Object.values(Feature)) {
      if (!enabledFeatures.has(feature)) {
        modules[feature] = {
          enabled: false,
          status: 'DISABLED',
        };

        continue;
      }

      switch (feature) {
        case Feature.CORE_HR:
          modules[feature] =
            input.coreComplete
              ? {
                  enabled: true,
                  status: 'READY',
                }
              : {
                  enabled: true,
                  status: 'SETUP_REQUIRED',
                  reason:
                    'Complete the core company onboarding steps.',
                };
          break;

        case Feature.LEAVE:
          modules[feature] =
            input.leaveTypeCount > 0
              ? {
                  enabled: true,
                  status: 'READY',
                }
              : {
                  enabled: true,
                  status: 'SETUP_REQUIRED',
                  reason:
                    'Create at least one leave type.',
                };
          break;

        case Feature.ATTENDANCE:
        case Feature.TIMESHEETS:
        case Feature.WORKFORCE_INSIGHTS:
        case Feature.EXECUTIVE_DASHBOARD:
          modules[feature] = {
            enabled: true,
            status: 'READY',
          };
          break;

        case Feature.PAYROLL:
          modules[feature] =
            input.payrollSettingsExists
              ? {
                  enabled: true,
                  status: 'READY',
                }
              : {
                  enabled: true,
                  status: 'SETUP_REQUIRED',
                  reason:
                    'Complete the company payroll settings.',
                };
          break;

        case Feature.PAYSLIPS:
          modules[feature] =
            input.payrollSettingsExists
              ? {
                  enabled: true,
                  status: 'READY',
                }
              : {
                  enabled: true,
                  status: 'BLOCKED',
                  reason:
                    'Complete Payroll setup before using Payslips.',
                };
          break;

        case Feature.WHATSAPP:
          modules[feature] = {
            enabled: true,
            status: 'SETUP_REQUIRED',
            reason:
              'WhatsApp company configuration is required.',
          };
          break;

        case Feature.EARLY_PAY:
          if (!input.payrollSettingsExists) {
            modules[feature] = {
              enabled: true,
              status: 'BLOCKED',
              reason:
                'Complete Payroll setup before configuring Early Pay.',
            };
          } else if (
            !input.earlyPayPolicyExists
          ) {
            modules[feature] = {
              enabled: true,
              status: 'SETUP_REQUIRED',
              reason:
                'Configure the company Early Pay policy.',
            };
          } else {
            modules[feature] = {
              enabled: true,
              status: 'READY',
            };
          }
          break;
      }
    }

    return modules;
  }

  private isCompanyProfileComplete(
    organization: {
      name: string;
      legalName: string | null;
      email: string | null;
      phoneNumber: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      country: string | null;
      timezone: string | null;
    },
  ) {
    const requiredValues = [
      organization.name,
      organization.legalName,
      organization.email,
      organization.phoneNumber,
      organization.addressLine1,
      organization.city,
      organization.province,
      organization.postalCode,
      organization.country,
      organization.timezone,
    ];

    return requiredValues.every(
      (value) =>
        typeof value === 'string' &&
        value.trim().length > 0,
    );
  }

  private calculateStatus(
    completedSteps: number,
    totalSteps: number,
  ): OnboardingStatus {
    if (completedSteps === 0) {
      return OnboardingStatus.NOT_STARTED;
    }

    if (completedSteps === totalSteps) {
      return OnboardingStatus.COMPLETED;
    }

    return OnboardingStatus.IN_PROGRESS;
  }
}
