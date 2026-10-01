import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceSiteQrController } from './attendance-site-qr.controller';
import { AttendanceSiteQrService } from './attendance-site-qr.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceSiteQrController],
  providers: [AttendanceSiteQrService],
  exports: [AttendanceSiteQrService],
})
export class AttendanceSiteQrModule {}
