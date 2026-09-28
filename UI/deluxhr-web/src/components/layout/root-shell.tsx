'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from './app-shell';

const authRoutes = ['/login', '/register'];

export function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (authRoutes.includes(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}