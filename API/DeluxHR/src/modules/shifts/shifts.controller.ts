import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}
  @Post() @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(@Body() dto: CreateShiftDto, @CurrentTenantUser() user: TenantJwtUser) { return this.shifts.create(user.organizationId, dto, user); }
  @Get() @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser) { return this.shifts.list(user.organizationId); }
  @Get(':shiftId') @RequirePermissions(Permission.VIEW_ATTENDANCE)
  one(@Param('shiftId') id: string, @CurrentTenantUser() user: TenantJwtUser) { return this.shifts.one(user.organizationId, id); }
  @Patch(':shiftId') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  update(@Param('shiftId') id: string, @Body() dto: UpdateShiftDto, @CurrentTenantUser() user: TenantJwtUser) { return this.shifts.update(user.organizationId, id, dto, user); }
  @Post(':shiftId/activate') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  activate(@Param('shiftId') id: string, @CurrentTenantUser() user: TenantJwtUser) { return this.shifts.setActive(user.organizationId, id, true, user); }
  @Post(':shiftId/deactivate') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  deactivate(@Param('shiftId') id: string, @CurrentTenantUser() user: TenantJwtUser) { return this.shifts.setActive(user.organizationId, id, false, user); }
}
