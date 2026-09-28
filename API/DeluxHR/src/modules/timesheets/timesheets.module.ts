import { Module } from '@nestjs/common';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [TimesheetsController],
  providers: [TimesheetsService, PrismaService],
})
export class TimesheetsModule {}