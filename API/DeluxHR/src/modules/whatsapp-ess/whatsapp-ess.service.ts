import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventType,
  AttendanceExceptionStatus,
  EmployeeStatus,
  Feature,
  PayslipStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../../common/entitlements/entitlements.service';
import { hashPassword, comparePassword } from '../../common/auth/password';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { LeaveRequestsService } from '../leave/leave-requests/leave-requests.service';
import { LeavePolicyService } from '../leave/leave-policy/leave-policy.service';
import { AttendanceEventsService } from '../attendance-events/attendance-events.service';
import { PayslipsService } from '../payslips/payslips.service';
import { EarlyPayService } from '../early-pay/early-pay.service';
import { calendarDate } from '../recurring-schedules/recurring-schedules.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { EmployeeCommunicationsService } from '../employee-communications/employee-communications.service';
import { HrServiceDeskService } from '../hr-service-desk/hr-service-desk.service';
import { CreateAnnouncementDto } from './dto/whatsapp-ess.dto';

export type SharedLocation = { latitude: number; longitude: number };
type Flow = {
  eventType?: AttendanceEventType;
  requestedAt?: string;
  kind:
    | 'CLOCK_LOCATION'
    | 'LEAVE_TYPE'
    | 'LEAVE_START'
    | 'LEAVE_END'
    | 'BALANCE_TYPE'
    | 'EXCEPTION'
    | 'HR_SUMMARY'
    | 'EARLY_AMOUNT'
    | 'EARLY_CONFIRM';
  leaveTypeId?: string;
  startDate?: string;
  amount?: number;
  transferType?: 'STANDARD' | 'INSTANT';
};
export function normalizedPhone(value: string) {
  return value.replace(/\D/g, '');
}
const MENU =
  'DeluxHR menu: 1 Profile, 2 Leave balance, 3 Request leave, 4 Leave status, 5 Attendance, 6 Clock in, 7 Clock out, 8 Explain exception, 9 Payslip, 10 HR request, 11 HR status, 12 Announcements, 13 Early Pay. Reply 0 for menu.';
@Injectable()
export class WhatsAppEssService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly whatsapp: WhatsAppService,
    private readonly leave: LeaveRequestsService,
    private readonly policy: LeavePolicyService,
    private readonly attendance: AttendanceEventsService,
    private readonly payslips: PayslipsService,
    private readonly earlyPay: EarlyPayService,
    private readonly entitlements: EntitlementsService,
    private readonly desk: HrServiceDeskService,
    private readonly communications: EmployeeCommunicationsService,
  ) {}
  private actor(employee: {
    user: { id: string; email: string; role: UserRole } | null;
    organizationId: string;
  }): TenantJwtUser {
    if (!employee.user)
      throw new ForbiddenException('Employee portal account required');
    return {
      sub: employee.user.id,
      email: employee.user.email,
      role: employee.user.role,
      organizationId: employee.organizationId,
    };
  }
  private async auditAction(actor: TenantJwtUser, id: string, action: string) {
    await this.audit.log({
      organizationId: actor.organizationId,
      action,
      entity: 'Employee',
      entityId: id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
    });
  }
  async enroll(actor: TenantJwtUser, employeeId: string, pin: string) {
    if (!/^\d{6,8}$/.test(pin))
      throw new BadRequestException('WhatsApp PIN must be 6 to 8 digits');
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: actor.organizationId,
        status: EmployeeStatus.ACTIVE,
      },
      select: {
        id: true,
        whatsappNumber: true,
        whatsappOptInAt: true,
        userId: true,
      },
    });
    if (
      !employee?.whatsappNumber ||
      !employee.whatsappOptInAt ||
      !employee.userId
    )
      throw new BadRequestException(
        'Active employee must have opted in, linked a WhatsApp number and portal user',
      );
    const phone = normalizedPhone(employee.whatsappNumber);
    if (
      !phone ||
      (await this.prisma.employee.findFirst({
        where: {
          id: { not: employeeId },
          OR: [{ whatsappNumber: phone }, { whatsappNumber: '+' + phone }],
        },
      }))
    )
      throw new ConflictException(
        'WhatsApp number is shared with another employee',
      );
    const identity = await this.prisma.whatsAppEssIdentity.upsert({
      where: { employeeId },
      create: {
        organizationId: actor.organizationId,
        employeeId,
        pinHash: await hashPassword(pin),
      },
      update: { pinHash: await hashPassword(pin), isActive: true },
    });
    await this.prisma.whatsAppEssSession.deleteMany({ where: { employeeId } });
    await this.auditAction(actor, employeeId, 'WHATSAPP_ESS_ENROLLED');
    return { id: identity.id, employeeId, isActive: identity.isActive };
  }
  async process(
    messageId: string,
    from: string,
    body: string,
    location?: SharedLocation,
  ) {
    const phone = normalizedPhone(from);
    if (!messageId || !phone || !body || body.length > 2000) return;
    const recent = await this.prisma.whatsAppInboundMessage.count({
      where: { phone, receivedAt: { gte: new Date(Date.now() - 10 * 60000) } },
    });
    if (recent >= 30) return;
    try {
      await this.prisma.whatsAppInboundMessage.create({
        data: { providerMessageId: messageId, phone },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return;
      throw error;
    }
    try {
      const reply = await this.handle(phone, body.trim(), messageId, location);
      await this.whatsapp.sendTextMessage(from, reply);
      await this.prisma.whatsAppInboundMessage.update({
        where: { providerMessageId: messageId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.whatsAppInboundMessage.update({
        where: { providerMessageId: messageId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      throw error;
    }
  }
  private async handle(
    phone: string,
    text: string,
    messageId: string,
    location?: SharedLocation,
  ): Promise<string> {
    const employees = await this.prisma.employee.findMany({
      where: {
        status: EmployeeStatus.ACTIVE,
        whatsappOptInAt: { not: null },
        OR: [{ whatsappNumber: phone }, { whatsappNumber: '+' + phone }],
      },
      include: { user: true, whatsappEssIdentity: true },
      take: 2,
    });
    if (employees.length !== 1 || !employees[0].whatsappEssIdentity?.isActive)
      return 'Your WhatsApp self-service is not set up. Contact HR.';
    const employee = employees[0],
      identity = employee.whatsappEssIdentity!,
      actor = this.actor(employee);
    if (
      !(await this.entitlements.hasFeature(
        employee.organizationId,
        Feature.WHATSAPP,
      ))
    )
      return 'WhatsApp self-service is not enabled for your company.';
    await this.prisma.whatsAppInboundMessage.update({
      where: { providerMessageId: messageId },
      data: {
        organizationId: employee.organizationId,
        employeeId: employee.id,
        command: /^PIN\s/i.test(text)
          ? 'VERIFY_PIN'
          : text.length <= 2
            ? `MENU_${text}`
            : 'FLOW',
      },
    });
    const now = new Date();
    let session = await this.prisma.whatsAppEssSession.findUnique({
      where: { phone },
    });
    if (session && session.employeeId !== employee.id) {
      await this.prisma.whatsAppEssSession.delete({
        where: { id: session.id },
      });
      session = null;
    }
    if (!session)
      session = await this.prisma.whatsAppEssSession.create({
        data: {
          phone,
          organizationId: employee.organizationId,
          employeeId: employee.id,
          expiresAt: new Date(now.getTime() + 15 * 60000),
        },
      });
    if (session.lockedUntil && session.lockedUntil > now)
      return 'Too many incorrect PIN attempts. Try again later or contact HR.';
    if (!session.verifiedUntil || session.verifiedUntil <= now) {
      if (!/^PIN\s+\d{6,8}$/i.test(text))
        return 'Reply PIN followed by your 6–8 digit WhatsApp PIN to verify. Ask HR to set it up if needed.';
      const valid = await comparePassword(
        text.replace(/^PIN\s+/i, ''),
        identity.pinHash,
      );
      if (!valid) {
        const attempts = session.failedAttempts + 1;
        await this.prisma.whatsAppEssSession.update({
          where: { id: session.id },
          data: {
            failedAttempts: attempts >= 5 ? 0 : attempts,
            lockedUntil:
              attempts >= 5 ? new Date(now.getTime() + 15 * 60000) : null,
          },
        });
        return 'PIN not accepted. Try again or contact HR.';
      }
      await this.prisma.whatsAppEssSession.update({
        where: { id: session.id },
        data: {
          verifiedUntil: new Date(now.getTime() + 15 * 60000),
          expiresAt: new Date(now.getTime() + 15 * 60000),
          failedAttempts: 0,
          lockedUntil: null,
          flow: Prisma.JsonNull,
        },
      });
      await this.auditAction(actor, employee.id, 'WHATSAPP_ESS_VERIFIED');
      return MENU;
    }
    if (/^PIN\s/i.test(text)) return 'Already verified. Reply 0 for the menu.';
    const flow = session.flow as Flow | null;
    if (text.toLowerCase() === '0' || text.toLowerCase() === 'menu') {
      await this.setFlow(session.id, null);
      return MENU;
    }
    if (flow?.kind === 'CLOCK_LOCATION')
      return this.captureLocation(
        employee,
        actor,
        session.id,
        flow,
        location,
        messageId,
      );
    if (location)
      return 'Choose 6 to clock in or 7 to clock out before sharing your current location.';
    if (flow) return this.flow(employee, actor, session.id, flow, text);
    const org = employee.organizationId,
      id = employee.id;
    switch (text.trim()) {
      case '1':
        return `Profile: ${employee.firstName} ${employee.lastName}; employee no. ${employee.employeeNumber}; ${employee.jobTitle ?? 'Role not set'}.`;
      case '2':
      case '3': {
        if (!(await this.entitlements.hasFeature(org, Feature.LEAVE)))
          return 'Leave is not enabled for your company.';
        const types = await this.prisma.leaveType.findMany({
          where: { organizationId: org },
          orderBy: { name: 'asc' },
          take: 20,
        });
        if (!types.length) return 'No leave types configured. Contact HR.';
        await this.setFlow(session.id, {
          kind: text === '2' ? 'BALANCE_TYPE' : 'LEAVE_TYPE',
        });
        return `Choose leave type: ${types.map((t, i) => `${i + 1} ${t.name}`).join(', ')}. Reply with its number.`;
      }
      case '4': {
        if (!(await this.entitlements.hasFeature(org, Feature.LEAVE)))
          return 'Leave is not enabled for your company.';
        const item = await this.prisma.leaveRequest.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { createdAt: 'desc' },
          include: { leaveType: true },
        });
        return item
          ? `Latest leave: ${item.leaveType.name}, ${item.startDate.toISOString().slice(0, 10)} to ${item.endDate.toISOString().slice(0, 10)} — ${item.status}.`
          : 'No leave request found.';
      }
      case '5': {
        if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE)))
          return 'Attendance is not enabled for your company.';
        const event = await this.prisma.attendanceEvent.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { capturedAt: 'desc' },
        });
        return event
          ? `Latest attendance: ${event.eventType.replace('_', ' ')} at ${event.capturedAt.toISOString()}.`
          : 'No attendance event found.';
      }
      case '6':
      case '7': {
        if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE)))
          return 'Attendance is not enabled for your company.';
        const latest = await this.prisma.attendanceEvent.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { capturedAt: 'desc' },
        });
        const eventType =
          text === '6'
            ? AttendanceEventType.CHECK_IN
            : AttendanceEventType.CHECK_OUT;
        if (
          latest?.eventType === eventType ||
          (!latest && eventType === AttendanceEventType.CHECK_OUT)
        )
          return 'Attendance sequence is not ready for that action. Contact your supervisor if a correction is needed.';
        await this.setFlow(session.id, {
          kind: 'CLOCK_LOCATION',
          eventType,
          requestedAt: now.toISOString(),
        });
        return `To ${eventType === AttendanceEventType.CHECK_IN ? 'clock in' : 'clock out'}, use WhatsApp Attach (+ / paperclip) > Location > Send your current location within 5 minutes. Reply 0 to cancel. Attendance is only recorded after you share a valid location.`;
      }
      case '8': {
        const exception = await this.prisma.attendanceException.findFirst({
          where: {
            organizationId: org,
            employeeId: id,
            status: AttendanceExceptionStatus.OPEN,
            employeeExplanation: null,
          },
          orderBy: { detectedAt: 'desc' },
        });
        if (!exception)
          return 'No open attendance exception needs your explanation.';
        await this.setFlow(session.id, { kind: 'EXCEPTION' });
        return `Explain your latest ${exception.type.replace(/_/g, ' ').toLowerCase()} exception in 5–500 characters.`;
      }
      case '9': {
        if (!(await this.entitlements.hasFeature(org, Feature.PAYSLIPS)))
          return 'Payslips are not enabled for your company.';
        const payslip = await this.prisma.payslip.findFirst({
          where: {
            organizationId: org,
            employeeId: id,
            status: PayslipStatus.ISSUED,
          },
          orderBy: { generatedAt: 'desc' },
        });
        if (!payslip) return 'No issued payslip is available yet.';
        const raw = randomBytes(32).toString('base64url'),
          hash = createHash('sha256').update(raw).digest('hex');
        await this.prisma.payslipAccessLink.create({
          data: {
            organizationId: org,
            employeeId: id,
            payslipId: payslip.id,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        });
        const base = process.env.DELUXHR_API_BASE_URL?.replace(/\/$/, '');
        if (!base || !base.startsWith('https://'))
          throw new BadRequestException('Secure payslip URL is not configured');
        await this.auditAction(actor, id, 'WHATSAPP_ESS_PAYSLIP_LINK_CREATED');
        return `Your payslip link expires in 10 minutes and works once: ${base}/whatsapp/payslips/${raw}`;
      }
      case '10':
        await this.setFlow(session.id, { kind: 'HR_SUMMARY' });
        return 'Briefly describe your HR request (5–500 characters).';
      case '11': {
        const request = await this.prisma.hrServiceRequest.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { createdAt: 'desc' },
        });
        return request
          ? `HR request ${request.reference}: ${request.status}.`
          : 'No HR request found.';
      }
      case '12': {
        return this.communications.whatsapp(actor);
      }
      case '13': {
        if (!(await this.entitlements.hasFeature(org, Feature.EARLY_PAY)))
          return 'Early Pay is not enabled for your company.';
        const quote = await this.earlyPay.quote(org, id);
        if (!quote.eligible)
          return `Early Pay is unavailable: ${quote.reason ?? 'Contact HR'}.`;
        await this.setFlow(session.id, { kind: 'EARLY_AMOUNT' });
        return `Early Pay available up to R${quote.availableAmount.toFixed(2)}. Reply AMOUNT STANDARD or AMOUNT INSTANT (for example 100 STANDARD).`;
      }
      default:
        return MENU;
    }
  }
  private async captureLocation(
    employee: { id: string; organizationId: string },
    actor: TenantJwtUser,
    sessionId: string,
    flow: Flow,
    location: SharedLocation | undefined,
    messageId: string,
  ): Promise<string> {
    const org = employee.organizationId,
      now = new Date();
    const requestedAt = new Date(flow.requestedAt ?? '').getTime();
    if (
      !Number.isFinite(requestedAt) ||
      now.getTime() - requestedAt > 5 * 60000 ||
      requestedAt > now.getTime()
    ) {
      await this.setFlow(sessionId, null);
      return 'Location request expired. Choose 6 or 7 again; no attendance was recorded.';
    }
    if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE))) {
      await this.setFlow(sessionId, null);
      return 'Attendance is not enabled for your company.';
    }
    if (
      !location ||
      typeof location.latitude !== 'number' ||
      typeof location.longitude !== 'number' ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    )
      return 'Send a valid location using Attach > Location > Send your current location, or reply 0 to cancel. No attendance was recorded.';
    const eventType = flow.eventType;
    if (
      ![AttendanceEventType.CHECK_IN, AttendanceEventType.CHECK_OUT].includes(
        eventType!,
      )
    ) {
      await this.setFlow(sessionId, null);
      return 'Choose 6 or 7 again.';
    }
    const latest = await this.prisma.attendanceEvent.findFirst({
      where: { organizationId: org, employeeId: employee.id },
      orderBy: { capturedAt: 'desc' },
    });
    if (
      latest?.eventType === eventType ||
      (!latest && eventType === AttendanceEventType.CHECK_OUT)
    ) {
      await this.setFlow(sessionId, null);
      return 'Attendance sequence has changed. No attendance was recorded; contact your supervisor if a correction is needed.';
    }
    const assignment =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId: org,
          employeeId: employee.id,
          isPrimary: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
    const claimed = await this.prisma.whatsAppEssSession.updateMany({
      where: {
        id: sessionId,
        employeeId: employee.id,
        organizationId: org,
        verifiedUntil: { gt: now },
        flow: { equals: flow as unknown as Prisma.InputJsonValue },
      },
      data: { flow: Prisma.JsonNull },
    });
    if (!claimed.count)
      return 'This location request was cancelled or already handled. Check option 5 or choose 6 or 7 again.';
    try {
      await this.attendance.create(
        org,
        {
          employeeId: employee.id,
          eventType: eventType!,
          channel: AttendanceChannel.WHATSAPP,
          capturedAt: now.toISOString(),
          workLocationId: assignment?.workLocationId,
          latitude: location.latitude,
          longitude: location.longitude,
          sourceReference: messageId,
          metadata: {
            locationEvidence: 'WHATSAPP_SHARED_PIN',
            clockRequestedAt: flow.requestedAt!,
          },
        },
        actor,
      );
    } catch {
      return 'Attendance capture could not be confirmed. Check option 5 before retrying, or contact your supervisor. Reply 0 to cancel.';
    }
    await this.auditAction(
      actor,
      employee.id,
      eventType === AttendanceEventType.CHECK_IN
        ? 'WHATSAPP_ESS_CLOCK_IN'
        : 'WHATSAPP_ESS_CLOCK_OUT',
    );
    return `${eventType === AttendanceEventType.CHECK_IN ? 'Clock-in' : 'Clock-out'} recorded at ${now.toISOString()} with your shared location.`;
  }
  private async setFlow(sessionId: string, flow: Flow | null) {
    await this.prisma.whatsAppEssSession.update({
      where: { id: sessionId },
      data: {
        flow: flow
          ? (flow as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }
  private async flow(
    employee: { id: string; organizationId: string },
    actor: TenantJwtUser,
    sessionId: string,
    flow: Flow,
    text: string,
  ): Promise<string> {
    const org = employee.organizationId,
      id = employee.id;
    if (flow.kind === 'LEAVE_TYPE' || flow.kind === 'BALANCE_TYPE') {
      const types = await this.prisma.leaveType.findMany({
        where: { organizationId: org },
        orderBy: { name: 'asc' },
        take: 20,
      });
      const index = Number(text) - 1;
      if (!Number.isInteger(index) || !types[index])
        return 'Choose a listed leave type number.';
      if (flow.kind === 'BALANCE_TYPE') {
        await this.setFlow(sessionId, null);
        try {
          const value = await this.policy.balance(
            org,
            id,
            types[index].id,
            calendarDate(new Date().toISOString().slice(0, 10)),
          );
          return `${types[index].name} balance: ${value.available.toFixed(2)} days available (${value.accrued.toFixed(2)} accrued, ${value.used.toFixed(2)} used).`;
        } catch {
          return 'A leave balance is not configured for this type. Contact HR.';
        }
      }
      await this.setFlow(sessionId, {
        kind: 'LEAVE_START',
        leaveTypeId: types[index].id,
      });
      return 'Enter leave start date YYYY-MM-DD.';
    }
    if (flow.kind === 'LEAVE_START') {
      try {
        calendarDate(text);
      } catch {
        return 'Enter a valid start date YYYY-MM-DD.';
      }
      await this.setFlow(sessionId, {
        ...flow,
        kind: 'LEAVE_END',
        startDate: text,
      });
      return 'Enter leave end date YYYY-MM-DD.';
    }
    if (flow.kind === 'LEAVE_END') {
      try {
        calendarDate(text);
        const result = await this.leave.create(actor, {
          employeeId: id,
          leaveTypeId: flow.leaveTypeId!,
          startDate: flow.startDate!,
          endDate: text,
        });
        await this.setFlow(sessionId, null);
        await this.auditAction(actor, id, 'WHATSAPP_ESS_LEAVE_REQUESTED');
        return `Leave request ${result.id} submitted for ${result.requestedWorkingDays} working days. Status PENDING.`;
      } catch {
        return 'Leave request could not be submitted. Check the date and balance policy, or contact HR. Reply 0 to cancel.';
      }
    }
    if (flow.kind === 'EXCEPTION') {
      if (text.length < 5 || text.length > 500) return 'Use 5–500 characters.';
      const exception = await this.prisma.attendanceException.findFirst({
        where: {
          organizationId: org,
          employeeId: id,
          status: AttendanceExceptionStatus.OPEN,
          employeeExplanation: null,
        },
        orderBy: { detectedAt: 'desc' },
      });
      if (!exception) {
        await this.setFlow(sessionId, null);
        return 'The exception is no longer open.';
      }
      const changed = await this.prisma.attendanceException.updateMany({
        where: {
          id: exception.id,
          organizationId: org,
          status: AttendanceExceptionStatus.OPEN,
          employeeExplanation: null,
        },
        data: {
          employeeExplanation: text,
          explainedAt: new Date(),
          explainedByUserId: actor.sub,
        },
      });
      await this.setFlow(sessionId, null);
      if (!changed.count) return 'The exception was already updated.';
      await this.auditAction(actor, id, 'WHATSAPP_ESS_EXCEPTION_EXPLAINED');
      return 'Explanation submitted for supervisor review.';
    }
    if (flow.kind === 'HR_SUMMARY') {
      if (text.length < 5 || text.length > 500) return 'Use 5–500 characters.';
      const request = await this.desk.createForEmployee(actor, id, {
        summary: text,
      });
      await this.setFlow(sessionId, null);
      await this.auditAction(actor, id, 'WHATSAPP_ESS_HR_REQUESTED');
      return `HR request ${request.reference} created.`;
    }
    if (flow.kind === 'EARLY_AMOUNT') {
      const parts = text.trim().split(/\s+/),
        amount = Number(parts[0]),
        transferType = parts[1]?.toUpperCase();
      const quote = await this.earlyPay.quote(org, id);
      if (
        !Number.isFinite(amount) ||
        !quote.eligible ||
        amount < quote.policy.minimumRequestAmount ||
        amount > quote.availableAmount ||
        !['STANDARD', 'INSTANT'].includes(transferType)
      )
        return 'Enter an eligible amount and STANDARD or INSTANT.';
      await this.setFlow(sessionId, {
        kind: 'EARLY_CONFIRM',
        amount,
        transferType: transferType as 'STANDARD' | 'INSTANT',
      });
      return `Confirm Early Pay R${amount.toFixed(2)} ${transferType}. Reply YES to submit or 0 to cancel.`;
    }
    if (flow.kind === 'EARLY_CONFIRM') {
      if (text.toUpperCase() !== 'YES')
        return 'Reply YES to submit or 0 to cancel.';
      const request = await this.earlyPay.createRequest(org, {
        employeeId: id,
        amount: flow.amount!,
        transferType: flow.transferType! as any,
      });
      await this.setFlow(sessionId, null);
      await this.auditAction(actor, id, 'WHATSAPP_ESS_EARLY_PAY_REQUESTED');
      return `Early Pay request ${request.id} submitted for approval.`;
    }
    await this.setFlow(sessionId, null);
    return MENU;
  }
  async redeemPayslip(token: string) {
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(token))
      throw new NotFoundException('Link not found');
    const hash = createHash('sha256').update(token).digest('hex');
    const link = await this.prisma.payslipAccessLink.findUnique({
      where: { tokenHash: hash },
    });
    if (!link || link.usedAt || link.expiresAt <= new Date())
      throw new NotFoundException('Link expired or used');
    const changed = await this.prisma.payslipAccessLink.updateMany({
      where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Link expired or used');
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        id: link.payslipId,
        organizationId: link.organizationId,
        employeeId: link.employeeId,
        status: PayslipStatus.ISSUED,
      },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    return this.payslips.generatePdf(link.organizationId, payslip.id);
  }
  async announcement(actor: TenantJwtUser, dto: CreateAnnouncementDto) {
    return this.communications.create(actor, { ...dto, audience: 'COMPANY' });
  }
  async hrRequests(organizationId: string) {
    return this.prisma.hrServiceRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
  async updateHrRequest(actor: TenantJwtUser, id: string, status: string) {
    return this.desk.status(actor, id, status);
  }
}
