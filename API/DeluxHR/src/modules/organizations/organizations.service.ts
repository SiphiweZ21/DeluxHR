import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

type CompanyProfileActor = {
  sub: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findOne(organizationId: string) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        include: {
          features: {
            orderBy: {
              feature: 'asc',
            },
          },
          onboarding: true,
          _count: {
            select: {
              departments: true,
              users: true,
              employees: true,
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

  async updateProfile(
    organizationId: string,
    dto: UpdateCompanyProfileDto,
    actor: CompanyProfileActor,
  ) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    if (
      dto.name !== undefined &&
      dto.name.trim().length === 0
    ) {
      throw new BadRequestException(
        'Company display name cannot be empty.',
      );
    }

    const data = this.buildProfileUpdate(dto);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'No company profile changes were provided.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.organization.update({
            where: {
              id: organizationId,
            },
            data,
          });

        const changedFields =
          Object.keys(data);

        await tx.auditLog.create({
          data: {
            organizationId,
            action:
              'ORGANIZATION_PROFILE_UPDATED',
            entity: 'Organization',
            entityId: organizationId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              changedFields,
            } satisfies Prisma.InputJsonObject,
          },
        });

        return updated;
      },
    );
  }

  private buildProfileUpdate(
    dto: UpdateCompanyProfileDto,
  ) {
    return {
      ...(dto.name !== undefined && {
        name: dto.name.trim(),
      }),
      ...(dto.legalName !== undefined && {
        legalName: this.normalizeOptional(
          dto.legalName,
        ),
      }),
      ...(dto.registrationNumber !== undefined && {
        registrationNumber: this.normalizeOptional(
          dto.registrationNumber,
        ),
      }),
      ...(dto.taxNumber !== undefined && {
        taxNumber: this.normalizeOptional(
          dto.taxNumber,
        ),
      }),
      ...(dto.email !== undefined && {
        email: this.normalizeOptional(
          dto.email.toLowerCase(),
        ),
      }),
      ...(dto.phoneNumber !== undefined && {
        phoneNumber: this.normalizeOptional(
          dto.phoneNumber,
        ),
      }),
      ...(dto.website !== undefined && {
        website: this.normalizeOptional(
          dto.website,
        ),
      }),
      ...(dto.brandPrimaryColor !== undefined && { brandPrimaryColor: dto.brandPrimaryColor.toUpperCase() }),
      ...(dto.addressLine1 !== undefined && {
        addressLine1: this.normalizeOptional(
          dto.addressLine1,
        ),
      }),
      ...(dto.addressLine2 !== undefined && {
        addressLine2: this.normalizeOptional(
          dto.addressLine2,
        ),
      }),
      ...(dto.city !== undefined && {
        city: this.normalizeOptional(
          dto.city,
        ),
      }),
      ...(dto.province !== undefined && {
        province: this.normalizeOptional(
          dto.province,
        ),
      }),
      ...(dto.postalCode !== undefined && {
        postalCode: this.normalizeOptional(
          dto.postalCode,
        ),
      }),
      ...(dto.country !== undefined && {
        country: this.normalizeOptional(
          dto.country,
        ),
      }),
      ...(dto.timezone !== undefined && {
        timezone: this.normalizeOptional(
          dto.timezone,
        ),
      }),
    };
  }

  private normalizeOptional(
    value: string,
  ): string | null {
    const normalized = value.trim();

    return normalized.length > 0
      ? normalized
      : null;
  }
}
