import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_ONBOARDING } from './allow-pending-onboarding.decorator';
import type { JwtUser, TenantJwtUser } from './jwt-user.type';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtUser | TenantJwtUser }>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication is required.');
    }

    if (user.role === 'SUPER_ADMIN' || user.role === 'PLATFORM_ADMIN') {
      throw new ForbiddenException(
        'Platform accounts cannot access tenant endpoints directly.',
      );
    }

    if (!user.organizationId) {
      throw new ForbiddenException(
        'This account is not associated with an organization.',
      );
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, email: true, role: true, organizationId: true, isActive: true },
    });
    if (!currentUser?.isActive || currentUser.organizationId !== user.organizationId ||
        currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'PLATFORM_ADMIN') {
      throw new ForbiddenException('Tenant account is inactive or no longer belongs to this organization.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: {
        id: user.organizationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!organization) {
      throw new ForbiddenException('Organization not found.');
    }

    const setupRoute = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_ONBOARDING, [context.getHandler(),context.getClass()]);
    if (organization.status !== 'ACTIVE' && !(organization.status === 'PENDING' && currentUser.role === 'COMPANY_ADMIN' && setupRoute)) {
      throw new ForbiddenException(
        'Your organization does not currently have access to DeluxHR.',
      );
    }

    request.user = {
      sub: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      organizationId: organization.id,
    } as TenantJwtUser;

    return true;
  }
}
