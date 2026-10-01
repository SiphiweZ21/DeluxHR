import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Feature, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/access/access-control.service';
import { EntitlementsService } from '../../common/entitlements/entitlements.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
@Injectable()
export class WorkspaceAccessService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
    private readonly entitlements: EntitlementsService,
  ) {}
  async current(actor: TenantJwtUser) {
    const [permissions, enabled, flags, subscription, employee] =
      await Promise.all([
        this.access.getEffectivePermissions(actor),
        this.entitlements.getEnabledFeatures(actor.organizationId),
        this.entitlements.getOrganizationFeatures(actor.organizationId),
        this.db.platformSubscription.findUnique({
          where: { organizationId: actor.organizationId },
          include: { package: true },
        }),
        this.db.employee.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: actor.sub,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);
    const available =
      !!subscription &&
      subscription.status === 'ACTIVE' &&
      (!subscription.endsAt || subscription.endsAt > new Date());
    return {
      role: actor.role,
      organizationId: actor.organizationId,
      permissions,
      features: enabled,
      employeeLinked: !!employee,
      subscription: subscription
        ? {
            status: subscription.status,
            endsAt: subscription.endsAt,
            available,
            packageName: subscription.package.name,
            packageFeatures: subscription.package.features,
          }
        : null,
      services: Object.values(Feature).map((feature) => ({
        feature,
        configured: flags.some((f) => f.feature === feature),
        enabled: flags.some((f) => f.feature === feature && f.enabled),
        effectiveEnabled: enabled.includes(feature),
        included: available && subscription!.package.features.includes(feature),
      })),
    };
  }
  async setService(
    actor: TenantJwtUser,
    feature: Feature,
    enabled: boolean,
    reason: string,
  ) {
    if (actor.role !== UserRole.COMPANY_ADMIN)
      throw new ForbiddenException('Company administrator required.');
    if (!Object.values(Feature).includes(feature))
      throw new BadRequestException('Unknown service.');
    if (reason.trim().length < 3)
      throw new BadRequestException(
        'Provide a reason of at least three characters.',
      );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      const organization = await tx.organization.findUnique({
        where: { id: actor.organizationId },
        select: { status: true },
      });
      if (organization?.status !== 'ACTIVE')
        throw new ForbiddenException(
          'Service configuration requires an active company.',
        );
      const subscription = await tx.platformSubscription.findUnique({
        where: { organizationId: actor.organizationId },
        include: { package: true },
      });
      if (feature === Feature.CORE_HR && !enabled)
        throw new BadRequestException(
          'Core HR is required for active companies.',
        );
      if (feature !== Feature.CORE_HR || subscription) {
        if (
          !subscription ||
          subscription.status !== 'ACTIVE' ||
          (subscription.endsAt && subscription.endsAt <= new Date())
        )
          throw new ForbiddenException(
            'An active unexpired subscription is required. Ask your platform administrator to assign or renew a package.',
          );
        if (enabled && !subscription.package.features.includes(feature))
          throw new ForbiddenException(
            'This service is not included in your package. Ask your platform administrator to change your package.',
          );
      }
      if (
        enabled &&
        [Feature.PAYSLIPS, Feature.EARLY_PAY].includes(feature as any)
      ) {
        const payroll = await tx.organizationFeature.findUnique({
          where: {
            organizationId_feature: {
              organizationId: actor.organizationId,
              feature: Feature.PAYROLL,
            },
          },
        });
        if (!payroll?.enabled)
          throw new BadRequestException('Enable Payroll first.');
      }
      if (
        feature === Feature.PAYROLL &&
        !enabled &&
        (await tx.organizationFeature.count({
          where: {
            organizationId: actor.organizationId,
            feature: { in: [Feature.PAYSLIPS, Feature.EARLY_PAY] },
            enabled: true,
          },
        }))
      )
        throw new BadRequestException(
          'Disable Payslips and Early Pay before disabling Payroll.',
        );
      const before = await tx.organizationFeature.findUnique({
        where: {
          organizationId_feature: {
            organizationId: actor.organizationId,
            feature,
          },
        },
      });
      const now = new Date();
      await tx.organizationFeature.upsert({
        where: {
          organizationId_feature: {
            organizationId: actor.organizationId,
            feature,
          },
        },
        create: {
          organizationId: actor.organizationId,
          feature,
          enabled,
          enabledAt: now,
          disabledAt: enabled ? null : now,
        },
        update: {
          enabled,
          enabledAt: enabled ? now : before?.enabledAt,
          disabledAt: enabled ? null : now,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          action: 'COMPANY_SERVICE_CONFIGURED',
          entity: 'OrganizationFeature',
          entityId: feature,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason: reason.trim(),
          metadata: {
            feature,
            enabled,
            previousEnabled: before?.enabled ?? false,
          } as Prisma.InputJsonObject,
        },
      });
    });
    return this.current(actor);
  }
}
