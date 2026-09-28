import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtUser } from '../../../common/auth/jwt-user.type';

@UseGuards(JwtAuthGuard)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly service: LeaveTypesService) {}

  @Post()
  create(@Body() dto: CreateLeaveTypeDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user.organizationId, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.organizationId);
  }
}
