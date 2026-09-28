import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateOrganizationDto) {
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
      },
    });

    await this.auditService.log({
      organizationId: organization.id,
      action: 'ORGANIZATION_CREATED',
      entity: 'Organization',
      entityId: organization.id,
    });

    return organization;
  }

  findAll() {
    return this.prisma.organization.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
