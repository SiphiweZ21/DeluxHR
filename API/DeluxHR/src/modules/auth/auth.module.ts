import { AuthRateLimitService } from './auth-rate-limit.service';
import { requiredJwtSecret } from '../../common/auth/jwt-secret';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from '../../common/auth/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: requiredJwtSecret(configService),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [AuthRateLimitService, AuthService, PrismaService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}