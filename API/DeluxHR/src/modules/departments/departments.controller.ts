import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';

@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: JwtUser) {
    return this.departmentsService.create(user.organizationId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtUser) {
    return this.departmentsService.findAll(user.organizationId);
  }
}
