import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataScope,
  Permission,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../../common/auth/password';
import { ROLE_PERMISSION_PRESETS } from '../../common/access/permission-presets';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserRoleDto } from './dto/update-company-user-role.dto';
import { UpdateCompanyUserStatusDto } from './dto/update-company-user-status.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
const CUSTOMER_ROLES: UserRole[] = [
  UserRole.COMPANY_ADMIN,
  UserRole.EXECUTIVE,
  UserRole.HR_ADMIN,
  UserRole.PAYROLL_ADMIN,
  UserRole.MANAGER,
  UserRole.EMPLOYEE,
];
@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}
  async create(
    organizationId: string,
    dto: CreateCompanyUserDto,
    actor: TenantJwtUser,
  ) {
    this.assertAccessAdministrator(actor);
    this.assertCustomerRole(dto.role);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException(
        'Email already in use',
      );
    }
    const passwordHash = await hashPassword(
      dto.password,
    );
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        fullName: dto.fullName.trim(), email, passwordHash,
        role: dto.role, organizationId, isActive: true,
      } });
      for (const grant of ROLE_PERMISSION_PRESETS[dto.role] ?? []) {
        await tx.userPermission.create({ data: { organizationId, userId: created.id, ...grant } });
      }
      return created;
    });
    await this.auditService.log({
      organizationId,
      action: 'COMPANY_USER_CREATED',
      entity: 'User',
      entityId: user.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        createdUserEmail: user.email,
        createdUserRole: user.role,
      },
    });
    return this.mapUser(user);
  }
  async list(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
      },
      include: {
        permissions: {
          orderBy: {
            permission: 'asc',
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    return users.map((user) => ({
      ...this.mapUser(user),
      permissions: user.permissions,
    }));
  }
  async findOne(
    organizationId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
      include: {
        permissions: {
          orderBy: {
            permission: 'asc',
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(
        'Company user not found',
      );
    }
    return {
      ...this.mapUser(user),
      permissions: user.permissions,
    };
  }
  async updateRole(
    organizationId: string,
    userId: string,
    dto: UpdateCompanyUserRoleDto,
    actor: TenantJwtUser,
  ) {
    if (actor.sub === userId) {
      throw new ForbiddenException(
        'You cannot change your own role.',
      );
    }
    this.assertAccessAdministrator(actor);
    this.assertCustomerRole(dto.role);
    const user = await this.getCompanyUser(
      organizationId,
      userId,
    );
    if (user.role === dto.role) {
      return this.mapUser(user);
    }
    if (
      user.role === UserRole.COMPANY_ADMIN &&
      dto.role !== UserRole.COMPANY_ADMIN
    ) {
      await this.assertAnotherActiveCompanyAdmin(
        organizationId,
        user.id,
      );
    }
    const previousRole = user.role;
    const updated = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        role: dto.role,
      },
    });
    await this.auditService.log({
      organizationId,
      action: 'COMPANY_USER_ROLE_CHANGED',
      entity: 'User',
      entityId: user.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        previousRole,
        newRole: updated.role,
      },
    });
    return this.mapUser(updated);
  }
  async updateStatus(
    organizationId: string,
    userId: string,
    dto: UpdateCompanyUserStatusDto,
    actor: TenantJwtUser,
  ) {
    if (actor.sub === userId) {
      throw new ForbiddenException(
        'You cannot change your own account status.',
      );
    }
    const user = await this.getCompanyUser(
      organizationId,
      userId,
    );
    if (
      user.role === UserRole.COMPANY_ADMIN &&
      user.isActive &&
      !dto.isActive
    ) {
      await this.assertAnotherActiveCompanyAdmin(
        organizationId,
        user.id,
      );
    }
    if (user.isActive === dto.isActive) {
      return this.mapUser(user);
    }
    const updated = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        isActive: dto.isActive,
      },
    });
    await this.auditService.log({
      organizationId,
      action: dto.isActive
        ? 'COMPANY_USER_ACTIVATED'
        : 'COMPANY_USER_DEACTIVATED',
      entity: 'User',
      entityId: user.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        email: user.email,
        role: user.role,
      },
    });
    return this.mapUser(updated);
  }
  async setPermissions(
    organizationId: string,
    userId: string,
    dto: SetUserPermissionsDto,
    actor: TenantJwtUser,
  ) {
    if (actor.sub === userId) {
      throw new ForbiddenException(
        'You cannot change your own permissions.',
      );
    }
    this.assertAccessAdministrator(actor);
    const user = await this.getCompanyUser(
      organizationId,
      userId,
    );
    const duplicatePermissions = dto.permissions
      .map((item) => item.permission)
      .filter(
        (permission, index, all) =>
          all.indexOf(permission) !== index,
      );
    if (duplicatePermissions.length > 0) {
      throw new BadRequestException(
        'Each permission may only be configured once per user.',
      );
    }
    this.validatePermissionConfiguration(
      user.role,
      dto.permissions,
    );
    const previousPermissions =
      await this.prisma.userPermission.findMany({
        where: {
          userId: user.id,
          organizationId,
        },
        select: {
          permission: true,
          scope: true,
        },
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({
        where: {
          userId: user.id,
          organizationId,
        },
      });
      if (dto.permissions.length > 0) {
        await tx.userPermission.createMany({
          data: dto.permissions.map((item) => ({
            userId: user.id,
            organizationId,
            permission: item.permission,
            scope: item.scope,
          })),
        });
      }
    });
    await this.auditService.log({
      organizationId,
      action: 'COMPANY_USER_PERMISSIONS_CHANGED',
      entity: 'User',
      entityId: user.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        previousPermissions:
          previousPermissions.map((item) => ({
            permission: item.permission,
            scope: item.scope,
          })),
        newPermissions: dto.permissions.map(
          (item) => ({
            permission: item.permission,
            scope: item.scope,
          }),
        ),
      },
    });
    return this.findOne(
      organizationId,
      user.id,
    );
  }
  private async getCompanyUser(
    organizationId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
    });
    if (!user) {
      throw new NotFoundException(
        'Company user not found',
      );
    }
    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.PLATFORM_ADMIN
    ) {
      throw new ForbiddenException(
        'Platform accounts cannot be managed through company access.',
      );
    }
    return user;
  }
  private assertAccessAdministrator(
    actor: TenantJwtUser,
  ) {
    if (actor.role !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException(
        'Only a Company Admin can manage company access.',
      );
    }
  }
  private assertCustomerRole(role: UserRole) {
    if (!CUSTOMER_ROLES.includes(role)) {
      throw new ForbiddenException(
        'This role cannot be assigned by a company.',
      );
    }
  }
  private async assertAnotherActiveCompanyAdmin(
    organizationId: string,
    excludedUserId: string,
  ) {
    const count = await this.prisma.user.count({
      where: {
        organizationId,
        role: UserRole.COMPANY_ADMIN,
        isActive: true,
        id: {
          not: excludedUserId,
        },
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'At least one active Company Admin must remain.',
      );
    }
  }
  private validatePermissionConfiguration(
    role: UserRole,
    permissions: {
      permission: Permission;
      scope: DataScope;
    }[],
  ) {
    const accessManagementPermissions: Permission[] = [
      Permission.MANAGE_COMPANY,
      Permission.MANAGE_USERS,
      Permission.MANAGE_ACCESS,
    ];
    const managerForbiddenPermissions: Permission[] = [
      ...accessManagementPermissions,
      Permission.ADD_EMPLOYEES,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      Permission.CONFIRM_PAYROLL_PAYMENTS,
    ];
    const employeeForbiddenPermissions: Permission[] = [
      ...accessManagementPermissions,
      Permission.ADD_EMPLOYEES,
      Permission.MANAGE_EMPLOYEES,
      Permission.MANAGE_PAYROLL,
      Permission.GENERATE_PAYROLL,
      Permission.REVIEW_PAYROLL,
      Permission.APPROVE_PAYROLL,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      Permission.CONFIRM_PAYROLL_PAYMENTS,
      Permission.MANAGE_EARLY_PAY_POLICY,
      Permission.APPROVE_EARLY_PAY,
      Permission.VIEW_AUDIT_LOGS,
    ];
    if (
      role === UserRole.MANAGER &&
      permissions.some((item) =>
        managerForbiddenPermissions.includes(
          item.permission,
        ),
      )
    ) {
      throw new ForbiddenException(
        'Managers cannot be granted company administration or employee creation permissions.',
      );
    }
    if (
      role === UserRole.EMPLOYEE &&
      permissions.some((item) =>
        employeeForbiddenPermissions.includes(
          item.permission,
        ),
      )
    ) {
      throw new ForbiddenException(
        'Employees cannot be granted administrative, payroll, approval, or audit access.',
      );
    }
  }
  private mapUser(user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    organizationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
