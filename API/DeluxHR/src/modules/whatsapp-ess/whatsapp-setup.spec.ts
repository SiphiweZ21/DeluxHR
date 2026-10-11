import 'reflect-metadata';
import { validate } from 'class-validator';
import { UserRole, Prisma, Permission, Feature } from '@prisma/client';
import { comparePassword } from '../../common/auth/password';
import { WhatsAppEssService } from './whatsapp-ess.service';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/access/require-permissions.decorator';
import { WhatsAppSetupService } from './whatsapp-setup.service';
import {
  WhatsAppSetupController,
  WhatsAppSetupDto,
} from './whatsapp-setup.controller';
import { ALLOW_PENDING_ONBOARDING } from '../../common/auth/allow-pending-onboarding.decorator';
import { REQUIRED_FEATURES_KEY } from '../../common/entitlements/require-features.decorator';
const actor = {
  sub: 'admin',
  email: 'admin@example.com',
  role: UserRole.COMPANY_ADMIN,
  organizationId: 'company',
};
const dto = {
  employeeId: 'employee',
  whatsappNumber: '0821234567',
  consent: true,
  consentNote: 'Employee signed consent on 11 October',
  pin: '483726',
  email: 'employee@example.com',
  password: 'secure-test-passphrase',
};
function fixture(userId: string | null = null) {
  const tx: any = {
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'employee',
          firstName: 'Test',
          lastName: 'Employee',
          userId,
        }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    user: {
      create: jest.fn().mockResolvedValue({ id: 'login' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'login' }),
    },
    userPermission: { create: jest.fn() },
    whatsAppEssIdentity: { upsert: jest.fn(), updateMany: jest.fn() },
    whatsAppEssSession: { deleteMany: jest.fn() },
  };
  const db: any = {
    $transaction: jest.fn(async (fn) => fn(tx)),
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { log: jest.fn() };
  return { tx, db, audit, service: new WhatsAppSetupService(db, audit as any) };
}
describe('Employee WhatsApp setup', () => {
  it('atomically creates a scoped employee login, records consent, hashes credentials and ends sessions', async () => {
    const { service, tx, db, audit } = fixture();
    const result = await service.save(actor, dto);
    expect(result.whatsappNumber).toBe('+27821234567');
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      role: UserRole.EMPLOYEE,
      organizationId: 'company',
      email: dto.email,
    });
    expect(
      await comparePassword(
        dto.password,
        tx.user.create.mock.calls[0][0].data.passwordHash,
      ),
    ).toBe(true);
    expect(
      await comparePassword(
        dto.pin,
        tx.whatsAppEssIdentity.upsert.mock.calls[0][0].create.pinHash,
      ),
    ).toBe(true);
    expect(tx.employee.update.mock.calls[0][0].data).toMatchObject({
      userId: 'login',
      whatsappOptInAt: expect.any(Date),
    });
    expect(tx.userPermission.create).toHaveBeenCalled();
    expect(tx.whatsAppEssSession.deleteMany).toHaveBeenCalledWith({
      where: { employeeId: 'employee' },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(audit.log.mock.calls[0][1]).toBe(tx);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(dto.password);
    expect(JSON.stringify(result)).not.toContain(dto.pin);
  });
  it('links only an active unlinked employee account in the same tenant', async () => {
    const { service, tx } = fixture();
    await service.save(actor, {
      ...dto,
      email: undefined,
      password: undefined,
      existingUserId: 'login',
    });
    expect(tx.user.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'company',
      isActive: true,
      role: UserRole.EMPLOYEE,
      employee: { is: null },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('rejects cross-tenant or previously linked accounts before changing an employee', async () => {
    const { service, tx } = fixture();
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.save(actor, {
        ...dto,
        email: undefined,
        password: undefined,
        existingUserId: 'foreign',
      }),
    ).rejects.toThrow('active, unlinked');
    expect(tx.employee.update).not.toHaveBeenCalled();
  });
  it('rejects inactive or foreign employees', async () => {
    const { service, tx } = fixture();
    tx.employee.findFirst.mockResolvedValue(null);
    await expect(service.save(actor, dto)).rejects.toThrow(
      'Active employee not found',
    );
    expect(tx.employee.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'company',
      status: 'ACTIVE',
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('rejects equivalent formatted numbers across companies', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockResolvedValue([
      { whatsappNumber: '+27 82 123 4567' },
    ]);
    await expect(service.save(actor, dto)).rejects.toThrow('already assigned');
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('requires explicit consent and never replaces an existing linked account', async () => {
    const { service, tx } = fixture('existing');
    await expect(
      service.save(actor, { ...dto, consent: false }),
    ).rejects.toThrow('Consent');
    await expect(service.save(actor, dto)).rejects.toThrow(
      'already has a linked',
    );
    expect(tx.employee.update).not.toHaveBeenCalled();
    await service.save(actor, {
      ...dto,
      email: undefined,
      password: undefined,
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('rejects disabled linked logins', async () => {
    const { service, tx } = fixture('existing');
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.save(actor, { ...dto, email: undefined, password: undefined }),
    ).rejects.toThrow('inactive');
  });
  it('revokes consent and identity together without deleting the portal account', async () => {
    const { service, tx, audit } = fixture('existing');
    await service.revoke(actor, 'employee');
    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: 'employee' },
      data: { whatsappOptInAt: null },
    });
    expect(tx.whatsAppEssIdentity.updateMany).toHaveBeenCalledWith({
      where: { employeeId: 'employee' },
      data: { isActive: false },
    });
    expect(tx.whatsAppEssSession.deleteMany).toHaveBeenCalled();
    expect(audit.log.mock.calls[0][1]).toBe(tx);
  });
  it('limits lists to the current company and never selects credential hashes', async () => {
    const { service, db } = fixture();
    await service.list(actor);
    expect(db.employee.findMany.mock.calls[0][0].where.organizationId).toBe(
      'company',
    );
    expect(db.user.findMany.mock.calls[0][0].where.organizationId).toBe(
      'company',
    );
    expect(JSON.stringify(db.employee.findMany.mock.calls)).not.toMatch(
      /pinHash|passwordHash/,
    );
  });
  it('validates PIN, password and consent at the HTTP boundary', async () => {
    const payload = Object.assign(new WhatsAppSetupDto(), {
      ...dto,
      employeeId: '7e48ff6b-040f-46ec-a406-9390d2b2c23e',
    });
    expect(await validate(payload)).toHaveLength(0);
    payload.pin = '123';
    payload.consent = false;
    payload.password = 'short';
    expect((await validate(payload)).map((e) => e.property)).toEqual(
      expect.arrayContaining(['pin', 'consent', 'password']),
    );
  });
  it.each([
    null,
    { isActive: false, organizationId: 'company' },
    { isActive: true, organizationId: 'foreign' },
  ])(
    'denies WhatsApp commands for an invalid linked login %p',
    async (user) => {
      const db: any = {
        employee: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                organizationId: 'company',
                user,
                whatsappEssIdentity: { isActive: true },
              },
            ]),
        },
      };
      const service: any = new WhatsAppEssService(
        db,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      expect(await service.handle('27821234567', '0', 'message')).toContain(
        'not set up',
      );
    },
  );
  it('marks setup for pending onboarding and requires the WhatsApp feature', () => {
    expect(
      Reflect.getMetadata(ALLOW_PENDING_ONBOARDING, WhatsAppSetupController),
    ).toBe(true);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, WhatsAppSetupController),
    ).toEqual([Permission.MANAGE_USERS]);
    expect(
      Reflect.getMetadata(REQUIRED_FEATURES_KEY, WhatsAppSetupController),
    ).toEqual([Feature.WHATSAPP]);
  });
});
