import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveApproverKind, LeaveChangeKind, LeaveChangeStatus, LeaveDecisionStatus, LeaveDocumentKind, Permission, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccessControlService } from '../../../common/access/access-control.service';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { LeavePolicyService } from '../leave-policy/leave-policy.service';
import { LeaveDocumentStorageService } from './leave-document-storage.service';
import { calendarDate } from '../../recurring-schedules/recurring-schedules.service';
import { ChangeDto, CommentDto, CreateDelegationDto, CreateWorkflowDto, DecisionDto, ReviewChangeDto } from './dto/leave-workflow.dto';
export function priorStepsApproved(steps: Array<{ order: number; status: LeaveDecisionStatus }>, currentOrder: number) {
 return steps.every(step => step.order >= currentOrder || step.status === LeaveDecisionStatus.APPROVED);
}
export function requirementsMet(required: boolean, medicalAfter: number | null, days: number, kinds: LeaveDocumentKind[]) {
 return (!required || kinds.length > 0) && (!medicalAfter || days < medicalAfter || kinds.includes(LeaveDocumentKind.MEDICAL_CERTIFICATE));
}
@Injectable()
export class LeaveWorkflowsService {
 constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly access: AccessControlService, private readonly leave: LeaveRequestsService, private readonly policy: LeavePolicyService, private readonly storage: LeaveDocumentStorageService) {}
 private async log(user: TenantJwtUser, entity: string, id: string, action: string, reason?: string) { await this.audit.log({ organizationId: user.organizationId, entity, entityId: id, action, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role, reason }); }
 private async manage(user: TenantJwtUser) { if (!(await this.access.hasPermission(user,Permission.MANAGE_LEAVE))) throw new ForbiddenException('HR leave permission required'); }
 private async ownerOrHR(user: TenantJwtUser, requestId: string) {
   const request = await this.prisma.leaveRequest.findFirst({ where: { id: requestId, organizationId: user.organizationId }, include: { employee: true } });
   if (!request) throw new NotFoundException('Leave request not found');
   const hr = await this.access.hasPermission(user,Permission.MANAGE_LEAVE);
   if (!hr && request.employee.userId !== user.sub) throw new ForbiddenException('Leave request access denied');
   return { request, hr };
 }
 private async viewer(user: TenantJwtUser, requestId: string) {
   const request = await this.prisma.leaveRequest.findFirst({ where: { id: requestId, organizationId: user.organizationId }, include: { employee: true } });
   if (!request) throw new NotFoundException('Leave request not found');
   const hr = await this.access.hasPermission(user,Permission.MANAGE_LEAVE);
   if (hr || request.employee.userId === user.sub) return { request, hr };
   const assigned = await this.prisma.leaveApprovalDecision.findFirst({ where: { requestId, step: { approverUserId: user.sub } }, select: { id: true } });
   const today = calendarDate(new Date().toISOString().slice(0,10));
   const steps = await this.prisma.leaveApprovalDecision.findMany({ where: { requestId }, include: { step: true } });
   const delegate = steps.length && await this.prisma.leaveApprovalDelegation.findFirst({ where: { organizationId: user.organizationId, fromUserId: { in: steps.map(d => d.step.approverUserId) }, toUserId: user.sub, effectiveFrom: { lte: today }, effectiveTo: { gte: today } } });
   if (!assigned && !delegate) throw new ForbiddenException('Leave request access denied');
   return { request, hr: false };
 }
 async createWorkflow(user: TenantJwtUser, dto: CreateWorkflowDto) {
   await this.manage(user);
   if (!dto.name?.trim() || !Array.isArray(dto.steps) || dto.steps.length < 1 || dto.steps.length > 5) throw new BadRequestException('Name and 1 to 5 approval steps required');
   if (!(await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, organizationId: user.organizationId } }))) throw new NotFoundException('Leave type not found');
   for (const step of dto.steps) {
     const approver = await this.prisma.user.findFirst({ where: { id: step.approverUserId, organizationId: user.organizationId, isActive: true } });
     if (!approver) throw new NotFoundException('Approver not found');
     if (step.kind === LeaveApproverKind.MANAGER && approver.role !== UserRole.MANAGER || step.kind === LeaveApproverKind.HR && approver.role !== UserRole.HR_ADMIN && approver.role !== UserRole.COMPANY_ADMIN) throw new BadRequestException('Approver role does not match step kind');
   }
   const workflow = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${dto.leaveTypeId}))`;
     if (await tx.leaveApprovalWorkflow.findFirst({ where: { organizationId: user.organizationId, leaveTypeId: dto.leaveTypeId, isActive: true } })) throw new ConflictException('Active workflow already exists');
     return tx.leaveApprovalWorkflow.create({ data: { organizationId: user.organizationId, leaveTypeId: dto.leaveTypeId, name: dto.name.trim(), steps: { create: dto.steps.map((step,i) => ({ order: i+1, kind: step.kind, approverUserId: step.approverUserId })) } }, include: { steps: true } });
   });
   await this.log(user,'LeaveApprovalWorkflow',workflow.id,'LEAVE_WORKFLOW_CREATED'); return workflow;
 }
 async workflows(organizationId: string) { return this.prisma.leaveApprovalWorkflow.findMany({ where: { organizationId }, include: { steps: { orderBy: { order: 'asc' } } } }); }
 async deactivate(user: TenantJwtUser, id: string) {
   await this.manage(user);
   const workflow = await this.prisma.leaveApprovalWorkflow.findFirst({ where: { id, organizationId: user.organizationId } });
   if (!workflow) throw new NotFoundException('Leave workflow not found');
   const changed = await this.prisma.leaveApprovalWorkflow.update({ where: { id }, data: { isActive: false } });
   await this.log(user,'LeaveApprovalWorkflow',id,'LEAVE_WORKFLOW_DEACTIVATED'); return changed;
 }
 async delegate(user: TenantJwtUser, dto: CreateDelegationDto) {
   await this.manage(user);
   const from = calendarDate(dto.effectiveFrom), to = calendarDate(dto.effectiveTo);
   if (to < from || dto.fromUserId === dto.toUserId) throw new BadRequestException('Invalid delegation period or users');
   const users = await this.prisma.user.findMany({ where: { id: { in: [dto.fromUserId,dto.toUserId] }, organizationId: user.organizationId, isActive: true } });
   if (users.length !== 2) throw new NotFoundException('Both delegation users must be active in this company');
   const delegation = await this.prisma.leaveApprovalDelegation.create({ data: { organizationId: user.organizationId, fromUserId: dto.fromUserId, toUserId: dto.toUserId, effectiveFrom: from, effectiveTo: to, createdByUserId: user.sub } });
   await this.log(user,'LeaveApprovalDelegation',delegation.id,'LEAVE_APPROVAL_DELEGATED'); return delegation;
 }
 async decisions(user: TenantJwtUser, requestId: string) {
   await this.viewer(user,requestId);
   return this.prisma.leaveApprovalDecision.findMany({ where: { requestId, request: { organizationId: user.organizationId } }, include: { step: true }, orderBy: { step: { order: 'asc' } } });
 }
 async queue(user: TenantJwtUser) {
   const today = calendarDate(new Date().toISOString().slice(0,10));
   const delegated = await this.prisma.leaveApprovalDelegation.findMany({ where: { organizationId: user.organizationId, toUserId: user.sub, effectiveFrom: { lte: today }, effectiveTo: { gte: today } }, select: { fromUserId: true } });
   const ids = [user.sub,...delegated.map(d=>d.fromUserId)];
   const items = await this.prisma.leaveApprovalDecision.findMany({ where: { status: LeaveDecisionStatus.PENDING, request: { organizationId: user.organizationId, status: 'PENDING' }, step: { approverUserId: { in: ids } } }, include: { step: true, request: { include: { decisions: { include: { step: true } } } } }, take: 200 });
   return items.filter(item => priorStepsApproved(item.request.decisions.map(d => ({ order: d.step.order, status: d.status })),item.step.order));
 }
 async decide(user: TenantJwtUser, id: string, dto: DecisionDto) {
   if (dto.status === LeaveDecisionStatus.PENDING || !dto.comment?.trim() && dto.status === LeaveDecisionStatus.REJECTED) throw new BadRequestException('Approve or reject; rejection needs a reason');
   const decision = await this.prisma.leaveApprovalDecision.findFirst({ where: { id, request: { organizationId: user.organizationId } }, include: { step: true, request: { include: { employee: true, decisions: { include: { step: true } } } } } });
   if (!decision) throw new NotFoundException('Approval step not found');
   const expected = decision.step.approverUserId;
   const today = calendarDate(new Date().toISOString().slice(0,10));
   const delegate = expected !== user.sub && await this.prisma.leaveApprovalDelegation.findFirst({ where: { organizationId: user.organizationId, fromUserId: expected, toUserId: user.sub, effectiveFrom: { lte: today }, effectiveTo: { gte: today } } });
   if (expected !== user.sub && !delegate) throw new ForbiddenException('Approval step is not assigned to you');
   if (decision.request.employee.userId === user.sub) throw new ForbiddenException('You cannot approve your own leave');
   const required = decision.step.kind === LeaveApproverKind.MANAGER ? Permission.APPROVE_TEAM_LEAVE : Permission.MANAGE_LEAVE;
   if (!(await this.access.hasPermission(user,required))) throw new ForbiddenException('Approver permission required');
   if (decision.status !== LeaveDecisionStatus.PENDING || decision.request.status !== 'PENDING') throw new ConflictException('Approval step is closed');
   if (!priorStepsApproved(decision.request.decisions.map(d => ({ order: d.step.order, status: d.status })),decision.step.order)) throw new ConflictException('Earlier approval steps must finish first');
   const policy = await this.policy.policyFor(user.organizationId,decision.request.employeeId,decision.request.leaveTypeId,decision.request.startDate);
   const dayCount = await this.policy.workingDays(user.organizationId,policy,decision.request.startDate,decision.request.endDate);
   if (dto.status === LeaveDecisionStatus.APPROVED && (policy.supportingDocumentRequired || policy.medicalCertificateAfterDays && dayCount >= policy.medicalCertificateAfterDays)) {
     const docs = await this.prisma.leaveDocument.findMany({ where: { organizationId: user.organizationId, requestId: decision.requestId }, select: { kind: true } });
     if (!requirementsMet(policy.supportingDocumentRequired,policy.medicalCertificateAfterDays,dayCount,docs.map(d=>d.kind))) throw new ConflictException('Required supporting document is missing');
   }
   const next = decision.request.decisions.filter(d=>d.step.order > decision.step.order).sort((a,b)=>a.step.order-b.step.order)[0];
   const result = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${decision.request.employeeId + ':' + decision.request.leaveTypeId}))`;
     const current = await tx.leaveApprovalDecision.findFirst({ where: { id, status: LeaveDecisionStatus.PENDING, request: { organizationId: user.organizationId, status: 'PENDING' } } });
     if (!current) throw new ConflictException('Approval step changed concurrently');
     const updated = await tx.leaveApprovalDecision.update({ where: { id }, data: { status: dto.status, decidedByUserId: user.sub, comment: dto.comment?.trim(), decidedAt: new Date() } });
     if (dto.status === LeaveDecisionStatus.REJECTED) await tx.leaveRequest.update({ where: { id: decision.requestId }, data: { status: 'REJECTED' } });
     else if (!next) await this.leave.finalizeWorkflowApproval(user,decision.requestId,tx);
     const recipient = dto.status === LeaveDecisionStatus.APPROVED && next ? next.step.approverUserId : decision.request.employee.userId;
     if (recipient) await tx.leaveNotification.create({ data: { organizationId: user.organizationId, requestId: decision.requestId, recipientUserId: recipient, message: dto.status === LeaveDecisionStatus.REJECTED ? 'Leave request rejected' : next ? 'Leave request awaiting your approval' : 'Leave request approved' } });
     return updated;
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
   await this.log(user,'LeaveApprovalDecision',id,dto.status === LeaveDecisionStatus.APPROVED ? 'LEAVE_STEP_APPROVED' : 'LEAVE_STEP_REJECTED',dto.comment?.trim()); return result;
 }
 async upload(user: TenantJwtUser, requestId: string, kind: LeaveDocumentKind, file: Express.Multer.File) {
   await this.ownerOrHR(user,requestId);
   const key = await this.storage.store(user.organizationId,requestId,file);
   const document = await this.prisma.leaveDocument.create({ data: { organizationId: user.organizationId, requestId, kind, originalFileName: file.originalname.slice(0,255), storageKey: key, mimeType: file.mimetype, fileSizeBytes: file.size, uploadedByUserId: user.sub } });
   await this.log(user,'LeaveDocument',document.id,'LEAVE_DOCUMENT_UPLOADED'); return { id: document.id, requestId, kind, originalFileName: document.originalFileName, fileSizeBytes: document.fileSizeBytes, createdAt: document.createdAt };
 }
 async documents(user: TenantJwtUser, requestId: string) { await this.viewer(user,requestId); return this.prisma.leaveDocument.findMany({ where: { organizationId: user.organizationId, requestId }, select: { id: true, kind: true, originalFileName: true, fileSizeBytes: true, createdAt: true } }); }
 async documentFile(user: TenantJwtUser, requestId: string, id: string) {
   await this.viewer(user,requestId);
   const doc = await this.prisma.leaveDocument.findFirst({ where: { id, organizationId: user.organizationId, requestId } });
   if (!doc) throw new NotFoundException('Leave document not found');
   return { doc, bytes: await this.storage.read(doc.storageKey) };
 }
 async comment(user: TenantJwtUser, requestId: string, dto: CommentDto) {
   const { hr } = await this.ownerOrHR(user,requestId);
   if (dto.internal && !hr) throw new ForbiddenException('Internal notes are for HR');
   const text = dto.text?.trim(); if (!text) throw new BadRequestException('Comment required');
   const comment = await this.prisma.leaveComment.create({ data: { requestId, actorUserId: user.sub, text, internal: dto.internal ?? false } });
   await this.log(user,'LeaveComment',comment.id,'LEAVE_COMMENT_ADDED'); return comment;
 }
 async comments(user: TenantJwtUser, requestId: string) { const { hr } = await this.ownerOrHR(user,requestId); return this.prisma.leaveComment.findMany({ where: { requestId, ...(hr ? {} : { internal: false }) }, orderBy: { createdAt: 'asc' } }); }
 private async commentsForViewer(user: TenantJwtUser, requestId: string) {
   const { hr } = await this.viewer(user,requestId);
   return this.prisma.leaveComment.findMany({ where: { requestId, ...(hr ? {} : { internal: false }) }, orderBy: { createdAt: 'asc' } });
 }
 async history(user: TenantJwtUser, requestId: string) {
   await this.viewer(user,requestId);
   const [decisions,comments,changes,documents] = await Promise.all([this.decisions(user,requestId),this.commentsForViewer(user,requestId),this.prisma.leaveChangeRequest.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } }),this.documents(user,requestId)]);
   return { decisions, comments, changes, documents };
 }
 async notify(user: TenantJwtUser) { return this.prisma.leaveNotification.findMany({ where: { organizationId: user.organizationId, recipientUserId: user.sub }, orderBy: { createdAt: 'desc' }, take: 100 }); }
 async readNotification(user: TenantJwtUser, id: string) {
   const changed = await this.prisma.leaveNotification.updateMany({ where: { id, organizationId: user.organizationId, recipientUserId: user.sub, readAt: null }, data: { readAt: new Date() } });
   if (!changed.count) throw new NotFoundException('Unread notification not found'); return { read: true };
 }
 async requestChange(user: TenantJwtUser, requestId: string, dto: ChangeDto) {
   const { request } = await this.ownerOrHR(user,requestId);
   if (request.status !== 'APPROVED') throw new ConflictException('Only approved leave may be changed');
   const reason = dto.reason?.trim(); if (!reason) throw new BadRequestException('Reason required');
   let from: Date | undefined, to: Date | undefined;
   if (dto.kind === LeaveChangeKind.AMENDMENT) { if (!dto.proposedStart || !dto.proposedEnd) throw new BadRequestException('Amendment dates required'); from = calendarDate(dto.proposedStart); to = calendarDate(dto.proposedEnd); if (to < from || (to.getTime()-from.getTime())/86400000 > 366) throw new BadRequestException('Invalid amendment dates'); }
   if (await this.prisma.leaveChangeRequest.findFirst({ where: { requestId, status: LeaveChangeStatus.PENDING } })) throw new ConflictException('A change is already pending');
   const change = await this.prisma.leaveChangeRequest.create({ data: { requestId, kind: dto.kind, proposedStart: from, proposedEnd: to, reason, requestedByUserId: user.sub } });
   await this.log(user,'LeaveChangeRequest',change.id,'LEAVE_CHANGE_REQUESTED',reason); return change;
 }
 async reviewChange(user: TenantJwtUser, id: string, dto: ReviewChangeDto) {
   await this.manage(user);
   if (dto.status === LeaveChangeStatus.PENDING || !dto.note?.trim()) throw new BadRequestException('Review decision and note required');
   const change = await this.prisma.leaveChangeRequest.findFirst({ where: { id, request: { organizationId: user.organizationId } }, include: { request: true } });
   if (!change) throw new NotFoundException('Leave change not found');
   if (change.status !== LeaveChangeStatus.PENDING) throw new ConflictException('Change already reviewed');
   const request = change.request;
   const oldBreakdown = (request.chargeBreakdown ?? {}) as Record<string,number>;
   if (!request.chargeBreakdown && request.chargedDays != null) oldBreakdown[request.startDate.getUTCFullYear()] = request.chargedDays;
   let newBreakdown: Record<string,number> = {};
   if (dto.status === LeaveChangeStatus.APPROVED && change.kind === LeaveChangeKind.AMENDMENT) {
     const from = change.proposedStart!, to = change.proposedEnd!;
     if (await this.prisma.leaveRequest.findFirst({ where: { organizationId: user.organizationId, employeeId: request.employeeId, id: { not: request.id }, status: { in: ['PENDING','APPROVED'] }, startDate: { lte: to }, endDate: { gte: from } } })) throw new ConflictException('Amended leave overlaps another request');
     for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
       const segmentStart = new Date(Math.max(from.getTime(),Date.UTC(year,0,1))), segmentEnd = new Date(Math.min(to.getTime(),Date.UTC(year,11,31)));
       const policy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,segmentStart);
       const days = await this.policy.workingDays(user.organizationId,policy,segmentStart,segmentEnd);
       if (days) newBreakdown[year] = days;
     }
     if (!Object.values(newBreakdown).reduce((a,b)=>a+b,0)) throw new BadRequestException('Amendment contains no working days');
     const policy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,from);
     const employee = await this.prisma.employee.findFirst({ where: { id: request.employeeId, organizationId: user.organizationId }, select: { employmentStartDate: true } });
     if (employee?.employmentStartDate && policy.probationMonths > 0) {
       const probationEnd = new Date(employee.employmentStartDate); probationEnd.setUTCMonth(probationEnd.getUTCMonth()+policy.probationMonths);
       if (from < probationEnd) throw new BadRequestException('Amended leave begins during probation');
     }
     const days = Object.values(newBreakdown).reduce((a,b)=>a+b,0);
     const kinds = await this.prisma.leaveDocument.findMany({ where: { organizationId: user.organizationId, requestId: request.id }, select: { kind: true } });
     if (!requirementsMet(policy.supportingDocumentRequired,policy.medicalCertificateAfterDays,days,kinds.map(d=>d.kind))) throw new ConflictException('Required supporting document is missing');
   }
   const updated = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${request.employeeId + ':' + request.leaveTypeId}))`;
     const current = await tx.leaveChangeRequest.findFirst({ where: { id, status: LeaveChangeStatus.PENDING } });
     if (!current) throw new ConflictException('Change already reviewed');
     if (dto.status === LeaveChangeStatus.APPROVED) {
       for (const [year,days] of Object.entries(newBreakdown)) {
         const asOf = new Date(Math.min(change.proposedEnd!.getTime(),Date.UTC(Number(year),11,31)));
         const balance = await this.policy.balance(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
         const policy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
         if (balance.available + Number(oldBreakdown[year] ?? 0) - days < -policy.maxNegativeDays) throw new ConflictException(`Insufficient leave balance for ${year}`);
       }
       if (change.kind === LeaveChangeKind.CANCELLATION) await tx.leaveRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' } });
       else await tx.leaveRequest.update({ where: { id: request.id }, data: { startDate: change.proposedStart!, endDate: change.proposedEnd!, chargedDays: Object.values(newBreakdown).reduce((a,b)=>a+b,0), chargeBreakdown: newBreakdown } });
     }
     const reviewed = await tx.leaveChangeRequest.update({ where: { id }, data: { status: dto.status, reviewNote: dto.note.trim(), reviewedByUserId: user.sub, reviewedAt: new Date() } });
     const recipient = await tx.employee.findUnique({ where: { id: request.employeeId }, select: { userId: true } });
     if (recipient?.userId) await tx.leaveNotification.create({ data: { organizationId: user.organizationId, requestId: request.id, recipientUserId: recipient.userId, message: `Leave change ${dto.status.toLowerCase()}` } });
     return reviewed;
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
   await this.log(user,'LeaveChangeRequest',id,'LEAVE_CHANGE_REVIEWED',dto.note.trim()); return updated;
 }
}
