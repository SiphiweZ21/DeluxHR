import { BadRequestException } from '@nestjs/common';
import { EmployeeStatus, PayrollRunStatus } from '@prisma/client';
import { parseReportRange, WorkforceReportingService } from './workforce-reporting.service';

describe('workforce reporting', () => {
  const range = parseReportRange('2026-02-01', '2026-02-28');
  it('rejects malformed and impossible dates and excessive windows', () => {
    for (const [from,to] of [['2026-99-99','2026-12-01'],['2026-02-30','2026-03-01'],['2026-02-28','2026-02-01'],['2020-01-01','2023-01-01']]) {
      expect(() => parseReportRange(from,to)).toThrow(BadRequestException);
    }
    expect(parseReportRange('2024-02-29','2024-02-29').months).toEqual(['2024-02']);
  });
  it('counts historical headcount at the selected end date', async () => {
    const db:any={ employee:{ findMany:jest.fn().mockResolvedValue([
      {id:'a',status:EmployeeStatus.ACTIVE,createdAt:new Date('2025-01-01'),activatedAt:new Date('2025-01-10'),employmentStartDate:null,terminatedAt:null},
      {id:'b',status:EmployeeStatus.TERMINATED,createdAt:new Date('2025-01-01'),activatedAt:new Date('2025-01-10'),employmentStartDate:null,terminatedAt:new Date('2026-03-01')},
      {id:'c',status:EmployeeStatus.PENDING_VERIFICATION,createdAt:new Date('2025-01-01'),activatedAt:null,employmentStartDate:null,terminatedAt:null},
    ])}};
    const result=await new WorkforceReportingService(db,{} as any).headcount('tenant-a',range);
    expect(result.currentHeadcount).toBe(2);
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'tenant-a'}}));
  });
  it('reads only posted payroll runs for the requested tenant', async () => {
    const db:any={ payrollRun:{findMany:jest.fn().mockResolvedValue([])}};
    await new WorkforceReportingService(db,{} as any).cost('tenant-a',range);
    expect(db.payrollRun.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'tenant-a',status:{in:[PayrollRunStatus.LOCKED,PayrollRunStatus.PAYMENT_PROCESSING,PayrollRunStatus.PAID]}})}));
  });
  it('escapes spreadsheet formulas in exported labels and audits the export', async () => {
    const audit:any={log:jest.fn()};const service=new WorkforceReportingService({} as any,audit);
    jest.spyOn(service,'report').mockResolvedValue({rows:[{name:'=SUM(1,1)',count:1}]});
    const actor:any={organizationId:'tenant-a',sub:'user-a',email:'a@b.test',role:'HR_ADMIN'};
    const csv=await service.exportCsv(actor,range,'locations');
    expect(csv).toContain("\"'=SUM(1,1)\"");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({organizationId:'tenant-a',action:'WORKFORCE_REPORT_EXPORTED'}));
  });
});
