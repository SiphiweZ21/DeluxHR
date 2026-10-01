import { SetMetadata } from '@nestjs/common';
import { Feature } from '@prisma/client';

export const REQUIRED_FEATURES_KEY =
  'required_features';

export const RequireFeatures = (
  ...features: Feature[]
) =>
  SetMetadata(
    REQUIRED_FEATURES_KEY,
    features,
  );
