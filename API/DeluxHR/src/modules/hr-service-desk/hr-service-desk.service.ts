import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CategoryDto, CommentDto, CreateRequestDto, QueueDto } from './hr-service-desk.dto';

const transitions: Record<string,string[]> = { OPEN: ['IN_PROGRESS'], IN_PROGRESS: ['RESOLVED'], RESOLVED: ['OPEN','CLOSED'], CLOSED: [] };
const hours = (date: Date, n: number) => new Date(date.getTime()+n*3600000);
const storageRoot = () => join(process.env.DELUXHR_STORAGE_ROOT||join(process.cwd(),'storage'),'hr-service-desk');
@Injectable()
export class HrServiceDeskService {
 constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}
 private async event(actor: TenantJwtUser, requestId: string, type: string, detail?: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? this.db;
  await client.hrRequestEvent.create({ data: { requestId, actorUserId: actor.sub, type, detail } });
  await this.audit.log({ organizationId: actor.organizationId, action: `HR_REQUEST_${type}`, entity: 'HrServiceRequest', entityId: requestId, actorUserId: actor.sub, actorEmail: actor.email, actorRole: actor.role, reason: detail },client);
 }
 private async employee(actor: TenantJwtUser) {
  const employee = await this.db.employee.findFirst({ where: { organizationId: actor.organizationId, userId: actor.sub }, select: { id: true } });
  if (!employee) throw new ForbiddenException('A linked employee account is required');
  return employee.id;
 }
 private async request(actor: TenantJwtUser, id: string, staff = false) {
  const request = await this.db.hrServiceRequest.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!request) throw new NotFoundException('HR request not found');
  if (!staff && request.employeeId !== await this.employee(actor)) throw new NotFoundException('HR request not found');
  return request;
 }
 private async assignee(actor: TenantJwtUser, id: string) {
  const user = await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId, role: { in: [UserRole.HR_ADMIN,UserRole.COMPANY_ADMIN] } } });
  if (!user) throw new BadRequestException('Assignee must be an HR or company administrator in this company');
 }
 async categories(org: string) { return this.db.hrRequestCategory.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }); }
 async category(actor: TenantJwtUser, dto: CategoryDto) {
  if (dto.responseSlaHours > dto.resolutionSlaHours) throw new BadRequestException('Response SLA cannot exceed resolution SLA');
  return this.db.hrRequestCategory.upsert({ where: { organizationId_code: { organizationId: actor.organizationId, code: dto.code } }, create: { ...dto, organizationId: actor.organizationId }, update: { name: dto.name, responseSlaHours: dto.responseSlaHours, resolutionSlaHours: dto.resolutionSlaHours, isActive: dto.isActive ?? true } });
 }
 async create(actor: TenantJwtUser, dto: CreateRequestDto) {
  return this.createForEmployee(actor,await this.employee(actor),dto);
 }
 async createForEmployee(actor: TenantJwtUser, employeeId: string, dto: CreateRequestDto) {
  const employee = await this.db.employee.findFirst({ where: { id: employeeId, organizationId: actor.organizationId, userId: actor.sub } });
  if (!employee) throw new ForbiddenException('Employee identity does not match account');
  const category = dto.categoryId ? await this.db.hrRequestCategory.findFirst({ where: { id: dto.categoryId, organizationId: actor.organizationId, isActive: true } }) : null;
  if (dto.categoryId && !category) throw new BadRequestException('Category is not active in this company');
  const now = new Date();
  return this.db.$transaction(async tx => {
   const request = await tx.hrServiceRequest.create({ data: { organizationId: actor.organizationId, employeeId, reference: `HR-${randomBytes(12).toString('hex').toUpperCase()}`, category: category?.code ?? 'GENERAL', categoryId: category?.id, summary: dto.summary.trim(), responseDueAt: hours(now,category?.responseSlaHours ?? 24), resolutionDueAt: hours(now,category?.resolutionSlaHours ?? 72) } });
   await this.event(actor,request.id,'CREATED',undefined,tx);
   return request;
  });
 }
 async mine(actor: TenantJwtUser) { return this.db.hrServiceRequest.findMany({ where: { organizationId: actor.organizationId, employeeId: await this.employee(actor) }, orderBy: { createdAt: 'desc' }, take: 100 }); }
 async detail(actor: TenantJwtUser, id: string, staff = false) {
  await this.request(actor,id,staff);
  return this.db.hrServiceRequest.findUnique({ where: { id }, include: { comments: { where: staff ? {} : { internal: false }, orderBy: { createdAt: 'asc' } }, attachments: { where: staff ? {} : { internal: false }, select: { id: true, name: true, mimeType: true, byteSize: true, internal: true, createdAt: true } }, events: { where: staff ? {} : { type: { in: ['CREATED','STATUS_CHANGED','COMMENTED','ATTACHMENT_ADDED'] } }, orderBy: { createdAt: 'asc' } } } });
 }
 async queue(actor: TenantJwtUser, dto: QueueDto) {
  const now = new Date();
  const where: Prisma.HrServiceRequestWhereInput = { organizationId: actor.organizationId, status: dto.status, priority: dto.priority, assignedToUserId: dto.assignee, categoryId: dto.categoryId };
  if (dto.overdue === 'true') where.OR = [{ firstResponseAt: null, responseDueAt: { lt: now } }, { status: { in: ['OPEN','IN_PROGRESS'] }, resolutionDueAt: { lt: now } }];
  return this.db.hrServiceRequest.findMany({ where, orderBy: [{ createdAt: 'asc' }], take: 200 });
 }
 async assign(actor: TenantJwtUser, id: string, userId: string, escalate?: string) {
  await this.request(actor,id,true); await this.assignee(actor,userId);
  return this.db.$transaction(async tx => {
   const current = await tx.hrServiceRequest.findFirst({ where: { id, organizationId: actor.organizationId } });
   if (!current) throw new NotFoundException('HR request not found');
   if (current.status === 'CLOSED') throw new BadRequestException('Closed requests cannot be assigned');
   const updated = await tx.hrServiceRequest.update({ where: { id }, data: { assignedToUserId: userId, ...(escalate ? { escalationLevel: { increment: 1 }, escalatedAt: new Date() } : {}) } });
   await this.event(actor,id,escalate ? 'ESCALATED' : 'ASSIGNED',escalate ?? `Assigned to ${userId}`,tx); return updated;
  });
 }
 async priority(actor: TenantJwtUser,id: string,priority: string) {
  await this.request(actor,id,true);
  return this.db.$transaction(async tx => { const r = await tx.hrServiceRequest.update({ where: { id }, data: { priority } }); await this.event(actor,id,'PRIORITY_CHANGED',priority,tx); return r; });
 }
 async status(actor: TenantJwtUser,id: string,status: string) {
  await this.request(actor,id,true);
  return this.db.$transaction(async tx => {
   const current = await tx.hrServiceRequest.findFirst({ where: { id, organizationId: actor.organizationId } });
   if (!current) throw new NotFoundException('HR request not found');
   if (!transitions[current.status]?.includes(status)) throw new BadRequestException(`Invalid status transition from ${current.status} to ${status}`);
   const now = new Date();
   const r = await tx.hrServiceRequest.update({ where: { id }, data: { status, firstResponseAt: current.firstResponseAt ?? now, resolvedAt: status === 'RESOLVED' ? now : status === 'OPEN' ? null : current.resolvedAt, closedAt: status === 'CLOSED' ? now : null } });
   await this.event(actor,id,'STATUS_CHANGED',`${current.status} → ${status}`,tx); return r;
  });
 }
 async comment(actor: TenantJwtUser,id: string,dto: CommentDto,staff = false) {
  const request = await this.request(actor,id,staff);
  if (request.status === 'CLOSED') throw new BadRequestException('Closed requests cannot receive comments');
  if (dto.internal && !staff) throw new ForbiddenException('Internal notes are restricted to HR');
  return this.db.$transaction(async tx => {
   const comment = await tx.hrRequestComment.create({ data: { requestId: id, actorUserId: actor.sub, body: dto.body.trim(), internal: staff && !!dto.internal } });
   if (staff && !dto.internal && !request.firstResponseAt) await tx.hrServiceRequest.update({ where: { id }, data: { firstResponseAt: new Date() } });
   await this.event(actor,id,staff && dto.internal ? 'INTERNAL_NOTE' : 'COMMENTED',undefined,tx); return comment;
  });
 }
 async attach(actor: TenantJwtUser,id: string,file: Express.Multer.File,staff = false,internal = false) {
  await this.request(actor,id,staff);
  if (internal && !staff) throw new ForbiddenException('Internal attachments are restricted to HR');
  if (!file?.buffer || file.size > 10*1024*1024 || file.size === 0) throw new BadRequestException('A file up to 10 MB is required');
  const b = file.buffer;
  const mime = b.subarray(0,4).toString('hex') === '25504446' ? 'application/pdf' : b.subarray(0,8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : b.subarray(0,3).toString('hex') === 'ffd8ff' ? 'image/jpeg' : null;
  if (!mime) throw new BadRequestException('Only PDF, PNG or JPEG files are accepted');
  const key = randomUUID();
  await mkdir(join(storageRoot(),actor.organizationId,id),{ recursive: true });
  await writeFile(join(storageRoot(),actor.organizationId,id,key),b,{ flag: 'wx' });
  const attachment = await this.db.hrRequestAttachment.create({ data: { requestId: id, actorUserId: actor.sub, name: file.originalname.slice(0,200), mimeType: mime, byteSize: file.size, storageKey: key, internal: staff && internal } });
  await this.event(actor,id,'ATTACHMENT_ADDED',attachment.id); return { id: attachment.id, name: attachment.name, mimeType: mime, byteSize: file.size };
 }
 async download(actor: TenantJwtUser,id: string,attachmentId: string,staff = false) {
  await this.request(actor,id,staff);
  const attachment = await this.db.hrRequestAttachment.findFirst({ where: { id: attachmentId, requestId: id, ...(!staff ? { internal: false } : {}) } });
  if (!attachment) throw new NotFoundException('Attachment not found');
  return { attachment, bytes: await readFile(join(storageRoot(),actor.organizationId,id,attachment.storageKey)) };
 }
 async report(actor: TenantJwtUser) {
  const requests = await this.db.hrServiceRequest.findMany({ where: { organizationId: actor.organizationId }, select: { status: true, priority: true, createdAt: true, firstResponseAt: true, responseDueAt: true, resolutionDueAt: true, resolvedAt: true, category: true } });
  const now = new Date(), counts: Record<string,number> = {}, priorities: Record<string,number> = {}, categories: Record<string,number> = {};
  for (const r of requests) { counts[r.status] = (counts[r.status] ?? 0)+1; priorities[r.priority] = (priorities[r.priority] ?? 0)+1; categories[r.category] = (categories[r.category] ?? 0)+1; }
  const resolved = requests.filter(r => r.resolvedAt);
  return { total: requests.length, byStatus: counts, byPriority: priorities, byCategory: categories, responseBreaches: requests.filter(r => r.responseDueAt && (r.firstResponseAt ?? now) > r.responseDueAt).length, resolutionBreaches: requests.filter(r => r.resolutionDueAt && (r.resolvedAt ?? now) > r.resolutionDueAt).length, averageResolutionHours: resolved.length ? resolved.reduce((n,r) => n+(r.resolvedAt!.getTime()-r.createdAt.getTime())/3600000,0)/resolved.length : null };
 }
}
