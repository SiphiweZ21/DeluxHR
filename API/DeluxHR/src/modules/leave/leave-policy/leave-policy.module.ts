import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { LeavePolicyController } from './leave-policy.controller';
import { LeavePolicyService } from './leave-policy.service';
@Module({ imports: [AuditModule], controllers: [LeavePolicyController], providers: [LeavePolicyService], exports: [LeavePolicyService] })
export class LeavePolicyModule {}
