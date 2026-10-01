import { IsIn, Matches } from 'class-validator';
export class DateRangeDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string; @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string; }
export class ExportDto extends DateRangeDto { @IsIn(['headcount','attendance','absence','late','overtime','leave','locations','movement','turnover','hr-service']) report!: string; }
export class CostExportDto extends DateRangeDto { @IsIn(['cost','payroll','departments']) report!: string; }
