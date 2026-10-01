import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature } from '@prisma/client';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard)
@RequireFeatures(Feature.CORE_HR)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  create(@Body() dto: CreateDepartmentDto, @CurrentTenantUser() user: TenantJwtUser) {
    return this.departmentsService.create(user.organizationId, dto);
  }

  @Get()
  findAll(@CurrentTenantUser() user: TenantJwtUser) {
    return this.departmentsService.findAll(user.organizationId);
  }
}
