import { Injectable, Logger } from '@nestjs/common';
@Injectable()
export class RecoveryMailService {
  private readonly logger = new Logger(RecoveryMailService.name);
  async send(to: string, subject: string, text: string) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!key || !from)
      throw new Error('Recovery email delivery is not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Recovery email delivery failed (${response.status})`);
  }
  warnFailure() {
    this.logger.error(
      'Password recovery email could not be delivered. Check email configuration and provider status.',
    );
  }
}
