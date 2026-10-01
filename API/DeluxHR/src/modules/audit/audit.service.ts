import { Injectable } from '@nestjs/common';
import { Prisma, type UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

type AuditDatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    params: {
      organizationId: string;
      action: string;
      entity: string;
      entityId: string;
      actorUserId?: string;
      actorEmail?: string;
      actorRole?: UserRole;
      reason?: string;
      metadata?: Prisma.InputJsonValue;
    },
    databaseClient?: AuditDatabaseClient,
  ) {
    const database = databaseClient ?? this.prisma;

    return database.auditLog.create({
      data: {
        organizationId: params.organizationId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole,
        reason: params.reason,
        metadata: params.metadata,
      },
    });
  }

  async list(organizationId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
