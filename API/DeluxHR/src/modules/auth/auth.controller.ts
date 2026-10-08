import { PasswordRecoveryService } from './password-recovery.service';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password-recovery.dto';
import type { Response } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private recovery: PasswordRecoveryService,
    private auth: AuthService,
    private rateLimit: AuthRateLimitService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    await this.rateLimit.check(
      `register:${req.socket.remoteAddress ?? 'unknown'}`,
      5,
    );
    return this.auth.register(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const email = dto.email.trim().toLowerCase();
    try {
      await this.rateLimit.check(
        `login:${req.socket.remoteAddress ?? 'unknown'}`,
        20,
      );
      await this.rateLimit.assertLoginAllowed(email);
      try {
        const result = await this.auth.login(dto);
        await this.rateLimit.clearLoginFailures(email);
        return result;
      } catch (error) {
        if (error instanceof UnauthorizedException)
          await this.rateLimit.recordLoginFailure(email);
        throw error;
      }
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const response = error.getResponse();
        const seconds =
          typeof response === 'object' && 'retryAfterSeconds' in response
            ? Number(response.retryAfterSeconds)
            : 900;
        res?.setHeader('Retry-After', String(seconds));
      }
      throw error;
    }
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    await this.rateLimit.check(
      `recovery-ip:${req.socket.remoteAddress ?? 'unknown'}`,
      20,
    );
    await this.rateLimit.check(
      `recovery-email:${dto.email.trim().toLowerCase()}`,
      3,
    );
    return this.recovery.request(dto.email);
  }
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: any) {
    await this.rateLimit.check(
      `reset-ip:${req.socket.remoteAddress ?? 'unknown'}`,
      20,
    );
    return this.recovery.reset(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}
