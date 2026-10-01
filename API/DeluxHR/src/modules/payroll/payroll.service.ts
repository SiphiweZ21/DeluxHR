import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ContributionMethod,
  EmployeeStatus,
  PayrollRunStatus,
  Prisma,
  RiskEventStatus,
  RiskEventType,
  RiskSeverity,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';

import { UpdatePayrollRunStatusDto } from './dto/update-payroll-run-status.dto';

import { SaTaxEngineService } from './tax-engine/sa-tax-engine.service';

interface BenefitBreakdownItem {
  id: string;

  planId: string;

  name: string;

  providerName: string | null;

  type: string;

  employeeAmount: number;

  employerAmount: number;
}

interface DeductionBreakdownItem {
  id: string;

  definitionId: string;

  name: string;

  creditorName: string | null;

  amount: number;
}

interface PayrollGenerationOptions {
  payrollBatchId?: string;
}

interface PayrollLedgerItem {
  organizationId: string;

  employeeId: string;

  payrollRunId: string;

  sequence: number;

  category: any;

  effect: any;

  code: string;

  description: string;

  amount: number;

  currency: string;

  creditorName?: string;

  sourceType?: string;

  sourceId?: string;

  metadata?: any;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly taxEngine: SaTaxEngineService,
  ) {}

  async create(organizationId: string, dto: CreatePayrollRunDto) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        organizationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.assertEmployeePayrollEligible(
      organizationId,
      employee,
      undefined,
      'PAYROLL_RUN_CREATE',
    );

    return this.prisma.payrollRun.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        title: dto.title,
        payPeriodStart: new Date(dto.payPeriodStart),
        payPeriodEnd: new Date(dto.payPeriodEnd),
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        notes: dto.notes,
      },
      include: {
        employee: true,
        earnings: true,
        payslip: true,
        ledgerEntries: {
          orderBy: {
            sequence: 'asc',
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async listAll(organizationId: string) {
    return this.prisma.payrollRun.findMany({
      where: {
        organizationId,
      },

      orderBy: {
        createdAt: 'desc',
      },

      include: {
        employee: true,

        earnings: true,

        payslip: true,

        ledgerEntries: {
          orderBy: {
            sequence: 'asc',
          },
        },

        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async listByEmployee(
    organizationId: string,

    employeeId: string,
  ) {
    return this.prisma.payrollRun.findMany({
      where: {
        organizationId,

        employeeId,
      },

      orderBy: {
        payPeriodStart: 'desc',
      },

      include: {
        employee: true,

        earnings: true,

        payslip: true,

        ledgerEntries: {
          orderBy: {
            sequence: 'asc',
          },
        },

        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async findOne(
    organizationId: string,

    id: string,
  ) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: {
        id,

        organizationId,
      },

      include: {
        employee: true,

        earnings: true,

        payslip: true,

        ledgerEntries: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!payrollRun) {
      throw new NotFoundException('Payroll run not found');
    }

    return payrollRun;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdatePayrollRunStatusDto,
    userId: string,
  ) {
    const current = await this.findOne(organizationId, id);
    const target = dto.status as PayrollRunStatus;

    const allowed: Partial<Record<PayrollRunStatus, PayrollRunStatus[]>> = {
      DRAFT: [PayrollRunStatus.CALCULATED, PayrollRunStatus.CANCELLED],
      CALCULATED: [PayrollRunStatus.REVIEWED, PayrollRunStatus.CANCELLED],
      REVIEWED: [PayrollRunStatus.APPROVED, PayrollRunStatus.CANCELLED],
      APPROVED: [PayrollRunStatus.LOCKED, PayrollRunStatus.CANCELLED],
      LOCKED: [PayrollRunStatus.PAYMENT_PROCESSING],
      PAYMENT_PROCESSING: [PayrollRunStatus.PAID],
      PAID: [],
      CANCELLED: [],
    };

    if (!(allowed[current.status] ?? []).includes(target)) {
      throw new BadRequestException(
        `Invalid payroll transition: ${current.status} → ${target}`,
      );
    }

    /*
     * Employment-state safeguard:
     *
     * Cancellation remains available wherever the payroll lifecycle already
     * permits it. Any transition that advances payroll toward review,
     * approval, locking or payment requires the employee to still be ACTIVE.
     *
     * This check is deliberately independent of Attendance and Timesheets.
     */
    if (target !== PayrollRunStatus.CANCELLED) {
      await this.assertEmployeePayrollEligible(
        organizationId,
        {
          id: current.employee.id,
          status: current.employee.status,
        },
        userId,
        'PAYROLL_STATUS_ADVANCE',
      );
    }

    const settings = await this.prisma.payrollSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });

    if (
      target === PayrollRunStatus.APPROVED &&
      settings.approvalMode === 'MAKER_CHECKER' &&
      (current.calculatedByUserId === userId ||
        current.reviewedByUserId === userId)
    ) {
      throw new BadRequestException(
        'Maker/checker is enabled. The user who calculated or reviewed this payroll cannot approve it.',
      );
    }

    const now = new Date();
    const lifecycleData: Prisma.PayrollRunUpdateInput = { status: target };

    if (target === PayrollRunStatus.CALCULATED) {
      lifecycleData.calculatedByUserId = userId;
      lifecycleData.calculatedAt = now;
    } else if (target === PayrollRunStatus.REVIEWED) {
      lifecycleData.reviewedByUserId = userId;
      lifecycleData.reviewedAt = now;
    } else if (target === PayrollRunStatus.APPROVED) {
      lifecycleData.approvedByUserId = userId;
      lifecycleData.approvedAt = now;
    } else if (target === PayrollRunStatus.LOCKED) {
      lifecycleData.lockedByUserId = userId;
      lifecycleData.lockedAt = now;
    } else if (target === PayrollRunStatus.PAYMENT_PROCESSING) {
      lifecycleData.paymentProcessingByUserId = userId;
      lifecycleData.paymentProcessingAt = now;
    } else if (target === PayrollRunStatus.PAID) {
      lifecycleData.paidByUserId = userId;
      lifecycleData.paidAt = now;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.update({
        where: { id },
        data: lifecycleData,
        include: {
          employee: true,
          earnings: true,
          payslip: true,
          ledgerEntries: { orderBy: { sequence: 'asc' } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.payrollRunStatusHistory.create({
        data: {
          organizationId,
          payrollRunId: id,
          fromStatus: current.status,
          toStatus: target,
          changedByUserId: userId,
          note: dto.note,
        },
      });

      if (target === PayrollRunStatus.PAID) {
        const requestIds = run.ledgerEntries
          .filter(
            (e) =>
              e.category === 'EARLY_PAY_RECOVERY' &&
              e.code === 'EARLY_PAY_RECOVERY' &&
              e.effect === 'EMPLOYEE_DEDUCTION' &&
              e.sourceType === 'EARLY_PAY_REQUEST' &&
              e.sourceId,
          )
          .map((e) => e.sourceId!);
        if (requestIds.length)
          await tx.earlyPayRequest.updateMany({
            where: {
              id: { in: requestIds },
              organizationId,
              employeeId: run.employeeId,
              status: 'PAID',
            },
            data: { status: 'RECOVERED', recoveredAt: now, payrollRunId: id },
          });
      }
      return run;
    });

    return this.findOne(organizationId, updated.id);
  }

  async recalculateTotals(
    organizationId: string,

    id: string,

    userId: string,
  ) {
    const current = await this.findOne(
      organizationId,

      id,
    );

    if (!['DRAFT', 'CALCULATED'].includes(current.status)) {
      throw new BadRequestException(
        'Only DRAFT or CALCULATED payroll runs can be recalculated',
      );
    }

    // Return processed earnings to APPROVED so the

    // payroll can be rebuilt using the current tax,

    // benefit and deduction configuration.

    await this.prisma.earning.updateMany({
      where: {
        payrollRunId: id,
      },

      data: {
        payrollRunId: null,

        status: 'APPROVED',
      },
    });

    // The ledger entries belong to the payroll run and

    // are removed with the run according to the Prisma

    // relationship/cascade configuration.

    await this.prisma.payrollRun.delete({
      where: {
        id,
      },
    });

    return this.generateFromEarnings(
      organizationId,

      {
        employeeId: current.employeeId,

        title: current.title ?? undefined,

        payPeriodStart: current.payPeriodStart.toISOString(),

        payPeriodEnd: current.payPeriodEnd.toISOString(),

        paymentDate: current.paymentDate?.toISOString(),

        notes: current.notes ?? undefined,
      },

      userId,
    );
  }

  async generateFromEarnings(
    organizationId: string,

    dto: CreatePayrollRunDto,

    userId?: string,
    options: PayrollGenerationOptions = {},
  ) {
    const periodStart = new Date(dto.payPeriodStart);

    const periodEnd = new Date(dto.payPeriodEnd);

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : periodEnd;

    const [earnings, employee, settings] = await Promise.all([
      this.prisma.earning.findMany({
        where: {
          organizationId,

          employeeId: dto.employeeId,

          payPeriodStart: {
            gte: periodStart,
          },

          payPeriodEnd: {
            lte: periodEnd,
          },

          status: 'APPROVED',
        },
      }),

      this.prisma.employee.findFirst({
        where: {
          id: dto.employeeId,

          organizationId,
        },

        include: {
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
      }),

      this.prisma.payrollSettings.upsert({
        where: {
          organizationId,
        },

        update: {},

        create: {
          organizationId,
        },
      }),
    ]);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.assertEmployeePayrollEligible(
      organizationId,
      employee,
      userId,
      'PAYROLL_GENERATION',
    );

    if (!employee.payrollProfile) {
      throw new BadRequestException(
        'Employee payroll profile must be configured before generating payroll',
      );
    }

    if (earnings.length === 0) {
      throw new NotFoundException('No approved earnings found for this period');
    }

    const profile = employee.payrollProfile;

    const grossEarnings = this.money(
      earnings.reduce(
        (sum, item) => sum + item.amount,

        0,
      ),
    );

    // Stage 2:

    // Reimbursements are currently treated as

    // non-taxable. Allowances and variable earnings

    // remain taxable by default until their dedicated

    // SARS rules are implemented.

    const taxableCashEarnings = this.money(
      earnings

        .filter((earning) => earning.type !== 'REIMBURSEMENT')

        .reduce(
          (sum, earning) => sum + earning.amount,

          0,
        ),
    );

    // Commission is currently excluded from UIF

    // remuneration according to the Stage 2 rule set.

    const uifRemuneration = this.money(
      earnings

        .filter(
          (earning) =>
            earning.type !== 'REIMBURSEMENT' && earning.type !== 'COMMISSION',
        )

        .reduce(
          (sum, earning) => sum + earning.amount,

          0,
        ),
    );

    let employeeBenefitDeductions = 0;

    let employerContributions = 0;

    let retirementEmployeeContribution = 0;

    let retirementEmployerContribution = 0;

    let medicalSchemeMembers = 0;

    let medicalEmployerContribution = 0;

    const benefitBreakdown: BenefitBreakdownItem[] = [];

    for (const assignment of profile.benefits) {
      const plan = assignment.benefitPlan;

      if (!plan.active) {
        continue;
      }

      if (
        plan.effectiveFrom > periodEnd ||
        (plan.effectiveTo && plan.effectiveTo < periodStart)
      ) {
        continue;
      }

      const basis =
        plan.contributionBasis === 'PENSIONABLE_SALARY'
          ? (profile.pensionableSalary ?? profile.basicSalary)
          : profile.basicSalary;

      const employeeMethod =
        assignment.employeeMethodOverride ?? plan.employeeMethod;

      const employeeValue =
        assignment.employeeValueOverride ?? plan.employeeValue;

      const employerMethod =
        assignment.employerMethodOverride ?? plan.employerMethod;

      const employerValue =
        assignment.employerValueOverride ?? plan.employerValue;

      const employeeAmount = this.contribution(
        employeeMethod,

        employeeValue,

        basis,
      );

      const employerAmount = this.contribution(
        employerMethod,

        employerValue,

        basis,
      );

      employeeBenefitDeductions += employeeAmount;

      employerContributions += employerAmount;

      if (plan.type === 'RETIREMENT_FUND') {
        retirementEmployeeContribution += employeeAmount;

        retirementEmployerContribution += employerAmount;
      }

      if (plan.type === 'MEDICAL_AID') {
        medicalSchemeMembers = Math.max(
          medicalSchemeMembers,

          1 + profile.medicalAidDependants,
        );

        medicalEmployerContribution += employerAmount;
      }

      benefitBreakdown.push({
        id: assignment.id,

        planId: plan.id,

        name: plan.name,

        providerName: plan.providerName,

        type: plan.type,

        employeeAmount: this.money(employeeAmount),

        employerAmount: this.money(employerAmount),
      });
    }

    let recurringDeductions = 0;

    const deductionBreakdown: DeductionBreakdownItem[] = [];

    for (const item of profile.deductions) {
      if (
        item.effectiveFrom > periodEnd ||
        (item.effectiveTo && item.effectiveTo < periodStart)
      ) {
        continue;
      }

      const amount = this.contribution(
        item.method,

        item.value,

        profile.basicSalary,
      );

      recurringDeductions += amount;

      deductionBreakdown.push({
        id: item.id,

        definitionId: item.deductionDefinition.id,

        name: item.deductionDefinition.name,

        creditorName: item.deductionDefinition.creditorName,

        amount: this.money(amount),
      });
    }

    employeeBenefitDeductions = this.money(employeeBenefitDeductions);

    employerContributions = this.money(employerContributions);

    retirementEmployeeContribution = this.money(retirementEmployeeContribution);

    retirementEmployerContribution = this.money(retirementEmployerContribution);

    medicalEmployerContribution = this.money(medicalEmployerContribution);

    recurringDeductions = this.money(recurringDeductions);

    // Employer retirement contributions are treated

    // as a taxable fringe benefit and are also passed

    // to the tax engine for retirement deduction

    // treatment.

    const taxableRemuneration = this.money(
      taxableCashEarnings +
        retirementEmployerContribution +
        medicalEmployerContribution,
    );

    const periodsPerYear =
      profile.payFrequency === 'WEEKLY'
        ? 52
        : profile.payFrequency === 'FORTNIGHTLY'
          ? 26
          : 12;

    const estimatedRetirementDeductionForPeriod = Math.min(
      retirementEmployeeContribution + retirementEmployerContribution,

      taxableRemuneration * 0.275,

      350000 / periodsPerYear,
    );

    const sdlLiableRemuneration = this.money(
      Math.max(
        0,

        taxableRemuneration - estimatedRetirementDeductionForPeriod,
      ),
    );

    const tax = this.taxEngine.calculate({
      paymentDate,

      payFrequency: profile.payFrequency ?? settings.payFrequency,

      taxableRemuneration,

      uifRemuneration,

      sdlRemuneration: sdlLiableRemuneration,

      dateOfBirth: profile.dateOfBirth,

      medicalSchemeMembers,

      retirementEmployeeContribution,

      retirementEmployerContribution,

      uifApplicable: settings.uifRegistered,

      sdlApplicable: settings.sdlApplicable,
    });

    const earlyPayRequests = await this.prisma.earlyPayRequest.findMany({
      where: {
        organizationId,

        employeeId: dto.employeeId,

        status: 'PAID',

        payPeriodStart: {
          gte: periodStart,
        },

        payPeriodEnd: {
          lte: periodEnd,
        },
      },
    });

    const earlyPayRecovery = this.money(
      earlyPayRequests.reduce(
        (sum, request) => sum + request.totalPayrollRecovery,

        0,
      ),
    );

    const totalDeductions = this.money(
      tax.paye +
        tax.uifEmployee +
        employeeBenefitDeductions +
        recurringDeductions +
        earlyPayRecovery,
    );

    const netPay = this.money(
      Math.max(
        0,

        grossEarnings - totalDeductions,
      ),
    );

    const totalEmployerCost = this.money(
      grossEarnings + tax.uifEmployer + tax.sdlEmployer + employerContributions,
    );

    /*

     * Prisma JSON fields only accept JSON-safe values.

     * The calculation snapshot is explicitly typed as

     * Prisma.InputJsonObject.

     */

    const calculationBreakdown: Prisma.InputJsonObject = {
      engine: 'DELUXHR_SA_PAYROLL_V1',

      taxYear: tax.taxYear,

      grossEarnings,

      taxableCashEarnings,

      taxableRemuneration,

      uifRemuneration,

      sdlRemuneration: sdlLiableRemuneration,

      medicalEmployerContribution,

      payFrequency: profile.payFrequency ?? settings.payFrequency,

      benefits: benefitBreakdown.map(
        (benefit): Prisma.InputJsonObject => ({
          id: benefit.id,

          planId: benefit.planId,

          name: benefit.name,

          providerName: benefit.providerName ?? null,

          type: benefit.type,

          employeeAmount: benefit.employeeAmount,

          employerAmount: benefit.employerAmount,
        }),
      ),

      recurringDeductions: deductionBreakdown.map(
        (deduction): Prisma.InputJsonObject => ({
          id: deduction.id,

          definitionId: deduction.definitionId,

          name: deduction.name,

          creditorName: deduction.creditorName ?? null,

          amount: deduction.amount,
        }),
      ),

      earlyPay: {
        requestIds: earlyPayRequests.map((request) => request.id),

        recovery: earlyPayRecovery,
      },

      /*

         * SaTaxEngineService returns plain

         * JSON-compatible calculation data.

         */

      tax: JSON.parse(JSON.stringify(tax)) as Prisma.InputJsonValue,

      totals: {
        employeeBenefitDeductions,

        employerContributions,

        recurringDeductions,

        totalDeductions,

        netPay,

        totalEmployerCost,
      },
    };

    const payrollRun = await this.prisma.payrollRun.create({
      data: {
        organizationId,

        employeeId: dto.employeeId,

        payrollBatchId: options.payrollBatchId,

        title:
          dto.title ??
          `Payroll ${periodStart

            .toISOString()

            .slice(0, 7)}`,

        payPeriodStart: periodStart,

        payPeriodEnd: periodEnd,

        paymentDate,

        notes: dto.notes,

        grossEarnings,

        taxableIncome: taxableRemuneration,

        taxAmount: tax.paye,

        uifEmployee: tax.uifEmployee,

        uifEmployer: tax.uifEmployer,

        sdlEmployer: tax.sdlEmployer,

        employeeBenefitDeductions,

        employerContributions,

        recurringDeductions,

        earlyPayRecovery,

        totalDeductions,

        netPay,

        totalEmployerCost,

        taxYear: tax.taxYear,

        calculationBreakdown,

        status: 'CALCULATED',

        calculatedByUserId: userId,

        calculatedAt: new Date(),
      },
    });

    await this.prisma.payrollRunStatusHistory.create({
      data: {
        organizationId,

        payrollRunId: payrollRun.id,

        fromStatus: 'DRAFT',

        toStatus: 'CALCULATED',

        changedByUserId: userId,

        note: 'Payroll calculated from approved earnings',
      },
    });

    await this.prisma.earning.updateMany({
      where: {
        id: {
          in: earnings.map((earning) => earning.id),
        },
      },

      data: {
        payrollRunId: payrollRun.id,

        status: 'PROCESSED',
      },
    });

    /*

     * Stage 3 — Immutable Payroll Ledger

     *

     * These entries represent snapshots of the

     * calculation used to produce this payroll.

     *

     * DRAFT payroll may be discarded/recalculated.

     * Stage 4 will enforce locking once payroll has

     * passed the appropriate approval boundary.

     */

    const ledger: PayrollLedgerItem[] = [];

    let sequence = 1;

    const addLedger = (
      entry: Omit<
        PayrollLedgerItem,
        | 'organizationId'
        | 'employeeId'
        | 'payrollRunId'
        | 'sequence'
        | 'currency'
      >,
    ) => {
      const amount = this.money(entry.amount);

      if (amount === 0) {
        return;
      }

      ledger.push({
        organizationId,

        employeeId: dto.employeeId,

        payrollRunId: payrollRun.id,

        sequence: sequence++,

        currency: 'ZAR',

        ...entry,

        amount,
      });
    };

    /*

     * Earnings

     */

    for (const earning of earnings) {
      addLedger({
        category: 'EARNING',

        effect: 'EMPLOYEE_EARNING',

        code: `EARNING_${earning.type}`,

        description: earning.title,

        amount: earning.amount,

        sourceType: 'EARNING',

        sourceId: earning.id,

        metadata: {
          earningType: earning.type,

          earnedDate: earning.earnedDate.toISOString(),
        },
      });
    }

    /*

     * PAYE

     */

    addLedger({
      category: 'STATUTORY_DEDUCTION',

      effect: 'EMPLOYEE_DEDUCTION',

      code: 'PAYE',

      description: 'PAYE',

      amount: tax.paye,

      creditorName: 'SARS',

      sourceType: 'SA_TAX_ENGINE',
    });

    /*

     * Employee UIF

     */

    addLedger({
      category: 'STATUTORY_DEDUCTION',

      effect: 'EMPLOYEE_DEDUCTION',

      code: 'UIF_EMPLOYEE',

      description: 'Employee UIF',

      amount: tax.uifEmployee,

      creditorName: 'UIF',

      sourceType: 'SA_TAX_ENGINE',
    });

    /*

     * Employer UIF

     */

    addLedger({
      category: 'EMPLOYER_STATUTORY',

      effect: 'EMPLOYER_LIABILITY',

      code: 'UIF_EMPLOYER',

      description: 'Employer UIF',

      amount: tax.uifEmployer,

      creditorName: 'UIF',

      sourceType: 'SA_TAX_ENGINE',
    });

    /*

     * SDL

     */

    addLedger({
      category: 'EMPLOYER_STATUTORY',

      effect: 'EMPLOYER_LIABILITY',

      code: 'SDL_EMPLOYER',

      description: 'Skills Development Levy',

      amount: tax.sdlEmployer,

      creditorName: 'SARS',

      sourceType: 'SA_TAX_ENGINE',
    });

    /*

     * Optional employee/employer benefits.

     *

     * Nothing is generated if the employee has no

     * configured pension, provident fund, medical

     * aid or other benefit.

     */

    for (const benefit of benefitBreakdown) {
      addLedger({
        category: 'BENEFIT_DEDUCTION',

        effect: 'EMPLOYEE_DEDUCTION',

        code: `BENEFIT_${benefit.type}_EMPLOYEE`,

        description: `${benefit.name} - employee contribution`,

        amount: benefit.employeeAmount,

        creditorName: benefit.providerName ?? benefit.name,

        sourceType: 'EMPLOYEE_BENEFIT',

        sourceId: benefit.id,

        metadata: {
          planId: benefit.planId,

          benefitType: benefit.type,
        },
      });

      addLedger({
        category: 'EMPLOYER_CONTRIBUTION',

        effect: 'EMPLOYER_LIABILITY',

        code: `BENEFIT_${benefit.type}_EMPLOYER`,

        description: `${benefit.name} - employer contribution`,

        amount: benefit.employerAmount,

        creditorName: benefit.providerName ?? benefit.name,

        sourceType: 'EMPLOYEE_BENEFIT',

        sourceId: benefit.id,

        metadata: {
          planId: benefit.planId,

          benefitType: benefit.type,
        },
      });
    }

    /*

     * Other recurring deductions

     */

    for (const deduction of deductionBreakdown) {
      addLedger({
        category: 'OTHER_DEDUCTION',

        effect: 'EMPLOYEE_DEDUCTION',

        code: 'RECURRING_DEDUCTION',

        description: deduction.name,

        amount: deduction.amount,

        creditorName: deduction.creditorName ?? deduction.name,

        sourceType: 'EMPLOYEE_DEDUCTION',

        sourceId: deduction.id,

        metadata: {
          definitionId: deduction.definitionId,
        },
      });
    }

    /*

     * Early Pay

     *

     * One ledger transaction is retained for every

     * individual Early Pay request. This is important

     * for later funding-partner settlement and

     * reconciliation.

     */

    for (const request of earlyPayRequests) {
      addLedger({
        category: 'EARLY_PAY_RECOVERY',

        effect: 'EMPLOYEE_DEDUCTION',

        code: 'EARLY_PAY_RECOVERY',

        description: 'Early Pay recovery',

        amount: request.totalPayrollRecovery,

        creditorName: 'Early Pay settlement',

        sourceType: 'EARLY_PAY_REQUEST',

        sourceId: request.id,

        metadata: {
          principal: request.requestedAmount,

          transactionFee: request.serviceFee,

          transferFee: request.transferFee,
        },
      });
    }

    /*

     * Net salary settlement

     */

    addLedger({
      category: 'NET_PAY',

      effect: 'NET_SETTLEMENT',

      code: 'NET_PAY',

      description: 'Net pay',

      amount: netPay,

      creditorName: `${employee.firstName} ${employee.lastName}`,

      sourceType: 'PAYROLL_RUN',

      sourceId: payrollRun.id,
    });

    if (ledger.length > 0) {
      await this.prisma.payrollLedgerEntry.createMany({
        data: ledger,
      });
    }

    return this.findOne(
      organizationId,

      payrollRun.id,
    );
  }

  private async assertEmployeePayrollEligible(
    organizationId: string,
    employee: {
      id: string;
      status: EmployeeStatus;
    },
    userId: string | undefined,
    source:
      | 'PAYROLL_RUN_CREATE'
      | 'PAYROLL_GENERATION'
      | 'PAYROLL_STATUS_ADVANCE',
  ): Promise<void> {
    if (employee.status === EmployeeStatus.ACTIVE) {
      return;
    }

    if (employee.status === EmployeeStatus.TERMINATED) {
      const existingRisk = await this.prisma.riskEvent.findFirst({
        where: {
          organizationId,
          employeeId: employee.id,
          type: RiskEventType.TERMINATED_EMPLOYEE_PAYROLL_ATTEMPT,
          status: {
            in: [RiskEventStatus.OPEN, RiskEventStatus.UNDER_REVIEW],
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingRisk) {
        await this.prisma.riskEvent.create({
          data: {
            organizationId,
            employeeId: employee.id,
            type: RiskEventType.TERMINATED_EMPLOYEE_PAYROLL_ATTEMPT,
            severity: RiskSeverity.HIGH,
            status: RiskEventStatus.OPEN,
            title: 'Payroll attempted for terminated employee',
            description:
              'A payroll operation was blocked because the employee is terminated.',
            sourceEntity: 'Employee',
            sourceEntityId: employee.id,
            detectedByUserId: userId,
            metadata: {
              employeeStatus: employee.status,
              payrollOperation: source,
            },
          },
        });
      }

      throw new BadRequestException(
        'Payroll cannot be created or generated for a terminated employee',
      );
    }

    if (employee.status === EmployeeStatus.SUSPENDED) {
      throw new BadRequestException(
        'Payroll cannot be created or generated for a suspended employee',
      );
    }

    if (employee.status === EmployeeStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        'Payroll cannot be created or generated until the employee is active',
      );
    }

    throw new BadRequestException(
      'Payroll can only be created or generated for an active employee',
    );
  }

  private contribution(
    method: ContributionMethod,

    value: number,

    basis: number,
  ): number {
    if (method === 'NONE') {
      return 0;
    }

    if (method === 'PERCENTAGE') {
      return this.money((Math.max(0, basis) * Math.max(0, value)) / 100);
    }

    return this.money(Math.max(0, value));
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
