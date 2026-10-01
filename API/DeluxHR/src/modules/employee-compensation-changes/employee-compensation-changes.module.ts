import { Module } from '@nestjs/common';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { AuditModule } from '../audit/audit.module';

import { EmployeeCompensationChangesController } from './employee-compensation-changes.controller';
import { EmployeeCompensationChangesService } from './employee-compensation-changes.service';

@Module({
  imports: [AuditModule],
  controllers: [EmployeeCompensationChangesController],
  providers: [EmployeeCompensationChangesService, PermissionsGuard],
  exports: [EmployeeCompensationChangesService],
})
export class EmployeeCompensationChangesModule {}
