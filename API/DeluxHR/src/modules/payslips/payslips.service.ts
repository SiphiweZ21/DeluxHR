import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayslipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeneratePayslipDto } from './dto/generate-payslip.dto';
import { UpdatePayslipStatusDto } from './dto/update-payslip-status.dto';
import * as puppeteer from 'puppeteer';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { buildPayslipHtml } from './templates/payslip.template';

type SnapshotLine = {
  sequence: number;
  category: string;
  effect: string;
  code: string;
  description: string;
  amount: number;
  currency: string;
  creditorName: string | null;
};

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  private generatePayslipNumber(payrollRunId: string) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const suffix = payrollRunId.slice(0, 8).toUpperCase();
    return `PS-${year}-${month}-${suffix}`;
  }

  private formatPeriodLabel(date: Date) {
    return new Intl.DateTimeFormat('en-ZA', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private maskAccountNumber(accountNumber?: string | null) {
    if (!accountNumber) return null;
    const value = accountNumber.replace(/\s+/g, '');
    if (value.length <= 4) return `****${value}`;
    return `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
  }

  private nonZero(lines: SnapshotLine[]) {
    return lines.filter(
      (line) => Math.abs(Number(line.amount || 0)) > 0.000001,
    );
  }

  private asObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private formatPayslip(payslip: any) {
    const company = this.asObject(payslip.companySnapshot);
    const employee = this.asObject(payslip.employeeSnapshot);
    const payment = this.asObject(payslip.paymentSnapshot);
    const financial = this.asObject(payslip.financialSnapshot);
    const document = this.asObject(payslip.documentSnapshot);

    return {
      id: payslip.id,
      payslipNumber: payslip.payslipNumber,
      status: payslip.status,
      generatedAt: payslip.generatedAt,
      issuedAt: payslip.issuedAt,
      notes: payslip.notes,
      pdfUrl: payslip.pdfUrl,
      periodLabel: payslip.periodLabel,
      snapshotVersion: payslip.snapshotVersion,

      organization: company,
      employee,
      payment,

      payroll: {
        id: payslip.payrollRunId,
        payrollBatchId: document.payrollBatchId ?? null,
        title: document.payrollTitle ?? null,
        payPeriodStart: payslip.payPeriodStart,
        payPeriodEnd: payslip.payPeriodEnd,
        paymentDate: payslip.paymentDate,
        currency: payslip.currency,
        grossEarnings: payslip.grossEarnings,
        totalDeductions: payslip.totalDeductions,
        taxableIncome: payslip.taxableIncome,
        taxAmount: payslip.taxAmount,
        netPay: payslip.netPay,
        taxYear: document.taxYear ?? null,
        lockedAt: document.lockedAt ?? null,
      },

      earnings: financial.earnings ?? [],
      deductions: financial.deductions ?? [],
      employerContributions: financial.employerContributions ?? [],
      netSettlement: financial.netSettlement ?? [],
      totals: financial.totals ?? {
        grossEarnings: payslip.grossEarnings,
        totalDeductions: payslip.totalDeductions,
        taxableIncome: payslip.taxableIncome,
        taxAmount: payslip.taxAmount,
        netPay: payslip.netPay,
      },
    };
  }

  async generate(organizationId: string, dto: GeneratePayslipDto) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: {
        id: dto.payrollRunId,
        organizationId,
      },
      include: {
        organization: true,
        employee: {
          include: {
            department: true,
            paymentDetails: {
              where: {
                status: 'APPROVED',
              },
              orderBy: {
                version: 'desc',
              },
              take: 1,
            },
          },
        },
        payslip: true,
        payrollBatch: {
          select: {
            id: true,
          },
        },
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

    if (payrollRun.payslip) {
      throw new BadRequestException(
        'Payslip already exists for this payroll run',
      );
    }

    if (!['LOCKED', 'PAYMENT_PROCESSING', 'PAID'].includes(payrollRun.status)) {
      throw new BadRequestException(
        'Payroll must be locked before a payslip can be generated',
      );
    }

    if (!payrollRun.lockedAt) {
      throw new BadRequestException(
        'Payroll run has no lock timestamp and cannot be snapshotted',
      );
    }

    if (!payrollRun.ledgerEntries.length) {
      throw new BadRequestException(
        'Locked payroll has no ledger entries. Payslip cannot be generated.',
      );
    }

    const ledger: SnapshotLine[] = payrollRun.ledgerEntries.map((entry) => ({
      sequence: entry.sequence,
      category: String(entry.category),
      effect: String(entry.effect),
      code: entry.code,
      description: entry.description,
      amount: Number(entry.amount),
      currency: entry.currency,
      creditorName: entry.creditorName ?? null,
    }));

    const earnings = this.nonZero(
      ledger.filter((line) => line.effect === 'EMPLOYEE_EARNING'),
    );
    const deductions = this.nonZero(
      ledger.filter((line) => line.effect === 'EMPLOYEE_DEDUCTION'),
    );
    const employerContributions = this.nonZero(
      ledger.filter((line) => line.effect === 'EMPLOYER_LIABILITY'),
    );
    const netSettlement = this.nonZero(
      ledger.filter((line) => line.effect === 'NET_SETTLEMENT'),
    );

    const approvedPayment = payrollRun.employee.paymentDetails[0] ?? null;

    const companySnapshot = {
      id: payrollRun.organization.id,
      name: payrollRun.organization.name,
      legalName: payrollRun.organization.legalName,
      registrationNumber: payrollRun.organization.registrationNumber,
      taxNumber: payrollRun.organization.taxNumber,
      email: payrollRun.organization.email,
      phoneNumber: payrollRun.organization.phoneNumber,
      website: payrollRun.organization.website,
      addressLine1: payrollRun.organization.addressLine1,
      addressLine2: payrollRun.organization.addressLine2,
      city: payrollRun.organization.city,
      province: payrollRun.organization.province,
      postalCode: payrollRun.organization.postalCode,
      country: payrollRun.organization.country,
    };

    const employeeSnapshot = {
      id: payrollRun.employee.id,
      employeeNumber: payrollRun.employee.employeeNumber,
      firstName: payrollRun.employee.firstName,
      lastName: payrollRun.employee.lastName,
      email: payrollRun.employee.email,
      jobTitle: payrollRun.employee.jobTitle,
      employmentType: payrollRun.employee.employmentType,
      departmentName: payrollRun.employee.department?.name ?? null,
    };

    const paymentSnapshot = approvedPayment
      ? {
          bankName: approvedPayment.bankName,
          accountHolderName: approvedPayment.accountHolderName,
          maskedAccountNumber: this.maskAccountNumber(
            approvedPayment.accountNumber,
          ),
          branchCode: approvedPayment.branchCode,
          accountType: approvedPayment.accountType,
          paymentDetailVersion: approvedPayment.version,
        }
      : {
          bankName: null,
          accountHolderName: null,
          maskedAccountNumber: null,
          branchCode: null,
          accountType: null,
          paymentDetailVersion: null,
        };

    const financialSnapshot = {
      earnings,
      deductions,
      employerContributions,
      netSettlement,
      totals: {
        grossEarnings: Number(payrollRun.grossEarnings),
        totalDeductions: Number(payrollRun.totalDeductions),
        taxableIncome: Number(payrollRun.taxableIncome),
        taxAmount: Number(payrollRun.taxAmount),
        uifEmployee: Number(payrollRun.uifEmployee),
        uifEmployer: Number(payrollRun.uifEmployer),
        sdlEmployer: Number(payrollRun.sdlEmployer),
        employeeBenefitDeductions: Number(payrollRun.employeeBenefitDeductions),
        employerContributions: Number(payrollRun.employerContributions),
        recurringDeductions: Number(payrollRun.recurringDeductions),
        earlyPayRecovery: Number(payrollRun.earlyPayRecovery),
        totalEmployerCost: Number(payrollRun.totalEmployerCost),
        netPay: Number(payrollRun.netPay),
      },
    };

    const documentSnapshot = {
      version: 1,
      payrollRunId: payrollRun.id,
      payrollBatchId: null,
      payrollTitle: payrollRun.title,
      payrollStatusAtGeneration: payrollRun.status,
      taxYear: payrollRun.taxYear,
      lockedAt: payrollRun.lockedAt.toISOString(),
      generatedFrom: 'LOCKED_PAYROLL_LEDGER',
    };

    const payslip = await this.prisma.payslip.create({
      data: {
        organizationId: payrollRun.organizationId,
        employeeId: payrollRun.employeeId,
        payrollRunId: payrollRun.id,
        payslipNumber: this.generatePayslipNumber(payrollRun.id),
        payPeriodStart: payrollRun.payPeriodStart,
        payPeriodEnd: payrollRun.payPeriodEnd,
        paymentDate: payrollRun.paymentDate,
        grossEarnings: payrollRun.grossEarnings,
        totalDeductions: payrollRun.totalDeductions,
        taxableIncome: payrollRun.taxableIncome,
        taxAmount: payrollRun.taxAmount,
        netPay: payrollRun.netPay,
        currency: payrollRun.currency,
        notes: dto.notes,
        periodLabel: this.formatPeriodLabel(payrollRun.payPeriodStart),
        snapshotVersion: 1,
        companySnapshot,
        employeeSnapshot,
        paymentSnapshot,
        financialSnapshot,
        documentSnapshot,
      },
    });

    return this.formatPayslip(payslip);
  }

  async listAll(organizationId: string) {
    const payslips = await this.prisma.payslip.findMany({
      where: { organizationId },
      orderBy: { generatedAt: 'desc' },
    });

    return payslips.map((payslip) => this.formatPayslip(payslip));
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    const payslips = await this.prisma.payslip.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: { generatedAt: 'desc' },
    });

    return payslips.map((payslip) => this.formatPayslip(payslip));
  }

  async findOne(organizationId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    return this.formatPayslip(payslip);
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdatePayslipStatusDto,
  ) {
    const existing = await this.prisma.payslip.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Payslip not found');
    }

    const payslip = await this.prisma.payslip.update({
      where: { id },
      data: {
        status: dto.status as PayslipStatus,
        ...(dto.status === PayslipStatus.ISSUED
          ? { issuedAt: existing.issuedAt ?? new Date() }
          : {}),
      },
    });

    return this.formatPayslip(payslip);
  }

  async generatePdf(organizationId: string, id: string) {
    const payslip = await this.findOne(organizationId, id);
    const html = buildPayslipHtml(payslip);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      return await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '12mm',
          right: '12mm',
          bottom: '12mm',
          left: '12mm',
        },
      });
    } finally {
      await browser.close();
    }
  }

  async generateAndSendWhatsApp(organizationId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, organizationId },
      include: { employee: true },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    const employee = payslip.employee;

    if (!employee?.whatsappNumber) {
      throw new BadRequestException('Employee has no WhatsApp number');
    }

    if (!employee?.whatsappOptInAt) {
      throw new BadRequestException('Employee has not opted in');
    }

    const pdfBuffer = await this.generatePdf(organizationId, id);

    const fs = await import('fs');
    const path = await import('path');

    const fileName = `payslip-${payslip.payslipNumber}.pdf`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    fs.writeFileSync(filePath, pdfBuffer);

    const pdfUrl = `/uploads/${fileName}`;
    const periodLabel =
      payslip.periodLabel ?? this.formatPeriodLabel(payslip.payPeriodStart);

    await this.prisma.payslip.update({
      where: { id },
      data: {
        pdfUrl,
        periodLabel,
      },
    });

    const delivery = await this.prisma.payslipDelivery.create({
      data: {
        employeeId: employee.id,
        payrollRunId: payslip.payrollRunId,
        payslipId: payslip.id,
        pdfUrl,
        whatsappStatus: 'PENDING',
      },
    });

    try {
      const result = await this.whatsappService.sendPayslipReadyTemplate({
        to: employee.whatsappNumber,
        employeeName: employee.firstName,
        periodLabel,
      });

      const messageId = result?.messages?.[0]?.id ?? null;

      await this.prisma.payslipDelivery.update({
        where: { id: delivery.id },
        data: {
          whatsappStatus: 'SENT',
          whatsappMessageId: messageId,
          sentAt: new Date(),
        },
      });

      return {
        success: true,
        messageId,
        pdfUrl,
      };
    } catch (error: any) {
      await this.prisma.payslipDelivery.update({
        where: { id: delivery.id },
        data: {
          whatsappStatus: 'FAILED',
          errorMessage: error?.message ?? 'WhatsApp delivery failed',
        },
      });

      throw error;
    }
  }
}
