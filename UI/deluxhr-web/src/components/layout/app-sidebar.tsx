'use client';
import { GroupedNavigation } from './grouped-navigation';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '../../lib/auth';

export function AppSidebar() {
  const router = useRouter();
  function handleLogout() { logout(); router.push('/login'); router.refresh(); }

  return (
    <aside className="flex h-screen w-[272px] flex-col border-r border-slate-200/80 bg-white">
      <div className="px-5 pb-5 pt-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm shadow-indigo-200">D</div>
          <div><div className="text-xl font-bold tracking-tight text-slate-950">DeluxHR</div><div className="text-[11px] font-medium text-slate-400">Modern HR. Smarter Workforce.</div></div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <GroupedNavigation/>
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="mb-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-800">DeluxHR Workspace</p><p className="mt-0.5 text-[11px] text-slate-500">Secure organization access</p></div>
        <button onClick={handleLogout} className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900">Sign out</button>
      </div>
    </aside>
  );
}
