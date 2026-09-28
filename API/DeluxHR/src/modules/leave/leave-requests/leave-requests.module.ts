import { Module } from '@nestjs/common';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
