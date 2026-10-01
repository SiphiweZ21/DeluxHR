import { ForbiddenException } from '@nestjs/common';
import { TenantAccessGuard } from './tenant-access.guard';
describe('Tenant access after account changes',() => {
 const db: any = { user: { findUnique: jest.fn() }, organization: { findUnique: jest.fn() } };
 const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
 const guard = new TenantAccessGuard(db,reflector as any);
 const request: any = { user: { sub: 'u1', email: 'old@example.com', role: 'COMPANY_ADMIN', organizationId: 'org-1' } };
 const context: any = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => ({}), getClass: () => ({}) };
 beforeEach(() => { jest.clearAllMocks(); reflector.getAllAndOverride.mockReturnValue(false); request.user = { sub: 'u1', email: 'old@example.com', role: 'COMPANY_ADMIN', organizationId: 'org-1' }; });
 it('rejects a deactivated user even with a valid old JWT',async () => {
  db.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false, organizationId: 'org-1', role: 'COMPANY_ADMIN' });
  await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('permits a pending company admin only on the onboarding route',async () => {
  db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'new@example.com', isActive: true, organizationId: 'org-1', role: 'COMPANY_ADMIN' });
  db.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'PENDING' });
  reflector.getAllAndOverride.mockReturnValue(true);
  await expect(guard.canActivate(context)).resolves.toBe(true);
  reflector.getAllAndOverride.mockReturnValue(false);
  await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('uses the current role and email instead of stale JWT claims',async () => {
  db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'new@example.com', isActive: true, organizationId: 'org-1', role: 'EMPLOYEE' });
  db.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'ACTIVE' });
  await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(request.user).toMatchObject({ role: 'EMPLOYEE', email: 'new@example.com' });
 });
});
