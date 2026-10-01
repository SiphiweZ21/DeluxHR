import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../../common/entitlements/features.guard';
import { RequireFeatures } from '../../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../../common/access/permissions.guard';
import { RequirePermissions } from '../../../common/access/require-permissions.decorator';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
@UseGuards(JwtAuthGuard,TenantAccessGuard,FeaturesGuard,PermissionsGuard)
@RequireFeatures(Feature.LEAVE)
@Controller('leave-requests')
export class LeaveRequestsController {
 constructor(private readonly service: LeaveRequestsService) {}
 @Post()
 create(@Body() dto: CreateLeaveRequestDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.create(user,dto); }
 @Get()
 list(@CurrentTenantUser() user: TenantJwtUser) { return this.service.list(user); }
 @Get(':leaveRequestId')
 one(@Param('leaveRequestId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.findOne(user.organizationId,id,user); }
 @Patch(':leaveRequestId/status') @RequirePermissions(Permission.MANAGE_LEAVE)
 status(@Param('leaveRequestId') id: string,@Body() dto: UpdateLeaveStatusDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.updateStatus(user,id,dto.status); }
}
