import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        organizationId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        organizationId,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid leave request dates');
    }

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate,
        endDate,
        status: 'PENDING',
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'LEAVE_REQUEST_SUBMITTED',
      entity: 'LeaveRequest',
      entityId: leaveRequest.id,
    });

    return leaveRequest;
  }

  async updateStatus(
    organizationId: string,
    leaveRequestId: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const leaveRequest = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        organizationId,
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (leaveRequest.status !== 'PENDING') {
      throw new BadRequestException('Leave request already processed');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    await this.auditService.log({
      organizationId,
      action:
        status === 'APPROVED'
          ? 'LEAVE_REQUEST_APPROVED'
          : 'LEAVE_REQUEST_REJECTED',
      entity: 'LeaveRequest',
      entityId: updated.id,
    });

    return updated;
  }

  async list(organizationId: string) {
    return this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
      },
      include: {
        employee: true,
        leaveType: true,
      },
      orderBy: {
        startDate: 'desc',
      },
    });
  }

  async findOne(organizationId: string, leaveRequestId: string) {
    const leaveRequest = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        organizationId,
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    return leaveRequest;
  }
}
