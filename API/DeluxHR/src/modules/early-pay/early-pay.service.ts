import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EarlyPayRequestStatus, EarlyPayTransferType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateEarlyPayRequestDto } from './dto/create-early-pay-request.dto';
import { ReviewEarlyPayRequestDto } from './dto/review-early-pay-request.dto';
import { UpdateEarlyPayPolicyDto } from './dto/update-early-pay-policy.dto';

@Injectable()
export class EarlyPayService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(organizationId: string) {
    return this.prisma.earlyPayPolicy.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }

  async updatePolicy(organizationId: string, dto: UpdateEarlyPayPolicyDto) {
    await this.getPolicy(organizationId);

    return this.prisma.earlyPayPolicy.update({
      where: { organizationId },
      data: dto,
    });
  }

  async quote(organizationId: string, employeeId: string) {
    const policy = await this.getPolicy(organizationId);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const now = new Date();

    const payPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const payPeriodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const payday = new Date(
      now.getFullYear(),
      now.getMonth(),
      Math.min(policy.paydayDay, payPeriodEnd.getDate()),
    );

    const cutoff = new Date(payday);
    cutoff.setDate(cutoff.getDate() - policy.paydayCutoffDays);

    const inCutoff = now >= cutoff && now <= payday;

    const approvedTimesheets = await this.prisma.timesheet.findMany({
      where: {
        organizationId,
        employeeId,
        status: 'APPROVED',
        periodEnd: {
          gte: payPeriodStart,
        },
        periodStart: {
          lte: now,
        },
      },
    });

    let qualifyingDays = approvedTimesheets.reduce(
      (sum, timesheet) => sum + timesheet.totalDays,
      0,
    );

    if (qualifyingDays === 0) {
      const attendance = await this.prisma.attendanceRecord.findMany({
        where: {
          organizationId,
          employeeId,
          workDate: {
            gte: payPeriodStart,
            lte: now,
          },
          clockOut: {
            not: null,
          },
        },
        select: {
          workDate: true,
        },
      });

      qualifyingDays = new Set(
        attendance.map((record) => record.workDate.toISOString().slice(0, 10)),
      ).size;
    }

    const earnings = await this.prisma.earning.findMany({
      where: {
        organizationId,
        employeeId,
        status: {
          in: ['APPROVED', 'PROCESSED'],
        },
        earnedDate: {
          gte: payPeriodStart,
          lte: now,
        },
      },
    });

    const grossEarned = earnings.reduce(
      (sum, earning) => sum + earning.amount,
      0,
    );

    const estimatedPaye = grossEarned * (policy.estimatedPayeReserveRate / 100);

    const estimatedUif = grossEarned * (policy.estimatedUifReserveRate / 100);

    const protectedDeductions =
      grossEarned * (policy.protectedDeductionRate / 100);

    const estimatedNetEarned = Math.max(
      0,
      grossEarned - estimatedPaye - estimatedUif - protectedDeductions,
    );

    const previous = await this.prisma.earlyPayRequest.findMany({
      where: {
        organizationId,
        employeeId,
        payPeriodStart: {
          gte: payPeriodStart,
        },
        status: {
          in: ['PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'RECOVERED'],
        },
      },
    });

    const alreadyAccessed = previous.reduce(
      (sum, request) => sum + request.requestedAmount,
      0,
    );

    const accessLimit =
      estimatedNetEarned * (policy.accessibleNetPercentage / 100);

    const availableAmount = Math.max(
      0,
      Math.min(policy.maximumRequestAmount, accessLimit - alreadyAccessed),
    );

    const reasons: string[] = [];

    if (!policy.enabled) {
      reasons.push('Early Pay is disabled');
    }

    if (qualifyingDays < policy.minimumQualifyingDays) {
      reasons.push(
        `Minimum ${policy.minimumQualifyingDays} qualifying days required`,
      );
    }

    if (previous.length >= policy.maximumRequestsPerPeriod) {
      reasons.push('Maximum requests for this pay period reached');
    }

    if (inCutoff) {
      reasons.push(
        `Early Pay is locked ${policy.paydayCutoffDays} day(s) before payday`,
      );
    }

    if (grossEarned <= 0) {
      reasons.push('No qualifying approved earnings are available yet');
    }

    if (availableAmount < policy.minimumRequestAmount) {
      reasons.push('Available amount is below the minimum request amount');
    }

    return {
      eligible: reasons.length === 0,
      reason: reasons[0] ?? null,
      reasons,
      employeeId,
      payPeriodStart,
      payPeriodEnd,
      qualifyingDays,
      grossEarned,
      estimatedPaye,
      estimatedUif,
      protectedDeductions,
      estimatedNetEarned,
      accessiblePercentage: policy.accessibleNetPercentage,
      accessLimit,
      alreadyAccessed,
      availableAmount,
      requestCount: previous.length,
      payday,
      cutoff,
      policy,
      taxNote:
        'PAYE/UIF values are eligibility reserves only. Final statutory payroll calculations remain authoritative.',
    };
  }

  async createRequest(organizationId: string, dto: CreateEarlyPayRequestDto) {
    const quote = await this.quote(organizationId, dto.employeeId);

    if (!quote.eligible) {
      throw new BadRequestException(
        quote.reason ?? 'Employee is not eligible for Early Pay',
      );
    }

    if (
      dto.amount < quote.policy.minimumRequestAmount ||
      dto.amount > quote.availableAmount
    ) {
      throw new BadRequestException(
        `Request must be between R${quote.policy.minimumRequestAmount.toFixed(
          2,
        )} and R${quote.availableAmount.toFixed(2)}`,
      );
    }

    // DeluxHR Early Pay uses fixed transfer fees only.
    // STANDARD = R5
    // INSTANT = R20
    // There is no percentage-based transaction fee.
    const transferFee =
      dto.transferType === 'INSTANT'
        ? quote.policy.instantTransferFee
        : quote.policy.standardTransferFee;

    // Retained for compatibility with the existing EarlyPayRequest model.
    // The selected R5/R20 charge is stored in transferFee.
    const instantFee = 0;

    // Employee receives the requested amount.
    // Payroll recovers the requested amount plus the selected transfer fee.
    const totalPayrollRecovery = dto.amount + transferFee;

    const request = await this.prisma.earlyPayRequest.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        payPeriodStart: quote.payPeriodStart,
        payPeriodEnd: quote.payPeriodEnd,
        qualifyingDays: quote.qualifyingDays,
        grossEarnedAtRequest: quote.grossEarned,
        estimatedPaye: quote.estimatedPaye,
        estimatedUif: quote.estimatedUif,
        protectedDeductions: quote.protectedDeductions,
        estimatedNetEarned: quote.estimatedNetEarned,
        accessiblePercentage: quote.accessiblePercentage,
        availableAmountAtRequest: quote.availableAmount,
        requestedAmount: dto.amount,

        // Percentage service fee removed.
        serviceFee: 0,

        transferFee,
        instantFee,
        netDisbursement: dto.amount,
        totalPayrollRecovery,
        transferType: dto.transferType as EarlyPayTransferType,
        calculationSnapshot: JSON.parse(JSON.stringify(quote)),
      },
      include: {
        employee: {
          include: {
            department: true,
          },
        },
      },
    });

    await this.audit(organizationId, 'CREATE', request.id);

    return request;
  }

  async listAll(organizationId: string) {
    return this.prisma.earlyPayRequest.findMany({
      where: {
        organizationId,
      },
      include: {
        employee: {
          include: {
            department: true,
          },
        },
        payrollRun: true,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    return this.prisma.earlyPayRequest.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  async review(
    organizationId: string,
    id: string,
    reviewerId: string,
    dto: ReviewEarlyPayRequestDto,
  ) {
    const existing = await this.findRequest(organizationId, id);

    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be reviewed');
    }

    const status = dto.status as EarlyPayRequestStatus;

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.earlyPayRequest.updateMany({
        where: { id, organizationId, status: 'PENDING' },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          approvedAt: status === 'APPROVED' ? new Date() : null,
          rejectionReason: status === 'REJECTED' ? dto.reason : null,
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException(
          'Request is no longer pending. Refresh before reviewing.',
        );
      await tx.auditLog.create({
        data: {
          organizationId,
          action: status,
          entity: 'EarlyPayRequest',
          entityId: id,
          actorUserId: reviewerId,
        },
      });
      return tx.earlyPayRequest.findUnique({
        where: { id },
        include: { employee: { include: { department: true } } },
      });
    });
  }

  async processPayment(organizationId: string, id: string) {
    // Kept as an explicit rejection for older clients; treasury confirmation owns PAID.
    throw new BadRequestException(
      'Simulated payments are disabled. Use platform Early Pay treasury batches and independently confirm the bank result.',
    );
  }

  private async findRequest(organizationId: string, id: string) {
    const request = await this.prisma.earlyPayRequest.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!request) {
      throw new NotFoundException('Early Pay request not found');
    }

    return request;
  }

  private audit(organizationId: string, action: string, entityId: string) {
    return this.prisma.auditLog.create({
      data: {
        organizationId,
        action,
        entity: 'EarlyPayRequest',
        entityId,
      },
    });
  }
}
