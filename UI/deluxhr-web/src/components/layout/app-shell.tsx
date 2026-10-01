'use client';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../../lib/auth';
import { AppSidebar } from './app-sidebar';
import { AppHeader } from './app-header';
import { MobileNav } from './mobile-nav';
import { WorkspaceAccessProvider, WorkspaceBoundary } from './workspace-access';
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(); const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{ if(!isAuthenticated()) router.push('/login'); },[router]);
  return <WorkspaceAccessProvider><div className="min-h-screen bg-[#f6f8fc]"><div className="fixed inset-y-0 left-0 z-40 hidden md:block"><AppSidebar/></div><div className="min-w-0 md:pl-[272px]"><AppHeader onMenuClick={()=>setMenuOpen(true)}/><main className="mx-auto w-full max-w-[1600px] p-4 md:p-7 lg:p-8"><WorkspaceBoundary>{children}</WorkspaceBoundary></main></div><MobileNav open={menuOpen} onClose={()=>setMenuOpen(false)}/></div></WorkspaceAccessProvider>;
}
