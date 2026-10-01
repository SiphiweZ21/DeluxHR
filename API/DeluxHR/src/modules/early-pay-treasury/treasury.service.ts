import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { comparePassword } from '../../common/auth/password';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';
import {
  bankingAdapter,
  bankingCatalog,
} from '../company-banking/banking-adapters';
import { FnbBankservDraftAdapter } from '../payroll-payments/export/fnb-bankserv-draft.adapter';
import type { BankPaymentDraftBatch } from '../payroll-payments/export/payment-export.types';
import {
  CreateFundingDto,
  FundingReviewDto,
  PreparePayoutDto,
  TreasuryActionDto,
  SubmitPayoutDto,
  PayoutResultDto,
} from './treasury.dto';

type Tx = Prisma.TransactionClient;
@Injectable()
export class EarlyPayTreasuryService {
  constructor(private readonly prisma: PrismaService) {}
  private reason(value: string) {
    if (
      typeof value !== 'string' ||
      value.trim().length < 3 ||
      value.length > 500
    )
      throw new BadRequestException(
        'A reason of 3–500 characters is required.',
      );
    return value.trim();
  }
  private assertActor(a: PlatformJwtUser) {
    if (
      a.organizationId !== null ||
      !['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(a.role)
    )
      throw new ForbiddenException('A platform account is required.');
  }
  // Serialize treasury transitions, including allocations and cancellations. SERIALIZABLE
  // also protects reads against concurrent tenant review/bank-detail changes.
  private async mutation<T>(
    a: PlatformJwtUser,
    run: (tx: Tx, hash: string) => Promise<T>,
  ): Promise<T> {
    this.assertActor(a);
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681031)`;
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${a.sub} FOR UPDATE`;
          const user = await tx.user.findUnique({ where: { id: a.sub } });
          if (
            !user?.isActive ||
            user.organizationId !== null ||
            !['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)
          )
            throw new ForbiddenException(
              'An active platform account is required.',
            );
          return run(tx, user.passwordHash);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code)
        )
          throw new ConflictException(
            'Treasury data changed concurrently. Refresh and retry; no payment was sent.',
          );
        throw error;
      });
  }
  private async password(hash: string, password: string) {
    if (
      typeof password !== 'string' ||
      !(await comparePassword(password, hash))
    )
      throw new BadRequestException('Password verification failed.');
  }
  private audit(
    tx: Tx,
    a: PlatformJwtUser,
    action: string,
    id: string,
    reason: string,
  ) {
    return tx.platformAuditEvent.create({
      data: {
        actorUserId: a.sub,
        action,
        entity: 'EarlyPayTreasury',
        entityId: id,
        reason: this.reason(reason),
      },
    });
  }
  private safeFunding(p: { accountNumber: string; [key: string]: unknown }) {
    const { accountNumber, ...rest } = p;
    return {
      ...rest,
      accountNumberMasked: `••••${accountNumber.slice(-4)}`,
      bankImportReady: false,
    };
  }
  private safeBatch(
    b: Prisma.EarlyPayPayoutBatchGetPayload<{ include: { items: true } }>,
  ) {
    const { fundingSnapshot, items, ...rest } = b;
    return {
      ...rest,
      funding: this.safeFunding(
        fundingSnapshot as { accountNumber: string; [key: string]: unknown },
      ),
      items: items.map((i) => {
        const { beneficiarySnapshot, ...row } = i;
        return {
          ...row,
          beneficiary: this.safeFunding(
            beneficiarySnapshot as {
              accountNumber: string;
              [key: string]: unknown;
            },
          ),
        };
      }),
      bankImportReady: false,
    };
  }
  private async batch(tx: Tx, id: string) {
    const b = await tx.earlyPayPayoutBatch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!b) throw new NotFoundException('Payout batch not found.');
    return b;
  }
  async workspace(a: PlatformJwtUser) {
    this.assertActor(a);
    const [accounts, batches] = await Promise.all([
      this.prisma.platformFundingAccount.findMany({
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.earlyPayPayoutBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          totalCents: true,
          currency: true,
          createdAt: true,
          paymentDate: true,
          preparedBy: true,
          approvedBy: true,
          submittedBy: true,
          _count: { select: { items: true } },
        },
      }),
    ]);
    return {
      accounts: accounts.map((p) => this.safeFunding(p)),
      batches,
      adapters: bankingCatalog(),
      productionExportsAvailable: false,
    };
  }
  async eligible(a: PlatformJwtUser) {
    this.assertActor(a);
    // Return identities and amounts, never beneficiary accounts. Preparation revalidates eligibility.
    const requests = await this.prisma.earlyPayRequest.findMany({
      where: {
        status: 'APPROVED',
        employee: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
        treasuryItems: { none: { activeRequestId: { not: null } } },
      },
      take: 500,
      orderBy: { requestedAt: 'asc' },
      select: {
        id: true,
        organizationId: true,
        employeeId: true,
        netDisbursement: true,
        transferType: true,
        requestedAt: true,
        employee: {
          select: { firstName: true, lastName: true, employeeNumber: true },
        },
        organization: { select: { name: true } },
      },
    });
    return requests;
  }
  async detail(a: PlatformJwtUser, id: string) {
    this.assertActor(a);
    return this.safeBatch(await this.batch(this.prisma, id));
  }
  async createFunding(a: PlatformJwtUser, d: CreateFundingDto) {
    const adapter = bankingAdapter(d.adapterId);
    if (!adapter) throw new BadRequestException('Unsupported banking adapter.');
    return this.mutation(a, async (tx) => {
      const p = await tx.platformFundingAccount.create({
        data: {
          name: d.name,
          bank: adapter.bank,
          channel: adapter.channel,
          adapterId: adapter.id,
          adapterVersion: adapter.version,
          accountHolder: d.accountHolder,
          accountNumber: d.accountNumber,
          branchCode: d.branchCode,
          accountType: d.accountType,
          ownReference: d.ownReference,
          createdBy: a.sub,
        },
      });
      await this.audit(tx, a, 'FUNDING_CREATED', p.id, d.reason);
      return this.safeFunding(p);
    });
  }
  async inspectFunding(a: PlatformJwtUser, id: string, d: TreasuryActionDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await tx.platformFundingAccount.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Funding account not found.');
      if (p.createdBy === a.sub || p.status !== 'PENDING_APPROVAL')
        throw new BadRequestException(
          'Only an independent pending-account reviewer can inspect.',
        );
      await this.audit(tx, a, 'FUNDING_INSPECTED', id, d.reason);
      return {
        id: p.id,
        accountNumber: p.accountNumber,
        accountHolder: p.accountHolder,
        branchCode: p.branchCode,
      };
    });
  }
  async reviewFunding(a: PlatformJwtUser, id: string, d: FundingReviewDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await tx.platformFundingAccount.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Funding account not found.');
      if (p.createdBy === a.sub || p.status !== 'PENDING_APPROVAL')
        throw new BadRequestException(
          'Independent pending-account review required.',
        );
      const result = await tx.platformFundingAccount.update({
        where: { id },
        data: { status: d.decision, reviewedBy: a.sub, reviewedAt: new Date() },
      });
      await this.audit(tx, a, `FUNDING_${d.decision}`, id, d.reason);
      return this.safeFunding(result);
    });
  }
  async retireFunding(a: PlatformJwtUser, id: string, d: TreasuryActionDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await tx.platformFundingAccount.findUnique({ where: { id } });
      if (!p || p.status !== 'APPROVED')
        throw new BadRequestException('Only approved accounts can be retired.');
      const repaymentConfig = await tx.earlyPayRepaymentDestination.findUnique({
        where: { id: 'DEFAULT' },
      });
      const repaymentPending = await tx.earlyPayRepaymentBatch.count({
        where: {
          destinationAccountId: id,
          status: { in: ['PREPARED', 'APPROVED'] },
        },
      });
      if (repaymentConfig?.accountId === id || repaymentPending)
        throw new BadRequestException(
          'Switch the repayment receiving account and cancel unsubmitted repayment batches before retirement.',
        );
      const pending = await tx.earlyPayPayoutBatch.count({
        where: {
          fundingAccountId: id,
          status: { in: ['PREPARED', 'APPROVED'] },
        },
      });
      if (pending)
        throw new BadRequestException(
          'Cancel unsubmitted batches before retiring this account.',
        );
      await tx.platformFundingAccount.update({
        where: { id },
        data: { status: 'RETIRED' },
      });
      await this.audit(tx, a, 'FUNDING_RETIRED', id, d.reason);
      return { id, status: 'RETIRED' };
    });
  }
  cents(amount: number) {
    const n = Math.round(amount * 100);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - n) > 0.00001 ||
      !Number.isSafeInteger(n) ||
      n > 2147483647
    )
      throw new BadRequestException(
        'Positive ZAR amounts with at most two decimal places are required.',
      );
    return n;
  }
  private async enabled(tx: Tx, organizationId: string) {
    const [flags, subscription] = await Promise.all([
      tx.organizationFeature.count({
        where: {
          organizationId,
          enabled: true,
          feature: { in: ['EARLY_PAY', 'PAYROLL'] },
        },
      }),
      tx.platformSubscription.findUnique({
        where: { organizationId },
        include: { package: true },
      }),
    ]);
    if (
      flags !== 2 ||
      (subscription &&
        (subscription.status !== 'ACTIVE' ||
          (subscription.endsAt && subscription.endsAt <= new Date()) ||
          !subscription.package.features.includes('EARLY_PAY') ||
          !subscription.package.features.includes('PAYROLL')))
    )
      throw new BadRequestException(
        'Early Pay and Payroll must be enabled with an available subscription.',
      );
  }
  async prepare(a: PlatformJwtUser, d: PreparePayoutDto) {
    if (
      !Array.isArray(d.requestIds) ||
      !d.requestIds.length ||
      d.requestIds.length > 500 ||
      new Set(d.requestIds).size !== d.requestIds.length
    )
      throw new BadRequestException('Choose 1–500 distinct approved requests.');
    const date = new Date(d.paymentDate);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 2000 ||
      date.getUTCFullYear() > 2099
    )
      throw new BadRequestException('Invalid payment date.');
    return this.mutation(a, async (tx) => {
      const funding = await tx.platformFundingAccount.findUnique({
        where: { id: d.fundingAccountId },
      });
      if (!funding || funding.status !== 'APPROVED')
        throw new BadRequestException(
          'An independently approved platform funding account is required.',
        );
      const rows = await tx.earlyPayRequest.findMany({
        where: { id: { in: d.requestIds } },
        include: {
          employee: {
            include: {
              paymentDetails: {
                where: { status: 'APPROVED', supersededAt: null },
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
          },
          organization: true,
        },
      });
      if (rows.length !== d.requestIds.length)
        throw new BadRequestException('One or more requests were not found.');
      const items: Prisma.EarlyPayPayoutItemCreateWithoutBatchInput[] = [];
      const checked = new Set<string>();
      let total = 0;
      for (const r of rows.sort((x, y) => x.id.localeCompare(y.id))) {
        await tx.$queryRaw`SELECT "id" FROM "EarlyPayRequest" WHERE "id"=${r.id} FOR UPDATE`;
        if (
          r.status !== 'APPROVED' ||
          r.employee.status !== 'ACTIVE' ||
          r.organization.status !== 'ACTIVE' ||
          r.employee.organizationId !== r.organizationId
        )
          throw new BadRequestException(
            'Requests must be approved for active employees and companies.',
          );
        if (!checked.has(r.organizationId)) {
          await this.enabled(tx, r.organizationId);
          checked.add(r.organizationId);
        }
        if (
          await tx.earlyPayPayoutItem.findUnique({
            where: { activeRequestId: r.id },
          })
        )
          throw new BadRequestException(
            'Request already allocated to a payout batch.',
          );
        const bank = r.employee.paymentDetails[0];
        if (
          !bank ||
          bank.organizationId !== r.organizationId ||
          !/^\d{6,20}$/.test(bank.accountNumber) ||
          !/^\d{6}$/.test(bank.branchCode ?? '') ||
          !bank.accountHolderName.trim() ||
          !bank.bankName.trim()
        )
          throw new BadRequestException(
            'Current approved beneficiary details are required.',
          );
        const amount = this.cents(r.netDisbursement);
        total += amount;
        if (total > 2147483647)
          throw new BadRequestException(
            'Batch amount exceeds the supported limit.',
          );
        const id = randomUUID();
        items.push({
          id,
          request: { connect: { id: r.id } },
          activeRequestId: r.id,
          organizationId: r.organizationId,
          employeeId: r.employeeId,
          employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
          amountCents: amount,
          paymentReference: `EP${id.replace(/-/g, '').slice(0, 18).toUpperCase()}`,
          beneficiarySnapshot: {
            paymentDetailId: bank.id,
            employeeNumber: r.employee.employeeNumber,
            bankName: bank.bankName,
            accountHolderName: bank.accountHolderName,
            accountNumber: bank.accountNumber,
            branchCode: bank.branchCode,
            accountType: bank.accountType,
            transferType: r.transferType,
          },
        });
      }
      const b = await tx.earlyPayPayoutBatch.create({
        data: {
          fundingAccountId: funding.id,
          fundingSnapshot: {
            profileId: funding.id,
            name: funding.name,
            bank: funding.bank,
            channel: funding.channel,
            adapterId: funding.adapterId,
            adapterVersion: funding.adapterVersion,
            accountNumber: funding.accountNumber,
            accountHolder: funding.accountHolder,
            branchCode: funding.branchCode,
            accountType: funding.accountType,
            ownReference: funding.ownReference,
          },
          paymentDate: date,
          totalCents: total,
          preparedBy: a.sub,
          items: { create: items },
        },
        include: { items: true },
      });
      await tx.earlyPayRequest.updateMany({
        where: { id: { in: d.requestIds }, status: 'APPROVED' },
        data: { status: 'PROCESSING' },
      });
      await this.audit(tx, a, 'PAYOUT_PREPARED', b.id, d.reason);
      return this.safeBatch(b);
    });
  }
  private async processing(
    tx: Tx,
    b: Prisma.EarlyPayPayoutBatchGetPayload<{ include: { items: true } }>,
  ) {
    const requests = await tx.earlyPayRequest.findMany({
      where: { id: { in: b.items.map((i) => i.requestId) } },
      include: { employee: true, organization: true },
    });
    if (
      requests.length !== b.items.length ||
      requests.some(
        (r) =>
          r.status !== 'PROCESSING' ||
          r.employee.status !== 'ACTIVE' ||
          r.organization.status !== 'ACTIVE',
      )
    )
      throw new BadRequestException(
        'Requests must still be processing for active employees and companies.',
      );
    for (const organizationId of new Set(requests.map((r) => r.organizationId)))
      await this.enabled(tx, organizationId);
  }
  async approve(a: PlatformJwtUser, id: string, d: TreasuryActionDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (b.status !== 'PREPARED' || b.preparedBy === a.sub)
        throw new BadRequestException(
          'Independent approval of a prepared batch is required.',
        );
      await this.processing(tx, b);
      const funding = await tx.platformFundingAccount.findUnique({
        where: { id: b.fundingAccountId },
      });
      if (funding?.status !== 'APPROVED')
        throw new BadRequestException('Funding account is no longer approved.');
      await tx.earlyPayPayoutBatch.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: a.sub, approvedAt: new Date() },
      });
      await this.audit(tx, a, 'PAYOUT_RELEASE_APPROVED', id, d.reason);
      return this.safeBatch(await this.batch(tx, id));
    });
  }
  async cancel(a: PlatformJwtUser, id: string, d: TreasuryActionDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (!['PREPARED', 'APPROVED'].includes(b.status))
        throw new BadRequestException(
          'Only unsubmitted batches can be cancelled.',
        );
      await tx.earlyPayPayoutItem.updateMany({
        where: { batchId: id },
        data: { status: 'CANCELLED', activeRequestId: null },
      });
      await tx.earlyPayRequest.updateMany({
        where: {
          id: { in: b.items.map((i) => i.requestId) },
          status: 'PROCESSING',
        },
        data: { status: 'APPROVED' },
      });
      await tx.earlyPayPayoutBatch.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await this.audit(tx, a, 'PAYOUT_CANCELLED', id, d.reason);
      return this.safeBatch(await this.batch(tx, id));
    });
  }
  async submit(a: PlatformJwtUser, id: string, d: SubmitPayoutDto) {
    if (d.method !== 'MANUAL_BANK_PORTAL')
      throw new BadRequestException(
        'Only recorded manual bank-portal submission is supported. Drafts cannot be uploaded.',
      );
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (b.status !== 'APPROVED')
        throw new BadRequestException(
          'An independently released batch is required.',
        );
      await this.processing(tx, b);
      const funding = await tx.platformFundingAccount.findUnique({
        where: { id: b.fundingAccountId },
      });
      if (funding?.status !== 'APPROVED')
        throw new BadRequestException('Funding account is no longer approved.');
      await tx.earlyPayPayoutBatch.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedBy: a.sub,
          submittedAt: new Date(),
          submissionReference: d.bankReference,
          submissionEvidence: d.evidence,
        },
      });
      await this.audit(
        tx,
        a,
        'PAYOUT_MANUAL_SUBMISSION_RECORDED',
        id,
        d.reason,
      );
      return this.safeBatch(await this.batch(tx, id));
    });
  }
  async result(
    a: PlatformJwtUser,
    id: string,
    itemId: string,
    d: PayoutResultDto,
  ) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (
        !['SUBMITTED', 'RECONCILED'].includes(b.status) ||
        a.sub === b.submittedBy ||
        a.sub === b.preparedBy
      )
        throw new BadRequestException(
          'An independent bank-result checker is required after submission.',
        );
      const item = b.items.find((i) => i.id === itemId);
      if (!item)
        throw new NotFoundException('Payout item not found in this batch.');
      if (item.status !== 'PENDING') {
        if (
          item.status === d.outcome &&
          item.bankReference === d.bankReference &&
          item.resultEvidence === d.evidence
        ) {
          await this.audit(
            tx,
            a,
            'PAYOUT_RESULT_RECONFIRMED',
            itemId,
            d.reason,
          );
          return this.safeBatch(b);
        }
        throw new BadRequestException('A final bank result cannot be changed.');
      }
      const request = await tx.earlyPayRequest.findUnique({
        where: { id: item.requestId },
      });
      if (request?.status !== 'PROCESSING')
        throw new BadRequestException(
          'Request is no longer allocated for processing.',
        );
      const now = new Date();
      await tx.earlyPayPayoutItem.update({
        where: { id: itemId },
        data: {
          status: d.outcome,
          bankReference: d.bankReference,
          resultEvidence: d.evidence,
          resultBy: a.sub,
          resultAt: now,
        },
      });
      if (d.outcome === 'PAID')
        await tx.earlyPayRequest.update({
          where: { id: item.requestId },
          data: {
            status: 'PAID',
            paidAt: now,
            paymentReference: d.bankReference,
          },
        });
      else
        await tx.earlyPayRequest.update({
          where: { id: item.requestId },
          data: { status: 'PAYMENT_FAILED', paymentReference: d.bankReference },
        });
      // Failed requests remain allocated. Recovery/retry needs a later explicit audited workflow.
      if (b.items.every((i) => i.id === itemId || i.status !== 'PENDING'))
        await tx.earlyPayPayoutBatch.update({
          where: { id },
          data: { status: 'RECONCILED' },
        });
      await tx.auditLog.create({
        data: {
          organizationId: item.organizationId,
          action: `EARLY_PAY_BANK_${d.outcome}`,
          entity: 'EarlyPayRequest',
          entityId: item.requestId,
          actorUserId: a.sub,
          reason: this.reason(d.reason),
          metadata: {
            batchId: id,
            itemId,
            bankReference: d.bankReference,
            confirmation: 'MANUAL_INDEPENDENT_BANK_EVIDENCE',
          },
        },
      });
      await this.audit(tx, a, `PAYOUT_BANK_${d.outcome}`, itemId, d.reason);
      return this.safeBatch(await this.batch(tx, id));
    });
  }
  private exportBatch(
    b: Prisma.EarlyPayPayoutBatchGetPayload<{ include: { items: true } }>,
  ): BankPaymentDraftBatch {
    const funding = b.fundingSnapshot as unknown as NonNullable<
      BankPaymentDraftBatch['funding']
    >;
    // Shared bank serializer uses actual payout IDs without fabricating payroll identifiers.
    return {
      paymentBatchId: b.id,
      currency: 'ZAR',
      paymentDate: b.paymentDate,
      employeeCount: b.items.length,
      totalAmount: b.totalCents / 100,
      funding,
      instructions: b.items.map((i) => {
        const s = i.beneficiarySnapshot as Record<string, string>;
        return {
          paymentItemId: i.id,
          employeeId: i.employeeId,
          employeeNumber: s.employeeNumber,
          employeeName: i.employeeName,
          amount: i.amountCents / 100,
          currency: 'ZAR',
          bankName: s.bankName,
          accountHolderName: s.accountHolderName,
          accountNumber: s.accountNumber,
          branchCode: s.branchCode,
          accountType: s.accountType,
          paymentReference: i.paymentReference,
        };
      }),
    };
  }
  async inspectBatch(a: PlatformJwtUser, id: string, d: TreasuryActionDto) {
    return this.mutation(a, async (tx, hash) => {
      await this.password(hash, d.password);
      const b = await this.batch(tx, id);
      if (!['APPROVED', 'SUBMITTED'].includes(b.status))
        throw new BadRequestException(
          'Only released or submitted payout instructions can be inspected.',
        );
      await this.audit(tx, a, 'PAYOUT_BANK_DETAILS_INSPECTED', id, d.reason);
      return {
        funding: b.fundingSnapshot,
        items: b.items.map((i) => ({
          id: i.id,
          beneficiary: i.beneficiarySnapshot,
        })),
      };
    });
  }
  async download(a: PlatformJwtUser, id: string, kind: 'report' | 'draft') {
    return this.mutation(a, async (tx, hash) => {
      const b = await this.batch(tx, id);
      if (!['APPROVED', 'SUBMITTED', 'RECONCILED'].includes(b.status))
        throw new BadRequestException(
          'Release approval is required before downloading payment details.',
        );
      let content: Buffer, name: string, contentType: string;
      if (kind === 'draft') {
        const adapter = new FnbBankservDraftAdapter(),
          input = this.exportBatch(b),
          validation = adapter.validate(input);
        if (!validation.valid)
          throw new BadRequestException({
            message: 'Bank draft validation failed.',
            issues: validation.issues,
          });
        const file = adapter.generate(input);
        content = file.content;
        name = `DRAFT-NOT-FOR-BANK-UPLOAD-EARLY-PAY-${id}.txt`;
        contentType = file.contentType;
      } else {
        // Masked report: cannot serve as an unvalidated bank upload or leak account numbers.
        const cell = (v: unknown) =>
          '"' +
          String(v ?? '')
            .replace(/"/g, '""')
            .replace(/[\r\n\t]/g, ' ')
            .replace(/^(\s*[=+@-])/, "'$1") +
          '"';
        content = Buffer.from(
          [
            [
              'requestId',
              'organizationId',
              'employee',
              'amountZAR',
              'reference',
              'status',
              'accountMasked',
            ]
              .map(cell)
              .join(','),
            ...b.items.map((i) =>
              [
                i.requestId,
                i.organizationId,
                i.employeeName,
                (i.amountCents / 100).toFixed(2),
                i.paymentReference,
                i.status,
                `****${String((i.beneficiarySnapshot as Record<string, string>).accountNumber).slice(-4)}`,
              ]
                .map(cell)
                .join(','),
            ),
          ].join('\r\n') + '\r\n',
        );
        name = `DeluxHR-Early-Pay-report-${id}.csv`;
        contentType = 'text/csv; charset=utf-8';
      }
      const sha256 = createHash('sha256').update(content).digest('hex');
      await this.audit(
        tx,
        a,
        kind === 'draft'
          ? 'PAYOUT_DRAFT_DOWNLOADED_NOT_FOR_BANK'
          : 'PAYOUT_REPORT_DOWNLOADED',
        id,
        `SHA256 ${sha256}`,
      );
      return { content, fileName: name, contentType, sha256 };
    });
  }
  productionExport() {
    throw new BadRequestException(
      'No verified production bank adapter is available. Reports and drafts are not bank payment files.',
    );
  }
}
