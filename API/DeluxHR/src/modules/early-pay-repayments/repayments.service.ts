import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/access/access-control.service';
import { comparePassword } from '../../common/auth/password';
import type {
  PlatformJwtUser,
  TenantJwtUser,
} from '../../common/auth/jwt-user.type';
import { periodBounds } from '../payroll-liabilities/payroll-liabilities.service';
import { FnbBankservDraftAdapter } from '../payroll-payments/export/fnb-bankserv-draft.adapter';
import type { BankPaymentDraftBatch } from '../payroll-payments/export/payment-export.types';
import {
  PrepareRepaymentDto,
  RepaymentActionDto,
  RepaymentDestinationDto,
  SubmitRepaymentDto,
  RecordRepaymentReceiptDto,
  DecideRepaymentReceiptDto,
} from './repayments.dto';
type Tx = Prisma.TransactionClient;
type Batch = Prisma.EarlyPayRepaymentBatchGetPayload<{
  include: { items: true; receipts: true };
}>;
type Actor = TenantJwtUser | PlatformJwtUser;
@Injectable()
export class EarlyPayRepaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
  ) {}
  cents(value: number) {
    const n = Math.round(value * 100);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      Math.abs(value * 100 - n) > 0.00001 ||
      !Number.isSafeInteger(n) ||
      n > 2147483647
    )
      throw new BadRequestException(
        'ZAR amounts must have at most two decimal places and fit the supported limit.',
      );
    return n;
  }
  private reason(v: string) {
    if (typeof v !== 'string' || v.trim().length < 3 || v.length > 500)
      throw new BadRequestException(
        'A reason of 3–500 characters is required.',
      );
    return v.trim();
  }
  private platform(a: Actor) {
    if (
      a.organizationId !== null ||
      !['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(a.role)
    )
      throw new ForbiddenException(
        'An independent platform account is required.',
      );
  }
  private mask(p: Prisma.JsonValue) {
    const { accountNumber, ...rest } = p as Record<string, unknown>;
    return {
      ...rest,
      accountNumberMasked: `••••${String(accountNumber).slice(-4)}`,
    };
  }
  private safe(b: Batch) {
    const { fundingSnapshot, destinationSnapshot, receipts, ...rest } = b;
    const confirmedCents = receipts
        .filter((r) => r.status === 'CONFIRMED')
        .reduce((n, r) => n + r.amountCents, 0),
      pendingCents = receipts
        .filter((r) => r.status === 'RECORDED')
        .reduce((n, r) => n + r.amountCents, 0);
    return {
      ...rest,
      funding: this.mask(fundingSnapshot),
      destination: this.mask(destinationSnapshot),
      receipts,
      confirmedCents,
      pendingCents,
      outstandingCents: b.totalCents - confirmedCents,
      bankImportReady: false,
    };
  }
  private async audit(
    tx: Tx,
    a: Actor,
    id: string,
    action: string,
    reason: string,
    org?: string,
  ) {
    const text = this.reason(reason);
    if (a.organizationId)
      await tx.auditLog.create({
        data: {
          organizationId: a.organizationId,
          actorUserId: a.sub,
          actorEmail: a.email,
          actorRole: a.role,
          entity: 'EarlyPayRepayment',
          entityId: id,
          action: `EARLY_PAY_REPAYMENT_${action}`,
          reason: text,
        },
      });
    else {
      await tx.platformAuditEvent.create({
        data: {
          actorUserId: a.sub,
          entity: 'EarlyPayRepayment',
          entityId: id,
          organizationId: org,
          action: `EARLY_PAY_REPAYMENT_${action}`,
          reason: text,
        },
      });
      if (org)
        await tx.auditLog.create({
          data: {
            organizationId: org,
            actorUserId: a.sub,
            entity: 'EarlyPayRepayment',
            entityId: id,
            action: `EARLY_PAY_REPAYMENT_${action}`,
            reason: text,
          },
        });
    }
  }
  private async mutation<T>(
    a: Actor,
    p: Permission | null,
    run: (tx: Tx, hash: string) => Promise<T>,
  ) {
    if (p && !a.organizationId)
      throw new ForbiddenException('Tenant access required.');
    if (!p) this.platform(a);
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681032)`;
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${a.sub} FOR UPDATE`;
          const u = await tx.user.findUnique({ where: { id: a.sub } });
          if (
            !u?.isActive ||
            u.organizationId !== a.organizationId ||
            u.role !== a.role
          )
            throw new ForbiddenException('Current account access is required.');
          if (p) {
            const org = await tx.organization.findUnique({
              where: { id: a.organizationId! },
            });
            if (org?.status !== 'ACTIVE')
              throw new ForbiddenException('Active company access required.');
            const grants = await this.access.getEffectivePermissions(
              a as TenantJwtUser,
            );
            if (
              !grants.some(
                (g) => g.permission === p && g.scope === 'ORGANIZATION',
              )
            )
              throw new ForbiddenException(
                'Organization-scoped permission required.',
              );
            await this.payrollEnabled(tx, a.organizationId!);
          }
          return run(tx, u.passwordHash);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      )
      .catch((e: unknown) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(e.code)
        )
          throw new ConflictException(
            'Repayment data or reference changed concurrently. Refresh and retry; no bank payment was sent.',
          );
        throw e;
      });
  }
  private async password(hash: string, v: string) {
    if (typeof v !== 'string' || !(await comparePassword(v, hash)))
      throw new BadRequestException('Password verification failed.');
  }
  private async payrollEnabled(tx: Tx, org: string) {
    const [feature, subscription] = await Promise.all([
      tx.organizationFeature.findUnique({
        where: {
          organizationId_feature: { organizationId: org, feature: 'PAYROLL' },
        },
      }),
      tx.platformSubscription.findUnique({
        where: { organizationId: org },
        include: { package: true },
      }),
    ]);
    if (
      !feature?.enabled ||
      (subscription &&
        (subscription.status !== 'ACTIVE' ||
          (subscription.endsAt && subscription.endsAt <= new Date()) ||
          !subscription.package.features.includes('PAYROLL')))
    )
      throw new ForbiddenException(
        'Payroll must be available for this company.',
      );
  }
  private async batch(tx: Tx, id: string, org?: string) {
    const b = await tx.earlyPayRepaymentBatch.findFirst({
      where: { id, ...(org ? { organizationId: org } : {}) },
      include: { items: true, receipts: true },
    });
    if (!b) throw new NotFoundException('Repayment batch not found.');
    return b;
  }
  private async sources(tx: Tx, org: string, period: string) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
      throw new BadRequestException('Period must be YYYY-MM in 2000–2099.');
    const entries = await tx.payrollLedgerEntry.findMany({
      where: {
        organizationId: org,
        code: 'EARLY_PAY_RECOVERY',
        category: 'EARLY_PAY_RECOVERY',
        effect: 'EMPLOYEE_DEDUCTION',
        payrollRun: {
          organizationId: org,
          status: 'PAID',
          payPeriodEnd: periodBounds(period),
        },
      },
      take: 1001,
      orderBy: { createdAt: 'asc' },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        payrollRun: {
          select: { id: true, status: true, currency: true, employeeId: true },
        },
        repaymentItems: {
          where: { cancelled: false },
          select: { batchId: true },
        },
      },
    });
    if (entries.length > 1000)
      throw new BadRequestException(
        'This period exceeds 1000 recovery entries; pagination must be added before batching this period.',
      );
    const ids = entries.map((e) => e.sourceId).filter((x): x is string => !!x);
    const requests = await tx.earlyPayRequest.findMany({
      where: { id: { in: ids }, organizationId: org },
      include: {
        treasuryItems: {
          where: { status: 'PAID' },
          select: { id: true, amountCents: true },
        },
      },
    });
    const allocated = await tx.earlyPayRepaymentItem.findMany({
      where: { activeRequestId: { in: ids } },
      select: { activeRequestId: true, batchId: true },
    });
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.sourceId) counts.set(e.sourceId, (counts.get(e.sourceId) ?? 0) + 1);
    }
    return entries.map((e) => {
      const r = requests.find((r) => r.id === e.sourceId);
      let block: string | null = null;
      let amountCents = 0,
        principalCents = 0,
        feeCents = 0;
      try {
        amountCents = this.cents(e.amount);
        if (!amountCents) block = 'Recovery amount is zero.';
      } catch {
        block = 'Invalid recovery amount.';
      }
      if (e.currency !== 'ZAR' || e.payrollRun.currency !== 'ZAR')
        block = 'Only ZAR recoveries are supported.';
      if (
        e.sourceType !== 'EARLY_PAY_REQUEST' ||
        !r ||
        r.employeeId !== e.employeeId ||
        e.payrollRun.employeeId !== e.employeeId
      )
        block = 'Recovery does not match an Early Pay request and employee.';
      else {
        if (
          !['PAID', 'RECOVERED'].includes(r.status) ||
          r.treasuryItems.length !== 1 ||
          r.paymentReference?.startsWith('SIM-')
        )
          block =
            'Confirmed platform payout required; simulated or unconfirmed requests are excluded.';
        if (r.status === 'RECOVERED' && r.payrollRunId !== e.payrollRunId)
          block = 'Request recovery belongs to another payroll run.';
        try {
          principalCents = this.cents(r.requestedAmount);
          feeCents = this.cents(r.serviceFee + r.transferFee + r.instantFee);
          if (
            principalCents <= 0 ||
            this.cents(r.netDisbursement) !== principalCents ||
            (r.treasuryItems.length === 1 &&
              r.treasuryItems[0].amountCents !== principalCents)
          )
            block =
              'Frozen confirmed payout and recovery principal do not reconcile.';
          if (
            amountCents !== this.cents(r.totalPayrollRecovery) ||
            amountCents !== principalCents + feeCents
          )
            block =
              'Ledger recovery and approved principal/fees do not reconcile.';
        } catch {
          block = 'Request recovery amounts are invalid.';
        }
        if ((counts.get(r.id) ?? 0) > 1)
          block = 'Duplicate request recovery in this period.';
      }
      const allocation =
        e.repaymentItems[0]?.batchId ??
        allocated.find((i) => i.activeRequestId === e.sourceId)?.batchId;
      if (allocation) block = 'Recovery already included in a repayment batch.';
      return {
        ledgerEntryId: e.id,
        requestId: e.sourceId,
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        payrollRunId: e.payrollRunId,
        amountCents,
        principalCents,
        feeCents,
        eligible: !block,
        reason: block,
        allocatedBatchId: allocation ?? null,
      };
    });
  }
  async register(a: TenantJwtUser, period: string) {
    const [rows, profiles, config, batches] = await Promise.all([
      this.sources(this.db, a.organizationId, period),
      this.db.companyBankingProfile.findMany({
        where: { organizationId: a.organizationId, status: 'APPROVED' },
        select: {
          id: true,
          name: true,
          bank: true,
          accountNumber: true,
          adapterId: true,
        },
      }),
      this.db.earlyPayRepaymentDestination.findUnique({
        where: { id: 'DEFAULT' },
        include: { account: true },
      }),
      this.db.earlyPayRepaymentBatch.findMany({
        where: { organizationId: a.organizationId, period },
        include: { items: true, receipts: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      period,
      rows,
      availableCents: rows
        .filter((r) => r.eligible)
        .reduce((n, r) => n + r.amountCents, 0),
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        bank: p.bank,
        adapterId: p.adapterId,
        accountNumberMasked: `••••${p.accountNumber.slice(-4)}`,
      })),
      destination:
        config?.account.status === 'APPROVED'
          ? {
              id: config.account.id,
              name: config.account.name,
              accountHolder: config.account.accountHolder,
              bank: config.account.bank,
              accountNumberMasked: `••••${config.account.accountNumber.slice(-4)}`,
            }
          : null,
      batches: batches.map((b) => this.safe(b)),
      bankImportReady: false,
    };
  }
  async detail(a: TenantJwtUser, id: string) {
    return this.safe(await this.batch(this.db, id, a.organizationId));
  }
  async platformWorkspace(a: PlatformJwtUser) {
    this.platform(a);
    const [accounts, config, batches] = await Promise.all([
      this.db.platformFundingAccount.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, name: true, bank: true, accountNumber: true },
      }),
      this.db.earlyPayRepaymentDestination.findUnique({
        where: { id: 'DEFAULT' },
      }),
      this.db.earlyPayRepaymentBatch.findMany({
        include: {
          items: true,
          receipts: true,
          organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      accounts: accounts.map((p) => ({
        id: p.id,
        name: p.name,
        bank: p.bank,
        accountNumberMasked: `••••${p.accountNumber.slice(-4)}`,
      })),
      destinationAccountId: config?.accountId ?? null,
      batches: batches.map((b) => ({
        ...this.safe(b),
        organizationName: b.organization.name,
      })),
    };
  }
  async destination(a: PlatformJwtUser, d: RepaymentDestinationDto) {
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await tx.platformFundingAccount.findUnique({
        where: { id: d.accountId },
      });
      if (p?.status !== 'APPROVED')
        throw new BadRequestException(
          'Select an independently approved platform receiving account.',
        );
      const prior = await tx.earlyPayRepaymentDestination.findUnique({
        where: { id: 'DEFAULT' },
      });
      const result = await tx.earlyPayRepaymentDestination.upsert({
        where: { id: 'DEFAULT' },
        create: { id: 'DEFAULT', accountId: p.id, updatedBy: a.sub },
        update: { accountId: p.id, updatedBy: a.sub },
      });
      await this.audit(tx, a, p.id, 'DESTINATION_CONFIGURED', d.reason);
      if (prior)
        await this.audit(
          tx,
          a,
          prior.accountId,
          'PREVIOUS_DESTINATION_REPLACED',
          d.reason,
        );
      return result;
    });
  }
  async prepare(a: TenantJwtUser, d: PrepareRepaymentDto) {
    if (
      !d.ledgerEntryIds?.length ||
      d.ledgerEntryIds.length > 500 ||
      new Set(d.ledgerEntryIds).size !== d.ledgerEntryIds.length
    )
      throw new BadRequestException('Choose 1–500 distinct recovery entries.');
    const date = new Date(d.paymentDate);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 2000 ||
      date.getUTCFullYear() > 2099
    )
      throw new BadRequestException('Invalid payment date.');
    return this.mutation(a, Permission.PREPARE_PAYROLL_PAYMENTS, async (tx) => {
      const rows = await this.sources(tx, a.organizationId, d.period),
        selected = d.ledgerEntryIds.map((id) =>
          rows.find((r) => r.ledgerEntryId === id),
        );
      if (selected.some((r) => !r?.eligible || !r.requestId))
        throw new BadRequestException(
          'Selected recoveries are unavailable or do not reconcile.',
        );
      const fallback = await tx.companyBankingDefault.findUnique({
        where: {
          organizationId_purpose: {
            organizationId: a.organizationId,
            purpose: 'EARLY_PAY_REPAYMENT',
          },
        },
      });
      const funding = await tx.companyBankingProfile.findFirst({
        where: {
          id: d.fundingProfileId ?? fallback?.profileId ?? '',
          organizationId: a.organizationId,
          status: 'APPROVED',
        },
      });
      const config = await tx.earlyPayRepaymentDestination.findUnique({
        where: { id: 'DEFAULT' },
        include: { account: true },
      });
      if (!funding || funding.currency !== 'ZAR')
        throw new BadRequestException(
          'Configure or select an approved company repayment funding profile.',
        );
      if (config?.account.status !== 'APPROVED')
        throw new BadRequestException(
          'DeluxHR has no approved repayment receiving account.',
        );
      const totalCents = selected.reduce((n, r) => n + r!.amountCents, 0);
      if (totalCents <= 0 || totalCents > 2147483647)
        throw new BadRequestException(
          'Repayment total exceeds the supported limit.',
        );
      const id = randomUUID(),
        dest = config.account;
      const b = await tx.earlyPayRepaymentBatch.create({
        data: {
          id,
          organizationId: a.organizationId,
          period: d.period,
          fundingProfileId: funding.id,
          destinationAccountId: dest.id,
          fundingSnapshot: {
            profileId: funding.id,
            name: funding.name,
            bank: funding.bank,
            channel: funding.channel,
            adapterId: funding.adapterId,
            adapterVersion: funding.adapterVersion,
            accountNumber: funding.accountNumber,
            branchCode: funding.branchCode,
            ownReference: funding.ownReference,
          },
          destinationSnapshot: {
            profileId: dest.id,
            name: dest.name,
            bankName: dest.bank,
            accountHolderName: dest.accountHolder,
            accountNumber: dest.accountNumber,
            branchCode: dest.branchCode,
            accountType: dest.accountType,
          },
          paymentDate: date,
          paymentReference: `ER${id.replace(/-/g, '').slice(0, 18).toUpperCase()}`,
          totalCents,
          preparedBy: a.sub,
          items: {
            create: selected.map((r) => ({
              ledgerEntryId: r!.ledgerEntryId,
              requestId: r!.requestId!,
              activeLedgerEntryId: r!.ledgerEntryId,
              activeRequestId: r!.requestId!,
              employeeName: r!.employeeName,
              payrollRunId: r!.payrollRunId,
              amountCents: r!.amountCents,
              principalCents: r!.principalCents,
              feeCents: r!.feeCents,
            })),
          },
        },
        include: { items: true, receipts: true },
      });
      await this.audit(tx, a, id, 'PREPARED', d.reason);
      return this.safe(b);
    });
  }
  private async liveAccounts(tx: Tx, b: Batch) {
    const [funding, dest] = await Promise.all([
      tx.companyBankingProfile.findFirst({
        where: {
          id: b.fundingProfileId,
          organizationId: b.organizationId,
          status: 'APPROVED',
        },
      }),
      tx.platformFundingAccount.findUnique({
        where: { id: b.destinationAccountId },
      }),
    ]);
    if (!funding || dest?.status !== 'APPROVED')
      throw new BadRequestException(
        'Funding or receiving account is no longer approved; cancel and prepare again.',
      );
  }
  async approve(a: TenantJwtUser, id: string, d: RepaymentActionDto) {
    return this.mutation(
      a,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, id, a.organizationId);
        if (b.status !== 'PREPARED' || b.preparedBy === a.sub)
          throw new BadRequestException(
            'An independent company approver must release a prepared batch.',
          );
        await this.liveAccounts(tx, b);
        await tx.earlyPayRepaymentBatch.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedBy: a.sub,
            approvedAt: new Date(),
          },
        });
        await this.audit(tx, a, id, 'APPROVED', d.reason);
        return this.safe(await this.batch(tx, id, a.organizationId));
      },
    );
  }
  async cancel(a: TenantJwtUser, id: string, d: RepaymentActionDto) {
    return this.mutation(
      a,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, id, a.organizationId);
        if (!['PREPARED', 'APPROVED'].includes(b.status))
          throw new BadRequestException(
            'Only unsubmitted repayment batches can be cancelled.',
          );
        await tx.earlyPayRepaymentItem.updateMany({
          where: { batchId: id },
          data: {
            cancelled: true,
            activeLedgerEntryId: null,
            activeRequestId: null,
          },
        });
        await tx.earlyPayRepaymentBatch.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
        await this.audit(tx, a, id, 'CANCELLED', d.reason);
        return this.safe(await this.batch(tx, id, a.organizationId));
      },
    );
  }
  async submit(a: TenantJwtUser, id: string, d: SubmitRepaymentDto) {
    if (d.bankReference.trim().length < 3 || d.evidence.trim().length < 10)
      throw new BadRequestException(
        'Traceable bank reference and evidence required.',
      );
    return this.mutation(
      a,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, id, a.organizationId);
        if (b.status !== 'APPROVED' || d.method !== 'MANUAL_BANK_PORTAL')
          throw new BadRequestException(
            'Only a released batch with actual manual bank-portal submission can be recorded.',
          );
        await this.liveAccounts(tx, b);
        await tx.earlyPayRepaymentBatch.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedBy: a.sub,
            submittedAt: new Date(),
            submissionReference: d.bankReference,
            submissionEvidence: d.evidence,
          },
        });
        await this.audit(tx, a, id, 'SUBMISSION_RECORDED', d.reason);
        return this.safe(await this.batch(tx, id, a.organizationId));
      },
    );
  }
  async inspect(a: TenantJwtUser, id: string, d: RepaymentActionDto) {
    return this.mutation(
      a,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, id, a.organizationId);
        if (!['APPROVED', 'SUBMITTED', 'PARTIALLY_REPAID'].includes(b.status))
          throw new BadRequestException(
            'Release approval required for full payment instructions.',
          );
        await this.audit(tx, a, id, 'BANK_DETAILS_INSPECTED', d.reason);
        return {
          funding: b.fundingSnapshot,
          destination: b.destinationSnapshot,
          paymentReference: b.paymentReference,
          totalCents: b.totalCents,
        };
      },
    );
  }
  async receipt(a: PlatformJwtUser, id: string, d: RecordRepaymentReceiptDto) {
    this.platform(a);
    if (
      !Number.isInteger(d.amountCents) ||
      d.amountCents <= 0 ||
      d.amountCents > 2147483647 ||
      (d.bankReference?.trim().length ?? 0) < 3 ||
      (d.evidence?.trim().length ?? 0) < 10
    )
      throw new BadRequestException(
        'Positive integer cents and traceable bank evidence required.',
      );
    const receivedAt = new Date(d.receivedAt);
    if (!Number.isFinite(receivedAt.getTime()) || receivedAt > new Date())
      throw new BadRequestException(
        'Receipt date must be valid and cannot be in the future.',
      );
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (!['SUBMITTED', 'PARTIALLY_REPAID'].includes(b.status))
        throw new BadRequestException(
          'A submitted repayment batch is required.',
        );
      const reserved = b.receipts
        .filter((r) => ['CONFIRMED', 'RECORDED'].includes(r.status))
        .reduce((n, r) => n + r.amountCents, 0);
      if (d.amountCents > b.totalCents - reserved)
        throw new BadRequestException(
          'Receipt exceeds the unreserved outstanding amount.',
        );
      const item = await tx.earlyPayRepaymentReceipt.create({
        data: {
          batchId: id,
          organizationId: b.organizationId,
          destinationAccountId: b.destinationAccountId,
          amountCents: d.amountCents,
          bankReference: d.bankReference
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase(),
          evidence: d.evidence,
          receivedAt,
          recordedBy: a.sub,
        },
      });
      await this.audit(
        tx,
        a,
        item.id,
        'RECEIPT_RECORDED',
        d.reason,
        b.organizationId,
      );
      return this.safe(await this.batch(tx, id));
    });
  }
  async decideReceipt(
    a: PlatformJwtUser,
    id: string,
    receiptId: string,
    d: DecideRepaymentReceiptDto,
  ) {
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      const receipt = b.receipts.find((r) => r.id === receiptId);
      if (!receipt)
        throw new NotFoundException('Receipt not found in this batch.');
      if (receipt.recordedBy === a.sub)
        throw new BadRequestException(
          'An independent platform receipt checker is required.',
        );
      if (receipt.status !== 'RECORDED')
        throw new ConflictException('Receipt has already been decided.');
      if (!['SUBMITTED', 'PARTIALLY_REPAID'].includes(b.status))
        throw new BadRequestException('Batch is not awaiting repayment.');
      const paid = b.receipts
        .filter((r) => r.status === 'CONFIRMED')
        .reduce((n, r) => n + r.amountCents, 0);
      if (
        d.decision === 'CONFIRMED' &&
        paid + receipt.amountCents > b.totalCents
      )
        throw new BadRequestException(
          'Confirmation would exceed the frozen repayment total.',
        );
      await tx.earlyPayRepaymentReceipt.update({
        where: { id: receiptId },
        data: {
          status: d.decision,
          decidedBy: a.sub,
          decidedAt: new Date(),
          decisionReason: this.reason(d.reason),
        },
      });
      const total =
        paid + (d.decision === 'CONFIRMED' ? receipt.amountCents : 0);
      await tx.earlyPayRepaymentBatch.update({
        where: { id },
        data: {
          status:
            total === b.totalCents
              ? 'REPAID'
              : total > 0
                ? 'PARTIALLY_REPAID'
                : 'SUBMITTED',
        },
      });
      await this.audit(
        tx,
        a,
        receiptId,
        `RECEIPT_${d.decision}`,
        d.reason,
        b.organizationId,
      );
      return this.safe(await this.batch(tx, id));
    });
  }
  async download(a: TenantJwtUser, id: string, kind: 'report' | 'draft') {
    return this.mutation(a, Permission.EXPORT_PAYROLL_PAYMENTS, async (tx) => {
      const b = await this.batch(tx, id, a.organizationId);
      if (
        !['APPROVED', 'SUBMITTED', 'PARTIALLY_REPAID', 'REPAID'].includes(
          b.status,
        )
      )
        throw new BadRequestException('Release approval is required.');
      let content: Buffer, fileName: string, contentType: string;
      if (kind === 'draft') {
        const destination = b.destinationSnapshot as Record<string, string>,
          funding = b.fundingSnapshot as unknown as NonNullable<
            BankPaymentDraftBatch['funding']
          >;
        const input: BankPaymentDraftBatch = {
          paymentBatchId: b.id,
          currency: 'ZAR',
          paymentDate: b.paymentDate,
          employeeCount: 1,
          totalAmount: b.totalCents / 100,
          funding,
          instructions: [
            {
              paymentItemId: b.id,
              employeeId: b.organizationId,
              employeeNumber: b.organizationId,
              employeeName: 'DeluxHR Early Pay repayment',
              amount: b.totalCents / 100,
              currency: 'ZAR',
              bankName: destination.bankName,
              accountHolderName: destination.accountHolderName,
              accountNumber: destination.accountNumber,
              branchCode: destination.branchCode,
              accountType: destination.accountType,
              paymentReference: b.paymentReference,
            },
          ],
        };
        const adapter = new FnbBankservDraftAdapter(),
          validation = adapter.validate(input);
        if (!validation.valid)
          throw new BadRequestException({
            message: 'Repayment draft validation failed.',
            issues: validation.issues,
          });
        const f = adapter.generate(input);
        content = f.content;
        fileName = `DRAFT-NOT-FOR-BANK-UPLOAD-EARLY-PAY-REPAYMENT-${id}.txt`;
        contentType = f.contentType;
      } else {
        const csv = (v: unknown) =>
          '"' +
          String(v ?? '')
            .replace(/[\r\n\t]/g, ' ')
            .replace(/^(\s*[=+@-])/, "'$1")
            .replace(/"/g, '""') +
          '"';
        content = Buffer.from(
          [
            [
              'ledgerEntryId',
              'requestId',
              'employee',
              'payrollRunId',
              'principalZAR',
              'feesZAR',
              'recoveryZAR',
              'repaymentReference',
            ]
              .map(csv)
              .join(','),
            ...b.items.map((i) =>
              [
                i.ledgerEntryId,
                i.requestId,
                i.employeeName,
                i.payrollRunId,
                (i.principalCents / 100).toFixed(2),
                (i.feeCents / 100).toFixed(2),
                (i.amountCents / 100).toFixed(2),
                b.paymentReference,
              ]
                .map(csv)
                .join(','),
            ),
          ].join('\r\n') + '\r\n',
        );
        fileName = `DeluxHR-Early-Pay-repayment-report-${id}.csv`;
        contentType = 'text/csv; charset=utf-8';
      }
      const sha256 = createHash('sha256').update(content).digest('hex');
      await this.audit(
        tx,
        a,
        id,
        kind === 'draft'
          ? 'DRAFT_DOWNLOADED_NOT_FOR_BANK'
          : 'REPORT_DOWNLOADED',
        `SHA256 ${sha256}`,
      );
      return { content, fileName, contentType, sha256 };
    });
  }
  productionExport() {
    throw new BadRequestException(
      'No verified production bank adapter is available. Repayment reports and drafts cannot be uploaded for payment.',
    );
  }
}
