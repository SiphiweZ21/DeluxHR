import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/access/access-control.service';
import { comparePassword } from '../../common/auth/password';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import {
  PayrollLiabilitiesService,
  type Row,
} from '../payroll-liabilities/payroll-liabilities.service';
import { FnbBankservDraftAdapter } from '../payroll-payments/export/fnb-bankserv-draft.adapter';
import type { BankPaymentDraftBatch } from '../payroll-payments/export/payment-export.types';
import {
  CreateBeneficiaryDto,
  ReviewBeneficiaryDto,
  PrepareRemittanceDto,
  RemittanceActionDto,
  SubmitRemittanceDto,
  RemittanceResultDto,
} from './remittance.dto';
type Tx = Prisma.TransactionClient;
type Batch = Prisma.RemittancePaymentBatchGetPayload<{
  include: { allocations: true };
}>;
const statutory = ['PAYE', 'SDL_EMPLOYER', 'UIF_EMPLOYEE', 'UIF_EMPLOYER'];
const uif = ['UIF_EMPLOYEE', 'UIF_EMPLOYER'];
@Injectable()
export class RemittancePaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
    private readonly liabilities: PayrollLiabilitiesService,
  ) {}
  private reason(v: string) {
    if (typeof v !== 'string' || v.trim().length < 3 || v.length > 500)
      throw new BadRequestException(
        'A reason of 3–500 characters is required.',
      );
    return v.trim();
  }
  private async password(hash: string, p: string) {
    if (typeof p !== 'string' || !(await comparePassword(p, hash)))
      throw new BadRequestException('Password verification failed.');
  }
  private async log(
    tx: Tx,
    a: TenantJwtUser,
    id: string,
    action: string,
    reason: string,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: a.organizationId,
        actorUserId: a.sub,
        actorEmail: a.email,
        actorRole: a.role,
        entity: 'RemittancePreparation',
        entityId: id,
        action: `REMITTANCE_${action}`,
        reason: this.reason(reason),
      },
    });
  }
  private mask(p: Prisma.JsonValue | Record<string, unknown>) {
    const { accountNumber, ...rest } = p as Record<string, unknown>;
    return {
      ...rest,
      accountNumberMasked:
        typeof accountNumber === 'string'
          ? `••••${accountNumber.slice(-4)}`
          : null,
    };
  }
  private safe(b: Batch) {
    const { fundingSnapshot, beneficiarySnapshot, ...rest } = b;
    return {
      ...rest,
      funding: this.mask(fundingSnapshot),
      beneficiary: this.mask(beneficiarySnapshot),
      bankImportReady: false,
    };
  }
  private admin(a: TenantJwtUser) {
    if (a.role !== 'COMPANY_ADMIN' || !a.organizationId)
      throw new ForbiddenException('Company administrator access required.');
  }
  private async mutation<T>(
    a: TenantJwtUser,
    p: Permission | null,
    fn: (tx: Tx, hash: string) => Promise<T>,
  ) {
    if (!a.organizationId) throw new ForbiddenException('Tenant required.');
    if (!p) this.admin(a);
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(681033)`;
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${a.sub} FOR UPDATE`;
          const user = await tx.user.findUnique({ where: { id: a.sub } }),
            org = await tx.organization.findUnique({
              where: { id: a.organizationId },
            });
          if (
            !user?.isActive ||
            user.organizationId !== a.organizationId ||
            user.role !== a.role ||
            !org ||
            !(p ? ['ACTIVE'] : ['ACTIVE', 'PENDING']).includes(org.status)
          )
            throw new ForbiddenException(
              'Current company account access required.',
            );
          if (p) {
            const grants = await this.access.getEffectivePermissions(a);
            if (
              !grants.some(
                (g) => g.permission === p && g.scope === 'ORGANIZATION',
              )
            )
              throw new ForbiddenException('Organization permission required.');
            const [flag, sub] = await Promise.all([
              tx.organizationFeature.findUnique({
                where: {
                  organizationId_feature: {
                    organizationId: a.organizationId,
                    feature: 'PAYROLL',
                  },
                },
              }),
              tx.platformSubscription.findUnique({
                where: { organizationId: a.organizationId },
                include: { package: true },
              }),
            ]);
            if (
              !flag?.enabled ||
              (sub &&
                (sub.status !== 'ACTIVE' ||
                  (sub.endsAt && sub.endsAt <= new Date()) ||
                  !sub.package.features.includes('PAYROLL')))
            )
              throw new ForbiddenException('Payroll service is unavailable.');
          }
          return fn(tx, user.passwordHash);
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
            'Remittance data or reference changed. Refresh before retrying; no payment was sent.',
          );
        throw e;
      });
  }
  private async profile(tx: Tx, a: TenantJwtUser, id: string) {
    const p = await tx.remittanceBeneficiary.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!p) throw new NotFoundException('Beneficiary not found.');
    return p;
  }
  private async batch(tx: Tx, a: TenantJwtUser, id: string) {
    const b = await tx.remittancePaymentBatch.findFirst({
      where: { id, organizationId: a.organizationId },
      include: { allocations: true },
    });
    if (!b) throw new NotFoundException('Remittance batch not found.');
    return b;
  }
  async profiles(a: TenantJwtUser) {
    this.admin(a);
    return (
      await this.db.remittanceBeneficiary.findMany({
        where: { organizationId: a.organizationId },
        orderBy: { createdAt: 'desc' },
      })
    ).map((p) => this.mask(p));
  }
  async create(a: TenantJwtUser, d: CreateBeneficiaryDto) {
    this.admin(a);
    if (!['BANK_TRANSFER', 'SARS_EFILING', 'UIF_PORTAL'].includes(d.route))
      throw new BadRequestException('Unsupported payment route.');
    if (d.route === 'BANK_TRANSFER') {
      if (
        !d.code?.trim() ||
        statutory.includes(d.code) ||
        d.code === 'EARLY_PAY_RECOVERY' ||
        !d.creditorName?.trim() ||
        !d.bankName?.trim() ||
        !d.accountHolder?.trim() ||
        !/^\d{6,20}$/.test(d.accountNumber ?? '') ||
        !/^\d{6}$/.test(d.branchCode ?? '') ||
        !['CURRENT', 'SAVINGS', 'TRANSMISSION'].includes(d.accountType ?? '') ||
        !d.payeeReference?.trim()
      )
        throw new BadRequestException(
          'Ordinary creditor code/name, complete bank details and payee reference required. Statutory and Early Pay codes are excluded.',
        );
      if (d.uifViaSars !== undefined || d.registrationEvidence !== undefined)
        throw new BadRequestException(
          'Statutory settings are not ordinary beneficiary bank fields.',
        );
    } else {
      if (
        d.code ||
        d.creditorName ||
        d.bankName ||
        d.accountHolder ||
        d.accountNumber ||
        d.branchCode ||
        d.accountType ||
        d.payeeReference
      )
        throw new BadRequestException(
          'Statutory portal routes cannot contain ordinary creditor bank fields.',
        );
      if (
        (d.registrationEvidence?.trim().length ?? 0) < 10 ||
        typeof d.uifViaSars !== 'boolean' ||
        (d.route === 'UIF_PORTAL' && d.uifViaSars)
      )
        throw new BadRequestException(
          'Verified registration evidence and UIF routing declaration required. SARS-registered UIF employers must use SARS.',
        );
    }
    return this.mutation(a, null, async (tx) => {
      const p = await tx.remittanceBeneficiary.create({
        data: {
          organizationId: a.organizationId,
          name: d.name,
          route: d.route,
          code: d.code?.trim(),
          creditorName: d.creditorName?.trim(),
          uifViaSars: d.uifViaSars,
          registrationEvidence: d.registrationEvidence,
          bankName: d.bankName,
          accountHolder: d.accountHolder,
          accountNumber: d.accountNumber,
          branchCode: d.branchCode,
          accountType: d.accountType,
          payeeReference: d.payeeReference,
          createdBy: a.sub,
        },
      });
      await this.log(tx, a, p.id, 'BENEFICIARY_CREATED', d.reason);
      return this.mask(p);
    });
  }
  async inspectProfile(a: TenantJwtUser, id: string, d: RemittanceActionDto) {
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await this.profile(tx, a, id);
      if (p.status !== 'PENDING_APPROVAL' || p.createdBy === a.sub)
        throw new BadRequestException(
          'Independent pending-beneficiary review required.',
        );
      await this.log(tx, a, id, 'BENEFICIARY_INSPECTED', d.reason);
      return p;
    });
  }
  async review(a: TenantJwtUser, id: string, d: ReviewBeneficiaryDto) {
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await this.profile(tx, a, id);
      if (p.status !== 'PENDING_APPROVAL' || p.createdBy === a.sub)
        throw new BadRequestException(
          'Independent pending-beneficiary review required.',
        );
      if (d.decision === 'APPROVED' && p.route !== 'BANK_TRANSFER') {
        const existing = await tx.remittanceBeneficiary.findMany({
          where: {
            organizationId: a.organizationId,
            status: 'APPROVED',
            route: { in: ['SARS_EFILING', 'UIF_PORTAL'] },
          },
        });
        if (
          existing.some(
            (e) =>
              e.route === p.route ||
              (p.route === 'UIF_PORTAL' &&
                e.route === 'SARS_EFILING' &&
                e.uifViaSars) ||
              (p.route === 'SARS_EFILING' &&
                p.uifViaSars &&
                e.route === 'UIF_PORTAL'),
          )
        )
          throw new BadRequestException(
            'Retire conflicting statutory routing before approving this profile. UIF cannot be payable through both SARS and uFiling.',
          );
      }
      const result = await tx.remittanceBeneficiary.update({
        where: { id },
        data: { status: d.decision, reviewedBy: a.sub, reviewedAt: new Date() },
      });
      await this.log(tx, a, id, `BENEFICIARY_${d.decision}`, d.reason);
      return this.mask(result);
    });
  }
  async retire(a: TenantJwtUser, id: string, d: RemittanceActionDto) {
    return this.mutation(a, null, async (tx, hash) => {
      await this.password(hash, d.password);
      const p = await this.profile(tx, a, id);
      if (p.status !== 'APPROVED')
        throw new BadRequestException(
          'Only approved beneficiaries can be retired.',
        );
      if (
        await tx.remittancePaymentBatch.count({
          where: {
            organizationId: a.organizationId,
            beneficiaryId: id,
            status: { in: ['PREPARED', 'APPROVED'] },
          },
        })
      )
        throw new BadRequestException(
          'Cancel unsubmitted batches before retiring their beneficiary.',
        );
      await tx.remittanceBeneficiary.update({
        where: { id },
        data: { status: 'RETIRED' },
      });
      await this.log(tx, a, id, 'BENEFICIARY_RETIRED', d.reason);
      return { id, status: 'RETIRED' };
    });
  }
  async workspace(a: TenantJwtUser, period: string) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
      throw new BadRequestException('Period must be YYYY-MM in 2000–2099.');
    const [register, beneficiaries, funding, batches] = await Promise.all([
      this.liabilities.register(a, period),
      this.db.remittanceBeneficiary.findMany({
        where: { organizationId: a.organizationId, status: 'APPROVED' },
      }),
      this.db.companyBankingProfile.findMany({
        where: { organizationId: a.organizationId, status: 'APPROVED' },
      }),
      this.db.remittancePaymentBatch.findMany({
        where: { organizationId: a.organizationId, period },
        include: { allocations: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      register,
      beneficiaries: beneficiaries.map((p) => this.mask(p)),
      funding: funding.map((p) => ({
        id: p.id,
        name: p.name,
        bank: p.bank,
        accountNumberMasked: `••••${p.accountNumber.slice(-4)}`,
      })),
      batches: batches.map((b) => this.safe(b)),
      bankImportReady: false,
    };
  }
  async detail(a: TenantJwtUser, id: string) {
    return this.safe(await this.batch(this.db, a, id));
  }
  private target(p: Prisma.RemittanceBeneficiaryGetPayload<{}>, rows: Row[]) {
    if (p.route === 'BANK_TRANSFER')
      return rows.filter(
        (r) =>
          r.code === p.code &&
          r.creditorName === p.creditorName &&
          !statutory.includes(r.code) &&
          !['STATUTORY_DEDUCTION', 'EMPLOYER_STATUTORY'].includes(r.category) &&
          r.code !== 'EARLY_PAY_RECOVERY',
      );
    const codes =
      p.route === 'SARS_EFILING'
        ? statutory.filter((c) => p.uifViaSars || !uif.includes(c))
        : uif;
    return rows.filter((r) => codes.includes(r.code));
  }
  async prepare(a: TenantJwtUser, d: PrepareRemittanceDto) {
    return this.mutation(a, Permission.PREPARE_PAYROLL_PAYMENTS, async (tx) => {
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(d.period))
        throw new BadRequestException('Invalid remittance period.');
      const p = await this.profile(tx, a, d.beneficiaryId);
      if (p.status !== 'APPROVED')
        throw new BadRequestException('Approved beneficiary required.');
      const report = await this.liabilities.register(a, d.period, tx),
        rows = this.target(p, report.rows);
      if (!rows.length || rows.some((r) => r.outstandingCents < 0))
        throw new BadRequestException(
          'No matching reconciled liability buckets are available.',
        );
      const statutoryRoute = p.route !== 'BANK_TRANSFER';
      if (statutoryRoute && rows.some((r) => r.reservedCents || r.pendingCents))
        throw new BadRequestException(
          'Resolve reserved or pending statutory payments before preparing another declaration.',
        );
      const available = rows.reduce((n, r) => n + r.availableCents, 0),
        amount = statutoryRoute ? available : (d.amountCents ?? available);
      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 1000000000 ||
        amount > available
      )
        throw new BadRequestException(
          'Amount exceeds the available unreserved liability.',
        );
      let reference = d.officialReference?.trim() || p.payeeReference || '';
      if (statutoryRoute) {
        if (
          d.declaredPaymentCents !== amount ||
          (d.declarationEvidence?.trim().length ?? 0) < 10
        )
          throw new BadRequestException(
            'Official declared payment must reconcile exactly to available ledger allocations; record justified adjustments before preparation.',
          );
        if (p.route === 'SARS_EFILING' && !/^\d{19}$/.test(reference))
          throw new BadRequestException(
            'Use the official 19-digit EMP201 PRN.',
          );
        if (p.route === 'UIF_PORTAL' && reference.length < 3)
          throw new BadRequestException(
            'Official UIF declaration/payment reference required.',
          );
      } else if (!/^[A-Za-z0-9 /-]{1,20}$/.test(reference))
        throw new BadRequestException(
          'Ordinary payee reference must fit 20 ASCII characters without truncation.',
        );
      const fallback = await tx.companyBankingDefault.findUnique({
        where: {
          organizationId_purpose: {
            organizationId: a.organizationId,
            purpose: 'LIABILITIES',
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
      if (!funding || funding.currency !== 'ZAR')
        throw new BadRequestException(
          'Approved same-company LIABILITIES funding profile required.',
        );
      const date = new Date(d.paymentDate);
      if (
        !Number.isFinite(date.getTime()) ||
        date.getUTCFullYear() < 2000 ||
        date.getUTCFullYear() > 2099
      )
        throw new BadRequestException('Valid payment date required.');
      const b = await tx.remittancePaymentBatch.create({
        data: {
          organizationId: a.organizationId,
          period: d.period,
          beneficiaryId: p.id,
          fundingProfileId: funding.id,
          route: p.route,
          fundingSnapshot: {
            profileId: funding.id,
            name: funding.name,
            bank: funding.bank,
            adapterId: funding.adapterId,
            adapterVersion: funding.adapterVersion,
            accountNumber: funding.accountNumber,
            branchCode: funding.branchCode,
            ownReference: funding.ownReference,
          },
          beneficiarySnapshot: JSON.parse(JSON.stringify(p)),
          paymentDate: date,
          paymentReference: reference,
          declarationEvidence: d.declarationEvidence,
          totalCents: amount,
          preparedBy: a.sub,
          allocations: {
            create: rows
              .filter((r) => r.availableCents > 0)
              .map((r) => ({
                code: r.code,
                creditorName: r.creditorName,
                amountCents: statutoryRoute ? r.availableCents : amount,
              })),
          },
        },
        include: { allocations: true },
      });
      await this.log(tx, a, b.id, 'PREPARED', d.reason);
      return this.safe(b);
    });
  }
  private async live(tx: Tx, a: TenantJwtUser, b: Batch) {
    const [p, f] = await Promise.all([
      this.profile(tx, a, b.beneficiaryId),
      tx.companyBankingProfile.findFirst({
        where: {
          id: b.fundingProfileId,
          organizationId: a.organizationId,
          status: 'APPROVED',
        },
      }),
    ]);
    if (p.status !== 'APPROVED' || !f)
      throw new BadRequestException(
        'Beneficiary or funding is no longer approved; cancel and prepare again.',
      );
  }
  async approve(a: TenantJwtUser, id: string, d: RemittanceActionDto) {
    return this.mutation(
      a,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, a, id);
        if (b.status !== 'PREPARED' || b.preparedBy === a.sub)
          throw new BadRequestException(
            'Independent release approval of a prepared batch required.',
          );
        await this.live(tx, a, b);
        await tx.remittancePaymentBatch.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedBy: a.sub,
            approvedAt: new Date(),
          },
        });
        await this.log(tx, a, id, 'RELEASE_APPROVED', d.reason);
        return this.safe(await this.batch(tx, a, id));
      },
    );
  }
  async cancel(a: TenantJwtUser, id: string, d: RemittanceActionDto) {
    return this.mutation(
      a,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, a, id);
        if (!['PREPARED', 'APPROVED'].includes(b.status))
          throw new BadRequestException(
            'Only unsubmitted batches can be cancelled.',
          );
        await tx.remittancePaymentBatch.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
        await this.log(tx, a, id, 'CANCELLED', d.reason);
        return this.safe(await this.batch(tx, a, id));
      },
    );
  }
  async inspect(a: TenantJwtUser, id: string, d: RemittanceActionDto) {
    return this.mutation(
      a,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, a, id);
        if (!['APPROVED', 'SUBMITTED'].includes(b.status))
          throw new BadRequestException(
            'Release required for payment instruction inspection.',
          );
        await this.log(tx, a, id, 'BANK_DETAILS_INSPECTED', d.reason);
        return {
          funding: b.fundingSnapshot,
          beneficiary: b.beneficiarySnapshot,
          paymentReference: b.paymentReference,
          totalCents: b.totalCents,
          route: b.route,
        };
      },
    );
  }
  async submit(a: TenantJwtUser, id: string, d: SubmitRemittanceDto) {
    if (d.bankReference.trim().length < 3 || d.evidence.trim().length < 10)
      throw new BadRequestException(
        'Traceable bank/portal reference and evidence required.',
      );
    return this.mutation(
      a,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, a, id),
          method = b.route === 'BANK_TRANSFER' ? 'MANUAL_BANK_PORTAL' : b.route;
        if (b.status !== 'APPROVED' || d.method !== method)
          throw new BadRequestException(
            'Released batch must use its approved bank or official statutory portal route.',
          );
        await this.live(tx, a, b);
        await tx.remittancePaymentBatch.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedBy: a.sub,
            submittedAt: new Date(),
            submissionReference: d.bankReference,
            submissionEvidence: d.evidence,
          },
        });
        await this.log(tx, a, id, 'SUBMISSION_RECORDED', d.reason);
        return this.safe(await this.batch(tx, a, id));
      },
    );
  }
  async result(a: TenantJwtUser, id: string, d: RemittanceResultDto) {
    if (
      !['PAID', 'FAILED', 'MISMATCH'].includes(d.outcome) ||
      !Number.isSafeInteger(d.actualPaidCents) ||
      d.actualPaidCents < 0 ||
      d.actualPaidCents > 1000000000
    )
      throw new BadRequestException(
        'Valid actual bank amount and outcome required.',
      );
    const date = new Date(d.paidAt),
      reference = d.bankReference.trim().replace(/\s+/g, ' ').toUpperCase();
    if (
      !Number.isFinite(date.getTime()) ||
      date > new Date() ||
      reference.length < 3 ||
      d.evidence.trim().length < 10
    )
      throw new BadRequestException(
        'Valid nonfuture bank date, reference and evidence required.',
      );
    return this.mutation(
      a,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      async (tx, hash) => {
        await this.password(hash, d.password);
        const b = await this.batch(tx, a, id);
        if (a.sub === b.preparedBy || a.sub === b.submittedBy)
          throw new BadRequestException(
            'Independent bank-result checker required.',
          );
        const status = d.outcome === 'MISMATCH' ? 'EXCEPTION' : d.outcome;
        if (
          b.status === status &&
          b.resultReference === reference &&
          b.actualPaidCents === d.actualPaidCents &&
          b.resultEvidence === d.evidence &&
          b.resultPaidAt?.getTime() === date.getTime()
        )
          return this.safe(b);
        if (b.status !== 'SUBMITTED')
          throw new ConflictException(
            'Only a submitted batch can receive a new final outcome.',
          );
        if (
          (d.outcome === 'PAID' && d.actualPaidCents !== b.totalCents) ||
          (d.outcome === 'FAILED' && d.actualPaidCents !== 0)
        )
          throw new BadRequestException(
            'Paid must equal the frozen total; failed must have zero paid cents. Use mismatch for uncertain or partial amounts.',
          );
        if (
          await tx.payrollRemittancePayment.findFirst({
            where: {
              organizationId: a.organizationId,
              reference: { equals: reference, mode: 'insensitive' },
              status: { not: 'VOIDED' },
            },
          })
        )
          throw new ConflictException(
            'Bank reference already exists in external remittance accounting.',
          );
        await tx.remittancePaymentBatch.update({
          where: { id },
          data: {
            status,
            resultReference: reference,
            resultEvidence: d.evidence,
            resultBy: a.sub,
            resultAt: new Date(),
            actualPaidCents: d.actualPaidCents,
            resultPaidAt: date,
          },
        });
        if (d.outcome === 'PAID')
          for (const allocation of b.allocations)
            await tx.payrollRemittancePayment.create({
              data: {
                organizationId: a.organizationId,
                period: b.period,
                code: allocation.code,
                creditorName: allocation.creditorName,
                amountCents: allocation.amountCents,
                reference: `RB-${b.id}-${allocation.id}`,
                paidAt: date,
                status: 'CONFIRMED',
                createdByUserId: b.submittedBy!,
                confirmedByUserId: a.sub,
                confirmedAt: new Date(),
                batchAllocationId: allocation.id,
              },
            });
        await this.log(tx, a, id, `BANK_${d.outcome}`, d.reason);
        return this.safe(await this.batch(tx, a, id));
      },
    );
  }
  async download(a: TenantJwtUser, id: string, kind: 'report' | 'draft') {
    return this.mutation(a, Permission.EXPORT_PAYROLL_PAYMENTS, async (tx) => {
      const b = await this.batch(tx, a, id);
      if (
        !['APPROVED', 'SUBMITTED', 'PAID', 'FAILED', 'EXCEPTION'].includes(
          b.status,
        )
      )
        throw new BadRequestException('Release approval required.');
      let content: Buffer, fileName: string, contentType: string;
      if (kind === 'draft') {
        if (b.route !== 'BANK_TRANSFER')
          throw new BadRequestException(
            'Statutory payments use the approved official portal route, not bank draft files.',
          );
        const p = b.beneficiarySnapshot as Record<string, string>,
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
              employeeId: a.organizationId,
              employeeNumber: a.organizationId,
              employeeName: p.name,
              amount: b.totalCents / 100,
              currency: 'ZAR',
              bankName: p.bankName,
              accountHolderName: p.accountHolder,
              accountNumber: p.accountNumber,
              branchCode: p.branchCode,
              accountType: p.accountType,
              paymentReference: b.paymentReference,
            },
          ],
        };
        const adapter = new FnbBankservDraftAdapter(),
          check = adapter.validate(input);
        if (!check.valid)
          throw new BadRequestException({
            message: 'Ordinary remittance draft validation failed.',
            issues: check.issues,
          });
        const file = adapter.generate(input);
        content = file.content;
        fileName = `DRAFT-NOT-FOR-BANK-UPLOAD-REMITTANCE-${id}.txt`;
        contentType = file.contentType;
      } else {
        const cell = (v: unknown) =>
          '"' +
          String(v ?? '')
            .replace(/[\r\n\t]/g, ' ')
            .replace(/^(\s*[=+@-])/, "'$1")
            .replace(/"/g, '""') +
          '"';
        content = Buffer.from(
          [
            [
              'period',
              'route',
              'code',
              'creditor',
              'allocatedZAR',
              'paymentReference',
              'status',
            ]
              .map(cell)
              .join(','),
            ...b.allocations.map((r) =>
              [
                b.period,
                b.route,
                r.code,
                r.creditorName,
                (r.amountCents / 100).toFixed(2),
                b.paymentReference,
                b.status,
              ]
                .map(cell)
                .join(','),
            ),
          ].join('\r\n') + '\r\n',
        );
        fileName = `DeluxHR-remittance-preparation-${id}.csv`;
        contentType = 'text/csv; charset=utf-8';
      }
      const sha256 = createHash('sha256').update(content).digest('hex');
      await this.log(
        tx,
        a,
        id,
        kind === 'draft' ? 'DRAFT_NOT_FOR_BANK' : 'PREPARATION_REPORT',
        `SHA256 ${sha256}`,
      );
      return { content, fileName, contentType, sha256 };
    });
  }
  productionExport() {
    throw new BadRequestException(
      'No verified production bank adapter is available. Statutory payments use their official portal route.',
    );
  }
}
