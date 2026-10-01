import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { EarlyPayController } from './early-pay.controller';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/access/require-permissions.decorator';
describe('Early Pay scoped requests and administration guards', () => {
  const actor: any = {
    sub: 'user',
    organizationId: 'org',
    role: 'EMPLOYEE',
    email: 'u@test',
  };
  const service: any = {
    quote: jest.fn(),
    listByEmployee: jest.fn(),
    createRequest: jest.fn(),
  };
  const access: any = { hasPermission: jest.fn() };
  const db: any = { employee: { findFirst: jest.fn() } };
  const controller = new EarlyPayController(service, access, db);
  beforeEach(() => {
    jest.clearAllMocks();
    access.hasPermission.mockImplementation((_u: any, p: Permission) =>
      Promise.resolve(p === Permission.REQUEST_EARLY_PAY),
    );
    db.employee.findFirst.mockResolvedValue({ id: 'own' });
  });
  it('permits the linked active employee and checks tenant ownership', async () => {
    await controller.quote('own', actor);
    expect(db.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'own',
          organizationId: 'org',
          userId: 'user',
          status: 'ACTIVE',
        },
      }),
    );
    expect(service.quote).toHaveBeenCalledWith('org', 'own');
  });
  it('rejects another employee without reading their quote', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    await expect(controller.quote('other', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.quote).not.toHaveBeenCalled();
  });
  it('rejects a user without either permission', async () => {
    access.hasPermission.mockResolvedValue(false);
    await expect(controller.quote('own', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.quote).not.toHaveBeenCalled();
  });
  it('permits the authorized administration path', async () => {
    access.hasPermission.mockResolvedValue(true);
    await controller.quote('other', actor);
    expect(service.quote).toHaveBeenCalledWith('org', 'other');
  });
  it('guards policy, queue, review and simulated processing permissions', () => {
    for (const method of ['requests', 'review', 'process'])
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_KEY,
          EarlyPayController.prototype[method],
        ),
      ).toEqual([Permission.APPROVE_EARLY_PAY]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EarlyPayController.prototype.updatePolicy,
      ),
    ).toEqual([Permission.MANAGE_EARLY_PAY_POLICY]);
  });
});
