import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { WhatsAppSetupService } from './whatsapp-setup.service';
export class WhatsAppSetupDto {
  @IsUUID() employeeId!: string;
  @IsString() @MaxLength(30) whatsappNumber!: string;
  @Equals(true, { message: 'Record employee consent before enrolling' })
  consent!: boolean;
  @IsString() @MinLength(5) @MaxLength(500) consentNote!: string;
  @Matches(/^\d{6,8}$/) pin!: string;
  @IsOptional() @IsUUID() existingUserId?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(128) password?: string;
}
@Controller('whatsapp/ess/setup')
@AllowPendingOnboarding()
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.WHATSAPP)
@RequirePermissions(Permission.MANAGE_USERS)
export class WhatsAppSetupController {
  constructor(private readonly setup: WhatsAppSetupService) {}
  @Get() list(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.setup.list(actor);
  }
  @Post() save(
    @Body() dto: WhatsAppSetupDto,
    @CurrentTenantUser() actor: TenantJwtUser,
  ) {
    return this.setup.save(actor, dto);
  }
  @Post(':employeeId/revoke') revoke(
    @Param('employeeId') id: string,
    @CurrentTenantUser() actor: TenantJwtUser,
  ) {
    return this.setup.revoke(actor, id);
  }
}
