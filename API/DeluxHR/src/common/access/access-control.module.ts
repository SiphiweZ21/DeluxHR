import { OrganizationPermissionsGuard } from './organization-permissions.guard';
import { Global, Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [
    AccessControlService,
    PermissionsGuard,
    OrganizationPermissionsGuard,
  ],
  exports: [
    AccessControlService,
    PermissionsGuard,
    OrganizationPermissionsGuard,
  ],
})
export class AccessControlModule {}
