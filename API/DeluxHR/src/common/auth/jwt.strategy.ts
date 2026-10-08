import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredJwtSecret } from './jwt-secret';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UserRole } from '@prisma/client';

type JwtPayload = {
  sub: string;
  tokenVersion?: number;
  email: string;
  organizationId: string | null;
  role: UserRole;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly db: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredJwtSecret(configService),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isActive || (payload.tokenVersion ?? 0) !== user.tokenVersion)
      throw new UnauthorizedException('Session expired. Please sign in again.');
    return {
      ...payload,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
