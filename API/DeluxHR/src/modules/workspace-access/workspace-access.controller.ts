import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { WorkspaceAccessService } from './workspace-access.service';
class ConfigureServiceDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
@Controller('workspace-access')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class WorkspaceAccessController {
  constructor(private readonly service: WorkspaceAccessService) {}
  @Get('current') current(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.current(actor);
  }
  @Put('services/:feature')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_COMPANY)
  configure(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('feature') feature: Feature,
    @Body() dto: ConfigureServiceDto,
  ) {
    return this.service.setService(actor, feature, dto.enabled, dto.reason);
  }
}
