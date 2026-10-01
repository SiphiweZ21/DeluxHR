import { Module } from '@nestjs/common';
import { EarlyPayTreasuryController } from './treasury.controller';
import { EarlyPayTreasuryService } from './treasury.service';
@Module({
  controllers: [EarlyPayTreasuryController],
  providers: [EarlyPayTreasuryService],
})
export class EarlyPayTreasuryModule {}
