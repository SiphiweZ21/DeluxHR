import { AttendanceCorrectionsService } from './attendance-corrections.service';
const actor: any = {
  sub: 'reviewer',
  organizationId: 'org',
  role: 'COMPANY_ADMIN',
  email: 'reviewer@example.com',
};
function fixture(ownEmployee = false, ownCapture = false) {
  const db: any = {
    attendanceException: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'exception',
          organizationId: 'org',
          employeeId: 'employee',
          sourceAttendanceEventId: 'event',
          status: 'OPEN',
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({
          id: 'exception',
          employeeId: 'employee',
          type: 'LOCATION_MISMATCH',
          status: 'RESOLVED',
        }),
    },
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue(ownEmployee ? { id: 'employee' } : null),
    },
    attendanceEvent: {
      findFirst: jest
        .fn()
        .mockResolvedValue(ownCapture ? { id: 'event' } : null),
    },
  };
  return {
    db,
    service: new AttendanceCorrectionsService(db, { log: jest.fn() } as any),
  };
}
describe('Attendance exception maker/checker separation', () => {
  it.each([
    [true, false],
    [false, true],
  ])(
    'rejects self-review of employee or captured evidence (%s,%s)',
    async (ownEmployee, ownCapture) => {
      const x = fixture(ownEmployee, ownCapture);
      await expect(
        x.service.resolveException(actor, 'exception', {
          status: 'RESOLVED',
          resolutionNote: 'Reviewed site evidence',
        }),
      ).rejects.toThrow('Another authorised user');
      expect(x.db.attendanceException.updateMany).not.toHaveBeenCalled();
    },
  );
  it('allows an independent authorised reviewer to resolve the exception', async () => {
    const x = fixture();
    await x.service.resolveException(actor, 'exception', {
      status: 'RESOLVED',
      resolutionNote: 'Reviewed site evidence',
    });
    expect(x.db.attendanceException.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          status: 'OPEN',
        }),
      }),
    );
  });
});
