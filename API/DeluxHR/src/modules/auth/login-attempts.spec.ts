import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController } from './auth.controller';
import { throttleDb } from './throttle-test.fixture';
describe('Persistent five-attempt login lockout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-01T04:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('shares counts between service instances and blocks at five', async () => {
    const db = throttleDb();
    const a = new AuthRateLimitService(db as any),
      b = new AuthRateLimitService(db as any);
    for (let i = 1; i <= 5; i++)
      await expect(
        (i % 2 ? a : b).recordLoginFailure('User@Test.com'),
      ).rejects.toMatchObject({
        response: { remainingAttempts: 5 - i },
        status: i === 5 ? 429 : 401,
      });
    await expect(b.assertLoginAllowed('user@test.com')).rejects.toThrow();
    await expect(
      b.assertLoginAllowed('other@test.com'),
    ).resolves.toBeUndefined();
    jest.advanceTimersByTime(900000);
    await expect(
      b.assertLoginAllowed('user@test.com'),
    ).resolves.toBeUndefined();
  });
  it('clears persisted failures after successful login', async () => {
    const db = throttleDb(),
      limit = new AuthRateLimitService(db as any);
    for (let i = 0; i < 4; i++)
      await limit.recordLoginFailure('e@test').catch(() => {});
    const controller = new AuthController(
      {} as any,
      { login: async () => ({ accessToken: 'token' }) } as any,
      limit,
    );
    await controller.login(
      { email: 'e@test', password: 'good' },
      { socket: { remoteAddress: 'ip' } },
    );
    await expect(limit.recordLoginFailure('e@test')).rejects.toMatchObject({
      response: { remainingAttempts: 4 },
    });
  });
  it('does not count inactive accounts as bad passwords', async () => {
    const limit = new AuthRateLimitService(throttleDb() as any);
    const controller = new AuthController(
      {} as any,
      {
        login: async () => {
          throw new ForbiddenException('inactive');
        },
      } as any,
      limit,
    );
    for (let i = 0; i < 6; i++)
      await expect(
        controller.login(
          { email: 'e@test', password: 'good' },
          { socket: { remoteAddress: 'ip' } },
        ),
      ).rejects.toThrow('inactive');
    await expect(limit.assertLoginAllowed('e@test')).resolves.toBeUndefined();
  });
  it('sets Retry-After and skips credential checking when locked', async () => {
    const limit = new AuthRateLimitService(throttleDb() as any),
      auth = {
        login: jest.fn(async () => {
          throw new UnauthorizedException();
        }),
      };
    const controller = new AuthController({} as any, auth as any, limit),
      res: any = { setHeader: jest.fn() };
    for (let i = 0; i < 6; i++)
      await controller
        .login(
          { email: 'e@test', password: 'wrong' },
          { socket: { remoteAddress: 'ip' } },
          res,
        )
        .catch(() => {});
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(auth.login).toHaveBeenCalledTimes(5);
  });
});
