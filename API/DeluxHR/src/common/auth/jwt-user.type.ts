import type { UserRole } from '@prisma/client';

export type JwtUser = {
  sub: string;
  email: string;
  organizationId: string | null;
  role: UserRole;
};

export type TenantJwtUser = JwtUser & {
  organizationId: string;
};

export type PlatformJwtUser = JwtUser & {
  organizationId: null;
  role: 'SUPER_ADMIN' | 'PLATFORM_ADMIN';
};