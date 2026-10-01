import { OrganizationPermissionsGuard } from './organization-permissions.guard';
import { ForbiddenException } from '@nestjs/common';
describe('Organization payment permissions', () => {
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({
      getRequest: () => ({ user: { organizationId: 'org' } }),
    }),
  } as any;
  it.each(['SELF', 'TEAM'])(
    'rejects %s access on company-wide endpoints',
    async (scope) => {
      const guard = new OrganizationPermissionsGuard(
        { getAllAndOverride: () => ['VIEW_PAYROLL'] } as any,
        {
          getEffectivePermissions: async () => [
            { permission: 'VIEW_PAYROLL', scope },
          ],
        } as any,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    },
  );
  it('allows declared organization grants and denies missing grant metadata', async () => {
    const access = {
      getEffectivePermissions: async () => [
        { permission: 'VIEW_PAYROLL', scope: 'ORGANIZATION' },
      ],
    };
    await expect(
      new OrganizationPermissionsGuard(
        { getAllAndOverride: () => ['VIEW_PAYROLL'] } as any,
        access as any,
      ).canActivate(context),
    ).resolves.toBe(true);
    await expect(
      new OrganizationPermissionsGuard(
        { getAllAndOverride: () => undefined } as any,
        access as any,
      ).canActivate(context),
    ).rejects.toThrow(ForbiddenException);
  });
});
