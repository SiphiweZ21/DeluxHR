import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EmployeeWorkLocationsController } from './employee-work-locations.controller';
import { EmployeeWorkLocationsService } from './employee-work-locations.service';

@Module({
  imports: [AuditModule],
  controllers: [EmployeeWorkLocationsController],
  providers: [EmployeeWorkLocationsService],
  exports: [EmployeeWorkLocationsService],
})
export class EmployeeWorkLocationsModule {}
