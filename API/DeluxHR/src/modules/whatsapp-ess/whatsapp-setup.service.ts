import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizePhone } from '../../common/employee-contact';
import { hashPassword } from '../../common/auth/password';
import { ROLE_PERMISSION_PRESETS } from '../../common/access/permission-presets';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import type { WhatsAppSetupDto } from './whatsapp-setup.controller';
@Injectable()
export class WhatsAppSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(actor: TenantJwtUser) {
    const [employees, users] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          organizationId: actor.organizationId,
          status: EmployeeStatus.ACTIVE,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          email: true,
          whatsappNumber: true,
          whatsappOptInAt: true,
          userId: true,
          user: { select: { email: true, isActive: true } },
          whatsappEssIdentity: { select: { isActive: true } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          organizationId: actor.organizationId,
          role: UserRole.EMPLOYEE,
          isActive: true,
          employee: { is: null },
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return { employees, users };
  }
  async save(actor: TenantJwtUser, dto: WhatsAppSetupDto) {
    if (
      dto.consent !== true ||
      !dto.consentNote?.trim() ||
      !/^\d{6,8}$/.test(dto.pin)
    )
      throw new BadRequestException(
        'Consent, a consent note and a 6–8 digit PIN are required',
      );
    const phone = normalizePhone(dto.whatsappNumber);
    if (dto.existingUserId && (dto.email || dto.password))
      throw new BadRequestException(
        'Choose an existing account or create a new account',
      );
    const pinHash = await hashPassword(dto.pin);
    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const employee = await tx.employee.findFirst({
            where: {
              id: dto.employeeId,
              organizationId: actor.organizationId,
              status: EmployeeStatus.ACTIVE,
            },
          });
          if (!employee)
            throw new NotFoundException(
              'Active employee not found in your company',
            );
          const numbers = await tx.employee.findMany({
            where: { id: { not: employee.id }, whatsappNumber: { not: null } },
            select: { whatsappNumber: true },
          });
          if (
            numbers.some((e) => {
              try {
                return normalizePhone(e.whatsappNumber!) === phone;
              } catch {
                return e.whatsappNumber?.replace(/\D/g, '') === phone.slice(1);
              }
            })
          )
            throw new ConflictException(
              'WhatsApp number is already assigned to another employee',
            );
          let userId = employee.userId;
          if (userId && (dto.existingUserId || dto.email || dto.password))
            throw new BadRequestException(
              'Employee already has a linked account; keep that account',
            );
          if (!userId && dto.existingUserId) {
            const user = await tx.user.findFirst({
              where: {
                id: dto.existingUserId,
                organizationId: actor.organizationId,
                role: UserRole.EMPLOYEE,
                isActive: true,
                employee: { is: null },
              },
            });
            if (!user)
              throw new BadRequestException(
                'Choose an active, unlinked employee account in your company',
              );
            userId = user.id;
          }
          if (!userId) {
            if (!dto.email || !passwordHash || dto.password!.length < 12)
              throw new BadRequestException(
                'Provide an email and password of at least 12 characters, or select an existing account',
              );
            const user = await tx.user.create({
              data: {
                fullName: `${employee.firstName} ${employee.lastName}`,
                email: dto.email.trim().toLowerCase(),
                passwordHash,
                role: UserRole.EMPLOYEE,
                organizationId: actor.organizationId,
                isActive: true,
              },
            });
            userId = user.id;
            for (const grant of ROLE_PERMISSION_PRESETS[UserRole.EMPLOYEE] ??
              [])
              await tx.userPermission.create({
                data: {
                  organizationId: actor.organizationId,
                  userId,
                  ...grant,
                },
              });
          } else {
            const user = await tx.user.findFirst({
              where: {
                id: userId,
                organizationId: actor.organizationId,
                isActive: true,
              },
            });
            if (!user)
              throw new BadRequestException(
                'Linked account is inactive or belongs to another company',
              );
          }
          await tx.employee.update({
            where: { id: employee.id },
            data: {
              userId,
              whatsappNumber: phone,
              whatsappOptInAt: new Date(),
            },
          });
          await tx.whatsAppEssIdentity.upsert({
            where: { employeeId: employee.id },
            create: {
              organizationId: actor.organizationId,
              employeeId: employee.id,
              pinHash,
            },
            update: { pinHash, isActive: true },
          });
          await tx.whatsAppEssSession.deleteMany({
            where: { employeeId: employee.id },
          });
          await this.audit.log(
            {
              organizationId: actor.organizationId,
              actorUserId: actor.sub,
              actorEmail: actor.email,
              actorRole: actor.role,
              entity: 'Employee',
              entityId: dto.employeeId,
              action: 'WHATSAPP_ESS_SETUP_COMPLETED',
              metadata: {
                consent: true,
                consentNote: dto.consentNote.trim(),
                userId,
              },
            },
            tx,
          );
          return {
            employeeId: employee.id,
            userId,
            whatsappNumber: phone,
            isActive: true,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Email, account or phone is already in use, or setup changed concurrently. Refresh and retry.',
        );
      throw error;
    }
  }
  async revoke(actor: TenantJwtUser, employeeId: string) {
    await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: actor.organizationId },
      });
      if (!employee)
        throw new NotFoundException('Employee not found in your company');
      await tx.employee.update({
        where: { id: employeeId },
        data: { whatsappOptInAt: null },
      });
      await tx.whatsAppEssIdentity.updateMany({
        where: { employeeId },
        data: { isActive: false },
      });
      await tx.whatsAppEssSession.deleteMany({ where: { employeeId } });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
          entity: 'Employee',
          entityId: employeeId,
          action: 'WHATSAPP_ESS_CONSENT_REVOKED',
        },
        tx,
      );
    });
    return { employeeId, isActive: false };
  }
}
