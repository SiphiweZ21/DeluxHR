import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Feature } from '@prisma/client';
import { WorkspaceAccessService } from './workspace-access.service';
const actor: any = {
  sub: 'admin',
  organizationId: 'org',
  role: 'COMPANY_ADMIN',
  email: 'admin@test',
};
function fixture() {
  const tx: any = {
    $queryRaw: jest.fn(),
    organization: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    platformSubscription: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          status: 'ACTIVE',
          endsAt: null,
          package: {
            name: 'HR',
            features: ['CORE_HR', 'LEAVE', 'PAYROLL', 'PAYSLIPS', 'EARLY_PAY'],
          },
        }),
    },
    organizationFeature: {
      findUnique: jest.fn().mockResolvedValue({ enabled: true }),
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    employee: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const db: any = { ...tx, $transaction: jest.fn((fn) => fn(tx)) };
  return {
    tx,
    service: new WorkspaceAccessService(
      db,
      {
        getEffectivePermissions: jest
          .fn()
          .mockResolvedValue([
            { permission: 'MANAGE_COMPANY', scope: 'ORGANIZATION' },
          ]),
      } as any,
      {
        getEnabledFeatures: jest.fn().mockResolvedValue(['CORE_HR']),
        getOrganizationFeatures: jest
          .fn()
          .mockResolvedValue([{ feature: 'CORE_HR', enabled: true }]),
      } as any,
    ),
  };
}
describe('Workspace services and effective access', () => {
  it('reads effective flags/grants without writes', async () => {
    const f = fixture(),
      a = await f.service.current(actor);
    expect(a.features).toEqual(['CORE_HR']);
    expect(a.services.find((s) => s.feature === 'LEAVE')).toMatchObject({
      included: true,
      configured: false,
      effectiveEnabled: false,
    });
    expect(f.tx.organizationFeature.upsert).not.toHaveBeenCalled();
  });
  it('enables a subscribed service with tenant audit', async () => {
    const f = fixture();
    await f.service.setService(actor, Feature.LEAVE, true, 'Enable leave');
    expect(f.tx.organizationFeature.upsert).toHaveBeenCalled();
    expect(f.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org',
          reason: 'Enable leave',
        }),
      }),
    );
  });
  it('restores baseline Core HR without granting unsubscribed paid services', async () => {
    const f = fixture();
    f.tx.platformSubscription.findUnique.mockResolvedValue(null);
    await f.service.setService(actor, Feature.CORE_HR, true, 'Restore core');
    expect(f.tx.organizationFeature.upsert).toHaveBeenCalledTimes(1);
    await expect(
      f.service.setService(actor, Feature.LEAVE, true, 'Enable leave'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.organizationFeature.upsert).toHaveBeenCalledTimes(1);
  });
  it.each(['PAUSED', 'CANCELLED', 'EXPIRED'])(
    'rejects %s subscription services',
    async (state) => {
      const f = fixture();
      f.tx.platformSubscription.findUnique.mockResolvedValue({
        status: state === 'EXPIRED' ? 'ACTIVE' : state,
        endsAt: state === 'EXPIRED' ? new Date(0) : null,
        package: { features: ['LEAVE'] },
      });
      await expect(
        f.service.setService(actor, Feature.LEAVE, true, 'Enable leave'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.tx.organizationFeature.upsert).not.toHaveBeenCalled();
    },
  );
  it('denies features outside the subscribed package', async () => {
    const f = fixture();
    await expect(
      f.service.setService(actor, Feature.WHATSAPP, true, 'Enable WhatsApp'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.organizationFeature.upsert).not.toHaveBeenCalled();
  });
  it('preserves Core HR and payroll dependencies', async () => {
    const f = fixture();
    await expect(
      f.service.setService(actor, Feature.CORE_HR, false, 'Disable core'),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.tx.organizationFeature.findUnique.mockResolvedValue({ enabled: false });
    await expect(
      f.service.setService(actor, Feature.PAYSLIPS, true, 'Enable payslips'),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.tx.organizationFeature.count.mockResolvedValue(1);
    await expect(
      f.service.setService(actor, Feature.PAYROLL, false, 'Disable payroll'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.organizationFeature.upsert).not.toHaveBeenCalled();
  });
  it('denies wrong roles, unknown features and non-active companies', async () => {
    const f = fixture();
    await expect(
      f.service.setService(
        { ...actor, role: 'HR_ADMIN' },
        Feature.LEAVE,
        true,
        'Enable leave',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.service.setService(actor, 'BAD' as Feature, true, 'Enable leave'),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.tx.organization.findUnique.mockResolvedValue({ status: 'PENDING' });
    await expect(
      f.service.setService(actor, Feature.LEAVE, true, 'Enable leave'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.organizationFeature.upsert).not.toHaveBeenCalled();
  });
});
