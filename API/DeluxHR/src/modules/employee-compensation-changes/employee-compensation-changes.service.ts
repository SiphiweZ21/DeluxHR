import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmployeeCompensationChangeStatus,
  EmployeeStatus,
  Prisma,
  RiskEventStatus,
  RiskEventType,
  RiskSeverity,
  type UserRole,
} from '@prisma/client';

import { comparePassword } from '../../common/auth/password';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import { CreateEmployeeCompensationChangeDto } from './dto/create-employee-compensation-change.dto';

type Actor = {
  id: string;
  email: string;
  role: UserRole;
};

type CompensationSnapshot = {
  basicSalary: number;
  pensionableSalary: number | null;
  hourlyRate: number | null;
};

@Injectable()
export class EmployeeCompensationChangesService {
  private static readonly RAPID_CHANGE_WINDOW_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async history(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);

    return this.prisma.employeeCompensationChange.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  async pending(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);

    return this.prisma.employeeCompensationChange.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeeCompensationChangeStatus.PENDING_APPROVAL,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  async submit(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeCompensationChangeDto,
    actor: Actor,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      include: {
        payrollProfile: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new BadRequestException(
        'Compensation cannot be changed for a terminated employee',
      );
    }

    const profile = employee.payrollProfile;

    if (!profile) {
      throw new BadRequestException(
        'Payroll profile must be created before requesting a compensation change',
      );
    }

    const pending = await this.prisma.employeeCompensationChange.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeeCompensationChangeStatus.PENDING_APPROVAL,
      },
      select: {
        id: true,
      },
    });

    if (pending) {
      throw new ConflictException(
        'A compensation change is already pending approval for this employee',
      );
    }

    const current: CompensationSnapshot = {
      basicSalary: profile.basicSalary,
      pensionableSalary: profile.pensionableSalary,
      hourlyRate: profile.hourlyRate,
    };

    const proposed: CompensationSnapshot = {
      basicSalary:
        dto.basicSalary !== undefined ? dto.basicSalary : current.basicSalary,
      pensionableSalary:
        dto.pensionableSalary !== undefined
          ? dto.pensionableSalary
          : current.pensionableSalary,
      hourlyRate:
        dto.hourlyRate !== undefined ? dto.hourlyRate : current.hourlyRate,
    };

    const changedFields = this.changedFields(current, proposed);

    if (changedFields.length === 0) {
      throw new BadRequestException(
        'At least one compensation value must change',
      );
    }

    const latest = await this.prisma.employeeCompensationChange.findFirst({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        version: 'desc',
      },
      select: {
        version: true,
      },
    });

    const version = (latest?.version ?? 0) + 1;

    const rapidWindowStart = new Date(
      Date.now() -
        EmployeeCompensationChangesService.RAPID_CHANGE_WINDOW_DAYS *
          24 *
          60 *
          60 *
          1000,
    );

    const recentApprovedChangeCount =
      await this.prisma.employeeCompensationChange.count({
        where: {
          organizationId,
          employeeId,
          status: EmployeeCompensationChangeStatus.APPROVED,
          approvedAt: {
            gte: rapidWindowStart,
          },
        },
      });

    const rapidChangeDetected = recentApprovedChangeCount > 0;

    const direction = this.overallDirection(current, proposed);
    const percentageChangeBand = this.percentageChangeBand(
      current.basicSalary,
      proposed.basicSalary,
    );

    const severity = rapidChangeDetected
      ? RiskSeverity.MEDIUM
      : RiskSeverity.LOW;

    return this.prisma.$transaction(async (tx) => {
      const change = await tx.employeeCompensationChange.create({
        data: {
          organizationId,
          employeeId,
          version,
          previousBasicSalary: current.basicSalary,
          proposedBasicSalary: proposed.basicSalary,
          previousPensionableSalary: current.pensionableSalary,
          proposedPensionableSalary: proposed.pensionableSalary,
          previousHourlyRate: current.hourlyRate,
          proposedHourlyRate: proposed.hourlyRate,
          requestedByUserId: actor.id,
          changeReason: dto.reason?.trim() || null,
        },
      });

      await tx.riskEvent.create({
        data: {
          organizationId,
          employeeId,
          type: RiskEventType.SALARY_CHANGED,
          severity,
          status: RiskEventStatus.OPEN,
          title: 'Compensation change requested',
          description:
            'An employee compensation change was submitted for approval.',
          sourceEntity: 'EmployeeCompensationChange',
          sourceEntityId: change.id,
          detectedByUserId: actor.id,
          metadata: {
            compensationChangeId: change.id,
            changedFields,
            direction,
            percentageChangeBand,
            rapidChangeDetected,
            recentApprovedChangeCount,
          } satisfies Prisma.InputJsonValue,
        },
      });

      await this.audit.log(
        {
          organizationId,
          action: 'EMPLOYEE_COMPENSATION_CHANGE_REQUESTED',
          entity: 'EmployeeCompensationChange',
          entityId: change.id,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason: dto.reason?.trim() || undefined,
          metadata: {
            employeeId,
            version,
            changedFields,
            direction,
            percentageChangeBand,
            rapidChangeDetected,
          },
        },
        tx,
      );

      return change;
    });
  }

  async approve(
    organizationId: string,
    employeeId: string,
    compensationChangeId: string,
    password: string,
    actor: Actor,
  ) {
    await this.reauthenticate(organizationId, actor.id, password);

    const change = await this.findPendingChange(
      organizationId,
      employeeId,
      compensationChangeId,
    );

    if (change.requestedByUserId === actor.id) {
      throw new ForbiddenException(
        'The user who requested a compensation change cannot approve it',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.employeeCompensationChange.findFirst({
        where: {
          id: compensationChangeId,
          organizationId,
          employeeId,
          status: EmployeeCompensationChangeStatus.PENDING_APPROVAL,
        },
      });

      if (!current) {
        throw new ConflictException(
          'Compensation change is no longer pending approval',
        );
      }

      await tx.employeePayrollProfile.update({
        where: {
          employeeId,
        },
        data: {
          basicSalary: current.proposedBasicSalary,
          pensionableSalary: current.proposedPensionableSalary,
          hourlyRate: current.proposedHourlyRate,
          effectiveFrom: new Date(),
        },
      });

      const approved = await tx.employeeCompensationChange.update({
        where: {
          id: current.id,
        },
        data: {
          status: EmployeeCompensationChangeStatus.APPROVED,
          approvedByUserId: actor.id,
          approvedAt: new Date(),
          effectiveFrom: new Date(),
        },
      });

      await this.audit.log(
        {
          organizationId,
          action: 'EMPLOYEE_COMPENSATION_CHANGE_APPROVED',
          entity: 'EmployeeCompensationChange',
          entityId: approved.id,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          metadata: {
            employeeId,
            version: approved.version,
          },
        },
        tx,
      );

      return approved;
    });
  }

  async reject(
    organizationId: string,
    employeeId: string,
    compensationChangeId: string,
    reason: string,
    password: string,
    actor: Actor,
  ) {
    await this.reauthenticate(organizationId, actor.id, password);

    const change = await this.findPendingChange(
      organizationId,
      employeeId,
      compensationChangeId,
    );

    if (change.requestedByUserId === actor.id) {
      throw new ForbiddenException(
        'The user who requested a compensation change cannot reject it',
      );
    }

    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.employeeCompensationChange.findFirst({
        where: {
          id: compensationChangeId,
          organizationId,
          employeeId,
          status: EmployeeCompensationChangeStatus.PENDING_APPROVAL,
        },
      });

      if (!current) {
        throw new ConflictException(
          'Compensation change is no longer pending approval',
        );
      }

      const rejected = await tx.employeeCompensationChange.update({
        where: {
          id: current.id,
        },
        data: {
          status: EmployeeCompensationChangeStatus.REJECTED,
          rejectedByUserId: actor.id,
          rejectedAt: new Date(),
          rejectionReason: normalizedReason,
        },
      });

      await this.audit.log(
        {
          organizationId,
          action: 'EMPLOYEE_COMPENSATION_CHANGE_REJECTED',
          entity: 'EmployeeCompensationChange',
          entityId: rejected.id,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason: normalizedReason,
          metadata: {
            employeeId,
            version: rejected.version,
          },
        },
        tx,
      );

      return rejected;
    });
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async findPendingChange(
    organizationId: string,
    employeeId: string,
    compensationChangeId: string,
  ) {
    const change = await this.prisma.employeeCompensationChange.findFirst({
      where: {
        id: compensationChangeId,
        organizationId,
        employeeId,
      },
    });

    if (!change) {
      throw new NotFoundException('Compensation change not found');
    }

    if (change.status !== EmployeeCompensationChangeStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        'Compensation change is no longer pending approval',
      );
    }

    return change;
  }

  private async reauthenticate(
    organizationId: string,
    userId: string,
    password: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        isActive: true,
      },
      select: {
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Unable to re-authenticate user');
    }

    const valid = await comparePassword(password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Password is incorrect');
    }
  }

  private changedFields(
    current: CompensationSnapshot,
    proposed: CompensationSnapshot,
  ) {
    const changed: string[] = [];

    if (current.basicSalary !== proposed.basicSalary) {
      changed.push('basicSalary');
    }

    if (current.pensionableSalary !== proposed.pensionableSalary) {
      changed.push('pensionableSalary');
    }

    if (current.hourlyRate !== proposed.hourlyRate) {
      changed.push('hourlyRate');
    }

    return changed;
  }

  private overallDirection(
    current: CompensationSnapshot,
    proposed: CompensationSnapshot,
  ) {
    const comparisons = [
      this.compareNullable(current.basicSalary, proposed.basicSalary),
      this.compareNullable(
        current.pensionableSalary,
        proposed.pensionableSalary,
      ),
      this.compareNullable(current.hourlyRate, proposed.hourlyRate),
    ].filter((value) => value !== 'UNCHANGED');

    if (comparisons.length === 0) {
      return 'UNCHANGED';
    }

    if (comparisons.every((value) => value === 'INCREASE')) {
      return 'INCREASE';
    }

    if (comparisons.every((value) => value === 'DECREASE')) {
      return 'DECREASE';
    }

    return 'MIXED';
  }

  private compareNullable(previous: number | null, proposed: number | null) {
    const previousValue = previous ?? 0;
    const proposedValue = proposed ?? 0;

    if (proposedValue > previousValue) {
      return 'INCREASE';
    }

    if (proposedValue < previousValue) {
      return 'DECREASE';
    }

    return 'UNCHANGED';
  }

  private percentageChangeBand(previous: number, proposed: number) {
    if (previous === proposed) {
      return 'UNCHANGED';
    }

    if (previous <= 0) {
      return proposed > 0 ? 'FROM_ZERO' : 'UNCHANGED';
    }

    const percentage = Math.abs(((proposed - previous) / previous) * 100);

    if (percentage < 5) {
      return 'UNDER_5_PERCENT';
    }

    if (percentage < 10) {
      return '5_TO_10_PERCENT';
    }

    if (percentage < 20) {
      return '10_TO_20_PERCENT';
    }

    return '20_PERCENT_OR_MORE';
  }
}
