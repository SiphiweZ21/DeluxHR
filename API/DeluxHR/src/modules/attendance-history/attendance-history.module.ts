import { Module } from '@nestjs/common';

import { AttendanceHistoryController } from './attendance-history.controller';
import { AttendanceHistoryService } from './attendance-history.service';

@Module({
  controllers: [AttendanceHistoryController],
  providers: [AttendanceHistoryService],
  exports: [AttendanceHistoryService],
})
export class AttendanceHistoryModule {}
