import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import {
  AssignBenefitDto,
  AssignDeductionDto,
  CreateBenefitPlanDto,
  CreateDeductionDefinitionDto,
  UpdatePayrollSettingsDto,
  UpsertPayrollProfileDto,
} from './dto/payroll-configuration.dto';

@Injectable()
export class PayrollConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  settings(org: string) {
    return this.prisma.payrollSettings.upsert({
      where: {
        organizationId: org,
      },
      update: {},
      create: {
        organizationId: org,
      },
    });
  }

  updateSettings(org: string, dto: UpdatePayrollSettingsDto) {
    return this.prisma.payrollSettings.upsert({
      where: {
        organizationId: org,
      },
      update: dto,
      create: {
        organizationId: org,
        ...dto,
      },
    });
  }

  async profiles(org: string) {
    return this.prisma.employee.findMany({
      where: {
        organizationId: org,
      },
      include: {
        department: true,
        payrollProfile: {
          include: {
            benefits: {
              include: {
                benefitPlan: true,
              },
            },
            deductions: {
              include: {
                deductionDefinition: true,
              },
            },
          },
        },
      },
      orderBy: {
        firstName: 'asc',
      },
    });
  }

  async profile(org: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: org,
      },
      include: {
        department: true,
        payrollProfile: {
          include: {
            benefits: {
              include: {
                benefitPlan: true,
              },
            },
            deductions: {
              include: {
                deductionDefinition: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async upsertProfile(
    org: string,
    employeeId: string,
    dto: UpsertPayrollProfileDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: org,
      },
      include: {
        payrollProfile: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const existingProfile = employee.payrollProfile;

    if (existingProfile) {
      const directCompensationChanges: string[] = [];

      if (
        dto.basicSalary !== undefined &&
        dto.basicSalary !== existingProfile.basicSalary
      ) {
        directCompensationChanges.push('basicSalary');
      }

      if (
        dto.pensionableSalary !== undefined &&
        dto.pensionableSalary !== existingProfile.pensionableSalary
      ) {
        directCompensationChanges.push('pensionableSalary');
      }

      if (
        dto.hourlyRate !== undefined &&
        dto.hourlyRate !== existingProfile.hourlyRate
      ) {
        directCompensationChanges.push('hourlyRate');
      }

      if (directCompensationChanges.length > 0) {
        throw new BadRequestException(
          'Existing compensation cannot be changed directly. Submit a compensation change request for approval.',
        );
      }
    }

    const data = {
      taxNumber: dto.taxNumber,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      payFrequency: dto.payFrequency,
      medicalAidDependants: dto.medicalAidDependants,
      ...(existingProfile
        ? {}
        : {
            basicSalary: dto.basicSalary,
            pensionableSalary: dto.pensionableSalary,
            hourlyRate: dto.hourlyRate,
          }),
    };

    return this.prisma.employeePayrollProfile.upsert({
      where: {
        employeeId,
      },
      update: data,
      create: {
        organizationId: org,
        employeeId,
        ...data,
      },
      include: {
        benefits: {
          include: {
            benefitPlan: true,
          },
        },
        deductions: {
          include: {
            deductionDefinition: true,
          },
        },
      },
    });
  }

  benefits(org: string) {
    return this.prisma.benefitPlan.findMany({
      where: {
        organizationId: org,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  createBenefit(org: string, dto: CreateBenefitPlanDto) {
    if (dto.employeeMethod === 'NONE' && dto.employerMethod === 'NONE') {
      throw new BadRequestException(
        'At least one contribution side must be configured',
      );
    }

    return this.prisma.benefitPlan.create({
      data: {
        organizationId: org,
        ...dto,
      },
    });
  }

  deductions(org: string) {
    return this.prisma.payrollDeductionDefinition.findMany({
      where: {
        organizationId: org,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  createDeduction(org: string, dto: CreateDeductionDefinitionDto) {
    return this.prisma.payrollDeductionDefinition.create({
      data: {
        organizationId: org,
        ...dto,
      },
    });
  }

  async assignBenefit(org: string, employeeId: string, dto: AssignBenefitDto) {
    const profile = await this.ensureProfile(org, employeeId);

    const plan = await this.prisma.benefitPlan.findFirst({
      where: {
        id: dto.benefitPlanId,
        organizationId: org,
      },
    });

    if (!plan) {
      throw new NotFoundException('Benefit plan not found');
    }

    return this.prisma.employeeBenefit.upsert({
      where: {
        payrollProfileId_benefitPlanId: {
          payrollProfileId: profile.id,
          benefitPlanId: plan.id,
        },
      },

      update: {
        membershipNumber: dto.membershipNumber,
        employeeMethodOverride: dto.employeeMethodOverride,
        employeeValueOverride: dto.employeeValueOverride,
        employerMethodOverride: dto.employerMethodOverride,
        employerValueOverride: dto.employerValueOverride,
      },

      create: {
        organizationId: org,
        payrollProfileId: profile.id,
        benefitPlanId: plan.id,
        membershipNumber: dto.membershipNumber,
        employeeMethodOverride: dto.employeeMethodOverride,
        employeeValueOverride: dto.employeeValueOverride,
        employerMethodOverride: dto.employerMethodOverride,
        employerValueOverride: dto.employerValueOverride,
      },

      include: {
        benefitPlan: true,
      },
    });
  }

  async assignDeduction(
    org: string,
    employeeId: string,
    dto: AssignDeductionDto,
  ) {
    const profile = await this.ensureProfile(org, employeeId);

    const definition = await this.prisma.payrollDeductionDefinition.findFirst({
      where: {
        id: dto.deductionDefinitionId,
        organizationId: org,
      },
    });

    if (!definition) {
      throw new NotFoundException('Deduction not found');
    }

    return this.prisma.employeeDeduction.upsert({
      where: {
        payrollProfileId_deductionDefinitionId: {
          payrollProfileId: profile.id,
          deductionDefinitionId: definition.id,
        },
      },

      update: {
        method: dto.method,
        value: dto.value,
      },

      create: {
        organizationId: org,
        payrollProfileId: profile.id,
        deductionDefinitionId: definition.id,
        method: dto.method,
        value: dto.value,
      },

      include: {
        deductionDefinition: true,
      },
    });
  }

  removeBenefit(org: string, id: string) {
    return this.prisma.employeeBenefit.deleteMany({
      where: {
        id,
        organizationId: org,
      },
    });
  }

  removeDeduction(org: string, id: string) {
    return this.prisma.employeeDeduction.deleteMany({
      where: {
        id,
        organizationId: org,
      },
    });
  }

  private async ensureProfile(org: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: org,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.employeePayrollProfile.upsert({
      where: {
        employeeId,
      },
      update: {},
      create: {
        organizationId: org,
        employeeId,
      },
    });
  }
}
