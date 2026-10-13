'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createDepartment, getDepartments, getEmployees, type Department, type Employee } from '../../lib/api';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departmentName, setDepartmentName] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadData() {
    try { setIsLoading(true); setErrorMessage(''); const [d,e]=await Promise.all([getDepartments(),getEmployees()]); setDepartments(d); setEmployees(e); }
    catch(error){ setErrorMessage(error instanceof Error?error.message:'Failed to load departments.'); }
    finally{ setIsLoading(false); }
  }
  useEffect(()=>{loadData();},[]);

  const cards=useMemo(()=>departments.filter((d)=>d.name.toLowerCase().includes(query.toLowerCase())).map((d)=>({...d,count:employees.filter((e)=>e.departmentId===d.id).length})),[departments,employees,query]);
  const largest = [...cards].sort((a,b)=>b.count-a.count)[0];

  async function handleSubmit(event:FormEvent<HTMLFormElement>){event.preventDefault();setErrorMessage('');setSuccessMessage('');if(!departmentName.trim()){setErrorMessage('Department name is required.');return;}try{setIsSubmitting(true);const newDepartment=await createDepartment({name:departmentName.trim()});setDepartments((current)=>[newDepartment,...current]);setDepartmentName('');setSuccessMessage('Department created successfully.');}catch(error){setErrorMessage(error instanceof Error?error.message:'Failed to create department.');}finally{setIsSubmitting(false);}}

  return <div className="space-y-7">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Organisation</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Departments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Shape your company structure and see how employees are distributed across teams.</p></div><button onClick={loadData} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Refresh</button></section>

    <section className="grid gap-4 sm:grid-cols-3"><Metric label="Departments" value={departments.length} note="Active organisational teams"/><Metric label="Employees assigned" value={employees.filter((e)=>e.departmentId).length} note="Across all departments"/><Metric label="Largest team" value={largest?.count ?? 0} note={largest?.name ?? 'No team data yet'}/></section>

    <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-xl">＋</div><h2 className="mt-4 text-lg font-semibold text-slate-950">Create department</h2><p className="mt-1 text-sm leading-6 text-slate-500">Add a team to your organisation. Employees can be assigned immediately.</p><form onSubmit={handleSubmit} className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Department name</span><input value={departmentName} onChange={(e)=>setDepartmentName(e.target.value)} placeholder="e.g. Operations" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>{errorMessage&&<Notice kind="error">{errorMessage}</Notice>}{successMessage&&<Notice kind="success">{successMessage}</Notice>}<button disabled={isSubmitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{isSubmitting?'Creating…':'Create department'}</button></form></div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-950">Organisation structure</h2><p className="mt-1 text-sm text-slate-500">{cards.length} team{cards.length===1?'':'s'} shown</p></div><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search departments…" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-64" /></div>
        {isLoading?<div className="py-12 text-center text-sm text-slate-500">Loading organisation structure…</div>:cards.length===0?<div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">No departments match this view.</div>:<div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{cards.map((d)=><article key={d.id} className="group rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-700">{d.name.charAt(0).toUpperCase()}</div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span></div><h3 className="mt-5 font-semibold text-slate-950">{d.name}</h3><p className="mt-1 text-sm text-slate-500">{d.count} employee{d.count===1?'':'s'}</p><div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">Team ID · {d.id.slice(0,8)}</div></article>)}</div>}
      </div>
    </section>
  </div>;
}
function Metric({label,value,note}:{label:string;value:number;note:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>}
function Notice({kind,children}:{kind:'error'|'success';children:React.ReactNode}){return <div className={`rounded-xl border px-4 py-3 text-sm ${kind==='error'?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
