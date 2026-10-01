import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Employee,
  EmployeeStatus,
  Prisma,
  RiskEventStatus,
  RiskEventType,
  RiskSeverity,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertPendingOnboardingChecker } from '../../common/auth/pending-onboarding-checker';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
type EmployeeWithDepartment = Employee & {
  department: {
    id: string;
    name: string;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
  };
};
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}
  private async assertEmployeeLimit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    adding: number,
  ) {
    // Serialize employee creation for this tenant to keep package seats consistent.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const subscription = await tx.platformSubscription.findUnique({
      where: { organizationId },
      include: { package: { select: { employeeLimit: true } } },
    });
    const limit = subscription?.package.employeeLimit;
    if (limit == null) return;
    const occupied = await tx.employee.count({
      where: { organizationId, status: { not: EmployeeStatus.TERMINATED } },
    });
    if (occupied + adding > limit) {
      throw new BadRequestException(
        `Employee package limit of ${limit} reached`,
      );
    }
  }
  private async positionFields(
    tx: Prisma.TransactionClient,
    org: string,
    departmentId: string,
    d: CreateEmployeeDto,
  ) {
    if (!d.firstName.trim() || !d.lastName.trim() || !d.phoneNumber.trim())
      throw new BadRequestException('Employee name and phone are required.');
    if (
      d.employmentEndDate &&
      (!d.employmentStartDate ||
        new Date(d.employmentEndDate) < new Date(d.employmentStartDate))
    )
      throw new BadRequestException('Employment end cannot precede start.');
    if (
      d.identityType &&
      d.identityNumber &&
      (await tx.employee.findFirst({
        where: {
          organizationId: org,
          identityType: d.identityType,
          identityNumber: d.identityNumber.trim(),
        },
      }))
    )
      throw new BadRequestException(
        'Identity already belongs to an employee in this company.',
      );
    let title = d.jobTitle?.trim();
    if (d.positionId) {
      const p = await tx.position.findFirst({
        where: {
          id: d.positionId,
          organizationId: org,
          departmentId,
          isActive: true,
        },
      });
      if (!p)
        throw new BadRequestException(
          'Choose an active position in the employee department and company.',
        );
      if (title && title !== p.name)
        throw new BadRequestException(
          'Job title must match the selected position.',
        );
      title = p.name;
    }
    return {
      positionId: d.positionId,
      jobTitle: title,
      employmentType: d.employmentType,
      employmentStartDate: d.employmentStartDate
        ? new Date(d.employmentStartDate)
        : undefined,
      employmentEndDate: d.employmentEndDate
        ? new Date(d.employmentEndDate)
        : undefined,
      identityType: d.identityType,
      identityNumber: d.identityNumber?.trim(),
    };
  }
  async create(
    organizationId: string,
    dto: CreateEmployeeDto,
    actor: TenantJwtUser,
  ) {
    const department = await this.prisma.department.findFirst({
      where: {
        id: dto.departmentId,
        organizationId,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const email = dto.email.trim().toLowerCase();
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const phoneNumber = dto.phoneNumber.trim();

    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        email,
        organizationId,
      },
    });

    if (existingEmployee) {
      throw new BadRequestException('Employee with this email already exists');
    }

    const possibleDuplicate = await this.findPossibleDuplicateEmployee(
      organizationId,
      {
        firstName,
        lastName,
        phoneNumber,
      },
    );

    const employee = await this.prisma.$transaction(async (tx) => {
      await this.assertEmployeeLimit(tx, organizationId, 1);
      const employeeNumber = await this.generateEmployeeNumber(
        tx,
        organizationId,
      );

      const createdEmployee = await tx.employee.create({
        data: {
          ...(await this.positionFields(
            tx,
            organizationId,
            dto.departmentId,
            dto,
          )),
          employeeNumber,
          firstName,
          lastName,
          email,
          phoneNumber,
          whatsappNumber: dto.whatsappNumber?.trim() || phoneNumber,
          whatsappOptInAt: null,
          departmentId: dto.departmentId,
          organizationId,
          createdByUserId: actor.sub,
          status: EmployeeStatus.PENDING_VERIFICATION,
        },
        include: {
          department: true,
        },
      });

      if (possibleDuplicate) {
        await this.createRiskEventIfMissing(tx, {
          organizationId,
          employeeId: createdEmployee.id,
          type: RiskEventType.DUPLICATE_EMPLOYEE,
          severity: RiskSeverity.MEDIUM,
          title: 'Possible duplicate employee',
          description:
            'A possible existing employee record matched this employee during creation and requires review.',
          sourceEntity: 'Employee',
          sourceEntityId: createdEmployee.id,
          detectedByUserId: actor.sub,
          metadata: {
            matchedEmployeeId: possibleDuplicate.id,
            matchBasis: ['firstName', 'lastName', 'phoneNumber'],
          },
        });
      }

      return createdEmployee;
    });

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeNumber: employee.employeeNumber,
        employeeEmail: employee.email,
        status: employee.status,
        createdByUserId: actor.sub,
        duplicateEmployeeRiskDetected: Boolean(possibleDuplicate),
      },
    });

    return this.sanitizeEmployee(employee);
  }

  async bulkCreate(
    organizationId: string,
    employees: CreateEmployeeDto[],
    actor: TenantJwtUser,
  ) {
    if (!employees.length) {
      throw new BadRequestException('No employees supplied');
    }
    if (employees.length > 1000) {
      throw new BadRequestException(
        'Bulk import is limited to 1000 employees per upload',
      );
    }
    const departments = await this.prisma.department.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
      },
    });
    const departmentIds = new Set(
      departments.map((department) => department.id),
    );
    const existing = await this.prisma.employee.findMany({
      where: {
        organizationId,
      },
      select: {
        email: true,
      },
    });
    const existingEmails = new Set(
      existing.map((employee) => employee.email.toLowerCase()),
    );
    const seen = new Set<string>();
    const errors: Array<{
      row: number;
      email: string;
      message: string;
    }> = [];
    const valid: CreateEmployeeDto[] = [];
    employees.forEach((employee, index) => {
      const email = employee.email.trim().toLowerCase();
      if (!departmentIds.has(employee.departmentId)) {
        errors.push({
          row: index + 2,
          email,
          message: 'Department not found',
        });
        return;
      }
      if (existingEmails.has(email) || seen.has(email)) {
        errors.push({
          row: index + 2,
          email,
          message: 'Duplicate employee email',
        });
        return;
      }
      seen.add(email);
      valid.push({
        ...employee,
        firstName: employee.firstName.trim(),
        lastName: employee.lastName.trim(),
        email,
        phoneNumber: employee.phoneNumber.trim(),
        whatsappNumber: employee.whatsappNumber?.trim(),
      });
    });
    if (errors.length) {
      return {
        imported: 0,
        failed: errors.length,
        errors,
        employees: [],
      };
    }
    const identities = new Set<string>();
    for (const d of valid) {
      if (d.identityType && d.identityNumber) {
        const key = JSON.stringify([d.identityType, d.identityNumber.trim()]);
        if (
          identities.has(key) ||
          (await this.prisma.employee.findFirst({
            where: {
              organizationId,
              identityType: d.identityType,
              identityNumber: d.identityNumber.trim(),
            },
          }))
        )
          throw new BadRequestException(
            'Duplicate identity in import or company; review before importing.',
          );
        identities.add(key);
      }
    }
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertEmployeeLimit(tx, organizationId, valid.length);
      const startingNumber = await this.getNextEmployeeSequence(
        tx,
        organizationId,
      );
      const results: EmployeeWithDepartment[] = [];
      for (let index = 0; index < valid.length; index += 1) {
        const employee = valid[index];
        const employeeNumber = this.formatEmployeeNumber(
          startingNumber + index,
        );
        const createdEmployee = await tx.employee.create({
          data: {
            ...(await this.positionFields(
              tx,
              organizationId,
              employee.departmentId,
              employee,
            )),
            employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            phoneNumber: employee.phoneNumber,
            whatsappNumber: employee.whatsappNumber ?? employee.phoneNumber,
            whatsappOptInAt: null,
            departmentId: employee.departmentId,
            organizationId,
            createdByUserId: actor.sub,
            status: EmployeeStatus.PENDING_VERIFICATION,
          },
          include: {
            department: true,
          },
        });
        results.push(createdEmployee);
      }
      return results;
    });
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEES_BULK_CREATED',
      entity: 'Employee',
      entityId: `bulk:${created.length}`,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        count: created.length,
        employeeIds: created.map((employee) => employee.id),
        employeeNumbers: created.map((employee) => employee.employeeNumber),
        createdByUserId: actor.sub,
        initialStatus: EmployeeStatus.PENDING_VERIFICATION,
      },
    });
    return {
      imported: created.length,
      failed: 0,
      errors: [],
      employees: created.map((employee) => this.sanitizeEmployee(employee)),
    };
  }
  async list(organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
      },
      include: {
        department: true,
      },
      orderBy: [
        {
          firstName: 'asc',
        },
        {
          lastName: 'asc',
        },
      ],
    });
    return employees.map((employee) => this.sanitizeEmployee(employee));
  }
  async findOne(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      include: {
        department: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.sanitizeEmployee(employee);
  }
  async update(
    organizationId: string,
    employeeId: string,
    dto: UpdateEmployeeDto,
    actor: TenantJwtUser,
  ) {
    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
    });
    if (!existingEmployee) {
      throw new NotFoundException('Employee not found');
    }
    if (existingEmployee.status === EmployeeStatus.TERMINATED) {
      throw new BadRequestException(
        'Terminated employees cannot be edited through the employee profile endpoint',
      );
    }
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          organizationId,
        },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }
    const effectiveDepartment =
      dto.departmentId ?? existingEmployee.departmentId;
    const effectivePosition = dto.positionId ?? existingEmployee.positionId;
    let selectedPosition: { id: string; name: string } | null = null;
    if (
      effectivePosition &&
      (dto.positionId !== undefined ||
        dto.departmentId !== undefined ||
        dto.jobTitle !== undefined)
    ) {
      selectedPosition = await this.prisma.position.findFirst({
        where: {
          id: effectivePosition,
          organizationId,
          departmentId: effectiveDepartment,
          isActive: true,
        },
      });
      if (!selectedPosition)
        throw new BadRequestException(
          'Choose an active position in the destination department.',
        );
      if (
        dto.jobTitle !== undefined &&
        dto.jobTitle.trim() !== selectedPosition.name
      )
        throw new BadRequestException(
          'Job title must match the selected position.',
        );
    }
    const normalizedEmail =
      dto.email !== undefined ? dto.email.trim().toLowerCase() : undefined;
    if (
      normalizedEmail !== undefined &&
      normalizedEmail !== existingEmployee.email.toLowerCase()
    ) {
      const duplicate = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          email: normalizedEmail,
          NOT: {
            id: employeeId,
          },
        },
      });
      if (duplicate) {
        throw new BadRequestException(
          'Employee with this email already exists',
        );
      }
    }
    const identityTypeChanged =
      dto.identityType !== undefined &&
      dto.identityType !== existingEmployee.identityType;
    const normalizedIdentityNumber =
      dto.identityNumber !== undefined
        ? dto.identityNumber.trim() || null
        : undefined;
    const identityNumberChanged =
      normalizedIdentityNumber !== undefined &&
      normalizedIdentityNumber !== existingEmployee.identityNumber;

    const effectiveIdentityType =
      dto.identityType ?? existingEmployee.identityType;

    let duplicateIdentityEmployee: Employee | null = null;

    if (
      (identityTypeChanged || identityNumberChanged) &&
      effectiveIdentityType &&
      normalizedIdentityNumber
    ) {
      duplicateIdentityEmployee = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          identityType: effectiveIdentityType,
          identityNumber: normalizedIdentityNumber,
          NOT: {
            id: employeeId,
          },
        },
      });
    }
    if (
      (identityTypeChanged || identityNumberChanged) &&
      existingEmployee.status !== EmployeeStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        'Verified identity details cannot be changed through the employee profile endpoint. A controlled re-verification workflow is required.',
      );
    }
    const employmentStartDate =
      dto.employmentStartDate !== undefined
        ? new Date(dto.employmentStartDate)
        : existingEmployee.employmentStartDate;
    const employmentEndDate =
      dto.employmentEndDate !== undefined
        ? new Date(dto.employmentEndDate)
        : existingEmployee.employmentEndDate;
    this.validateEmploymentDates(employmentStartDate, employmentEndDate);
    const data: Prisma.EmployeeUpdateInput = {};
    const changedFields: string[] = [];
    if (dto.firstName !== undefined) {
      const value = dto.firstName.trim();
      if (!value) {
        throw new BadRequestException('First name cannot be empty');
      }
      if (value !== existingEmployee.firstName) {
        data.firstName = value;
        changedFields.push('firstName');
      }
    }
    if (dto.lastName !== undefined) {
      const value = dto.lastName.trim();
      if (!value) {
        throw new BadRequestException('Last name cannot be empty');
      }
      if (value !== existingEmployee.lastName) {
        data.lastName = value;
        changedFields.push('lastName');
      }
    }
    if (
      normalizedEmail !== undefined &&
      normalizedEmail !== existingEmployee.email
    ) {
      data.email = normalizedEmail;
      changedFields.push('email');
    }
    if (dto.phoneNumber !== undefined) {
      const value = dto.phoneNumber.trim();
      if (!value) {
        throw new BadRequestException('Phone number cannot be empty');
      }
      if (value !== existingEmployee.phoneNumber) {
        data.phoneNumber = value;
        changedFields.push('phoneNumber');
      }
    }
    if (dto.whatsappNumber !== undefined) {
      const value = dto.whatsappNumber.trim();
      if (value !== (existingEmployee.whatsappNumber ?? '')) {
        data.whatsappNumber = value || null;
        data.whatsappOptInAt = null;
        changedFields.push('whatsappNumber');
      }
    }
    if (
      dto.departmentId !== undefined &&
      dto.departmentId !== existingEmployee.departmentId
    ) {
      data.department = {
        connect: {
          id: dto.departmentId,
        },
      };
      changedFields.push('departmentId');
    }
    if (dto.positionId !== undefined && selectedPosition) {
      data.position = {
        connect: {
          organizationId_departmentId_id: {
            organizationId,
            departmentId: effectiveDepartment,
            id: selectedPosition.id,
          },
        },
      };
      data.jobTitle = selectedPosition.name;
      changedFields.push('positionId', 'jobTitle');
    }
    if (dto.jobTitle !== undefined) {
      const value = dto.jobTitle.trim();
      const normalized = value || null;
      if (normalized !== existingEmployee.jobTitle) {
        data.jobTitle = normalized;
        changedFields.push('jobTitle');
      }
    }
    if (
      dto.employmentType !== undefined &&
      dto.employmentType !== existingEmployee.employmentType
    ) {
      data.employmentType = dto.employmentType;
      changedFields.push('employmentType');
    }
    if (dto.employmentStartDate !== undefined) {
      const value = new Date(dto.employmentStartDate);
      if (
        !existingEmployee.employmentStartDate ||
        value.getTime() !== existingEmployee.employmentStartDate.getTime()
      ) {
        data.employmentStartDate = value;
        changedFields.push('employmentStartDate');
      }
    }
    if (dto.employmentEndDate !== undefined) {
      const value = new Date(dto.employmentEndDate);
      if (
        !existingEmployee.employmentEndDate ||
        value.getTime() !== existingEmployee.employmentEndDate.getTime()
      ) {
        data.employmentEndDate = value;
        changedFields.push('employmentEndDate');
      }
    }
    if (identityTypeChanged) {
      data.identityType = dto.identityType;
      changedFields.push('identityType');
    }
    if (identityNumberChanged) {
      data.identityNumber = normalizedIdentityNumber;
      changedFields.push('identityNumber');
    }
    if (!changedFields.length) {
      return this.findOne(organizationId, employeeId);
    }
    const employee = await this.prisma.$transaction(async (tx) => {
      const updatedEmployee = await tx.employee.update({
        where: {
          id: employeeId,
        },
        data,
        include: {
          department: true,
        },
      });

      if (duplicateIdentityEmployee) {
        await this.createRiskEventIfMissing(tx, {
          organizationId,
          employeeId: updatedEmployee.id,
          type: RiskEventType.DUPLICATE_IDENTITY,
          severity: RiskSeverity.HIGH,
          title: 'Duplicate employee identity detected',
          description:
            'The employee identity details match another employee record in the same organization and require review before activation.',
          sourceEntity: 'Employee',
          sourceEntityId: updatedEmployee.id,
          detectedByUserId: actor.sub,
          metadata: {
            matchedEmployeeId: duplicateIdentityEmployee.id,
            identityType: effectiveIdentityType,
          },
        });
      }

      return updatedEmployee;
    });
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_PROFILE_UPDATED',
      entity: 'Employee',
      entityId: employee.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        changedFields,
        duplicateIdentityRiskDetected: Boolean(duplicateIdentityEmployee),
      },
    });
    return this.sanitizeEmployee(employee);
  }
  async activate(
    organizationId: string,
    employeeId: string,
    actor: TenantJwtUser,
    onboarding = false,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findFirst({
        where: { id: employeeId, organizationId },
        include: { department: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      if (employee.status !== EmployeeStatus.PENDING_VERIFICATION) {
        throw new BadRequestException(
          `Only employees with status ${EmployeeStatus.PENDING_VERIFICATION} can be activated`,
        );
      }
      if (
        employee.positionId &&
        !(await transaction.position.findFirst({
          where: {
            id: employee.positionId,
            organizationId,
            departmentId: employee.departmentId,
            isActive: true,
          },
        }))
      )
        throw new BadRequestException(
          'Employee position is retired or no longer matches the department.',
        );
      const missingFields = this.getActivationMissingFields(employee);
      if (missingFields.length) {
        throw new BadRequestException({
          message: 'Employee profile is incomplete and cannot be activated',
          missingFields,
        });
      }
      this.validateEmploymentDates(
        employee.employmentStartDate,
        employee.employmentEndDate,
      );

      const unresolvedDuplicateIdentityRisk =
        await transaction.riskEvent.findFirst({
          where: {
            organizationId,
            employeeId: employee.id,
            type: RiskEventType.DUPLICATE_IDENTITY,
            status: {
              in: [RiskEventStatus.OPEN, RiskEventStatus.UNDER_REVIEW],
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (unresolvedDuplicateIdentityRisk) {
        throw new BadRequestException({
          message:
            'Employee cannot be activated while a duplicate identity risk event is unresolved',
          riskEventId: unresolvedDuplicateIdentityRisk.id,
          riskStatus: unresolvedDuplicateIdentityRisk.status,
        });
      }

      const maker = await this.validateActivationChecker(
        organizationId,
        employee,
        actor,
        transaction,
        onboarding,
      );
      const now = new Date();
      const result = await transaction.employee.updateMany({
        where: {
          id: employee.id,
          organizationId,
          status: EmployeeStatus.PENDING_VERIFICATION,
        },
        data: {
          status: EmployeeStatus.ACTIVE,
          verifiedAt: now,
          verifiedByUserId: actor.sub,
          activatedAt: now,
          activatedByUserId: actor.sub,
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException(
          'Employee status changed before activation could be completed. Refresh the employee and try again.',
        );
      }
      const activatedEmployee = await transaction.employee.findFirst({
        where: { id: employee.id, organizationId },
        include: { department: true },
      });
      if (!activatedEmployee) throw new NotFoundException('Employee not found');
      await this.auditService.log(
        {
          organizationId,
          action: 'EMPLOYEE_ACTIVATED',
          entity: 'Employee',
          entityId: activatedEmployee.id,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
          metadata: {
            employeeNumber: activatedEmployee.employeeNumber,
            previousStatus: EmployeeStatus.PENDING_VERIFICATION,
            newStatus: EmployeeStatus.ACTIVE,
            makerUserId: maker.id,
            makerRole: maker.role,
            checkerUserId: actor.sub,
            checkerRole: actor.role,
            onboardingIndependentAdmin: maker.onboardingIndependentAdmin,
            verifiedAt: now.toISOString(),
            activatedAt: now.toISOString(),
          },
        },
        transaction,
      );
      return this.sanitizeEmployee(activatedEmployee);
    });
  }
  async suspend(
    organizationId: string,
    employeeId: string,
    reason: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.getEmployeeForLifecycle(
      organizationId,
      employeeId,
    );
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException(
        `Only employees with status ${EmployeeStatus.ACTIVE} can be suspended`,
      );
    }
    const normalizedReason = this.normalizeLifecycleReason(reason);
    const result = await this.prisma.employee.updateMany({
      where: {
        id: employee.id,
        organizationId,
        status: EmployeeStatus.ACTIVE,
      },
      data: {
        status: EmployeeStatus.SUSPENDED,
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException(
        'Employee status changed before suspension could be completed. Refresh the employee and try again.',
      );
    }
    const updated = await this.getEmployeeForLifecycle(
      organizationId,
      employee.id,
    );
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_SUSPENDED',
      entity: 'Employee',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      reason: normalizedReason,
      metadata: {
        employeeNumber: updated.employeeNumber,
        previousStatus: EmployeeStatus.ACTIVE,
        newStatus: EmployeeStatus.SUSPENDED,
      },
    });
    return this.sanitizeEmployee(updated);
  }
  async reactivate(
    organizationId: string,
    employeeId: string,
    reason: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.getEmployeeForLifecycle(
      organizationId,
      employeeId,
    );
    if (employee.status !== EmployeeStatus.SUSPENDED) {
      throw new BadRequestException(
        `Only employees with status ${EmployeeStatus.SUSPENDED} can be reactivated`,
      );
    }
    const normalizedReason = this.normalizeLifecycleReason(reason);
    const missingFields = this.getActivationMissingFields(employee);
    if (missingFields.length) {
      throw new BadRequestException({
        message: 'Employee profile is incomplete and cannot be reactivated',
        missingFields,
      });
    }
    this.validateEmploymentDates(
      employee.employmentStartDate,
      employee.employmentEndDate,
    );
    const result = await this.prisma.employee.updateMany({
      where: {
        id: employee.id,
        organizationId,
        status: EmployeeStatus.SUSPENDED,
      },
      data: {
        status: EmployeeStatus.ACTIVE,
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException(
        'Employee status changed before reactivation could be completed. Refresh the employee and try again.',
      );
    }
    const updated = await this.getEmployeeForLifecycle(
      organizationId,
      employee.id,
    );
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_REACTIVATED',
      entity: 'Employee',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      reason: normalizedReason,
      metadata: {
        employeeNumber: updated.employeeNumber,
        previousStatus: EmployeeStatus.SUSPENDED,
        newStatus: EmployeeStatus.ACTIVE,
      },
    });
    return this.sanitizeEmployee(updated);
  }
  async terminate(
    organizationId: string,
    employeeId: string,
    reason: string,
    actor: TenantJwtUser,
  ) {
    const employee = await this.getEmployeeForLifecycle(
      organizationId,
      employeeId,
    );
    if (
      employee.status !== EmployeeStatus.ACTIVE &&
      employee.status !== EmployeeStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Only ACTIVE or SUSPENDED employees can be terminated',
      );
    }
    const normalizedReason = this.normalizeLifecycleReason(reason);
    const previousStatus = employee.status;
    const now = new Date();
    const result = await this.prisma.employee.updateMany({
      where: {
        id: employee.id,
        organizationId,
        status: previousStatus,
      },
      data: {
        status: EmployeeStatus.TERMINATED,
        terminatedAt: now,
        terminationReason: normalizedReason,
        employmentEndDate: employee.employmentEndDate ?? now,
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException(
        'Employee status changed before termination could be completed. Refresh the employee and try again.',
      );
    }
    const updated = await this.getEmployeeForLifecycle(
      organizationId,
      employee.id,
    );
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_TERMINATED',
      entity: 'Employee',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      reason: normalizedReason,
      metadata: {
        employeeNumber: updated.employeeNumber,
        previousStatus,
        newStatus: EmployeeStatus.TERMINATED,
        terminatedAt: now.toISOString(),
      },
    });
    return this.sanitizeEmployee(updated);
  }
  private async validateActivationChecker(
    organizationId: string,
    employee: Employee,
    actor: TenantJwtUser,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    onboarding = false,
  ) {
    if (!employee.createdByUserId) {
      throw new BadRequestException(
        'Employee creator information is missing. This legacy employee requires an administrative review before activation.',
      );
    }
    if (employee.createdByUserId === actor.sub) {
      throw new ForbiddenException(
        'The user who created the employee cannot activate the same employee',
      );
    }
    const maker = await db.user.findUnique({
      where: {
        id: employee.createdByUserId,
      },
      select: {
        id: true,
        role: true,
        organizationId: true,
      },
    });
    if (!maker) {
      throw new BadRequestException(
        'Employee creator account could not be found. Administrative review is required.',
      );
    }
    const platformMaker =
      maker.role === UserRole.SUPER_ADMIN ||
      maker.role === UserRole.PLATFORM_ADMIN;
    if (!platformMaker && maker.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Employee creator does not belong to this organization',
      );
    }
    const allowedCheckerRoles = this.getAllowedCheckerRoles(maker.role);
    if (!allowedCheckerRoles.includes(actor.role)) {
      if (
        onboarding &&
        maker.role === UserRole.COMPANY_ADMIN &&
        actor.role === UserRole.COMPANY_ADMIN
      ) {
        await assertPendingOnboardingChecker(
          db as Prisma.TransactionClient,
          organizationId,
          maker.id,
          actor.sub,
        );
        return { ...maker, onboardingIndependentAdmin: true };
      }
      throw new ForbiddenException(
        `Role ${actor.role} is not permitted to activate an employee created by ${maker.role}`,
      );
    }
    return { ...maker, onboardingIndependentAdmin: false };
  }
  private getAllowedCheckerRoles(makerRole: UserRole): UserRole[] {
    switch (makerRole) {
      case UserRole.HR_ADMIN:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];
      case UserRole.PAYROLL_ADMIN:
        return [UserRole.HR_ADMIN, UserRole.COMPANY_ADMIN];
      case UserRole.COMPANY_ADMIN:
        return [UserRole.HR_ADMIN, UserRole.PAYROLL_ADMIN];
      case UserRole.EXECUTIVE:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];
      case UserRole.SUPER_ADMIN:
      case UserRole.PLATFORM_ADMIN:
        return [
          UserRole.HR_ADMIN,
          UserRole.PAYROLL_ADMIN,
          UserRole.COMPANY_ADMIN,
        ];
      default:
        return [];
    }
  }
  private async findPossibleDuplicateEmployee(
    organizationId: string,
    input: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
    },
  ) {
    return this.prisma.employee.findFirst({
      where: {
        organizationId,
        firstName: {
          equals: input.firstName,
          mode: 'insensitive',
        },
        lastName: {
          equals: input.lastName,
          mode: 'insensitive',
        },
        phoneNumber: input.phoneNumber,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  private async createRiskEventIfMissing(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      employeeId: string;
      type: RiskEventType;
      severity: RiskSeverity;
      title: string;
      description: string;
      sourceEntity: string;
      sourceEntityId: string;
      detectedByUserId: string;
      metadata: Prisma.InputJsonValue;
    },
  ) {
    const existingRisk = await tx.riskEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        type: input.type,
        sourceEntity: input.sourceEntity,
        sourceEntityId: input.sourceEntityId,
        status: {
          in: [RiskEventStatus.OPEN, RiskEventStatus.UNDER_REVIEW],
        },
      },
      select: {
        id: true,
      },
    });

    if (existingRisk) {
      return existingRisk;
    }

    return tx.riskEvent.create({
      data: {
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        type: input.type,
        severity: input.severity,
        status: RiskEventStatus.OPEN,
        title: input.title,
        description: input.description,
        sourceEntity: input.sourceEntity,
        sourceEntityId: input.sourceEntityId,
        detectedByUserId: input.detectedByUserId,
        metadata: input.metadata,
      },
      select: {
        id: true,
      },
    });
  }

  private async getEmployeeForLifecycle(
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeeWithDepartment> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      include: {
        department: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }
  private getActivationMissingFields(employee: Employee) {
    const missingFields: string[] = [];
    if (!employee.firstName.trim()) {
      missingFields.push('firstName');
    }
    if (!employee.lastName.trim()) {
      missingFields.push('lastName');
    }
    if (!employee.email.trim()) {
      missingFields.push('email');
    }
    if (!employee.phoneNumber?.trim()) {
      missingFields.push('phoneNumber');
    }
    if (!employee.departmentId) {
      missingFields.push('departmentId');
    }
    if (!employee.employeeNumber.trim()) {
      missingFields.push('employeeNumber');
    }
    if (!employee.jobTitle?.trim()) {
      missingFields.push('jobTitle');
    }
    if (!employee.employmentType) {
      missingFields.push('employmentType');
    }
    if (!employee.employmentStartDate) {
      missingFields.push('employmentStartDate');
    }
    if (!employee.identityType) {
      missingFields.push('identityType');
    }
    if (!employee.identityNumber?.trim()) {
      missingFields.push('identityNumber');
    }
    return missingFields;
  }
  private validateEmploymentDates(
    startDate: Date | null,
    endDate: Date | null,
  ) {
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'Employment end date cannot be before employment start date',
      );
    }
  }
  private normalizeLifecycleReason(reason: string) {
    const normalized = reason.trim();
    if (!normalized) {
      throw new BadRequestException('Reason is required');
    }
    return normalized;
  }
  private sanitizeEmployee<
    T extends {
      identityNumber: string | null;
    },
  >(
    employee: T,
  ): Omit<T, 'identityNumber'> & {
    identityNumber: string | null;
  } {
    return {
      ...employee,
      identityNumber: this.maskIdentityNumber(employee.identityNumber),
    };
  }
  private maskIdentityNumber(identityNumber: string | null): string | null {
    if (!identityNumber) {
      return null;
    }
    const normalized = identityNumber.trim();
    if (!normalized) {
      return null;
    }
    const visibleDigits = normalized.slice(-4);
    return `\*\*\*\*\*\*\*\*${visibleDigits}`;
  }
  private async generateEmployeeNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const sequence = await this.getNextEmployeeSequence(tx, organizationId);
    return this.formatEmployeeNumber(sequence);
  }
  private async getNextEmployeeSequence(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const employees = await tx.employee.findMany({
      where: {
        organizationId,
        employeeNumber: {
          startsWith: 'EMP-',
        },
      },
      select: {
        employeeNumber: true,
      },
    });
    let highest = 0;
    for (const employee of employees) {
      const match = /^EMP-(\d+)$/.exec(employee.employeeNumber);
      if (!match) {
        continue;
      }
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > highest) {
        highest = value;
      }
    }
    return highest + 1;
  }
  private formatEmployeeNumber(sequence: number) {
    return `EMP-${String(sequence).padStart(6, '0')}`;
  }
}
