import { workforceRequest } from './api';
export type WorkspaceAccess={role:string;organizationId:string;permissions:{permission:string;scope:string}[];features:string[];employeeLinked:boolean;subscription:null|{status:string;endsAt:string|null;available:boolean;packageName:string;packageFeatures:string[]};services:{feature:string;configured:boolean;enabled:boolean;effectiveEnabled:boolean;included:boolean}[]};
export const getWorkspaceAccess=()=>workforceRequest<WorkspaceAccess>('workspace-access/current');
export const configureService=(feature:string,enabled:boolean,reason:string)=>workforceRequest<WorkspaceAccess>(`workspace-access/services/${encodeURIComponent(feature)}`,'PUT',{enabled,reason});
export function grant(a:WorkspaceAccess,p:string,org=false){return a.permissions.some(g=>g.permission===p&&(!org||g.scope==='ORGANIZATION'));}
export function routeAllowed(a:WorkspaceAccess,href:string){
 const f=(feature:string)=>a.features.includes(feature),p=(permission:string)=>grant(a,permission,true),company=a.role==='COMPANY_ADMIN',workforce=!['EMPLOYEE','MANAGER'].includes(a.role);
 switch(href){
 case '/dashboard':return f('CORE_HR');
 case '/remittance-beneficiaries':case '/company-services':case '/company-banking':return company;
 case '/onboarding':return company;
 case '/company-profile':return f('CORE_HR')&&p('MANAGE_COMPANY');
 case '/access-setup':return f('CORE_HR')&&p('MANAGE_USERS')&&p('MANAGE_ACCESS');
 case '/employees':case '/departments':return f('CORE_HR')&&p('VIEW_EMPLOYEES');
 case '/leave-requests':return f('LEAVE')&&(p('MANAGE_LEAVE')||a.employeeLinked);
 case '/leave-types':case '/leave-policies':return f('LEAVE')&&p('MANAGE_LEAVE');
 case '/leave-approvals':return f('LEAVE')&&(p('MANAGE_LEAVE')||a.employeeLinked);
 case '/attendance':case '/shifts':case '/attendance-exceptions':return f('ATTENDANCE')&&workforce&&p('VIEW_ATTENDANCE');
 case '/timesheets':return f('TIMESHEETS')&&workforce&&p('VIEW_ATTENDANCE');
 case '/remittance-payments':case '/early-pay-repayments':case '/payroll-payments':case '/earnings':case '/payroll-runs':case '/payroll-setup':case '/payroll-liabilities':return f('PAYROLL')&&p('VIEW_PAYROLL');
 case '/payslips':return f('PAYSLIPS')&&p('VIEW_ALL_PAYSLIPS');
 case '/early-pay':return f('EARLY_PAY')&&workforce&&p('APPROVE_EARLY_PAY');
 case '/hr-service-desk':return f('CORE_HR')&&(a.employeeLinked||(p('VIEW_HR_REQUESTS')&&['COMPANY_ADMIN','HR_ADMIN'].includes(a.role)));
 case '/communications':return f('CORE_HR')&&(a.employeeLinked||(p('VIEW_COMMUNICATIONS')&&['COMPANY_ADMIN','HR_ADMIN'].includes(a.role)));
 case '/ceo-dashboard':return f('EXECUTIVE_DASHBOARD')&&p('VIEW_EXECUTIVE_DASHBOARD')&&p('VIEW_WORKFORCE_COST');
 case '/workforce-reports':return f('WORKFORCE_INSIGHTS')&&p('VIEW_WORKFORCE_INSIGHTS');
 case '/audit-logs':return f('CORE_HR')&&p('VIEW_AUDIT_LOGS');
 default:return false;
 }
}
export function routeRoot(path:string){const routes=['/remittance-beneficiaries','/remittance-payments','/early-pay-repayments','/payroll-payments','/company-banking','/onboarding','/company-profile','/access-setup','/company-services','/dashboard','/employees','/departments','/leave-requests','/leave-types','/leave-policies','/leave-approvals','/attendance','/shifts','/attendance-exceptions','/timesheets','/earnings','/payroll-runs','/payroll-setup','/payroll-liabilities','/payslips','/early-pay','/hr-service-desk','/communications','/ceo-dashboard','/workforce-reports','/audit-logs'];return routes.find(r=>path===r||path.startsWith(r+'/'));}
