export type JwtUser = {
  sub: string;
  email: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
};
