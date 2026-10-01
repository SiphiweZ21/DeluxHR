import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeDocumentStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';
import {
  DEFAULT_EMPLOYEE_DOCUMENT_CHECKLIST,
  type EmployeeDocumentChecklistStatus,
} from './document-checklist';
import {
  EMPLOYEE_DOCUMENT_REQUIREMENTS,
  getEmployeeDocumentRequirement,
} from './document-requirements';
import {
  DEFAULT_DOCUMENT_EXPIRY_WARNING_DAYS,
  getEmployeeDocumentValidity,
} from './document-validity';
import { EmployeeDocumentStorageService } from './employee-document-storage.service';

@Injectable()
export class EmployeeDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: EmployeeDocumentStorageService,
  ) {}

  async upload(
    organizationId: string,
    employeeId: string,
    dto: UploadEmployeeDocumentDto,
    file: Express.Multer.File,
    actor: TenantJwtUser,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    this.validateFile(file);
    this.validateDocumentDates(dto);

    const requirement = getEmployeeDocumentRequirement(dto.documentType);

    if (dto.expiresAt && !requirement.expirySupported) {
      throw new BadRequestException(
        `${requirement.label} does not support an expiry date.`,
      );
    }

    const storageKey = await this.storageService.store({
      organizationId,
      employeeId,
      file,
    });

    try {
      const document = await this.prisma.$transaction(async (transaction) => {
        const createdDocument = await transaction.employeeDocument.create({
          data: {
            organizationId,
            employeeId,
            documentType: dto.documentType,
            originalFileName: this.sanitizeOriginalFileName(file.originalname),
            storageKey,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            uploadedByUserId: actor.sub,
          },
        });

        await this.auditService.log(
          {
            organizationId,
            action: 'EMPLOYEE_DOCUMENT_UPLOADED',
            entity: 'EmployeeDocument',
            entityId: createdDocument.id,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              employeeId,
              documentType: createdDocument.documentType,
              mimeType: createdDocument.mimeType,
              fileSizeBytes: createdDocument.fileSizeBytes,
            },
          },
          transaction,
        );

        return createdDocument;
      });

      return this.toSafeDocument(document);
    } catch (error) {
      await this.storageService.remove(storageKey);

      throw error;
    }
  }

  async list(organizationId: string, employeeId: string) {
    await this.requireEmployee(organizationId, employeeId);

    const documents = await this.prisma.employeeDocument.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const now = new Date();

    return documents.map((document) => this.toSafeDocument(document, now));
  }

  async getChecklist(organizationId: string, employeeId: string) {
    await this.requireEmployee(organizationId, employeeId);

    const documents = await this.prisma.employeeDocument.findMany({
      where: {
        organizationId,
        employeeId,
        replacedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const now = new Date();

    const items = Object.values(EMPLOYEE_DOCUMENT_REQUIREMENTS).map(
      (requirement) => {
        const documentsForType = documents.filter(
          (document) => document.documentType === requirement.type,
        );

        const selected = this.selectChecklistDocument(documentsForType, now);

        const expectedByDefault = DEFAULT_EMPLOYEE_DOCUMENT_CHECKLIST.includes(
          requirement.type,
        );

        if (!selected) {
          return {
            documentType: requirement.type,
            label: requirement.label,
            category: requirement.category,
            expectedByDefault,
            verificationRequired: requirement.verificationRequired,
            expirySupported: requirement.expirySupported,

            status: 'MISSING' as EmployeeDocumentChecklistStatus,

            verificationStatus: null,
            validityStatus: null,
            daysUntilExpiry: null,
            expiryWarningDays: DEFAULT_DOCUMENT_EXPIRY_WARNING_DAYS,

            documentId: null,
            issuedAt: null,
            expiresAt: null,
            uploadedAt: null,
          };
        }

        const validity = getEmployeeDocumentValidity(selected.expiresAt, now);

        const checklistStatus = this.getChecklistStatus(selected, now);

        return {
          documentType: requirement.type,
          label: requirement.label,
          category: requirement.category,
          expectedByDefault,
          verificationRequired: requirement.verificationRequired,
          expirySupported: requirement.expirySupported,

          status: checklistStatus,

          verificationStatus: selected.status,
          validityStatus: validity.status,
          daysUntilExpiry: validity.daysUntilExpiry,
          expiryWarningDays: validity.expiryWarningDays,

          documentId: selected.id,
          issuedAt: selected.issuedAt,
          expiresAt: selected.expiresAt,
          uploadedAt: selected.createdAt,
        };
      },
    );

    const trackedItems = items.filter((item) => item.expectedByDefault);

    const allRecordedItems = items.filter((item) => item.documentId !== null);

    const summary = {
      tracked: trackedItems.length,

      missing: trackedItems.filter((item) => item.status === 'MISSING').length,

      pendingVerification: trackedItems.filter(
        (item) =>
          item.verificationStatus ===
          EmployeeDocumentStatus.PENDING_VERIFICATION,
      ).length,

      verified: trackedItems.filter(
        (item) => item.verificationStatus === EmployeeDocumentStatus.VERIFIED,
      ).length,

      rejected: trackedItems.filter(
        (item) => item.verificationStatus === EmployeeDocumentStatus.REJECTED,
      ).length,

      expired: allRecordedItems.filter(
        (item) => item.validityStatus === 'EXPIRED',
      ).length,

      expiringSoon: allRecordedItems.filter(
        (item) => item.validityStatus === 'EXPIRING_SOON',
      ).length,
    };

    return {
      employeeId,

      informationalOnly: true,
      blocksEmployeeActivation: false,
      blocksPayrollEligibility: false,

      expiryWarningDays: DEFAULT_DOCUMENT_EXPIRY_WARNING_DAYS,

      summary,
      items,
    };
  }

  async findOne(
    organizationId: string,
    employeeId: string,
    documentId: string,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const document = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    return this.toSafeDocument(document);
  }

  async getFile(
    organizationId: string,
    employeeId: string,
    documentId: string,
    actor: TenantJwtUser,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const document = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    const buffer = await this.storageService.read(document.storageKey);

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_DOCUMENT_ACCESSED',
      entity: 'EmployeeDocument',
      entityId: document.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        documentType: document.documentType,
      },
    });

    return {
      buffer,
      fileName: document.originalFileName,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
    };
  }

  async verify(
    organizationId: string,
    employeeId: string,
    documentId: string,
    actor: TenantJwtUser,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const document = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    if (document.uploadedByUserId === actor.sub)
      throw new BadRequestException(
        'A different user must review the uploaded document.',
      );
    if (document.status !== EmployeeDocumentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        'Only a pending employee document can be verified.',
      );
    }

    const now = new Date();

    const result = await this.prisma.employeeDocument.updateMany({
      where: {
        id: documentId,
        organizationId,
        employeeId,
        status: EmployeeDocumentStatus.PENDING_VERIFICATION,
      },
      data: {
        status: EmployeeDocumentStatus.VERIFIED,
        verifiedAt: now,
        verifiedByUserId: actor.sub,

        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
      },
    });

    if (result.count !== 1) {
      throw new BadRequestException(
        'The employee document is no longer pending verification. Refresh and try again.',
      );
    }

    const updatedDocument = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_DOCUMENT_VERIFIED',
      entity: 'EmployeeDocument',
      entityId: documentId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        documentType: updatedDocument.documentType,
        previousStatus: EmployeeDocumentStatus.PENDING_VERIFICATION,
        newStatus: EmployeeDocumentStatus.VERIFIED,
      },
    });

    return this.toSafeDocument(updatedDocument, now);
  }

  async reject(
    organizationId: string,
    employeeId: string,
    documentId: string,
    reason: string,
    actor: TenantJwtUser,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const document = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    if (document.uploadedByUserId === actor.sub)
      throw new BadRequestException(
        'A different user must review the uploaded document.',
      );
    if (document.status !== EmployeeDocumentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        'Only a pending employee document can be rejected.',
      );
    }

    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const now = new Date();

    const result = await this.prisma.employeeDocument.updateMany({
      where: {
        id: documentId,
        organizationId,
        employeeId,
        status: EmployeeDocumentStatus.PENDING_VERIFICATION,
      },
      data: {
        status: EmployeeDocumentStatus.REJECTED,
        rejectedAt: now,
        rejectedByUserId: actor.sub,
        rejectionReason: normalizedReason,

        verifiedAt: null,
        verifiedByUserId: null,
      },
    });

    if (result.count !== 1) {
      throw new BadRequestException(
        'The employee document is no longer pending verification. Refresh and try again.',
      );
    }

    const updatedDocument = await this.requireDocument(
      organizationId,
      employeeId,
      documentId,
    );

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_DOCUMENT_REJECTED',
      entity: 'EmployeeDocument',
      entityId: documentId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      reason: normalizedReason,
      metadata: {
        employeeId,
        documentType: updatedDocument.documentType,
        previousStatus: EmployeeDocumentStatus.PENDING_VERIFICATION,
        newStatus: EmployeeDocumentStatus.REJECTED,
      },
    });

    return this.toSafeDocument(updatedDocument, now);
  }

  private selectChecklistDocument<
    T extends {
      status: EmployeeDocumentStatus;
      expiresAt: Date | null;
      createdAt: Date;
    },
  >(documents: T[], now: Date): T | null {
    if (documents.length === 0) {
      return null;
    }

    const sorted = [...documents].sort((left, right) => {
      const priorityDifference =
        this.getChecklistPriority(left, now) -
        this.getChecklistPriority(right, now);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return sorted[0] ?? null;
  }

  private getChecklistPriority(
    document: {
      status: EmployeeDocumentStatus;
      expiresAt: Date | null;
    },
    now: Date,
  ): number {
    const validity = getEmployeeDocumentValidity(document.expiresAt, now);

    if (validity.status === 'EXPIRED') {
      return 4;
    }

    switch (document.status) {
      case EmployeeDocumentStatus.VERIFIED:
        return 1;

      case EmployeeDocumentStatus.PENDING_VERIFICATION:
        return 2;

      case EmployeeDocumentStatus.REJECTED:
        return 3;

      default:
        return 4;
    }
  }

  private getChecklistStatus(
    document: {
      status: EmployeeDocumentStatus;
      expiresAt: Date | null;
    },
    now: Date,
  ): EmployeeDocumentChecklistStatus {
    const validity = getEmployeeDocumentValidity(document.expiresAt, now);

    if (validity.status === 'EXPIRED') {
      return 'EXPIRED';
    }

    switch (document.status) {
      case EmployeeDocumentStatus.VERIFIED:
        return 'VERIFIED';

      case EmployeeDocumentStatus.PENDING_VERIFICATION:
        return 'PENDING_VERIFICATION';

      case EmployeeDocumentStatus.REJECTED:
        return 'REJECTED';

      default:
        return 'MISSING';
    }
  }

  private async requireEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private async requireDocument(
    organizationId: string,
    employeeId: string,
    documentId: string,
  ) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        organizationId,
        employeeId,
      },
    });

    if (!document) {
      throw new NotFoundException('Employee document not found.');
    }

    return document;
  }

  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('A document file is required.');
    }

    const allowedMimeTypes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported document type. Only PDF, JPEG and PNG files are allowed.',
      );
    }

    const signatures: Record<string, number[]> = {
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'image/jpeg': [0xff, 0xd8, 0xff],
      'image/png': [0x89, 0x50, 0x4e, 0x47],
    };
    const signature = signatures[file.mimetype];
    if (
      !file.buffer ||
      file.buffer.length < signature.length ||
      !signature.every((byte, index) => file.buffer[index] === byte)
    ) {
      throw new BadRequestException(
        'File contents do not match the declared document type.',
      );
    }

    const maximumFileSize = 10 * 1024 * 1024;

    if (file.size <= 0) {
      throw new BadRequestException('The uploaded document is empty.');
    }

    if (file.size > maximumFileSize) {
      throw new BadRequestException(
        'The uploaded document exceeds the 10 MB limit.',
      );
    }
  }

  private validateDocumentDates(dto: UploadEmployeeDocumentDto): void {
    if (!dto.issuedAt || !dto.expiresAt) {
      return;
    }

    const issuedAt = new Date(dto.issuedAt);

    const expiresAt = new Date(dto.expiresAt);

    if (expiresAt <= issuedAt) {
      throw new BadRequestException(
        'Document expiry date must be after the issue date.',
      );
    }
  }

  private sanitizeOriginalFileName(value: string): string {
    const normalized = value
      .replace(/[\/\\]/g, '_')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim();

    if (!normalized) {
      return 'document';
    }

    return normalized.slice(0, 255);
  }

  private toSafeDocument<
    T extends {
      storageKey: string;
      expiresAt: Date | null;
    },
  >(document: T, now: Date = new Date()) {
    const { storageKey: _storageKey, ...safeDocument } = document;

    const validity = getEmployeeDocumentValidity(document.expiresAt, now);

    return {
      ...safeDocument,

      validityStatus: validity.status,

      daysUntilExpiry: validity.daysUntilExpiry,

      expiryWarningDays: validity.expiryWarningDays,
    };
  }
}
