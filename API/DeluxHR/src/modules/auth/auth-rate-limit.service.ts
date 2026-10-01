import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class AuthRateLimitService {
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly failedLogins = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private loginEntry(email: string) {
    const now = Date.now();
    for (const [key, entry] of this.failedLogins)
      if (entry.resetAt <= now) this.failedLogins.delete(key);
    return this.failedLogins.get(email.trim().toLowerCase());
  }
  assertLoginAllowed(email: string): void {
    const entry = this.loginEntry(email);
    if (entry && entry.count >= 5) this.loginBlocked(entry.resetAt);
  }
  recordLoginFailure(email: string): never {
    const key = email.trim().toLowerCase();
    const entry = this.loginEntry(key) ?? {
      count: 0,
      resetAt: Date.now() + 15 * 60_000,
    };
    entry.count += 1;
    this.failedLogins.set(key, entry);
    if (entry.count >= 5) this.loginBlocked(entry.resetAt);
    throw new HttpException(
      {
        message:
          'Email or password is incorrect. Please check your details and try again.',
        remainingAttempts: 5 - entry.count,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
  clearLoginFailures(email: string): void {
    this.failedLogins.delete(email.trim().toLowerCase());
  }
  private loginBlocked(resetAt: number): never {
    throw new HttpException(
      {
        message:
          'Too many unsuccessful sign-in attempts. Please wait before trying again.',
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((resetAt - Date.now()) / 1000),
        ),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  check(key: string, limit = 10, windowMs = 15 * 60_000): void {
    const now = Date.now();
    if (this.attempts.size > 20_000)
      for (const [k, v] of this.attempts)
        if (v.resetAt <= now) this.attempts.delete(k);
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count++;
    if (entry.count > limit)
      throw new HttpException(
        'Too many authentication requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
