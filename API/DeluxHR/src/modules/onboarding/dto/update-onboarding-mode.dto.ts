import { IsEnum } from 'class-validator';
import { OnboardingMode } from '@prisma/client';

export class UpdateOnboardingModeDto {
  @IsEnum(OnboardingMode)
  mode!: OnboardingMode;
}
