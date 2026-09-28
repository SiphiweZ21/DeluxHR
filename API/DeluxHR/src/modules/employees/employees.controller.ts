import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { BulkCreateEmployeesDto } from './dto/bulk-create-employees.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: JwtUser) {
    return this.employeesService.create(user.organizationId, dto);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: BulkCreateEmployeesDto, @CurrentUser() user: JwtUser) {
    return this.employeesService.bulkCreate(user.organizationId, dto.employees);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.employeesService.list(user.organizationId);
  }

  @Get(':employeeId')
  findOne(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.employeesService.findOne(user.organizationId, employeeId);
  }
}
