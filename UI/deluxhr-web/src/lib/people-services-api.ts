import { workforceRequest as request, getAuthHeaders, handleResponse } from './api';
const id = encodeURIComponent;
export type HrStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type HrPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type HrCategory = { id: string; code: string; name: string; responseSlaHours: number; resolutionSlaHours: number; isActive: boolean };
export type NewHrCategory = Omit<HrCategory, 'id'>;
export type ServiceAttachment = { id: string; name: string; mimeType: string; byteSize: number; internal?: boolean; createdAt?: string };
export type ServiceEvent = { id: string; type: string; actorUserId: string; detail?: string | null; createdAt: string };
export type HrRequest = { id: string; employeeId: string; reference: string; summary: string; category: string; categoryId: string | null; status: HrStatus; priority: HrPriority; assignedToUserId: string | null; createdAt: string; firstResponseAt: string | null; responseDueAt: string | null; resolutionDueAt: string | null; resolvedAt: string | null; closedAt: string | null; escalationLevel: number; escalatedAt: string | null };
export type HrDetail = HrRequest & { comments: { id: string; actorUserId: string; body: string; internal: boolean; createdAt: string }[]; attachments: ServiceAttachment[]; events: ServiceEvent[] };
export type HrReport = { total: number; byStatus: Record<string, number>; byPriority: Record<string, number>; byCategory: Record<string, number>; responseBreaches: number; resolutionBreaches: number; averageResolutionHours: number | null };
export type HrFilters = { status?: HrStatus; priority?: HrPriority; assignee?: string; categoryId?: string; overdue?: 'true' };
export const getHrCategories = () => request<HrCategory[]>('hr-requests/categories');
export const saveHrCategory = (payload: NewHrCategory) => request<HrCategory>('hr-requests/admin/categories', 'POST', payload);
export const createHrRequest = (summary: string, categoryId?: string) => request<HrRequest>('hr-requests', 'POST', { summary, ...(categoryId ? { categoryId } : {}) });
export const getMyHrRequests = () => request<HrRequest[]>('hr-requests/mine');
export const getHrQueue = (filters: HrFilters = {}) => request<HrRequest[]>(`hr-requests/admin/queue?${new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v))}`);
export const getHrReport = () => request<HrReport>('hr-requests/admin/report');
export const hrDetailPath = (key: string, admin: boolean) => `hr-requests/${admin ? 'admin' : 'mine'}/${id(key)}`;
export const getHrDetail = (key: string, admin: boolean) => request<HrDetail>(hrDetailPath(key, admin));
export const addHrComment = (key: string, admin: boolean, body: string, internal = false) => request<unknown>(`${hrDetailPath(key, admin)}/comments`, 'POST', { body, ...(admin ? { internal } : {}) });
export const assignHrRequest = (key: string, userId: string) => request<HrRequest>(`hr-requests/admin/${id(key)}/assign`, 'PATCH', { userId });
export const changeHrPriority = (key: string, priority: HrPriority) => request<HrRequest>(`hr-requests/admin/${id(key)}/priority`, 'PATCH', { priority });
export const changeHrStatus = (key: string, status: HrStatus) => request<HrRequest>(`hr-requests/admin/${id(key)}/status`, 'PATCH', { status });
export const escalateHrRequest = (key: string, userId: string, reason: string) => request<HrRequest>(`hr-requests/admin/${id(key)}/escalate`, 'POST', { userId, reason });
export const hrTransitions: Record<HrStatus, HrStatus[]> = { OPEN: ['IN_PROGRESS'], IN_PROGRESS: ['RESOLVED'], RESOLVED: ['OPEN', 'CLOSED'], CLOSED: [] };
export type Audience = 'COMPANY' | 'DEPARTMENT' | 'LOCATION' | 'TEAM';
export type Announcement = { id: string; title: string; body: string; audience: Audience; departmentId: string | null; workLocationId: string | null; teamId: string | null; publishedAt: string; expiresAt: string | null; isActive: boolean; pinned: boolean; important: boolean; requiresAcknowledgement: boolean; recipientCount?: number; _count?: { recipients: number } };
export type NewAnnouncement = { title: string; body: string; audience: Audience; departmentId?: string; workLocationId?: string; teamId?: string; publishedAt?: string; expiresAt?: string; pinned: boolean; important: boolean; requiresAcknowledgement: boolean };
export type AnnouncementReceipt = { id: string; announcementId: string; employeeId: string; readAt: string | null; acknowledgedAt: string | null; announcement: Announcement & { attachments: ServiceAttachment[] } };
export type AnnouncementDetail = Announcement & { recipients: { employeeId: string; readAt: string | null; acknowledgedAt: string | null }[]; attachments: ServiceAttachment[]; events: ServiceEvent[] };
export type CommunicationTeam = { id: string; name: string; members: { employeeId: string; teamId: string }[] };
export type WorkLocationOption = { id: string; name: string; code: string; isActive: boolean };
export const getAnnouncementInbox = (unread = false) => request<AnnouncementReceipt[]>(`communications/inbox${unread ? '?unread=true' : ''}`);
export const getAnnouncementReceipt = (key: string) => request<AnnouncementReceipt>(`communications/inbox/${id(key)}`);
export const markAnnouncementRead = (key: string) => request<unknown>(`communications/inbox/${id(key)}/read`, 'POST');
export const acknowledgeAnnouncement = (key: string) => request<unknown>(`communications/inbox/${id(key)}/acknowledge`, 'POST');
export const getAnnouncements = () => request<Announcement[]>('communications/admin/announcements');
export const createAnnouncement = (payload: NewAnnouncement) => request<Announcement>('communications/admin/announcements', 'POST', payload);
export const getAnnouncementDetail = (key: string) => request<AnnouncementDetail>(`communications/admin/announcements/${id(key)}`);
export const setAnnouncementActive = (key: string, isActive: boolean) => request<Announcement>(`communications/admin/announcements/${id(key)}/state`, 'PATCH', { isActive });
export const getCommunicationTeams = () => request<CommunicationTeam[]>('communications/admin/teams');
export const saveCommunicationTeam = (name: string, employeeIds: string[], key?: string) => request<CommunicationTeam>(`communications/admin/teams${key ? `/${id(key)}` : ''}`, key ? 'PATCH' : 'POST', { name, employeeIds });
export const getCommunicationLocations = () => request<WorkLocationOption[]>('work-locations');
export const announcementFilePath = (key: string, admin: boolean) => `communications/${admin ? 'admin/announcements' : 'inbox'}/${id(key)}/attachments`;
export async function uploadServiceFile(path: string, file: File, internal?: boolean) {
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PDF, PNG or JPEG.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('File must be between 1 byte and 10 MB.');
  const headers = new Headers(getAuthHeaders()); headers.delete('Content-Type');
  const body = new FormData(); body.append('file', file); if (internal !== undefined) body.append('internal', String(internal));
  return handleResponse<ServiceAttachment>(await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/${path}`, { method: 'POST', headers, body }), 'Unable to upload attachment');
}
export async function downloadServiceFile(path: string, attachment: ServiceAttachment) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/${path}/${id(attachment.id)}`, { headers: getAuthHeaders(), cache: 'no-store' });
  if (!response.ok) return handleResponse<never>(response, 'Unable to download attachment');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = attachment.name.replace(/[\\/\x00-\x1f]/g, '_'); document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function dateTimeLabel(value: string) { return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }); }
export function announcementState(item: Announcement) { const now = Date.now(); return !item.isActive ? 'INACTIVE' : item.expiresAt && Date.parse(item.expiresAt) <= now ? 'EXPIRED' : Date.parse(item.publishedAt) > now ? 'SCHEDULED' : 'PUBLISHED'; }
