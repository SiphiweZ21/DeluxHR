'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { getCompanyUsers, getEmployees, getLeaveTypes, type CompanyUser, type Employee, type LeaveType } from '../../lib/api';
import * as api from '../../lib/leave-api';
import { Badge, Card, Empty, Field, Notice, PageTitle, button, control, dateLabel, secondary, text, useAction } from '../../components/leave/ui';

type Tab = 'My approval queue' | 'Workflow setup' | 'Notifications';
export default function LeaveApprovalsPage() {
  const [tab, setTab] = useState<Tab>('My approval queue');
  return <div className="space-y-6"><PageTitle title="Leave approvals" text="Review your assigned approval steps, configure manager and HR approval chains, and follow leave notifications."/><div className="flex flex-wrap gap-2">{(['My approval queue', 'Workflow setup', 'Notifications'] as Tab[]).map(t => <button key={t} className={tab === t ? button : secondary} onClick={() => setTab(t)}>{t}</button>)}</div>{tab === 'My approval queue' ? <ApprovalQueue/> : tab === 'Workflow setup' ? <WorkflowSetup/> : <Notifications/>}</div>;
}
function ApprovalQueue() {
  const [items, setItems] = useState<api.ApprovalQueueItem[]>([]), [employees, setEmployees] = useState<Employee[]>([]), [types, setTypes] = useState<LeaveType[]>([]), [loading, setLoading] = useState(true);
  const action = useAction();
  async function load() { try { setItems(await api.getLeaveApprovalQueue()); } finally { setLoading(false); } }
  useEffect(() => {
    void action.run(load);
    // Names are optional: an approver can access the queue without company administration rights.
    void getEmployees().then(setEmployees).catch(() => {});
    void getLeaveTypes().then(setTypes).catch(() => {});
  }, []);
  return <Card title="Steps ready for your review"><Notice error={action.error} message={action.message}/><p className="text-sm text-slate-500">Only steps assigned to you or delegated to you are shown, after earlier steps are approved. The API returns up to 200 candidates; refresh after each decision.</p><button disabled={action.busy} className={secondary} onClick={() => void action.run(load)}>Refresh queue</button>{loading ? <Empty>Loading approval queue…</Empty> : !items.length ? <Empty>No approval steps ready for you.</Empty> : items.map(item => <QueueDecision key={item.id} item={item} employees={employees} types={types} onSaved={load}/>)}</Card>;
}
function QueueDecision({ item, employees, types, onSaved }: { item: api.ApprovalQueueItem; employees: Employee[]; types: LeaveType[]; onSaved: () => Promise<void> }) {
  const [comment, setComment] = useState(''); const action = useAction();
  const employee = employees.find(e => e.id === item.request.employeeId);
  async function decide(status: 'APPROVED' | 'REJECTED') {
    if (status === 'REJECTED' && !comment.trim()) { action.setError('Enter a rejection reason.'); return; }
    await action.run(async () => { await api.decideLeaveStep(item.id, status, comment.trim()); await onSaved(); }, 'Decision recorded.');
  }
  return <article className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{employee ? `${employee.firstName} ${employee.lastName}` : `Employee ${item.request.employeeId}`}</h3><Badge value={item.status}/></div><p className="text-sm text-slate-500">{types.find(t => t.id === item.request.leaveTypeId)?.name ?? 'Leave'} · {dateLabel(item.request.startDate)} → {dateLabel(item.request.endDate)} · Step {item.step.order}: {item.step.kind}</p><Link href={`/leave-requests/${encodeURIComponent(item.requestId)}`} className="inline-block text-sm font-medium text-indigo-700 underline">Review documents and history</Link><Field label="Approval comment / rejection reason"><textarea disabled={action.busy} value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} className={control}/></Field><Notice error={action.error} message={action.message}/><div className="flex gap-2"><button className={button} disabled={action.busy} onClick={() => void decide('APPROVED')}>Approve step</button><button className={secondary} disabled={action.busy} onClick={() => void decide('REJECTED')}>Reject with reason</button></div></article>;
}
function WorkflowSetup() {
  const [workflows, setWorkflows] = useState<api.LeaveWorkflow[]>([]), [users, setUsers] = useState<CompanyUser[]>([]), [types, setTypes] = useState<LeaveType[]>([]);
  const [steps, setSteps] = useState<Pick<api.ApprovalStep, 'kind' | 'approverUserId'>[]>([{ kind: 'MANAGER', approverUserId: '' }]);
  const action = useAction();
  async function load() {
    const result = await Promise.allSettled([api.getLeaveWorkflows(), getCompanyUsers(), getLeaveTypes()]);
    if (result[0].status === 'fulfilled') setWorkflows(result[0].value);
    if (result[1].status === 'fulfilled') setUsers(result[1].value.filter(u => u.isActive));
    if (result[2].status === 'fulfilled') setTypes(result[2].value);
    const failed = result.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
  }
  useEffect(() => { void action.run(load); }, []);
  const name = (id: string) => users.find(u => u.id === id)?.fullName ?? id;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, d = new FormData(form);
    await action.run(async () => { if (steps.some(s => !s.approverUserId)) throw new Error('Choose an approver for every step.'); await api.createLeaveWorkflow({ name: text(d, 'name'), leaveTypeId: text(d, 'leaveTypeId'), steps }); await load(); form.reset(); setSteps([{ kind: 'MANAGER', approverUserId: '' }]); }, 'Approval workflow created.');
  }
  function move(index: number, delta: number) { setSteps(old => { const updated = [...old]; [updated[index], updated[index + delta]] = [updated[index + delta], updated[index]]; return updated; }); }
  return <div className="space-y-6"><Notice error={action.error} message={action.message}/><button disabled={action.busy} className={secondary} onClick={() => void action.run(load)}>Refresh configuration</button><div className="grid gap-6 xl:grid-cols-2"><Card title="Create approval chain"><p className="text-sm text-slate-500">One active chain per leave type. New requests use the active chain; existing requests keep their original steps.</p><form onSubmit={submit} className="space-y-4"><fieldset disabled={action.busy} className="space-y-4"><Field label="Leave type"><select name="leaveTypeId" required className={control}><option value="">Choose leave type</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Workflow name"><input name="name" required maxLength={120} className={control}/></Field>
    {steps.map((step, index) => <div key={index} className="space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">Step {index + 1}</h3><Field label="Approver kind"><select className={control} value={step.kind} onChange={e => setSteps(old => old.map((s, i) => i === index ? { kind: e.target.value as api.ApprovalStep['kind'], approverUserId: '' } : s))}><option value="MANAGER">Manager</option><option value="HR">HR</option></select></Field><Field label="Approver"><select required className={control} value={step.approverUserId} onChange={e => setSteps(old => old.map((s, i) => i === index ? { ...s, approverUserId: e.target.value } : s))}><option value="">Select active user</option>{users.filter(u => step.kind === 'MANAGER' ? u.role === 'MANAGER' : ['HR_ADMIN', 'COMPANY_ADMIN'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}</select></Field><div className="flex flex-wrap gap-2"><button type="button" disabled={index === 0} className={secondary} onClick={() => move(index, -1)}>Move up</button><button type="button" disabled={index === steps.length - 1} className={secondary} onClick={() => move(index, 1)}>Move down</button><button type="button" disabled={steps.length === 1} className={secondary} onClick={() => setSteps(old => old.filter((_, i) => i !== index))}>Remove</button></div></div>)}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={steps.length === 5} className={secondary} onClick={() => setSteps(old => [...old, { kind: 'HR', approverUserId: '' }])}>Add step (maximum 5)</button><button className={button}>Create workflow</button></div></fieldset></form></Card>
    <Card title="Existing approval chains">{!workflows.length ? <Empty>No approval workflows configured.</Empty> : workflows.map(w => <div key={w.id} className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{w.name}</h3><Badge value={w.isActive ? 'ACTIVE' : 'INACTIVE'}/></div><p className="text-sm text-slate-500">{types.find(t => t.id === w.leaveTypeId)?.name}</p><ol className="list-inside list-decimal space-y-2 text-sm">{w.steps.map(s => <li key={s.id}>{s.kind} · {name(s.approverUserId)}</li>)}</ol>{w.isActive && <button disabled={action.busy} className={secondary} onClick={() => { if (window.confirm(`Deactivate ${w.name} for future requests?`)) void action.run(async () => { await api.deactivateLeaveWorkflow(w.id); await load(); }, 'Workflow deactivated.'); }}>Deactivate</button>}</div>)}</Card></div>
    <Card title="Delegate an approver"><p className="text-sm text-slate-500">Dates are inclusive. The delegate still needs the permission required by the approval step.</p><form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, d = new FormData(form); void action.run(async () => { const fromUserId = text(d, 'fromUserId'), toUserId = text(d, 'toUserId'), effectiveFrom = text(d, 'from'), effectiveTo = text(d, 'to'); if (fromUserId === toUserId) throw new Error('Choose two different users.'); if (effectiveTo < effectiveFrom) throw new Error('End date cannot precede start date.'); await api.createLeaveDelegation({ fromUserId, toUserId, effectiveFrom, effectiveTo }); form.reset(); }, 'Delegation recorded.'); }}>
      {(['fromUserId', 'toUserId'] as const).map((key, index) => <Field key={key} label={index === 0 ? 'Original approver' : 'Delegate'}><select name={key} required className={control}><option value="">Select active user</option>{users.map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.role}</option>)}</select></Field>)}<Field label="Effective from"><input name="from" type="date" required className={control}/></Field><Field label="Effective to"><input name="to" type="date" required className={control}/></Field><button disabled={action.busy} className={button}>Create delegation</button></form>
    </Card></div>;
}
function Notifications() {
  const [items, setItems] = useState<api.LeaveNotification[]>([]), [loading, setLoading] = useState(true); const action = useAction();
  async function load() { try { setItems(await api.getLeaveNotifications()); } finally { setLoading(false); } }
  useEffect(() => { void action.run(load); }, []);
  return <Card title="Your leave notifications"><Notice error={action.error} message={action.message}/><p className="text-sm text-slate-500">Latest 100 notifications for your account.</p><button disabled={action.busy} className={secondary} onClick={() => void action.run(load)}>Refresh</button>{loading ? <Empty>Loading notifications…</Empty> : !items.length ? <Empty>No leave notifications.</Empty> : items.map(n => <div key={n.id} className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{n.message}</p><Badge value={n.readAt ? 'READ' : 'UNREAD'}/></div><p className="text-xs text-slate-500">{dateLabel(n.createdAt)}</p><div className="flex flex-wrap gap-3"><Link className="text-sm text-indigo-700 underline" href={`/leave-requests/${encodeURIComponent(n.requestId)}`}>Open request</Link>{!n.readAt && <button disabled={action.busy} className={secondary} onClick={() => void action.run(async () => { await api.readLeaveNotification(n.id); await load(); })}>Mark read</button>}</div></div>)}</Card>;
}
