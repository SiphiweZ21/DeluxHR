import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollLedgerCategory,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { AdjustmentDto, PaymentDto } from './payroll-liabilities.dto';
const posted = [
  PayrollRunStatus.LOCKED,
  PayrollRunStatus.PAYMENT_PROCESSING,
  PayrollRunStatus.PAID,
];
const included: PayrollLedgerCategory[] = [
  PayrollLedgerCategory.STATUTORY_DEDUCTION,
  PayrollLedgerCategory.BENEFIT_DEDUCTION,
  PayrollLedgerCategory.OTHER_DEDUCTION,
  PayrollLedgerCategory.EMPLOYER_CONTRIBUTION,
  PayrollLedgerCategory.EMPLOYER_STATUTORY,
];
export const cents = (amount: number) => {
  if (!Number.isFinite(amount) || amount < 0)
    throw new BadRequestException('Invalid nonnegative ledger amount');
  return Math.round((amount + Number.EPSILON) * 100);
};
export const periodBounds = (period: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new BadRequestException('Period must be YYYY-MM');
  const [year, month] = period.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
};
export type Row = {
  reservedCents: number;
  availableCents: number;
  code: string;
  creditorName: string;
  category: string;
  effect: string;
  amountCents: number;
  adjustmentCents: number;
  paidCents: number;
  pendingCents: number;
  outstandingCents: number;
  status: string;
};
const key = (code: string, creditorName: string) =>
  JSON.stringify([code, creditorName]);
const money = (n: number) => Number((n / 100).toFixed(2));
const safeCsv = (value: unknown) => {
  const s = String(value ?? '');
  const safe =
    !/^-?\d+(\.\d+)?$/.test(s) && /^[\s]*[=+@\-\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
@Injectable()
export class PayrollLiabilitiesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private concurrent(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2002'].includes(e.code)
    )
      throw new ConflictException(
        'Remittance reference or balance changed. Refresh before retrying.',
      );
    throw e;
  }
  private async log(
    actor: TenantJwtUser,
    entityId: string,
    action: string,
    reason?: string,
    tx?: Prisma.TransactionClient,
  ) {
    await this.audit.log(
      {
        organizationId: actor.organizationId,
        action: `PAYROLL_REMITTANCE_${action}`,
        entity: 'PayrollRemittance',
        entityId,
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        reason,
      },
      tx,
    );
  }
  private async source(
    org: string,
    period: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const payPeriodEnd = periodBounds(period);
    const runs = await db.payrollRun.findMany({
      where: { organizationId: org, payPeriodEnd, status: { in: posted } },
      select: {
        id: true,
        employeeId: true,
        status: true,
        currency: true,
        taxAmount: true,
        uifEmployee: true,
        uifEmployer: true,
        sdlEmployer: true,
        grossEarnings: true,
        netPay: true,
        totalEmployerCost: true,
        ledgerEntries: {
          select: {
            code: true,
            category: true,
            effect: true,
            creditorName: true,
            amount: true,
            currency: true,
          },
        },
      },
    });
    if (
      runs.some(
        (r) =>
          r.currency !== 'ZAR' ||
          r.ledgerEntries.some((e) => e.currency !== 'ZAR'),
      )
    )
      throw new BadRequestException(
        'Mixed or non-ZAR payroll requires a separate currency register',
      );
    return runs;
  }
  async register(
    actor: TenantJwtUser,
    period: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const runs = await this.source(actor.organizationId, period, db);
    const adjustments = await db.payrollLiabilityAdjustment.findMany({
      where: { organizationId: actor.organizationId, period },
      orderBy: { createdAt: 'asc' },
    });
    const payments = await db.payrollRemittancePayment.findMany({
      where: { organizationId: actor.organizationId, period },
      orderBy: { createdAt: 'asc' },
    });
    const reservations = await db.remittanceBatchAllocation.findMany({
      where: {
        batch: {
          organizationId: actor.organizationId,
          period,
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
      },
      select: { code: true, creditorName: true, amountCents: true },
    });
    const map = new Map<string, Row>();
    for (const run of runs)
      for (const entry of run.ledgerEntries) {
        if (
          !included.includes(entry.category) ||
          !['EMPLOYEE_DEDUCTION', 'EMPLOYER_LIABILITY'].includes(
            entry.effect,
          ) ||
          entry.code === 'EARLY_PAY_RECOVERY'
        )
          continue;
        const creditorName = entry.creditorName || 'UNASSIGNED';
        const id = key(entry.code, creditorName);
        const row = map.get(id) ?? {
          code: entry.code,
          creditorName,
          category: entry.category,
          effect: entry.effect,
          reservedCents: 0,
          availableCents: 0,
          amountCents: 0,
          adjustmentCents: 0,
          paidCents: 0,
          pendingCents: 0,
          outstandingCents: 0,
          status: 'UNPAID',
        };
        row.amountCents += cents(entry.amount);
        map.set(id, row);
      }
    // Authority assessments are employer costs, not employee deductions or tax calculations.
    const assessments = await db.companyOnboardingDocument.findMany({
      where: {
        organizationId: actor.organizationId,
        status: 'VERIFIED',
        liabilityPeriod: period,
        category: { in: ['COIDA_ASSESSMENT', 'PSIRA_FEE_ASSESSMENT'] },
      },
      select: { category: true, assessmentAmount: true },
    });
    for (const assessment of assessments) {
      const code =
        assessment.category === 'COIDA_ASSESSMENT'
          ? 'COIDA_ASSESSMENT'
          : 'PSIRA_FEES';
      const creditorName =
        code === 'COIDA_ASSESSMENT' ? 'Compensation Fund' : 'PSiRA';
      const id = key(code, creditorName);
      const row = map.get(id) ?? {
        code,
        creditorName,
        category: 'AUTHORITY_ASSESSMENT',
        effect: 'EMPLOYER_LIABILITY',
        reservedCents: 0,
        availableCents: 0,
        amountCents: 0,
        adjustmentCents: 0,
        paidCents: 0,
        pendingCents: 0,
        outstandingCents: 0,
        status: 'UNPAID',
      };
      if (assessment.assessmentAmount == null)
        throw new BadRequestException('Verified assessment has no amount.');
      row.amountCents += cents(Number(assessment.assessmentAmount));
      map.set(id, row);
    }
    for (const adjustment of adjustments) {
      const row = map.get(key(adjustment.code, adjustment.creditorName));
      if (row) row.adjustmentCents += adjustment.amountCents;
    }
    for (const payment of payments) {
      const row = map.get(key(payment.code, payment.creditorName));
      if (row && payment.status === 'CONFIRMED')
        row.paidCents += payment.amountCents;
      if (row && payment.status === 'RECORDED')
        row.pendingCents += payment.amountCents;
    }
    const rows = [...map.values()].sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        a.creditorName.localeCompare(b.creditorName),
    );
    for (const row of rows) {
      row.outstandingCents =
        row.amountCents + row.adjustmentCents - row.paidCents;
      row.reservedCents = reservations
        .filter(
          (v) => v.code === row.code && v.creditorName === row.creditorName,
        )
        .reduce((n, v) => n + v.amountCents, 0);
      row.availableCents = Math.max(
        0,
        row.outstandingCents - row.pendingCents - row.reservedCents,
      );
      row.status =
        row.outstandingCents < 0
          ? 'OVERPAID'
          : row.outstandingCents === 0
            ? 'PAID'
            : row.paidCents > 0
              ? 'PARTIALLY_PAID'
              : row.pendingCents
                ? 'PAYMENT_RECORDED'
                : 'UNPAID';
    }
    const total = (pick: (r: Row) => number) =>
      rows.reduce((n, r) => n + pick(r), 0);
    const codeTotal = (code: string) =>
      rows
        .filter((r) => r.code === code)
        .reduce((n, r) => n + r.amountCents + r.adjustmentCents, 0);
    return {
      period,
      currency: 'ZAR',
      runCount: runs.length,
      payrollTotals: {
        grossEarningsCents: runs.reduce(
          (n, r) => n + cents(r.grossEarnings),
          0,
        ),
        netPayCents: runs.reduce((n, r) => n + cents(r.netPay), 0),
        employerCostCents: runs.reduce(
          (n, r) => n + cents(r.totalEmployerCost),
          0,
        ),
      },
      rows,
      totals: {
        reservedCents: total((r) => r.reservedCents),
        availableCents: total((r) => r.availableCents),
        baseCents: total((r) => r.amountCents),
        adjustmentCents: total((r) => r.adjustmentCents),
        paidCents: total((r) => r.paidCents),
        pendingCents: total((r) => r.pendingCents),
        outstandingCents: total((r) => r.outstandingCents),
      },
      statutory: {
        payeCents: codeTotal('PAYE'),
        uifEmployeeCents: codeTotal('UIF_EMPLOYEE'),
        uifEmployerCents: codeTotal('UIF_EMPLOYER'),
        uifTotalCents: codeTotal('UIF_EMPLOYEE') + codeTotal('UIF_EMPLOYER'),
        sdlCents: codeTotal('SDL_EMPLOYER'),
      },
      employeeDeductionsCents: rows
        .filter((r) => r.effect === 'EMPLOYEE_DEDUCTION')
        .reduce((n, r) => n + r.amountCents + r.adjustmentCents, 0),
      employerContributionsCents: rows
        .filter((r) => r.effect === 'EMPLOYER_LIABILITY')
        .reduce((n, r) => n + r.amountCents + r.adjustmentCents, 0),
      adjustments,
      payments,
    };
  }
  private async bucket(
    actor: TenantJwtUser,
    period: string,
    code: string,
    creditorName: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const report = await this.register(actor, period, tx);
    const row = report.rows.find(
      (r) => r.code === code && r.creditorName === creditorName,
    );
    if (!row)
      throw new BadRequestException(
        'Liability bucket is absent from locked payroll ledger',
      );
    return row;
  }
  async adjustment(actor: TenantJwtUser, dto: AdjustmentDto) {
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681033)`;
          const row = await this.bucket(
            actor,
            dto.period,
            dto.code,
            dto.creditorName,
            tx,
          );
          if (
            !dto.amountCents ||
            row.amountCents + row.adjustmentCents + dto.amountCents < 0 ||
            row.outstandingCents + dto.amountCents <
              row.pendingCents + row.reservedCents
          )
            throw new BadRequestException(
              'Adjustment would conflict with paid, pending or reserved liabilities.',
            );
          const item = await tx.payrollLiabilityAdjustment.create({
            data: {
              organizationId: actor.organizationId,
              ...dto,
              reason: dto.reason.trim(),
              createdByUserId: actor.sub,
            },
          });
          await this.log(actor, item.id, 'ADJUSTED', dto.reason, tx);
          return item;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      )
      .catch((e) => this.concurrent(e));
  }
  async payment(actor: TenantJwtUser, dto: PaymentDto) {
    if (
      !Number.isFinite(new Date(dto.paidAt).getTime()) ||
      new Date(dto.paidAt) > new Date()
    )
      throw new BadRequestException('Payment date cannot be in the future');
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681033)`;
          const row = await this.bucket(
            actor,
            dto.period,
            dto.code,
            dto.creditorName,
            tx,
          );
          if (
            !Number.isInteger(dto.amountCents) ||
            dto.amountCents <= 0 ||
            dto.amountCents > row.availableCents
          )
            throw new BadRequestException(
              'Payment exceeds the unreserved available liability.',
            );
          const reference = dto.reference
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase();
          if (
            await tx.remittancePaymentBatch.findFirst({
              where: {
                organizationId: actor.organizationId,
                resultReference: reference,
              },
            })
          )
            throw new ConflictException(
              'Bank reference is already recorded by a remittance batch.',
            );
          if (
            await tx.payrollRemittancePayment.findFirst({
              where: {
                organizationId: actor.organizationId,
                reference: { equals: reference, mode: 'insensitive' },
                status: { not: 'VOIDED' },
              },
            })
          )
            throw new ConflictException('Payment reference already exists.');
          const item = await tx.payrollRemittancePayment.create({
            data: {
              organizationId: actor.organizationId,
              period: dto.period,
              code: dto.code,
              creditorName: dto.creditorName,
              amountCents: dto.amountCents,
              reference,
              paidAt: new Date(dto.paidAt),
              createdByUserId: actor.sub,
            },
          });
          await this.log(actor, item.id, 'RECORDED', undefined, tx);
          return item;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      )
      .catch((e) => this.concurrent(e));
  }
  async decide(
    actor: TenantJwtUser,
    id: string,
    status: string,
    reason?: string,
  ) {
    if (!['CONFIRMED', 'VOIDED'].includes(status))
      throw new BadRequestException('Invalid payment decision.');
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681033)`;
          const item = await tx.payrollRemittancePayment.findFirst({
            where: { id, organizationId: actor.organizationId },
          });
          if (!item)
            throw new NotFoundException('Remittance payment not found');
          if (item.status !== 'RECORDED')
            throw new ConflictException('Payment has already been decided');
          if (item.createdByUserId === actor.sub)
            throw new BadRequestException(
              'A different user must confirm or void a payment record.',
            );
          if (!reason || reason.trim().length < 8)
            throw new BadRequestException(
              'Decision reason of at least 8 characters is required',
            );
          if (status === 'CONFIRMED') {
            const row = await this.bucket(
              actor,
              item.period,
              item.code,
              item.creditorName,
              tx,
            );
            if (item.amountCents > row.outstandingCents - row.reservedCents)
              throw new BadRequestException(
                'Confirmation conflicts with reserved liability.',
              );
          }
          const changed = await tx.payrollRemittancePayment.updateMany({
            where: {
              id,
              organizationId: actor.organizationId,
              status: 'RECORDED',
            },
            data:
              status === 'CONFIRMED'
                ? {
                    status,
                    confirmedByUserId: actor.sub,
                    confirmedAt: new Date(),
                  }
                : {
                    status,
                    voidedByUserId: actor.sub,
                    voidedAt: new Date(),
                    voidReason: reason.trim(),
                  },
          });
          if (!changed.count)
            throw new ConflictException('Payment has already been decided');
          await this.log(actor, id, status, reason, tx);
          return tx.payrollRemittancePayment.findUniqueOrThrow({
            where: { id },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      )
      .catch((e) => this.concurrent(e));
  }
  async reconciliation(actor: TenantJwtUser, period: string) {
    const [runs, report] = await Promise.all([
      this.source(actor.organizationId, period),
      this.register(actor, period),
    ]);
    const fields: [string, string][] = [
      ['PAYE', 'taxAmount'],
      ['UIF_EMPLOYEE', 'uifEmployee'],
      ['UIF_EMPLOYER', 'uifEmployer'],
      ['SDL_EMPLOYER', 'sdlEmployer'],
    ];
    const differences = runs.flatMap((run) =>
      fields
        .map(([code, field]) => {
          const expectedCents = cents(Number(run[field as keyof typeof run]));
          const ledgerCents = run.ledgerEntries
            .filter((e) => e.code === code)
            .reduce((n, e) => n + cents(e.amount), 0);
          return {
            payrollRunId: run.id,
            code,
            expectedCents,
            ledgerCents,
            differenceCents: ledgerCents - expectedCents,
          };
        })
        .filter((r) => r.differenceCents !== 0),
    );
    return {
      period,
      checkedRuns: runs.length,
      differences,
      balanced:
        differences.length === 0 &&
        report.rows.every((r) => r.outstandingCents === 0),
      unpaidCents: report.totals.outstandingCents,
      recordedUnconfirmedCents: report.totals.pendingCents,
    };
  }
  async csv(actor: TenantJwtUser, period: string) {
    const report = await this.register(actor, period);
    const lines = [
      [
        'Period',
        'Code',
        'Creditor',
        'Category',
        'Effect',
        'Base ZAR',
        'Adjustment ZAR',
        'Confirmed Paid ZAR',
        'Outstanding ZAR',
        'Status',
      ]
        .map(safeCsv)
        .join(','),
    ];
    for (const r of report.rows)
      lines.push(
        [
          period,
          r.code,
          r.creditorName,
          r.category,
          r.effect,
          money(r.amountCents).toFixed(2),
          money(r.adjustmentCents).toFixed(2),
          money(r.paidCents).toFixed(2),
          money(r.outstandingCents).toFixed(2),
          r.status,
        ]
          .map(safeCsv)
          .join(','),
      );
    await this.log(actor, period, 'EXPORTED');
    return lines.join('\r\n') + '\r\n';
  }
  async history(actor: TenantJwtUser, period: string) {
    periodBounds(period);
    return this.db.auditLog.findMany({
      where: {
        organizationId: actor.organizationId,
        entity: 'PayrollRemittance',
        action: { startsWith: 'PAYROLL_REMITTANCE_' },
        OR: [
          { entityId: period },
          {
            entityId: {
              in: (
                await Promise.all([
                  this.db.payrollRemittancePayment.findMany({
                    where: { organizationId: actor.organizationId, period },
                    select: { id: true },
                  }),
                  this.db.payrollLiabilityAdjustment.findMany({
                    where: { organizationId: actor.organizationId, period },
                    select: { id: true },
                  }),
                ])
              )
                .flat()
                .map((v) => v.id),
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}
