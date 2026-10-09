"use client";
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { navGroups, NavIcon } from './navigation-data';
import { useWorkspaceAccess } from './workspace-access';
import { routeAllowed } from '../../lib/workspace-access';
export function GroupedNavigation({onNavigate}:{onNavigate?:()=>void}) {
 const {access}=useWorkspaceAccess(),path=usePathname();
 const [query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<string[]>([]);
 if(!access)return <p className="p-3 text-sm text-slate-500">Loading menu…</p>;
 const allFeatures={...access,features:access.services.map(s=>s.feature)};
 const groups=navGroups.map(g=>({...g,items:g.items.filter(i=>routeAllowed(access,i.href)||(access.role==='COMPANY_ADMIN'&&routeAllowed(allFeatures,i.href)))})).filter(g=>g.items.length);
 return <><label className="block px-2 mb-4"><span className="sr-only">Find a menu item</span><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-xl border p-2 text-sm" placeholder="Find HR, payroll, banking…"/></label>{groups.map(g=>{
 const items=g.items.filter(i=>`${g.label} ${i.label}`.toLowerCase().includes(query.toLowerCase()));if(!items.length)return null;
 const isOpen=!!query||!collapsed.includes(g.label);
 return <section key={g.label} className="mb-2"><button type="button" aria-expanded={isOpen} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={()=>setCollapsed(old=>old.includes(g.label)?old.filter(x=>x!==g.label):[...old,g.label])}><span>{g.label}</span><span aria-hidden>{isOpen?'−':'+'}</span></button>{isOpen&&<div className="space-y-1 pb-2">{items.map(i=>{
 const personal=access.role==='EMPLOYEE'&&i.href==='/leave-requests'?'My Leave':i.label;
 const enabled=routeAllowed(access,i.href),active=path===i.href||path.startsWith(i.href+'/');
 const feature=i.href.startsWith('/leave')?'LEAVE':i.href==='/payslips'?'PAYSLIPS':i.href==='/early-pay'?'EARLY_PAY':i.href==='/timesheets'?'TIMESHEETS':i.href.startsWith('/attendance')||i.href==='/shifts'?'ATTENDANCE':i.href==='/ceo-dashboard'?'EXECUTIVE_DASHBOARD':i.href==='/workforce-reports'?'WORKFORCE_INSIGHTS':'PAYROLL';
 const service=access.services.find(s=>s.feature===feature);
 const unavailable=service&&!service.included?'Not included in your package':'Service disabled';
 if(!enabled)return <div key={i.href} aria-disabled="true" className="rounded-xl px-3 py-2 text-sm text-slate-400"><span className="flex items-center gap-3"><NavIcon name={i.icon}/>{personal}</span><span className="block pl-7 text-xs">{unavailable} · review Company Services &amp; Package</span></div>;
 return <Link href={i.href} key={i.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${active?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50'}`}><NavIcon name={i.icon}/>{personal}</Link>;
 })}</div>}</section>;
 })}{!groups.some(g=>g.items.some(i=>`${g.label} ${i.label}`.toLowerCase().includes(query.toLowerCase())))&&<p className="p-3 text-sm text-slate-500">No available pages match.</p>}</>;
}
