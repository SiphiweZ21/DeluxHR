import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { CreateAttendancePolicyDto } from './dto/create-attendance-policy.dto';
import { UpdateAttendancePolicyDto } from './dto/update-attendance-policy.dto';

@Injectable()
export class AttendancePoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateAttendancePolicyDto,
    actor: TenantJwtUser,
  ) {
    const name = this.requireText(dto.name, 'Policy name');
    await this.validateWorkLocation(
      organizationId,
      dto.workLocationId,
    );

    this.validatePolicyRules({
      attendanceRequired: dto.attendanceRequired ?? true,
      checkInRequired: dto.checkInRequired ?? true,
      checkOutRequired: dto.checkOutRequired ?? true,
      allowedChannels: dto.allowedChannels,
      locationVerificationRequired:
        dto.locationVerificationRequired ?? false,
      offlineKioskAllowed: dto.offlineKioskAllowed ?? false,
      supervisorFallbackAllowed:
        dto.supervisorFallbackAllowed ?? true,
    });

    try {
      const policy = await this.prisma.$transaction(
        async (tx) => {
          if (dto.isDefault) {
            await tx.attendancePolicy.updateMany({
              where: {
                organizationId,
                workLocationId: dto.workLocationId ?? null,
                isDefault: true,
              },
              data: { isDefault: false },
            });
          }

          return tx.attendancePolicy.create({
            data: {
              organizationId,
              workLocationId: dto.workLocationId,
              name,
              description: this.optionalText(dto.description),
              attendanceRequired: dto.attendanceRequired ?? true,
              checkInRequired: dto.checkInRequired ?? true,
              checkOutRequired: dto.checkOutRequired ?? true,
              allowedChannels: dto.allowedChannels,
              locationVerificationRequired:
                dto.locationVerificationRequired ?? false,
              offlineKioskAllowed:
                dto.offlineKioskAllowed ?? false,
              supervisorFallbackAllowed:
                dto.supervisorFallbackAllowed ?? true,
              isDefault: dto.isDefault ?? false,
              createdByUserId: actor.sub,
              updatedByUserId: actor.sub,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      await this.log(
        organizationId,
        'ATTENDANCE_POLICY_CREATED',
        policy.id,
        actor,
        policy,
      );

      return policy;
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async list(organizationId: string) {
    return this.prisma.attendancePolicy.findMany({
      where: { organizationId },
      include: {
        workLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  async findOne(
    organizationId: string,
    policyId: string,
  ) {
    const policy = await this.prisma.attendancePolicy.findFirst({
      where: {
        id: policyId,
        organizationId,
      },
      include: {
        workLocation: true,
      },
    });

    if (!policy) {
      throw new NotFoundException('Attendance policy not found');
    }

    return policy;
  }

  async update(
    organizationId: string,
    policyId: string,
    dto: UpdateAttendancePolicyDto,
    actor: TenantJwtUser,
  ) {
    const existing = await this.findOne(
      organizationId,
      policyId,
    );

    const nextWorkLocationId =
      dto.workLocationId !== undefined
        ? dto.workLocationId
        : existing.workLocationId ?? undefined;

    await this.validateWorkLocation(
      organizationId,
      nextWorkLocationId,
    );

    const nextRules = {
      attendanceRequired:
        dto.attendanceRequired ?? existing.attendanceRequired,
      checkInRequired:
        dto.checkInRequired ?? existing.checkInRequired,
      checkOutRequired:
        dto.checkOutRequired ?? existing.checkOutRequired,
      allowedChannels:
        dto.allowedChannels ?? existing.allowedChannels,
      locationVerificationRequired:
        dto.locationVerificationRequired ??
        existing.locationVerificationRequired,
      offlineKioskAllowed:
        dto.offlineKioskAllowed ??
        existing.offlineKioskAllowed,
      supervisorFallbackAllowed:
        dto.supervisorFallbackAllowed ??
        existing.supervisorFallbackAllowed,
    };

    this.validatePolicyRules(nextRules);

    const data: Prisma.AttendancePolicyUpdateInput = {
      updatedByUserId: actor.sub,
    };

    if (dto.name !== undefined) {
      data.name = this.requireText(dto.name, 'Policy name');
    }

    if (dto.description !== undefined) {
      data.description = this.optionalText(dto.description);
    }

    if (dto.workLocationId !== undefined) {
      data.workLocation = {
        connect: { id: dto.workLocationId },
      };
    }

    if (dto.attendanceRequired !== undefined) {
      data.attendanceRequired = dto.attendanceRequired;
    }

    if (dto.checkInRequired !== undefined) {
      data.checkInRequired = dto.checkInRequired;
    }

    if (dto.checkOutRequired !== undefined) {
      data.checkOutRequired = dto.checkOutRequired;
    }

    if (dto.allowedChannels !== undefined) {
      data.allowedChannels = dto.allowedChannels;
    }

    if (dto.locationVerificationRequired !== undefined) {
      data.locationVerificationRequired =
        dto.locationVerificationRequired;
    }

    if (dto.offlineKioskAllowed !== undefined) {
      data.offlineKioskAllowed = dto.offlineKioskAllowed;
    }

    if (dto.supervisorFallbackAllowed !== undefined) {
      data.supervisorFallbackAllowed =
        dto.supervisorFallbackAllowed;
    }

    if (dto.isDefault !== undefined) {
      data.isDefault = dto.isDefault;
    }

    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          if (dto.isDefault) {
            await tx.attendancePolicy.updateMany({
              where: {
                organizationId,
                workLocationId: nextWorkLocationId ?? null,
                isDefault: true,
                NOT: { id: policyId },
              },
              data: { isDefault: false },
            });
          }

          return tx.attendancePolicy.update({
            where: { id: existing.id },
            data,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      await this.log(
        organizationId,
        'ATTENDANCE_POLICY_UPDATED',
        updated.id,
        actor,
        updated,
      );

      return updated;
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async setActive(
    organizationId: string,
    policyId: string,
    isActive: boolean,
    actor: TenantJwtUser,
  ) {
    const existing = await this.findOne(
      organizationId,
      policyId,
    );

    if (existing.isActive === isActive) {
      return existing;
    }

    const updated = await this.prisma.attendancePolicy.update({
      where: { id: existing.id },
      data: {
        isActive,
        updatedByUserId: actor.sub,
      },
    });

    await this.log(
      organizationId,
      isActive
        ? 'ATTENDANCE_POLICY_ACTIVATED'
        : 'ATTENDANCE_POLICY_DEACTIVATED',
      updated.id,
      actor,
      updated,
    );

    return updated;
  }

  private async validateWorkLocation(
    organizationId: string,
    workLocationId?: string,
  ) {
    if (!workLocationId) {
      return;
    }

    const location = await this.prisma.workLocation.findFirst({
      where: {
        id: workLocationId,
        organizationId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Work location not found');
    }

    if (!location.isActive) {
      throw new BadRequestException(
        'Attendance policy cannot be assigned to an inactive work location',
      );
    }
  }

  private validatePolicyRules(input: {
    attendanceRequired: boolean;
    checkInRequired: boolean;
    checkOutRequired: boolean;
    allowedChannels: AttendanceChannel[];
    locationVerificationRequired: boolean;
    offlineKioskAllowed: boolean;
    supervisorFallbackAllowed: boolean;
  }) {
    const channels = new Set(input.allowedChannels);

    if (
      (input.checkInRequired || input.checkOutRequired) &&
      channels.size === 0
    ) {
      throw new BadRequestException(
        'At least one attendance channel is required when check-in or check-out is required',
      );
    }

    if (
      !input.attendanceRequired &&
      (input.checkInRequired || input.checkOutRequired)
    ) {
      throw new BadRequestException(
        'Check-in/check-out cannot be required when attendance is not required',
      );
    }

    if (
      input.locationVerificationRequired &&
      !channels.has(AttendanceChannel.WHATSAPP)
    ) {
      throw new BadRequestException(
        'Location verification currently requires the WHATSAPP attendance channel',
      );
    }

    if (
      input.offlineKioskAllowed &&
      !channels.has(AttendanceChannel.KIOSK)
    ) {
      throw new BadRequestException(
        'Offline kiosk requires the KIOSK attendance channel',
      );
    }

    if (
      input.supervisorFallbackAllowed &&
      !channels.has(AttendanceChannel.SUPERVISOR)
    ) {
      throw new BadRequestException(
        'Supervisor fallback requires the SUPERVISOR attendance channel',
      );
    }
  }

  private requireText(
    value: string,
    label: string,
  ): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private optionalText(
    value?: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private async log(
    organizationId: string,
    action: string,
    entityId: string,
    actor: TenantJwtUser,
    policy: {
      name: string;
      workLocationId: string | null;
      isDefault: boolean;
      isActive: boolean;
      allowedChannels: AttendanceChannel[];
    },
  ) {
    await this.auditService.log({
      organizationId,
      action,
      entity: 'AttendancePolicy',
      entityId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        name: policy.name,
        workLocationId: policy.workLocationId,
        isDefault: policy.isDefault,
        isActive: policy.isActive,
        allowedChannels: policy.allowedChannels,
      },
    });
  }

  private rethrowDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An attendance policy with this name already exists for this scope',
      );
    }

    throw error;
  }
}
