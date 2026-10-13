import { SetMetadata } from '@nestjs/common';
export const ALLOW_FEATURE_SETUP = 'allowFeatureSetup';
export const AllowFeatureSetup = () => SetMetadata(ALLOW_FEATURE_SETUP, true);
