import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Feature, LeaveDocumentKind, Permission } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../../common/entitlements/features.guard';
import { RequireFeatures } from '../../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../../common/access/permissions.guard';
import { RequirePermissions } from '../../../common/access/require-permissions.decorator';
import { LeaveWorkflowsService } from './leave-workflows.service';
import { ChangeDto, CommentDto, CreateDelegationDto, CreateWorkflowDto, DecisionDto, DocumentKindDto, ReviewChangeDto } from './dto/leave-workflow.dto';
@UseGuards(JwtAuthGuard,TenantAccessGuard,FeaturesGuard,PermissionsGuard)
@RequireFeatures(Feature.LEAVE)
@Controller('leave-workflows')
export class LeaveWorkflowsController {
 constructor(private readonly service: LeaveWorkflowsService) {}
 @Post() @RequirePermissions(Permission.MANAGE_LEAVE)
 create(@Body() dto: CreateWorkflowDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.createWorkflow(user,dto); }
 @Get() @RequirePermissions(Permission.MANAGE_LEAVE)
 list(@CurrentTenantUser() user: TenantJwtUser) { return this.service.workflows(user.organizationId); }
 @Patch(':id/deactivate') @RequirePermissions(Permission.MANAGE_LEAVE)
 deactivate(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.deactivate(user,id); }
 @Post('delegations') @RequirePermissions(Permission.MANAGE_LEAVE)
 delegate(@Body() dto: CreateDelegationDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.delegate(user,dto); }
 @Get('queue')
 queue(@CurrentTenantUser() user: TenantJwtUser) { return this.service.queue(user); }
 @Get('notifications')
 notifications(@CurrentTenantUser() user: TenantJwtUser) { return this.service.notify(user); }
 @Patch('notifications/:id/read')
 read(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.readNotification(user,id); }
 @Post('decisions/:id')
 decide(@Param('id') id: string,@Body() dto: DecisionDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.decide(user,id,dto); }
 @Get('requests/:requestId/decisions')
 decisions(@Param('requestId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.decisions(user,id); }
 @Post('requests/:requestId/documents')
 @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 10*1024*1024, files: 1 } }))
 upload(@Param('requestId') id: string,@Body() dto: DocumentKindDto,@UploadedFile() file: Express.Multer.File,@CurrentTenantUser() user: TenantJwtUser) { return this.service.upload(user,id,dto.kind,file); }
 @Get('requests/:requestId/documents')
 documents(@Param('requestId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.documents(user,id); }
 @Get('requests/:requestId/documents/:id/file') @Header('Cache-Control','private, no-store, max-age=0')
 async file(@Param('requestId') requestId: string,@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser,@Res() res: Response) {
   const { doc, bytes } = await this.service.documentFile(user,requestId,id);
   res.setHeader('Content-Type',doc.mimeType); res.setHeader('Content-Length',bytes.length.toString()); res.setHeader('Content-Disposition',`attachment; filename="${doc.originalFileName.replace(/[\\/"\r\n\x00-\x1f]/g,'_')}"`); res.setHeader('X-Content-Type-Options','nosniff'); res.send(bytes);
 }
 @Post('requests/:requestId/comments')
 comment(@Param('requestId') id: string,@Body() dto: CommentDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.comment(user,id,dto); }
 @Get('requests/:requestId/comments')
 comments(@Param('requestId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.comments(user,id); }
 @Get('requests/:requestId/history')
 history(@Param('requestId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.history(user,id); }
 @Post('requests/:requestId/changes')
 requestChange(@Param('requestId') id: string,@Body() dto: ChangeDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.requestChange(user,id,dto); }
 @Post('changes/:id/review') @RequirePermissions(Permission.MANAGE_LEAVE)
 reviewChange(@Param('id') id: string,@Body() dto: ReviewChangeDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.reviewChange(user,id,dto); }
}
