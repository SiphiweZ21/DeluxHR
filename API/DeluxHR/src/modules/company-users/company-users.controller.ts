import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Permission } from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { CompanyUsersService } from './company-users.service';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserRoleDto } from './dto/update-company-user-role.dto';
import { UpdateCompanyUserStatusDto } from './dto/update-company-user-status.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  PermissionsGuard,
)
@Controller('company-users')
export class CompanyUsersController {
  constructor(
    private readonly companyUsersService: CompanyUsersService,
  ) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_USERS)
  create(
    @Body() dto: CreateCompanyUserDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.create(
      user.organizationId,
      dto,
      user,
    );
  }

  @Get()
  @RequirePermissions(Permission.MANAGE_USERS)
  list(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.list(
      user.organizationId,
    );
  }

  @Get(':userId')
  @RequirePermissions(Permission.MANAGE_USERS)
  findOne(
    @Param('userId') userId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.findOne(
      user.organizationId,
      userId,
    );
  }

  @Patch(':userId/role')
  @RequirePermissions(Permission.MANAGE_ACCESS)
  updateRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateCompanyUserRoleDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.updateRole(
      user.organizationId,
      userId,
      dto,
      user,
    );
  }

  @Patch(':userId/status')
  @RequirePermissions(Permission.MANAGE_USERS)
  updateStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateCompanyUserStatusDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.updateStatus(
      user.organizationId,
      userId,
      dto,
      user,
    );
  }

  @Put(':userId/permissions')
  @RequirePermissions(Permission.MANAGE_ACCESS)
  setPermissions(
    @Param('userId') userId: string,
    @Body() dto: SetUserPermissionsDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.companyUsersService.setPermissions(
      user.organizationId,
      userId,
      dto,
      user,
    );
  }
}