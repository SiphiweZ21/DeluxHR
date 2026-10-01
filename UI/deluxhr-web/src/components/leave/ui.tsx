'use client';
import { useState, type ReactNode } from 'react';
export const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
export const button = 'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50';
export const secondary = 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>; }
export function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold text-slate-950">{title}</h2>{children}</section>; }
export function PageTitle({ title, text, eyebrow = 'Time & leave' }: { title: string; text: string; eyebrow?: string }) { return <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>; }
export function Empty({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{children}</p>; }
export function Badge({ value }: { value: string }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${value === 'APPROVED' || value === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : value === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{value.replaceAll('_', ' ')}</span>; }
export function Notice({ error, message }: { error: string; message: string }) { return (error || message) ? <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div> : null; }
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function run(task: () => Promise<void | boolean>, success = '') {
    setBusy(true); setError(''); setMessage('');
    try { const result = await task(); if (result !== false) setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete this action.'); } finally { setBusy(false); }
  }
  return { busy, error, message, run, setError, setMessage };
}
export const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
export const number = (data: FormData, key: string) => Number(text(data, key));
export const today = () => new Date().toISOString().slice(0, 10);
export const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-ZA', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
