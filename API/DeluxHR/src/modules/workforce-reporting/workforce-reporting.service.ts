import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceExceptionType, EmployeeStatus, PayrollRunStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
export type ReportRange = { from: string; to: string; start: Date; end: Date; endExclusive: Date; months: string[] };
const dayMs = 86400000;
const money = (n: number) => Math.round((n+Number.EPSILON)*100);
const month = (d: Date) => d.toISOString().slice(0,7);
export function parseReportRange(from: string,to: string): ReportRange {
 const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Dates must be YYYY-MM-DD');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== value || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new BadRequestException('Invalid calendar date');
  return d;
 };
 const start = date(from),end = date(to);
 if (end < start || (end.getTime()-start.getTime())/dayMs > 730) throw new BadRequestException('Date range must be ordered and at most 731 calendar days inclusive');
 const months: string[] = [];
 for (let d = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));d <= end;d = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1))) months.push(month(d));
 return { from,to,start,end,endExclusive: new Date(end.getTime()+dayMs),months };
}
const initialized = <T>(months: string[],value: () => T): Record<string,T> => Object.fromEntries(months.map(m=>[m,value()]));
const inRange = (d: Date | null | undefined,r: ReportRange) => !!d && d >= r.start && d < r.endExclusive;
const csvCell = (v: unknown) => { const s = String(v ?? ''); const safe = !/^-?\d+(\.\d+)?$/.test(s) && /^\s*[=+@\-\t\r]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g,'""')}"`; };
@Injectable()
export class WorkforceReportingService {
 constructor(private readonly db: PrismaService,private readonly audit: AuditService) {}
 async headcount(org: string,r: ReportRange) {
  const employees = await this.db.employee.findMany({ where: { organizationId: org }, select: { id: true, status: true, createdAt: true, activatedAt: true, employmentStartDate: true, terminatedAt: true } });
  const employed = (cutoff: Date) => employees.filter(e => {
   if (e.status === EmployeeStatus.PENDING_VERIFICATION && !e.activatedAt) return false;
   const start = e.activatedAt ?? e.employmentStartDate ?? e.createdAt;
   return start <= cutoff && (!e.terminatedAt || e.terminatedAt > cutoff);
  }).length;
  const rows = r.months.map(m => { const [year,mo] = m.split('-').map(Number); const last = new Date(Date.UTC(year,mo,0,23,59,59,999)); const point = last > r.end ? new Date(r.endExclusive.getTime()-1) : last; return { month: m, headcount: employed(point) }; });
  return { range: { from: r.from,to: r.to }, currentHeadcount: employed(new Date(r.endExclusive.getTime()-1)), rows, definition: 'Employees activated by snapshot end and not yet terminated; pending employees excluded.' };
 }
 private async runs(org: string,r: ReportRange) { return this.db.payrollRun.findMany({ where: { organizationId: org, payPeriodEnd: { gte: r.start, lt: r.endExclusive }, status: { in: [PayrollRunStatus.LOCKED,PayrollRunStatus.PAYMENT_PROCESSING,PayrollRunStatus.PAID] } }, select: { employeeId: true, payPeriodEnd: true, currency: true, grossEarnings: true, netPay: true, totalEmployerCost: true, totalDeductions: true, taxAmount: true, uifEmployee: true, uifEmployer: true, sdlEmployer: true } }); }
 async cost(org: string,r: ReportRange) {
  const runs = await this.runs(org,r);
  if (runs.some(x=>x.currency !== 'ZAR')) throw new BadRequestException('Mixed currency payroll cannot be combined in ZAR report');
  const values = initialized(r.months,()=>({ grossCents: 0,netCents: 0,employerCostCents: 0,runCount: 0 }));
  for (const x of runs) { const v=values[month(x.payPeriodEnd)];v.grossCents+=money(x.grossEarnings);v.netCents+=money(x.netPay);v.employerCostCents+=money(x.totalEmployerCost);v.runCount++; }
  return { currency: 'ZAR', rows: r.months.map(m=>({ month: m,...values[m] })), definition: 'Locked, payment-processing and paid payroll runs by period-end month.' };
 }
 async payroll(org: string,r: ReportRange) {
  const runs = await this.runs(org,r);
  if (runs.some(x=>x.currency !== 'ZAR')) throw new BadRequestException('Mixed currency payroll cannot be combined in ZAR report');
  const values = initialized(r.months,()=>({ grossCents: 0,netCents: 0,deductionsCents: 0,payeCents: 0,uifEmployeeCents: 0,uifEmployerCents: 0,sdlCents: 0,runCount: 0 }));
  for (const x of runs) { const v=values[month(x.payPeriodEnd)];v.grossCents+=money(x.grossEarnings);v.netCents+=money(x.netPay);v.deductionsCents+=money(x.totalDeductions);v.payeCents+=money(x.taxAmount);v.uifEmployeeCents+=money(x.uifEmployee);v.uifEmployerCents+=money(x.uifEmployer);v.sdlCents+=money(x.sdlEmployer);v.runCount++; }
  return { currency: 'ZAR', rows: r.months.map(m=>({ month: m,...values[m] })), definition: 'Posted payroll runs by period-end month; monetary values in cents.' };
 }
 async attendance(org: string,r: ReportRange) {
  const [records,exceptions] = await Promise.all([
   this.db.attendanceRecord.findMany({ where: { organizationId: org, workDate: { gte: r.start, lt: r.endExclusive } }, select: { employeeId: true, workDate: true, clockOut: true } }),
   this.db.attendanceException.findMany({ where: { organizationId: org, scheduledDate: { gte: r.start, lt: r.endExclusive } }, select: { scheduledDate: true, type: true, status: true } }),
  ]);
  const values = initialized(r.months,()=>({ recordedDays: 0,completedDays: 0,distinctEmployees: new Set<string>(),lateIncidents: 0,missingCheckIns: 0,missingCheckOuts: 0,expectedAbsences: 0 }));
  for (const x of records) { const v=values[month(x.workDate)];v.recordedDays++;if(x.clockOut)v.completedDays++;v.distinctEmployees.add(x.employeeId); }
  for (const x of exceptions) { const v=values[month(x.scheduledDate!)];if(x.type==='LATE_ARRIVAL')v.lateIncidents++;if(x.type==='MISSING_CHECK_IN')v.missingCheckIns++;if(x.type==='MISSING_CHECK_OUT')v.missingCheckOuts++;if(x.type==='EXPECTED_ABSENCE')v.expectedAbsences++; }
  return { rows: r.months.map(m=>({ month:m,recordedDays:values[m].recordedDays,completedDays:values[m].completedDays,distinctEmployees:values[m].distinctEmployees.size,lateIncidents:values[m].lateIncidents,missingCheckIns:values[m].missingCheckIns,missingCheckOuts:values[m].missingCheckOuts,expectedAbsences:values[m].expectedAbsences })),definition:'Attendance records by work date; incidents include open and resolved exceptions by scheduled date.' };
 }
 async absence(org: string,r: ReportRange) {
  const incidents = await this.db.attendanceException.findMany({ where: { organizationId: org, scheduledDate: { gte: r.start, lt: r.endExclusive }, type: { in: [AttendanceExceptionType.MISSING_CHECK_IN,AttendanceExceptionType.EXPECTED_ABSENCE] } }, select: { employeeId: true, scheduledDate: true, type: true, status: true } });
  const values = initialized(r.months,()=>({ missingCheckIns: 0,expectedAbsences: 0,open: 0,affectedEmployees: new Set<string>() }));
  for (const x of incidents) { const v=values[month(x.scheduledDate!)];if(x.type==='MISSING_CHECK_IN')v.missingCheckIns++;else v.expectedAbsences++;if(x.status==='OPEN')v.open++;v.affectedEmployees.add(x.employeeId); }
  return { rows: r.months.map(m=>({ month:m,missingCheckIns:values[m].missingCheckIns,expectedAbsences:values[m].expectedAbsences,open:values[m].open,affectedEmployees:values[m].affectedEmployees.size })),definition:'Absence incident counts, not an absenteeism rate; scheduled shift denominators are not inferred.' };
 }
 async late(org: string,r: ReportRange) {
  const incidents = await this.db.attendanceException.findMany({ where: { organizationId: org, type: AttendanceExceptionType.LATE_ARRIVAL, scheduledDate: { gte: r.start, lt: r.endExclusive } }, select: { employeeId: true, scheduledDate: true, status: true } });
  const values = initialized(r.months,()=>({ incidents: 0,open: 0,affectedEmployees: new Set<string>() }));
  for (const x of incidents) { const v=values[month(x.scheduledDate!)];v.incidents++;if(x.status==='OPEN')v.open++;v.affectedEmployees.add(x.employeeId); }
  return { rows: r.months.map(m=>({ month:m,incidents:values[m].incidents,open:values[m].open,affectedEmployees:values[m].affectedEmployees.size })) };
 }
 async overtime(org: string,r: ReportRange) {
  const entries = await this.db.timesheetEntry.findMany({ where: { workDate: { gte: r.start, lt: r.endExclusive }, timesheet: { organizationId: org, status: { in: [TimesheetStatus.APPROVED,TimesheetStatus.LOCKED] } } }, select: { workDate: true,hoursWorked: true,overtimeHours: true,scheduledHours: true } });
  const values = initialized(r.months,()=>({ workedHours: 0,overtimeHours: 0,scheduledHours: 0,entryCount: 0 }));
  for (const x of entries) { const v=values[month(x.workDate)];v.workedHours+=x.hoursWorked;v.overtimeHours+=x.overtimeHours;v.scheduledHours+=x.scheduledHours;v.entryCount++; }
  return { rows: r.months.map(m=>({ month:m,workedHours:Number(values[m].workedHours.toFixed(2)),overtimeHours:Number(values[m].overtimeHours.toFixed(2)),scheduledHours:Number(values[m].scheduledHours.toFixed(2)),entryCount:values[m].entryCount })),definition:'Approved or locked timesheet entries by work date.' };
 }
 async leave(org: string,r: ReportRange) {
  const requests = await this.db.leaveRequest.findMany({ where: { organizationId: org, status: 'APPROVED', startDate: { gte: r.start, lt: r.endExclusive } }, select: { startDate: true,chargedDays: true,leaveType: { select: { name: true } } } });
  const values = initialized(r.months,()=>({ approvedRequests: 0,chargedDays: 0 })); const types: Record<string,{ requests: number,chargedDays: number }> = {};
  for (const x of requests) { const v=values[month(x.startDate)];v.approvedRequests++;v.chargedDays+=x.chargedDays ?? 0;const t=types[x.leaveType.name] ?? { requests: 0,chargedDays: 0 };t.requests++;t.chargedDays+=x.chargedDays ?? 0;types[x.leaveType.name]=t; }
  return { rows: r.months.map(m=>({ month:m,approvedRequests:values[m].approvedRequests,chargedDays:Number(values[m].chargedDays.toFixed(2)) })),byType:types,definition:'Entire approved charged days attributed to request start month; spanning requests are not prorated.' };
 }
 async movement(org: string,r: ReportRange) {
  const employees = await this.db.employee.findMany({ where: { organizationId: org, OR: [{ activatedAt: { gte:r.start,lt:r.endExclusive } },{ terminatedAt: { gte:r.start,lt:r.endExclusive } }] }, select: { activatedAt: true,terminatedAt: true } });
  const values = initialized(r.months,()=>({ hires: 0,terminations: 0 }));
  for (const e of employees) { if(inRange(e.activatedAt,r))values[month(e.activatedAt!)].hires++;if(inRange(e.terminatedAt,r))values[month(e.terminatedAt!)].terminations++; }
  return { rows: r.months.map(m=>({ month:m,...values[m] })),definition:'Activation and termination events in the requested UTC date range.' };
 }
 async turnover(org: string,r: ReportRange) {
  const [movement,headcount] = await Promise.all([this.movement(org,r),this.headcount(org,r)]);
  const previous = headcount.rows.map((row,i)=>i ? headcount.rows[i-1].headcount : row.headcount-movement.rows[i].hires+movement.rows[i].terminations);
  return { rows: headcount.rows.map((row,i)=>{ const avg=(previous[i]+row.headcount)/2;return { month:row.month,terminations:movement.rows[i].terminations,averageHeadcount:Number(avg.toFixed(2)),turnoverPercent:avg>0 ? Number((movement.rows[i].terminations/avg*100).toFixed(2)) : null }; }),definition:'Monthly terminations divided by average of opening and closing headcount; first opening inferred from movement.' };
 }
 async hrService(org: string,r: ReportRange) {
  const requests = await this.db.hrServiceRequest.findMany({ where: { organizationId: org,createdAt: { gte:r.start,lt:r.endExclusive } }, select: { createdAt:true,status:true,priority:true,firstResponseAt:true,responseDueAt:true,resolutionDueAt:true,resolvedAt:true } });
  const values=initialized(r.months,()=>({ created:0,resolved:0,open:0,responseBreaches:0,resolutionBreaches:0,urgent:0 }));const now=new Date();
  for(const x of requests){ const v=values[month(x.createdAt)];v.created++;if(x.resolvedAt)v.resolved++;if(['OPEN','IN_PROGRESS'].includes(x.status))v.open++;if(x.responseDueAt && (x.firstResponseAt??now)>x.responseDueAt)v.responseBreaches++;if(x.resolutionDueAt && (x.resolvedAt??now)>x.resolutionDueAt)v.resolutionBreaches++;if(x.priority==='URGENT')v.urgent++; }
  return { rows:r.months.map(m=>({ month:m,...values[m] })),definition:'Cohort by request creation month; breach counts are evaluated at report time.' };
 }
 async departments(org: string,r: ReportRange) {
  const [departments,employees,runs,records] = await Promise.all([
   this.db.department.findMany({ where: { organizationId: org },select: { id:true,name:true } }),
   this.db.employee.findMany({ where: { organizationId: org },select: { id:true,departmentId:true,status:true,createdAt:true,activatedAt:true,employmentStartDate:true,terminatedAt:true } }),
   this.runs(org,r),
   this.db.attendanceRecord.findMany({ where: { organizationId: org, workDate: { gte:r.start,lt:r.endExclusive } },select: { employeeId:true } }),
  ]);
  if(runs.some(x=>x.currency!=='ZAR'))throw new BadRequestException('Mixed currency payroll cannot be combined');
  const cutoff=new Date(r.endExclusive.getTime()-1);const employeeDept=new Map(employees.map(e=>[e.id,e.departmentId]));const rows=departments.map(d=>({ departmentId:d.id,name:d.name,headcount:employees.filter(e=>e.departmentId===d.id && !(e.status===EmployeeStatus.PENDING_VERIFICATION && !e.activatedAt) && (e.activatedAt??e.employmentStartDate??e.createdAt)<=cutoff && (!e.terminatedAt || e.terminatedAt>cutoff)).length,attendanceDays:records.filter(x=>employeeDept.get(x.employeeId)===d.id).length,employerCostCents:runs.filter(x=>employeeDept.get(x.employeeId)===d.id).reduce((n,x)=>n+money(x.totalEmployerCost),0) }));
  return { currency:'ZAR',rows,definition:'Headcount at range end; current employee department attributed to historical attendance and posted payroll. Transfers are not reconstructed.' };
 }
 async locations(org:string,r:ReportRange) {
  const [locations,assignments,records,exceptions]=await Promise.all([
   this.db.workLocation.findMany({ where:{ organizationId:org },select:{ id:true,name:true,code:true } }),
   this.db.employeeWorkLocationAssignment.findMany({ where:{ organizationId:org,isPrimary:true,effectiveFrom:{ lt:r.endExclusive },OR:[{ effectiveTo:null },{ effectiveTo:{ gt:r.start } }] },select:{ workLocationId:true,employeeId:true } }),
   this.db.attendanceRecord.findMany({ where:{ organizationId:org,workDate:{ gte:r.start,lt:r.endExclusive } },select:{ workLocationId:true } }),
   this.db.attendanceException.findMany({ where:{ organizationId:org,scheduledDate:{ gte:r.start,lt:r.endExclusive } },select:{ workLocationId:true,type:true } }),
  ]);
  return { rows:locations.map(l=>({ locationId:l.id,name:l.name,code:l.code,assignedEmployees:new Set(assignments.filter(a=>a.workLocationId===l.id).map(a=>a.employeeId)).size,attendanceDays:records.filter(x=>x.workLocationId===l.id).length,exceptions:exceptions.filter(x=>x.workLocationId===l.id).length,lateIncidents:exceptions.filter(x=>x.workLocationId===l.id && x.type==='LATE_ARRIVAL').length })),unassignedAttendanceDays:records.filter(x=>!x.workLocationId).length,definition:'Attendance and exceptions use recorded site; assigned count uses primary assignments overlapping the range.' };
 }
 async report(org:string,r:ReportRange,type:string):Promise<any> {
  switch(type){case'headcount':return this.headcount(org,r);case'cost':return this.cost(org,r);case'attendance':return this.attendance(org,r);case'absence':return this.absence(org,r);case'late':return this.late(org,r);case'overtime':return this.overtime(org,r);case'leave':return this.leave(org,r);case'departments':return this.departments(org,r);case'locations':return this.locations(org,r);case'payroll':return this.payroll(org,r);case'movement':return this.movement(org,r);case'turnover':return this.turnover(org,r);case'hr-service':return this.hrService(org,r);default:throw new BadRequestException('Unknown report'); }
 }
 async overview(org:string,r:ReportRange) {
  const [headcount,cost,attendance,absence,overtime,leave,movement,hrService]=await Promise.all([this.headcount(org,r),this.cost(org,r),this.attendance(org,r),this.absence(org,r),this.overtime(org,r),this.leave(org,r),this.movement(org,r),this.hrService(org,r)]);
  const sum=(rows:any[],field:string)=>rows.reduce((n,x)=>n+(x[field]??0),0);
  return { range:{ from:r.from,to:r.to },headcount:headcount.currentHeadcount,employerCostCents:sum(cost.rows,'employerCostCents'),recordedAttendanceDays:sum(attendance.rows,'recordedDays'),absenceIncidents:sum(absence.rows,'missingCheckIns')+sum(absence.rows,'expectedAbsences'),lateIncidents:sum(attendance.rows,'lateIncidents'),overtimeHours:Number(sum(overtime.rows,'overtimeHours').toFixed(2)),approvedLeaveDays:Number(sum(leave.rows,'chargedDays').toFixed(2)),hires:sum(movement.rows,'hires'),terminations:sum(movement.rows,'terminations'),hrRequests:sum(hrService.rows,'created'),currency:'ZAR' };
 }
 async exportCsv(actor:TenantJwtUser,r:ReportRange,type:string) {
  const result=await this.report(actor.organizationId,r,type);
  const rows:Record<string,unknown>[]=result.rows;
  const keys=rows.length?Object.keys(rows[0]):[];
  const csv=[keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(','))].join('\r\n')+'\r\n';
  await this.audit.log({ organizationId:actor.organizationId,action:'WORKFORCE_REPORT_EXPORTED',entity:'WorkforceReport',entityId:type,actorUserId:actor.sub,actorEmail:actor.email,actorRole:actor.role,metadata:{ from:r.from,to:r.to,type } });
  return csv;
 }
}
