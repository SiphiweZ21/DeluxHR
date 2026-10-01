import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantJwtUser } from './jwt-user.type';

export const CurrentTenantUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantJwtUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: TenantJwtUser }>();

    return request.user;
  },
);