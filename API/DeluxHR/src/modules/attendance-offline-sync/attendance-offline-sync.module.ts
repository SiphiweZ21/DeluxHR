import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceOfflineSyncController } from './attendance-offline-sync.controller';
import { AttendanceOfflineSyncService } from './attendance-offline-sync.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceOfflineSyncController],
  providers: [AttendanceOfflineSyncService],
  exports: [AttendanceOfflineSyncService],
})
export class AttendanceOfflineSyncModule {}
