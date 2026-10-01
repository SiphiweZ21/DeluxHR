import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { CustomerOnboardingModule } from '../customer-onboarding/customer-onboarding.module';

import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [PrismaModule,CustomerOnboardingModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
