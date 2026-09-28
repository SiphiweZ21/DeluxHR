import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { UpdateTimesheetStatusDto } from './dto/update-timesheet-status.dto';
import { CreateTimesheetEntryDto } from './dto/create-timesheet-entry.dto';
import { UpdateTimesheetEntryDto } from './dto/update-timesheet-entry.dto';

@UseGuards(JwtAuthGuard)
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Post()
  create(@Body() dto: CreateTimesheetDto, @CurrentUser() user: JwtUser) {
    return this.timesheetsService.create(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentUser() user: JwtUser) {
    return this.timesheetsService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.timesheetsService.listByEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.timesheetsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTimesheetStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.timesheetsService.updateStatus(user.organizationId, id, dto);
  }

  @Post('entries')
  addEntry(
    @Body() dto: CreateTimesheetEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.timesheetsService.addEntry(user.organizationId, dto);
  }

  @Patch('entries/:entryId')
  updateEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateTimesheetEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.timesheetsService.updateEntry(
      user.organizationId,
      entryId,
      dto,
    );
  }

  @Delete('entries/:entryId')
  deleteEntry(
    @Param('entryId') entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.timesheetsService.deleteEntry(user.organizationId, entryId);
  }
}