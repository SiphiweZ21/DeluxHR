import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@prisma/client';
import { AccessControlService } from './access-control.service';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';
import type { TenantJwtUser } from '../auth/jwt-user.type';
@Injectable()
export class OrganizationPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessControlService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length)
      throw new ForbiddenException(
        'An organization permission must be declared.',
      );
    const user = context
      .switchToHttp()
      .getRequest<{ user: TenantJwtUser }>().user;
    if (!user?.organizationId)
      throw new ForbiddenException('Tenant access is required.');
    const grants = await this.access.getEffectivePermissions(user);
    if (
      !required.every((p) =>
        grants.some((g) => g.permission === p && g.scope === 'ORGANIZATION'),
      )
    )
      throw new ForbiddenException(
        'Organization-scoped permission is required.',
      );
    return true;
  }
}
