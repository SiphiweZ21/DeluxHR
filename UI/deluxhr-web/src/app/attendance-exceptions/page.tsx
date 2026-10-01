'use client';

import { useEffect, useState } from 'react';
import { getAttendanceExceptions, resolveAttendanceException, scanAttendanceSchedules, type AttendanceException, type AttendanceExceptionPage } from '../../lib/api';
const today = () => new Date().toISOString().slice(0, 10);
export default function AttendanceExceptionsPage() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AttendanceExceptionPage | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [active, setActive] = useState<AttendanceException | null>(null);
  const [resolution, setResolution] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() { setResult(await getAttendanceExceptions(status, page)); }
  useEffect(() => { let current = true; getAttendanceExceptions(status, page).then(data => { if (current) setResult(data); }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Unable to load exceptions'); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [status, page]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await load(); setMessage(success); setActive(null); setResolution(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }
  const rows = result?.exceptions ?? [];
  return <div className="space-y-6 pb-8">
    <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Attendance review</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Attendance exceptions</h1><p className="mt-2 text-sm text-slate-600">Review late arrivals, missing check-ins and check-outs, expected absences and site mismatches. An exception does not itself change payroll.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"><div><h2 className="font-semibold">Scan schedules</h2><p className="text-xs text-slate-500">Detect missing and late attendance for selected days.</p></div><label className="text-sm">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label><label className="text-sm">To<input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} className="mt-1 block rounded-lg border p-2" /></label><button disabled={busy || !from || !to || from > to} onClick={() => run(() => scanAttendanceSchedules(from, to), 'Schedule scan completed.')} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Run scan</button></section>
    <section className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><h2 className="font-semibold">Review queue · {result?.total ?? 0}</h2><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); setLoading(true); setActive(null); }} className="rounded-lg border p-2 text-sm"><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option><option value="">All statuses</option></select></div>{loading ? <p className="p-5 text-sm text-slate-600">Loading…</p> : rows.length ? <div className="divide-y">{rows.map(x => <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm"><div><p className="font-semibold text-slate-900">{x.employee.displayName} · {x.type.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">{x.scheduledDate?.slice(0, 10) ?? x.detectedAt.slice(0, 10)} · {x.workLocation?.name ?? 'No site'} · {x.status}</p>{x.employeeExplanation && <p className="mt-2 text-slate-700">Employee: {x.employeeExplanation}</p>}</div><button onClick={() => { setActive(x); setResolution(''); }} className="rounded-lg border px-3 py-2 font-medium">Review</button></div>)}</div> : <p className="p-5 text-sm text-slate-500">No exceptions match this filter.</p>}<div className="flex items-center justify-end gap-3 border-t p-4 text-sm"><button disabled={page <= 1} onClick={() => { setPage(page - 1); setLoading(true); }} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>Page {page} of {result?.totalPages || 1}</span><button disabled={page >= (result?.totalPages ?? 0)} onClick={() => { setPage(page + 1); setLoading(true); }} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></section>
    {active && <section className="rounded-2xl border border-indigo-200 bg-white p-5"><div className="flex justify-between"><h2 className="text-lg font-semibold">{active.employee.displayName} · {active.type.replaceAll('_', ' ')}</h2><button onClick={() => setActive(null)} aria-label="Close review">✕</button></div><p className="mt-2 text-sm text-slate-600">{active.note ?? 'No detector note.'}</p>{active.resolutionNote && <p className="mt-2 text-sm">Previous resolution: {active.resolutionNote}</p>}<div className="mt-5 max-w-xl"><p className="text-sm text-slate-700">Employee explanation: {active.employeeExplanation || 'Awaiting explanation from the employee.'}</p><label className="mt-4 block text-sm font-medium">Supervisor resolution note<textarea value={resolution} onChange={e => setResolution(e.target.value)} minLength={5} maxLength={1000} className="mt-1 block min-h-28 w-full rounded-lg border p-3" /></label><span className="mt-2 flex gap-2"><button disabled={busy || active.status !== 'OPEN' || resolution.trim().length < 5} onClick={() => run(() => resolveAttendanceException(active.id, 'RESOLVED', resolution.trim()), 'Exception resolved.')} className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-40">Resolve</button><button disabled={busy || active.status !== 'OPEN' || resolution.trim().length < 5} onClick={() => run(() => resolveAttendanceException(active.id, 'DISMISSED', resolution.trim()), 'Exception dismissed.')} className="rounded-lg border px-4 py-2 disabled:opacity-40">Dismiss</button></span></div></section>}
  </div>;
}
