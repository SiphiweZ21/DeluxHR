import { WorkspaceAccessService } from './workspace-access.service';

describe('authenticated workspace identity', () => {
  it('loads company and linked employee only from the authenticated tenant and user', async () => {
    const db: any = {
      platformSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Pilot Company', legalName: 'Legal Company' }) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'employee', firstName: 'Office', lastName: 'User', jobTitle: 'Legacy title', position: { name: 'Office Administrator' } }) },
    };
    const service = new WorkspaceAccessService(db, { getEffectivePermissions: async () => [] } as any, { getEnabledFeatures: async () => [], getOrganizationFeatures: async () => [] } as any);
    const actor: any = { sub: 'signed-in-user', organizationId: 'signed-in-company', role: 'COMPANY_ADMIN' };
    const result = await service.current(actor);
    expect(db.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: actor.organizationId } }));
    expect(db.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: actor.organizationId, userId: actor.sub, status: 'ACTIVE' } }));
    expect(result.companyName).toBe('Pilot Company');
    expect(result.employeeProfile).toEqual({ name: 'Office User', jobPosition: 'Office Administrator' });
    db.organization.findUnique.mockResolvedValue({ name: ' ', legalName: 'Legal Company' });
    db.employee.findFirst.mockResolvedValue(null);
    const fallback = await service.current(actor);
    expect(fallback.companyName).toBe('Legal Company');
    expect(fallback.employeeProfile).toBeNull();
  });
});
