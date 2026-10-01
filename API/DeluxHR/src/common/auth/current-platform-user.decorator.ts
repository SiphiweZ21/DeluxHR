import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformJwtUser } from './jwt-user.type';

export const CurrentPlatformUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformJwtUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: PlatformJwtUser }>();

    return request.user;
  },
);