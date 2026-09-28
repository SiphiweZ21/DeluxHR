'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  getAttendanceRecords,
  getDepartments,
  getEmployees,
  getLeaveRequests,
  getPayrollRuns,
  getTimesheets,
  type AttendanceRecord,
  type Department,
  type Employee,
  type LeaveRequest,
  type PayrollRun,
  type Timesheet,
} from '../../lib/api';

export default function CeoDashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const [employeesData, departmentsData, attendanceData, leaveData, timesheetsData, payrollData] = await Promise.all([
        getEmployees(), getDepartments(), getAttendanceRecords(), getLeaveRequests(), getTimesheets(), getPayrollRuns(),
      ]);
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
      setAttendance(Array.isArray(attendanceData) ? attendanceData : []);
      setLeaveRequests(Array.isArray(leaveData) ? leaveData : []);
      setTimesheets(Array.isArray(timesheetsData) ? timesheetsData : []);
      setPayrollRuns(Array.isArray(payrollData) ? payrollData : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load executive dashboard');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const today = new Date().toISOString().slice(0, 10);

  const metrics = useMemo(() => {
    const currentPayroll = payrollRuns.filter((run) => run.status !== 'CANCELLED');
    const grossPayroll = currentPayroll.reduce((sum, run) => sum + (run.grossEarnings || 0), 0);
    const netPayroll = currentPayroll.reduce((sum, run) => sum + (run.netPay || 0), 0);
    const todayAttendance = attendance.filter((record) => record.workDate?.slice(0, 10) === today);
    const clockedIn = todayAttendance.filter((record) => !record.clockOut).length;
    const onLeaveToday = leaveRequests.filter((request) =>
      request.status === 'APPROVED' && request.startDate.slice(0, 10) <= today && request.endDate.slice(0, 10) >= today,
    ).length;
    const pendingLeave = leaveRequests.filter((request) => request.status === 'PENDING').length;
    const pendingTimesheets = timesheets.filter((sheet) => sheet.status === 'DRAFT' || sheet.status === 'SUBMITTED').length;
    const pendingPayroll = payrollRuns.filter((run) => ['DRAFT', 'REVIEWED', 'APPROVED'].includes(run.status)).length;
    return {
      headcount: employees.length, grossPayroll, netPayroll, clockedIn, onLeaveToday,
      pendingLeave, pendingTimesheets, pendingPayroll,
      totalAttention: pendingLeave + pendingTimesheets + pendingPayroll,
    };
  }, [employees, attendance, leaveRequests, timesheets, payrollRuns, today]);

  const departmentMix = useMemo(() => {
    return departments.map((department) => ({
      id: department.id,
      name: department.name,
      count: employees.filter((employee) => employee.departmentId === department.id).length,
    })).sort((a, b) => b.count - a.count);
  }, [departments, employees]);

  const payrollTrend = useMemo(() => {
    const grouped = new Map<string, { gross: number; net: number }>();
    payrollRuns.filter((run) => run.status !== 'CANCELLED').forEach((run) => {
      const period = run.payPeriodStart?.slice(0, 7) ?? 'Unknown';
      const current = grouped.get(period) ?? { gross: 0, net: 0 };
      grouped.set(period, { gross: current.gross + (run.grossEarnings || 0), net: current.net + (run.netPay || 0) });
    });
    return Array.from(grouped.entries()).map(([period, values]) => ({ period, ...values })).sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
  }, [payrollRuns]);

  const recentLeave = useMemo(() => [...leaveRequests].sort((a, b) =>
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  ).slice(0, 5), [leaveRequests]);

  const newEmployees = useMemo(() => [...employees].filter((employee) => employee.createdAt).sort((a, b) =>
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  ).slice(0, 4), [employees]);

  function employeeName(employeeId: string) {
    const employee = employees.find((item) => item.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : 'Employee';
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">Executive workforce intelligence</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Your workforce, at a glance.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              See workforce size, payroll cost, who is working, what needs attention, and what is changing across the organisation.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs font-medium text-slate-400">Executive attention</p>
            <p className="mt-1 text-3xl font-semibold">{metrics.totalAttention}</p>
            <p className="mt-1 text-xs text-slate-400">open workforce and payroll items</p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading executive intelligence...</div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">Executive data could not be loaded.</p><p className="mt-1">{errorMessage}</p>
          <button onClick={loadData} className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-white">Try again</button>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard eyebrow="Workforce" title="How large?" value={String(metrics.headcount)} detail="employees" />
            <MetricCard eyebrow="Payroll" title="What is it costing?" value={money(metrics.grossPayroll)} detail={`${money(metrics.netPayroll)} net payroll`} />
            <MetricCard eyebrow="Attendance" title="Who is working?" value={String(metrics.clockedIn)} detail="currently clocked in" />
            <MetricCard eyebrow="Availability" title="Who is away?" value={String(metrics.onLeaveToday)} detail="employees on approved leave" />
            <MetricCard eyebrow="Attention" title="What needs action?" value={String(metrics.totalAttention)} detail="open approvals and payroll items" emphasis={metrics.totalAttention > 0} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Panel title="Payroll cost trend" subtitle="Gross and net payroll by pay period">
              {payrollTrend.length === 0 ? <Empty text="No payroll trend data yet." /> : (
                <div className="mt-6 space-y-5">
                  {payrollTrend.map((item) => {
                    const max = Math.max(...payrollTrend.map((entry) => entry.gross), 1);
                    return <div key={item.period}>
                      <div className="mb-2 flex items-end justify-between gap-3">
                        <div><p className="text-sm font-semibold text-slate-800">{periodLabel(item.period)}</p><p className="text-xs text-slate-400">Net {money(item.net)}</p></div>
                        <p className="text-sm font-semibold text-slate-900">{money(item.gross)}</p>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(7, (item.gross / max) * 100)}%` }} /></div>
                    </div>;
                  })}
                </div>
              )}
            </Panel>

            <Panel title="What needs attention?" subtitle="Items that can delay people operations or payroll">
              <div className="mt-5 space-y-3">
                <AttentionRow label="Leave approvals" value={metrics.pendingLeave} href="/leave-requests" />
                <AttentionRow label="Timesheets" value={metrics.pendingTimesheets} href="/timesheets" />
                <AttentionRow label="Payroll runs" value={metrics.pendingPayroll} href="/payroll-runs" />
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Panel title="Workforce distribution" subtitle="Headcount by department">
              {departmentMix.length === 0 ? <Empty text="No department data yet." /> : (
                <div className="mt-5 space-y-4">{departmentMix.map((department) => {
                  const percentage = metrics.headcount ? Math.round((department.count / metrics.headcount) * 100) : 0;
                  return <div key={department.id}>
                    <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium text-slate-700">{department.name}</span><span className="text-slate-500">{department.count} · {percentage}%</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-700" style={{ width: `${percentage}%` }} /></div>
                  </div>;
                })}</div>
              )}
            </Panel>

            <Panel title="Workforce availability" subtitle="Today's workforce position">
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatBox label="Headcount" value={metrics.headcount} />
                <StatBox label="Clocked in" value={metrics.clockedIn} />
                <StatBox label="On leave" value={metrics.onLeaveToday} />
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Visibility</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Attendance and approved leave are shown separately so leadership can quickly understand today's workforce availability.</p>
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="What is changing?" subtitle="Recent workforce movement">
              {newEmployees.length === 0 ? <Empty text="No recent workforce changes yet." /> : (
                <div className="mt-5 divide-y divide-slate-100">{newEmployees.map((employee) => (
                  <div key={employee.id} className="flex items-center gap-3 py-3 first:pt-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{initials(employee.firstName, employee.lastName)}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{employee.firstName} {employee.lastName}</p><p className="truncate text-xs text-slate-500">{employee.department?.name ?? departmentName(employee.departmentId, departments)}</p></div>
                    <span className="text-xs text-slate-400">{shortDate(employee.createdAt)}</span>
                  </div>
                ))}</div>
              )}
            </Panel>

            <Panel title="Recent leave activity" subtitle="Latest workforce availability decisions">
              {recentLeave.length === 0 ? <Empty text="No leave activity yet." /> : (
                <div className="mt-5 divide-y divide-slate-100">{recentLeave.map((request) => (
                  <div key={request.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{request.employee ? `${request.employee.firstName} ${request.employee.lastName}` : employeeName(request.employeeId)}</p><p className="mt-0.5 text-xs text-slate-500">{dateRange(request.startDate, request.endDate)}</p></div>
                    <Status status={request.status} />
                  </div>
                ))}</div>
              )}
            </Panel>
          </section>

          <section className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Workforce planning</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">From workforce visibility to forward planning</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">This executive layer is the foundation for future retirement alerts, temporary workforce planning, vacancies, replacement planning and role continuity.</p>
              </div>
              <Link href="/employees" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">View workforce</Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ eyebrow, title, value, detail, emphasis = false }: { eyebrow: string; title: string; value: string; detail: string; emphasis?: boolean }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${emphasis ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p><p className="mt-2 text-sm font-semibold text-slate-700">{title}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p>{children}</section>; }
function AttentionRow({ label, value, href }: { label: string; value: number; href: string }) { return <Link href={href} className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40"><span className="text-sm font-medium text-slate-700">{label}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${value ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{value ? `${value} open` : 'Clear'}</span></Link>; }
function StatBox({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>; }
function Status({ status }: { status: string }) { const style = status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>{status}</span>; }
function Empty({ text }: { text: string }) { return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{text}</p>; }
function money(value: number) { return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0); }
function initials(first: string, last: string) { return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || 'HR'; }
function shortDate(value?: string) { if (!value) return ''; return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' }).format(new Date(value)); }
function dateRange(start: string, end: string) { const formatter = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' }); return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`; }
function periodLabel(period: string) { const [year, month] = period.split('-').map(Number); if (!year || !month) return period; return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
function departmentName(id: string, departments: Department[]) { return departments.find((department) => department.id === id)?.name ?? 'Unassigned'; }
