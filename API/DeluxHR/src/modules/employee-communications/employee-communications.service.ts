import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { AnnouncementDto, TeamDto } from './employee-communications.dto';
const root = () => join(process.env.DELUXHR_STORAGE_ROOT||join(process.cwd(),'storage'),'announcements');
@Injectable()
export class EmployeeCommunicationsService {
 constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}
 private async employee(actor: TenantJwtUser) {
  const employee = await this.db.employee.findFirst({ where: { organizationId: actor.organizationId, userId: actor.sub, status: EmployeeStatus.ACTIVE }, select: { id: true } });
  if (!employee) throw new ForbiddenException('An active linked employee account is required');
  return employee.id;
 }
 private async event(actor: TenantJwtUser,id: string,type: string,tx?: Prisma.TransactionClient) {
  const client = tx ?? this.db;
  await client.announcementEvent.create({ data: { announcementId: id, actorUserId: actor.sub, type } });
  await this.audit.log({ organizationId: actor.organizationId, action: `ANNOUNCEMENT_${type}`, entity: 'WorkforceAnnouncement', entityId: id, actorUserId: actor.sub, actorEmail: actor.email, actorRole: actor.role },client);
 }
 async teams(actor: TenantJwtUser) { return this.db.communicationTeam.findMany({ where: { organizationId: actor.organizationId }, include: { members: true }, orderBy: { name: 'asc' } }); }
 async team(actor: TenantJwtUser,dto: TeamDto) {
  const count = await this.db.employee.count({ where: { id: { in: dto.employeeIds }, organizationId: actor.organizationId, status: EmployeeStatus.ACTIVE } });
  if (count !== dto.employeeIds.length) throw new BadRequestException('Team members must be active employees in this company');
  return this.db.communicationTeam.create({ data: { organizationId: actor.organizationId, name: dto.name.trim(), members: { create: dto.employeeIds.map(employeeId => ({ employeeId })) } }, include: { members: true } });
 }
 async updateTeam(actor: TenantJwtUser,id: string,dto: TeamDto) {
  const team = await this.db.communicationTeam.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!team) throw new NotFoundException('Team not found');
  const count = await this.db.employee.count({ where: { id: { in: dto.employeeIds }, organizationId: actor.organizationId, status: EmployeeStatus.ACTIVE } });
  if (count !== dto.employeeIds.length) throw new BadRequestException('Team members must be active employees in this company');
  return this.db.$transaction(async tx => {
   await tx.communicationTeamMember.deleteMany({ where: { teamId: id } });
   await tx.communicationTeamMember.createMany({ data: dto.employeeIds.map(employeeId => ({ teamId: id, employeeId })) });
   return tx.communicationTeam.update({ where: { id }, data: { name: dto.name.trim() }, include: { members: true } });
  });
 }
 async recipients(actor: TenantJwtUser,dto: AnnouncementDto) {
  if ((dto.audience === 'DEPARTMENT') !== !!dto.departmentId || (dto.audience === 'LOCATION') !== !!dto.workLocationId || (dto.audience === 'TEAM') !== !!dto.teamId) throw new BadRequestException('Exactly the target field for the selected audience is required');
  if (dto.departmentId && !(await this.db.department.findFirst({ where: { id: dto.departmentId, organizationId: actor.organizationId } }))) throw new BadRequestException('Department not found in company');
  if (dto.workLocationId && !(await this.db.workLocation.findFirst({ where: { id: dto.workLocationId, organizationId: actor.organizationId } }))) throw new BadRequestException('Location not found in company');
  if (dto.teamId && !(await this.db.communicationTeam.findFirst({ where: { id: dto.teamId, organizationId: actor.organizationId } }))) throw new BadRequestException('Team not found in company');
  const now = new Date();
  const where: Prisma.EmployeeWhereInput = { organizationId: actor.organizationId, status: EmployeeStatus.ACTIVE, userId: { not: null } };
  if (dto.departmentId) where.departmentId = dto.departmentId;
  if (dto.teamId) where.communicationMemberships = { some: { teamId: dto.teamId } };
  if (dto.workLocationId) where.workLocationAssignments = { some: { workLocationId: dto.workLocationId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } };
  return this.db.employee.findMany({ where, select: { id: true } });
 }
 async create(actor: TenantJwtUser,dto: AnnouncementDto) {
  const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
  const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
  if (expiresAt && expiresAt <= publishedAt) throw new BadRequestException('Expiry must be after publication');
  const audience = await this.recipients(actor,dto);
  if (!audience.length) throw new BadRequestException('Audience has no active portal employees');
  return this.db.$transaction(async tx => {
   const announcement = await tx.workforceAnnouncement.create({ data: { organizationId: actor.organizationId, title: dto.title.trim(), body: dto.body.trim(), audience: dto.audience, departmentId: dto.departmentId, workLocationId: dto.workLocationId, teamId: dto.teamId, createdByUserId: actor.sub, publishedAt, expiresAt, important: dto.important ?? false, pinned: dto.pinned ?? false, requiresAcknowledgement: dto.requiresAcknowledgement ?? false, recipients: { create: audience.map(({ id }) => ({ employeeId: id })) } } });
   await this.event(actor,announcement.id,'CREATED',tx); return { ...announcement, recipientCount: audience.length };
  });
 }
 async visible(actor: TenantJwtUser,id: string) {
  const employeeId = await this.employee(actor);
  const receipt = await this.db.announcementReceipt.findFirst({ where: { announcementId: id, employeeId, announcement: { organizationId: actor.organizationId, isActive: true, publishedAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }, include: { announcement: { include: { attachments: { select: { id: true, name: true, mimeType: true, byteSize: true } } } } } });
  if (!receipt) throw new NotFoundException('Announcement not found');
  return receipt;
 }
 async inbox(actor: TenantJwtUser,includeRead = true) {
  const now = new Date();
  return this.db.announcementReceipt.findMany({ where: { employeeId: await this.employee(actor), ...(includeRead ? {} : { readAt: null }), announcement: { organizationId: actor.organizationId, isActive: true, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }, include: { announcement: { include: { attachments: { select: { id: true, name: true, mimeType: true, byteSize: true } } } } }, orderBy: [{ announcement: { pinned: 'desc' } }, { announcement: { publishedAt: 'desc' } }], take: 200 });
 }
 async mark(actor: TenantJwtUser,id: string,acknowledge = false) {
  const receipt = await this.visible(actor,id);
  if (acknowledge && !receipt.announcement.requiresAcknowledgement) throw new BadRequestException('Acknowledgement is not required');
  if (acknowledge && receipt.acknowledgedAt || !acknowledge && receipt.readAt) return receipt;
  const now = new Date();
  return this.db.$transaction(async tx => {
   const updated = await tx.announcementReceipt.update({ where: { id: receipt.id }, data: { readAt: receipt.readAt ?? now, ...(acknowledge ? { acknowledgedAt: now } : {}) } });
   await this.event(actor,id,acknowledge ? 'ACKNOWLEDGED' : 'READ',tx); return updated;
  });
 }
 async list(actor: TenantJwtUser) {
  return this.db.workforceAnnouncement.findMany({ where: { organizationId: actor.organizationId }, include: { _count: { select: { recipients: true } } }, orderBy: { publishedAt: 'desc' }, take: 200 });
 }
 async detail(actor: TenantJwtUser,id: string) {
  const announcement = await this.db.workforceAnnouncement.findFirst({ where: { id, organizationId: actor.organizationId }, include: { recipients: { select: { employeeId: true, readAt: true, acknowledgedAt: true } }, events: { orderBy: { createdAt: 'asc' } }, attachments: { select: { id: true, name: true, mimeType: true, byteSize: true } } } });
  if (!announcement) throw new NotFoundException('Announcement not found'); return announcement;
 }
 async state(actor: TenantJwtUser,id: string,isActive: boolean) {
  await this.detail(actor,id);
  return this.db.$transaction(async tx => { const updated = await tx.workforceAnnouncement.update({ where: { id }, data: { isActive } }); await this.event(actor,id,isActive ? 'ACTIVATED' : 'DEACTIVATED',tx); return updated; });
 }
 async attach(actor: TenantJwtUser,id: string,file: Express.Multer.File) {
  const announcement = await this.detail(actor,id);
  if (!announcement.isActive) throw new BadRequestException('Inactive announcements cannot receive attachments');
  if (!file?.buffer || !file.size || file.size > 10*1024*1024) throw new BadRequestException('A file up to 10 MB is required');
  const bytes = file.buffer;
  const mime = bytes.subarray(0,4).toString('hex') === '25504446' ? 'application/pdf' : bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : bytes.subarray(0,3).toString('hex') === 'ffd8ff' ? 'image/jpeg' : null;
  if (!mime) throw new BadRequestException('Only PDF, PNG or JPEG files are accepted');
  const key = randomUUID(); await mkdir(join(root(),actor.organizationId,id),{ recursive: true }); await writeFile(join(root(),actor.organizationId,id,key),bytes,{ flag: 'wx' });
  const attachment = await this.db.announcementAttachment.create({ data: { announcementId: id, name: file.originalname.slice(0,200), mimeType: mime, byteSize: file.size, storageKey: key } });
  await this.event(actor,id,'ATTACHMENT_ADDED'); return { id: attachment.id, name: attachment.name, mimeType: mime, byteSize: file.size };
 }
 async download(actor: TenantJwtUser,id: string,attachmentId: string,staff = false) {
  if (staff) await this.detail(actor,id); else await this.visible(actor,id);
  const attachment = await this.db.announcementAttachment.findFirst({ where: { id: attachmentId, announcementId: id } });
  if (!attachment) throw new NotFoundException('Attachment not found');
  return { attachment, bytes: await readFile(join(root(),actor.organizationId,id,attachment.storageKey)) };
 }
 async whatsapp(actor: TenantJwtUser) {
  const messages = await this.inbox(actor);
  return messages.slice(0,3).map(r => `${r.announcement.title}: ${r.announcement.body}`).join('\n') || 'No current announcements.';
 }
}
