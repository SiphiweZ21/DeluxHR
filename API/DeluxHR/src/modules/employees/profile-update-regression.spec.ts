import { EmployeesService } from './employees.service';
import { PlatformOperationsService } from '../platform-admin/platform-operations.service';

const actor = { sub: 'maker', organizationId: 'org', email: 'maker@test.invalid', role: 'COMPANY_ADMIN' } as any;
function fixture() {
  const employee = { id: 'employee', organizationId: 'org', departmentId: 'old', positionId: 'old-position', jobTitle: 'Old role', status: 'ACTIVE', updatedAt: new Date('2026-10-01'), employmentStartDate: null, employmentEndDate: null };
  const db: any = {
    employee: { findFirst: jest.fn().mockResolvedValue(employee), update: jest.fn().mockImplementation(async ({ data }) => ({ ...employee, ...data })) },
    department: { findFirst: jest.fn().mockResolvedValue({ id: 'new' }) },
    position: { findFirst: jest.fn().mockResolvedValue({ id: 'new-position', name: 'New role' }) },
    employeeProfileChange: { create: jest.fn().mockResolvedValue({ id: 'change' }), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
  };
  db.$transaction = jest.fn(async (fn) => fn(db));
  const service = new EmployeesService(db, { log: jest.fn() } as any);
  return { employee, db, service };
}
describe('employee profile update regressions', () => {
  it('queues department and position changes without changing the approved employee', async () => {
    const { db, service } = fixture();
    const result: any = await service.update('org', 'employee', { departmentId: 'new', positionId: 'new-position', jobTitle: 'New role' }, actor);
    expect(result.pendingChangeId).toBe('change');
    expect(db.employeeProfileChange.create.mock.calls[0][0].data.proposed).toMatchObject({ departmentId: 'new', positionId: 'new-position' });
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('applies the new department and role after authorised approval', async () => {
    const { employee, db, service } = fixture();
    db.employeeProfileChange.findFirst.mockResolvedValue({ id: 'change', employeeId: employee.id, status: 'PENDING', submittedByUserId: actor.sub, baseUpdatedAt: employee.updatedAt, proposed: { departmentId: 'new', positionId: 'new-position', jobTitle: 'New role' } });
    await service.reviewProfileChange({ ...actor, sub: 'checker' }, 'change', 'APPROVED');
    expect(db.employee.update.mock.calls[0][0].data).toMatchObject({ departmentId: 'new', positionId: 'new-position', jobTitle: 'New role' });
  });
  it('clears the old position when explicitly moving without a position', async () => {
    const { db, service } = fixture();
    await service.update('org', 'employee', { departmentId: 'new', positionId: null }, actor, true, db);
    expect(db.position.findFirst).not.toHaveBeenCalled();
    expect(db.employee.update.mock.calls[0][0].data).toMatchObject({ departmentId: 'new', positionId: null, jobTitle: null });
  });
  it('rejects a position outside the destination department', async () => {
    const { db, service } = fixture();
    db.position.findFirst.mockResolvedValue(null);
    await expect(service.update('org', 'employee', { departmentId: 'new', positionId: 'foreign-position' }, actor)).rejects.toThrow('destination department');
    expect(db.employeeProfileChange.create).not.toHaveBeenCalled();
  });
  it('allows the authorised submitter to approve their change', async () => {
    const { employee, db, service } = fixture();
    db.employeeProfileChange.findFirst.mockResolvedValue({ employeeId: employee.id, status: 'PENDING', submittedByUserId: actor.sub, baseUpdatedAt:employee.updatedAt, proposed:{departmentId:'new'} });
    await service.reviewProfileChange(actor, 'change', 'APPROVED');
    expect(db.employee.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({departmentId:'new'})}));
  });
});
it('returns package details immediately after subscription assignment', async () => {
  const pack = { id: 'pack', name: 'Payroll', features: ['CORE_HR', 'PAYROLL'], employeeLimit: null };
  const tx: any = { $queryRaw: jest.fn(), platformSubscription: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'sub', packageId: pack.id, status: 'ACTIVE' }) }, organizationFeature: { upsert: jest.fn() }, auditLog: { create: jest.fn() }, platformAuditEvent: { create: jest.fn() } };
  const db: any = { organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org' }) }, platformPackage: { findFirst: jest.fn().mockResolvedValue(pack) }, $transaction: (fn: any) => fn(tx) };
  const result = await new PlatformOperationsService(db).subscription(actor, 'org', { packageId: pack.id, status: 'ACTIVE', reason: 'Enable payroll' } as any);
  expect(result.package.name).toBe('Payroll');
});
