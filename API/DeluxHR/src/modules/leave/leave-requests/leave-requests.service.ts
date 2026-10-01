import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccessControlService } from '../../../common/access/access-control.service';
import { Permission } from '@prisma/client';
import { LeavePolicyService } from '../leave-policy/leave-policy.service';
import { calendarDate } from '../../recurring-schedules/recurring-schedules.service';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
@Injectable()
export class LeaveRequestsService {
 constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly policy: LeavePolicyService, private readonly access: AccessControlService) {}
 async create(user: TenantJwtUser, dto: CreateLeaveRequestDto) {
   const canManage = await this.access.hasPermission(user,Permission.MANAGE_LEAVE);
   if (!canManage && !(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId, userId: user.sub } }))) throw new ForbiddenException('You may only request your own leave');
   const startDate = calendarDate(dto.startDate), endDate = calendarDate(dto.endDate);
   if (endDate < startDate || (endDate.getTime()-startDate.getTime())/86400000 > 366) throw new BadRequestException('Invalid leave date range');
   const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId } });
   if (!employee) throw new NotFoundException('Employee not found');
   if (!(await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, organizationId: user.organizationId } }))) throw new NotFoundException('Leave type not found');
   const policy = await this.policy.policyFor(user.organizationId,dto.employeeId,dto.leaveTypeId,startDate);
   const days = await this.policy.workingDays(user.organizationId,policy,startDate,endDate);
   if (!days) throw new BadRequestException('Requested leave contains no working days');
   const workflow = await this.prisma.leaveApprovalWorkflow.findFirst({ where: { organizationId: user.organizationId, leaveTypeId: dto.leaveTypeId, isActive: true }, include: { steps: { orderBy: { order: 'asc' } } } });
   const request = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${dto.employeeId}))`;
     if (await tx.leaveRequest.findFirst({ where: { organizationId: user.organizationId, employeeId: dto.employeeId, status: { in: ['PENDING','APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } } })) throw new ConflictException('Employee has overlapping pending or approved leave');
     const created = await tx.leaveRequest.create({ data: { organizationId: user.organizationId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, startDate, endDate, status: 'PENDING', policyId: policy.id, approvalWorkflowId: workflow?.id } });
     if (workflow) {
       for (const step of workflow.steps) await tx.leaveApprovalDecision.create({ data: { requestId: created.id, stepId: step.id } });
       if (workflow.steps[0]) await tx.leaveNotification.create({ data: { organizationId: user.organizationId, requestId: created.id, recipientUserId: workflow.steps[0].approverUserId, message: 'Leave request awaiting your approval' } });
     }
     return created;
   });
   await this.audit.log({ organizationId: user.organizationId, action: 'LEAVE_REQUEST_SUBMITTED', entity: 'LeaveRequest', entityId: request.id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
   return { ...request, requestedWorkingDays: days };
 }
 async updateStatus(user: TenantJwtUser, id: string, status: 'APPROVED' | 'REJECTED') {
   const request = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId: user.organizationId }, include: { employee: true } });
   if (!request) throw new NotFoundException('Leave request not found');
   if (request.status !== 'PENDING') throw new ConflictException('Leave request already processed');
   if (request.approvalWorkflowId) throw new ConflictException('This request must follow its configured approval workflow');
   if (status === 'REJECTED') {
     const changed = await this.prisma.leaveRequest.updateMany({ where: { id, organizationId: user.organizationId, status: 'PENDING' }, data: { status: 'REJECTED' } });
     if (!changed.count) throw new ConflictException('Leave request already processed');
     await this.audit.log({ organizationId: user.organizationId, action: 'LEAVE_REQUEST_REJECTED', entity: 'LeaveRequest', entityId: id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
     return this.findOne(user.organizationId,id);
   }
   const policy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,request.startDate);
   if (request.employee.employmentStartDate && policy.probationMonths > 0) {
     const probationEnd = new Date(request.employee.employmentStartDate);
     probationEnd.setUTCMonth(probationEnd.getUTCMonth()+policy.probationMonths);
     if (request.startDate < probationEnd) throw new BadRequestException('Leave begins during the configured probation period');
   }
   const breakdown: Record<string,number> = {};
   for (let year = request.startDate.getUTCFullYear(); year <= request.endDate.getUTCFullYear(); year++) {
     const from = new Date(Math.max(request.startDate.getTime(),Date.UTC(year,0,1)));
     const to = new Date(Math.min(request.endDate.getTime(),Date.UTC(year,11,31)));
     const yearlyPolicy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,from);
     const days = await this.policy.workingDays(user.organizationId,yearlyPolicy,from,to);
     if (days) breakdown[year] = days;
   }
   const chargedDays = Object.values(breakdown).reduce((a,b)=>a+b,0);
   if (!chargedDays) throw new BadRequestException('Leave contains no working days');
   const updated = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${request.employeeId + ':' + request.leaveTypeId}))`;
     const current = await tx.leaveRequest.findFirst({ where: { id, organizationId: user.organizationId, status: 'PENDING' } });
     if (!current) throw new ConflictException('Leave request already processed');
     for (const [year,days] of Object.entries(breakdown)) {
       const asOf = new Date(Math.min(request.endDate.getTime(),Date.UTC(Number(year),11,31)));
       const balance = await this.policy.balance(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
       const yearlyPolicy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
       if (balance.available - days < -yearlyPolicy.maxNegativeDays) throw new ConflictException(`Insufficient leave balance for ${year}`);
     }
     return tx.leaveRequest.update({ where: { id }, data: { status: 'APPROVED', chargedDays, chargeBreakdown: breakdown, policyId: policy.id } });
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
   await this.audit.log({ organizationId: user.organizationId, action: 'LEAVE_REQUEST_APPROVED', entity: 'LeaveRequest', entityId: id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role, metadata: { chargedDays, breakdown, policyId: policy.id } });
   return updated;
 }
 async finalizeWorkflowApproval(user: TenantJwtUser, id: string, tx: Prisma.TransactionClient) {
   const request = await tx.leaveRequest.findFirst({ where: { id, organizationId: user.organizationId, status: 'PENDING' }, include: { employee: true } });
   if (!request) throw new ConflictException('Leave request is no longer pending');
   const policy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,request.startDate);
   if (request.employee.employmentStartDate && policy.probationMonths > 0) {
     const end = new Date(request.employee.employmentStartDate); end.setUTCMonth(end.getUTCMonth()+policy.probationMonths);
     if (request.startDate < end) throw new BadRequestException('Leave begins during probation');
   }
   const breakdown: Record<string,number> = {};
   for (let year = request.startDate.getUTCFullYear(); year <= request.endDate.getUTCFullYear(); year++) {
     const from = new Date(Math.max(request.startDate.getTime(),Date.UTC(year,0,1)));
     const to = new Date(Math.min(request.endDate.getTime(),Date.UTC(year,11,31)));
     const currentPolicy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,from);
     const days = await this.policy.workingDays(user.organizationId,currentPolicy,from,to);
     if (days) breakdown[year] = days;
   }
   const chargedDays = Object.values(breakdown).reduce((a,b)=>a+b,0);
   if (!chargedDays) throw new BadRequestException('Leave contains no working days');
   for (const [year,days] of Object.entries(breakdown)) {
     const asOf = new Date(Math.min(request.endDate.getTime(),Date.UTC(Number(year),11,31)));
     const balance = await this.policy.balance(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
     const currentPolicy = await this.policy.policyFor(user.organizationId,request.employeeId,request.leaveTypeId,asOf);
     if (balance.available - days < -currentPolicy.maxNegativeDays) throw new ConflictException(`Insufficient leave balance for ${year}`);
   }
   return tx.leaveRequest.update({ where: { id }, data: { status: 'APPROVED', chargedDays, chargeBreakdown: breakdown, policyId: policy.id } });
 }
 async list(user: TenantJwtUser) { const canManage = await this.access.hasPermission(user,Permission.MANAGE_LEAVE); return this.prisma.leaveRequest.findMany({ where: { organizationId: user.organizationId, ...(canManage ? {} : { employee: { userId: user.sub } }) }, include: { employee: true, leaveType: true }, orderBy: { startDate: 'desc' }, take: 200 }); }
 async findOne(organizationId: string, id: string, user?: TenantJwtUser) {
   const canManage = user ? await this.access.hasPermission(user,Permission.MANAGE_LEAVE) : true;
   const request = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId, ...(canManage ? {} : { employee: { userId: user!.sub } }) }, include: { employee: true, leaveType: true } });
   if (!request) throw new NotFoundException('Leave request not found'); return request;
 }
}
