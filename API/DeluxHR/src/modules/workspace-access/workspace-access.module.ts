import { Module } from '@nestjs/common';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceAccessController } from './workspace-access.controller';
@Module({
  providers: [WorkspaceAccessService],
  controllers: [WorkspaceAccessController],
})
export class WorkspaceAccessModule {}
