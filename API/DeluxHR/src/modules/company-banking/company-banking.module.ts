import { Module } from '@nestjs/common';
import { CompanyBankingController } from './company-banking.controller';
import { CompanyBankingService } from './company-banking.service';
@Module({
  controllers: [CompanyBankingController],
  providers: [CompanyBankingService],
})
export class CompanyBankingModule {}
