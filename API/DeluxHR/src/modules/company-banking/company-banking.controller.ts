import {
  Body,
  Header,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CompanyPaymentPurpose } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CompanyBankingService } from './company-banking.service';
import {
  BankingDecisionDto,
  BankingInspectDto,
  BankingDefaultDto,
  BankingReasonDto,
  CreateBankingProfileDto,
} from './company-banking.dto';
@Controller('company-banking')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
@AllowPendingOnboarding()
export class CompanyBankingController {
  constructor(private readonly service: CompanyBankingService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.list(actor);
  }
  @Post('profiles') create(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateBankingProfileDto,
  ) {
    return this.service.create(actor, dto);
  }
  @Post('profiles/:id/review') review(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BankingDecisionDto,
  ) {
    return this.service.decide(actor, id, dto);
  }
  @Post('profiles/:id/inspect')
  @Header('Cache-Control', 'private, no-store')
  inspect(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BankingInspectDto,
  ) {
    return this.service.inspect(actor, id, dto);
  }
  @Post('profiles/:id/retire') retire(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BankingReasonDto,
  ) {
    return this.service.retire(actor, id, dto.reason);
  }
  @Put('defaults') setDefault(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: BankingDefaultDto,
  ) {
    return this.service.setDefault(actor, dto);
  }
  @Post('defaults/:purpose/clear') clearDefault(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('purpose') purpose: CompanyPaymentPurpose,
    @Body() dto: BankingReasonDto,
  ) {
    return this.service.clearDefault(actor, purpose, dto.reason);
  }
}
