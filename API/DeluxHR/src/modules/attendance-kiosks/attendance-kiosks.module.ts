import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceKiosksController } from './attendance-kiosks.controller';
import { AttendanceKiosksService } from './attendance-kiosks.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceKiosksController],
  providers: [AttendanceKiosksService],
  exports: [AttendanceKiosksService],
})
export class AttendanceKiosksModule {}
