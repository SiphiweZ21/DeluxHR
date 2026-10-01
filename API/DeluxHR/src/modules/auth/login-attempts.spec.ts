import {
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController } from './auth.controller';
describe('Five failed login attempts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-01T04:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('allows four failures with remaining attempts and blocks at five', () => {
    const s = new AuthRateLimitService();
    for (let i = 1; i <= 5; i++) {
      try {
        s.recordLoginFailure('User@Test.com');
        throw new Error('expected');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(i === 5 ? 429 : 401);
        expect((e as HttpException).getResponse()).toMatchObject({
          remainingAttempts: 5 - i,
        });
      }
    }
    expect(() => s.assertLoginAllowed('user@test.com')).toThrow();
    expect(() => s.assertLoginAllowed('other@test.com')).not.toThrow();
  });
  it('allows retry after the 15-minute window', () => {
    const s = new AuthRateLimitService();
    for (let i = 0; i < 5; i++)
      try {
        s.recordLoginFailure('e@test');
      } catch {}
    jest.advanceTimersByTime(900000);
    expect(() => s.assertLoginAllowed('e@test')).not.toThrow();
  });
  it('clears failures after successful login', async () => {
    const s = new AuthRateLimitService();
    for (let i = 0; i < 4; i++)
      try {
        s.recordLoginFailure('e@test');
      } catch {}
    const c = new AuthController(
      { login: jest.fn(async () => ({ accessToken: 'token' })) } as any,
      s,
    );
    await c.login(
      { email: 'e@test', password: 'good' },
      { socket: { remoteAddress: 'ip' } },
    );
    try {
      s.recordLoginFailure('e@test');
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        remainingAttempts: 4,
      });
    }
  });
  it('does not count account status or server failures as bad passwords', async () => {
    const s = new AuthRateLimitService();
    const c = new AuthController(
      {
        login: jest.fn(async () => {
          throw new ForbiddenException('Account is inactive');
        }),
      } as any,
      s,
    );
    for (let i = 0; i < 6; i++)
      await expect(
        c.login(
          { email: 'e@test', password: 'good' },
          { socket: { remoteAddress: 'ip' } },
        ),
      ).rejects.toThrow('inactive');
    expect(() => s.assertLoginAllowed('e@test')).not.toThrow();
  });
  it('returns Retry-After and avoids credential checking when locked', async () => {
    const s = new AuthRateLimitService(),
      auth: any = {
        login: jest.fn(async () => {
          throw new UnauthorizedException('Invalid credentials');
        }),
      },
      c = new AuthController(auth, s),
      res: any = { setHeader: jest.fn() };
    for (let i = 0; i < 5; i++)
      await c
        .login(
          { email: 'e@test', password: 'wrong' },
          { socket: { remoteAddress: 'ip' } },
          res,
        )
        .catch(() => {});
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    await expect(
      c.login(
        { email: 'e@test', password: 'correct' },
        { socket: { remoteAddress: 'ip' } },
        res,
      ),
    ).rejects.toThrow();
    expect(auth.login).toHaveBeenCalledTimes(5);
  });
});
