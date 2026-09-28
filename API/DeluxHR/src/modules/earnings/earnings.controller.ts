import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
import { CreateEarningDto } from './dto/create-earning.dto';
import { UpdateEarningStatusDto } from './dto/update-earning-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Post()
  create(@Body() dto: CreateEarningDto, @CurrentUser() user: JwtUser) {
    return this.earningsService.create(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentUser() user: JwtUser) {
    return this.earningsService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.earningsService.listByEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.earningsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateEarningStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.earningsService.updateStatus(user.organizationId, id, dto);
  }

  @Post('generate-from-timesheet/:timesheetId')
  generateFromTimesheet(
    @Param('timesheetId') timesheetId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.earningsService.generateFromTimesheet(
      user.organizationId,
      timesheetId,
    );
  }
}