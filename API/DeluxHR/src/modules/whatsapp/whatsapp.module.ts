import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { EarlyPayModule } from '../early-pay/early-pay.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, EarlyPayModule],
  controllers: [],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}