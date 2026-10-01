import { AuditService } from '../audit/audit.service';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature, Permission } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PayslipsService } from './payslips.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { GeneratePayslipDto } from './dto/generate-payslip.dto';
import { UpdatePayslipStatusDto } from './dto/update-payslip-status.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYSLIPS)
@RequirePermissions(Permission.VIEW_PAYROLL, Permission.VIEW_ALL_PAYSLIPS)
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService, private readonly audit: AuditService) {}

  @Post('generate')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  generate(@Body() dto: GeneratePayslipDto, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payslipsService.generate(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentTenantUser() user: TenantJwtUser) {
    return this.payslipsService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payslipsService.listByEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payslipsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayslipStatusDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payslipsService.updateStatus(user.organizationId, id, dto);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
    @Res() res: Response,
  ) {
    const pdf = await this.payslipsService.generatePdf(user.organizationId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
    });

    await this.audit.log({ organizationId: user.organizationId, action: 'PAYSLIP_PDF_DOWNLOADED', entity: 'Payslip', entityId: id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
    res.send(pdf);
  }

  @Post(':id/send-whatsapp')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  sendWhatsApp(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payslipsService.generateAndSendWhatsApp(
      user.organizationId,
      id,
    );
  }
}