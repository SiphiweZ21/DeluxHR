import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunStatusDto } from './dto/update-payroll-run-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('payroll-runs')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: JwtUser) {
    return this.payrollService.create(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentUser() user: JwtUser) {
    return this.payrollService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.listByEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':id/ledger')
  async ledger(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const run = await this.payrollService.findOne(user.organizationId, id);
    return run.ledgerEntries ?? [];
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.payrollService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRunStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.updateStatus(user.organizationId, id, dto, user.sub);
  }

  @Patch(':id/recalculate')
  recalculate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.payrollService.recalculateTotals(user.organizationId, id, user.sub);
  }

  @Post('generate')
  generate(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: JwtUser) {
    return this.payrollService.generateFromEarnings(user.organizationId, dto, user.sub);
  }
}