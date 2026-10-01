import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Feature } from '@prisma/client';

import type { TenantJwtUser } from '../auth/jwt-user.type';
import { EntitlementsService } from './entitlements.service';
import { REQUIRED_FEATURES_KEY } from './require-features.decorator';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<Feature[]>(
      REQUIRED_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: TenantJwtUser;
    }>();

    const user = request.user;

    if (!user?.organizationId) {
      throw new ForbiddenException('Tenant access is required.');
    }

    const hasFeatures = await this.entitlementsService.hasAllFeatures(
      user.organizationId,
      requiredFeatures,
    );

    if (!hasFeatures) {
      throw new ForbiddenException(
        'This service is not included for your company. Please ask your company administrator for assistance.',
      );
    }

    const missing = await this.entitlementsService.incompleteSetup(
      user.organizationId,
      requiredFeatures,
    );
    if (missing.length)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MODULE_SETUP_REQUIRED',
        message:
          'This service is selected, but its setup is not complete. Please ask your company administrator to complete it in Company Setup.',
        setupSteps: missing,
      });
    return true;
  }
}
