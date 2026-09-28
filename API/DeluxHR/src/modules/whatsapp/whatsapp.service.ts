import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EarlyPayService } from '../early-pay/early-pay.service';

type SendPayslipTemplateParams = {
  to: string;
  employeeName: string;
  periodLabel: string;
};

type LeaveConversationState = {
  step: 'SELECT_LEAVE_TYPE' | 'START_DATE' | 'END_DATE';
  employeeId: string;
  organizationId: string;
  leaveTypeId?: string;
  startDate?: string;
};

@Injectable()
export class WhatsAppService {
  private readonly baseUrl = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;

  private readonly leaveSessions = new Map<string, LeaveConversationState>();

  private readonly earlyPaySessions = new Map<
    string,
    {
      employeeId: string;
      organizationId: string;
      step: 'AMOUNT' | 'TRANSFER' | 'CONFIRM';
      amount?: number;
      transferType?: 'STANDARD' | 'INSTANT';
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly earlyPay: EarlyPayService,
  ) {}

  async sendPayslipReadyTemplate(params: SendPayslipTemplateParams) {
    const payload = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: 'payslip_ready_notification',
        language: {
          code: 'en_US',
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: params.employeeName,
              },
              {
                type: 'text',
                text: params.periodLabel,
              },
            ],
          },
        ],
      },
    };

    return this.sendWhatsAppPayload(
      payload,
      'Failed to send WhatsApp template message',
    );
  }

  async sendTextMessage(to: string, body: string) {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body,
      },
    };

    return this.sendWhatsAppPayload(
      payload,
      'Failed to send WhatsApp message',
    );
  }

  async handleIncomingMessage(from: string, text: string) {
    const normalizedText = text.trim().toLowerCase();
    const normalizedFrom = this.normalizePhoneNumber(from);

    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { whatsappNumber: normalizedFrom },
          { whatsappNumber: `+${normalizedFrom}` },
          { phoneNumber: normalizedFrom },
          { phoneNumber: `+${normalizedFrom}` },
        ],
      },
      include: {
        organization: true,
      },
    });

    if (!employee) {
      await this.sendTextMessage(
        from,
        'Hi, we could not find your employee profile. Please contact HR to link your WhatsApp number.',
      );

      throw new NotFoundException(
        'Employee not found for WhatsApp number',
      );
    }

    const activeLeaveSession = this.leaveSessions.get(from);
    const activeEarlyPaySession = this.earlyPaySessions.get(from);

    if (normalizedText === '0') {
      this.leaveSessions.delete(from);
      this.earlyPaySessions.delete(from);

      return this.sendMainMenu(from, employee.firstName);
    }

    if (activeEarlyPaySession) {
      return this.continueEarlyPayFlow(
        from,
        normalizedText,
        activeEarlyPaySession,
      );
    }

    if (activeLeaveSession) {
      return this.continueLeaveRequestFlow(
        from,
        normalizedText,
        activeLeaveSession,
      );
    }

    if (
      ['hi', 'hello', 'menu', 'start'].includes(normalizedText)
    ) {
      return this.sendMainMenu(from, employee.firstName);
    }

    if (normalizedText === '1') {
      return this.sendLatestPayslipMessage(from, employee.id);
    }

    if (normalizedText === '2') {
      return this.startLeaveRequestFlow(
        from,
        employee.id,
        employee.organizationId,
      );
    }

    if (normalizedText === '3') {
      return this.sendLeaveStatusMessage(from, employee.id);
    }

    if (normalizedText === '4') {
      return this.startEarlyPayFlow(
        from,
        employee.id,
        employee.organizationId,
      );
    }

    return this.sendTextMessage(
      from,
      `🤔 *I didn't understand that*

Reply *hi* to open your DeluxHR Employee Services menu.`,
    );
  }

  private async startLeaveRequestFlow(
    from: string,
    employeeId: string,
    organizationId: string,
  ) {
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });

    if (leaveTypes.length === 0) {
      return this.sendTextMessage(
        from,
        'No leave types are configured yet. Please contact HR.',
      );
    }

    this.leaveSessions.set(from, {
      step: 'SELECT_LEAVE_TYPE',
      employeeId,
      organizationId,
    });

    const options = leaveTypes
      .map(
        (leaveType, index) =>
          `${index + 1}. ${leaveType.name}`,
      )
      .join('\n');

    return this.sendTextMessage(
      from,
      `🌴 *Request Leave*

Please choose a leave type:

${options}

Reply with the number of your selection.

↩️ Reply *0* to return to the main menu.`,
    );
  }

  private async continueLeaveRequestFlow(
    from: string,
    text: string,
    session: LeaveConversationState,
  ) {
    if (session.step === 'SELECT_LEAVE_TYPE') {
      const selectedIndex = Number(text) - 1;

      if (Number.isNaN(selectedIndex)) {
        return this.sendTextMessage(
          from,
          'Please reply with a valid number.',
        );
      }

      const leaveTypes = await this.prisma.leaveType.findMany({
        where: {
          organizationId: session.organizationId,
        },
        orderBy: {
          name: 'asc',
        },
      });

      const selectedLeaveType = leaveTypes[selectedIndex];

      if (!selectedLeaveType) {
        return this.sendTextMessage(
          from,
          'Invalid option. Please try again.',
        );
      }

      this.leaveSessions.set(from, {
        ...session,
        step: 'START_DATE',
        leaveTypeId: selectedLeaveType.id,
      });

      return this.sendTextMessage(
        from,
        `🌴 *${selectedLeaveType.name}*

📅 Please enter your *start date* in this format:
*YYYY-MM-DD*

Example: *2026-09-28*

↩️ Reply *0* to return to the main menu.`,
      );
    }

    if (session.step === 'START_DATE') {
      if (!this.isValidDate(text)) {
        return this.sendTextMessage(
          from,
          'Invalid date. Please enter the start date as YYYY-MM-DD.',
        );
      }

      this.leaveSessions.set(from, {
        ...session,
        step: 'END_DATE',
        startDate: text,
      });

      return this.sendTextMessage(
        from,
        `✅ Start date saved: *${this.formatDateForWhatsApp(
          text,
        )}*

📅 Now enter your *end date*:
*YYYY-MM-DD*

↩️ Reply *0* to return to the main menu.`,
      );
    }

    if (session.step === 'END_DATE') {
      if (!this.isValidDate(text)) {
        return this.sendTextMessage(
          from,
          'Invalid date. Please enter the end date as YYYY-MM-DD.',
        );
      }

      if (!session.leaveTypeId || !session.startDate) {
        this.leaveSessions.delete(from);

        return this.sendTextMessage(
          from,
          'Something went wrong. Please reply "hi" and try again.',
        );
      }

      const startDate = new Date(session.startDate);
      const endDate = new Date(text);

      if (endDate < startDate) {
        return this.sendTextMessage(
          from,
          'End date cannot be before start date. Please enter a valid end date.',
        );
      }

      const leaveRequest =
        await this.prisma.leaveRequest.create({
          data: {
            organizationId: session.organizationId,
            employeeId: session.employeeId,
            leaveTypeId: session.leaveTypeId,
            startDate,
            endDate,
            status: 'PENDING',
          },
          include: {
            leaveType: true,
          },
        });

      await this.prisma.auditLog.create({
        data: {
          organizationId: session.organizationId,
          action: 'CREATE',
          entity: 'LeaveRequest',
          entityId: leaveRequest.id,
        },
      });

      this.leaveSessions.delete(from);

      return this.sendTextMessage(
        from,
        `✅ *Leave Request Submitted*

🌴 ${leaveRequest.leaveType.name}
📅 ${this.formatDateForWhatsApp(
          leaveRequest.startDate,
        )} – ${this.formatDateForWhatsApp(
          leaveRequest.endDate,
        )}
⏳ Status: *Pending approval*

Your request has been sent to HR for review.

↩️ Reply *0* to return to the main menu.`,
      );
    }
  }

  private async startEarlyPayFlow(
    from: string,
    employeeId: string,
    organizationId: string,
  ) {
    const quote = await this.earlyPay.quote(
      organizationId,
      employeeId,
    );

    if (!quote.eligible) {
      return this.sendTextMessage(
        from,
        `💸 *Early Pay*

Early Pay is not available right now.

${quote.reason ?? 'Please contact HR for more information.'}

↩️ Reply *0* to return to the main menu.`,
      );
    }

    this.earlyPaySessions.set(from, {
      employeeId,
      organizationId,
      step: 'AMOUNT',
    });

    return this.sendTextMessage(
      from,
      `💸 *Early Pay*

Qualifying days: *${quote.qualifyingDays}*
Estimated net earned pay: *${this.formatMoney(
        quote.estimatedNetEarned,
      )}*
Available Early Pay: *${this.formatMoney(
        quote.availableAmount,
      )}*

Enter an amount between *${this.formatMoney(
        quote.policy.minimumRequestAmount,
      )}* and *${this.formatMoney(quote.availableAmount)}*.

Your available amount reserves for estimated PAYE, UIF and protected deductions. Final payroll remains authoritative.

↩️ Reply *0* to return to the main menu.`,
    );
  }

  private async continueEarlyPayFlow(
    from: string,
    text: string,
    session: {
      employeeId: string;
      organizationId: string;
      step: 'AMOUNT' | 'TRANSFER' | 'CONFIRM';
      amount?: number;
      transferType?: 'STANDARD' | 'INSTANT';
    },
  ) {
    if (session.step === 'AMOUNT') {
      const amount = Number(
        text.replace(/[^0-9.]/g, ''),
      );

      const quote = await this.earlyPay.quote(
        session.organizationId,
        session.employeeId,
      );

      if (
        !Number.isFinite(amount) ||
        amount < quote.policy.minimumRequestAmount ||
        amount > quote.availableAmount
      ) {
        return this.sendTextMessage(
          from,
          `Please enter an amount between ${this.formatMoney(
            quote.policy.minimumRequestAmount,
          )} and ${this.formatMoney(
            quote.availableAmount,
          )}.`,
        );
      }

      this.earlyPaySessions.set(from, {
        ...session,
        step: 'TRANSFER',
        amount,
      });

      return this.sendTextMessage(
        from,
        `🚚 *Choose payment speed*

*1 — Standard*
Transfer fee: ${this.formatMoney(
          quote.policy.standardTransferFee,
        )}

*2 — Instant*
Transfer fee: ${this.formatMoney(
          quote.policy.instantTransferFee,
        )}

Reply *1* or *2*.

↩️ Reply *0* to return to the main menu.`,
      );
    }

    if (session.step === 'TRANSFER') {
      if (!['1', '2'].includes(text) || !session.amount) {
        return this.sendTextMessage(
          from,
          'Please reply *1* for Standard or *2* for Instant.',
        );
      }

      const transferType: 'STANDARD' | 'INSTANT' =
        text === '2' ? 'INSTANT' : 'STANDARD';

      const quote = await this.earlyPay.quote(
        session.organizationId,
        session.employeeId,
      );

      // DeluxHR Early Pay uses fixed transfer fees only.
      // STANDARD = configured standard fee (R5)
      // INSTANT = configured instant fee (R20)
      // No percentage transaction fee.
      const transferFee =
        transferType === 'INSTANT'
          ? quote.policy.instantTransferFee
          : quote.policy.standardTransferFee;

      const totalPayrollRecovery =
        session.amount + transferFee;

      this.earlyPaySessions.set(from, {
        ...session,
        step: 'CONFIRM',
        transferType,
      });

      return this.sendTextMessage(
        from,
        `🧾 *Confirm Early Pay*

Amount to receive: *${this.formatMoney(
          session.amount,
        )}*
Payment speed: *${this.prettyStatus(
          transferType,
        )}*
Transfer fee: ${this.formatMoney(transferFee)}
Total payroll recovery: *${this.formatMoney(
          totalPayrollRecovery,
        )}*

This request will be sent to your employer for approval.

*1 — Confirm*
*2 — Cancel*

↩️ Reply *0* to return to the main menu.`,
      );
    }

    if (session.step === 'CONFIRM') {
      if (text === '2') {
        this.earlyPaySessions.delete(from);

        return this.sendTextMessage(
          from,
          `Early Pay request cancelled.

↩️ Reply *0* for the main menu.`,
        );
      }

      if (
        text !== '1' ||
        !session.amount ||
        !session.transferType
      ) {
        return this.sendTextMessage(
          from,
          'Reply *1* to confirm or *2* to cancel.',
        );
      }

      const request = await this.earlyPay.createRequest(
        session.organizationId,
        {
          employeeId: session.employeeId,
          amount: session.amount,
          transferType: session.transferType as any,
        },
      );

      this.earlyPaySessions.delete(from);

      return this.sendTextMessage(
        from,
        `✅ *Early Pay Request Submitted*

Amount: *${this.formatMoney(
          request.requestedAmount,
        )}*
Payment speed: *${this.prettyStatus(
          request.transferType,
        )}*
Transfer fee: *${this.formatMoney(
          request.transferFee,
        )}*
Payroll recovery: *${this.formatMoney(
          request.totalPayrollRecovery,
        )}*
Status: *Pending approval*

HR/payroll will review your request.

↩️ Reply *0* to return to the main menu.`,
      );
    }
  }

  private async sendLatestPayslipMessage(
    to: string,
    employeeId: string,
  ) {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        employeeId,
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });

    if (!payslip) {
      return this.sendTextMessage(
        to,
        'No payslip found yet. Please contact HR if you think this is incorrect.',
      );
    }

    const portalBaseUrl =
      process.env.DELUXHR_PORTAL_BASE_URL ??
      'http://localhost:3000';

    const link = `${portalBaseUrl}/employee/payslips/${payslip.id}`;

    return this.sendTextMessage(
      to,
      `💰 *Your Latest Payslip*

📄 Payslip: *${payslip.payslipNumber}*
📅 Period: ${payslip.periodLabel ?? 'Latest'}
✅ Net Pay: *${this.formatMoney(
        payslip.netPay,
        payslip.currency,
      )}*

🔗 View your payslip:
${link}

↩️ Reply *0* to return to the main menu.`,
    );
  }

  private async sendLeaveStatusMessage(
    to: string,
    employeeId: string,
  ) {
    const latestLeaveRequest =
      await this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
        },
        include: {
          leaveType: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (!latestLeaveRequest) {
      return this.sendTextMessage(
        to,
        'You do not have any leave requests yet.',
      );
    }

    return this.sendTextMessage(
      to,
      `📋 *Latest Leave Request*

🌴 ${latestLeaveRequest.leaveType.name}
📅 ${this.formatDateForWhatsApp(
        latestLeaveRequest.startDate,
      )} – ${this.formatDateForWhatsApp(
        latestLeaveRequest.endDate,
      )}
${this.leaveStatusIcon(
        latestLeaveRequest.status,
      )} Status: *${this.prettyStatus(
        latestLeaveRequest.status,
      )}*

↩️ Reply *0* to return to the main menu.`,
    );
  }

  private sendMainMenu(
    to: string,
    firstName: string,
  ) {
    return this.sendTextMessage(
      to,
      `👋 Hi *${firstName}*

Welcome to *DeluxHR Employee Services*.

What would you like to do?

💰 *1 — View latest payslip*
🌴 *2 — Request leave*
📋 *3 — Check leave status*
💸 *4 — Early Pay*

Reply with *1, 2, 3 or 4*.`,
    );
  }

  private formatDateForWhatsApp(
    value: string | Date,
  ) {
    const date =
      value instanceof Date
        ? value
        : new Date(`${value}T00:00:00`);

    return new Intl.DateTimeFormat('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private formatMoney(
    value: number,
    currency = 'ZAR',
  ) {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  }

  private prettyStatus(status: string) {
    return (
      status.charAt(0) +
      status.slice(1).toLowerCase()
    );
  }

  private leaveStatusIcon(status: string) {
    if (status === 'APPROVED') return '✅';
    if (status === 'REJECTED') return '❌';

    return '⏳';
  }

  private async sendWhatsAppPayload(
    payload: unknown,
    fallbackMessage: string,
  ) {
    const response = await fetch(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new InternalServerErrorException(
        data?.error?.message ?? fallbackMessage,
      );
    }

    return data;
  }

  private isValidDate(value: string) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(value)) {
      return false;
    }

    const date = new Date(value);

    return !Number.isNaN(date.getTime());
  }

  private normalizePhoneNumber(number: string) {
    return number.replace(/\D/g, '');
  }
}