import { SetMetadata } from '@nestjs/common';
export const ALLOW_PENDING_ONBOARDING = 'allow_pending_onboarding';
export const AllowPendingOnboarding = () => SetMetadata(ALLOW_PENDING_ONBOARDING, true);
