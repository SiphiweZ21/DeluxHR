import { ALLOW_FEATURE_SETUP } from './allow-feature-setup.decorator';
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

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_FEATURE_SETUP, [context.getHandler(),context.getClass()]) === true) return true;
    const missing = await this.entitlementsService.incompleteSetup(
      user.organizationId,
      requiredFeatures,
    );
    if (missing.length)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MODULE_SETUP_REQUIRED',
        message:
          `Complete the missing setup before continuing: ${missing.map(key => ({registration:'company registration and tax number',payrollSettings:'Payroll settings',workLocations:'Attendance work locations',shifts:'Attendance shifts',leaveTypes:'Leave types',leavePolicies:'Leave policies',publicHolidays:'public holiday review',openingLeave:'opening leave review'}[key] ?? key)).join(', ')}. Open the relevant feature settings or ask your company administrator.`,
        setupSteps: missing,
      });
    return true;
  }
}
