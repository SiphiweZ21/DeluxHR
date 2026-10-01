import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyBankingProfile,
  CompanyPaymentPurpose,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { comparePassword } from '../../common/auth/password';
import { bankingAdapter, bankingCatalog } from './banking-adapters';
import {
  BankingDecisionDto,
  BankingInspectDto,
  BankingDefaultDto,
  CreateBankingProfileDto,
} from './company-banking.dto';
@Injectable()
export class CompanyBankingService {
  constructor(private readonly prisma: PrismaService) {}
  assertAdmin(actor: TenantJwtUser) {
    if (actor.role !== 'COMPANY_ADMIN' || !actor.organizationId)
      throw new ForbiddenException('Company administrator access is required.');
  }
  private reason(reason: string) {
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 3 ||
      reason.length > 500
    )
      throw new BadRequestException(
        'A reason of 3–500 characters is required.',
      );
    return reason.trim();
  }
  private safe(p: CompanyBankingProfile) {
    const { accountNumber, ...rest } = p;
    return {
      ...rest,
      accountNumberMasked: `••••${accountNumber.slice(-4)}`,
      adapter: bankingCatalog().find((a) => a.id === p.adapterId) ?? null,
      bankImportReady: false,
    };
  }
  async list(actor: TenantJwtUser) {
    this.assertAdmin(actor);
    const [profiles, defaults] = await Promise.all([
      this.prisma.companyBankingProfile.findMany({
        where: { organizationId: actor.organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.companyBankingDefault.findMany({
        where: { organizationId: actor.organizationId },
      }),
    ]);
    return {
      profiles: profiles.map((p) => this.safe(p)),
      defaults,
      adapters: bankingCatalog(),
      purposes: Object.values(CompanyPaymentPurpose),
    };
  }
  private async lock(tx: Prisma.TransactionClient, actor: TenantJwtUser) {
    this.assertAdmin(actor);
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id"=${actor.organizationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.sub} FOR UPDATE`;
    const org = await tx.organization.findUnique({
      where: { id: actor.organizationId },
      select: { status: true },
    });
    const user = await tx.user.findUnique({
      where: { id: actor.sub },
      select: {
        isActive: true,
        role: true,
        organizationId: true,
        passwordHash: true,
      },
    });
    if (
      !org ||
      !['ACTIVE', 'PENDING'].includes(org.status) ||
      !user?.isActive ||
      user.role !== 'COMPANY_ADMIN' ||
      user.organizationId !== actor.organizationId
    )
      throw new ForbiddenException(
        'Current company administrator access is required.',
      );
    return user;
  }
  private async profile(
    tx: Prisma.TransactionClient,
    actor: TenantJwtUser,
    id: string,
  ) {
    const p = await tx.companyBankingProfile.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!p) throw new NotFoundException('Banking profile not found.');
    return p;
  }
  private audit(
    tx: Prisma.TransactionClient,
    actor: TenantJwtUser,
    id: string,
    action: string,
    reason: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        entity: 'CompanyBankingProfile',
        entityId: id,
        action,
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        reason,
        metadata,
      },
    });
  }
  async create(actor: TenantJwtUser, dto: CreateBankingProfileDto) {
    this.assertAdmin(actor);
    const reason = this.reason(dto.reason),
      adapter = bankingAdapter(dto.adapterId);
    if (!adapter)
      throw new BadRequestException('Unknown bank/channel adapter.');
    if (
      !dto.name?.trim() ||
      dto.name.trim().length < 2 ||
      !dto.accountHolder?.trim() ||
      dto.accountHolder.trim().length < 2 ||
      !dto.ownReference?.trim() ||
      !/^\d{6,20}$/.test(dto.accountNumber) ||
      !/^\d{6}$/.test(dto.branchCode) ||
      !['CURRENT', 'SAVINGS', 'TRANSMISSION'].includes(dto.accountType)
    )
      throw new BadRequestException(
        'Valid funding account details are required.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actor);
      const profile = await tx.companyBankingProfile.create({
        data: {
          organizationId: actor.organizationId,
          name: dto.name.trim(),
          bank: adapter.bank,
          channel: adapter.channel,
          adapterId: adapter.id,
          adapterVersion: adapter.version,
          accountHolder: dto.accountHolder.trim(),
          accountNumber: dto.accountNumber,
          branchCode: dto.branchCode,
          accountType: dto.accountType,
          originatorId: dto.originatorId?.trim() || null,
          ownReference: dto.ownReference.trim(),
          createdByUserId: actor.sub,
        },
      });
      await this.audit(
        tx,
        actor,
        profile.id,
        'BANKING_PROFILE_SUBMITTED',
        reason,
        {
          adapterId: adapter.id,
          bank: adapter.bank,
          accountLast4: dto.accountNumber.slice(-4),
        },
      );
      return this.safe(profile);
    });
  }
  async decide(actor: TenantJwtUser, id: string, dto: BankingDecisionDto) {
    this.assertAdmin(actor);
    const reason = this.reason(dto.reason);
    if (!['APPROVED', 'REJECTED'].includes(dto.decision))
      throw new BadRequestException('Invalid decision.');
    return this.prisma.$transaction(async (tx) => {
      const checker = await this.lock(tx, actor);
      const p = await this.profile(tx, actor, id);
      if (p.status !== 'PENDING_APPROVAL')
        throw new BadRequestException('Only pending profiles can be reviewed.');
      if (p.createdByUserId === actor.sub)
        throw new ForbiddenException(
          'A different company administrator must review this profile.',
        );
      if (!(await comparePassword(dto.password, checker.passwordHash)))
        throw new BadRequestException('Current password is incorrect.');
      const result = await tx.companyBankingProfile.update({
        where: { id: p.id },
        data: {
          status: dto.decision,
          decidedByUserId: actor.sub,
          decidedAt: new Date(),
          decisionReason: reason,
        },
      });
      await this.audit(
        tx,
        actor,
        p.id,
        'BANKING_PROFILE_' + dto.decision,
        reason,
        { createdByUserId: p.createdByUserId, bankImportReady: false },
      );
      return this.safe(result);
    });
  }
  async inspect(actor: TenantJwtUser, id: string, dto: BankingInspectDto) {
    this.assertAdmin(actor);
    const reason = this.reason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      const checker = await this.lock(tx, actor);
      const p = await this.profile(tx, actor, id);
      if (p.status !== 'PENDING_APPROVAL')
        throw new BadRequestException(
          'Only pending profiles can be inspected for review.',
        );
      if (p.createdByUserId === actor.sub)
        throw new ForbiddenException(
          'A different company administrator must inspect this profile for review.',
        );
      if (!(await comparePassword(dto.password, checker.passwordHash)))
        throw new BadRequestException('Current password is incorrect.');
      await this.audit(tx, actor, p.id, 'BANKING_ACCOUNT_INSPECTED', reason, {
        accountLast4: p.accountNumber.slice(-4),
      });
      return { accountNumber: p.accountNumber };
    });
  }
  async retire(actor: TenantJwtUser, id: string, rawReason: string) {
    this.assertAdmin(actor);
    const reason = this.reason(rawReason);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actor);
      const p = await this.profile(tx, actor, id);
      if (p.status === 'RETIRED')
        throw new BadRequestException('Profile already retired.');
      const result = await tx.companyBankingProfile.update({
        where: { id: p.id },
        data: {
          status: 'RETIRED',
          retiredAt: new Date(),
          retiredByUserId: actor.sub,
        },
      });
      await tx.companyBankingDefault.deleteMany({
        where: { organizationId: actor.organizationId, profileId: p.id },
      });
      await this.audit(tx, actor, p.id, 'BANKING_PROFILE_RETIRED', reason, {
        previousStatus: p.status,
      });
      return this.safe(result);
    });
  }
  async setDefault(actor: TenantJwtUser, dto: BankingDefaultDto) {
    this.assertAdmin(actor);
    const reason = this.reason(dto.reason);
    if (!Object.values(CompanyPaymentPurpose).includes(dto.purpose))
      throw new BadRequestException('Invalid payment purpose.');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actor);
      const p = await this.profile(tx, actor, dto.profileId);
      if (p.status !== 'APPROVED')
        throw new BadRequestException(
          'Choose an independently approved profile.',
        );
      const key = {
        organizationId: actor.organizationId,
        purpose: dto.purpose,
      };
      const before = await tx.companyBankingDefault.findUnique({
        where: { organizationId_purpose: key },
      });
      const result = await tx.companyBankingDefault.upsert({
        where: { organizationId_purpose: key },
        create: { ...key, profileId: p.id, updatedByUserId: actor.sub },
        update: { profileId: p.id, updatedByUserId: actor.sub },
      });
      await this.audit(tx, actor, p.id, 'BANKING_DEFAULT_CONFIGURED', reason, {
        purpose: dto.purpose,
        previousProfileId: before?.profileId ?? null,
      });
      return result;
    });
  }
  async clearDefault(
    actor: TenantJwtUser,
    purpose: CompanyPaymentPurpose,
    rawReason: string,
  ) {
    this.assertAdmin(actor);
    const reason = this.reason(rawReason);
    if (!Object.values(CompanyPaymentPurpose).includes(purpose))
      throw new BadRequestException('Invalid payment purpose.');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, actor);
      await tx.companyBankingDefault.deleteMany({
        where: { organizationId: actor.organizationId, purpose },
      });
      await this.audit(
        tx,
        actor,
        actor.organizationId,
        'BANKING_DEFAULT_CLEARED',
        reason,
        { purpose },
      );
      return { cleared: true };
    });
  }
}
