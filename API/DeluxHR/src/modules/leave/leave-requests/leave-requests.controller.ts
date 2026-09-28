import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtUser } from '../../../common/auth/jwt-user.type';

@UseGuards(JwtAuthGuard)
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly service: LeaveRequestsService) {}

  @Post()
  create(@Body() dto: CreateLeaveRequestDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user.organizationId, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.organizationId);
  }

  @Get(':leaveRequestId')
  findOne(
    @Param('leaveRequestId') leaveRequestId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findOne(user.organizationId, leaveRequestId);
  }

  @Patch(':leaveRequestId/status')
  updateStatus(
    @Param('leaveRequestId') leaveRequestId: string,
    @Body() dto: UpdateLeaveStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateStatus(
      user.organizationId,
      leaveRequestId,
      dto.status,
    );
  }
}
