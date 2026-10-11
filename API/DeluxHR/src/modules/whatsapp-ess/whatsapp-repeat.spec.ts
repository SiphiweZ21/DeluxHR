import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import {
  freshWhatsAppMessage,
  WhatsAppEssController,
} from './whatsapp-ess.controller';
import { WhatsAppEssService } from './whatsapp-ess.service';
import { WhatsAppMessageRejected } from '../whatsapp/whatsapp.service';
function fixture() {
  const claims = new Set<string>();
  const db: any = {
    whatsAppInboundMessage: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }) => {
        if (claims.has(data.providerMessageId))
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          });
        claims.add(data.providerMessageId);
      }),
      update: jest.fn(),
    },
  };
  const sender = { sendTextMessage: jest.fn(), sendInteractiveList: jest.fn() };
  const service: any = new WhatsAppEssService(
    db,
    {} as any,
    sender as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  service.handle = jest.fn().mockResolvedValue('reply');
  return { db, sender, service };
}
describe('WhatsApp repeated reply protection', () => {
  it('accepts fresh timestamps and rejects stale, malformed and far-future timestamps', () => {
    const now = Date.now(),
      seconds = Math.floor(now / 1000);
    expect(freshWhatsAppMessage(String(seconds), now)).toBe(true);
    expect(freshWhatsAppMessage(String(seconds - 601), now)).toBe(false);
    expect(freshWhatsAppMessage(String(seconds + 180), now)).toBe(false);
    expect(freshWhatsAppMessage('invalid', now)).toBe(false);
  });
  it('sends once for concurrent and subsequent deliveries with the same message ID', async () => {
    const x = fixture();
    await Promise.all([
      x.service.process('same', '27821234567', 'hi'),
      x.service.process('same', '27821234567', 'hi'),
    ]);
    await x.service.process('same', '27821234567', 'hi');
    expect(x.service.handle).toHaveBeenCalledTimes(1);
    expect(x.sender.sendTextMessage).toHaveBeenCalledTimes(1);
  });
  it('does not resend an already-claimed message when recording completion fails', async () => {
    const x = fixture();
    x.db.whatsAppInboundMessage.update.mockRejectedValueOnce(
      new Error('database failure'),
    );
    await expect(
      x.service.process('same', '27821234567', 'hi'),
    ).rejects.toThrow();
    await x.service.process('same', '27821234567', 'hi');
    expect(x.sender.sendTextMessage).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Error('network timeout'),
    new WhatsAppMessageRejected('server failure', 503),
  ])(
    'does not send a fallback after uncertain or server delivery failure %p',
    async (error) => {
      const x = fixture();
      x.service.handle.mockResolvedValue({
        interactive: { type: 'list' },
        fallback: 'fallback',
      });
      x.sender.sendInteractiveList.mockRejectedValue(error);
      await expect(
        x.service.process('same', '27821234567', 'hi'),
      ).rejects.toThrow();
      expect(x.sender.sendTextMessage).not.toHaveBeenCalled();
    },
  );
  it('ignores old signed messages and delivery statuses without replying, and acknowledges the batch', async () => {
    const saved = { ...process.env };
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'business';
    try {
      const ess = { process: jest.fn() },
        controller = new WhatsAppEssController(ess as any);
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'business' },
                  statuses: [{ status: 'delivered' }],
                  messages: [
                    {
                      id: 'old',
                      from: '27821234567',
                      timestamp: String(Math.floor(Date.now() / 1000) - 3600),
                      type: 'text',
                      text: { body: 'hi' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(body)),
        signature =
          'sha256=' +
          createHmac('sha256', 'secret').update(rawBody).digest('hex');
      expect(
        await controller.webhook({ body, rawBody } as any, signature),
      ).toEqual({ received: true });
      expect(ess.process).not.toHaveBeenCalled();
    } finally {
      process.env = saved;
    }
  });
});
