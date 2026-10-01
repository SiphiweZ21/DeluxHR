import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RiskEventStatus, type UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

type RiskActor = {
  id: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listCompanyRisks(organizationId: string, status?: RiskEventStatus) {
    return this.prisma.riskEvent.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: {
        detectedAt: 'desc',
      },
    });
  }

  async listOpenCompanyRisks(organizationId: string) {
    return this.prisma.riskEvent.findMany({
      where: {
        organizationId,
        status: {
          in: [RiskEventStatus.OPEN, RiskEventStatus.UNDER_REVIEW],
        },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });
  }

  async listEmployeeRisks(organizationId: string, employeeId: string) {
    await this.ensureEmployeeExists(organizationId, employeeId);

    return this.prisma.riskEvent.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        detectedAt: 'desc',
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const risk = await this.prisma.riskEvent.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!risk) {
      throw new NotFoundException('Risk event not found');
    }

    return risk;
  }

  async startReview(
    organizationId: string,
    id: string,
    actor: RiskActor,
    reason?: string,
  ) {
    const current = await this.findOne(organizationId, id);

    if (current.status !== RiskEventStatus.OPEN) {
      throw new BadRequestException(
        'Only OPEN risk events can be placed under review',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.riskEvent.updateMany({
        where: {
          id,
          organizationId,
          status: RiskEventStatus.OPEN,
        },
        data: {
          status: RiskEventStatus.UNDER_REVIEW,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException('Risk event is no longer OPEN');
      }

      await this.auditService.log(
        {
          organizationId,
          action: 'RISK_EVENT_REVIEW_STARTED',
          entity: 'RiskEvent',
          entityId: id,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason,
          metadata: {
            fromStatus: current.status,
            toStatus: RiskEventStatus.UNDER_REVIEW,
            riskType: current.type,
            severity: current.severity,
            employeeId: current.employeeId,
          } as Prisma.InputJsonObject,
        },
        tx,
      );

      return tx.riskEvent.findUniqueOrThrow({
        where: { id },
      });
    });
  }

  async resolve(
    organizationId: string,
    id: string,
    actor: RiskActor,
    reason: string,
  ) {
    return this.closeRisk(
      organizationId,
      id,
      actor,
      RiskEventStatus.RESOLVED,
      reason,
    );
  }

  async dismiss(
    organizationId: string,
    id: string,
    actor: RiskActor,
    reason: string,
  ) {
    return this.closeRisk(
      organizationId,
      id,
      actor,
      RiskEventStatus.DISMISSED,
      reason,
    );
  }

  private async closeRisk(
    organizationId: string,
    id: string,
    actor: RiskActor,
    target: 'RESOLVED' | 'DISMISSED',
    reason: string,
  ) {
    const current = await this.findOne(organizationId, id);

    if (
      current.status !== RiskEventStatus.OPEN &&
      current.status !== RiskEventStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only OPEN or UNDER_REVIEW risk events can be closed',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.riskEvent.updateMany({
        where: {
          id,
          organizationId,
          status: {
            in: [RiskEventStatus.OPEN, RiskEventStatus.UNDER_REVIEW],
          },
        },
        data: {
          status: target,
          reviewedByUserId: current.reviewedByUserId ?? actor.id,
          reviewedAt: current.reviewedAt ?? now,
          resolvedByUserId: actor.id,
          resolvedAt: now,
          resolution: reason,
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException(
          'Risk event is no longer open for resolution',
        );
      }

      await this.auditService.log(
        {
          organizationId,
          action:
            target === RiskEventStatus.RESOLVED
              ? 'RISK_EVENT_RESOLVED'
              : 'RISK_EVENT_DISMISSED',
          entity: 'RiskEvent',
          entityId: id,
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          reason,
          metadata: {
            fromStatus: current.status,
            toStatus: target,
            riskType: current.type,
            severity: current.severity,
            employeeId: current.employeeId,
          } as Prisma.InputJsonObject,
        },
        tx,
      );

      return tx.riskEvent.findUniqueOrThrow({
        where: { id },
      });
    });
  }

  private async ensureEmployeeExists(
    organizationId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }
}
