import { companyReadiness } from '../../common/entitlements/company-readiness';
import { getEmployeeDocumentValidity } from '../employee-documents/document-validity';
import { CompanyDocumentDto } from './customer-onboarding.dto';
import { EmployeeDocumentsService } from '../employee-documents/employee-documents.service';
import { EmployeeDocumentStorageService } from '../employee-documents/employee-document-storage.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeePaymentDetailStatus,
  EmployeeStatus,
  Feature,
  Prisma,
  OrganizationStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../../common/auth/password';
import { ROLE_PERMISSION_PRESETS } from '../../common/access/permission-presets';
import type {
  TenantJwtUser,
  PlatformJwtUser,
} from '../../common/auth/jwt-user.type';
import {
  CreateCustomerDto,
  CreatePositionDto,
} from './customer-onboarding.dto';
const logoRoot = () =>
  join(
    process.env.DELUXHR_STORAGE_ROOT || join(process.cwd(), 'storage'),
    'company-logos',
  );
@Injectable()
export class CustomerOnboardingService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly employeeDocuments?: EmployeeDocumentsService,
    private readonly storage?: EmployeeDocumentStorageService,
  ) {}
  assertAdmin(actor: TenantJwtUser) {
    if (actor.role !== UserRole.COMPANY_ADMIN)
      throw new ForbiddenException(
        'Company administrator required for onboarding',
      );
  }
  async createCompany(actor: PlatformJwtUser, dto: CreateCustomerDto) {
    const email = dto.administratorEmail.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } }))
      throw new BadRequestException('Administrator email already in use');
    const passwordHash = await hashPassword(dto.administratorPassword);
    return this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          status: OrganizationStatus.PENDING,
        },
      });
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          fullName: dto.administratorName.trim(),
          email,
          passwordHash,
          role: UserRole.COMPANY_ADMIN,
        },
      });
      await tx.organizationOnboarding.create({
        data: { organizationId: org.id },
      });
      for (const grant of ROLE_PERMISSION_PRESETS[UserRole.COMPANY_ADMIN] ?? [])
        await tx.userPermission.create({
          data: { userId: user.id, organizationId: org.id, ...grant },
        });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          action: 'PLATFORM_COMPANY_CREATED',
          entity: 'Organization',
          entityId: org.id,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          organizationId: org.id,
          actorUserId: actor.sub,
          action: 'PLATFORM_COMPANY_CREATED',
          entity: 'Organization',
          entityId: org.id,
        },
      });
      return {
        organization: { id: org.id, name: org.name, status: org.status },
        administrator: { id: user.id, email: user.email },
      };
    });
  }

  async lookups(a: TenantJwtUser) {
    this.assertAdmin(a);
    const org = a.organizationId;
    const [departments, positions, employees, leaveTypes, policies] =
      await Promise.all([
        this.db.department.findMany({
          where: { organizationId: org },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
        this.db.position.findMany({
          where: { organizationId: org },
          orderBy: { name: 'asc' },
        }),
        this.db.employee.findMany({
          where: { organizationId: org },
          orderBy: { lastName: 'asc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            departmentId: true,
            positionId: true,
            jobTitle: true,
            createdByUserId: true,
          },
        }),
        this.db.leaveType.findMany({
          where: { organizationId: org },
          select: { id: true, name: true },
        }),
        this.db.leavePolicy.findMany({
          where: { organizationId: org },
          select: { id: true, name: true },
        }),
      ]);
    return { departments, positions, employees, leaveTypes, policies };
  }
  async position(a: TenantJwtUser, d: CreatePositionDto) {
    this.assertAdmin(a);
    return this.db
      .$transaction(async (tx) => {
        if (
          !(await tx.department.findFirst({
            where: { id: d.departmentId, organizationId: a.organizationId },
          }))
        )
          throw new BadRequestException('Department not found in company.');
        const name = d.name.trim(),
          code = d.code.trim().toUpperCase();
        if (!name || !code)
          throw new BadRequestException('Position name and code required.');
        if (
          await tx.position.findFirst({
            where: {
              organizationId: a.organizationId,
              departmentId: d.departmentId,
              OR: [{ name: { equals: name, mode: 'insensitive' } }, { code }],
            },
          })
        )
          throw new BadRequestException(
            'Position name or code already exists in department.',
          );
        const p = await tx.position.create({
          data: {
            organizationId: a.organizationId,
            departmentId: d.departmentId,
            name,
            code,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: a.organizationId,
            actorUserId: a.sub,
            action: 'POSITION_CREATED',
            entity: 'Position',
            entityId: p.id,
          },
        });
        return p;
      })
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        )
          throw new BadRequestException(
            'Position name or code already exists in department.',
          );
        throw e;
      });
  }
  async retirePosition(a: TenantJwtUser, id: string) {
    this.assertAdmin(a);
    const p = await this.db.position.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!p) throw new NotFoundException('Position not found.');
    return this.db.$transaction(async (tx) => {
      const changed = await tx.position.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          organizationId: a.organizationId,
          actorUserId: a.sub,
          action: 'POSITION_RETIRED',
          entity: 'Position',
          entityId: id,
        },
      });
      return changed;
    });
  }

  private safeCompanyDocument(d: any) {
    const { storageKey, ...safe } = d;
    return {
      ...safe,
      validity: getEmployeeDocumentValidity(d.expiresAt ?? null),
    };
  }
  async companyDocuments(a: TenantJwtUser) {
    this.assertAdmin(a);
    return (
      await this.db.companyOnboardingDocument.findMany({
        where: { organizationId: a.organizationId },
        orderBy: { createdAt: 'desc' },
      })
    ).map((d) => this.safeCompanyDocument(d));
  }
  async uploadCompanyDocument(
    a: TenantJwtUser,
    category: string,
    file: Express.Multer.File,
    metadata: Partial<CompanyDocumentDto> = {},
  ) {
    this.assertAdmin(a);
    if (
      ![
        'REGISTRATION',
        'TAX_REGISTRATION',
        'ADDRESS_PROOF',
        'OTHER',
        'COIDA_REGISTRATION',
        'COIDA_GOOD_STANDING',
        'COIDA_ASSESSMENT',
        'PSIRA_BUSINESS_REGISTRATION',
        'PSIRA_GOOD_STANDING',
        'PSIRA_EMPLOYEE_REGISTRATION',
        'PSIRA_FEE_ASSESSMENT',
      ].includes(category)
    )
      throw new BadRequestException('Unsupported company document category.');
    const date = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value + 'T00:00:00Z');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      )
        throw new BadRequestException('Use a valid calendar date.');
      return parsed;
    };
    const issuedAt = date(metadata.issuedAt),
      expiresAt = date(metadata.expiresAt);
    const compliance =
      category.startsWith('COIDA_') || category.startsWith('PSIRA_');
    const assessment = ['COIDA_ASSESSMENT', 'PSIRA_FEE_ASSESSMENT'].includes(
      category,
    );
    if (compliance && !metadata.referenceNumber?.trim())
      throw new BadRequestException('Authority reference number required.');
    if (category.endsWith('GOOD_STANDING') && (!issuedAt || !expiresAt))
      throw new BadRequestException(
        'Good standing issue and expiry dates required.',
      );
    if (issuedAt && expiresAt && expiresAt < issuedAt)
      throw new BadRequestException('Expiry cannot precede issue date.');
    if (category === 'PSIRA_EMPLOYEE_REGISTRATION') {
      if (!metadata.employeeId || !metadata.officerGrade)
        throw new BadRequestException('Employee and PSiRA grade required.');
      if (
        !(await this.db.employee.findFirst({
          where: { id: metadata.employeeId, organizationId: a.organizationId },
        }))
      )
        throw new NotFoundException('Employee not found in this company.');
    } else if (metadata.employeeId || metadata.officerGrade)
      throw new BadRequestException(
        'Employee metadata is only supported for PSiRA employee registration.',
      );
    if (assessment) {
      if (
        !metadata.assessmentAmount ||
        !/^\d{1,12}(\.\d{1,2})?$/.test(metadata.assessmentAmount) ||
        !metadata.assessmentPeriod?.trim() ||
        !/^20\d{2}-(0[1-9]|1[0-2])$/.test(metadata.liabilityPeriod ?? '') ||
        Number(metadata.assessmentAmount) > 10000000
      )
        throw new BadRequestException(
          'Assessment amount in ZAR (maximum 10 million), assessment period and liability month required.',
        );
    } else if (
      metadata.assessmentAmount ||
      metadata.assessmentPeriod ||
      metadata.liabilityPeriod
    )
      throw new BadRequestException(
        'Amounts are only supported on assessments.',
      );
    this.employeeDocuments!.validateFile(file);
    const key = await this.storage!.store({
      organizationId: a.organizationId,
      employeeId: '_company',
      file,
    });
    try {
      return await this.db.$transaction(async (tx) => {
        const d = await tx.companyOnboardingDocument.create({
          data: {
            organizationId: a.organizationId,
            category,
            referenceNumber:
              metadata.referenceNumber?.trim().toUpperCase() || null,
            issuedAt,
            expiresAt,
            employeeId: metadata.employeeId || null,
            officerGrade: metadata.officerGrade || null,
            assessmentAmount: metadata.assessmentAmount
              ? new Prisma.Decimal(metadata.assessmentAmount)
              : null,
            assessmentPeriod:
              metadata.assessmentPeriod?.trim().toUpperCase() || null,
            liabilityPeriod: metadata.liabilityPeriod || null,
            originalFileName: file.originalname
              .replace(/[\r\n]/g, ' ')
              .split(/[\\/]/)
              .pop()!
              .slice(0, 200),
            storageKey: key,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            uploadedBy: a.sub,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: a.organizationId,
            actorUserId: a.sub,
            action: 'COMPANY_DOCUMENT_UPLOADED',
            entity: 'CompanyOnboardingDocument',
            entityId: d.id,
          },
        });
        return this.safeCompanyDocument(d);
      });
    } catch (e) {
      await this.storage!.remove(key);
      throw e;
    }
  }
  async companyDocumentFile(a: TenantJwtUser, id: string) {
    this.assertAdmin(a);
    const d = await this.db.companyOnboardingDocument.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!d) throw new NotFoundException('Company document not found.');
    const buffer = await this.storage!.read(d.storageKey);
    await this.audit.log({
      organizationId: a.organizationId,
      actorUserId: a.sub,
      action: 'COMPANY_DOCUMENT_ACCESSED',
      entity: 'CompanyOnboardingDocument',
      entityId: id,
    });
    return { buffer, mimeType: d.mimeType };
  }
  async decideCompanyDocument(
    a: TenantJwtUser,
    id: string,
    status: string,
    reason: string,
  ) {
    this.assertAdmin(a);
    if (
      !['VERIFIED', 'REJECTED'].includes(status) ||
      typeof reason !== 'string' ||
      reason.trim().length < 3 ||
      reason.length > 500
    )
      throw new BadRequestException(
        'Review status and reason of 3–500 characters required.',
      );
    return this.db
      .$transaction(async (tx) => {
        const d = await tx.companyOnboardingDocument.findFirst({
          where: { id, organizationId: a.organizationId },
        });
        if (!d) throw new NotFoundException('Company document not found.');
        if (d.status !== 'PENDING_VERIFICATION' || d.uploadedBy === a.sub)
          throw new BadRequestException(
            'Independent review of a pending company document required.',
          );
        const changed = await tx.companyOnboardingDocument.updateMany({
          where: {
            id,
            organizationId: a.organizationId,
            status: 'PENDING_VERIFICATION',
          },
          data: {
            status,
            reviewedBy: a.sub,
            reviewedAt: new Date(),
            reviewReason: reason.trim(),
          },
        });
        if (!changed.count)
          throw new BadRequestException('Document already reviewed.');
        await tx.auditLog.create({
          data: {
            organizationId: a.organizationId,
            actorUserId: a.sub,
            action: 'COMPANY_DOCUMENT_' + status,
            entity: 'CompanyOnboardingDocument',
            entityId: id,
            reason: reason.trim(),
          },
        });
        return { id, status };
      })
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new BadRequestException(
            'This authority assessment reference is already verified for this assessment period. Do not record it twice.',
          );
        throw error;
      });
  }
  async logo(actor: TenantJwtUser, file: Express.Multer.File) {
    this.assertAdmin(actor);
    if (!file?.buffer || !file.size || file.size > 2 * 1024 * 1024)
      throw new BadRequestException('Logo must be a PNG or JPEG up to 2 MB');
    const bytes = file.buffer;
    const mime =
      bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        ? 'image/png'
        : bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
          ? 'image/jpeg'
          : null;
    if (!mime) throw new BadRequestException('Logo must be PNG or JPEG');
    const key = randomUUID();
    await mkdir(join(logoRoot(), actor.organizationId), { recursive: true });
    await writeFile(join(logoRoot(), actor.organizationId, key), bytes, {
      flag: 'wx',
    });
    await this.db.organization.update({
      where: { id: actor.organizationId },
      data: { logoStorageKey: key },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      action: 'ONBOARDING_LOGO_UPLOADED',
      entity: 'Organization',
      entityId: actor.organizationId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
    });
    return { mimeType: mime, uploaded: true };
  }
  async getLogo(actor: TenantJwtUser) {
    const org = await this.db.organization.findUnique({
      where: { id: actor.organizationId },
      select: { logoStorageKey: true },
    });
    if (!org?.logoStorageKey) throw new NotFoundException('Logo not found');
    const bytes = await readFile(
      join(logoRoot(), actor.organizationId, org.logoStorageKey),
    );
    return {
      bytes,
      mimeType:
        bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
          ? 'image/png'
          : 'image/jpeg',
    };
  }
  async confirm(actor: TenantJwtUser, step: string, note?: string) {
    this.assertAdmin(actor);
    if (!['PUBLIC_HOLIDAYS', 'OPENING_LEAVE', 'OPENING_PAYROLL'].includes(step))
      throw new BadRequestException('Unknown confirmation step');
    return this.db.$transaction(async (tx) => {
      const item = await tx.onboardingConfirmation.upsert({
        where: {
          organizationId_step: { organizationId: actor.organizationId, step },
        },
        create: {
          organizationId: actor.organizationId,
          step,
          confirmedByUserId: actor.sub,
          note: note?.trim(),
        },
        update: {
          confirmedAt: new Date(),
          confirmedByUserId: actor.sub,
          note: note?.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          action: 'ONBOARDING_STEP_CONFIRMED',
          entity: 'OnboardingConfirmation',
          entityId: item.id,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason: step,
        },
      });
      return item;
    });
  }
  async readiness(orgId: string) { return companyReadiness(this.db, orgId); }
}