import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { EmployeeDocumentsService } from './employee-documents.service';
import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';
import { RejectEmployeeDocumentDto } from './dto/reject-employee-document.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.CORE_HR)
@Controller('employees/:employeeId/documents')
export class EmployeeDocumentsController {
  constructor(
    private readonly employeeDocumentsService: EmployeeDocumentsService,
  ) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_EMPLOYEE_DOCUMENTS)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  upload(
    @Param('employeeId')
    employeeId: string,
    @Body()
    dto: UploadEmployeeDocumentDto,
    @UploadedFile()
    file: Express.Multer.File,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.upload(
      user.organizationId,
      employeeId,
      dto,
      file,
      user,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_EMPLOYEE_DOCUMENTS)
  list(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.list(user.organizationId, employeeId);
  }

  @Get('checklist')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_DOCUMENTS)
  checklist(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.getChecklist(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':documentId/file')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_DOCUMENTS)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async getFile(
    @Param('employeeId')
    employeeId: string,
    @Param('documentId')
    documentId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
    @Res()
    response: Response,
  ) {
    const file = await this.employeeDocumentsService.getFile(
      user.organizationId,
      employeeId,
      documentId,
      user,
    );

    const safeFileName = this.toSafeDownloadFileName(file.fileName);

    response.setHeader('Content-Type', file.mimeType);

    response.setHeader('Content-Length', file.buffer.length.toString());

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"`,
    );

    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.send(file.buffer);
  }

  @Post(':documentId/verify')
  @RequirePermissions(Permission.VERIFY_EMPLOYEE_DOCUMENTS)
  verify(
    @Param('employeeId')
    employeeId: string,
    @Param('documentId')
    documentId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.verify(
      user.organizationId,
      employeeId,
      documentId,
      user,
    );
  }

  @Post(':documentId/reject')
  @RequirePermissions(Permission.VERIFY_EMPLOYEE_DOCUMENTS)
  reject(
    @Param('employeeId')
    employeeId: string,
    @Param('documentId')
    documentId: string,
    @Body()
    dto: RejectEmployeeDocumentDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.reject(
      user.organizationId,
      employeeId,
      documentId,
      dto.reason,
      user,
    );
  }

  @Get(':documentId')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_DOCUMENTS)
  findOne(
    @Param('employeeId')
    employeeId: string,
    @Param('documentId')
    documentId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeeDocumentsService.findOne(
      user.organizationId,
      employeeId,
      documentId,
    );
  }

  private toSafeDownloadFileName(fileName: string): string {
    const sanitized = fileName
      .replace(/[\/\\]/g, '_')
      .replace(/["\r\n]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim();

    return sanitized || 'document';
  }
}
