import { Injectable } from '@nestjs/common';
import { companyReadiness } from './company-readiness';
import { Feature } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasFeature(organizationId: string, feature: Feature): Promise<boolean> {
    if (feature === Feature.CORE_HR) return true;
    if (!(await this.subscriptionAvailable(organizationId))) return false;
    const entitlement = await this.prisma.organizationFeature.findUnique({
      where: {
        organizationId_feature: {
          organizationId,
          feature,
        },
      },
      select: {
        enabled: true,
      },
    });

    return entitlement?.enabled === true;
  }

  async hasAllFeatures(
    organizationId: string,
    features: Feature[],
  ): Promise<boolean> {
    const uniqueFeatures = [...new Set(features)].filter(
      (f) => f !== Feature.CORE_HR,
    );
    if (!uniqueFeatures.length) return true;
    if (!(await this.subscriptionAvailable(organizationId))) return false;

    const enabledCount = await this.prisma.organizationFeature.count({
      where: {
        organizationId,
        feature: {
          in: uniqueFeatures,
        },
        enabled: true,
      },
    });

    return enabledCount === uniqueFeatures.length;
  }

  async incompleteSetup(
    organizationId: string,
    features: Feature[],
  ): Promise<string[]> {
    const relevant = new Set<string>();
    if (features.includes(Feature.LEAVE))
      ['leaveTypes', 'leavePolicies', 'publicHolidays', 'openingLeave'].forEach(
        (k) => relevant.add(k),
      );
    if (
      features.some((f) =>
        [Feature.ATTENDANCE, Feature.TIMESHEETS].some((x) => x === f),
      )
    )
      ['workLocations', 'shifts'].forEach((k) => relevant.add(k));
    if (
      features.some((f) =>
        [Feature.PAYROLL, Feature.PAYSLIPS, Feature.EARLY_PAY].some(
          (x) => x === f,
        ),
      )
    )
      ['registration', 'payrollSettings', 'openingPayroll'].forEach((k) =>
        relevant.add(k),
      );
    if (!relevant.size) return [];
    const ready = await companyReadiness(this.prisma, organizationId);
    return ready.checklist
      .filter((c) => relevant.has(c.key) && !c.ready)
      .map((c) => c.key);
  }

  private async subscriptionAvailable(
    organizationId: string,
  ): Promise<boolean> {
    const subscription = await this.prisma.platformSubscription.findUnique({
      where: { organizationId },
      select: { status: true, endsAt: true },
    });
    return (
      !subscription ||
      (subscription.status === 'ACTIVE' &&
        (!subscription.endsAt || subscription.endsAt > new Date()))
    );
  }

  async getOrganizationFeatures(organizationId: string) {
    return this.prisma.organizationFeature.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        feature: 'asc',
      },
    });
  }

  async getEnabledFeatures(organizationId: string): Promise<Feature[]> {
    if (!(await this.subscriptionAvailable(organizationId)))
      return [Feature.CORE_HR];
    const features = await this.prisma.organizationFeature.findMany({
      where: {
        organizationId,
        enabled: true,
      },
      select: {
        feature: true,
      },
      orderBy: {
        feature: 'asc',
      },
    });

    return [
      ...new Set([Feature.CORE_HR, ...features.map((item) => item.feature)]),
    ];
  }
}
