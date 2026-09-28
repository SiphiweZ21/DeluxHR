import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    organizationId: string;
    action: string;
    entity: string;
    entityId: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
      },
    });
  }

  async list(organizationId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
