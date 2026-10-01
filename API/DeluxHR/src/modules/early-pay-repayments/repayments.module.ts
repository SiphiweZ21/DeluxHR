import { Module } from '@nestjs/common';
import {
  EarlyPayRepaymentsController,
  PlatformEarlyPayRepaymentsController,
} from './repayments.controller';
import { EarlyPayRepaymentsService } from './repayments.service';
@Module({
  controllers: [
    EarlyPayRepaymentsController,
    PlatformEarlyPayRepaymentsController,
  ],
  providers: [EarlyPayRepaymentsService],
})
export class EarlyPayRepaymentsModule {}
