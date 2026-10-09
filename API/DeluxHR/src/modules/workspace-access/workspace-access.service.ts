import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Feature, Permission, Prisma, UserRole } from '@prisma/client';
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
    const [permissions, enabled, flags, subscription, employee, organization] =
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
          select: { id: true, firstName: true, lastName: true, jobTitle: true, position: { select: { name: true } } },
        }),
        this.db.organization.findUnique({ where: { id: actor.organizationId }, select: { name: true, legalName: true } }),
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
      companyName: organization?.name?.trim() || organization?.legalName?.trim() || null,
      employeeProfile: employee ? { name: `${employee.firstName} ${employee.lastName}`, jobPosition: employee.position?.name || employee.jobTitle || null } : null,
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
  async approvals(actor: TenantJwtUser) {
    const [permissions, features] = await Promise.all([this.access.getEffectivePermissions(actor), this.entitlements.getEnabledFeatures(actor.organizationId)]);
    const has = (p: Permission) => permissions.some(g => g.permission === p && g.scope === 'ORGANIZATION');
    const org = { organizationId: actor.organizationId };
    const items: { label: string; href: string; count: number; canApprove: boolean }[] = [];
    if (features.includes(Feature.CORE_HR) && has(Permission.VIEW_EMPLOYEES)) {
      const [employees, changes] = await Promise.all([this.db.employee.count({ where: { ...org, status: 'PENDING_VERIFICATION' } }),this.db.employeeProfileChange.count({ where: { ...org, status: 'PENDING' } })]);
      items.push({ label: 'Employees & employee changes', href: '/employees', count: employees + changes, canApprove: has(Permission.APPROVE_EMPLOYEES) });
    }
    if (features.includes(Feature.LEAVE) && (has(Permission.VIEW_LEAVE) || has(Permission.APPROVE_LEAVE) || has(Permission.MANAGE_LEAVE))) items.push({ label: 'Leave requests', href: '/leave-requests', count: await this.db.leaveRequest.count({ where: { ...org, status: 'PENDING' } }), canApprove: has(Permission.APPROVE_LEAVE) });
    if (features.includes(Feature.PAYROLL) && has(Permission.VIEW_PAYROLL)) items.push({ label: 'Payroll runs', href: '/payroll-runs', count: await this.db.payrollRun.count({ where: { ...org, status: 'REVIEWED' } }), canApprove: has(Permission.APPROVE_PAYROLL) });
    if (features.includes(Feature.EARLY_PAY) && has(Permission.VIEW_EARLY_PAY)) items.push({ label: 'Early Pay requests', href: '/early-pay', count: await this.db.earlyPayRequest.count({ where: { ...org, status: 'PENDING' } }), canApprove: has(Permission.APPROVE_EARLY_PAY) });
    if (features.includes(Feature.TIMESHEETS) && has(Permission.VIEW_ATTENDANCE)) items.push({ label: 'Timesheets', href: '/timesheets', count: await this.db.timesheet.count({ where: { ...org, status: 'SUBMITTED' } }), canApprove: has(Permission.APPROVE_TIMESHEETS) });
    if (features.includes(Feature.CORE_HR) && has(Permission.VIEW_COMMUNICATIONS)) items.push({ label: 'Announcements', href: '/communications', count: await this.db.workforceAnnouncement.count({ where: { ...org, approvalStatus: 'PENDING' } }), canApprove: has(Permission.APPROVE_COMMUNICATIONS) });
    return items;
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
