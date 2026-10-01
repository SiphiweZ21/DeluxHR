import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Feature,
  OrganizationStatus,
  Prisma,
  type UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { CustomerOnboardingService } from '../customer-onboarding/customer-onboarding.service';
import { ChangeOrganizationStatusDto } from './dto/change-organization-status.dto';
import { UpdateOrganizationFeatureDto } from './dto/update-organization-feature.dto';

type PlatformActor = {
  sub: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
    private readonly customerOnboarding: CustomerOnboardingService,
  ) {}

  async listOrganizations() {
    return this.prisma.organization.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            users: true,
            employees: true,
            departments: true,
          },
        },
        users: {
          where: {
            role: 'COMPANY_ADMIN',
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 1,
        },
      },
    });
  }

  async getOrganization(id: string) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id,
        },
        include: {
          users: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          features: {
            orderBy: {
              feature: 'asc',
            },
          },
          _count: {
            select: {
              users: true,
              employees: true,
              departments: true,
            },
          },
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    return organization;
  }

  async getOrganizationOnboarding(
    organizationId: string,
  ) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    const onboarding =
      await this.onboardingService.getCurrent(
        organizationId,
      );

    return {
      organization,
      onboarding,
    };
  }

  async changeOrganizationStatus(
    id: string,
    dto: ChangeOrganizationStatusDto,
    actor: PlatformActor,
  ) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    if (organization.status === dto.status) {
      throw new BadRequestException(
        `Organization is already ${dto.status}.`,
      );
    }

    this.validateStatusTransition(
      organization.status,
      dto.status,
    );

    if (organization.status === OrganizationStatus.PENDING && dto.status === OrganizationStatus.ACTIVE) {
      const readiness = await this.customerOnboarding.readiness(id);
      if (!readiness.ready) throw new BadRequestException({ message: 'Company is not ready for go-live', missingSteps: readiness.checklist.filter(step => step.required && !step.ready).map(step => step.key) });
    }

    const reason = dto.reason.trim();

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organization.update({
            where: {
              id: organization.id,
            },
            data: {
              status: dto.status,
            },
          });

        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            action:
              'ORGANIZATION_STATUS_CHANGED',
            entity: 'Organization',
            entityId: organization.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            reason,
            metadata: {
              previousStatus:
                organization.status,
              newStatus: dto.status,
            } satisfies Prisma.InputJsonObject,
          },
        });
        await tx.platformAuditEvent.create({
          data: { organizationId: organization.id, actorUserId: actor.sub,
            action: 'ORGANIZATION_STATUS_CHANGED', entity: 'Organization',
            entityId: organization.id, reason },
        });

        /*
         * CORE_HR is the mandatory baseline entitlement.
         *
         * Every ACTIVE organization must have CORE_HR enabled.
         * This runs in the same transaction as activation so an
         * organization can never successfully become ACTIVE without
         * its baseline entitlement being available.
         */
        if (
          dto.status === OrganizationStatus.ACTIVE
        ) {
          const existingCoreHr =
            await tx.organizationFeature.findUnique({
              where: {
                organizationId_feature: {
                  organizationId:
                    organization.id,
                  feature: Feature.CORE_HR,
                },
              },
            });

          const previousEnabled =
            existingCoreHr?.enabled === true;

          if (!previousEnabled) {
            const now = new Date();

            const coreHr =
              await tx.organizationFeature.upsert({
                where: {
                  organizationId_feature: {
                    organizationId:
                      organization.id,
                    feature: Feature.CORE_HR,
                  },
                },
                create: {
                  organizationId:
                    organization.id,
                  feature: Feature.CORE_HR,
                  enabled: true,
                  enabledAt: now,
                  disabledAt: null,
                },
                update: {
                  enabled: true,
                  enabledAt: now,
                  disabledAt: null,
                },
              });

            await tx.auditLog.create({
              data: {
                organizationId:
                  organization.id,
                action:
                  'ORGANIZATION_FEATURE_CHANGED',
                entity:
                  'OrganizationFeature',
                entityId: coreHr.id,
                actorUserId: actor.sub,
                actorEmail: actor.email,
                actorRole: actor.role,
                reason,
                metadata: {
                  feature: Feature.CORE_HR,
                  previousEnabled,
                  newEnabled: true,
                  trigger:
                    'ORGANIZATION_ACTIVATION',
                } satisfies Prisma.InputJsonObject,
              },
            });
          }
        }

        return updated;
      },
    );
  }

  async getOrganizationFeatures(
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

    const configuredFeatures =
      await this.prisma.organizationFeature.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          feature: 'asc',
        },
      });
    const subscription = await this.prisma.platformSubscription.findUnique({
      where: { organizationId },
      select: { status: true, endsAt: true },
    });
    const subscriptionAvailable = !subscription ||
      subscription.status === 'ACTIVE' &&
      (!subscription.endsAt || subscription.endsAt > new Date());

    const configuredByFeature = new Map(
      configuredFeatures.map((item) => [
        item.feature,
        item,
      ]),
    );

    return Object.values(Feature).map(
      (feature) => {
        const configured =
          configuredByFeature.get(feature);

        return {
          feature,
          enabled:
            feature === Feature.CORE_HR || configured?.enabled === true,
          effectiveEnabled:
            feature === Feature.CORE_HR || (subscriptionAvailable && configured?.enabled === true),
          enabledAt:
            configured?.enabledAt ?? null,
          disabledAt:
            configured?.disabledAt ?? null,
          configured:
            configured !== undefined,
        };
      },
    );
  }

  async updateOrganizationFeature(
    organizationId: string,
    feature: Feature,
    dto: UpdateOrganizationFeatureDto,
    actor: PlatformActor,
  ) {
    this.assertValidFeature(feature);

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw new BadRequestException(
        'A reason is required.',
      );
    }

    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    /*
     * CORE_HR cannot be removed from an ACTIVE tenant.
     * Suspending the organization is the supported way to
     * disable all customer access.
     */
    if (
      feature === Feature.CORE_HR &&
      dto.enabled === false
    ) {
      throw new BadRequestException(
        'Core HR is included for every company. Suspend the company to block all access.',
      );
    }

    const existing =
      await this.prisma.organizationFeature.findUnique({
        where: {
          organizationId_feature: {
            organizationId,
            feature,
          },
        },
      });

    const previousEnabled =
      existing?.enabled === true;

    if (previousEnabled === dto.enabled) {
      throw new BadRequestException(
        `${feature} is already ${
          dto.enabled ? 'enabled' : 'disabled'
        }.`,
      );
    }

    await this.validateFeatureDependencies(
      organizationId,
      feature,
      dto.enabled,
    );

    const now = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organizationFeature.upsert({
            where: {
              organizationId_feature: {
                organizationId,
                feature,
              },
            },
            create: {
              organizationId,
              feature,
              enabled: dto.enabled,
              enabledAt: now,
              disabledAt: dto.enabled
                ? null
                : now,
            },
            update: dto.enabled
              ? {
                  enabled: true,
                  enabledAt: now,
                  disabledAt: null,
                }
              : {
                  enabled: false,
                  disabledAt: now,
                },
          });

        await tx.auditLog.create({
          data: {
            organizationId,
            action:
              'ORGANIZATION_FEATURE_CHANGED',
            entity:
              'OrganizationFeature',
            entityId: updated.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            reason,
            metadata: {
              feature,
              previousEnabled,
              newEnabled: dto.enabled,
            } satisfies Prisma.InputJsonObject,
          },
        });
        await tx.platformAuditEvent.create({
          data: { organizationId, actorUserId: actor.sub,
            action: 'ORGANIZATION_FEATURE_CHANGED', entity: 'OrganizationFeature',
            entityId: updated.id, reason },
        });

        return updated;
      },
    );
  }

  private async validateFeatureDependencies(
    organizationId: string,
    feature: Feature,
    enabling: boolean,
  ) {
    if (
      enabling &&
      (
        feature === Feature.PAYSLIPS ||
        feature === Feature.EARLY_PAY
      )
    ) {
      const payroll =
        await this.prisma.organizationFeature.findUnique({
          where: {
            organizationId_feature: {
              organizationId,
              feature: Feature.PAYROLL,
            },
          },
          select: {
            enabled: true,
          },
        });

      if (payroll?.enabled !== true) {
        throw new BadRequestException(
          `${feature} requires PAYROLL to be enabled.`,
        );
      }
    }

    if (
      !enabling &&
      feature === Feature.PAYROLL
    ) {
      const dependants =
        await this.prisma.organizationFeature.findMany({
          where: {
            organizationId,
            feature: {
              in: [
                Feature.PAYSLIPS,
                Feature.EARLY_PAY,
              ],
            },
            enabled: true,
          },
          select: {
            feature: true,
          },
        });

      if (dependants.length > 0) {
        throw new BadRequestException(
          `PAYROLL cannot be disabled while ${dependants
            .map((item) => item.feature)
            .join(', ')} is enabled.`,
        );
      }
    }
  }

  private assertValidFeature(
    feature: Feature,
  ) {
    if (
      !Object.values(Feature).includes(feature)
    ) {
      throw new BadRequestException(
        'Invalid organization feature.',
      );
    }
  }

  private validateStatusTransition(
    current: OrganizationStatus,
    next: OrganizationStatus,
  ) {
    const allowedTransitions: Record<
      OrganizationStatus,
      OrganizationStatus[]
    > = {
      PENDING: [
        OrganizationStatus.ACTIVE,
        OrganizationStatus.REJECTED,
      ],
      ACTIVE: [
        OrganizationStatus.SUSPENDED,
      ],
      SUSPENDED: [
        OrganizationStatus.ACTIVE,
      ],
      REJECTED: [],
    };

    if (
      !allowedTransitions[current].includes(next)
    ) {
      throw new BadRequestException(
        `Organization status cannot change from ${current} to ${next}.`,
      );
    }
  }
}
