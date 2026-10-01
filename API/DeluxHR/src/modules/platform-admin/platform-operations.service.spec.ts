import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Feature } from '@prisma/client';
import { PlatformOperationsService } from './platform-operations.service';
const platform = { sub: 'platform-1', email: 'support@example.com', role: 'PLATFORM_ADMIN' as const, organizationId: null };
describe('Platform operations boundaries',() => {
 const db: any = { platformPackage: { findUnique: jest.fn() }, organization: { findUnique: jest.fn() }, user: { findFirst: jest.fn(), findUnique: jest.fn() }, platformSupportSession: { findFirst: jest.fn() }, platformConfiguration: { findUnique: jest.fn() }, $transaction: jest.fn() };
 const service = new PlatformOperationsService(db);
 beforeEach(() => jest.clearAllMocks());
 it('rejects packages missing CORE_HR or PAYROLL dependencies',async () => {
  await expect(service.package(platform as any,{ code: 'A1',name: 'A',features: [Feature.PAYROLL] })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.package(platform as any,{ code: 'A1',name: 'A',features: [Feature.CORE_HR,Feature.PAYSLIPS] })).rejects.toBeInstanceOf(BadRequestException);
 });
 it('prevents a platform admin from provisioning other admins',async () => {
  await expect(service.createUser(platform as any,{ fullName: 'Staff',email: 's@example.com',password: 'strong password',role: 'PLATFORM_ADMIN' as any })).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('requires an active company admin for support preview',async () => {
  db.platformSupportSession.findFirst.mockResolvedValue({ id: 'session-1', organizationId: 'org-1', targetUserId: 'u1', reason: 'Help', expiresAt: new Date(Date.now()+60000) });
  db.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'ACTIVE' });
  db.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false });
  db.organizationFeature = { findMany: jest.fn() }; db.organizationOnboarding = { findUnique: jest.fn() }; db.user.count = jest.fn(); db.employee = { count: jest.fn() }; db.payrollRun = { count: jest.fn() }; db.attendanceEvent = { count: jest.fn() }; db.leaveRequest = { count: jest.fn() }; db.hrServiceRequest = { count: jest.fn() };
  await expect(service.preview(platform as any,'session-1')).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.platformSupportSession.findFirst).toHaveBeenCalledWith({ where: { id: 'session-1', revokedAt: null, expiresAt: { gt: expect.any(Date) }, actorUserId: 'platform-1' } });
 });
 it('does not expose expired or revoked support sessions',async () => {
  db.platformSupportSession.findFirst.mockResolvedValue(null);
  await expect(service.preview(platform as any,'expired')).rejects.toBeInstanceOf(NotFoundException);
 });
});
