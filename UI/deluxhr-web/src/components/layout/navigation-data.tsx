export const navGroups = [
 {label:'Overview',items:[{label:'Dashboard',href:'/dashboard',icon:'grid'},{label:'CEO Dashboard',href:'/ceo-dashboard',icon:'chart'},{label:'Workforce Reports',href:'/workforce-reports',icon:'chart'}]},
 {label:'People',items:[{label:'Employees',href:'/employees',icon:'users'},{label:'Departments',href:'/departments',icon:'building'},{label:'HR Service Desk',href:'/hr-service-desk',icon:'document'},{label:'Communications',href:'/communications',icon:'users'}]},
 {label:'Time & Attendance',items:[{label:'Attendance',href:'/attendance',icon:'clock'},{label:'Shifts & Schedules',href:'/shifts',icon:'calendar'},{label:'Attendance Exceptions',href:'/attendance-exceptions',icon:'history'},{label:'Timesheets',href:'/timesheets',icon:'sheet'}]},
 {label:'Leave',items:[{label:'Leave Requests',href:'/leave-requests',icon:'calendar'},{label:'Leave Approvals',href:'/leave-approvals',icon:'calendar'},{label:'Leave Types',href:'/leave-types',icon:'tag'},{label:'Leave Policies',href:'/leave-policies',icon:'sheet'}]},
 {label:'Payroll & Payments',items:[{label:'Payroll Setup',href:'/payroll-setup',icon:'payroll'},{label:'Earnings',href:'/earnings',icon:'wallet'},{label:'Payroll Runs',href:'/payroll-runs',icon:'payroll'},{label:'Early Pay Repayments',href:'/early-pay-repayments',icon:'wallet'},{label:'Payment Batches',href:'/payroll-payments',icon:'wallet'},{label:'Remittance Preparation',href:'/remittance-payments',icon:'wallet'},{label:'Liabilities & Remittances',href:'/payroll-liabilities',icon:'wallet'},{label:'Payslips',href:'/payslips',icon:'document'},{label:'Early Pay',href:'/early-pay',icon:'wallet'}]},
 {label:'Company & Access',items:[{label:'Services',href:'/company-services',icon:'grid'},{label:'Banking & Payments',href:'/company-banking',icon:'wallet'},{label:'Remittance Beneficiaries',href:'/remittance-beneficiaries',icon:'wallet'},{label:'Company Setup',href:'/onboarding',icon:'building'},{label:'Company Profile',href:'/company-profile',icon:'building'},{label:'Users & Access',href:'/access-setup',icon:'users'},{label:'Audit Logs',href:'/audit-logs',icon:'history'}]},
];

export function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    building: <><path d="M3 21h18"/><path d="M6 21V5l6-2v18"/><path d="M12 7h6v14"/><path d="M8 9h1M8 13h1M8 17h1M15 11h1M15 15h1"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    tag: <><path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82Z"/><circle cx="7.5" cy="6.5" r="1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sheet: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6Z"/><path d="M3 6l2-3h12l1 3M15 12h6"/></>,
    payroll: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.6-.6-1.5-1-2.5-1-1.4 0-2.5.8-2.5 2s1 1.8 2.5 2.2 2.5.9 2.5 2.3-1.1 2.5-2.7 2.5c-1.1 0-2.1-.4-2.8-1.1M12.5 5.5v2M12.5 16.5v2"/></>,
    document: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  };
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

