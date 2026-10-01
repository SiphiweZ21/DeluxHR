import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrganizationWorkforceGuard } from './organization-workforce.guard';

describe('organization workforce queue scope', () => {
  const guard = new OrganizationWorkforceGuard();
  const context = (role: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as unknown as ExecutionContext;
  it('rejects self and team roles from organization-wide queues', () => {
    expect(() => guard.canActivate(context('EMPLOYEE'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('MANAGER'))).toThrow(ForbiddenException);
  });
  it('allows administrative roles after the tenant and permission guards', () => {
    expect(guard.canActivate(context('HR_ADMIN'))).toBe(true);
  });
});
