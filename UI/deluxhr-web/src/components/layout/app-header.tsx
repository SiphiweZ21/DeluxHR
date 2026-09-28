'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getUser } from '../../lib/auth';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/ceo-dashboard': 'Executive Dashboard',
  '/employees': 'Employees',
  '/departments': 'Departments',
  '/leave-types': 'Leave Types',
  '/leave-requests': 'Leave Management',
  '/attendance': 'Attendance',
  '/timesheets': 'Timesheets',
  '/earnings': 'Earnings',
  '/payroll-runs': 'Payroll Runs',
  '/payslips': 'Payslips',
  '/early-pay': 'Early Pay',
  '/audit-logs': 'Audit Logs',
};

type HeaderUser = {
  email?: string;
  role?: string;
};

export function AppHeader({
  onMenuClick,
}: {
  onMenuClick: () => void;
}) {
  const pathname = usePathname();

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  const title = titles[pathname] ?? 'Workspace';

  const role =
    mounted && user?.role
      ? user.role
      : 'Administrator';

  const email =
    mounted && user?.email
      ? user.email
      : 'Secure workspace';

  const initials =
    mounted && user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'AD';

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur md:px-7">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 md:hidden"
          aria-label="Open navigation"
        >
          <span className="text-xl">☰</span>
        </button>

        <div>
          <p className="text-xs font-medium text-slate-400">
            DeluxHR Workspace
          </p>

          <h2 className="text-base font-bold text-slate-900">
            {title}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-800">
            {role}
          </p>

          <p className="max-w-[210px] truncate text-xs text-slate-400">
            {email}
          </p>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">
          {initials}
        </div>
      </div>
    </header>
  );
}