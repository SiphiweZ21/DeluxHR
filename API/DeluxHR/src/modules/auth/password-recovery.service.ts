import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../../common/auth/password';
import { RecoveryMailService } from './recovery-mail.service';
const generic = {
  message:
    'If this email belongs to an active account, you will receive a password-reset link.',
};
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: RecoveryMailService,
  ) {}
  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  async request(email: string) {
    const user = await this.db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.isActive) return generic;
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.digest(token);
    try {
      const base = new URL(process.env.AUTH_PUBLIC_APP_URL || '');
      if (
        base.protocol !== 'https:' &&
        !(base.protocol === 'http:' && base.hostname === 'localhost')
      )
        throw new Error('Invalid recovery application URL');
      const url = new URL('/reset-password', base);
      url.hash = `token=${token}`;
      await this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      // Do not make the public response depend on provider latency or account existence.
      setImmediate(
        () =>
          void (async () => {
            try {
              await this.mail.send(
                user.email,
                'Reset your DeluxHR password',
                `A password reset was requested for your DeluxHR account.

Open this link to choose a new password (expires in 30 minutes):
${url.toString()}

If you did not request this, you can ignore this email.`,
              );
            } catch {
              await this.db.passwordResetToken.deleteMany({
                where: { tokenHash },
              });
              this.mail.warnFailure();
            }
          })().catch(() => this.mail.warnFailure()),
      );
    } catch {
      await this.db.passwordResetToken.deleteMany({ where: { tokenHash } });
      this.mail.warnFailure();
    }
    return generic;
  }
  async reset(token: string, password: string) {
    if (Buffer.byteLength(password, 'utf8') > 72)
      throw new BadRequestException('Password must be at most 72 UTF-8 bytes.');
    const tokenHash = this.digest(token);
    const passwordHash = await hashPassword(password);
    const user = await this.db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!reset || reset.expiresAt <= new Date() || !reset.user.isActive)
        throw new BadRequestException(
          'This reset link is invalid or expired. Request a new link.',
        );
      // Serialize resets for the account; recheck and consume the token under this lock.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${reset.userId} FOR UPDATE`;
      const consumed = await tx.passwordResetToken.deleteMany({
        where: { tokenHash, expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1)
        throw new BadRequestException(
          'This reset link is invalid or expired. Request a new link.',
        );
      const active = await tx.user.updateMany({
        where: { id: reset.userId, isActive: true },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (active.count !== 1)
        throw new BadRequestException(
          'This reset link is invalid or expired. Request a new link.',
        );
      await tx.passwordResetToken.deleteMany({
        where: { userId: reset.userId },
      });
      await tx.authThrottle.deleteMany({
        where: { key: `failed-login:${reset.user.email.toLowerCase()}` },
      });
      return reset.user;
    });
    try {
      await this.mail.send(
        user.email,
        'Your DeluxHR password was changed',
        'Your DeluxHR password has been changed and existing sessions have been signed out. If this was not you, contact your company administrator immediately.',
      );
    } catch {
      this.mail.warnFailure();
    }
    return { message: 'Password updated. Sign in with your new password.' };
  }
}
