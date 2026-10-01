'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getExecutiveOverview, type ExecutiveOverview, type ReportRange } from '../../lib/api';

const today = () => new Date().toISOString().slice(0, 10);
const initialRange = (): ReportRange => ({ from: `${today().slice(0, 7)}-01`, to: today() });
const number = (value: number) => new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(value);
const rand = (cents: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
export default function CeoDashboardPage() {
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [selected, setSelected] = useState<ReportRange>(initialRange);
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setOverview(null);
    getExecutiveOverview(selected).then(data => { if (active) setOverview(data); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Overview unavailable'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected]);
  const cards = overview ? [
    { label: 'Workforce at range end', value: number(overview.headcount), detail: 'Activated employees not yet terminated', href: '/workforce-reports' },
    { label: 'Employer cost', value: rand(overview.employerCostCents), detail: 'Posted payroll for selected period', href: '/workforce-reports' },
    { label: 'Recorded attendance days', value: number(overview.recordedAttendanceDays), detail: 'Attendance records across the range', href: '/workforce-reports' },
    { label: 'Absence incidents', value: number(overview.absenceIncidents), detail: 'Missing check-ins and expected absences', href: '/workforce-reports' },
    { label: 'Late incidents', value: number(overview.lateIncidents), detail: 'Recorded attendance exceptions', href: '/workforce-reports' },
    { label: 'Overtime hours', value: number(overview.overtimeHours), detail: 'Approved or locked timesheets', href: '/workforce-reports' },
    { label: 'Leave days', value: number(overview.approvedLeaveDays), detail: 'Approved charged days by request start', href: '/workforce-reports' },
    { label: 'Workforce movement', value: `${number(overview.hires)} hired · ${number(overview.terminations)} left`, detail: `${number(overview.hrRequests)} HR requests created`, href: '/workforce-reports' },
  ] : [];
  return <div className="space-y-6 pb-8">
    <section className="rounded-3xl bg-slate-950 p-6 text-white md:p-8"><p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Executive workforce intelligence</p><h1 className="mt-3 text-3xl font-semibold">Your workforce, at a glance.</h1><p className="mt-3 max-w-2xl text-sm text-slate-300">See its size, cost, attendance, exceptions and movement using the same definitions as the DeluxHR reports.</p></section>
    <form onSubmit={e => { e.preventDefault(); if (range.from <= range.to) setSelected({ ...range }); }} className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <label className="text-sm font-medium text-slate-700">From<input type="date" required value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 p-2" /></label>
      <label className="text-sm font-medium text-slate-700">To<input type="date" required min={range.from} value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 p-2" /></label>
      <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={loading || range.from > range.to}>Apply</button>
      <Link href="/workforce-reports" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700">Explore reports</Link>
    </form>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {loading && <p className="text-sm text-slate-600">Loading executive overview…</p>}
    {overview && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <Link href={card.href} key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p><p className="mt-3 text-2xl font-bold text-slate-950">{card.value}</p><p className="mt-2 text-xs text-slate-600">{card.detail}</p></Link>)}</div>}
    <p className="text-xs text-slate-500">Period: {selected.from} to {selected.to}, inclusive UTC. Workforce cost is only visible with executive and cost access.</p>
  </div>;
}
