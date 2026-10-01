'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { getEmployees, getLeaveTypes, type Employee, type LeaveType } from '../../lib/api';
import * as api from '../../lib/leave-api';
import { Badge, Card, Empty, Field, Notice, PageTitle, button, control, dateLabel, number, secondary, text, today, useAction } from '../../components/leave/ui';

type Tab = 'Policies' | 'Employee balances' | 'Calendar & holidays';
export default function LeavePoliciesPage() {
  const [tab, setTab] = useState<Tab>('Policies');
  const [policies, setPolicies] = useState<api.LeavePolicy[]>([]), [employees, setEmployees] = useState<Employee[]>([]), [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const action = useAction();
  async function load() {
    const result = await Promise.allSettled([api.getLeavePolicies(), getEmployees(), getLeaveTypes()]);
    if (result[0].status === 'fulfilled') setPolicies(result[0].value);
    if (result[1].status === 'fulfilled') setEmployees(result[1].value);
    if (result[2].status === 'fulfilled') setTypes(result[2].value);
    setLoading(false);
    const failed = result.find(r => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  useEffect(() => { void action.run(load); }, []); // initial tenant data
  return <div className="space-y-6">
    <PageTitle title="Leave policies" text="Configure entitlements, accrual, document rules and working days. Manage employee balances and the company leave calendar."/>
    <Notice error={action.error} message={action.message}/>
    <div className="flex flex-wrap gap-2">{(['Policies', 'Employee balances', 'Calendar & holidays'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={tab === t ? button : secondary}>{t}</button>)}<button disabled={action.busy} onClick={() => void action.run(load)} className={secondary}>Refresh</button></div>
    {loading ? <Empty>Loading leave configuration…</Empty> : tab === 'Policies' ? <div className="grid gap-6 xl:grid-cols-2">
      <PolicyForm types={types} onSave={async p => { await api.createLeavePolicy(p); await load(); }} />
      <Card title="Configured policies">{policies.length === 0 ? <Empty>No policies configured.</Empty> : policies.map(p => <article key={p.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{p.name}</h3><Badge value={p.isActive ? 'ACTIVE' : 'INACTIVE'}/></div>
        <p className="text-sm text-slate-500">{p.code} · {types.find(t => t.id === p.leaveTypeId)?.name ?? p.leaveTypeId}{p.isDefault ? ' · Default' : ''}</p>
        <p className="text-sm">{p.annualEntitlementDays} days/year · {p.accrualMode === 'MONTHLY' ? 'Monthly accrual' : 'Annual upfront'} · Carry-over {p.carryOverMaxDays} days, expires after {p.carryOverExpiryMonths} months</p>
        <p className="text-sm text-slate-500">Working days: {p.workingWeekdays.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1]).join(', ')}. {p.excludePublicHolidays ? 'Public holidays excluded.' : 'Public holidays included.'}</p>
        <p className="text-sm text-slate-500">Negative balance limit: {p.maxNegativeDays} days · Probation: {p.probationMonths} months · {p.supportingDocumentRequired ? 'Supporting document required' : 'Supporting document optional'}{p.medicalCertificateAfterDays ? ` · Medical certificate from ${p.medicalCertificateAfterDays} days` : ''}</p>
        <button className={secondary} disabled={action.busy} onClick={() => { if (!p.isActive || window.confirm(`Deactivate ${p.name}? Current employee assignments must be ended first.`)) void action.run(async () => { await api.setLeavePolicyActive(p.id, !p.isActive); await load(); }, 'Policy updated.'); }}>{p.isActive ? 'Deactivate' : 'Activate'}</button>
      </article>)}</Card>
    </div> : tab === 'Employee balances' ? <EmployeeBalances policies={policies} employees={employees} types={types}/> : <CalendarHolidays employees={employees} types={types}/>}
  </div>;
}

function PolicyForm({ types, onSave }: { types: LeaveType[]; onSave: (p: api.NewLeavePolicy) => Promise<void> }) {
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, d = new FormData(form);
    const weekdays = d.getAll('workingWeekdays').map(Number);
    if (!weekdays.length) { action.setError('Select at least one working weekday.'); return; }
    await action.run(async () => {
      await onSave({ leaveTypeId: text(d, 'leaveTypeId'), code: text(d, 'code'), name: text(d, 'name'), isDefault: d.has('isDefault'), annualEntitlementDays: number(d, 'annualEntitlementDays'), accrualMode: text(d, 'accrualMode') as api.NewLeavePolicy['accrualMode'], carryOverMaxDays: number(d, 'carryOverMaxDays'), carryOverExpiryMonths: number(d, 'carryOverExpiryMonths'), maxNegativeDays: number(d, 'maxNegativeDays'), probationMonths: number(d, 'probationMonths'), workingWeekdays: weekdays, excludePublicHolidays: d.has('excludePublicHolidays'), supportingDocumentRequired: d.has('supportingDocumentRequired'), ...(text(d, 'medicalCertificateAfterDays') ? { medicalCertificateAfterDays: number(d, 'medicalCertificateAfterDays') } : {}) });
      form.reset();
    }, 'Leave policy created.');
  }
  return <Card title="New leave policy"><Notice error={action.error} message={action.message}/><form onSubmit={submit} className="space-y-4"><fieldset disabled={action.busy} className="space-y-4">
    <Field label="Leave type"><select name="leaveTypeId" className={control} required><option value="">Select leave type</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Policy code"><input name="code" required maxLength={40} pattern="[A-Za-z0-9_-]+" className={control}/></Field><Field label="Policy name"><input name="name" required maxLength={120} className={control}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Numeric label="Annual entitlement (days)" name="annualEntitlementDays" value={15} max={365} fractional/><Field label="Accrual"><select name="accrualMode" className={control}><option value="ANNUAL_UPFRONT">Annual upfront</option><option value="MONTHLY">Monthly</option></select></Field><Numeric label="Maximum carry-over (days)" name="carryOverMaxDays" value={0} max={365} fractional/><Numeric label="Carry-over expiry (months)" name="carryOverExpiryMonths" value={0} max={12}/><Numeric label="Maximum negative balance (days)" name="maxNegativeDays" value={0} max={365} fractional/><Numeric label="Probation (months)" name="probationMonths" value={0} max={120}/></div>
    <fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Working weekdays</legend><div className="flex flex-wrap gap-3">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" name="workingWeekdays" value={i + 1} defaultChecked={i < 5}/>{day}</label>)}</div></fieldset>
    <label className="flex items-center gap-2 text-sm"><input name="isDefault" type="checkbox" defaultChecked/>Default policy for this leave type</label>
    <label className="flex items-center gap-2 text-sm"><input name="excludePublicHolidays" type="checkbox" defaultChecked/>Exclude public holidays</label>
    <label className="flex items-center gap-2 text-sm"><input name="supportingDocumentRequired" type="checkbox"/>Require supporting documents</label>
    <Field label="Require medical certificate from (days, optional)"><input name="medicalCertificateAfterDays" type="number" min={1} max={366} step={1} className={control}/></Field>
    <button className={button}>{action.busy ? 'Saving…' : 'Create policy'}</button>
  </fieldset></form></Card>;
}
function Numeric({ label, name, value, max, fractional }: { label: string; name: string; value: number; max: number; fractional?: boolean }) { return <Field label={label}><input className={control} name={name} type="number" min={0} max={max} step={fractional ? '0.01' : '1'} defaultValue={value} required/></Field>; }

function EmployeeBalances({ policies, employees, types }: { policies: api.LeavePolicy[]; employees: Employee[]; types: LeaveType[] }) {
  const [employeeId, setEmployeeId] = useState(''), [leaveTypeId, setLeaveTypeId] = useState(''), [asOf, setAsOf] = useState(today());
  const [balance, setBalance] = useState<api.LeaveBalance | null>(null), [assignments, setAssignments] = useState<api.LeaveAssignment[]>([]), [selected, setSelected] = useState('');
  const action = useAction();
  async function lookup() {
    if (!employeeId || !leaveTypeId) throw new Error('Select an employee and leave type.');
    setBalance(null); setAssignments([]); setSelected('');
    const result = await Promise.allSettled([api.getLeaveAssignments(employeeId), api.getLeaveBalance(employeeId, leaveTypeId, asOf)]);
    if (result[0].status === 'fulfilled') setAssignments(result[0].value);
    if (result[1].status === 'fulfilled') setBalance(result[1].value);
    setSelected(employeeId);
    const failed = result.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
  }
  function clear() { setBalance(null); setAssignments([]); setSelected(''); }
  return <div className="space-y-6"><Notice error={action.error} message={action.message}/><Card title="Employee leave balance"><form className="grid items-end gap-4 md:grid-cols-4" onSubmit={e => { e.preventDefault(); void action.run(lookup); }}>
    <Field label="Employee"><select disabled={action.busy} required value={employeeId} onChange={e => { clear(); setEmployeeId(e.target.value); }} className={control}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></Field>
    <Field label="Leave type"><select disabled={action.busy} required value={leaveTypeId} onChange={e => { clear(); setLeaveTypeId(e.target.value); }} className={control}><option value="">Select leave type</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    <Field label="As of"><input disabled={action.busy} type="date" required value={asOf} onChange={e => { clear(); setAsOf(e.target.value); }} className={control}/></Field><button disabled={action.busy} className={button}>Load balance & assignments</button></form>
    {balance && <><p className="text-sm text-slate-500">Annual balance for {balance.year}, as of {dateLabel(asOf)}.</p><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{(['accrued', 'carryOver', 'adjustments', 'used', 'available'] as const).map(k => <div key={k} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{k === 'carryOver' ? 'Carry-over' : k.charAt(0).toUpperCase() + k.slice(1)}</p><p className="mt-1 text-2xl font-semibold">{balance[k]} <span className="text-xs">days</span></p></div>)}</div></>}
  </Card>
  <div className="grid gap-6 xl:grid-cols-2"><Card title="Assign employee policy"><p className="text-sm text-slate-500">Select an employee above. The end date is exclusive.</p><form className="space-y-4" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, d = new FormData(form); void action.run(async () => { if (!employeeId) throw new Error('Select an employee first.'); const from = text(d, 'from'), to = text(d, 'to'); if (to && to <= from) throw new Error('End date must follow start date.'); await api.assignLeavePolicy({ employeeId, policyId: text(d, 'policyId'), effectiveFrom: from, ...(to ? { effectiveTo: to } : {}) }); setAssignments(await api.getLeaveAssignments(employeeId)); setSelected(employeeId); setBalance(null); form.reset(); }, 'Policy assigned. Reload the balance to see its effect.'); }}>
    <Field label="Policy"><select name="policyId" required className={control}><option value="">Select active policy</option>{policies.filter(p => p.isActive).map(p => <option value={p.id} key={p.id}>{p.name} · {types.find(t => t.id === p.leaveTypeId)?.name}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Effective from"><input name="from" type="date" required className={control}/></Field><Field label="Effective to (optional)"><input name="to" type="date" className={control}/></Field></div><button disabled={action.busy || !employeeId} className={button}>Assign policy</button></form>
    {selected === employeeId && assignments.map(a => <div key={a.id} className="rounded-xl border border-slate-200 p-4"><p className="font-medium">{a.policy.name}</p><p className="mt-1 text-sm text-slate-500">{dateLabel(a.effectiveFrom)} → {a.effectiveTo ? `${dateLabel(a.effectiveTo)} (exclusive)` : 'Open-ended'}</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); void action.run(async () => { await api.endLeaveAssignment(a.id, text(d, 'to')); setAssignments(await api.getLeaveAssignments(employeeId)); setBalance(null); }, 'Assignment ended. Reload balance to recalculate.'); }}><input aria-label={`New end date for ${a.policy.name}`} name="to" type="date" required className={control}/><button disabled={action.busy} className={secondary}>End / shorten assignment</button></form></div>)}
  </Card><Card title="Adjust leave balance"><p className="text-sm text-slate-500">Applies to the employee and leave type selected above. Days are positive; debit subtracts from the balance.</p><form className="space-y-4" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, d = new FormData(form); void action.run(async () => { if (!employeeId || !leaveTypeId) throw new Error('Select employee and leave type first.'); await api.adjustLeaveBalance({ employeeId, leaveTypeId, effectiveDate: text(d, 'date'), type: text(d, 'type') as 'OPENING' | 'CREDIT' | 'DEBIT', days: number(d, 'days'), reason: text(d, 'reason') }); setBalance(null); form.reset(); }, 'Balance adjustment recorded. Reload balance for the chosen date.'); }}>
    <Field label="Adjustment"><select name="type" className={control}><option value="OPENING">Opening balance</option><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Effective date"><input name="date" type="date" required defaultValue={today()} className={control}/></Field><Field label="Days"><input name="days" type="number" min="0.01" max={365} step="0.01" required className={control}/></Field></div><Field label="Reason"><textarea name="reason" required maxLength={500} className={control}/></Field><button disabled={action.busy || !employeeId || !leaveTypeId} className={button}>Record adjustment</button></form></Card></div></div>;
}

function CalendarHolidays({ employees, types }: { employees: Employee[]; types: LeaveType[] }) {
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`), [to, setTo] = useState(`${today().slice(0, 4)}-12-31`), [calendar, setCalendar] = useState<api.LeaveCalendar | null>(null);
  const action = useAction();
  async function load() { if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw new Error('Choose an inclusive range of at most 366 days between dates.'); setCalendar(await api.getLeaveCalendar(from, to)); }
  return <div className="space-y-6"><Notice error={action.error} message={action.message}/><Card title="Leave calendar"><form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); void action.run(load); }}><Field label="From"><input disabled={action.busy} type="date" value={from} onChange={e => { setFrom(e.target.value); setCalendar(null); }} required className={control}/></Field><Field label="To"><input disabled={action.busy} type="date" value={to} onChange={e => { setTo(e.target.value); setCalendar(null); }} required className={control}/></Field><button disabled={action.busy} className={button}>Load calendar</button></form>
    {calendar && (calendar.leave.length ? calendar.leave.map(r => { const employee = employees.find(e => e.id === r.employeeId); return <div key={r.id} className="rounded-xl border border-slate-200 p-4"><a className="font-medium text-indigo-700 underline" href={`/leave-requests/${encodeURIComponent(r.id)}`}>{employee ? `${employee.firstName} ${employee.lastName}` : r.employeeId}</a><p className="mt-1 text-sm text-slate-500">{types.find(t => t.id === r.leaveTypeId)?.name ?? 'Leave'} · {dateLabel(r.startDate)} → {dateLabel(r.endDate)}{r.chargedDays != null ? ` · ${r.chargedDays} charged days (whole request)` : ''}</p></div>; }) : <Empty>No approved leave overlaps this range.</Empty>)}
  </Card><Card title="Public holidays"><form className="grid items-end gap-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, d = new FormData(form); void action.run(async () => { await api.createPublicHoliday(text(d, 'date'), text(d, 'name')); await load(); form.reset(); }, 'Public holiday added.'); }}><Field label="Date"><input name="date" type="date" required className={control}/></Field><Field label="Name"><input name="name" required maxLength={120} className={control}/></Field><button disabled={action.busy} className={button}>Add holiday</button></form>
    {calendar?.holidays.map(h => <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><p className="text-sm">{dateLabel(h.date)} · {h.name}</p><button disabled={action.busy} className={secondary} onClick={() => { if (window.confirm(`Remove ${h.name} from company public holidays?`)) void action.run(async () => { await api.deletePublicHoliday(h.id); await load(); }, 'Holiday removed.'); }}>Remove</button></div>)}
    {calendar && !calendar.holidays.length && <Empty>No public holidays in this range.</Empty>}
  </Card></div>;
}
