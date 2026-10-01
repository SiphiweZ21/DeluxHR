import { createHmac } from 'crypto';
import { validWebhookSignature } from './whatsapp-ess.controller';
import { normalizedPhone } from './whatsapp-ess.service';
describe('WhatsApp inbound boundary', () => {
 it('accepts a valid HMAC over exact raw bytes', () => {
   const raw = Buffer.from('{"entry":[]}');
   const signature = 'sha256='+createHmac('sha256','app-secret').update(raw).digest('hex');
   expect(validWebhookSignature(raw,signature,'app-secret')).toBe(true);
   expect(validWebhookSignature(Buffer.from('{"entry":[] }'),signature,'app-secret')).toBe(false);
 });
 it('rejects missing, malformed, or unconfigured signatures', () => {
   expect(validWebhookSignature(Buffer.from('x'),undefined,'secret')).toBe(false);
   expect(validWebhookSignature(Buffer.from('x'),'sha256=00','secret')).toBe(false);
   expect(validWebhookSignature(Buffer.from('x'),'sha256='+'0'.repeat(64),undefined)).toBe(false);
 });
 it('normalizes the registered WhatsApp number', () => {
   expect(normalizedPhone('+27 82 123 4567')).toBe('27821234567');
 });
});
