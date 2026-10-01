import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { CreateWorkLocationDto } from './dto/create-work-location.dto';
import { UpdateWorkLocationDto } from './dto/update-work-location.dto';

@Injectable()
export class WorkLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateWorkLocationDto,
    actor: TenantJwtUser,
  ) {
    const code = this.normalizeCode(dto.code);
    const name = this.requireText(dto.name, 'Location name');

    this.validateCoordinates(
      dto.latitude,
      dto.longitude,
      dto.geofenceRadiusMeters,
    );

    try {
      const location = await this.prisma.workLocation.create({
        data: {
          organizationId,
          code,
          name,
          type: dto.type,
          addressLine1: this.optionalText(dto.addressLine1),
          addressLine2: this.optionalText(dto.addressLine2),
          city: this.optionalText(dto.city),
          province: this.optionalText(dto.province),
          postalCode: this.optionalText(dto.postalCode),
          country: this.optionalText(dto.country) ?? 'South Africa',
          timezone:
            this.optionalText(dto.timezone) ?? 'Africa/Johannesburg',
          latitude: dto.latitude,
          longitude: dto.longitude,
          geofenceRadiusMeters: dto.geofenceRadiusMeters,
          attendanceEnabled: dto.attendanceEnabled ?? true,
          kioskEnabled: dto.kioskEnabled ?? false,
          qrEnabled: dto.qrEnabled ?? false,
          whatsappLocationEnabled:
            dto.whatsappLocationEnabled ?? false,
          offlineKioskEnabled: dto.offlineKioskEnabled ?? false,
        },
      });

      await this.auditService.log({
        organizationId,
        action: 'WORK_LOCATION_CREATED',
        entity: 'WorkLocation',
        entityId: location.id,
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        metadata: {
          code: location.code,
          name: location.name,
          type: location.type,
        },
      });

      return location;
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async list(organizationId: string) {
    return this.prisma.workLocation.findMany({
      where: { organizationId },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  async findOne(
    organizationId: string,
    locationId: string,
  ) {
    return this.requireLocation(
      organizationId,
      locationId,
    );
  }

  async update(
    organizationId: string,
    locationId: string,
    dto: UpdateWorkLocationDto,
    actor: TenantJwtUser,
  ) {
    const existing = await this.requireLocation(
      organizationId,
      locationId,
    );

    this.validateCoordinates(
      dto.latitude,
      dto.longitude,
      dto.geofenceRadiusMeters,
      existing.latitude,
      existing.longitude,
      existing.geofenceRadiusMeters,
    );

    const data: Prisma.WorkLocationUpdateInput = {};

    if (dto.code !== undefined) {
      data.code = this.normalizeCode(dto.code);
    }

    if (dto.name !== undefined) {
      data.name = this.requireText(dto.name, 'Location name');
    }

    if (dto.type !== undefined) {
      data.type = dto.type;
    }

    if (dto.addressLine1 !== undefined) {
      data.addressLine1 = this.optionalText(dto.addressLine1);
    }

    if (dto.addressLine2 !== undefined) {
      data.addressLine2 = this.optionalText(dto.addressLine2);
    }

    if (dto.city !== undefined) {
      data.city = this.optionalText(dto.city);
    }

    if (dto.province !== undefined) {
      data.province = this.optionalText(dto.province);
    }

    if (dto.postalCode !== undefined) {
      data.postalCode = this.optionalText(dto.postalCode);
    }

    if (dto.country !== undefined) {
      data.country =
        this.optionalText(dto.country) ?? 'South Africa';
    }

    if (dto.timezone !== undefined) {
      data.timezone =
        this.optionalText(dto.timezone) ?? 'Africa/Johannesburg';
    }

    if (dto.latitude !== undefined) {
      data.latitude = dto.latitude;
    }

    if (dto.longitude !== undefined) {
      data.longitude = dto.longitude;
    }

    if (dto.geofenceRadiusMeters !== undefined) {
      data.geofenceRadiusMeters = dto.geofenceRadiusMeters;
    }

    if (dto.attendanceEnabled !== undefined) {
      data.attendanceEnabled = dto.attendanceEnabled;
    }

    if (dto.kioskEnabled !== undefined) {
      data.kioskEnabled = dto.kioskEnabled;
    }

    if (dto.qrEnabled !== undefined) {
      data.qrEnabled = dto.qrEnabled;
    }

    if (dto.whatsappLocationEnabled !== undefined) {
      data.whatsappLocationEnabled =
        dto.whatsappLocationEnabled;
    }

    if (dto.offlineKioskEnabled !== undefined) {
      data.offlineKioskEnabled = dto.offlineKioskEnabled;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    try {
      const updated = await this.prisma.workLocation.update({
        where: { id: existing.id },
        data,
      });

      await this.auditService.log({
        organizationId,
        action: 'WORK_LOCATION_UPDATED',
        entity: 'WorkLocation',
        entityId: updated.id,
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        metadata: {
          code: updated.code,
          name: updated.name,
          type: updated.type,
        },
      });

      return updated;
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async setActive(
    organizationId: string,
    locationId: string,
    isActive: boolean,
    actor: TenantJwtUser,
  ) {
    const existing = await this.requireLocation(
      organizationId,
      locationId,
    );

    if (existing.isActive === isActive) {
      return existing;
    }

    const updated = await this.prisma.workLocation.update({
      where: { id: existing.id },
      data: { isActive },
    });

    await this.auditService.log({
      organizationId,
      action: isActive
        ? 'WORK_LOCATION_ACTIVATED'
        : 'WORK_LOCATION_DEACTIVATED',
      entity: 'WorkLocation',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        code: updated.code,
        name: updated.name,
        type: updated.type,
      },
    });

    return updated;
  }

  private async requireLocation(
    organizationId: string,
    locationId: string,
  ) {
    const location = await this.prisma.workLocation.findFirst({
      where: {
        id: locationId,
        organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Work location not found');
    }

    return location;
  }

  private normalizeCode(value: string): string {
    const code = value.trim().toUpperCase();

    if (!code) {
      throw new BadRequestException(
        'Location code is required',
      );
    }

    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
      throw new BadRequestException(
        'Location code may only contain letters, numbers, hyphens and underscores',
      );
    }

    return code;
  }

  private requireText(
    value: string,
    label: string,
  ): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(
        `${label} is required`,
      );
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

  private validateCoordinates(
    latitude?: number,
    longitude?: number,
    radius?: number,
    currentLatitude?: number | null,
    currentLongitude?: number | null,
    currentRadius?: number | null,
  ) {
    const effectiveLatitude =
      latitude ?? currentLatitude ?? undefined;
    const effectiveLongitude =
      longitude ?? currentLongitude ?? undefined;
    const effectiveRadius =
      radius ?? currentRadius ?? undefined;

    const hasLatitude = effectiveLatitude !== undefined;
    const hasLongitude = effectiveLongitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Latitude and longitude must be configured together',
      );
    }

    if (
      effectiveRadius !== undefined &&
      (!hasLatitude || !hasLongitude)
    ) {
      throw new BadRequestException(
        'Geofence radius requires latitude and longitude',
      );
    }
  }

  private rethrowKnownDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A work location with this code already exists',
      );
    }

    throw error;
  }
}
