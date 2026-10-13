import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeeWorkLocationsService } from './employee-work-locations.service';
const actor = {
  sub: 'admin',
  email: 'admin@example.test',
  role: 'COMPANY_ADMIN',
  organizationId: 'org',
} as any;
function setup(overlaps: any[] = []) {
  const tx = {
    employeeWorkLocationAssignment: {
      findMany: jest.fn().mockResolvedValue(overlaps),
      findFirst: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(async ({ data, where }) => ({
          id: where.id,
          employeeId: 'e',
          workLocationId: 's',
          ...data,
        })),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'new', ...data })),
    },
  };
  const db = {
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 'e' }) },
    workLocation: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 's',
          isActive: true,
          code: 'SITE',
          name: 'Site',
        }),
    },
    employeeWorkLocationAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn) => fn(tx)),
  };
  const audit = { log: jest.fn() };
  return {
    tx,
    db,
    audit,
    service: new EmployeeWorkLocationsService(db as any, audit as any),
  };
}
describe('Dated employee site assignments', () => {
  it('ends an earlier overlapping primary assignment and records the new range', async () => {
    const { service, tx, audit } = setup([
      { id: 'old', effectiveFrom: new Date('2026-10-01Z') },
    ]);
    await service.assign(
      'org',
      'e',
      {
        workLocationId: 's',
        effectiveFrom: '2026-10-13T00:00:00Z',
        effectiveTo: '2026-11-01T00:00:00Z',
      },
      actor,
    );
    expect(tx.employeeWorkLocationAssignment.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: {
        effectiveTo: new Date('2026-10-13T00:00:00Z'),
        endedByUserId: 'admin',
      },
    });
    expect(tx.employeeWorkLocationAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org',
          employeeId: 'e',
          effectiveTo: new Date('2026-11-01T00:00:00Z'),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_WORK_LOCATION_ASSIGNED' }),
    );
  });
  it('rejects invalid date ranges before any transaction', async () => {
    const { service, db } = setup();
    await expect(
      service.assign(
        'org',
        'e',
        {
          workLocationId: 's',
          effectiveFrom: '2026-10-13Z',
          effectiveTo: '2026-10-12Z',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('does not overwrite an overlapping future assignment', async () => {
    const { service, tx } = setup([
      { id: 'future', effectiveFrom: new Date('2026-10-20Z') },
    ]);
    await expect(
      service.assign(
        'org',
        'e',
        { workLocationId: 's', effectiveFrom: '2026-10-13Z' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.employeeWorkLocationAssignment.update).not.toHaveBeenCalled();
    expect(tx.employeeWorkLocationAssignment.create).not.toHaveBeenCalled();
  });
  it('rejects an employee outside the company', async () => {
    const { service, db } = setup();
    db.employee.findFirst.mockResolvedValue(null as any);
    await expect(
      service.assign('org', 'e', { workLocationId: 's' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects an inactive site', async () => {
    const { service, db } = setup();
    db.workLocation.findFirst.mockResolvedValue({
      id: 's',
      isActive: false,
      code: 'SITE',
      name: 'Site',
    });
    await expect(
      service.assign('org', 'e', { workLocationId: 's' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('scopes ending to both the employee and company', async () => {
    const { service, tx } = setup();
    tx.employeeWorkLocationAssignment.findFirst.mockResolvedValue(null);
    await expect(
      service.end('org', 'e', 'foreign', '2026-10-14Z', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.employeeWorkLocationAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org', employeeId: 'e' },
    });
    expect(tx.employeeWorkLocationAssignment.update).not.toHaveBeenCalled();
  });
  it('ends an assignment and audits the action', async () => {
    const { service, tx, audit } = setup();
    tx.employeeWorkLocationAssignment.findFirst.mockResolvedValue({
      id: 'old',
      effectiveFrom: new Date('2026-10-01Z'),
      effectiveTo: null,
    });
    await service.end('org', 'e', 'old', '2026-10-14Z', actor);
    expect(tx.employeeWorkLocationAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { effectiveTo: new Date('2026-10-14Z'), endedByUserId: 'admin' },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_LOCATION_ENDED',
        actorUserId: 'admin',
      }),
    );
  });
  it('does not extend an already ended range', async () => {
    const { service, tx } = setup();
    tx.employeeWorkLocationAssignment.findFirst.mockResolvedValue({
      id: 'old',
      effectiveFrom: new Date('2026-10-01Z'),
      effectiveTo: new Date('2026-10-14Z'),
    });
    await expect(
      service.end('org', 'e', 'old', '2026-10-15Z', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.employeeWorkLocationAssignment.update).not.toHaveBeenCalled();
  });
  it('current sites use the start and exclusive end boundaries', async () => {
    const { service, db } = setup();
    await service.current('org', 'e');
    const where =
      db.employeeWorkLocationAssignment.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.effectiveFrom.lte).toBeInstanceOf(Date);
    expect(where.OR[1].effectiveTo.gt).toEqual(where.effectiveFrom.lte);
  });
});
