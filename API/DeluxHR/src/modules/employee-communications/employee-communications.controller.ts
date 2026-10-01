import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Feature, Permission } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { AnnouncementDto, AnnouncementStateDto, TeamDto } from './employee-communications.dto';
import { EmployeeCommunicationsService } from './employee-communications.service';
function send(res: Response, name: string, mime: string, bytes: Buffer) { res.setHeader('Content-Type',mime); res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.send(bytes); }
@Controller('communications') @UseGuards(JwtAuthGuard,TenantAccessGuard,FeaturesGuard) @RequireFeatures(Feature.CORE_HR)
export class EmployeeCommunicationsController {
 constructor(private readonly communications: EmployeeCommunicationsService) {}
 @Get('inbox') inbox(@CurrentTenantUser() actor: TenantJwtUser,@Query('unread') unread?: string) { return this.communications.inbox(actor,unread !== 'true'); }
 @Get('inbox/:id') detail(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.communications.visible(actor,id); }
 @Post('inbox/:id/read') read(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.communications.mark(actor,id); }
 @Post('inbox/:id/acknowledge') acknowledge(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.communications.mark(actor,id,true); }
 @Get('inbox/:id/attachments/:attachmentId') async attachment(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Param('attachmentId') attachmentId: string,@Res() res: Response) { const { attachment, bytes } = await this.communications.download(actor,id,attachmentId); send(res,attachment.name,attachment.mimeType,bytes); }
}
@Controller('communications/admin') @UseGuards(JwtAuthGuard,TenantAccessGuard,FeaturesGuard,PermissionsGuard) @RequireFeatures(Feature.CORE_HR)
export class EmployeeCommunicationsAdminController {
 constructor(private readonly communications: EmployeeCommunicationsService) {}
 @Get('teams') @RequirePermissions(Permission.VIEW_COMMUNICATIONS) teams(@CurrentTenantUser() actor: TenantJwtUser) { return this.communications.teams(actor); }
 @Post('teams') @RequirePermissions(Permission.MANAGE_COMMUNICATIONS) team(@CurrentTenantUser() actor: TenantJwtUser,@Body() dto: TeamDto) { return this.communications.team(actor,dto); }
 @Patch('teams/:id') @RequirePermissions(Permission.MANAGE_COMMUNICATIONS) updateTeam(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: TeamDto) { return this.communications.updateTeam(actor,id,dto); }
 @Post('announcements') @RequirePermissions(Permission.MANAGE_COMMUNICATIONS) create(@CurrentTenantUser() actor: TenantJwtUser,@Body() dto: AnnouncementDto) { return this.communications.create(actor,dto); }
 @Get('announcements') @RequirePermissions(Permission.VIEW_COMMUNICATIONS) list(@CurrentTenantUser() actor: TenantJwtUser) { return this.communications.list(actor); }
 @Get('announcements/:id') @RequirePermissions(Permission.VIEW_COMMUNICATIONS) detail(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.communications.detail(actor,id); }
 @Patch('announcements/:id/state') @RequirePermissions(Permission.MANAGE_COMMUNICATIONS) state(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: AnnouncementStateDto) { return this.communications.state(actor,id,dto.isActive); }
 @Post('announcements/:id/attachments') @RequirePermissions(Permission.MANAGE_COMMUNICATIONS) @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 10*1024*1024, files: 1 } })) attach(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@UploadedFile() file: Express.Multer.File) { return this.communications.attach(actor,id,file); }
 @Get('announcements/:id/attachments/:attachmentId') @RequirePermissions(Permission.VIEW_COMMUNICATIONS) async attachment(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Param('attachmentId') attachmentId: string,@Res() res: Response) { const { attachment, bytes } = await this.communications.download(actor,id,attachmentId,true); send(res,attachment.name,attachment.mimeType,bytes); }
}
