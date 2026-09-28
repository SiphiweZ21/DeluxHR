import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
import { CreateEarlyPayRequestDto } from './dto/create-early-pay-request.dto';
import { ReviewEarlyPayRequestDto } from './dto/review-early-pay-request.dto';
import { UpdateEarlyPayPolicyDto } from './dto/update-early-pay-policy.dto';
import { EarlyPayService } from './early-pay.service';

@UseGuards(JwtAuthGuard)
@Controller('early-pay')
export class EarlyPayController {
  constructor(private readonly service: EarlyPayService) {}
  @Get('policy') policy(@CurrentUser() user: JwtUser) { return this.service.getPolicy(user.organizationId); }
  @Patch('policy') updatePolicy(@Body() dto: UpdateEarlyPayPolicyDto, @CurrentUser() user: JwtUser) { return this.service.updatePolicy(user.organizationId, dto); }
  @Get('quote/:employeeId') quote(@Param('employeeId') employeeId: string, @CurrentUser() user: JwtUser) { return this.service.quote(user.organizationId, employeeId); }
  @Get('requests') requests(@CurrentUser() user: JwtUser) { return this.service.listAll(user.organizationId); }
  @Get('requests/employee/:employeeId') employeeRequests(@Param('employeeId') employeeId: string, @CurrentUser() user: JwtUser) { return this.service.listByEmployee(user.organizationId, employeeId); }
  @Post('requests') create(@Body() dto: CreateEarlyPayRequestDto, @CurrentUser() user: JwtUser) { return this.service.createRequest(user.organizationId, dto); }
  @Patch('requests/:id/review') review(@Param('id') id: string, @Body() dto: ReviewEarlyPayRequestDto, @CurrentUser() user: JwtUser) { return this.service.review(user.organizationId, id, user.sub, dto); }
  @Post('requests/:id/process-payment') process(@Param('id') id: string, @CurrentUser() user: JwtUser) { return this.service.processPayment(user.organizationId, id); }
}
