import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../../common/auth/password';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { UpdateAttendanceIdentityStatusDto } from './dto/update-attendance-identity-status.dto';

@Injectable()
export class AttendanceIdentitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async provision(
    organizationId: string,
    employeeId: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.requireEmployee(
      organizationId,
      employeeId,
    );

    const existing =
      await this.prisma.employeeAttendanceIdentity.findUnique({
        where: { employeeId },
      });

    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new NotFoundException(
          'Attendance identity not found',
        );
      }

      return this.mapIdentity(existing);
    }

    const identity =
      await this.prisma.employeeAttendanceIdentity.create({
        data: {
          organizationId,
          employeeId,
          qrToken: this.generateQrToken(),
          qrEnabled: true,
          pinEnabled: false,
          isActive: true,
          createdByUserId: actor.sub,
          updatedByUserId: actor.sub,
        },
      });

    await this.log(
      organizationId,
      'ATTENDANCE_IDENTITY_PROVISIONED',
      identity.id,
      employee.id,
      employee.employeeNumber,
      actor,
    );

    return this.mapIdentity(identity);
  }

  async findForEmployee(
    organizationId: string,
    employeeId: string,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const identity =
      await this.prisma.employeeAttendanceIdentity.findFirst({
        where: {
          organizationId,
          employeeId,
        },
      });

    if (!identity) {
      throw new NotFoundException(
        'Attendance identity not found',
      );
    }

    return this.mapIdentity(identity);
  }

  async rotateQr(
    organizationId: string,
    employeeId: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.requireEmployee(
      organizationId,
      employeeId,
    );
    const identity = await this.requireIdentity(
      organizationId,
      employeeId,
    );

    const updated =
      await this.prisma.employeeAttendanceIdentity.update({
        where: { id: identity.id },
        data: {
          qrToken: this.generateQrToken(),
          qrEnabled: true,
          updatedByUserId: actor.sub,
        },
      });

    await this.log(
      organizationId,
      'ATTENDANCE_QR_ROTATED',
      updated.id,
      employee.id,
      employee.employeeNumber,
      actor,
    );

    return this.mapIdentity(updated);
  }

  async setPin(
    organizationId: string,
    employeeId: string,
    pin: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.requireEmployee(
      organizationId,
      employeeId,
    );
    const identity = await this.requireIdentity(
      organizationId,
      employeeId,
    );

    if (!/^\d{4,8}$/.test(pin)) {
      throw new BadRequestException(
        'Attendance PIN must contain 4 to 8 digits',
      );
    }

    const pinHash = await hashPassword(pin);

    const updated =
      await this.prisma.employeeAttendanceIdentity.update({
        where: { id: identity.id },
        data: {
          pinHash,
          pinEnabled: true,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          pinChangedAt: new Date(),
          updatedByUserId: actor.sub,
        },
      });

    await this.log(
      organizationId,
      'ATTENDANCE_PIN_SET',
      updated.id,
      employee.id,
      employee.employeeNumber,
      actor,
    );

    return this.mapIdentity(updated);
  }

  async clearPin(
    organizationId: string,
    employeeId: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.requireEmployee(
      organizationId,
      employeeId,
    );
    const identity = await this.requireIdentity(
      organizationId,
      employeeId,
    );

    const updated =
      await this.prisma.employeeAttendanceIdentity.update({
        where: { id: identity.id },
        data: {
          pinHash: null,
          pinEnabled: false,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          pinChangedAt: new Date(),
          updatedByUserId: actor.sub,
        },
      });

    await this.log(
      organizationId,
      'ATTENDANCE_PIN_CLEARED',
      updated.id,
      employee.id,
      employee.employeeNumber,
      actor,
    );

    return this.mapIdentity(updated);
  }

  async updateStatus(
    organizationId: string,
    employeeId: string,
    dto: UpdateAttendanceIdentityStatusDto,
    actor: TenantJwtUser,
  ) {
    const employee = await this.requireEmployee(
      organizationId,
      employeeId,
    );
    const identity = await this.requireIdentity(
      organizationId,
      employeeId,
    );

    if (
      dto.pinEnabled === true &&
      !identity.pinHash
    ) {
      throw new BadRequestException(
        'Set an attendance PIN before enabling PIN identity',
      );
    }

    const updated =
      await this.prisma.employeeAttendanceIdentity.update({
        where: { id: identity.id },
        data: {
          qrEnabled: dto.qrEnabled,
          pinEnabled: dto.pinEnabled,
          isActive: dto.isActive,
          updatedByUserId: actor.sub,
        },
      });

    await this.log(
      organizationId,
      'ATTENDANCE_IDENTITY_STATUS_UPDATED',
      updated.id,
      employee.id,
      employee.employeeNumber,
      actor,
    );

    return this.mapIdentity(updated);
  }

  private async requireEmployee(
    organizationId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: {
        id: true,
        employeeNumber: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async requireIdentity(
    organizationId: string,
    employeeId: string,
  ) {
    const identity =
      await this.prisma.employeeAttendanceIdentity.findFirst({
        where: {
          organizationId,
          employeeId,
        },
      });

    if (!identity) {
      throw new NotFoundException(
        'Attendance identity not found. Provision it first.',
      );
    }

    return identity;
  }

  private generateQrToken(): string {
    return `dhr_att_${randomBytes(24).toString('base64url')}`;
  }

  private mapIdentity(identity: {
    id: string;
    organizationId: string;
    employeeId: string;
    qrToken: string;
    pinHash: string | null;
    qrEnabled: boolean;
    pinEnabled: boolean;
    isActive: boolean;
    pinFailedAttempts: number;
    pinLockedUntil: Date | null;
    pinChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: identity.id,
      employeeId: identity.employeeId,
      qrToken: identity.qrToken,
      qrEnabled: identity.qrEnabled,
      pinConfigured: Boolean(identity.pinHash),
      pinEnabled: identity.pinEnabled,
      isActive: identity.isActive,
      pinLocked: Boolean(
        identity.pinLockedUntil &&
          identity.pinLockedUntil > new Date(),
      ),
      pinChangedAt: identity.pinChangedAt,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    };
  }

  private async log(
    organizationId: string,
    action: string,
    entityId: string,
    employeeId: string,
    employeeNumber: string,
    actor: TenantJwtUser,
  ) {
    await this.auditService.log({
      organizationId,
      action,
      entity: 'EmployeeAttendanceIdentity',
      entityId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        employeeNumber,
      },
    });
  }
}
