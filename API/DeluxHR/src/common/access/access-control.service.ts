import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataScope, Permission, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { TenantJwtUser } from '../auth/jwt-user.type';
import { ROLE_PERMISSION_PRESETS } from './permission-presets';

export type EffectivePermission = {
  permission: Permission;
  scope: DataScope;
};

const ORGANIZATION_ONLY_PERMISSIONS = new Set<Permission>([
  Permission.VIEW_EMPLOYEE_DOCUMENTS,
  Permission.MANAGE_EMPLOYEE_DOCUMENTS,
  Permission.VERIFY_EMPLOYEE_DOCUMENTS,

  Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
  Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,
  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.VIEW_RISK_EVENTS,
  Permission.MANAGE_RISK_EVENTS,
]);

const MANAGER_EMPLOYEE_HARD_DENIED_PERMISSIONS = new Set<Permission>([
  Permission.ADD_EMPLOYEES,
  Permission.MANAGE_EMPLOYEES,
  Permission.APPROVE_EMPLOYEES,

  Permission.VIEW_EMPLOYEE_DOCUMENTS,
  Permission.MANAGE_EMPLOYEE_DOCUMENTS,
  Permission.VERIFY_EMPLOYEE_DOCUMENTS,

  Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
  Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,
  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.VIEW_RISK_EVENTS,
  Permission.MANAGE_RISK_EVENTS,
]);

// Attendance write endpoints currently use permission guards but do not yet
// have a formal manager -> team membership model for safe TEAM mutation.
// Keep attendance writes out of MANAGER/EMPLOYEE until that relationship exists.
const ATTENDANCE_WRITE_PERMISSIONS = new Set<Permission>([
  Permission.MANAGE_ATTENDANCE,
]);


@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(
    user: TenantJwtUser,
  ): Promise<EffectivePermission[]> {
    const preset = ROLE_PERMISSION_PRESETS[user.role] ?? [];

    const explicit = await this.prisma.userPermission.findMany({
      where: {
        userId: user.sub,
        organizationId: user.organizationId,
      },
      select: {
        permission: true,
        scope: true,
      },
    });

    const effective = new Map<Permission, DataScope>();

    for (const grant of preset) {
      if (this.isGrantAllowed(user.role, grant.permission, grant.scope)) {
        effective.set(grant.permission, grant.scope);
      }
    }

    for (const grant of explicit) {
      if (this.isGrantAllowed(user.role, grant.permission, grant.scope)) {
        effective.set(grant.permission, grant.scope);
      }
    }

    return Array.from(effective.entries()).map(([permission, scope]) => ({
      permission,
      scope,
    }));
  }

  async hasPermission(
    user: TenantJwtUser,
    permission: Permission,
  ): Promise<boolean> {
    if (this.isHardDenied(user.role, permission)) {
      return false;
    }

    const permissions = await this.getEffectivePermissions(user);

    return permissions.some((grant) => grant.permission === permission);
  }

  async requirePermission(
    user: TenantJwtUser,
    permission: Permission,
  ): Promise<void> {
    const allowed = await this.hasPermission(user, permission);

    if (!allowed) {
      throw new ForbiddenException(`Permission ${permission} is required.`);
    }
  }

  private isGrantAllowed(
    role: UserRole,
    permission: Permission,
    scope: DataScope,
  ): boolean {
    if (this.isHardDenied(role, permission)) {
      return false;
    }

    if (
      ORGANIZATION_ONLY_PERMISSIONS.has(permission) &&
      scope !== DataScope.ORGANIZATION
    ) {
      return false;
    }

    if (
      role === UserRole.EMPLOYEE &&
      permission === Permission.VIEW_ATTENDANCE &&
      scope !== DataScope.SELF
    ) {
      return false;
    }

    if (
      role === UserRole.MANAGER &&
      permission === Permission.VIEW_ATTENDANCE &&
      scope !== DataScope.TEAM
    ) {
      return false;
    }

    return true;
  }

  private isHardDenied(role: UserRole, permission: Permission): boolean {
    if (role === UserRole.MANAGER || role === UserRole.EMPLOYEE) {
      if (MANAGER_EMPLOYEE_HARD_DENIED_PERMISSIONS.has(permission)) {
        return true;
      }
    }

    if (
      (role === UserRole.MANAGER || role === UserRole.EMPLOYEE) &&
      ATTENDANCE_WRITE_PERMISSIONS.has(permission)
    ) {
      return true;
    }

    if (
      role === UserRole.EMPLOYEE &&
      (permission === Permission.MANAGE_ACCESS ||
        permission === Permission.MANAGE_USERS ||
        permission === Permission.MANAGE_COMPANY)
    ) {
      return true;
    }

    return false;
  }
}
