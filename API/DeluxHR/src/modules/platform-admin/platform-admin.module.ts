import { Module } from '@nestjs/common';

import { CustomerOnboardingModule } from '../customer-onboarding/customer-onboarding.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PlatformOperationsController } from './platform-operations.controller';
import { PlatformOperationsService } from './platform-operations.service';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [OnboardingModule,CustomerOnboardingModule],
  controllers: [PlatformAdminController,PlatformOperationsController],
  providers: [PlatformAdminService,PlatformOperationsService],
})
export class PlatformAdminModule {}
