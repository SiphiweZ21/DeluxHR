import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import { CurrentPlatformUser } from '../../common/auth/current-platform-user.decorator';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';
import { ConfigDto, PackageDto, PlatformUserDto, PlatformUserStatusDto, SubscriptionDto, SupportSessionDto } from './dto/platform-operations.dto';
import { PlatformOperationsService } from './platform-operations.service';
@UseGuards(JwtAuthGuard,PlatformRoleGuard) @Controller('platform-admin')
export class PlatformOperationsController {
 constructor(private readonly operations: PlatformOperationsService) {}
 @Get('packages') packages() { return this.operations.packages(); }
 @Put('packages') package(@CurrentPlatformUser() actor: PlatformJwtUser,@Body() dto: PackageDto) { return this.operations.package(actor,dto); }
 @Get('organizations/:id/subscription') subscription(@Param('id') id: string) { return this.operations.getSubscription(id); }
 @Put('organizations/:id/subscription') setSubscription(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('id') id: string,@Body() dto: SubscriptionDto) { return this.operations.subscription(actor,id,dto); }
 @Get('users') users(@Query('organizationId') orgId?: string) { return this.operations.users(orgId); }
 @Post('users') createUser(@CurrentPlatformUser() actor: PlatformJwtUser,@Body() dto: PlatformUserDto) { return this.operations.createUser(actor,dto); }
 @Patch('users/:id/status') userStatus(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('id') id: string,@Body() dto: PlatformUserStatusDto) { return this.operations.userStatus(actor,id,dto.isActive,dto.reason); }
 @Get('usage') usage(@Query('organizationId') orgId?: string) { return this.operations.usage(orgId); }
 @Get('audit') audit() { return this.operations.platformAudit(); }
 @Get('organizations/:id/audit') tenantAudit(@Param('id') id: string) { return this.operations.audit(id); }
 @Post('organizations/:id/support-sessions') support(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('id') id: string,@Body() dto: SupportSessionDto) { return this.operations.support(actor,id,dto); }
 @Get('support-sessions/:id/preview') preview(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('id') id: string) { return this.operations.preview(actor,id); }
 @Post('support-sessions/:id/revoke') revoke(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('id') id: string) { return this.operations.revoke(actor,id); }
 @Get('configuration') config() { return this.operations.config(); }
 @Put('configuration/:key') setConfig(@CurrentPlatformUser() actor: PlatformJwtUser,@Param('key') key: string,@Body() dto: ConfigDto) { return this.operations.setConfig(actor,key,dto.value); }
 @Get('health') health() { return this.operations.health(); }
}
