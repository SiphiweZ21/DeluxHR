import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@prisma/client';
import { AccessControlService } from './access-control.service';
import {
  REQUIRED_PERMISSIONS_KEY,
} from './require-permissions.decorator';
import type { TenantJwtUser } from '../auth/jwt-user.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user: TenantJwtUser }>();

    if (!request.user?.organizationId) {
      throw new ForbiddenException(
        'Tenant access is required.',
      );
    }

    for (const permission of requiredPermissions) {
      const allowed =
        await this.accessControlService.hasPermission(
          request.user,
          permission,
        );

      if (!allowed) {
        throw new ForbiddenException(
          `Permission ${permission} is required.`,
        );
      }
    }

    return true;
  }
}