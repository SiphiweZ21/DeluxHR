import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import { CurrentPlatformUser } from '../../common/auth/current-platform-user.decorator';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';
import { EarlyPayTreasuryService } from './treasury.service';
import {
  CreateFundingDto,
  FundingReviewDto,
  PreparePayoutDto,
  TreasuryActionDto,
  SubmitPayoutDto,
  PayoutResultDto,
} from './treasury.dto';
@Controller('platform-admin/early-pay-treasury')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
export class EarlyPayTreasuryController {
  constructor(private readonly service: EarlyPayTreasuryService) {}
  @Get() workspace(@CurrentPlatformUser() a: PlatformJwtUser) {
    return this.service.workspace(a);
  }
  @Get('eligible') eligible(@CurrentPlatformUser() a: PlatformJwtUser) {
    return this.service.eligible(a);
  }
  @Post('funding') funding(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Body() d: CreateFundingDto,
  ) {
    return this.service.createFunding(a, d);
  }
  @Post('funding/:id/inspect') inspect(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TreasuryActionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.service.inspectFunding(a, id, d);
  }
  @Post('funding/:id/review') review(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: FundingReviewDto,
  ) {
    return this.service.reviewFunding(a, id, d);
  }
  @Post('funding/:id/retire') retire(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TreasuryActionDto,
  ) {
    return this.service.retireFunding(a, id, d);
  }
  @Post('batches') prepare(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Body() d: PreparePayoutDto,
  ) {
    return this.service.prepare(a, d);
  }
  @Get('batches/:id') detail(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(a, id);
  }
  @Post('batches/:id/inspect') inspectBatch(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TreasuryActionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.service.inspectBatch(a, id, d);
  }
  @Post('batches/:id/approve') approve(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TreasuryActionDto,
  ) {
    return this.service.approve(a, id, d);
  }
  @Post('batches/:id/cancel') cancel(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TreasuryActionDto,
  ) {
    return this.service.cancel(a, id, d);
  }
  @Post('batches/:id/submit') submit(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SubmitPayoutDto,
  ) {
    return this.service.submit(a, id, d);
  }
  @Post('batches/:id/items/:itemId/result') result(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() d: PayoutResultDto,
  ) {
    return this.service.result(a, id, itemId, d);
  }
  @Post('batches/:id/report') async report(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.file(a, id, 'report', res);
  }
  @Post('batches/:id/draft') async draft(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.file(a, id, 'draft', res);
  }
  @Post('batches/:id/export') export() {
    return this.service.productionExport();
  }
  private async file(
    a: PlatformJwtUser,
    id: string,
    kind: 'report' | 'draft',
    res: Response,
  ) {
    const f = await this.service.download(a, id, kind);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-File-SHA256', f.sha256);
    return res.send(f.content);
  }
}
