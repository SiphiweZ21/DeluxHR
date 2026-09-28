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

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  private generatePayslipNumber(payrollRunId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const suffix = payrollRunId.slice(0, 8).toUpperCase();

    return `PS-${year}-${month}-${suffix}`;
  }

  private buildEarningsSummary(
    earnings: Array<{ type: string; amount: number }>,
  ) {
    return earnings.reduce(
      (acc, item) => {
        acc[item.type] =
          (acc[item.type] || 0) + item.amount;

        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private formatPayslip(payslip: any) {
    const earnings =
      payslip.payrollRun?.earnings ?? [];

    return {
      id: payslip.id,
      payslipNumber: payslip.payslipNumber,
      status: payslip.status,
      generatedAt: payslip.generatedAt,
      issuedAt: payslip.issuedAt,
      notes: payslip.notes,
      pdfUrl: payslip.pdfUrl,
      periodLabel: payslip.periodLabel,

      organization: payslip.organization
        ? {
            id: payslip.organization.id,
            name: payslip.organization.name,
          }
        : null,

      employee: payslip.employee
        ? {
            id: payslip.employee.id,
            firstName: payslip.employee.firstName,
            lastName: payslip.employee.lastName,
            email: payslip.employee.email,
          }
        : null,

      payroll: payslip.payrollRun
        ? {
            id: payslip.payrollRun.id,
            title: payslip.payrollRun.title,
            payPeriodStart: payslip.payPeriodStart,
            payPeriodEnd: payslip.payPeriodEnd,
            paymentDate: payslip.paymentDate,
            currency: payslip.currency,
            grossEarnings: payslip.grossEarnings,
            totalDeductions: payslip.totalDeductions,
            taxableIncome: payslip.taxableIncome,
            taxAmount: payslip.taxAmount,
            netPay: payslip.netPay,
            status: payslip.payrollRun.status,
          }
        : null,

      earnings: earnings.map((earning: any) => ({
        id: earning.id,
        title: earning.title,
        type: earning.type,
        source: earning.source,
        amount: earning.amount,
        units: earning.units,
        rate: earning.rate,
        earnedDate: earning.earnedDate,
        payPeriodStart: earning.payPeriodStart,
        payPeriodEnd: earning.payPeriodEnd,
        status: earning.status,
        currency: earning.currency,
      })),

      earningsSummary:
        this.buildEarningsSummary(earnings),
    };
  }

  async generate(
    organizationId: string,
    dto: GeneratePayslipDto,
  ) {
    const payrollRun =
      await this.prisma.payrollRun.findFirst({
        where: {
          id: dto.payrollRunId,
          organizationId,
        },
        include: {
          organization: true,
          employee: true,
          payslip: true,
          earnings: true,
        },
      });

    if (!payrollRun) {
      throw new NotFoundException(
        'Payroll run not found',
      );
    }

    if (payrollRun.payslip) {
      throw new BadRequestException(
        'Payslip already exists for this payroll run',
      );
    }

    if (
      ![
        'LOCKED',
        'PAYMENT_PROCESSING',
        'PAID',
      ].includes(payrollRun.status)
    ) {
      throw new BadRequestException(
        'Payroll must be locked before a payslip can be generated',
      );
    }

    const payslip =
      await this.prisma.payslip.create({
        data: {
          organizationId:
            payrollRun.organizationId,
          employeeId: payrollRun.employeeId,
          payrollRunId: payrollRun.id,
          payslipNumber:
            this.generatePayslipNumber(
              payrollRun.id,
            ),
          payPeriodStart:
            payrollRun.payPeriodStart,
          payPeriodEnd:
            payrollRun.payPeriodEnd,
          paymentDate: payrollRun.paymentDate,
          grossEarnings:
            payrollRun.grossEarnings,
          totalDeductions:
            payrollRun.totalDeductions,
          taxableIncome:
            payrollRun.taxableIncome,
          taxAmount: payrollRun.taxAmount,
          netPay: payrollRun.netPay,
          currency: payrollRun.currency,
          notes: dto.notes,
          periodLabel:
            payrollRun.payPeriodStart
              .toISOString()
              .slice(0, 7),
        },
        include: {
          organization: true,
          employee: true,
          payrollRun: {
            include: {
              earnings: true,
            },
          },
        },
      });

    return this.formatPayslip(payslip);
  }

  async listAll(organizationId: string) {
    const payslips =
      await this.prisma.payslip.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          generatedAt: 'desc',
        },
        include: {
          organization: true,
          employee: true,
          payrollRun: {
            include: {
              earnings: true,
            },
          },
        },
      });

    return payslips.map((payslip) =>
      this.formatPayslip(payslip),
    );
  }

  async listByEmployee(
    organizationId: string,
    employeeId: string,
  ) {
    const payslips =
      await this.prisma.payslip.findMany({
        where: {
          organizationId,
          employeeId,
        },
        orderBy: {
          generatedAt: 'desc',
        },
        include: {
          organization: true,
          employee: true,
          payrollRun: {
            include: {
              earnings: true,
            },
          },
        },
      });

    return payslips.map((payslip) =>
      this.formatPayslip(payslip),
    );
  }

  async findOne(
    organizationId: string,
    id: string,
  ) {
    const payslip =
      await this.prisma.payslip.findFirst({
        where: {
          id,
          organizationId,
        },
        include: {
          organization: true,
          employee: true,
          payrollRun: {
            include: {
              earnings: true,
            },
          },
        },
      });

    if (!payslip) {
      throw new NotFoundException(
        'Payslip not found',
      );
    }

    return this.formatPayslip(payslip);
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdatePayslipStatusDto,
  ) {
    await this.findOne(
      organizationId,
      id,
    );

    const payslip =
      await this.prisma.payslip.update({
        where: {
          id,
        },
        data: {
          status: dto.status as PayslipStatus,

          ...(dto.status ===
          PayslipStatus.ISSUED
            ? {
                issuedAt: new Date(),
              }
            : {}),
        },
        include: {
          organization: true,
          employee: true,
          payrollRun: {
            include: {
              earnings: true,
            },
          },
        },
      });

    return this.formatPayslip(payslip);
  }

  async generatePdf(
    organizationId: string,
    id: string,
  ) {
    const payslip = await this.findOne(
      organizationId,
      id,
    );

    const html =
      buildPayslipHtml(payslip);

    const browser =
      await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });

    const page =
      await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    return pdf;
  }

  async generateAndSendWhatsApp(
    organizationId: string,
    id: string,
  ) {
    const payslip =
      await this.prisma.payslip.findFirst({
        where: {
          id,
          organizationId,
        },
        include: {
          employee: true,
        },
      });

    if (!payslip) {
      throw new NotFoundException(
        'Payslip not found',
      );
    }

    const employee = payslip.employee;

    if (!employee?.whatsappNumber) {
      throw new BadRequestException(
        'Employee has no WhatsApp number',
      );
    }

    if (!employee?.whatsappOptInAt) {
      throw new BadRequestException(
        'Employee has not opted in',
      );
    }

    const pdfBuffer =
      await this.generatePdf(
        organizationId,
        id,
      );

    const fs = await import('fs');
    const path = await import('path');

    const fileName =
      `payslip-${id}.pdf`;

    const uploadDir =
      path.join(
        process.cwd(),
        'uploads',
      );

    const filePath =
      path.join(
        uploadDir,
        fileName,
      );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    fs.writeFileSync(
      filePath,
      pdfBuffer,
    );

    const pdfUrl =
      `/uploads/${fileName}`;

    const periodLabel =
      new Intl.DateTimeFormat('en-ZA', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(
        payslip.payPeriodStart,
      );

    await this.prisma.payslip.update({
      where: {
        id,
      },
      data: {
        pdfUrl,
        periodLabel,
      },
    });

    const delivery =
      await this.prisma.payslipDelivery.create({
        data: {
          employeeId: employee.id,
          payrollRunId:
            payslip.payrollRunId,
          payslipId: payslip.id,
          pdfUrl,
          whatsappStatus: 'PENDING',
        },
      });

    try {
      const result =
        await this.whatsappService
          .sendPayslipReadyTemplate({
            to: employee.whatsappNumber,
            employeeName:
              employee.firstName,
            periodLabel,
          });

      const messageId =
        result?.messages?.[0]?.id ??
        null;

      await this.prisma
        .payslipDelivery
        .update({
          where: {
            id: delivery.id,
          },
          data: {
            whatsappStatus: 'SENT',
            whatsappMessageId:
              messageId,
            sentAt: new Date(),
          },
        });

      return {
        success: true,
        messageId,
        pdfUrl,
      };
    } catch (error: any) {
      await this.prisma
        .payslipDelivery
        .update({
          where: {
            id: delivery.id,
          },
          data: {
            whatsappStatus: 'FAILED',
            errorMessage:
              error.message,
          },
        });

      throw error;
    }
  }
}