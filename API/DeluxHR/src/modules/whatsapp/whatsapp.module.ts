import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { EarlyPayModule } from '../early-pay/early-pay.module';
import { WhatsAppController } from './whatsapp.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, EarlyPayModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}