'use client';
import { useWorkspaceAccess } from './workspace-access';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GroupedNavigation } from './grouped-navigation';
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {access} = useWorkspaceAccess();
  const pathname = usePathname(); if (!open) return null;
  return <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose}/><aside className="absolute left-0 top-0 h-full w-[290px] overflow-y-auto bg-white p-4 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 font-bold text-white">D</div><div><p className="font-bold text-slate-950">DeluxHR</p><p className="text-[11px] text-slate-400">Modern HR. Smarter Workforce.</p></div></div><button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button></div><div className="mb-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-800">DeluxHR Workspace</p><p className="mt-1 break-words text-sm text-slate-600">{access?.companyName || 'Company workspace'}</p></div><GroupedNavigation onNavigate={onClose}/></aside></div>;
}
