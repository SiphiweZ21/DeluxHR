import { PasswordRecoveryService } from './password-recovery.service';
import { JwtStrategy } from '../../common/auth/jwt.strategy';
import { createHash } from 'crypto';
jest.mock('../../common/auth/password', () => ({
  hashPassword: jest.fn(async () => 'new-hash'),
}));
function fixture() {
  const user: any = {
    id: 'u',
    email: 'user@example.test',
    isActive: true,
    tokenVersion: 0,
  };
  const tokens = new Map<string, any>();
  const tx: any = {
    passwordResetToken: {
      create: jest.fn(async ({ data }: any) => {
        tokens.set(data.tokenHash, { ...data, user });
        return data;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => tokens.get(where.tokenHash) || null,
      ),
      deleteMany: jest.fn(async ({ where }: any) => {
        let count = 0;
        for (const [k, t] of tokens)
          if (
            (!where.tokenHash || k === where.tokenHash) &&
            (!where.userId || t.userId === where.userId) &&
            (!where.expiresAt || t.expiresAt > where.expiresAt.gt)
          ) {
            tokens.delete(k);
            count++;
          }
        return { count };
      }),
    },
    user: {
      findUnique: jest.fn(async () => user),
      updateMany: jest.fn(async () => {
        if (!user.isActive) return { count: 0 };
        user.tokenVersion++;
        return { count: 1 };
      }),
    },
    authThrottle: { deleteMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const db = { ...tx, $transaction: async (fn: any) => fn(tx) };
  const mail = { send: jest.fn(async () => {}), warnFailure: jest.fn() };
  return {
    user,
    tokens,
    db,
    tx,
    mail,
    service: new PasswordRecoveryService(db as any, mail as any),
  };
}
describe('Password recovery', () => {
  beforeEach(() => {
    process.env.AUTH_PUBLIC_APP_URL = 'https://app.deluxhr.test';
  });
  it('stores only a digest, sends expiring link, consumes it and clears lockout', async () => {
    const f = fixture();
    await f.service.request(f.user.email);
    await new Promise((resolve) => setImmediate(resolve));
    const message = f.mail.send.mock.calls[0] as any;
    const token = /token=([a-f0-9]{64})/.exec(message[2])![1];
    expect(f.tokens.has(token)).toBe(false);
    const hash = createHash('sha256').update(token).digest('hex');
    expect(f.tokens.has(hash)).toBe(true);
    await f.service.reset(token, 'a-secure-password');
    expect(f.tokens.size).toBe(0);
    expect(f.user.tokenVersion).toBe(1);
    expect(f.tx.authThrottle.deleteMany).toHaveBeenCalledWith({
      where: { key: 'failed-login:user@example.test' },
    });
    await expect(f.service.reset(token, 'a-secure-password')).rejects.toThrow(
      'invalid or expired',
    );
    expect(f.mail.send).toHaveBeenCalledTimes(2);
  });
  it('returns the same response for unknown and inactive users', async () => {
    const f = fixture();
    f.user.isActive = false;
    const inactive = await f.service.request(f.user.email);
    f.tx.user.findUnique.mockResolvedValue(null);
    expect(await f.service.request('absent@example.test')).toEqual(inactive);
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it('rejects expired tokens without updating the password', async () => {
    const f = fixture();
    const token = 'a'.repeat(64);
    f.tokens.set(createHash('sha256').update(token).digest('hex'), {
      userId: 'u',
      user: f.user,
      expiresAt: new Date(0),
    });
    await expect(f.service.reset(token, 'a-secure-password')).rejects.toThrow(
      'expired',
    );
    expect(f.tx.user.updateMany).not.toHaveBeenCalled();
  });
  it('removes the token on delivery failure without exposing account existence', async () => {
    const f = fixture();
    f.mail.send.mockRejectedValue(new Error('delivery') as never);
    await expect(f.service.request(f.user.email)).resolves.toHaveProperty(
      'message',
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.tokens.size).toBe(0);
    expect(f.mail.warnFailure).toHaveBeenCalled();
  });
  it('rejects earlier JWTs after tokenVersion changes', async () => {
    const db: any = {
      user: {
        findUnique: async () => ({
          isActive: true,
          tokenVersion: 1,
          email: 'u@test',
          role: 'HR_ADMIN',
          organizationId: 'org',
        }),
      },
    };
    const s = new JwtStrategy({ get: () => 'x'.repeat(32) } as any, db);
    await expect(
      s.validate({
        sub: 'u',
        email: 'u@test',
        role: 'HR_ADMIN',
        organizationId: 'org',
        tokenVersion: 0,
      }),
    ).rejects.toThrow('Session expired');
    await expect(
      s.validate({
        sub: 'u',
        email: 'u@test',
        role: 'HR_ADMIN',
        organizationId: 'org',
        tokenVersion: 1,
      }),
    ).resolves.toHaveProperty('tokenVersion', 1);
  });
});
