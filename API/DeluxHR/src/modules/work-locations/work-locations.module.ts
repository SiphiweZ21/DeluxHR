import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { WorkLocationsController } from './work-locations.controller';
import { WorkLocationsService } from './work-locations.service';

@Module({
  imports: [AuditModule],
  controllers: [WorkLocationsController],
  providers: [WorkLocationsService],
  exports: [WorkLocationsService],
})
export class WorkLocationsModule {}
