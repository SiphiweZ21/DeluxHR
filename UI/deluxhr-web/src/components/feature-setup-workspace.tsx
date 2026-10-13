"use client";
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import * as api from '../lib/customer-onboarding-api';
import {SetupContext,type Choices} from './onboarding/common';
import {useWorkspaceAccess} from './layout/workspace-access';
const empty:Choices={departments:[],positions:[],employees:[],leaveTypes:[],policies:[]};
export function FeatureSetupWorkspace({title,children}:{title:string;children:ReactNode}){
 const {access}=useWorkspaceAccess();const [choices,setChoices]=useState<Choices>(empty),[pending,setPending]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function reload(){setLoading(true);try{const [lists,identity]=await Promise.all([api.setupLookups(),api.setupIdentity()]);setChoices(lists);setPending(identity.organization?.status==='PENDING');setError('');}catch(e){setError(e instanceof Error?e.message:'Setup could not load.');}finally{setLoading(false);}}
 useEffect(()=>{if(access?.role==='COMPANY_ADMIN')void reload();},[access?.role]);
 if(access?.role!=='COMPANY_ADMIN')return <p>Company administrator access is required for these company configuration forms. Your daily work remains available in the feature menu.</p>;
 if(loading)return <p>Loading saved company records…</p>;
 return <SetupContext.Provider value={{choices,pending,refresh:async()=>{},reloadChoices:reload,remember:(kind,items)=>setChoices(old=>({...old,[kind]:[...old[kind].filter(o=>!items.some(i=>i.id===o.id)),...items]}))}}><div className="space-y-6"><header><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-slate-600">Complete missing records here, then continue with the feature. <Link href="/onboarding" className="text-indigo-600 underline">View onboarding checklist</Link></p></header>{error?<div role="alert">{error}<button onClick={()=>void reload()} className="ml-3 underline">Retry</button></div>:children}</div></SetupContext.Provider>;
}
