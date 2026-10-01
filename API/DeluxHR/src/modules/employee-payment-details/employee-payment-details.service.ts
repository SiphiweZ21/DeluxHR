import { assertPendingOnboardingChecker } from '../../common/auth/pending-onboarding-checker';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmployeePaymentDetailStatus,
  Prisma,
  RiskEventStatus,
  RiskEventType,
  RiskSeverity,
  UserRole,
} from '@prisma/client';

import { comparePassword } from '../../common/auth/password';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeePaymentDetailDto } from './dto/create-employee-payment-detail.dto';

interface PaymentDetailActor {
  id: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class EmployeePaymentDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async history(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);

    const details = await this.prisma.employeePaymentDetail.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        version: 'desc',
      },
    });

    return details.map((detail) => this.toSafePaymentDetail(detail));
  }

  async current(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);

    const detail = await this.prisma.employeePaymentDetail.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeePaymentDetailStatus.APPROVED,
      },
      orderBy: {
        version: 'desc',
      },
    });

    return detail ? this.toSafePaymentDetail(detail) : null;
  }

  async pending(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);

    const detail = await this.prisma.employeePaymentDetail.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeePaymentDetailStatus.PENDING_APPROVAL,
      },
      orderBy: {
        version: 'desc',
      },
    });

    return detail ? this.toSafePaymentDetail(detail) : null;
  }

  async submit(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeePaymentDetailDto,
    actor: PaymentDetailActor,
  ) {
    const employee = await this.ensureEmployee(organizationId, employeeId);

    if (employee.status === 'TERMINATED') {
      throw new BadRequestException(
        'Payment details cannot be changed for a terminated employee',
      );
    }

    const existingPending = await this.prisma.employeePaymentDetail.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeePaymentDetailStatus.PENDING_APPROVAL,
      },
      select: {
        id: true,
      },
    });

    if (existingPending) {
      throw new BadRequestException(
        'This employee already has payment details awaiting approval',
      );
    }

    const normalized = {
      bankName: this.required(dto.bankName, 'Bank name'),
      accountHolderName: this.required(
        dto.accountHolderName,
        'Account holder name',
      ),
      accountNumber: this.required(dto.accountNumber, 'Account number'),
      branchCode: this.optional(dto.branchCode),
      accountType: this.optional(dto.accountType),
      changeReason: this.optional(dto.changeReason),
    };

    const sharedAccountMatches = await this.findSharedBankAccountMatches(
      organizationId,
      employeeId,
      normalized.accountNumber,
    );

    const previousApproved = await this.prisma.employeePaymentDetail.findFirst({
      where: {
        organizationId,
        employeeId,
        status: EmployeePaymentDetailStatus.APPROVED,
      },
      orderBy: {
        version: 'desc',
      },
    });

    const paymentChangeAssessment = previousApproved
      ? await this.assessPaymentChangeRisk(
          organizationId,
          employeeId,
          previousApproved,
          normalized,
        )
      : null;

    const created = await this.prisma.$transaction(async (transaction) => {
      const latest = await transaction.employeePaymentDetail.findFirst({
        where: {
          employeeId,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          version: true,
        },
      });

      const paymentDetail = await transaction.employeePaymentDetail.create({
        data: {
          organizationId,
          employeeId,
          version: (latest?.version ?? 0) + 1,

          bankName: normalized.bankName,
          accountHolderName: normalized.accountHolderName,
          accountNumber: normalized.accountNumber,
          branchCode: normalized.branchCode,
          accountType: normalized.accountType,

          status: EmployeePaymentDetailStatus.PENDING_APPROVAL,

          requestedByUserId: actor.id,
          changeReason: normalized.changeReason,
        },
      });

      if (sharedAccountMatches.length > 0) {
        await transaction.riskEvent.create({
          data: {
            organizationId,
            employeeId,
            type: RiskEventType.SHARED_BANK_ACCOUNT,
            severity: RiskSeverity.MEDIUM,
            status: RiskEventStatus.OPEN,
            title: 'Shared bank account detected',
            description:
              'The submitted bank account matches payment details associated with another employee in the same organization and requires review.',
            sourceEntity: 'EmployeePaymentDetail',
            sourceEntityId: paymentDetail.id,
            detectedByUserId: actor.id,
            metadata: {
              matchedEmployeeIds: [
                ...new Set(
                  sharedAccountMatches.map((match) => match.employeeId),
                ),
              ],
              matchedPaymentDetailIds: sharedAccountMatches.map(
                (match) => match.id,
              ),
              matchedStatuses: [
                ...new Set(sharedAccountMatches.map((match) => match.status)),
              ],
            },
          },
        });
      }

      if (paymentChangeAssessment) {
        await transaction.riskEvent.create({
          data: {
            organizationId,
            employeeId,
            type: RiskEventType.PAYMENT_DETAILS_CHANGED,
            severity: paymentChangeAssessment.severity,
            status: RiskEventStatus.OPEN,
            title: 'Employee payment details changed',
            description:
              'A change to previously approved employee payment details was submitted and requires normal maker/checker review.',
            sourceEntity: 'EmployeePaymentDetail',
            sourceEntityId: paymentDetail.id,
            detectedByUserId: actor.id,
            metadata: {
              previousPaymentDetailId: previousApproved?.id,
              changedFields: paymentChangeAssessment.changedFields,
              accountNumberChanged:
                paymentChangeAssessment.accountNumberChanged,
              recentPaymentChangeCount:
                paymentChangeAssessment.recentPaymentChangeCount,
              rapidChangeDetected: paymentChangeAssessment.rapidChangeDetected,
            },
          },
        });
      }

      await this.auditService.log(
        {
          action: 'EMPLOYEE_PAYMENT_DETAILS_SUBMITTED',
          entity: 'EmployeePaymentDetail',
          entityId: paymentDetail.id,
          organizationId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason: normalized.changeReason,
          metadata: {
            employeeId,
            employeeNumber: employee.employeeNumber,
            version: paymentDetail.version,
            status: paymentDetail.status,
            sharedBankAccountRiskDetected: sharedAccountMatches.length > 0,
            paymentChangeRiskDetected: Boolean(paymentChangeAssessment),
            paymentChangeSeverity: paymentChangeAssessment?.severity ?? null,
            paymentChangeFields: paymentChangeAssessment?.changedFields ?? [],
            rapidPaymentChangeDetected:
              paymentChangeAssessment?.rapidChangeDetected ?? false,
          },
        },
        transaction as Prisma.TransactionClient,
      );

      return paymentDetail;
    });

    return this.toSafePaymentDetail(created);
  }

  async approve(
    organizationId: string,
    employeeId: string,
    paymentDetailId: string,
    password: string,
    checker: PaymentDetailActor,
    onboarding = false,
  ) {
    const activated = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.employeePaymentDetail.findFirst({
        where: {
          id: paymentDetailId,
          organizationId,
          employeeId,
        },
      });

      if (!current) throw new NotFoundException('Payment details not found');
      if (current.status !== EmployeePaymentDetailStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          'Payment details are no longer awaiting approval',
        );
      }

      const checkerUser = await this.assertCheckerAllowed(
        organizationId,
        current.requestedByUserId,
        checker.id,
        transaction,
        onboarding,
      );
      await this.assertPassword(password, checkerUser.passwordHash);

      await transaction.employeePaymentDetail.updateMany({
        where: {
          organizationId,
          employeeId,
          status: EmployeePaymentDetailStatus.APPROVED,
          id: {
            not: paymentDetailId,
          },
        },
        data: {
          status: EmployeePaymentDetailStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
      });

      const approval = await transaction.employeePaymentDetail.updateMany({
        where: {
          id: paymentDetailId,
          organizationId,
          employeeId,
          status: EmployeePaymentDetailStatus.PENDING_APPROVAL,
        },
        data: {
          status: EmployeePaymentDetailStatus.APPROVED,
          approvedByUserId: checkerUser.id,
          approvedAt: new Date(),

          rejectedByUserId: null,
          rejectedAt: null,
          rejectionReason: null,
          supersededAt: null,
        },
      });

      if (approval.count !== 1) {
        throw new BadRequestException(
          'Payment details are no longer awaiting approval',
        );
      }

      await transaction.employeePayrollProfile.upsert({
        where: {
          employeeId,
        },
        update: {
          bankName: current.bankName,
          bankAccountHolder: current.accountHolderName,
          bankAccountNumber: current.accountNumber,
          bankBranchCode: current.branchCode,
          bankAccountType: current.accountType,
        },
        create: {
          organizationId,
          employeeId,
          bankName: current.bankName,
          bankAccountHolder: current.accountHolderName,
          bankAccountNumber: current.accountNumber,
          bankBranchCode: current.branchCode,
          bankAccountType: current.accountType,
        },
      });

      const approved = await transaction.employeePaymentDetail.findUnique({
        where: {
          id: paymentDetailId,
        },
      });

      if (!approved) {
        throw new NotFoundException('Payment details not found');
      }

      await this.auditService.log(
        {
          action: 'EMPLOYEE_PAYMENT_DETAILS_APPROVED_AND_ACTIVATED',
          entity: 'EmployeePaymentDetail',
          entityId: approved.id,
          organizationId,
          actorUserId: checkerUser.id,
          actorEmail: checkerUser.email,
          actorRole: checkerUser.role,
          metadata: {
            employeeId,
            version: approved.version,
            status: approved.status,
            requestedByUserId: approved.requestedByUserId,
            reauthenticated: true,
            payrollProfileUpdated: true,
            onboardingIndependentAdmin: checkerUser.onboardingIndependentAdmin,
          },
        },
        transaction as Prisma.TransactionClient,
      );

      return approved;
    });

    return this.toSafePaymentDetail(activated);
  }

  async reject(
    organizationId: string,
    employeeId: string,
    paymentDetailId: string,
    reason: string,
    password: string,
    checker: PaymentDetailActor,
  ) {
    const normalizedReason = this.required(reason, 'Rejection reason');

    const paymentDetail = await this.getPendingPaymentDetail(
      organizationId,
      employeeId,
      paymentDetailId,
    );

    const checkerUser = await this.assertCheckerAllowed(
      organizationId,
      paymentDetail.requestedByUserId,
      checker.id,
    );

    await this.assertPassword(password, checkerUser.passwordHash);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.employeePaymentDetail.updateMany({
        where: {
          id: paymentDetailId,
          organizationId,
          employeeId,
          status: EmployeePaymentDetailStatus.PENDING_APPROVAL,
        },
        data: {
          status: EmployeePaymentDetailStatus.REJECTED,

          rejectedByUserId: checkerUser.id,
          rejectedAt: new Date(),
          rejectionReason: normalizedReason,

          approvedByUserId: null,
          approvedAt: null,
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException(
          'Payment details are no longer awaiting approval',
        );
      }

      const rejected = await transaction.employeePaymentDetail.findUnique({
        where: {
          id: paymentDetailId,
        },
      });

      if (!rejected) {
        throw new NotFoundException('Payment details not found');
      }

      await this.auditService.log(
        {
          action: 'EMPLOYEE_PAYMENT_DETAILS_REJECTED',
          entity: 'EmployeePaymentDetail',
          entityId: rejected.id,
          organizationId,
          actorUserId: checkerUser.id,
          actorEmail: checkerUser.email,
          actorRole: checkerUser.role,
          reason: normalizedReason,
          metadata: {
            employeeId,
            version: rejected.version,
            status: rejected.status,
            requestedByUserId: rejected.requestedByUserId,
            reauthenticated: true,
          },
        },
        transaction as Prisma.TransactionClient,
      );

      return rejected;
    });

    return this.toSafePaymentDetail(updated);
  }

  private async assessPaymentChangeRisk(
    organizationId: string,
    employeeId: string,
    previousApproved: {
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
      branchCode: string | null;
      accountType: string | null;
    },
    next: {
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
      branchCode?: string;
      accountType?: string;
    },
  ) {
    const changedFields: string[] = [];

    if (previousApproved.bankName !== next.bankName) {
      changedFields.push('bankName');
    }

    if (previousApproved.accountHolderName !== next.accountHolderName) {
      changedFields.push('accountHolderName');
    }

    const accountNumberChanged =
      previousApproved.accountNumber !== next.accountNumber;

    if (accountNumberChanged) {
      changedFields.push('accountNumber');
    }

    if ((previousApproved.branchCode ?? undefined) !== next.branchCode) {
      changedFields.push('branchCode');
    }

    if ((previousApproved.accountType ?? undefined) !== next.accountType) {
      changedFields.push('accountType');
    }

    const rapidChangeWindowStart = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    const recentPaymentChangeCount =
      await this.prisma.employeePaymentDetail.count({
        where: {
          organizationId,
          employeeId,
          version: {
            gt: 1,
          },
          requestedAt: {
            gte: rapidChangeWindowStart,
          },
        },
      });

    const rapidChangeDetected = recentPaymentChangeCount >= 1;

    let severity: RiskSeverity = RiskSeverity.LOW;

    if (accountNumberChanged) {
      severity = RiskSeverity.MEDIUM;
    }

    if (rapidChangeDetected) {
      severity = accountNumberChanged ? RiskSeverity.HIGH : RiskSeverity.MEDIUM;
    }

    return {
      changedFields,
      accountNumberChanged,
      recentPaymentChangeCount,
      rapidChangeDetected,
      severity,
    };
  }

  private async findSharedBankAccountMatches(
    organizationId: string,
    employeeId: string,
    accountNumber: string,
  ) {
    return this.prisma.employeePaymentDetail.findMany({
      where: {
        organizationId,
        employeeId: {
          not: employeeId,
        },
        accountNumber,
        status: {
          in: [
            EmployeePaymentDetailStatus.PENDING_APPROVAL,
            EmployeePaymentDetailStatus.APPROVED,
          ],
        },
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
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
        employeeNumber: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async getPendingPaymentDetail(
    organizationId: string,
    employeeId: string,
    paymentDetailId: string,
  ) {
    const paymentDetail = await this.prisma.employeePaymentDetail.findFirst({
      where: {
        id: paymentDetailId,
        organizationId,
        employeeId,
      },
    });

    if (!paymentDetail) {
      throw new NotFoundException('Payment details not found');
    }

    if (paymentDetail.status !== EmployeePaymentDetailStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Payment details are no longer awaiting approval',
      );
    }

    return paymentDetail;
  }

  private async assertCheckerAllowed(
    organizationId: string,
    requestedByUserId: string,
    checkerUserId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    onboarding = false,
  ) {
    if (requestedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'The user who requested the payment detail change cannot approve or reject it',
      );
    }

    const [maker, checker] = await Promise.all([
      db.user.findUnique({
        where: {
          id: requestedByUserId,
        },
        select: {
          id: true,
          organizationId: true,
          role: true,
        },
      }),

      db.user.findUnique({
        where: {
          id: checkerUserId,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          organizationId: true,
          role: true,
          isActive: true,
        },
      }),
    ]);

    if (!maker) {
      throw new ForbiddenException(
        'The payment detail requester could not be verified',
      );
    }

    if (!checker || !checker.isActive) {
      throw new ForbiddenException(
        'The payment detail checker is not an active user',
      );
    }

    if (this.isPlatformRole(checker.role)) {
      throw new ForbiddenException(
        'Platform administrators cannot approve or reject customer payment details',
      );
    }

    if (checker.organizationId !== organizationId) {
      throw new ForbiddenException(
        'The payment detail checker does not belong to this organization',
      );
    }

    if (
      !this.isPlatformRole(maker.role) &&
      maker.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'The payment detail requester does not belong to this organization',
      );
    }

    const allowedCheckerRoles = this.allowedCheckerRolesForMaker(maker.role);

    if (!allowedCheckerRoles.includes(checker.role)) {
      if (
        onboarding &&
        maker.role === UserRole.COMPANY_ADMIN &&
        checker.role === UserRole.COMPANY_ADMIN
      ) {
        await assertPendingOnboardingChecker(
          db as Prisma.TransactionClient,
          organizationId,
          maker.id,
          checker.id,
        );
        return { ...checker, onboardingIndependentAdmin: true };
      }
      throw new ForbiddenException(
        'You are not an authorised checker for this payment detail request',
      );
    }

    return { ...checker, onboardingIndependentAdmin: false };
  }

  private async assertPassword(password: string, passwordHash: string) {
    const normalizedPassword = password?.trim();

    if (!normalizedPassword) {
      throw new UnauthorizedException('Password confirmation is required');
    }

    const valid = await comparePassword(normalizedPassword, passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Password confirmation failed');
    }
  }

  private allowedCheckerRolesForMaker(makerRole: UserRole): UserRole[] {
    switch (makerRole) {
      case UserRole.HR_ADMIN:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];

      case UserRole.PAYROLL_ADMIN:
        return [UserRole.HR_ADMIN, UserRole.COMPANY_ADMIN];

      case UserRole.COMPANY_ADMIN:
        return [UserRole.HR_ADMIN, UserRole.PAYROLL_ADMIN];

      case UserRole.EXECUTIVE:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];

      case UserRole.PLATFORM_ADMIN:
      case UserRole.SUPER_ADMIN:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];

      default:
        return [];
    }
  }

  private isPlatformRole(role: UserRole): boolean {
    return role === UserRole.SUPER_ADMIN || role === UserRole.PLATFORM_ADMIN;
  }

  private required(value: string, label: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private optional(value?: string): string | undefined {
    const normalized = value?.trim();

    return normalized || undefined;
  }

  private maskAccountNumber(accountNumber: string): string {
    const visible = accountNumber.slice(-4);

    return `${'*'.repeat(Math.max(accountNumber.length - 4, 4))}${visible}`;
  }

  private toSafePaymentDetail(detail: {
    id: string;
    employeeId: string;
    version: number;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
    branchCode: string | null;
    accountType: string | null;
    status: EmployeePaymentDetailStatus;
    requestedAt: Date;
    changeReason: string | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    supersededAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: detail.id,
      employeeId: detail.employeeId,
      version: detail.version,

      bankName: detail.bankName,
      accountHolderName: detail.accountHolderName,
      maskedAccountNumber: this.maskAccountNumber(detail.accountNumber),
      branchCode: detail.branchCode,
      accountType: detail.accountType,

      status: detail.status,

      requestedAt: detail.requestedAt,
      changeReason: detail.changeReason,

      approvedAt: detail.approvedAt,

      rejectedAt: detail.rejectedAt,
      rejectionReason: detail.rejectionReason,

      supersededAt: detail.supersededAt,

      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    };
  }
}
