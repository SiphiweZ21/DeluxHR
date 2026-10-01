import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { TenantJwtUser } from './jwt-user.type';

// These organization-wide queues currently have no team or self predicate.
@Injectable()
export class OrganizationWorkforceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: TenantJwtUser }>().user;
    if (!user || user.role === 'EMPLOYEE' || user.role === 'MANAGER') {
      throw new ForbiddenException('Organization workforce access is required.');
    }
    return true;
  }
}
