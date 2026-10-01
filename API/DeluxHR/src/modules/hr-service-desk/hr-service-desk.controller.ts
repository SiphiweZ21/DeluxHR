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
import { AssignmentDto, CategoryDto, CommentDto, CreateRequestDto, EscalateDto, PriorityDto, QueueDto, StatusDto } from './hr-service-desk.dto';
import { HrServiceDeskService } from './hr-service-desk.service';
const guards = [JwtAuthGuard,TenantAccessGuard,FeaturesGuard];
@Controller('hr-requests') @UseGuards(...guards) @RequireFeatures(Feature.CORE_HR)
export class HrServiceDeskController {
 constructor(private readonly desk: HrServiceDeskService) {}
 @Get('categories') categories(@CurrentTenantUser() actor: TenantJwtUser) { return this.desk.categories(actor.organizationId); }
 @Post() create(@CurrentTenantUser() actor: TenantJwtUser,@Body() dto: CreateRequestDto) { return this.desk.create(actor,dto); }
 @Get('mine') mine(@CurrentTenantUser() actor: TenantJwtUser) { return this.desk.mine(actor); }
 @Get('mine/:id') detail(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.desk.detail(actor,id); }
 @Post('mine/:id/comments') comment(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: CommentDto) { return this.desk.comment(actor,id,dto); }
 @Post('mine/:id/attachments') @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 10*1024*1024, files: 1 } })) attach(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@UploadedFile() file: Express.Multer.File) { return this.desk.attach(actor,id,file); }
 @Get('mine/:id/attachments/:attachmentId') async download(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Param('attachmentId') attachmentId: string,@Res() res: Response) {
  const { attachment, bytes } = await this.desk.download(actor,id,attachmentId); this.send(res,attachment.name,attachment.mimeType,bytes);
 }
 protected send(res: Response,name: string,mime: string,bytes: Buffer) { res.setHeader('Content-Type',mime); res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.send(bytes); }
}
@Controller('hr-requests/admin') @UseGuards(...guards,PermissionsGuard) @RequireFeatures(Feature.CORE_HR)
export class HrServiceDeskAdminController {
 constructor(private readonly desk: HrServiceDeskService) {}
 @Post('categories') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) category(@CurrentTenantUser() actor: TenantJwtUser,@Body() dto: CategoryDto) { return this.desk.category(actor,dto); }
 @Get('queue') @RequirePermissions(Permission.VIEW_HR_REQUESTS) queue(@CurrentTenantUser() actor: TenantJwtUser,@Query() dto: QueueDto) { return this.desk.queue(actor,dto); }
 @Get('report') @RequirePermissions(Permission.VIEW_HR_REQUESTS) report(@CurrentTenantUser() actor: TenantJwtUser) { return this.desk.report(actor); }
 @Get(':id') @RequirePermissions(Permission.VIEW_HR_REQUESTS) adminDetail(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string) { return this.desk.detail(actor,id,true); }
 @Patch(':id/assign') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) assign(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: AssignmentDto) { return this.desk.assign(actor,id,dto.userId); }
 @Patch(':id/priority') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) priority(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: PriorityDto) { return this.desk.priority(actor,id,dto.priority); }
 @Patch(':id/status') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) status(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: StatusDto) { return this.desk.status(actor,id,dto.status); }
 @Post(':id/escalate') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) escalate(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: EscalateDto) { return this.desk.assign(actor,id,dto.userId,dto.reason); }
 @Post(':id/comments') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) adminComment(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Body() dto: CommentDto) { return this.desk.comment(actor,id,dto,true); }
 @Post(':id/attachments') @RequirePermissions(Permission.MANAGE_HR_REQUESTS) @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 10*1024*1024, files: 1 } })) adminAttach(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@UploadedFile() file: Express.Multer.File,@Body('internal') internal?: string) { return this.desk.attach(actor,id,file,true,internal === 'true'); }
 @Get(':id/attachments/:attachmentId') @RequirePermissions(Permission.VIEW_HR_REQUESTS) async adminDownload(@CurrentTenantUser() actor: TenantJwtUser,@Param('id') id: string,@Param('attachmentId') attachmentId: string,@Res() res: Response) { const { attachment, bytes } = await this.desk.download(actor,id,attachmentId,true); res.setHeader('Content-Type',attachment.mimeType); res.setHeader('Content-Disposition',`attachment; filename="${attachment.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.send(bytes); }
}
