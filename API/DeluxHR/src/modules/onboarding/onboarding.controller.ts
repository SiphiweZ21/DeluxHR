import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  Feature,
  Permission,
} from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { OnboardingService } from './onboarding.service';
import { UpdateOnboardingModeDto } from './dto/update-onboarding-mode.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.CORE_HR)
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get('current')
  getCurrent(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.onboardingService.getCurrent(
      user.organizationId,
    );
  }

  @Patch('current/mode')
  @RequirePermissions(Permission.MANAGE_COMPANY)
  updateMode(
    @CurrentTenantUser() user: TenantJwtUser,
    @Body() dto: UpdateOnboardingModeDto,
  ) {
    return this.onboardingService.updateMode(
      user.organizationId,
      dto,
      user,
    );
  }

  @Post('current/assistance-request')
  @RequirePermissions(Permission.MANAGE_COMPANY)
  requestAssistance(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.onboardingService.requestAssistance(
      user.organizationId,
      user,
    );
  }

  @Delete('current/assistance-request')
  @RequirePermissions(Permission.MANAGE_COMPANY)
  cancelAssistance(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.onboardingService.cancelAssistance(
      user.organizationId,
      user,
    );
  }
}
