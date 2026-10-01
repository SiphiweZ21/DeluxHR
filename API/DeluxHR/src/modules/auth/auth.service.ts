import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { comparePassword, hashPassword } from '../../common/auth/password';
import { ROLE_PERMISSION_PRESETS } from '../../common/access/permission-presets';
import { UserRole } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const registration = await this.prisma.platformConfiguration.findUnique({ where: { key: 'REGISTRATION_ENABLED' } });
    if (registration?.value === 'false') throw new ForbiddenException('Company registration is temporarily unavailable');
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          status: 'PENDING',
        },
      });

      const user = await tx.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash,
          role: 'COMPANY_ADMIN',
          organizationId: organization.id,
        },
      });

      await tx.organizationOnboarding.create({ data: { organizationId: organization.id } });
      for (const grant of ROLE_PERMISSION_PRESETS[UserRole.COMPANY_ADMIN] ?? []) {
        await tx.userPermission.create({ data: { organizationId: organization.id, userId: user.id, ...grant } });
      }

      return { user, organization };
    });

    // Deliberately do NOT issue an access token here.
    // A newly registered company must first be approved by DeluxHR.

    return {
      message:
        'Company registration received. Your account is awaiting DeluxHR approval.',
      status: result.organization.status,
      user: this.mapUser(result.user),
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        status: result.organization.status,
      },
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await comparePassword(dto.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    if (this.isPlatformRole(user.role)) {
      const token = this.signToken(user);

      return {
        accessToken: token,
        user: this.mapUser(user),
      };
    }

    if (!user.organizationId || !user.organization) {
      throw new ForbiddenException(
        'This account is not associated with an organization.',
      );
    }

    switch (user.organization.status) {
      case 'ACTIVE':
        break;

      case 'PENDING':
        if (user.role === 'COMPANY_ADMIN') {
          return { accessToken: this.signToken(user), user: this.mapUser(user),
            organization: { id: user.organization.id, name: user.organization.name,
              status: user.organization.status }, onboardingOnly: true };
        }
        throw new ForbiddenException('Your company registration is awaiting DeluxHR approval.');

      case 'SUSPENDED':
        throw new ForbiddenException(
          'Your company account has been suspended. Please contact DeluxHR support.',
        );

      case 'REJECTED':
        throw new ForbiddenException(
          'Your company registration was not approved. Please contact DeluxHR support.',
        );

      default:
        throw new ForbiddenException('Company access is unavailable.');
    }

    const token = this.signToken(user);

    return {
      accessToken: token,
      user: this.mapUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        status: user.organization.status,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    if (!this.isPlatformRole(user.role)) {
      if (!user.organizationId || !user.organization) {
        throw new ForbiddenException(
          'This account is not associated with an organization.',
        );
      }

      if (user.organization.status !== 'ACTIVE' &&
          !(user.organization.status === 'PENDING' && user.role === 'COMPANY_ADMIN')) {
        throw new ForbiddenException(
          'Your organization does not currently have access to DeluxHR.',
        );
      }
    }

    return {
      ...this.mapUser(user),
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            status: user.organization.status,
          }
        : null,
    };
  }

  private isPlatformRole(role: UserRole): boolean {
    return role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN';
  }

  private signToken(user: User): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });
  }

  private mapUser(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
