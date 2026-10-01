import { workforceRequest as request, getAuthHeaders, handleResponse, type LeaveRequest } from './api';

export type NewLeavePolicy = {
  leaveTypeId: string; code: string; name: string; isDefault: boolean;
  annualEntitlementDays: number; accrualMode: 'ANNUAL_UPFRONT' | 'MONTHLY';
  carryOverMaxDays: number; carryOverExpiryMonths: number; maxNegativeDays: number;
  probationMonths: number; workingWeekdays: number[]; excludePublicHolidays: boolean;
  supportingDocumentRequired: boolean; medicalCertificateAfterDays?: number;
};
export type LeavePolicy = NewLeavePolicy & { id: string; isActive: boolean };
export type LeaveAssignment = { id: string; employeeId: string; policyId: string; effectiveFrom: string; effectiveTo: string | null; policy: LeavePolicy };
export type LeaveBalance = { year: number; accrued: number; carryOver: number; adjustments: number; used: number; available: number; policyId: string };
export type PublicHoliday = { id: string; date: string; name: string };
export type LeaveCalendar = { holidays: PublicHoliday[]; leave: Pick<LeaveRequest, 'id' | 'employeeId' | 'leaveTypeId' | 'startDate' | 'endDate' | 'chargedDays'>[] };
export type ApprovalStep = { id: string; order: number; kind: 'MANAGER' | 'HR'; approverUserId: string };
export type LeaveWorkflow = { id: string; name: string; leaveTypeId: string; isActive: boolean; steps: ApprovalStep[] };
export type LeaveDecision = { id: string; requestId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; comment: string | null; decidedAt: string | null; decidedByUserId: string | null; step: ApprovalStep };
export type ApprovalQueueItem = LeaveDecision & { request: LeaveRequest & { decisions: LeaveDecision[] } };
export type LeaveDocument = { id: string; kind: 'SUPPORTING' | 'MEDICAL_CERTIFICATE'; originalFileName: string; fileSizeBytes: number; createdAt: string };
export type LeaveComment = { id: string; actorUserId: string; text: string; internal: boolean; createdAt: string };
export type LeaveChange = { id: string; kind: 'CANCELLATION' | 'AMENDMENT'; proposedStart: string | null; proposedEnd: string | null; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote: string | null; createdAt: string; reviewedAt: string | null };
export type LeaveHistory = { decisions: LeaveDecision[]; documents: LeaveDocument[]; comments: LeaveComment[]; changes: LeaveChange[] };
export type LeaveNotification = { id: string; requestId: string; message: string; readAt: string | null; createdAt: string };
const id = encodeURIComponent;
const range = (from: string, to: string) => new URLSearchParams({ from, to });
export const getLeavePolicies = () => request<LeavePolicy[]>('leave-policy/policies');
export const createLeavePolicy = (p: NewLeavePolicy) => request<LeavePolicy>('leave-policy/policies', 'POST', p);
export const setLeavePolicyActive = (key: string, active: boolean) => request<LeavePolicy>(`leave-policy/policies/${id(key)}/${active ? 'activate' : 'deactivate'}`, 'PATCH');
export const getLeaveAssignments = (employeeId: string) => request<LeaveAssignment[]>(`leave-policy/assignments/${id(employeeId)}`);
export const assignLeavePolicy = (p: { employeeId: string; policyId: string; effectiveFrom: string; effectiveTo?: string }) => request<LeaveAssignment>('leave-policy/assignments', 'POST', p);
export const endLeaveAssignment = (key: string, effectiveTo: string) => request<LeaveAssignment>(`leave-policy/assignments/${id(key)}/end`, 'PATCH', { effectiveTo });
export const getLeaveBalance = (employeeId: string, leaveTypeId: string, asOf: string) => request<LeaveBalance>(`leave-policy/balances/${id(employeeId)}/${id(leaveTypeId)}?${new URLSearchParams({ asOf })}`);
export const adjustLeaveBalance = (p: { employeeId: string; leaveTypeId: string; effectiveDate: string; type: 'OPENING' | 'CREDIT' | 'DEBIT'; days: number; reason: string }) => request<unknown>('leave-policy/adjustments', 'POST', p);
export const getLeaveCalendar = (from: string, to: string) => request<LeaveCalendar>(`leave-policy/calendar?${range(from, to)}`);
export const createPublicHoliday = (date: string, name: string) => request<PublicHoliday>('leave-policy/holidays', 'POST', { date, name });
export const deletePublicHoliday = (key: string) => request<unknown>(`leave-policy/holidays/${id(key)}`, 'DELETE');
export const calculateLeaveDays = (p: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string }) => request<{ policyId: string; days: number }>('leave-policy/working-days', 'POST', p);
export const getLeaveRequest = (key: string) => request<LeaveRequest>(`leave-requests/${id(key)}`);
export const getLeaveWorkflows = () => request<LeaveWorkflow[]>('leave-workflows');
export const createLeaveWorkflow = (p: { name: string; leaveTypeId: string; steps: Pick<ApprovalStep, 'kind' | 'approverUserId'>[] }) => request<LeaveWorkflow>('leave-workflows', 'POST', p);
export const deactivateLeaveWorkflow = (key: string) => request<LeaveWorkflow>(`leave-workflows/${id(key)}/deactivate`, 'PATCH');
export const createLeaveDelegation = (p: { fromUserId: string; toUserId: string; effectiveFrom: string; effectiveTo: string }) => request<{ id: string }>('leave-workflows/delegations', 'POST', p);
export const getLeaveApprovalQueue = () => request<ApprovalQueueItem[]>('leave-workflows/queue');
export const decideLeaveStep = (key: string, status: 'APPROVED' | 'REJECTED', comment: string) => request<LeaveDecision>(`leave-workflows/decisions/${id(key)}`, 'POST', { status, comment });
export const getLeaveHistory = (key: string) => request<LeaveHistory>(`leave-workflows/requests/${id(key)}/history`);
export const addLeaveComment = (key: string, text: string, internal: boolean) => request<LeaveComment>(`leave-workflows/requests/${id(key)}/comments`, 'POST', { text, internal });
export const requestLeaveChange = (key: string, p: { kind: 'CANCELLATION' | 'AMENDMENT'; reason: string; proposedStart?: string; proposedEnd?: string }) => request<LeaveChange>(`leave-workflows/requests/${id(key)}/changes`, 'POST', p);
export const reviewLeaveChange = (key: string, status: 'APPROVED' | 'REJECTED', note: string) => request<LeaveChange>(`leave-workflows/changes/${id(key)}/review`, 'POST', { status, note });
export const getLeaveNotifications = () => request<LeaveNotification[]>('leave-workflows/notifications');
export const readLeaveNotification = (key: string) => request<unknown>(`leave-workflows/notifications/${id(key)}/read`, 'PATCH');

export async function uploadLeaveDocument(requestId: string, kind: LeaveDocument['kind'], file: File) {
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PDF, PNG or JPEG file.');
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Document must be between 1 byte and 10 MB.');
  const headers = new Headers(getAuthHeaders());
  headers.delete('Content-Type');
  const body = new FormData(); body.append('kind', kind); body.append('file', file);
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/leave-workflows/requests/${id(requestId)}/documents`, { method: 'POST', headers, body });
  return handleResponse<LeaveDocument>(response, 'Unable to upload leave document');
}
export async function downloadLeaveDocument(requestId: string, document: LeaveDocument) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/leave-workflows/requests/${id(requestId)}/documents/${id(document.id)}/file`, { headers: getAuthHeaders(), cache: 'no-store' });
  if (!response.ok) return handleResponse<never>(response, 'Unable to download leave document');
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement('a'); link.href = url; link.download = document.originalFileName.replace(/[\\/\x00-\x1f]/g, '_');
  window.document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
