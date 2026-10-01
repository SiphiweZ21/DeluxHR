'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateTimesheet, getEmployees, getOvertimeApprovals, getOvertimePolicy, getTimesheets, lockTimesheetPeriod, reviewOvertime, updateOvertimePolicy, updateTimesheetStatus, type Employee, type OvertimeApproval, type OvertimePolicy, type Timesheet, type TimesheetStatus } from '../../lib/api';

export default function TimesheetsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [filter, setFilter] = useState<'ALL' | TimesheetStatus>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadTimesheets() {
    try { setIsLoading(true); setErrorMessage(''); const data = await getTimesheets(); setTimesheets(Array.isArray(data) ? data : []); }
    catch (error) { setTimesheets([]); setErrorMessage(error instanceof Error ? error.message : 'Failed to load timesheets'); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { loadTimesheets(); }, []);

  async function handleStatusChange(id: string, status: TimesheetStatus) {
    try { setIsUpdating(id); setErrorMessage(''); setSuccessMessage(''); await updateTimesheetStatus(id, { status }); setSuccessMessage(`Timesheet marked as ${status.toLowerCase()}.`); await loadTimesheets(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Failed to update timesheet status'); }
    finally { setIsUpdating(''); }
  }

  const safe = Array.isArray(timesheets) ? timesheets : [];
  const submitted = safe.filter((item) => item.status === 'SUBMITTED').length;
  const approved = safe.filter((item) => item.status === 'APPROVED').length;
  const totalHours = safe.reduce((sum, item) => sum + Number(item.totalHours || 0), 0);
  const overtime = safe.reduce((sum, item) => sum + (item.entries ?? []).reduce((entrySum, entry) => entrySum + Number(entry.overtimeHours || 0), 0), 0);
  const filtered = useMemo(() => safe.filter((item) => {
    const name = getEmployeeName(item).toLowerCase(); const term = search.trim().toLowerCase();
    return (filter === 'ALL' || item.status === filter) && (!term || name.includes(term) || item.employee?.department?.name?.toLowerCase().includes(term));
  }), [safe, filter, search]);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Workforce time</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Timesheets</h1><p className="mt-1 text-sm text-slate-600">Review recorded hours and move approved time toward payroll.</p></div><div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-700"><span className="font-semibold">{submitted}</span> awaiting approval</div></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total timesheets" value={safe.length} note="All recorded periods"/><Metric label="Awaiting approval" value={submitted} note="Submitted by employees" tone="indigo"/><Metric label="Approved" value={approved} note="Ready for downstream processing" tone="green"/><Metric label="Recorded hours" value={`${formatNumber(totalHours)}h`} note={`${formatNumber(overtime)}h overtime recorded`}/></div>

    {successMessage && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</div>}
    {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold text-slate-900">Timesheet approval queue</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} of {safe.length} timesheets shown</p></div><div className="flex flex-col gap-2 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or department" className="min-w-64 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"/><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="LOCKED">Locked</option></select></div></div>
      {isLoading ? <div className="p-8 text-sm text-slate-500">Loading timesheets...</div> : filtered.length === 0 ? <div className="p-8 text-sm text-slate-500">No timesheets match this view.</div> : <div className="divide-y divide-slate-100">{filtered.map((item) => {
        const entries = item.entries ?? []; const overtimeHours = entries.reduce((sum, entry) => sum + Number(entry.overtimeHours || 0), 0); const regularHours = Math.max(0, Number(item.totalHours || 0) - overtimeHours); const expanded = expandedId === item.id;
        return <div key={item.id} className="p-5 sm:p-6"><div className="grid gap-5 xl:grid-cols-[1.4fr_1fr_1fr_auto] xl:items-center"><div className="flex items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">{initials(item)}</div><div><div className="font-semibold text-slate-900">{getEmployeeName(item)}</div><div className="mt-0.5 text-xs text-slate-500">{item.employee?.department?.name ?? 'No department'}</div></div></div><div><div className="text-xs font-medium uppercase tracking-wide text-slate-400">Period</div><div className="mt-1 text-sm font-medium text-slate-700">{formatDate(item.periodStart)} — {formatDate(item.periodEnd)}</div><div className="mt-1 text-xs text-slate-500">{formatNumber(item.totalDays)} working days</div></div><div className="grid grid-cols-2 gap-3"><Mini label="Regular" value={`${formatNumber(regularHours)}h`}/><Mini label="Overtime" value={`${formatNumber(overtimeHours)}h`}/></div><div className="flex flex-wrap items-center gap-2 xl:justify-end"><StatusBadge status={item.status}/><button onClick={() => setExpandedId(expanded ? '' : item.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{expanded ? 'Hide details' : 'Details'}</button></div></div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button onClick={() => handleStatusChange(item.id, 'SUBMITTED')} disabled={isUpdating === item.id || item.status !== 'DRAFT'} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Submit</button><button onClick={() => handleStatusChange(item.id, 'APPROVED')} disabled={isUpdating === item.id || item.status !== 'SUBMITTED'} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">Approve</button><button onClick={() => handleStatusChange(item.id, 'REJECTED')} disabled={isUpdating === item.id || item.status !== 'SUBMITTED'} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40">Reject</button>{item.status === 'APPROVED' && <span className="ml-auto self-center text-xs font-medium text-emerald-700">✓ Approved time is ready for earnings</span>}</div>
        {expanded && <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Time entries</h3><span className="text-xs text-slate-500">{entries.length} entries</span></div>{entries.length === 0 ? <p className="text-sm text-slate-500">No detailed entries are attached to this timesheet.</p> : <div className="space-y-2">{entries.map((entry) => <div key={entry.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm sm:grid-cols-[130px_100px_100px_1fr]"><span className="font-medium text-slate-700">{formatDate(entry.workDate)}</span><span className="text-slate-600">{formatNumber(entry.hoursWorked)}h regular</span><span className="text-slate-600">{formatNumber(entry.overtimeHours)}h OT</span><span className="text-slate-500">{entry.description || entry.projectCode || 'Work entry'}</span></div>)}</div>}</div>}
        </div>;
      })}</div>}
    </section>

    <TimesheetOperations onUpdated={loadTimesheets} />

    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5"><p className="text-sm font-semibold text-indigo-900">Attendance → Timesheets → Earnings</p><p className="mt-1 text-sm text-indigo-700">Attendance captures when people work. Timesheets organise those hours into approval periods. Once approved, time can feed the earnings and payroll workflow.</p></div>
  </div>;
}

function Metric({ label, value, note, tone = 'slate' }: { label: string; value: string | number; note: string; tone?: 'slate' | 'indigo' | 'green' }) { const accent = tone === 'indigo' ? 'text-indigo-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900'; return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${accent}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div></div>; }
function StatusBadge({ status }: { status: TimesheetStatus }) { const classes = status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : status === 'LOCKED' ? 'bg-slate-100 text-slate-800' : status === 'REJECTED' ? 'bg-red-50 text-red-700' : status === 'SUBMITTED' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>{status === 'SUBMITTED' ? 'Awaiting approval' : status[0] + status.slice(1).toLowerCase()}</span>; }
function getEmployeeName(item: Timesheet) { return item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : item.employeeId; }
function initials(item: Timesheet) { return item.employee ? `${item.employee.firstName[0] ?? ''}${item.employee.lastName[0] ?? ''}`.toUpperCase() : 'TS'; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(value)) : '—'; }
function formatNumber(value: number) { return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(Number(value || 0)); }

function TimesheetOperations({ onUpdated }: { onUpdated: () => Promise<void> }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [queue, setQueue] = useState<OvertimeApproval[]>([]);
  const [policy, setPolicy] = useState<OvertimePolicy | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function load() {
    const [people, approvals, current] = await Promise.all([getEmployees(), getOvertimeApprovals(), getOvertimePolicy()]);
    setEmployees(people); setQueue(approvals); setPolicy(current);
  }
  useEffect(() => { let active = true; Promise.all([getEmployees(), getOvertimeApprovals(), getOvertimePolicy()]).then(([people, approvals, current]) => { if (active) { setEmployees(people); setQueue(approvals); setPolicy(current); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load timesheet operations'); }); return () => { active = false; }; }, []);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); await load(); await onUpdated(); setSuccess(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }
  const validPeriod = !!periodStart && !!periodEnd && periodStart <= periodEnd;
  return <div className="space-y-5">
    <h2 className="text-xl font-semibold text-slate-950">Timesheet operations</h2>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}{success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Generate from attendance</h3><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Employee<select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 block min-w-52 rounded-lg border p-2"><option value="">Select employee</option>{employees.map(e => <option value={e.id} key={e.id}>{e.firstName} {e.lastName}</option>)}</select></label><label className="text-sm">Period start<input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label><label className="text-sm">Period end<input type="date" min={periodStart} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label><button disabled={busy || !validPeriod || !employeeId} onClick={() => run(() => generateTimesheet(employeeId, periodStart, periodEnd), 'Timesheet generated.')} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Generate</button><button disabled={busy || !validPeriod} onClick={() => { if (window.confirm('Lock this payroll period? Approved timesheets will no longer be editable.')) run(() => lockTimesheetPeriod(periodStart, periodEnd), 'Payroll period locked.'); }} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Lock approved period</button></div><p className="mt-2 text-xs text-slate-500">All timesheets within a period must be approved before locking.</p></section>
    <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Overtime policy</h3>{policy ? <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Daily threshold (min)<input type="number" min={1} max={1440} value={policy.dailyThresholdMinutes} onChange={e => setPolicy({ ...policy, dailyThresholdMinutes: Number(e.target.value) })} className="mt-1 block w-40 rounded-lg border p-2" /></label><label className="text-sm">Max daily overtime (min)<input type="number" min={0} max={1440} value={policy.maxDailyOvertimeMinutes} onChange={e => setPolicy({ ...policy, maxDailyOvertimeMinutes: Number(e.target.value) })} className="mt-1 block w-48 rounded-lg border p-2" /></label><label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={policy.requireApproval} onChange={e => setPolicy({ ...policy, requireApproval: e.target.checked })} /> Require approval</label><button disabled={busy || policy.dailyThresholdMinutes < 1 || policy.maxDailyOvertimeMinutes < 0} onClick={() => run(() => updateOvertimePolicy(policy), 'Overtime policy saved.')} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Save policy</button></div> : <p className="mt-2 text-sm text-slate-500">Loading policy…</p>}</section>
    <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Overtime approval queue</h3><label className="mt-3 block max-w-lg text-sm">Review reason<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Required for each decision" className="mt-1 block w-full rounded-lg border p-2" /></label><div className="mt-4 divide-y">{queue.filter(x => x.status === 'PENDING').map(x => <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><strong>{employees.find(e => e.id === x.employeeId)?.firstName ?? 'Employee'} {employees.find(e => e.id === x.employeeId)?.lastName ?? ''}</strong><p className="text-xs text-slate-500">{x.entry?.workDate?.slice(0, 10)} · {x.requestedMinutes} minutes requested</p></div><span className="flex gap-2"><button disabled={busy || !reason.trim()} onClick={() => run(() => reviewOvertime(x.id, 'APPROVED', reason.trim(), x.requestedMinutes), 'Overtime approved.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-40">Approve</button><button disabled={busy || !reason.trim()} onClick={() => run(() => reviewOvertime(x.id, 'REJECTED', reason.trim()), 'Overtime rejected.')} className="rounded-lg border border-rose-300 px-3 py-2 text-rose-700 disabled:opacity-40">Reject</button></span></div>)}{!queue.some(x => x.status === 'PENDING') && <p className="py-4 text-sm text-slate-500">No pending overtime approvals.</p>}</div></section>
  </div>;
}
