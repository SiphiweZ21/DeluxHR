import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { CostExportDto, DateRangeDto, ExportDto } from './workforce-reporting.dto';
import { parseReportRange, WorkforceReportingService } from './workforce-reporting.service';
const guards=[JwtAuthGuard,TenantAccessGuard,FeaturesGuard,PermissionsGuard];
@Controller('workforce-reports') @UseGuards(...guards) @RequireFeatures(Feature.WORKFORCE_INSIGHTS)
export class WorkforceReportingController {
 constructor(private readonly reports: WorkforceReportingService) {}
 private data(actor:TenantJwtUser,q:DateRangeDto,type:string){return this.reports.report(actor.organizationId,parseReportRange(q.from,q.to),type);}
 @Get('headcount') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) headcount(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'headcount');}
 @Get('attendance') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) attendance(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'attendance');}
 @Get('absence') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) absence(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'absence');}
 @Get('late') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) late(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'late');}
 @Get('overtime') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) overtime(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'overtime');}
 @Get('leave') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) leave(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'leave');}
 @Get('locations') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) locations(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'locations');}
 @Get('movement') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) movement(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'movement');}
 @Get('turnover') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) turnover(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'turnover');}
 @Get('hr-service') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) hr(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'hr-service');}
 @Get('cost') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS,Permission.VIEW_WORKFORCE_COST) cost(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'cost');}
 @Get('payroll') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS,Permission.VIEW_WORKFORCE_COST) payroll(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'payroll');}
 @Get('departments') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS,Permission.VIEW_WORKFORCE_COST) departments(@CurrentTenantUser() a:TenantJwtUser,@Query() q:DateRangeDto){return this.data(a,q,'departments');}
 @Get('export.csv') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS) async export(@CurrentTenantUser() a:TenantJwtUser,@Query() q:ExportDto,@Res() res:Response){return this.send(res,q.report,await this.reports.exportCsv(a,parseReportRange(q.from,q.to),q.report));}
 @Get('cost/export.csv') @RequirePermissions(Permission.VIEW_WORKFORCE_INSIGHTS,Permission.VIEW_WORKFORCE_COST) async exportCost(@CurrentTenantUser() a:TenantJwtUser,@Query() q:CostExportDto,@Res() res:Response){return this.send(res,q.report,await this.reports.exportCsv(a,parseReportRange(q.from,q.to),q.report));}
 private send(res:Response,type:string,csv:string){res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="DeluxHR-${type}.csv"`);res.setHeader('Cache-Control','no-store');res.send(csv);}
}
@Controller('executive-workforce') @UseGuards(...guards) @RequireFeatures(Feature.EXECUTIVE_DASHBOARD) @RequirePermissions(Permission.VIEW_EXECUTIVE_DASHBOARD,Permission.VIEW_WORKFORCE_COST)
export class ExecutiveWorkforceController {
 constructor(private readonly reports:WorkforceReportingService){}
 @Get('overview') overview(@CurrentTenantUser() actor:TenantJwtUser,@Query() q:DateRangeDto){return this.reports.overview(actor.organizationId,parseReportRange(q.from,q.to));}
}
