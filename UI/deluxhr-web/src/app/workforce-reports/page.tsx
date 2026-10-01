'use client';

import { useEffect, useState } from 'react';
import { useWorkspaceAccess } from '../../components/layout/workspace-access';
import { grant } from '../../lib/workspace-access';
import { downloadWorkforceReport, getWorkforceReport, type ReportRange, type WorkforceReport, type WorkforceReportType } from '../../lib/api';

const reports: { type: WorkforceReportType; label: string; restricted?: boolean }[] = [
  { type: 'headcount', label: 'Headcount' },
  { type: 'attendance', label: 'Attendance' },
  { type: 'absence', label: 'Absence incidents' },
  { type: 'late', label: 'Late arrivals' },
  { type: 'overtime', label: 'Overtime' },
  { type: 'leave', label: 'Leave utilisation' },
  { type: 'locations', label: 'Locations' },
  { type: 'movement', label: 'Workforce movement' },
  { type: 'turnover', label: 'Turnover' },
  { type: 'hr-service', label: 'HR service' },
  { type: 'cost', label: 'Workforce cost', restricted: true },
  { type: 'payroll', label: 'Payroll trends', restricted: true },
  { type: 'departments', label: 'Departments and cost', restricted: true },
];
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const today = () => dateOnly(new Date());
const firstOfMonth = () => `${today().slice(0, 7)}-01`;
const format = (value: unknown, key: string) => {
  if (typeof value === 'number' && key.endsWith('Cents')) return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value / 100);
  if (typeof value === 'number') return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(value);
  return String(value ?? '—');
};
export default function WorkforceReportsPage() {
  const { access } = useWorkspaceAccess();
  const availableReports = reports.filter(r => !r.restricted || !!access && grant(access, 'VIEW_WORKFORCE_COST', true));
  const [type, setType] = useState<WorkforceReportType>('headcount');
  const [range, setRange] = useState<ReportRange>({ from: firstOfMonth(), to: today() });
  const [applied, setApplied] = useState<ReportRange>({ from: firstOfMonth(), to: today() });
  const [data, setData] = useState<WorkforceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setData(null); setError('');
    getWorkforceReport(type, applied).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Report unavailable'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, applied]);
  const columns = data?.rows?.length ? Object.keys(data.rows[0]) : [];
  async function exportCsv() {
    setExporting(true); setError('');
    try { await downloadWorkforceReport(type, applied); }
    catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); }
    finally { setExporting(false); }
  }
  return <div className="space-y-6 pb-8">
    <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Workforce intelligence</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Reports</h1><p className="mt-2 text-sm text-slate-600">Explore your company’s workforce across a selected UTC date range.</p></div>
    <form onSubmit={e => { e.preventDefault(); if (range.from <= range.to) setApplied({ ...range }); }} className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="text-sm font-medium text-slate-700">Report<select value={type} onChange={e => setType(e.target.value as WorkforceReportType)} className="mt-1 block min-w-56 rounded-lg border border-slate-300 p-2"><option disabled value="">Select a report</option>{availableReports.map(r => <option key={r.type} value={r.type}>{r.label}{r.restricted ? ' · Cost access' : ''}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-700">From<input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} required className="mt-1 block rounded-lg border border-slate-300 p-2" /></label>
      <label className="text-sm font-medium text-slate-700">To<input type="date" value={range.to} min={range.from} onChange={e => setRange({ ...range, to: e.target.value })} required className="mt-1 block rounded-lg border border-slate-300 p-2" /></label>
      <button type="submit" disabled={loading || range.from > range.to} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Apply</button>
      <button type="button" disabled={!data || exporting} onClick={exportCsv} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-50">{exporting ? 'Exporting…' : 'Download CSV'}</button>
    </form>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {loading ? <p className="text-sm text-slate-600">Loading report…</p> : data && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">{reports.find(r => r.type === type)?.label}</h2>{data.definition && <p className="mt-1 text-xs text-slate-600">{data.definition}</p>}</div>
      {columns.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{columns.map(c => <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{c.replace(/([A-Z])/g, ' $1').replace(/Cents$/, ' (ZAR)')}</th>)}</tr></thead><tbody>{data.rows.map((row, i) => <tr key={i} className="border-t border-slate-100">{columns.map(c => <td key={c} className="whitespace-nowrap px-4 py-3 text-slate-800">{format(row[c], c)}</td>)}</tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">No records for this range.</p>}
    </section>}
  </div>;
}
