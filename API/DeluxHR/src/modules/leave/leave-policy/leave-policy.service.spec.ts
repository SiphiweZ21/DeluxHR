import { BadRequestException } from '@nestjs/common';
import { LeaveAccrualMode } from '@prisma/client';
import { accrualForYear, countWorkingDays } from './leave-policy.service';
describe('leave policy calculations', () => {
  it('excludes weekends and registered holidays', () => {
    expect(countWorkingDays(new Date('2026-10-01'), new Date('2026-10-07'), [1,2,3,4,5], new Set(['2026-10-05']))).toBe(4);
  });
  it('accrues monthly for a midyear joiner', () => {
    expect(accrualForYear(LeaveAccrualMode.MONTHLY, 24, new Date('2026-07-01'), new Date('2026-09-29'))).toBe(6);
  });
  it('prorates upfront annual leave for a midyear joiner', () => {
    const value = accrualForYear(LeaveAccrualMode.ANNUAL_UPFRONT, 24, new Date('2026-07-01'), new Date('2026-09-29'));
    expect(value).toBeGreaterThan(11);
    expect(value).toBeLessThan(13);
  });
  it('rejects reversed date ranges', () => {
    expect(() => countWorkingDays(new Date('2026-10-07'), new Date('2026-10-01'), [1,2,3,4,5], new Set())).toThrow(BadRequestException);
  });
});
