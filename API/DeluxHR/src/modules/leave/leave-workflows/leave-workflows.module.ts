import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { AccessControlModule } from '../../../common/access/access-control.module';
import { LeavePolicyModule } from '../leave-policy/leave-policy.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { LeaveWorkflowsController } from './leave-workflows.controller';
import { LeaveWorkflowsService } from './leave-workflows.service';
import { LeaveDocumentStorageService } from './leave-document-storage.service';
@Module({ imports: [AuditModule, AccessControlModule, LeavePolicyModule, LeaveRequestsModule], controllers: [LeaveWorkflowsController], providers: [LeaveWorkflowsService,LeaveDocumentStorageService] })
export class LeaveWorkflowsModule {}
