import { AccessControlService } from './access-control.service';
import { Permission } from '@prisma/client';
describe('Executive and HR access with explicit restrictions', () => {
  const actor: any = {
    sub: 'executive',
    email: 'e@test',
    role: 'EXECUTIVE',
    organizationId: 'company-a',
  };
  it('separates executive summaries from detailed payroll and grants employee approval', async () => {
    const service = new AccessControlService({
      userPermission: { findMany: async () => [] },
    } as any);
    const grants = await service.getEffectivePermissions(actor);
    expect(
      grants.some((g) => g.permission === Permission.APPROVE_EMPLOYEES),
    ).toBe(true);
    expect(
      grants.some((g) => g.permission === Permission.VIEW_WORKFORCE_COST),
    ).toBe(true);
    expect(grants.some((g) => g.permission === Permission.VIEW_PAYROLL)).toBe(
      false,
    );
    expect(
      grants.some((g) => g.permission === Permission.VIEW_ALL_PAYSLIPS),
    ).toBe(false);
  });
  it('applies restrictions over role grants and queries only the current company', async () => {
    const findMany = jest.fn(async () => [
      { permission: 'APPROVE_EMPLOYEES', scope: 'ORGANIZATION', denied: true },
      { permission: 'VIEW_PAYROLL', scope: 'ORGANIZATION', denied: false },
    ]);
    const service = new AccessControlService({
      userPermission: { findMany },
    } as any);
    const grants = await service.getEffectivePermissions(actor);
    expect(
      grants.some((g) => g.permission === Permission.APPROVE_EMPLOYEES),
    ).toBe(false);
    expect(grants.some((g) => g.permission === Permission.VIEW_PAYROLL)).toBe(
      true,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'executive', organizationId: 'company-a' },
      }),
    );
  });
});
