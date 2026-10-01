import { ConfigService } from '@nestjs/config';

export function requiredJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < 32 || secret === 'dev-secret') throw new Error('JWT_SECRET must be set to at least 32 characters');
  return secret;
}
