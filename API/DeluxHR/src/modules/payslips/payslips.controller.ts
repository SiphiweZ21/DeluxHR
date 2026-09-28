import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PayslipsService } from './payslips.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtUser } from '../../common/auth/jwt-user.type';
import { GeneratePayslipDto } from './dto/generate-payslip.dto';
import { UpdatePayslipStatusDto } from './dto/update-payslip-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePayslipDto, @CurrentUser() user: JwtUser) {
    return this.payslipsService.generate(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentUser() user: JwtUser) {
    return this.payslipsService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payslipsService.listByEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.payslipsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayslipStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payslipsService.updateStatus(user.organizationId, id, dto);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const pdf = await this.payslipsService.generatePdf(user.organizationId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
    });

    res.send(pdf);
  }

  @Post(':id/send-whatsapp')
  sendWhatsApp(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.payslipsService.generateAndSendWhatsApp(
      user.organizationId,
      id,
    );
  }
}