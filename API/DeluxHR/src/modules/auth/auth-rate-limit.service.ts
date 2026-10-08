import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class AuthRateLimitService {
  constructor(private readonly db: PrismaService) {}
  private loginKey(email: string) {
    return `failed-login:${email.trim().toLowerCase()}`;
  }
  async assertLoginAllowed(email: string) {
    const row = await this.db.authThrottle.findUnique({
      where: { key: this.loginKey(email) },
    });
    if (row && row.resetAt > new Date() && row.count >= 5)
      this.blocked(row.resetAt);
  }
  async recordLoginFailure(email: string): Promise<never> {
    const row = await this.increment(this.loginKey(email), 15 * 60_000);
    if (row.count >= 5) this.blocked(row.resetAt);
    throw new HttpException(
      {
        message:
          'Email or password is incorrect. Please check your details and try again.',
        remainingAttempts: 5 - row.count,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
  async clearLoginFailures(email: string) {
    await this.db.authThrottle.deleteMany({
      where: { key: this.loginKey(email) },
    });
  }
  private blocked(resetAt: Date): never {
    throw new HttpException(
      {
        message:
          'Too many unsuccessful sign-in attempts. Please wait before trying again.',
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((resetAt.getTime() - Date.now()) / 1000),
        ),
      },
      429,
    );
  }
  private async increment(key: string, windowMs: number) {
    const until = new Date(Date.now() + windowMs);
    const rows = await this.db.$queryRaw<
      Array<{ count: number; resetAt: Date }>
    >`
      INSERT INTO "AuthThrottle" ("key", "count", "resetAt") VALUES (${key}, 1, ${until})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AuthThrottle"."resetAt" <= CURRENT_TIMESTAMP THEN 1 ELSE "AuthThrottle"."count" + 1 END,
        "resetAt" = CASE WHEN "AuthThrottle"."resetAt" <= CURRENT_TIMESTAMP THEN ${until} ELSE "AuthThrottle"."resetAt" END
      RETURNING "count", "resetAt"`;
    return rows[0];
  }
  async check(key: string, limit = 10, windowMs = 15 * 60_000) {
    const row = await this.increment(key, windowMs);
    if (row.count > limit) this.blocked(row.resetAt);
  }
}
