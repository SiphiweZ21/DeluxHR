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
    private auth: AuthService,
    private rateLimit: AuthRateLimitService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    this.rateLimit.check(
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
      this.rateLimit.check(
        `login:${req.socket.remoteAddress ?? 'unknown'}`,
        20,
      );
      this.rateLimit.assertLoginAllowed(email);
      try {
        const result = await this.auth.login(dto);
        this.rateLimit.clearLoginFailures(email);
        return result;
      } catch (error) {
        if (error instanceof UnauthorizedException)
          this.rateLimit.recordLoginFailure(email);
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}
