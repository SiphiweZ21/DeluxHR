import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ShiftAssignmentsController } from './shift-assignments.controller';
import { ShiftAssignmentsService } from './shift-assignments.service';
@Module({ imports: [AuditModule], controllers: [ShiftAssignmentsController], providers: [ShiftAssignmentsService] })
export class ShiftAssignmentsModule {}
