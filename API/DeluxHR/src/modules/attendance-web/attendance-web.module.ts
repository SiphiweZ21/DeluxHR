import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceWebController } from './attendance-web.controller';
import { AttendanceWebService } from './attendance-web.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceWebController],
  providers: [AttendanceWebService],
  exports: [AttendanceWebService],
})
export class AttendanceWebModule {}
