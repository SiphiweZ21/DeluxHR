import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Feature, OrganizationStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../../common/auth/password';
import { ROLE_PERMISSION_PRESETS } from '../../common/access/permission-presets';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';
import { PackageDto, PlatformUserDto, SubscriptionDto, SupportSessionDto } from './dto/platform-operations.dto';
const configKeys = ['SUPPORT_SESSION_MAX_MINUTES','REGISTRATION_ENABLED','MAINTENANCE_BANNER'] as const;
@Injectable()
export class PlatformOperationsService {
 constructor(private readonly db: PrismaService) {}
 private log(tx: Prisma.TransactionClient,org: string,actor: PlatformJwtUser,action: string,entity: string,id: string,reason?: string,metadata?: Prisma.InputJsonObject) {
  return Promise.all([tx.auditLog.create({ data: { organizationId: org, action, entity, entityId: id, actorUserId: actor.sub, actorEmail: actor.email, actorRole: actor.role, reason, metadata } }),tx.platformAuditEvent.create({ data: { organizationId: org, actorUserId: actor.sub, action, entity, entityId: id, reason } })]);
 }
 private super(actor: PlatformJwtUser) { if (actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Super administrator access is required'); }
 private async org(id: string) {
  const org = await this.db.organization.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
  if (!org) throw new NotFoundException('Organization not found'); return org;
 }
 private validateFeatures(features: Feature[]) {
  if (!features.includes(Feature.CORE_HR)) throw new BadRequestException('Every package must include CORE_HR');
  if ((features.includes(Feature.PAYSLIPS) || features.includes(Feature.EARLY_PAY)) && !features.includes(Feature.PAYROLL)) throw new BadRequestException('PAYSLIPS and EARLY_PAY require PAYROLL');
 }
 async packages() { return this.db.platformPackage.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { subscriptions: true } } } }); }
 async package(actor: PlatformJwtUser,dto: PackageDto) {
  this.validateFeatures(dto.features);
  const existing = await this.db.platformPackage.findUnique({ where: { code: dto.code }, include: { _count: { select: { subscriptions: true } } } });
  if (existing?._count.subscriptions) throw new ConflictException('A subscribed package cannot be edited; create a new package code');
  return this.db.$transaction(async tx => { const pack = await tx.platformPackage.upsert({ where: { code: dto.code }, create: { ...dto, isActive: true, features: dto.features, description: dto.description?.trim() }, update: { name: dto.name.trim(), description: dto.description?.trim(), features: dto.features, employeeLimit: dto.employeeLimit, isActive: true } }); await tx.platformAuditEvent.create({ data: { actorUserId: actor.sub, action: existing ? 'PLATFORM_PACKAGE_UPDATED' : 'PLATFORM_PACKAGE_CREATED', entity: 'PlatformPackage', entityId: pack.id } }); return pack; });
 }
 async subscription(actor: PlatformJwtUser,orgId: string,dto: SubscriptionDto) {
  const org = await this.org(orgId);
  const pack = await this.db.platformPackage.findFirst({ where: { id: dto.packageId } });
  if (!pack) throw new BadRequestException('Active package not found');
  this.validateFeatures(pack.features);
  const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
  if (endsAt && endsAt <= new Date() && dto.status === 'ACTIVE') throw new BadRequestException('Active subscription end must be in the future');
  return this.db.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
   if (pack.employeeLimit != null) {
    const occupied = await tx.employee.count({ where: { organizationId: orgId, status: { not: 'TERMINATED' } } });
    if (occupied > pack.employeeLimit) throw new BadRequestException('Current employee count exceeds the selected package limit');
   }
   const existing = await tx.platformSubscription.findUnique({ where: { organizationId: orgId } });
   const sub = await tx.platformSubscription.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, packageId: pack.id, status: dto.status, endsAt, changedByUserId: actor.sub }, update: { packageId: pack.id, status: dto.status, endsAt, changedByUserId: actor.sub } });
   for (const feature of Object.values(Feature)) {
    const enabled = feature === Feature.CORE_HR || pack.features.includes(feature);
    await tx.organizationFeature.upsert({ where: { organizationId_feature: { organizationId: orgId, feature } }, create: { organizationId: orgId, feature, enabled, ...(enabled ? { enabledAt: new Date() } : {}), disabledAt: enabled ? null : new Date() }, update: { enabled, ...(enabled ? { enabledAt: new Date(), disabledAt: null } : { disabledAt: new Date() }) } });
   }
   await this.log(tx,orgId,actor,'PLATFORM_SUBSCRIPTION_CHANGED','PlatformSubscription',sub.id,dto.reason,{ previousPackageId: existing?.packageId ?? null, packageId: pack.id, previousStatus: existing?.status ?? null, status: dto.status });
   return sub;
  });
 }
 async getSubscription(orgId: string) { await this.org(orgId); return this.db.platformSubscription.findUnique({ where: { organizationId: orgId }, include: { package: true } }); }
 async users(orgId?: string) { if (orgId) await this.org(orgId); return this.db.user.findMany({ where: orgId ? { organizationId: orgId } : { organizationId: null, role: { in: [UserRole.SUPER_ADMIN,UserRole.PLATFORM_ADMIN] } }, select: { id: true, fullName: true, email: true, role: true, organizationId: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200 }); }
 async createUser(actor: PlatformJwtUser,dto: PlatformUserDto) {
  this.super(actor);
  if (dto.role === UserRole.COMPANY_ADMIN && !dto.organizationId || dto.role !== UserRole.COMPANY_ADMIN && dto.organizationId) throw new BadRequestException('Company administrators require an organization; platform users cannot belong to one');
  if (dto.organizationId) await this.org(dto.organizationId);
  const email = dto.email.trim().toLowerCase();
  if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('Email is already in use');
  const passwordHash = await hashPassword(dto.password);
  return this.db.$transaction(async tx => {
   const user = await tx.user.create({ data: { fullName: dto.fullName.trim(), email, role: dto.role, organizationId: dto.organizationId, passwordHash } });
   if (dto.organizationId) for (const grant of ROLE_PERMISSION_PRESETS[UserRole.COMPANY_ADMIN] ?? []) await tx.userPermission.create({ data: { organizationId: dto.organizationId, userId: user.id, ...grant } });
   if (dto.organizationId) await this.log(tx,dto.organizationId,actor,'PLATFORM_COMPANY_ADMIN_CREATED','User',user.id);
   else await tx.platformAuditEvent.create({ data: { actorUserId: actor.sub, action: 'PLATFORM_ADMIN_CREATED', entity: 'User', entityId: user.id } });
   return { id: user.id, fullName: user.fullName, email: user.email, role: user.role, organizationId: user.organizationId, isActive: user.isActive };
  });
 }
 async userStatus(actor: PlatformJwtUser,userId: string,isActive: boolean,reason: string) {
  this.super(actor);
  if (actor.sub === userId) throw new ForbiddenException('You cannot change your own account');
  const user = await this.db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException('User not found');
  if (user.role === UserRole.SUPER_ADMIN) throw new ForbiddenException('Super administrator accounts cannot be changed here');
  if (user.role === UserRole.COMPANY_ADMIN && user.isActive && !isActive) {
   const other = await this.db.user.count({ where: { organizationId: user.organizationId, role: UserRole.COMPANY_ADMIN, isActive: true, id: { not: userId } } });
   if (!other) throw new ConflictException('The last active company administrator cannot be deactivated');
  }
  if (user.isActive === isActive) return { id: user.id, isActive };
  return this.db.$transaction(async tx => {
   const changed = await tx.user.update({ where: { id: userId }, data: { isActive } });
   if (user.organizationId) await this.log(tx,user.organizationId,actor,'PLATFORM_USER_STATUS_CHANGED','User',userId,reason,{ previousActive: user.isActive, isActive });
   else await tx.platformAuditEvent.create({ data: { actorUserId: actor.sub, action: 'PLATFORM_USER_STATUS_CHANGED', entity: 'User', entityId: userId, reason } });
   return { id: changed.id, isActive: changed.isActive };
  });
 }
 async usage(orgId?: string) {
  if (orgId) await this.org(orgId);
  const where = orgId ? { organizationId: orgId } : {};
  const [organizations,users,employees,payrollRuns,attendanceEvents,leaveRequests,hrRequests] = await Promise.all([
   orgId ? Promise.resolve(1) : this.db.organization.count(),this.db.user.count({ where }),this.db.employee.count({ where }),this.db.payrollRun.count({ where }),this.db.attendanceEvent.count({ where }),this.db.leaveRequest.count({ where }),this.db.hrServiceRequest.count({ where })
  ]);
  return { organizations,users,employees,payrollRuns,attendanceEvents,leaveRequests,hrRequests };
 }
 async platformAudit() { return this.db.platformAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); }
 async audit(orgId: string) { await this.org(orgId); return this.db.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 200 }); }
 async support(actor: PlatformJwtUser,orgId: string,dto: SupportSessionDto) {
  await this.org(orgId);
  const target = await this.db.user.findFirst({ where: { id: dto.targetUserId, organizationId: orgId, role: UserRole.COMPANY_ADMIN, isActive: true } });
  if (!target) throw new BadRequestException('Active company administrator target required');
  const cfg = await this.db.platformConfiguration.findUnique({ where: { key: 'SUPPORT_SESSION_MAX_MINUTES' } });
  const minutes = cfg ? Number(cfg.value) : 15;
  return this.db.$transaction(async tx => {
   await tx.platformSupportSession.updateMany({ where: { actorUserId: actor.sub, organizationId: orgId, revokedAt: null }, data: { revokedAt: new Date() } });
   const session = await tx.platformSupportSession.create({ data: { organizationId: orgId, targetUserId: target.id, actorUserId: actor.sub, reason: dto.reason.trim(), expiresAt: new Date(Date.now()+minutes*60000) } });
   await this.log(tx,orgId,actor,'PLATFORM_SUPPORT_SESSION_STARTED','PlatformSupportSession',session.id,dto.reason);
   return session;
  });
 }
 async preview(actor: PlatformJwtUser,id: string) {
  const session = await this.db.platformSupportSession.findFirst({ where: { id, revokedAt: null, expiresAt: { gt: new Date() }, ...(actor.role === UserRole.SUPER_ADMIN ? {} : { actorUserId: actor.sub }) } });
  if (!session) throw new NotFoundException('Active support session not found');
  const [org,target,usage,features,onboarding] = await Promise.all([
   this.org(session.organizationId),
   this.db.user.findUnique({ where: { id: session.targetUserId }, select: { id: true, fullName: true, email: true, isActive: true, role: true } }),
   this.usage(session.organizationId),
   this.db.organizationFeature.findMany({ where: { organizationId: session.organizationId }, select: { feature: true, enabled: true } }),
   this.db.organizationOnboarding.findUnique({ where: { organizationId: session.organizationId }, select: { status: true, completedAt: true } }),
  ]);
  if (!target?.isActive || org.status === OrganizationStatus.REJECTED) throw new ForbiddenException('Support target or tenant is unavailable');
  await this.db.$transaction(tx => this.log(tx,org.id,actor,'PLATFORM_SUPPORT_PREVIEWED','PlatformSupportSession',id,session.reason));
  return { session: { id: session.id, expiresAt: session.expiresAt, targetUserId: target.id }, organization: org, target, usage, features, onboarding, access: 'READ_ONLY_PREVIEW' };
 }
 async revoke(actor: PlatformJwtUser,id: string) {
  const session = await this.db.platformSupportSession.findFirst({ where: { id, ...(actor.role === UserRole.SUPER_ADMIN ? {} : { actorUserId: actor.sub }) } });
  if (!session) throw new NotFoundException('Support session not found');
  return this.db.$transaction(async tx => { const item = await tx.platformSupportSession.update({ where: { id }, data: { revokedAt: new Date() } }); await this.log(tx,item.organizationId,actor,'PLATFORM_SUPPORT_SESSION_REVOKED','PlatformSupportSession',id); return item; });
 }
 async config() { return this.db.platformConfiguration.findMany({ where: { key: { in: [...configKeys] } }, orderBy: { key: 'asc' } }); }
 async setConfig(actor: PlatformJwtUser,key: string,value: string) {
  this.super(actor);
  if (!configKeys.includes(key as typeof configKeys[number])) throw new BadRequestException('Unsupported platform configuration key');
  if (key === 'SUPPORT_SESSION_MAX_MINUTES' && (!/^\d+$/.test(value) || Number(value)<5 || Number(value)>30)) throw new BadRequestException('Support session minutes must be 5–30');
  if (key === 'REGISTRATION_ENABLED' && !['true','false'].includes(value)) throw new BadRequestException('Expected true or false');
  if (key === 'MAINTENANCE_BANNER' && value.length > 500) throw new BadRequestException('Banner too long');
  return this.db.$transaction(async tx => { const cfg = await tx.platformConfiguration.upsert({ where: { key }, create: { key,value,updatedByUserId: actor.sub }, update: { value,updatedByUserId: actor.sub } }); await tx.platformAuditEvent.create({ data: { actorUserId: actor.sub, action: 'PLATFORM_CONFIGURATION_CHANGED', entity: 'PlatformConfiguration', entityId: key } }); return cfg; });
 }
 async health() {
  try { await this.db.$queryRaw`SELECT 1`; return { status: 'OK', database: 'OK', uptimeSeconds: Math.floor(process.uptime()), checkedAt: new Date().toISOString() }; }
  catch { return { status: 'DEGRADED', database: 'UNAVAILABLE', uptimeSeconds: Math.floor(process.uptime()), checkedAt: new Date().toISOString() }; }
 }
}
