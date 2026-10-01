import { BadRequestException } from '@nestjs/common';
import { calculateDailyHours } from './timesheets.service';
describe('daily workforce hours', () => {
  it('deducts unpaid breaks and separates overtime above policy and schedule', () => {
    expect(calculateDailyHours(600, 60, 480, 480, 360)).toEqual({ regularHours: 8, overtimeHours: 1, breakHours: 1, scheduledHours: 8 });
  });
  it('uses the longer scheduled day as overtime threshold', () => {
    expect(calculateDailyHours(600, 0, 540, 480, 360).overtimeHours).toBe(1);
  });
  it('rejects hours above the daily overtime cap', () => {
    expect(() => calculateDailyHours(900, 0, 480, 480, 360)).toThrow(BadRequestException);
  });
});
