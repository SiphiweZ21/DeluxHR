import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateDepartmentDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingDepartment = await this.prisma.department.findFirst({
      where: {
        name: dto.name,
        organizationId,
      },
    });

    if (existingDepartment) {
      throw new BadRequestException('Department with this name already exists');
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        organizationId,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'DEPARTMENT_CREATED',
      entity: 'Department',
      entityId: department.id,
    });

    return department;
  }

  findAll(organizationId: string) {
    return this.prisma.department.findMany({
      where: { organizationId },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
