import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permission, RiskEventStatus, type UserRole } from '@prisma/client';

import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { DismissRiskEventDto } from './dto/dismiss-risk-event.dto';
import { ResolveRiskEventDto } from './dto/resolve-risk-event.dto';
import { ReviewRiskEventDto } from './dto/review-risk-event.dto';
import { RiskService } from './risk.service';

@Controller('risk-events')
@UseGuards(JwtAuthGuard, TenantAccessGuard, PermissionsGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get()
  @RequirePermissions(Permission.VIEW_RISK_EVENTS)
  listCompanyRisks(
    @CurrentTenantUser() user: TenantJwtUser,
    @Query(
      'status',
      new ParseEnumPipe(RiskEventStatus, {
        optional: true,
      }),
    )
    status?: RiskEventStatus,
  ) {
    return this.riskService.listCompanyRisks(user.organizationId, status);
  }

  @Get('open')
  @RequirePermissions(Permission.VIEW_RISK_EVENTS)
  listOpenCompanyRisks(@CurrentTenantUser() user: TenantJwtUser) {
    return this.riskService.listOpenCompanyRisks(user.organizationId);
  }

  @Get('employee/:employeeId')
  @RequirePermissions(Permission.VIEW_RISK_EVENTS)
  listEmployeeRisks(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.riskService.listEmployeeRisks(user.organizationId, employeeId);
  }

  @Get(':id')
  @RequirePermissions(Permission.VIEW_RISK_EVENTS)
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.riskService.findOne(user.organizationId, id);
  }

  @Post(':id/review')
  @RequirePermissions(Permission.MANAGE_RISK_EVENTS)
  startReview(
    @Param('id') id: string,
    @Body() dto: ReviewRiskEventDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.riskService.startReview(
      user.organizationId,
      id,
      this.actor(user),
      dto.reason,
    );
  }

  @Post(':id/resolve')
  @RequirePermissions(Permission.MANAGE_RISK_EVENTS)
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveRiskEventDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.riskService.resolve(
      user.organizationId,
      id,
      this.actor(user),
      dto.reason,
    );
  }

  @Post(':id/dismiss')
  @RequirePermissions(Permission.MANAGE_RISK_EVENTS)
  dismiss(
    @Param('id') id: string,
    @Body() dto: DismissRiskEventDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.riskService.dismiss(
      user.organizationId,
      id,
      this.actor(user),
      dto.reason,
    );
  }

  private actor(user: TenantJwtUser) {
    return {
      id: user.sub,
      email: user.email,
      role: user.role as UserRole,
    };
  }
}
