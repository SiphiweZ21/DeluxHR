import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { WhatsAppEssService } from './whatsapp-ess.service';
import {
  CreateAnnouncementDto,
  EnrolWhatsAppDto,
  UpdateHrRequestDto,
} from './dto/whatsapp-ess.dto';
export function validWebhookSignature(
  raw: Buffer,
  supplied: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !supplied || !/^sha256=[0-9a-f]{64}$/i.test(supplied))
    return false;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(raw).digest('hex'),
    'hex',
  );
  const actual = Buffer.from(supplied.slice(7), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
@Controller('whatsapp')
export class WhatsAppEssController {
  private readonly logger = new Logger('WhatsAppWebhook');
  constructor(private readonly ess: WhatsAppEssService) {}
  onModuleInit() {
    this.logger.log(`WA_DIAG_READY secretConfigured=${Boolean(process.env.WHATSAPP_APP_SECRET)} phoneIdConfigured=${Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)} tokenConfigured=${Boolean(process.env.WHATSAPP_TOKEN)} apiVersionConfigured=${Boolean(process.env.WHATSAPP_API_VERSION)}`);
  }
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (
      !expected ||
      mode !== 'subscribe' ||
      !token ||
      !challenge ||
      !this.equal(token, expected)
    )
      return res.sendStatus(403);
    return res.status(200).send(challenge);
  }
  private equal(a: string, b: string) {
    const one = Buffer.from(a),
      two = Buffer.from(b);
    return one.length === two.length && timingSafeEqual(one, two);
  }
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.logger.log(`WA_WEBHOOK_RECEIVED rawBodyPresent=${Boolean(req.rawBody)} signaturePresent=${Boolean(signature)}`);
    if (
      !req.rawBody ||
      !validWebhookSignature(
        req.rawBody,
        signature,
        process.env.WHATSAPP_APP_SECRET,
      )
    )
    {
      this.logger.warn('WA_SIGNATURE_REJECTED');
      throw new ForbiddenException('Invalid webhook signature');
    }
    this.logger.log('WA_SIGNATURE_ACCEPTED');
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries)
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const value = change.value;
        if (
          value?.metadata?.phone_number_id !==
          process.env.WHATSAPP_PHONE_NUMBER_ID
        ) {
          this.logger.warn('WA_PHONE_ID_MISMATCH ignored=true');
          continue;
        }
        const messageCount = Array.isArray(value.messages) ? value.messages.length : 0;
        const statusCount = Array.isArray(value.statuses) ? value.statuses.length : 0;
        this.logger.log(`WA_PHONE_ID_MATCH messages=${messageCount} statuses=${statusCount}`);
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          const state = ['sent', 'delivered', 'read', 'failed'].includes(status.status) ? status.status : 'other';
          const codes = (Array.isArray(status.errors) ? status.errors : []).map((error: { code?: unknown }) => typeof error.code === 'number' ? error.code : 'unknown').join(',');
          this.logger.log(`WA_DELIVERY_STATUS status=${state} errorCodes=${codes || 'none'}`);
        }
        for (const message of Array.isArray(value.messages)
          ? value.messages
          : []) {
          if (message.type === 'text' && typeof message.text?.body === 'string')
            await this.ess.process(message.id, message.from, message.text.body);
          else if (message.type === 'location')
            await this.ess.process(message.id, message.from, '[location]', {
              latitude: message.location?.latitude,
              longitude: message.location?.longitude,
            });
          else this.logger.log('WA_MESSAGE_TYPE_IGNORED');
        }
      }
    return { received: true };
  }
  @Get('payslips/:token')
  async payslip(@Param('token') token: string, @Res() res: Response) {
    const bytes = await this.ess.redeemPayslip(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="DeluxHR-payslip.pdf"',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
  @Post('ess/enrol')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.WHATSAPP)
  @RequirePermissions(Permission.MANAGE_USERS)
  enrol(
    @Body() dto: EnrolWhatsAppDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.ess.enroll(user, dto.employeeId, dto.pin);
  }
  @Post('ess/announcements')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.WHATSAPP)
  @RequirePermissions(Permission.MANAGE_COMPANY)
  announcement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.ess.announcement(user, dto);
  }
  @Get('ess/hr-requests')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.WHATSAPP)
  @RequirePermissions(Permission.VIEW_HR_REQUESTS)
  hrRequests(@CurrentTenantUser() user: TenantJwtUser) {
    return this.ess.hrRequests(user.organizationId);
  }
  @Patch('ess/hr-requests/:id')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.WHATSAPP)
  @RequirePermissions(Permission.MANAGE_HR_REQUESTS)
  updateHr(
    @Param('id') id: string,
    @Body() dto: UpdateHrRequestDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.ess.updateHrRequest(user, id, dto.status);
  }
}
