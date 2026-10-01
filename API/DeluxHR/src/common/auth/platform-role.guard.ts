import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtUser, PlatformJwtUser } from './jwt-user.type';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtUser | PlatformJwtUser }>();

    const jwtUser = request.user;

    if (!jwtUser) {
      throw new ForbiddenException('Authentication is required.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: jwtUser.sub,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('Platform account is inactive.');
    }

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException('Platform administration access is required.');
    }

    if (user.organizationId !== null) {
      throw new ForbiddenException(
        'Platform accounts cannot belong to a customer organization.',
      );
    }

    request.user = {
      sub: user.id,
      email: user.email,
      organizationId: null,
      role: user.role,
    };

    return true;
  }
}