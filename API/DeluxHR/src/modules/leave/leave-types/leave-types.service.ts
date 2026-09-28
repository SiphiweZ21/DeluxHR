import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateLeaveTypeDto) {
    const existing = await this.prisma.leaveType.findFirst({
      where: {
        organizationId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new BadRequestException('Leave type already exists');
    }

    const leaveType = await this.prisma.leaveType.create({
      data: {
        name: dto.name,
        organizationId,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'LEAVE_TYPE_CREATED',
      entity: 'LeaveType',
      entityId: leaveType.id,
    });

    return leaveType;
  }

  async list(organizationId: string) {
    return this.prisma.leaveType.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }
}
