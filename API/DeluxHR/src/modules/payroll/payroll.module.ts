import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SaTaxEngineService } from './tax-engine/sa-tax-engine.service';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PrismaService, SaTaxEngineService],
  exports: [PayrollService, SaTaxEngineService],
})
export class PayrollModule {}
