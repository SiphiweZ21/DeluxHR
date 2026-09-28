import { Module } from '@nestjs/common';
import { EarlyPayController } from './early-pay.controller';
import { EarlyPayService } from './early-pay.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({ controllers: [EarlyPayController], providers: [EarlyPayService, PrismaService], exports: [EarlyPayService] })
export class EarlyPayModule {}
