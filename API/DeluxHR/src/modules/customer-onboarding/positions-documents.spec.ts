import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { EmployeesService } from '../employees/employees.service';
import { EmployeeDocumentsService } from '../employee-documents/employee-documents.service';
import { EmployeeDocumentStorageService } from '../employee-documents/employee-document-storage.service';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const actor: any = {
  sub: 'admin',
  role: 'COMPANY_ADMIN',
  organizationId: 'org',
  email: 'admin@test',
};
function setup() {
  const tx: any = {
    department: { findFirst: jest.fn(async () => ({ id: 'dept' })) },
    position: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ ...data, id: 'pos' })),
      update: jest.fn(async ({ data }: any) => ({ ...data, id: 'pos' })),
      findMany: jest.fn(async () => [
        { id: 'pos', name: 'Assistant', departmentId: 'dept', isActive: true },
      ]),
    },
    employee: { findMany: jest.fn(async () => [{ id: 'employee' }]) },
    leaveType: { findMany: jest.fn(async () => []) },
    leavePolicy: { findMany: jest.fn(async () => []) },
    companyOnboardingDocument: {
      findFirst: jest.fn(async () => ({
        id: 'doc',
        uploadedBy: 'maker',
        status: 'PENDING_VERIFICATION',
        storageKey: 'private-key',
      })),
      create: jest.fn(async ({ data }: any) => ({ ...data, id: 'doc' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => [{ id: 'doc', storageKey: 'secret' }]),
    },
    auditLog: { create: jest.fn(async () => {}) },
  };
  tx.department.findMany = jest.fn(async () => [
    { id: 'dept', name: 'Operations' },
  ]);
  const db: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) },
    audit: any = { log: jest.fn(async () => {}) },
    validator: any = { validateFile: jest.fn() },
    storage: any = {
      store: jest.fn(async () => 'org/_company/random.pdf'),
      remove: jest.fn(async () => {}),
      read: jest.fn(async () => Buffer.from('%PDF')),
    };
  return {
    s: new CustomerOnboardingService(db, audit, validator, storage),
    db,
    tx,
    audit,
    storage,
    validator,
  };
}
describe('Positions and saved onboarding lookups', () => {
  it('creates department-linked normalized positions with atomic audit', async () => {
    const x = setup();
    const p = await x.s.position(actor, {
      departmentId: 'dept',
      name: ' Assistant ',
      code: ' ops-1 ',
    });
    expect(p).toMatchObject({
      organizationId: 'org',
      departmentId: 'dept',
      name: 'Assistant',
      code: 'OPS-1',
    });
    expect(x.tx.auditLog.create).toHaveBeenCalled();
  });
  it('rejects departments from another company and case-insensitive duplicate names', async () => {
    const x = setup();
    x.tx.department.findFirst.mockResolvedValue(null);
    await expect(
      x.s.position(actor, {
        departmentId: 'foreign',
        name: 'Assistant',
        code: 'OPS',
      }),
    ).rejects.toThrow('company');
    const y = setup();
    y.tx.position.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      y.s.position(actor, {
        departmentId: 'dept',
        name: 'assistant',
        code: 'OPS',
      }),
    ).rejects.toThrow('already exists');
  });
  it('limits setup to company administrators and scopes all saved lookup queries', async () => {
    const x = setup();
    await expect(
      x.s.lookups({ ...actor, role: 'EMPLOYEE' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const w = await x.s.lookups(actor);
    expect(w.positions).toHaveLength(1);
    for (const table of [
      'department',
      'position',
      'employee',
      'leaveType',
      'leavePolicy',
    ])
      expect(x.db[table].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org' } }),
      );
  });
  it('retires rather than deletes positions; foreign position ids fail', async () => {
    const x = setup();
    await expect(x.s.retirePosition(actor, 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    x.tx.position.findFirst.mockResolvedValue({ id: 'pos' });
    await x.s.retirePosition(actor, 'pos');
    expect(x.tx.position.update).toHaveBeenCalledWith({
      where: { id: 'pos' },
      data: { isActive: false },
    });
  });
  it('resolves position title and import metadata; rejects foreign/retired positions and title mismatch', async () => {
    const tx: any = {
        employee: { findFirst: jest.fn(async () => null) },
        position: {
          findFirst: jest.fn(async () => ({ id: 'pos', name: 'Assistant' })),
        },
      },
      s: any = new EmployeesService({} as any, {} as any),
      d = {
        firstName: 'Test',
        lastName: 'Person',
        phoneNumber: '123',
        departmentId: 'dept',
        positionId: 'pos',
        employmentType: 'PERMANENT',
        employmentStartDate: '2026-09-01',
        identityType: 'OTHER',
        identityNumber: ' TEST-01 ',
      };
    const fields = await s.positionFields(tx, 'org', 'dept', d);
    expect(fields).toMatchObject({
      positionId: 'pos',
      jobTitle: 'Assistant',
      identityNumber: 'TEST-01',
    });
    expect(fields.employmentStartDate).toBeInstanceOf(Date);
    expect(tx.position.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pos',
        organizationId: 'org',
        departmentId: 'dept',
        isActive: true,
      },
    });
    await expect(
      s.positionFields(tx, 'org', 'dept', { ...d, jobTitle: 'Manager' }),
    ).rejects.toThrow('match');
    tx.position.findFirst.mockResolvedValue(null);
    await expect(s.positionFields(tx, 'org', 'dept', d)).rejects.toThrow(
      'active position',
    );
  });
  it('keeps legacy free-text job titles and rejects reversed employment dates', async () => {
    const s: any = new EmployeesService({} as any, {} as any),
      d = {
        firstName: 'Test',
        lastName: 'Person',
        phoneNumber: '123',
        jobTitle: ' Legacy title ',
      };
    expect(await s.positionFields({}, 'org', 'dept', d)).toMatchObject({
      jobTitle: 'Legacy title',
      positionId: undefined,
    });
    await expect(
      s.positionFields({}, 'org', 'dept', {
        ...d,
        employmentStartDate: '2026-09-02',
        employmentEndDate: '2026-09-01',
      }),
    ).rejects.toThrow('precede');
  });
});
describe('Private company document onboarding', () => {
  const file: any = {
    originalname: 'registration.pdf',
    mimetype: 'application/pdf',
    size: 9,
    buffer: Buffer.from('%PDF-1.7\n'),
  };
  it('validates file before storing and returns metadata without a storage key', async () => {
    const x = setup();
    const d = await x.s.uploadCompanyDocument(actor, 'REGISTRATION', file);
    expect(x.validator.validateFile).toHaveBeenCalledWith(file);
    expect(x.storage.store).toHaveBeenCalledWith({
      organizationId: 'org',
      employeeId: '_company',
      file,
    });
    expect(d).not.toHaveProperty('storageKey');
    expect(x.tx.auditLog.create).toHaveBeenCalled();
  });
  it('cleans up stored bytes if metadata transaction fails', async () => {
    const x = setup();
    x.db.$transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(
      x.s.uploadCompanyDocument(actor, 'OTHER', file),
    ).rejects.toThrow('database unavailable');
    expect(x.storage.remove).toHaveBeenCalledWith('org/_company/random.pdf');
  });
  it('forged upload is rejected before file storage', async () => {
    const x = setup();
    x.validator.validateFile.mockImplementation(() => {
      throw new BadRequestException('forged file');
    });
    await expect(
      x.s.uploadCompanyDocument(actor, 'OTHER', file),
    ).rejects.toThrow('forged');
    expect(x.storage.store).not.toHaveBeenCalled();
  });
  it('masks company storage keys and audits same-company downloads; foreign IDs fail', async () => {
    const x = setup();
    expect(await x.s.companyDocuments(actor)).toEqual([
      {
        id: 'doc',
        validity: {
          status: 'NO_EXPIRY',
          daysUntilExpiry: null,
          expiryWarningDays: 30,
        },
      },
    ]);
    await x.s.companyDocumentFile(actor, 'doc');
    expect(x.tx.companyOnboardingDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc', organizationId: 'org' },
    });
    expect(x.audit.log).toHaveBeenCalled();
    x.tx.companyOnboardingDocument.findFirst.mockResolvedValue(null);
    await expect(
      x.s.companyDocumentFile(actor, 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('requires independent pending review and prevents concurrent/repeated decisions', async () => {
    const x = setup();
    x.tx.companyOnboardingDocument.findFirst.mockResolvedValue({
      uploadedBy: 'admin',
      status: 'PENDING_VERIFICATION',
    });
    await expect(
      x.s.decideCompanyDocument(actor, 'doc', 'VERIFIED', 'Checked document'),
    ).rejects.toThrow('Independent');
    x.tx.companyOnboardingDocument.findFirst.mockResolvedValue({
      uploadedBy: 'maker',
      status: 'VERIFIED',
    });
    await expect(
      x.s.decideCompanyDocument(actor, 'doc', 'REJECTED', 'Checked document'),
    ).rejects.toThrow('Independent');
    x.tx.companyOnboardingDocument.findFirst.mockResolvedValue({
      uploadedBy: 'maker',
      status: 'PENDING_VERIFICATION',
    });
    x.tx.companyOnboardingDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      x.s.decideCompanyDocument(actor, 'doc', 'VERIFIED', 'Checked document'),
    ).rejects.toThrow('already reviewed');
  });
  it('stores independent review and audit in one transaction', async () => {
    const x = setup();
    await x.s.decideCompanyDocument(
      actor,
      'doc',
      'VERIFIED',
      ' Checked registration ',
    );
    expect(x.tx.companyOnboardingDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'VERIFIED',
          reviewedBy: 'admin',
          reviewReason: 'Checked registration',
        }),
      }),
    );
    expect(x.tx.auditLog.create).toHaveBeenCalled();
  });
  it('existing employee file validator rejects forged and oversized files', () => {
    const s = Object.create(
      EmployeeDocumentsService.prototype,
    ) as EmployeeDocumentsService;
    expect(() =>
      s.validateFile({ ...file, buffer: Buffer.from('invalid') }),
    ).toThrow(BadRequestException);
    expect(() => s.validateFile({ ...file, size: 10485761 })).toThrow(
      BadRequestException,
    );
  });
  it('private filesystem storage survives service restart, rejects traversal and uses restricted file modes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deluxhr-storage-')),
      before = process.env.EMPLOYEE_DOCUMENT_STORAGE_ROOT;
    process.env.EMPLOYEE_DOCUMENT_STORAGE_ROOT = root;
    try {
      const s = new EmployeeDocumentStorageService(),
        key = await s.store({
          organizationId: 'org',
          employeeId: 'employee',
          file,
        });
      expect(await new EmployeeDocumentStorageService().read(key)).toEqual(
        file.buffer,
      );
      expect((await stat(join(root, key))).mode & 0o777).toBe(0o600);
      await expect(s.read('../outside.pdf')).rejects.toThrow('Invalid');
      await s.remove(key);
    } finally {
      if (before === undefined)
        delete process.env.EMPLOYEE_DOCUMENT_STORAGE_ROOT;
      else process.env.EMPLOYEE_DOCUMENT_STORAGE_ROOT = before;
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Enriched employee import', () => {
  function setup() {
    const tx: any = {
        position: {
          findFirst: jest.fn(async () => ({ id: 'pos', name: 'Assistant' })),
        },
        employee: {
          findFirst: jest.fn(async () => null),
          create: jest.fn(async ({ data }: any) => ({
            ...data,
            id: 'new',
            department: { id: 'dept' },
          })),
        },
      },
      db: any = {
        department: { findMany: jest.fn(async () => [{ id: 'dept' }]) },
        employee: {
          findMany: jest.fn(async () => []),
          findFirst: jest.fn(async () => null),
        },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      },
      audit: any = { log: jest.fn(async () => {}) },
      s: any = new EmployeesService(db, audit);
    s.assertEmployeeLimit = jest.fn(async () => {});
    s.getNextEmployeeSequence = jest.fn(async () => 1);
    return { s, db, tx };
  }
  const employee: any = {
    firstName: 'Test',
    lastName: 'Person',
    email: 'test@example.test',
    phoneNumber: '123',
    departmentId: 'dept',
    positionId: 'pos',
    employmentType: 'PERMANENT',
    employmentStartDate: '2026-09-01',
    identityType: 'OTHER',
    identityNumber: 'PILOT-01',
  };
  it('imports position, derived title and employment/identity fields in pending state', async () => {
    const x = setup();
    const r = await x.s.bulkCreate('org', [employee], actor);
    expect(r.imported).toBe(1);
    expect(x.tx.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          positionId: 'pos',
          jobTitle: 'Assistant',
          employmentType: 'PERMANENT',
          identityNumber: 'PILOT-01',
          status: 'PENDING_VERIFICATION',
          createdByUserId: 'admin',
        }),
      }),
    );
  });
  it('rejects duplicate import identities before starting a write transaction', async () => {
    const x = setup();
    await expect(
      x.s.bulkCreate(
        'org',
        [employee, { ...employee, email: 'second@example.test' }],
        actor,
      ),
    ).rejects.toThrow('Duplicate identity');
    expect(x.db.$transaction).not.toHaveBeenCalled();
  });
  it('reports duplicate emails and missing departments without writing any rows', async () => {
    const x = setup();
    const r = await x.s.bulkCreate(
      'org',
      [
        employee,
        { ...employee, departmentId: 'foreign', email: 'other@example.test' },
      ],
      actor,
    );
    expect(r.imported).toBe(0);
    expect(r.errors[0].message).toBe('Department not found');
    expect(x.db.$transaction).not.toHaveBeenCalled();
  });
});

describe('Duplicate identity protection during rich creation', () => {
  it('checks duplicate identity in the same transaction before writing a new employee', async () => {
    const s: any = new EmployeesService({} as any, {} as any),
      tx: any = {
        employee: {
          findFirst: jest.fn(async () => ({ id: 'already-present' })),
        },
      };
    await expect(
      s.positionFields(tx, 'org', 'dept', {
        firstName: 'Test',
        lastName: 'Person',
        phoneNumber: '123',
        identityType: 'OTHER',
        identityNumber: 'PILOT-01',
      }),
    ).rejects.toThrow('already belongs');
    expect(tx.employee.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        identityType: 'OTHER',
        identityNumber: 'PILOT-01',
      },
    });
  });
});

describe('Employee document boundaries', () => {
  it('cannot read bytes using another employee/company document ID', async () => {
    const db: any = {
        employee: { findFirst: jest.fn(async () => ({ id: 'employee' })) },
        employeeDocument: { findFirst: jest.fn(async () => null) },
      },
      storage: any = { read: jest.fn() },
      s = new EmployeeDocumentsService(db, {} as any, storage);
    await expect(
      s.getFile('org', 'employee', 'foreign', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.employeeDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org', employeeId: 'employee' },
    });
    expect(storage.read).not.toHaveBeenCalled();
  });
  it('rejects uploader self-verification on the existing employee document service', async () => {
    const db: any = {
        employee: { findFirst: jest.fn(async () => ({ id: 'employee' })) },
        employeeDocument: {
          findFirst: jest.fn(async () => ({
            id: 'document',
            status: 'PENDING_VERIFICATION',
            uploadedByUserId: 'admin',
          })),
          updateMany: jest.fn(),
        },
      },
      s = new EmployeeDocumentsService(db, {} as any, {} as any);
    await expect(
      s.verify('org', 'employee', 'document', actor),
    ).rejects.toThrow('different user');
    expect(db.employeeDocument.updateMany).not.toHaveBeenCalled();
  });
});

describe('Configured storage root after environment initialization', () => {
  it('uses the configured company-logo root at request time rather than module-import time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deluxhr-logo-')),
      before = process.env.DELUXHR_STORAGE_ROOT;
    process.env.DELUXHR_STORAGE_ROOT = root;
    try {
      const x = setup();
      x.db.organization = { update: jest.fn(async () => {}) };
      await x.s.logo(actor, {
        size: 8,
        buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
      } as any);
      expect(await readdir(join(root, 'company-logos', 'org'))).toHaveLength(1);
    } finally {
      if (before === undefined) delete process.env.DELUXHR_STORAGE_ROOT;
      else process.env.DELUXHR_STORAGE_ROOT = before;
      await rm(root, { recursive: true, force: true });
    }
  });
});
