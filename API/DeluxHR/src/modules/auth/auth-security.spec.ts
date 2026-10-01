import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { requiredJwtSecret } from '../../common/auth/jwt-secret';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('authentication security', () => {
  it('refuses missing, fixed or short JWT secrets', () => {
    for (const secret of [undefined, 'dev-secret', 'short']) {
      expect(() => requiredJwtSecret({ get: () => secret } as unknown as ConfigService)).toThrow();
    }
    expect(requiredJwtSecret({ get: () => 'x'.repeat(32) } as unknown as ConfigService)).toHaveLength(32);
  });
  it('blocks repeated authentication requests per key', () => {
    const limiter = new AuthRateLimitService();
    limiter.check('account', 2);
    limiter.check('account', 2);
    expect(() => limiter.check('account', 2)).toThrow(HttpException);
    expect(() => limiter.check('another-account', 2)).not.toThrow();
  });
});
