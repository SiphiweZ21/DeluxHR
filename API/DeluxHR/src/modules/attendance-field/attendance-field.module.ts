import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceFieldController } from './attendance-field.controller';
import { AttendanceFieldService } from './attendance-field.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceFieldController],
  providers: [AttendanceFieldService],
  exports: [AttendanceFieldService],
})
export class AttendanceFieldModule {}
