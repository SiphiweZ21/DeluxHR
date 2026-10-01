import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Feature } from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import { CurrentPlatformUser } from '../../common/auth/current-platform-user.decorator';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';

import { PlatformAdminService } from './platform-admin.service';
import { ChangeOrganizationStatusDto } from './dto/change-organization-status.dto';
import { UpdateOrganizationFeatureDto } from './dto/update-organization-feature.dto';
import { CustomerOnboardingService } from '../customer-onboarding/customer-onboarding.service';
import { CreateCustomerDto } from '../customer-onboarding/customer-onboarding.dto';

@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
    private readonly customerOnboarding: CustomerOnboardingService,
  ) {}

  @Post('organizations')
  createOrganization(@CurrentPlatformUser() user: PlatformJwtUser,@Body() dto: CreateCustomerDto) {
    return this.customerOnboarding.createCompany(user,dto);
  }

  @Get('organizations/:id/readiness')
  readiness(@Param('id') id: string) { return this.customerOnboarding.readiness(id); }

  @Get('organizations')
  listOrganizations() {
    return this.platformAdminService.listOrganizations();
  }

  @Get('organizations/:id')
  getOrganization(
    @Param('id') id: string,
  ) {
    return this.platformAdminService.getOrganization(id);
  }

  @Get('organizations/:id/onboarding')
  getOrganizationOnboarding(
    @Param('id') id: string,
  ) {
    return this.platformAdminService.getOrganizationOnboarding(
      id,
    );
  }

  @Patch('organizations/:id/status')
  changeOrganizationStatus(
    @Param('id') id: string,
    @Body() dto: ChangeOrganizationStatusDto,
    @CurrentPlatformUser() user: PlatformJwtUser,
  ) {
    return this.platformAdminService.changeOrganizationStatus(
      id,
      dto,
      user,
    );
  }

  @Get('organizations/:id/features')
  getOrganizationFeatures(
    @Param('id') id: string,
  ) {
    return this.platformAdminService.getOrganizationFeatures(
      id,
    );
  }

  @Put('organizations/:id/features/:feature')
  updateOrganizationFeature(
    @Param('id') id: string,
    @Param('feature') feature: Feature,
    @Body() dto: UpdateOrganizationFeatureDto,
    @CurrentPlatformUser() user: PlatformJwtUser,
  ) {
    return this.platformAdminService.updateOrganizationFeature(
      id,
      feature,
      dto,
      user,
    );
  }
}
