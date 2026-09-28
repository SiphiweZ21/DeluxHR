import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';


@Module({
  imports: [WhatsAppModule],
  controllers: [PayslipsController],
  providers: [PayslipsService, PrismaService],
  exports: [PayslipsService],
})
export class PayslipsModule {}