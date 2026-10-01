import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/access/access-control.service';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature, Permission } from '@prisma/client';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateEarlyPayRequestDto } from './dto/create-early-pay-request.dto';
import { ReviewEarlyPayRequestDto } from './dto/review-early-pay-request.dto';
import { UpdateEarlyPayPolicyDto } from './dto/update-early-pay-policy.dto';
import { EarlyPayService } from './early-pay.service';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.EARLY_PAY)
@Controller('early-pay')
export class EarlyPayController {
  constructor(
    private readonly service: EarlyPayService,
    private readonly access: AccessControlService,
    private readonly db: PrismaService,
  ) {}
  private async ownOrAdministrator(user: TenantJwtUser, employeeId: string) {
    if (await this.access.hasPermission(user, Permission.APPROVE_EARLY_PAY))
      return;
    if (!(await this.access.hasPermission(user, Permission.REQUEST_EARLY_PAY)))
      throw new ForbiddenException('Early Pay request permission is required.');
    const employee = await this.db.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        userId: user.sub,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!employee)
      throw new ForbiddenException(
        'You can only access your own active employee Early Pay record.',
      );
  }
  @Get('policy') policy(@CurrentTenantUser() user: TenantJwtUser) {
    return this.service.getPolicy(user.organizationId);
  }
  @Patch('policy')
  @RequirePermissions(Permission.MANAGE_EARLY_PAY_POLICY)
  updatePolicy(
    @Body() dto: UpdateEarlyPayPolicyDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.updatePolicy(user.organizationId, dto);
  }
  @Get('quote/:employeeId') async quote(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    await this.ownOrAdministrator(user, employeeId);
    return this.service.quote(user.organizationId, employeeId);
  }
  @Get('requests') @RequirePermissions(Permission.APPROVE_EARLY_PAY) requests(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.listAll(user.organizationId);
  }
  @Get('requests/employee/:employeeId') async employeeRequests(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    await this.ownOrAdministrator(user, employeeId);
    return this.service.listByEmployee(user.organizationId, employeeId);
  }
  @Post('requests') async create(
    @Body() dto: CreateEarlyPayRequestDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    await this.ownOrAdministrator(user, dto.employeeId);
    return this.service.createRequest(user.organizationId, dto);
  }
  @Patch('requests/:id/review')
  @RequirePermissions(Permission.APPROVE_EARLY_PAY)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewEarlyPayRequestDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.review(user.organizationId, id, user.sub, dto);
  }
  @Post('requests/:id/process-payment')
  @RequirePermissions(Permission.APPROVE_EARLY_PAY)
  process(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.service.processPayment(user.organizationId, id);
  }
}
