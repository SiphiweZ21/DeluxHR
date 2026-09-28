import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, comparePassword } from '../../common/auth/password';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await hashPassword(dto.password);

    // transaction: create org + user
    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
        },
      });

      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          role: 'OWNER',
          organizationId: organization.id,
        },
      });

      return { user, organization };
    });

    const token = this.signToken(result.user);

    return {
      accessToken: token,
      user: this.mapUser(result.user),
      organization: result.organization,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await comparePassword(dto.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const token = this.signToken(user);

    return {
      accessToken: token,
      user: this.mapUser(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.mapUser(user);
  }

  private signToken(user: any): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });
  }

  private mapUser(user: any) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
