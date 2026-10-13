"use client";
import { useEffect, useState } from 'react';
import { workforceRequest } from '../lib/api';
import { useWorkspaceAccess } from './layout/workspace-access';
import { grant } from '../lib/workspace-access';
import { getUser } from '../lib/auth';
type Change={id:string;employeeId:string;proposed:Record<string,unknown>;status:string;submittedByUserId:string;reason?:string;createdAt:string};
export function EmployeeChangeQueue({revision=0,onReviewed}:{revision?:number;onReviewed?:()=>Promise<void>}){
 const {access}=useWorkspaceAccess();const [items,setItems]=useState<Change[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{setItems(await workforceRequest<Change[]>('employees/profile-changes'));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load changes');}}
 useEffect(()=>{void load();},[revision]);
 const canApprove=!!access&&grant(access,'APPROVE_EMPLOYEES',true);
 return <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Employee changes awaiting approval ({items.filter(c=>c.status==='PENDING').length})</h2><p className="text-sm">Existing details stay in use until HR or Executive Leadership approves changes.</p><button onClick={()=>void load()} className="rounded border px-3 py-1">Refresh changes</button>{error&&<p role="alert" className="text-red-700">{error}</p>}{items.filter(c=>c.status==='PENDING').map(c=><article className="rounded border p-3 space-y-2" key={c.id}><p>Employee {c.employeeId}</p><dl className="text-sm">{Object.entries(c.proposed).map(([key,v])=><div key={key}><dt className="inline font-semibold">{key}: </dt><dd className="inline">{String(v??'Blank')}</dd></div>)}</dl>{(['APPROVED','REJECTED'] as const).map(status=><button key={status} disabled={busy||!canApprove} title="Payroll/HR review permission required; the same administrator can review changes" className="rounded border px-3 py-1 mr-2 disabled:opacity-40" onClick={async()=>{const reason=status==='REJECTED'?window.prompt('Rejection reason'):undefined;if(reason===null)return;setBusy(true);try{await workforceRequest(`employees/profile-changes/${c.id}/review`,'POST',{status,reason});await load();await onReviewed?.();}catch(e){setError(e instanceof Error?e.message:'Review failed');}finally{setBusy(false);}}}>{status==='APPROVED'?'Approve changes':'Reject'}</button>)}</article>)}</section>;
}
