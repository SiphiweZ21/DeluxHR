import { BadRequestException } from '@nestjs/common';
import { localInstant } from './attendance-schedule-review.service';
import { calendarDate } from '../recurring-schedules/recurring-schedules.service';

describe('schedule calendar boundaries', () => {
  it('converts Johannesburg wall time to UTC for an overnight shift', () => {
    expect(localInstant('2026-09-29', 22 * 60, 'Africa/Johannesburg').toISOString()).toBe('2026-09-29T20:00:00.000Z');
    expect(localInstant('2026-09-30', 6 * 60, 'Africa/Johannesburg').toISOString()).toBe('2026-09-30T04:00:00.000Z');
  });
  it('accounts for daylight saving time in other configured zones', () => {
    expect(localInstant('2026-01-15', 9 * 60, 'Europe/London').toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(localInstant('2026-07-15', 9 * 60, 'Europe/London').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });
  it('rejects impossible calendar dates', () => {
    expect(() => calendarDate('2026-02-30')).toThrow(BadRequestException);
  });
});
