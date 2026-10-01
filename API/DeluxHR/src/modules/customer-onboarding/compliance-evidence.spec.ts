import { CustomerOnboardingService } from './customer-onboarding.service';
const actor: any = {
  sub: 'maker',
  role: 'COMPANY_ADMIN',
  organizationId: 'org',
};
function setup() {
  const db: any = {
    employee: { findFirst: jest.fn(async () => ({ id: 'employee' })) },
    companyOnboardingDocument: {
      create: jest.fn(async ({ data }) => ({ ...data, id: 'doc' })),
      findMany: jest.fn(async () => []),
    },
    auditLog: { create: jest.fn(async () => {}) },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  const storage: any = {
    store: jest.fn(async () => 'secret'),
    remove: jest.fn(),
  };
  return {
    db,
    storage,
    s: new CustomerOnboardingService(
      db,
      {} as any,
      { validateFile: jest.fn() } as any,
      storage,
    ),
  };
}
const file: any = {
  originalname: 'proof.pdf',
  mimetype: 'application/pdf',
  size: 5,
};
describe('Compliance evidence', () => {
  it('requires references and both good standing dates before storing bytes', async () => {
    const x = setup();
    await expect(
      x.s.uploadCompanyDocument(actor, 'COIDA_GOOD_STANDING', file, {}),
    ).rejects.toThrow();
    await expect(
      x.s.uploadCompanyDocument(actor, 'PSIRA_GOOD_STANDING', file, {
        referenceNumber: '123',
      }),
    ).rejects.toThrow();
    expect(x.storage.store).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', 'bad'])(
    'rejects invalid date %s',
    async (issuedAt) => {
      const x = setup();
      await expect(
        x.s.uploadCompanyDocument(actor, 'PSIRA_GOOD_STANDING', file, {
          referenceNumber: '123',
          issuedAt,
          expiresAt: '2026-12-01',
        }),
      ).rejects.toThrow();
    },
  );
  it('rejects reversed dates', async () => {
    await expect(
      setup().s.uploadCompanyDocument(actor, 'COIDA_GOOD_STANDING', file, {
        referenceNumber: '123',
        issuedAt: '2026-12-01',
        expiresAt: '2026-01-01',
      }),
    ).rejects.toThrow();
  });
  it('persists evidence pending independent review with expiry status and no storage key', async () => {
    const x = setup();
    const d = await x.s.uploadCompanyDocument(
      actor,
      'PSIRA_GOOD_STANDING',
      file,
      {
        referenceNumber: '123',
        issuedAt: '2025-01-01',
        expiresAt: '2025-02-01',
      },
    );
    expect(d.validity.status).toBe('EXPIRED');
    expect(d.storageKey).toBeUndefined();
    expect(x.db.auditLog.create).toHaveBeenCalled();
    expect(d.uploadedBy).toBe('maker');
  });
  it('rejects employee from another tenant', async () => {
    const x = setup();
    x.db.employee.findFirst.mockResolvedValue(null);
    await expect(
      x.s.uploadCompanyDocument(actor, 'PSIRA_EMPLOYEE_REGISTRATION', file, {
        referenceNumber: '123',
        employeeId: 'foreign',
        officerGrade: 'C',
      }),
    ).rejects.toThrow();
    expect(x.db.employee.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org' },
    });
    expect(x.storage.store).not.toHaveBeenCalled();
  });
  it('stores an exact ZAR assessment amount and rejects negative or non-assessment amounts', async () => {
    const x = setup();
    const d = await x.s.uploadCompanyDocument(actor, 'COIDA_ASSESSMENT', file, {
      referenceNumber: 'CF123',
      assessmentAmount: '1234.56',
      assessmentPeriod: '2026',
      liabilityPeriod: '2026-09',
    });
    expect(String(d.assessmentAmount)).toBe('1234.56');
    await expect(
      x.s.uploadCompanyDocument(actor, 'COIDA_ASSESSMENT', file, {
        referenceNumber: 'CF123',
        assessmentAmount: '-1',
        assessmentPeriod: '2026',
        liabilityPeriod: '2026-09',
      }),
    ).rejects.toThrow();
    await expect(
      x.s.uploadCompanyDocument(actor, 'COIDA_REGISTRATION', file, {
        referenceNumber: 'CF123',
        assessmentAmount: '1',
      }),
    ).rejects.toThrow();
  });
  it('removes stored bytes when the transaction fails', async () => {
    const x = setup();
    x.db.$transaction.mockRejectedValue(new Error('db'));
    await expect(
      x.s.uploadCompanyDocument(actor, 'COIDA_REGISTRATION', file, {
        referenceNumber: '123',
      }),
    ).rejects.toThrow('db');
    expect(x.storage.remove).toHaveBeenCalledWith('secret');
  });
});
