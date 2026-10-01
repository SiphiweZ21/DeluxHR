import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeePaymentDetailStatus,
  PayrollPaymentBatchStatus,
  PayrollPaymentItemStatus,
  PayrollPaymentMethod,
  PayrollPaymentReconciliationStatus,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { PayrollPaymentExportRegistry } from './export/payment-export.registry';
import {
  PayrollPaymentExportAdapterId,
  PayrollPaymentExportBatch,
} from './export/payment-export.types';

type PaymentReadinessIssue = {
  employeeId: string;
  employeeNumber: string;
  payrollRunId: string;
  severity: 'BLOCKED' | 'WARNING';
  code: string;
  message: string;
};

type PaymentDestinationSnapshot = {
  employeeNumber?: string;
  employeeName?: string;
  paymentReference?: string;
  snapshotVersion?: number;
  employeePaymentDetailId?: string;
  paymentDetailVersion?: number;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  branchCode?: string | null;
  accountType?: string | null;
  approvedAt?: string | null;
};

@Injectable()
export class PayrollPaymentsService {
  private readonly exportRegistry = new PayrollPaymentExportRegistry();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async loadPayrollForPaymentReadiness(
    database: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    payrollBatchId: string,
  ) {
    const payrollBatch = await database.payrollBatch.findFirst({
      where: { id: payrollBatchId, organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        payPeriodStart: true,
        payPeriodEnd: true,
        paymentDate: true,
        currency: true,
        lockedAt: true,
        payrollRuns: {
          orderBy: [
            { employee: { employeeNumber: 'asc' } },
            { createdAt: 'asc' },
          ],
          select: {
            id: true,
            employeeId: true,
            status: true,
            netPay: true,
            currency: true,
            lockedAt: true,
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                firstName: true,
                lastName: true,
                paymentDetails: {
                  where: { status: EmployeePaymentDetailStatus.APPROVED },
                  orderBy: [{ version: 'desc' }],
                  take: 1,
                  select: {
                    id: true,
                    version: true,
                    bankName: true,
                    accountHolderName: true,
                    accountNumber: true,
                    branchCode: true,
                    accountType: true,
                    approvedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payrollBatch) {
      throw new NotFoundException('Payroll cycle not found.');
    }

    return payrollBatch;
  }

  private evaluatePaymentReadiness(
    payrollBatch: Awaited<
      ReturnType<PayrollPaymentsService['loadPayrollForPaymentReadiness']>
    >,
  ) {
    const issues: PaymentReadinessIssue[] = [];

    const employees = payrollBatch.payrollRuns.map((run) => {
      const employeeIssues: PaymentReadinessIssue[] = [];

      const addIssue = (
        severity: 'BLOCKED' | 'WARNING',
        code: string,
        message: string,
      ) => {
        const issue: PaymentReadinessIssue = {
          employeeId: run.employeeId,
          employeeNumber: run.employee.employeeNumber,
          payrollRunId: run.id,
          severity,
          code,
          message,
        };
        employeeIssues.push(issue);
        issues.push(issue);
      };

      if (run.status !== PayrollRunStatus.LOCKED || !run.lockedAt) {
        addIssue(
          'BLOCKED',
          'PAYROLL_RUN_NOT_LOCKED',
          `Payroll run is ${run.status}; expected LOCKED.`,
        );
      }

      if (run.currency !== payrollBatch.currency) {
        addIssue(
          'BLOCKED',
          'CURRENCY_MISMATCH',
          `Payroll run currency ${run.currency} does not match batch currency ${payrollBatch.currency}.`,
        );
      }

      if (!Number.isFinite(run.netPay) || run.netPay < 0) {
        addIssue(
          'BLOCKED',
          'INVALID_NET_PAY',
          'Locked payroll run has an invalid net pay amount.',
        );
      }

      if (run.employee.paymentDetails.length !== 1) {
        addIssue(
          'BLOCKED',
          'APPROVED_PAYMENT_DETAILS_REQUIRED',
          'Employee must have approved payment details before salary payment can be prepared.',
        );
      } else {
        const paymentDetail = run.employee.paymentDetails[0];

        if (
          !paymentDetail.bankName.trim() ||
          !paymentDetail.accountHolderName.trim() ||
          !paymentDetail.accountNumber.trim()
        ) {
          addIssue(
            'BLOCKED',
            'INCOMPLETE_PAYMENT_DETAILS',
            'Approved payment details are missing required bank information.',
          );
        }

        if (!paymentDetail.branchCode?.trim()) {
          addIssue(
            'WARNING',
            'BRANCH_CODE_MISSING',
            'Approved payment details do not contain a branch code. Bank export requirements will be validated by the selected bank adapter.',
          );
        }

        if (!paymentDetail.accountType?.trim()) {
          addIssue(
            'WARNING',
            'ACCOUNT_TYPE_MISSING',
            'Approved payment details do not contain an account type. Bank export requirements will be validated by the selected bank adapter.',
          );
        }
      }

      const status = employeeIssues.some(
        (issue) => issue.severity === 'BLOCKED',
      )
        ? 'BLOCKED'
        : employeeIssues.some((issue) => issue.severity === 'WARNING')
          ? 'WARNING'
          : 'READY';

      return {
        employeeId: run.employeeId,
        employeeNumber: run.employee.employeeNumber,
        employeeName:
          `${run.employee.firstName} ${run.employee.lastName}`.trim(),
        payrollRunId: run.id,
        netPay: run.netPay,
        currency: run.currency,
        status,
        issues: employeeIssues,
      };
    });

    const readyCount = employees.filter((x) => x.status === 'READY').length;
    const warningCount = employees.filter((x) => x.status === 'WARNING').length;
    const blockedCount = employees.filter((x) => x.status === 'BLOCKED').length;

    const batchIssues: Array<{
      severity: 'BLOCKED' | 'WARNING';
      code: string;
      message: string;
    }> = [];

    if (payrollBatch.status !== 'LOCKED' || !payrollBatch.lockedAt) {
      batchIssues.push({
        severity: 'BLOCKED',
        code: 'PAYROLL_BATCH_NOT_LOCKED',
        message: `Payment preparation requires a LOCKED payroll cycle. Current status is ${payrollBatch.status}.`,
      });
    }

    if (payrollBatch.payrollRuns.length === 0) {
      batchIssues.push({
        severity: 'BLOCKED',
        code: 'NO_PAYROLL_RUNS',
        message: 'Payroll cycle has no payroll runs to prepare for payment.',
      });
    }

    return {
      payrollBatchId: payrollBatch.id,
      title: payrollBatch.title,
      payPeriodStart: payrollBatch.payPeriodStart,
      payPeriodEnd: payrollBatch.payPeriodEnd,
      paymentDate: payrollBatch.paymentDate,
      currency: payrollBatch.currency,
      payrollBatchStatus: payrollBatch.status,
      canPrepare:
        blockedCount === 0 &&
        !batchIssues.some((issue) => issue.severity === 'BLOCKED'),
      summary: {
        totalEmployees: employees.length,
        ready: readyCount,
        warning: warningCount,
        blocked: blockedCount,
      },
      batchIssues,
      issues,
      employees,
    };
  }

  async getReadiness(organizationId: string, payrollBatchId: string) {
    const payrollBatch = await this.loadPayrollForPaymentReadiness(
      this.prisma,
      organizationId,
      payrollBatchId,
    );
    const readiness = this.evaluatePaymentReadiness(payrollBatch);

    const existingPaymentBatch =
      await this.prisma.payrollPaymentBatch.findFirst({
        where: {
          organizationId,
          payrollBatchId,
          status: { not: PayrollPaymentBatchStatus.CANCELLED },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, preparedAt: true },
      });

    return {
      ...readiness,
      existingPaymentBatch,
      canPrepare: readiness.canPrepare && !existingPaymentBatch,
    };
  }

  async fundingProfiles(organizationId: string) {
    const profiles = await this.prisma.companyBankingProfile.findMany({
      where: { organizationId, status: 'APPROVED' },
      select: {
        id: true,
        name: true,
        bank: true,
        channel: true,
        adapterId: true,
        adapterVersion: true,
        accountNumber: true,
      },
    });
    return profiles.map(({ accountNumber, ...profile }) => ({
      ...profile,
      accountNumberMasked: `••••${accountNumber.slice(-4)}`,
    }));
  }
  async prepareFromLockedPayroll(
    organizationId: string,
    payrollBatchId: string,
    actor: TenantJwtUser,
    fundingProfileId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id"=${organizationId} FOR UPDATE`;
        const payrollBatch = await this.loadPayrollForPaymentReadiness(
          tx,
          organizationId,
          payrollBatchId,
        );

        const existingPreparedBatch = await tx.payrollPaymentBatch.findFirst({
          where: {
            organizationId,
            payrollBatchId,
            status: { not: PayrollPaymentBatchStatus.CANCELLED },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        });

        if (existingPreparedBatch) {
          throw new ConflictException(
            `A payment batch already exists for this payroll cycle with status ${existingPreparedBatch.status}.`,
          );
        }

        const readiness = this.evaluatePaymentReadiness(payrollBatch);

        if (!readiness.canPrepare) {
          throw new BadRequestException({
            message:
              'Payroll payment batch cannot be prepared until payment readiness issues are resolved.',
            payrollBatchId: payrollBatch.id,
            summary: readiness.summary,
            batchIssues: readiness.batchIssues,
            issues: readiness.issues,
          });
        }

        const totalAmount =
          payrollBatch.payrollRuns.reduce(
            (sum, run) => sum + Math.round(run.netPay * 100),
            0,
          ) / 100;

        const defaultProfile = await tx.companyBankingDefault.findUnique({
          where: {
            organizationId_purpose: { organizationId, purpose: 'SALARIES' },
          },
        });
        const selectedProfileId = fundingProfileId ?? defaultProfile?.profileId;
        const funding = selectedProfileId
          ? await tx.companyBankingProfile.findFirst({
              where: {
                id: selectedProfileId,
                organizationId,
                status: 'APPROVED',
              },
            })
          : null;
        if (selectedProfileId && !funding)
          throw new BadRequestException(
            'Choose an approved same-company funding profile.',
          );
        if (funding && funding.currency !== payrollBatch.currency)
          throw new BadRequestException(
            'Funding and payroll currencies differ.',
          );
        const fundingSnapshot = funding
          ? {
              profileId: funding.id,
              name: funding.name,
              bank: funding.bank,
              channel: funding.channel,
              adapterId: funding.adapterId,
              adapterVersion: funding.adapterVersion,
              accountNumber: funding.accountNumber,
              branchCode: funding.branchCode,
              ownReference: funding.ownReference,
            }
          : undefined;
        const paymentBatch = await tx.payrollPaymentBatch.create({
          data: {
            organizationId,
            fundingProfileId: funding?.id,
            fundingSnapshot,
            paymentDateSnapshot: payrollBatch.paymentDate,
            payrollBatchId: payrollBatch.id,
            method: PayrollPaymentMethod.BANK_FILE,
            status: PayrollPaymentBatchStatus.PREPARED,
            currency: payrollBatch.currency,
            employeeCount: payrollBatch.payrollRuns.length,
            totalAmount,
            preparedByUserId: actor.sub,
            preparedAt: new Date(),
            items: {
              create: payrollBatch.payrollRuns.map((run) => {
                const paymentDetail = run.employee.paymentDetails[0];

                return {
                  organizationId,
                  employeeId: run.employeeId,
                  payrollRunId: run.id,
                  employeePaymentDetailId: paymentDetail.id,
                  amount: Math.round(run.netPay * 100) / 100,
                  currency: run.currency,
                  paymentDestinationSnapshot: {
                    snapshotVersion: 2,
                    employeeNumber: run.employee.employeeNumber,
                    employeeName:
                      `${run.employee.firstName} ${run.employee.lastName}`.trim(),
                    paymentReference: `SAL${run.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`,
                    employeePaymentDetailId: paymentDetail.id,
                    paymentDetailVersion: paymentDetail.version,
                    bankName: paymentDetail.bankName,
                    accountHolderName: paymentDetail.accountHolderName,
                    accountNumber: paymentDetail.accountNumber,
                    branchCode: paymentDetail.branchCode,
                    accountType: paymentDetail.accountType,
                    approvedAt: paymentDetail.approvedAt?.toISOString() ?? null,
                  } satisfies Prisma.InputJsonValue,
                };
              }),
            },
          },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                employeeId: true,
                payrollRunId: true,
                employeePaymentDetailId: true,
                amount: true,
                currency: true,
                status: true,
              },
            },
          },
        });

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_PREPARED',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatch.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: payrollBatch.id,
              employeeCount: paymentBatch.employeeCount,
              totalAmount: paymentBatch.totalAmount,
              currency: paymentBatch.currency,
              method: paymentBatch.method,
            },
          },
          tx,
        );

        return {
          id: paymentBatch.id,
          payrollBatchId: paymentBatch.payrollBatchId,
          method: paymentBatch.method,
          status: paymentBatch.status,
          currency: paymentBatch.currency,
          employeeCount: paymentBatch.employeeCount,
          totalAmount: paymentBatch.totalAmount,
          preparedAt: paymentBatch.preparedAt,
          preparedByUserId: paymentBatch.preparedByUserId,
          items: paymentBatch.items,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async approveForExport(
    organizationId: string,
    paymentBatchId: string,
    actor: TenantJwtUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const paymentBatch = await tx.payrollPaymentBatch.findFirst({
          where: {
            id: paymentBatchId,
            organizationId,
          },
          select: {
            id: true,
            payrollBatchId: true,
            status: true,
            currency: true,
            employeeCount: true,
            totalAmount: true,
            preparedByUserId: true,
            preparedAt: true,
          },
        });

        if (!paymentBatch) {
          throw new NotFoundException('Payroll payment batch not found.');
        }

        if (paymentBatch.status !== PayrollPaymentBatchStatus.PREPARED) {
          throw new BadRequestException(
            `Release approval requires a PREPARED payment batch. Current status is ${paymentBatch.status}.`,
          );
        }

        if (paymentBatch.preparedByUserId === actor.sub) {
          throw new BadRequestException(
            'The user who prepared the payment batch cannot approve the same batch for export.',
          );
        }

        const approvedAt = new Date();

        const updated = await tx.payrollPaymentBatch.updateMany({
          where: {
            id: paymentBatchId,
            organizationId,
            status: PayrollPaymentBatchStatus.PREPARED,
            preparedByUserId: {
              not: actor.sub,
            },
          },
          data: {
            status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
            approvedForExportByUserId: actor.sub,
            approvedForExportAt: approvedAt,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Payment batch changed before approval could be completed.',
          );
        }

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_APPROVED_FOR_EXPORT',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: paymentBatch.payrollBatchId,
              preparedByUserId: paymentBatch.preparedByUserId,
              approvedForExportByUserId: actor.sub,
              employeeCount: paymentBatch.employeeCount,
              totalAmount: paymentBatch.totalAmount,
              currency: paymentBatch.currency,
            },
          },
          tx,
        );

        return {
          id: paymentBatch.id,
          payrollBatchId: paymentBatch.payrollBatchId,
          status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
          currency: paymentBatch.currency,
          employeeCount: paymentBatch.employeeCount,
          totalAmount: paymentBatch.totalAmount,
          preparedByUserId: paymentBatch.preparedByUserId,
          preparedAt: paymentBatch.preparedAt,
          approvedForExportByUserId: actor.sub,
          approvedForExportAt: approvedAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async submitToBank(
    organizationId: string,
    paymentBatchId: string,
    actor: TenantJwtUser,
    input: {
      bankSubmissionReference?: string;
      notes?: string;
    },
  ) {
    const bankSubmissionReference =
      input.bankSubmissionReference?.trim() || null;
    const notes = input.notes?.trim() || null;

    return this.prisma.$transaction(
      async (tx) => {
        const paymentBatch = await tx.payrollPaymentBatch.findFirst({
          where: { id: paymentBatchId, organizationId },
          select: {
            id: true,
            payrollBatchId: true,
            status: true,
            employeeCount: true,
            totalAmount: true,
            currency: true,
            exportReference: true,
            exportFileName: true,
          },
        });

        if (!paymentBatch) {
          throw new NotFoundException('Payroll payment batch not found.');
        }

        if (paymentBatch.status !== PayrollPaymentBatchStatus.EXPORTED) {
          throw new BadRequestException(
            `Bank submission confirmation requires an EXPORTED payment batch. Current status is ${paymentBatch.status}.`,
          );
        }

        const submittedAt = new Date();

        const updated = await tx.payrollPaymentBatch.updateMany({
          where: {
            id: paymentBatchId,
            organizationId,
            status: PayrollPaymentBatchStatus.EXPORTED,
          },
          data: {
            status: PayrollPaymentBatchStatus.SUBMITTED_TO_BANK,
            submittedToBankByUserId: actor.sub,
            submittedToBankAt: submittedAt,
            bankSubmissionReference,
            notes,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Payment batch changed before bank submission could be recorded.',
          );
        }

        await tx.payrollPaymentItem.updateMany({
          where: {
            organizationId,
            payrollPaymentBatchId: paymentBatchId,
            status: PayrollPaymentItemStatus.EXPORTED,
          },
          data: {
            status: PayrollPaymentItemStatus.SUBMITTED_TO_BANK,
            submittedToBankAt: submittedAt,
          },
        });

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_SUBMITTED_TO_BANK',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: paymentBatch.payrollBatchId,
              exportReference: paymentBatch.exportReference,
              exportFileName: paymentBatch.exportFileName,
              bankSubmissionReference,
              employeeCount: paymentBatch.employeeCount,
              totalAmount: paymentBatch.totalAmount,
              currency: paymentBatch.currency,
            },
          },
          tx,
        );

        return {
          id: paymentBatch.id,
          payrollBatchId: paymentBatch.payrollBatchId,
          status: PayrollPaymentBatchStatus.SUBMITTED_TO_BANK,
          submittedToBankByUserId: actor.sub,
          submittedToBankAt: submittedAt,
          bankSubmissionReference,
          employeeCount: paymentBatch.employeeCount,
          totalAmount: paymentBatch.totalAmount,
          currency: paymentBatch.currency,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordPaymentResults(
    organizationId: string,
    paymentBatchId: string,
    actor: TenantJwtUser,
    results: Array<{
      paymentItemId: string;
      status: 'PAID' | 'FAILED' | 'RETURNED';
      paymentReference?: string;
      reason?: string;
    }>,
  ) {
    if (results.length === 0) {
      throw new BadRequestException(
        'At least one employee payment result is required.',
      );
    }

    const uniqueItemIds = new Set(
      results.map((result) => result.paymentItemId),
    );
    if (uniqueItemIds.size !== results.length) {
      throw new BadRequestException(
        'Each payment item may appear only once in a result submission.',
      );
    }

    for (const result of results) {
      const reason = result.reason?.trim();
      if (
        (result.status === 'FAILED' || result.status === 'RETURNED') &&
        !reason
      ) {
        throw new BadRequestException(
          `A reason is required when payment item ${result.paymentItemId} is ${result.status}.`,
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const paymentBatch = await tx.payrollPaymentBatch.findFirst({
          where: { id: paymentBatchId, organizationId },
          select: {
            id: true,
            payrollBatchId: true,
            status: true,
            currency: true,
            employeeCount: true,
            totalAmount: true,
            items: {
              where: {
                id: { in: results.map((result) => result.paymentItemId) },
              },
              select: {
                id: true,
                employeeId: true,
                payrollRunId: true,
                status: true,
                amount: true,
              },
            },
          },
        });

        if (!paymentBatch) {
          throw new NotFoundException('Payroll payment batch not found.');
        }

        if (
          paymentBatch.status !== PayrollPaymentBatchStatus.SUBMITTED_TO_BANK &&
          paymentBatch.status !== PayrollPaymentBatchStatus.PARTIALLY_PAID
        ) {
          throw new BadRequestException(
            `Payment results require a SUBMITTED_TO_BANK or PARTIALLY_PAID payment batch. Current status is ${paymentBatch.status}.`,
          );
        }

        if (paymentBatch.items.length !== results.length) {
          throw new BadRequestException(
            'One or more payment items do not belong to this payment batch.',
          );
        }

        const itemById = new Map(
          paymentBatch.items.map((item) => [item.id, item]),
        );
        const now = new Date();

        for (const result of results) {
          const item = itemById.get(result.paymentItemId);

          if (!item) {
            throw new BadRequestException(
              `Payment item ${result.paymentItemId} does not belong to this payment batch.`,
            );
          }

          if (item.status !== PayrollPaymentItemStatus.SUBMITTED_TO_BANK) {
            throw new BadRequestException(
              `Payment item ${item.id} is ${item.status}; only SUBMITTED_TO_BANK items can receive a final bank outcome.`,
            );
          }

          const reason = result.reason?.trim() || null;
          const paymentReference = result.paymentReference?.trim() || null;

          const data =
            result.status === 'PAID'
              ? {
                  status: PayrollPaymentItemStatus.PAID,
                  paidAt: now,
                  paymentReference,
                  actualPaidAmount: item.amount,
                  reconciliationStatus:
                    PayrollPaymentReconciliationStatus.UNRESOLVED,
                  reconciliationDifference: null,
                  failedAt: null,
                  failureReason: null,
                  returnedAt: null,
                  returnReason: null,
                }
              : result.status === 'FAILED'
                ? {
                    status: PayrollPaymentItemStatus.FAILED,
                    paidAt: null,
                    paymentReference: null,
                    actualPaidAmount: 0,
                    reconciliationStatus:
                      PayrollPaymentReconciliationStatus.UNRESOLVED,
                    reconciliationDifference: null,
                    failedAt: now,
                    failureReason: reason,
                    returnedAt: null,
                    returnReason: null,
                  }
                : {
                    status: PayrollPaymentItemStatus.RETURNED,
                    paidAt: null,
                    paymentReference: null,
                    actualPaidAmount: 0,
                    reconciliationStatus:
                      PayrollPaymentReconciliationStatus.UNRESOLVED,
                    reconciliationDifference: null,
                    failedAt: null,
                    failureReason: null,
                    returnedAt: now,
                    returnReason: reason,
                  };

          const updated = await tx.payrollPaymentItem.updateMany({
            where: {
              id: item.id,
              organizationId,
              payrollPaymentBatchId: paymentBatchId,
              status: PayrollPaymentItemStatus.SUBMITTED_TO_BANK,
            },
            data,
          });

          if (updated.count !== 1) {
            throw new ConflictException(
              `Payment item ${item.id} changed before its result could be recorded.`,
            );
          }

          await this.auditService.log(
            {
              organizationId,
              action: 'PAYROLL_PAYMENT_ITEM_RESULT_RECORDED',
              entity: 'PayrollPaymentItem',
              entityId: item.id,
              actorUserId: actor.sub,
              actorEmail: actor.email,
              actorRole: actor.role,
              metadata: {
                payrollPaymentBatchId: paymentBatchId,
                payrollBatchId: paymentBatch.payrollBatchId,
                employeeId: item.employeeId,
                payrollRunId: item.payrollRunId,
                amount: item.amount,
                currency: paymentBatch.currency,
                result: result.status,
                paymentReference:
                  result.status === 'PAID' ? paymentReference : null,
                reason:
                  result.status === 'FAILED' || result.status === 'RETURNED'
                    ? reason
                    : null,
              },
            },
            tx,
          );
        }

        const allItems = await tx.payrollPaymentItem.findMany({
          where: {
            organizationId,
            payrollPaymentBatchId: paymentBatchId,
          },
          select: { status: true },
        });

        const paidCount = allItems.filter(
          (item) => item.status === PayrollPaymentItemStatus.PAID,
        ).length;
        const failedCount = allItems.filter(
          (item) => item.status === PayrollPaymentItemStatus.FAILED,
        ).length;
        const returnedCount = allItems.filter(
          (item) => item.status === PayrollPaymentItemStatus.RETURNED,
        ).length;
        const pendingCount = allItems.filter(
          (item) => item.status === PayrollPaymentItemStatus.SUBMITTED_TO_BANK,
        ).length;

        let nextBatchStatus: PayrollPaymentBatchStatus =
          PayrollPaymentBatchStatus.SUBMITTED_TO_BANK;

        if (pendingCount === 0 && paidCount === allItems.length) {
          nextBatchStatus = PayrollPaymentBatchStatus.PAID;
        } else if (
          pendingCount === 0 &&
          paidCount === 0 &&
          failedCount + returnedCount === allItems.length
        ) {
          nextBatchStatus = PayrollPaymentBatchStatus.FAILED;
        } else if (
          pendingCount === 0 &&
          paidCount > 0 &&
          failedCount + returnedCount > 0
        ) {
          nextBatchStatus = PayrollPaymentBatchStatus.PARTIALLY_PAID;
        }

        const batchData =
          nextBatchStatus === PayrollPaymentBatchStatus.PAID
            ? {
                status: nextBatchStatus,
                paidByUserId: actor.sub,
                paidAt: now,
                failedAt: null,
                failureReason: null,
              }
            : nextBatchStatus === PayrollPaymentBatchStatus.FAILED
              ? {
                  status: nextBatchStatus,
                  paidByUserId: null,
                  paidAt: null,
                  failedAt: now,
                  failureReason:
                    'All employee payment instructions failed or were returned.',
                }
              : {
                  status: nextBatchStatus,
                  paidByUserId: null,
                  paidAt: null,
                  failedAt: null,
                  failureReason: null,
                };

        await tx.payrollPaymentBatch.update({
          where: { id: paymentBatchId },
          data: batchData,
        });

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_STATUS_DERIVED',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: paymentBatch.payrollBatchId,
              status: nextBatchStatus,
              employeeCount: allItems.length,
              paidCount,
              failedCount,
              returnedCount,
              pendingCount,
            },
          },
          tx,
        );

        return {
          id: paymentBatch.id,
          payrollBatchId: paymentBatch.payrollBatchId,
          status: nextBatchStatus,
          summary: {
            employeeCount: allItems.length,
            paid: paidCount,
            failed: failedCount,
            returned: returnedCount,
            pending: pendingCount,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getReconciliation(organizationId: string, paymentBatchId: string) {
    const batch = await this.prisma.payrollPaymentBatch.findFirst({
      where: { id: paymentBatchId, organizationId },
      select: {
        id: true,
        payrollBatchId: true,
        status: true,
        currency: true,
        employeeCount: true,
        totalAmount: true,
        reconciliationStatus: true,
        reconciledByUserId: true,
        reconciledAt: true,
        reconciledExpectedAmount: true,
        reconciledActualAmount: true,
        reconciliationDifference: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            employeeId: true,
            payrollRunId: true,
            amount: true,
            actualPaidAmount: true,
            status: true,
            reconciliationStatus: true,
            reconciliationDifference: true,
            paymentReference: true,
            failureReason: true,
            returnReason: true,
            employee: {
              select: {
                employeeNumber: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Payroll payment batch not found.');
    }

    return {
      paymentBatchId: batch.id,
      payrollBatchId: batch.payrollBatchId,
      paymentStatus: batch.status,
      currency: batch.currency,
      employeeCount: batch.employeeCount,
      expectedAmount: batch.totalAmount,
      reconciliationStatus: batch.reconciliationStatus,
      reconciledByUserId: batch.reconciledByUserId,
      reconciledAt: batch.reconciledAt,
      reconciledExpectedAmount: batch.reconciledExpectedAmount,
      reconciledActualAmount: batch.reconciledActualAmount,
      difference: batch.reconciliationDifference,
      items: batch.items.map((item) => ({
        paymentItemId: item.id,
        employeeId: item.employeeId,
        employeeNumber: item.employee.employeeNumber,
        employeeName:
          `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        payrollRunId: item.payrollRunId,
        paymentStatus: item.status,
        expectedAmount: item.amount,
        actualPaidAmount: item.actualPaidAmount,
        difference: item.reconciliationDifference,
        reconciliationStatus: item.reconciliationStatus,
        paymentReference: item.paymentReference,
        failureReason: item.failureReason,
        returnReason: item.returnReason,
      })),
    };
  }

  async reconcile(
    organizationId: string,
    paymentBatchId: string,
    actor: TenantJwtUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.payrollPaymentBatch.findFirst({
          where: { id: paymentBatchId, organizationId },
          select: {
            id: true,
            payrollBatchId: true,
            status: true,
            currency: true,
            employeeCount: true,
            totalAmount: true,
            items: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                employeeId: true,
                payrollRunId: true,
                amount: true,
                status: true,
                actualPaidAmount: true,
              },
            },
          },
        });

        if (!batch) {
          throw new NotFoundException('Payroll payment batch not found.');
        }

        if (
          batch.status !== PayrollPaymentBatchStatus.PAID &&
          batch.status !== PayrollPaymentBatchStatus.PARTIALLY_PAID &&
          batch.status !== PayrollPaymentBatchStatus.FAILED
        ) {
          throw new BadRequestException(
            `Reconciliation requires a terminal payment batch. Current status is ${batch.status}.`,
          );
        }

        if (batch.items.length === 0) {
          throw new BadRequestException(
            'Payment batch has no employee payment items to reconcile.',
          );
        }

        const nonTerminalItem = batch.items.find(
          (item) =>
            item.status !== PayrollPaymentItemStatus.PAID &&
            item.status !== PayrollPaymentItemStatus.FAILED &&
            item.status !== PayrollPaymentItemStatus.RETURNED,
        );

        if (nonTerminalItem) {
          throw new ConflictException(
            `Payment item ${nonTerminalItem.id} is not in a terminal payment state and cannot be reconciled.`,
          );
        }

        const now = new Date();
        let actualTotalCents = 0;
        let differenceCount = 0;

        for (const item of batch.items) {
          const expectedCents = Math.round(item.amount * 100);
          const actualPaidAmount =
            item.actualPaidAmount ??
            (item.status === PayrollPaymentItemStatus.PAID ? item.amount : 0);
          const actualCents = Math.round(actualPaidAmount * 100);
          const differenceCents = actualCents - expectedCents;
          const reconciliationStatus =
            differenceCents === 0
              ? PayrollPaymentReconciliationStatus.MATCHED
              : PayrollPaymentReconciliationStatus.DIFFERENCE;

          actualTotalCents += actualCents;
          if (
            reconciliationStatus ===
            PayrollPaymentReconciliationStatus.DIFFERENCE
          ) {
            differenceCount += 1;
          }

          const itemUpdated = await tx.payrollPaymentItem.updateMany({
            where: {
              id: item.id,
              organizationId,
              payrollPaymentBatchId: paymentBatchId,
            },
            data: {
              actualPaidAmount: actualCents / 100,
              reconciliationStatus,
              reconciliationDifference: differenceCents / 100,
            },
          });

          if (itemUpdated.count !== 1) {
            throw new ConflictException(
              `Payment item ${item.id} changed before reconciliation could be completed.`,
            );
          }
        }

        const expectedTotalCents = Math.round(batch.totalAmount * 100);
        const batchDifferenceCents = actualTotalCents - expectedTotalCents;
        const reconciliationStatus =
          batchDifferenceCents === 0 && differenceCount === 0
            ? PayrollPaymentReconciliationStatus.MATCHED
            : PayrollPaymentReconciliationStatus.DIFFERENCE;

        const updated = await tx.payrollPaymentBatch.updateMany({
          where: {
            id: paymentBatchId,
            organizationId,
            status: {
              in: [
                PayrollPaymentBatchStatus.PAID,
                PayrollPaymentBatchStatus.PARTIALLY_PAID,
                PayrollPaymentBatchStatus.FAILED,
              ],
            },
          },
          data: {
            reconciliationStatus,
            reconciledByUserId: actor.sub,
            reconciledAt: now,
            reconciledExpectedAmount: expectedTotalCents / 100,
            reconciledActualAmount: actualTotalCents / 100,
            reconciliationDifference: batchDifferenceCents / 100,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Payment batch changed before reconciliation could be completed.',
          );
        }

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_RECONCILED',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: batch.payrollBatchId,
              paymentBatchStatus: batch.status,
              reconciliationStatus,
              employeeCount: batch.employeeCount,
              expectedAmount: expectedTotalCents / 100,
              actualPaidAmount: actualTotalCents / 100,
              difference: batchDifferenceCents / 100,
              differenceCount,
              currency: batch.currency,
            },
          },
          tx,
        );

        return {
          paymentBatchId: batch.id,
          payrollBatchId: batch.payrollBatchId,
          paymentStatus: batch.status,
          reconciliationStatus,
          currency: batch.currency,
          employeeCount: batch.employeeCount,
          expectedAmount: expectedTotalCents / 100,
          actualPaidAmount: actualTotalCents / 100,
          difference: batchDifferenceCents / 100,
          matchedCount: batch.items.length - differenceCount,
          differenceCount,
          reconciledByUserId: actor.sub,
          reconciledAt: now,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listExportAdapters() {
    return this.exportRegistry.list();
  }

  async validateExport(
    organizationId: string,
    paymentBatchId: string,
    adapterId: PayrollPaymentExportAdapterId,
  ) {
    const adapter = this.exportRegistry.get(adapterId);

    if (!adapter) {
      throw new BadRequestException(
        `Unknown payroll payment export adapter: ${adapterId}.`,
      );
    }

    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );
    const validation = adapter.validate(batch);

    return {
      paymentBatchId,
      adapter: adapter.descriptor,
      validation,
      summary: {
        employeeCount: batch.employeeCount,
        totalAmount: batch.totalAmount,
        currency: batch.currency,
        paymentDate: batch.paymentDate,
      },
    };
  }

  async generateExportFile(
    organizationId: string,
    paymentBatchId: string,
    adapterId: PayrollPaymentExportAdapterId,
    actor: TenantJwtUser,
  ) {
    const saved = await this.prisma.payrollPaymentBatch.findFirst({
      where: { id: paymentBatchId, organizationId },
      select: {
        status: true,
        exportAdapterId: true,
        exportFileBytes: true,
        exportContentType: true,
        exportFileName: true,
        exportReference: true,
        exportSha256: true,
      },
    });
    if (!saved) throw new NotFoundException('Payroll payment batch not found.');
    if (saved.status === 'CANCELLED')
      throw new ConflictException(
        'Cancelled payment batches cannot be downloaded.',
      );
    if (saved.exportFileBytes) {
      if (
        !saved.exportFileName ||
        !saved.exportContentType ||
        !saved.exportReference
      )
        throw new ConflictException('Stored export metadata is incomplete.');
      if (saved.exportAdapterId !== adapterId)
        throw new ConflictException(
          'This batch already has a frozen export in another format.',
        );
      const content = Buffer.from(saved.exportFileBytes);
      if (
        !saved.exportSha256 ||
        createHash('sha256').update(content).digest('hex') !==
          saved.exportSha256
      )
        throw new ConflictException('Stored export checksum is invalid.');
      await this.auditService.log({
        organizationId,
        entity: 'PayrollPaymentBatch',
        entityId: paymentBatchId,
        action: 'PAYROLL_PAYMENT_FILE_REDOWNLOADED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        metadata: {
          adapterId,
          exportReference: saved.exportReference,
          sha256: saved.exportSha256,
        },
      });
      return {
        fileName: saved.exportFileName!,
        contentType: saved.exportContentType!,
        content,
        exportReference: saved.exportReference!,
      };
    }
    if (saved.status === 'EXPORTED')
      throw new ConflictException(
        'Legacy exported batch has no saved file bytes. Recover its original file; regeneration is blocked.',
      );
    const adapter = this.exportRegistry.get(adapterId);

    if (!adapter) {
      throw new BadRequestException(
        `Unknown payroll payment export adapter: ${adapterId}.`,
      );
    }

    if (
      adapter.descriptor.status !== 'AVAILABLE' ||
      !adapter.descriptor.directlyBankImportable ||
      !adapter.generate
    ) {
      throw new BadRequestException(
        `${adapter.descriptor.displayName} is not available for file generation until its current import specification has been verified and implemented.`,
      );
    }

    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );
    if (!batch.funding || batch.funding.adapterId !== adapterId)
      throw new BadRequestException(
        'Production export must use the batch’s frozen funding adapter.',
      );
    const validation = adapter.validate(batch);

    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Payroll payment export validation failed.',
        adapter: adapter.descriptor.id,
        issues: validation.issues,
      });
    }

    const generated = adapter.generate(batch);
    const exportSha256 = createHash('sha256')
      .update(generated.content)
      .digest('hex');

    const currentBatch = await this.prisma.payrollPaymentBatch.findFirst({
      where: { id: paymentBatchId, organizationId },
      select: {
        status: true,
        exportReference: true,
        exportFileName: true,
      },
    });

    if (!currentBatch) {
      throw new NotFoundException('Payroll payment batch not found.');
    }

    if (currentBatch.status === PayrollPaymentBatchStatus.EXPORTED) {
      throw new ConflictException(
        'Another export completed concurrently. Retry the download to retrieve the frozen file.',
      );
    }

    if (currentBatch.status !== PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT) {
      throw new ConflictException(
        `Payment batch changed before export could be completed. Current status is ${currentBatch.status}.`,
      );
    }

    const exportReference = `EXP-${randomUUID()}`;
    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.payrollPaymentBatch.updateMany({
          where: {
            id: paymentBatchId,
            organizationId,
            status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
          },
          data: {
            status: PayrollPaymentBatchStatus.EXPORTED,
            exportedByUserId: actor.sub,
            exportedAt: now,
            exportReference,
            exportFileName: generated.fileName,
            exportAdapterId: adapterId,
            exportContentType: generated.contentType,
            exportSha256,
            exportFileBytes: new Uint8Array(generated.content),
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Payment batch is no longer APPROVED_FOR_EXPORT and cannot be exported.',
          );
        }

        await tx.payrollPaymentItem.updateMany({
          where: {
            organizationId,
            payrollPaymentBatchId: paymentBatchId,
            status: PayrollPaymentItemStatus.PREPARED,
          },
          data: {
            status: PayrollPaymentItemStatus.EXPORTED,
            exportedAt: now,
          },
        });

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_FILE_EXPORTED',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              adapterId: adapter.descriptor.id,
              exportReference,
              fileName: generated.fileName,
              employeeCount: batch.employeeCount,
              totalAmount: batch.totalAmount,
              currency: batch.currency,
            },
          },
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      fileName: generated.fileName,
      contentType: generated.contentType,
      content: generated.content,
      exportReference,
    };
  }

  async generateReport(
    organizationId: string,
    id: string,
    actor: TenantJwtUser,
  ) {
    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      id,
    );
    const adapter = this.exportRegistry.get('DELUXHR_GENERIC_CSV')!;
    const validation = adapter.validate(batch);
    if (!validation.valid)
      throw new BadRequestException({
        message: 'Report validation failed.',
        issues: validation.issues,
      });
    const file = adapter.generate!(batch);
    await this.auditService.log({
      organizationId,
      entity: 'PayrollPaymentBatch',
      entityId: id,
      action: 'PAYROLL_PAYMENT_REPORT_DOWNLOADED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: { notBankImportable: true },
    });
    return file;
  }
  async generateDraft(
    organizationId: string,
    id: string,
    adapterId: PayrollPaymentExportAdapterId,
    actor: TenantJwtUser,
  ) {
    const adapter = this.exportRegistry.get(adapterId);
    if (
      !adapter ||
      adapter.descriptor.status !== 'IMPLEMENTED_FOR_TESTING' ||
      !adapter.generate
    )
      throw new BadRequestException('No draft generator for this adapter.');
    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      id,
    );
    const validation = adapter.validate(batch);
    if (!validation.valid)
      throw new BadRequestException({
        message: 'Draft validation failed.',
        issues: validation.issues,
      });
    const file = adapter.generate(batch);
    await this.auditService.log({
      organizationId,
      entity: 'PayrollPaymentBatch',
      entityId: id,
      action: 'PAYROLL_BANK_DRAFT_GENERATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        adapterId,
        sha256: createHash('sha256').update(file.content).digest('hex'),
        notForBankUpload: true,
      },
    });
    return file;
  }
  private async loadApprovedPaymentBatchForExport(
    organizationId: string,
    paymentBatchId: string,
  ): Promise<PayrollPaymentExportBatch> {
    const paymentBatch = await this.prisma.payrollPaymentBatch.findFirst({
      where: { id: paymentBatchId, organizationId },
      select: {
        id: true,
        payrollBatchId: true,
        status: true,
        currency: true,
        employeeCount: true,
        totalAmount: true,
        fundingSnapshot: true,
        paymentDateSnapshot: true,
        payrollBatch: { select: { paymentDate: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            employeeId: true,
            payrollRunId: true,
            amount: true,
            currency: true,
            paymentDestinationSnapshot: true,
            employee: {
              select: {
                employeeNumber: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!paymentBatch) {
      throw new NotFoundException('Payroll payment batch not found.');
    }

    if (
      paymentBatch.status !== PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT &&
      paymentBatch.status !== PayrollPaymentBatchStatus.EXPORTED
    ) {
      throw new BadRequestException(
        `Export requires an APPROVED_FOR_EXPORT or EXPORTED payment batch. Current status is ${paymentBatch.status}.`,
      );
    }

    const instructions = paymentBatch.items.map((item) => {
      const snapshot =
        item.paymentDestinationSnapshot as PaymentDestinationSnapshot;

      if (
        !snapshot ||
        typeof snapshot.bankName !== 'string' ||
        typeof snapshot.accountHolderName !== 'string' ||
        typeof snapshot.accountNumber !== 'string'
      ) {
        throw new BadRequestException(
          `Payment item ${item.id} has an invalid payment destination snapshot.`,
        );
      }

      return {
        paymentItemId: item.id,
        payrollRunId: item.payrollRunId,
        employeeId: item.employeeId,
        employeeNumber: snapshot.employeeNumber ?? item.employee.employeeNumber,
        employeeName:
          snapshot.employeeName ??
          `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        amount: item.amount,
        currency: item.currency,
        bankName: snapshot.bankName,
        accountHolderName: snapshot.accountHolderName,
        accountNumber: snapshot.accountNumber,
        branchCode:
          typeof snapshot.branchCode === 'string' ? snapshot.branchCode : null,
        accountType:
          typeof snapshot.accountType === 'string'
            ? snapshot.accountType
            : null,
        paymentReference:
          snapshot.paymentReference ??
          this.buildPaymentReference(
            item.employee.employeeNumber,
            item.payrollRunId,
          ),
      };
    });

    return {
      paymentBatchId: paymentBatch.id,
      payrollBatchId: paymentBatch.payrollBatchId,
      currency: paymentBatch.currency,
      paymentDate:
        paymentBatch.paymentDateSnapshot ??
        paymentBatch.payrollBatch.paymentDate,
      funding:
        paymentBatch.fundingSnapshot as PayrollPaymentExportBatch['funding'],
      employeeCount: paymentBatch.employeeCount,
      totalAmount: paymentBatch.totalAmount,
      instructions,
    };
  }

  private buildPaymentReference(employeeNumber: string, payrollRunId: string) {
    const safeEmployeeNumber = employeeNumber
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 12);
    const suffix = payrollRunId.replace(/-/g, '').slice(0, 6).toUpperCase();

    return `SAL-${safeEmployeeNumber}-${suffix}`.slice(0, 30);
  }

  async list(organizationId: string) {
    return this.prisma.payrollPaymentBatch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        payrollBatchId: true,
        method: true,
        status: true,
        currency: true,
        employeeCount: true,
        totalAmount: true,
        preparedByUserId: true,
        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedAt: true,
        submittedToBankByUserId: true,
        submittedToBankAt: true,
        bankSubmissionReference: true,
        paidAt: true,
        failedAt: true,
        cancelledAt: true,
        reconciliationStatus: true,
        reconciledAt: true,
        reconciledExpectedAmount: true,
        reconciledActualAmount: true,
        reconciliationDifference: true,
        createdAt: true,
        payrollBatch: {
          select: {
            title: true,
            payPeriodStart: true,
            payPeriodEnd: true,
            paymentDate: true,
          },
        },
      },
    });
  }

  async findOne(organizationId: string, paymentBatchId: string) {
    const batch = await this.prisma.payrollPaymentBatch.findFirst({
      where: { id: paymentBatchId, organizationId },
      select: {
        id: true,
        payrollBatchId: true,
        method: true,
        status: true,
        currency: true,
        employeeCount: true,
        totalAmount: true,
        preparedByUserId: true,
        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedByUserId: true,
        exportedAt: true,
        exportReference: true,
        exportFileName: true,
        exportAdapterId: true,
        exportSha256: true,
        fundingProfileId: true,
        fundingSnapshot: true,
        paymentDateSnapshot: true,
        submittedToBankByUserId: true,
        submittedToBankAt: true,
        bankSubmissionReference: true,
        paidByUserId: true,
        paidAt: true,
        failedAt: true,
        failureReason: true,
        cancelledByUserId: true,
        cancelledAt: true,
        cancellationReason: true,
        reconciliationStatus: true,
        reconciledByUserId: true,
        reconciledAt: true,
        reconciledExpectedAmount: true,
        reconciledActualAmount: true,
        reconciliationDifference: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        payrollBatch: {
          select: {
            title: true,
            payPeriodStart: true,
            payPeriodEnd: true,
            paymentDate: true,
            lockedAt: true,
          },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            employeeId: true,
            payrollRunId: true,
            employeePaymentDetailId: true,
            paymentDestinationSnapshot: true,
            amount: true,
            currency: true,
            status: true,
            exportedAt: true,
            submittedToBankAt: true,
            paidAt: true,
            paymentReference: true,
            failedAt: true,
            failureReason: true,
            returnedAt: true,
            returnReason: true,
            actualPaidAmount: true,
            reconciliationStatus: true,
            reconciliationDifference: true,
            createdAt: true,
            employee: {
              select: {
                employeeNumber: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Payroll payment batch not found.');
    }

    const { fundingSnapshot, items, ...safe } = batch;
    const f = fundingSnapshot as PayrollPaymentExportBatch['funding'];
    return {
      ...safe,
      items: items.map(({ paymentDestinationSnapshot, ...item }) => {
        const dest = paymentDestinationSnapshot as PaymentDestinationSnapshot;
        return {
          ...item,
          frozenEmployeeName: dest.employeeName ?? null,
          beneficiary: {
            accountNumberMasked:
              typeof dest.accountNumber === 'string'
                ? `••••${dest.accountNumber.slice(-4)}`
                : null,
            accountHolderName: dest.accountHolderName ?? null,
            branchCode: dest.branchCode ?? null,
            accountType: dest.accountType ?? null,
            paymentReference: dest.paymentReference ?? null,
          },
        };
      }),
      funding: f
        ? {
            profileId: f.profileId,
            name: f.name,
            bank: f.bank,
            adapterId: f.adapterId,
            adapterVersion: f.adapterVersion,
            accountNumberMasked: `••••${f.accountNumber.slice(-4)}`,
          }
        : null,
    };
  }
}
