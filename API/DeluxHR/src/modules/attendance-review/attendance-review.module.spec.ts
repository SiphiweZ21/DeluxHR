import { Test } from '@nestjs/testing';
import { AttendanceEventsModule } from '../attendance-events/attendance-events.module';
import { AttendanceEventsService } from '../attendance-events/attendance-events.service';
import { AttendanceReviewService } from './attendance-review.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlModule } from '../../common/access/access-control.module';
import { EntitlementsModule } from '../../common/entitlements/entitlements.module';
describe('Attendance review module wiring', () => {
  it('resolves the capture, review, scheduler and notification providers without a dependency cycle', async () => {
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AccessControlModule,
        EntitlementsModule,
        AttendanceEventsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      await module.init();
      expect(module.get(AttendanceReviewService)).toBeDefined();
      expect(module.get(AttendanceEventsService)).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
