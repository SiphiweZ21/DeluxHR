import { Global, Module } from '@nestjs/common';

import { EntitlementsService } from './entitlements.service';
import { FeaturesGuard } from './features.guard';

@Global()
@Module({
  providers: [
    EntitlementsService,
    FeaturesGuard,
  ],
  exports: [
    EntitlementsService,
    FeaturesGuard,
  ],
})
export class EntitlementsModule {}
