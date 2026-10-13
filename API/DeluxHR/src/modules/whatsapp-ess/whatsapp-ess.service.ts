import { buildWhatsAppMenu, validMenuId, actionMessage, dateLabel, timeLabel, leaveActions, attendanceActions, type EssReply, type MenuCategory } from './whatsapp-menu';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { WhatsAppService, WhatsAppMessageRejected } from '../whatsapp/whatsapp.service';
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
    | 'ATTEMPT_EXPLANATION'
    | 'CLOCK_LOCATION'
    | 'LEAVE_TYPE'
    | 'LEAVE_START'
    | 'LEAVE_END'
    | 'BALANCE_TYPE'
    | 'EXCEPTION'
    | 'HR_SUMMARY'
    | 'EARLY_AMOUNT'
    | 'EARLY_CONFIRM';
  attemptId?: string;
  leaveTypeId?: string;
  startDate?: string;
  amount?: number;
  transferType?: 'STANDARD' | 'INSTANT';
};
export function normalizedPhone(value: string) {
  return value.replace(/\D/g, '');
}
@Injectable()
export class WhatsAppEssService {
  private readonly logger = new Logger('WhatsAppProcessing');
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
    if (!messageId || !phone || !body || body.length > 2000) {
      this.logger.warn('WA_INPUT_IGNORED invalid=true');
      return;
    }
    this.logger.log('WA_PROCESS_STARTED');
    this.logger.log(`WA_INBOUND_REF ref=${createHash('sha256').update(messageId).digest('hex').slice(0, 12)}`);
    const recent = await this.prisma.whatsAppInboundMessage.count({
      where: { phone, receivedAt: { gte: new Date(Date.now() - 10 * 60000) } },
    });
    if (recent >= 30) {
      this.logger.warn('WA_RATE_LIMITED');
      return;
    }
    try {
      await this.prisma.whatsAppInboundMessage.create({
        data: { providerMessageId: messageId, phone },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.log('WA_DUPLICATE_IGNORED');
        return;
      }
      this.logger.error('WA_INBOUND_RECORD_FAILED');
      throw error;
    }
    let stage = 'HANDLE';
    try {
      const reply = await this.handle(phone, body.trim(), messageId, location);
      this.logger.log('WA_REPLY_PREPARED');
      stage = 'SEND';
      if (typeof reply === 'string') await this.whatsapp.sendTextMessage(from, reply);
      else {
        try { await this.whatsapp.sendInteractiveList(from, reply.interactive); }
        catch (error) {
          if (!(error instanceof WhatsAppMessageRejected) || ![400, 422].includes(error.httpStatus)) throw error;
          this.logger.warn('WA_MENU_TEXT_FALLBACK');
          await this.whatsapp.sendTextMessage(from, reply.fallback);
        }
      }
      this.logger.log('WA_REPLY_ACCEPTED_BY_META');
      stage = 'COMPLETE';
      await this.prisma.whatsAppInboundMessage.update({
        where: { providerMessageId: messageId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`WA_PROCESS_FAILED stage=${stage}`);
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
  ): Promise<EssReply> {
    const employees = await this.prisma.employee.findMany({
      where: {
        status: EmployeeStatus.ACTIVE,
        whatsappOptInAt: { not: null },
        OR: [{ whatsappNumber: phone }, { whatsappNumber: '+' + phone }],
      },
      include: { user: true, whatsappEssIdentity: true },
      take: 2,
    });
    if (employees.length !== 1 || !employees[0].whatsappEssIdentity?.isActive || !employees[0].user?.isActive || employees[0].user.organizationId !== employees[0].organizationId) {
      this.logger.log('WA_EMPLOYEE_NOT_ENROLLED');
      return 'Your WhatsApp self-service is not set up. Contact HR.';
    }
    const employee = employees[0],
      identity = employee.whatsappEssIdentity!,
      actor = this.actor(employee);
    if (
      !(await this.entitlements.hasFeature(
        employee.organizationId,
        Feature.WHATSAPP,
      ))
    ) {
      this.logger.log('WA_COMPANY_FEATURE_DISABLED');
      return 'WhatsApp self-service is not enabled for your company.';
    }
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
      return this.menu(actor.organizationId);
    }
    if (/^PIN\s/i.test(text)) return this.menu(actor.organizationId);
    let flow = session.flow as Flow | null;
    if (validMenuId(text)) {
      await this.setFlow(session.id, null);
      flow = null;
      if (text.startsWith('WA_MENU_')) return this.menu(actor.organizationId, text.slice(8) as MenuCategory);
      if (text.startsWith('WA_TYPES_')) { const parts=text.split('_'); await this.setFlow(session.id,{kind:parts[2]==='BALANCE'?'BALANCE_TYPE':'LEAVE_TYPE'}); return this.leaveTypes(actor.organizationId, parts[2] as 'BALANCE'|'REQUEST', Number(parts[3])); }
      if (text.startsWith('WA_TYPE_')) { const parts=text.split('_'); await this.setFlow(session.id,{kind:parts[2]==='BALANCE'?'BALANCE_TYPE':'LEAVE_TYPE'}); return this.selectedLeaveType(employee, actor, session.id, parts[2] as 'BALANCE'|'REQUEST',parts[3]); }
      if (text.startsWith('WA_REQUEST_')) return this.selectedLeaveType(employee,actor,session.id,'REQUEST',text.slice(11));
      if (text.startsWith('WA_ATTEMPT_EXPLAIN_')) { const attemptId=text.slice(19); const attempt=await this.prisma.attendanceAttempt.findFirst({where:{id:attemptId,organizationId:actor.organizationId,employeeId:employee.id,submittedByUserId:actor.sub,status:'PENDING'}}); if(!attempt)return actionMessage('Attendance review','This attempt is no longer awaiting your explanation.',attendanceActions);await this.setFlow(session.id,{kind:'ATTEMPT_EXPLANATION',attemptId});return actionMessage('📝 Explain your location','Tell your supervisor why you checked in at this location (5–1000 characters).',[{id:'WA_MENU_ATTENDANCE',title:'Cancel'},{id:'WA_MENU_HOME',title:'Main menu'}]); }
      text = text.slice(10);
    }
    if (text.toLowerCase() === '0' || text.toLowerCase() === 'menu') {
      await this.setFlow(session.id, null);
      return this.menu(actor.organizationId);
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
      return actionMessage('📍 Attendance','Choose 6 to clock in or 7 to clock out before sharing your current location.',attendanceActions);
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
        return this.leaveTypes(org,text==='2'?'BALANCE':'REQUEST');
      }
      case '4': {
        if (!(await this.entitlements.hasFeature(org, Feature.LEAVE)))
          return 'Leave is not enabled for your company.';
        const item = await this.prisma.leaveRequest.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { createdAt: 'desc' },
          include: { leaveType: true },
        });
        return item ? actionMessage('🌴 Latest leave request', `${item.leaveType.name}\nDates: ${dateLabel(item.startDate)} – ${dateLabel(item.endDate)}\nStatus: ${item.status==='PENDING'?'Awaiting approval':item.status==='APPROVED'?'Approved':'Rejected'}`,leaveActions) : actionMessage('🌴 Leave requests','No leave request found.',leaveActions);
      }
      case '5': {
        if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE)))
          return 'Attendance is not enabled for your company.';
        const event = await this.prisma.attendanceEvent.findFirst({
          where: { organizationId: org, employeeId: id },
          orderBy: { capturedAt: 'desc' },
        });
        const attempt=await this.prisma.attendanceAttempt.findFirst({where:{organizationId:org,employeeId:id,...(event?{capturedAt:{gte:event.capturedAt}}:{})},orderBy:{capturedAt:'desc'}});
        return attempt&&attempt.status!=='CONFIRMED' ? actionMessage('📍 Latest attendance attempt',`${timeLabel(attempt.capturedAt,attempt.timezone)}\nStatus: ${attempt.status==='PENDING'?'Awaiting supervisor review':attempt.status==='REJECTED'?'Rejected':'Superseded'}\nThis attempt is not confirmed attendance.`,attendanceActions) : event ? actionMessage('📋 My attendance',`${event.eventType==='CHECK_IN'?'Clock-in':'Clock-out'} recorded\nTime: ${timeLabel(event.capturedAt)}\nChannel: ${event.channel.replaceAll('_',' ')}`,attendanceActions) : actionMessage('📋 My attendance','No attendance event found.',attendanceActions);
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
          return actionMessage('⚠️ Attendance already recorded','Attendance sequence is not ready for that action. Check your latest attendance or contact your supervisor if a correction is needed.',attendanceActions);
        await this.setFlow(session.id, {
          kind: 'CLOCK_LOCATION',
          eventType,
          requestedAt: now.toISOString(),
        });
        return actionMessage(`📍 Share your location to ${eventType === AttendanceEventType.CHECK_IN ? 'clock in' : 'clock out'}`, '1. Tap Attach (+ / paperclip).\n2. Choose Location → Send your current location.\n\nSend it within 5 minutes. Attendance is recorded only after your location is accepted. Reply 0 to cancel.',[{id:'WA_MENU_ATTENDANCE',title:'Cancel'},{id:'WA_MENU_HOME',title:'Main menu'}]);
      }
      case '8': {
        if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE))) return 'Attendance is not enabled for your company.';
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
        return this.menu(actor.organizationId);
    }
  }
  private async captureLocation(
    employee: { id: string; organizationId: string },
    actor: TenantJwtUser,
    sessionId: string,
    flow: Flow,
    location: SharedLocation | undefined,
    messageId: string,
  ): Promise<EssReply> {
    const org = employee.organizationId,
      now = new Date();
    const requestedAt = new Date(flow.requestedAt ?? '').getTime();
    if (
      !Number.isFinite(requestedAt) ||
      now.getTime() - requestedAt > 5 * 60000 ||
      requestedAt > now.getTime()
    ) {
      await this.setFlow(sessionId, null);
      return actionMessage('📍 Attendance','Location request expired. Choose 6 or 7 again; no attendance was recorded.',attendanceActions);
    }
    if (!(await this.entitlements.hasFeature(org, Feature.ATTENDANCE))) {
      await this.setFlow(sessionId, null);
      return actionMessage('📍 Attendance','Attendance is not enabled for your company.',attendanceActions);
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
      return actionMessage('📍 Attendance','Send a valid location using Attach > Location > Send your current location, or reply 0 to cancel. No attendance was recorded.',attendanceActions);
    const eventType = flow.eventType;
    if (
      ![AttendanceEventType.CHECK_IN, AttendanceEventType.CHECK_OUT].includes(
        eventType!,
      )
    ) {
      await this.setFlow(sessionId, null);
      return actionMessage('📍 Attendance','Choose 6 or 7 again.',attendanceActions);
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
      return actionMessage('📍 Attendance','Attendance sequence has changed. No attendance was recorded; contact your supervisor if a correction is needed.',attendanceActions);
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
      return actionMessage('📍 Attendance','This location request was cancelled or already handled. Check option 5 or choose 6 or 7 again.',attendanceActions);
    let captured: Awaited<ReturnType<AttendanceEventsService['create']>>;
    try {
      captured = await this.attendance.create(
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
      return actionMessage('📍 Attendance','Attendance capture could not be confirmed. Check option 5 before retrying, or contact your supervisor. Reply 0 to cancel.',attendanceActions);
    }
    await this.auditAction(
      actor,
      employee.id,
      eventType === AttendanceEventType.CHECK_IN
        ? 'WHATSAPP_ESS_CLOCK_IN'
        : 'WHATSAPP_ESS_CLOCK_OUT',
    );
    const result = captured as typeof captured & {attendanceStatus?:string;attemptId?:string;lateMinutes?:number;timezone?:string;siteName?:string|null;reason?:string;distanceM?:number|null};
    const label=eventType===AttendanceEventType.CHECK_IN?'Clock-in':'Clock-out';
    if(result.attendanceStatus&&result.attendanceStatus!=='CONFIRMED') return actionMessage('⚠️ '+label+' needs attention',`Your attempt was saved. It has not been confirmed as valid attendance.\nAssigned site: ${result.siteName??'Not configured'}\nReason: ${result.reason?.replaceAll('_',' ').replaceAll(',',' · ')??'Supervisor review required'}${result.distanceM!=null?`\nDistance from site centre: ${Math.round(result.distanceM)} metres`:''}\nA review item is available to your authorised supervisor.`,result.attendanceStatus==='PENDING'?[{id:`WA_ATTEMPT_EXPLAIN_${result.attemptId}`,title:'Explain location'},{id:eventType==='CHECK_IN'?'WA_ACTION_6':'WA_ACTION_7',title:'Send location again'},{id:'WA_MENU_ATTENDANCE',title:'Attendance menu'}]:attendanceActions);
    return actionMessage(`✅ ${label} recorded`, `Time: ${timeLabel(now,result.timezone)}\nLocation: ${result.reason?.includes('OUTSIDE_SITE')?'Outside assigned site — flagged for review':'Shared location accepted'}${result.lateMinutes?`\nLate by: ${result.lateMinutes} minutes after scheduled start.\nA review alert has been queued in DeluxHR. No automatic pay deduction.`:''}`, [{id:'WA_ACTION_5',title:'My attendance'},{id:eventType==='CHECK_IN'?'WA_ACTION_7':'WA_MENU_ATTENDANCE',title:eventType==='CHECK_IN'?'Clock out':'Attendance menu'},{id:'WA_MENU_HOME',title:'Main menu'}]);
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
  ): Promise<EssReply> {
    const org = employee.organizationId,
      id = employee.id;
    if ((flow.kind.startsWith('LEAVE_') || flow.kind==='BALANCE_TYPE') && !(await this.entitlements.hasFeature(org,Feature.LEAVE))) { await this.setFlow(sessionId,null); return actionMessage('🌴 Leave unavailable','Leave is not enabled for your company.',leaveActions); }
    if (flow.kind === 'LEAVE_TYPE' || flow.kind === 'BALANCE_TYPE') {
      const types = await this.prisma.leaveType.findMany({
        where: { organizationId: org },
        orderBy: { name: 'asc' },
        take: 20,
      });
      const index = Number(text) - 1;
      if (!Number.isInteger(index) || !types[index])
        return 'Choose a listed leave type number.';
      return this.selectedLeaveType(employee,actor,sessionId,flow.kind==='BALANCE_TYPE'?'BALANCE':'REQUEST',types[index].id);
    }
    if (flow.kind === 'ATTEMPT_EXPLANATION') { if(text.trim().length<5 || text.length>1000)return 'Use 5–1000 characters.'; const saved=await this.prisma.attendanceAttempt.updateMany({where:{id:flow.attemptId,organizationId:org,employeeId:id,submittedByUserId:actor.sub,status:'PENDING'},data:{explanation:text.trim().slice(0,1000)}});if(text.trim().length<5)return 'Use 5–1000 characters.';await this.audit.log({organizationId:org,entity:'AttendanceAttempt',entityId:flow.attemptId!,action:'ATTENDANCE_ATTEMPT_EXPLAINED',actorUserId:actor.sub,actorEmail:actor.email,actorRole:actor.role});await this.setFlow(sessionId,null);return actionMessage('📝 Explanation saved',saved.count?'Your explanation is available for supervisor review.':'This attempt is no longer awaiting review.',attendanceActions); }
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
        const type=await this.prisma.leaveType.findFirst({where:{id:flow.leaveTypeId,organizationId:org}});
        return actionMessage('✅ Leave request submitted',`${type?.name??'Leave'}\nDates: ${dateLabel(flow.startDate!)} – ${dateLabel(text)}\nDuration: ${result.requestedWorkingDays} working ${result.requestedWorkingDays===1?'day':'days'}\nStatus: Awaiting approval\n\nYour request has been sent for review.`,leaveActions);
      } catch (error) {
        const message=error instanceof BadRequestException || error instanceof ConflictException ? error.message : 'Check the date and balance policy, or contact HR.';
        return actionMessage('⚠️ Leave request not submitted',message,[{id:'WA_ACTION_3',title:'Choose new dates'},{id:'WA_MENU_LEAVE',title:'Back to Leave'},{id:'WA_MENU_HOME',title:'Main menu'}]);
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
    return this.menu(actor.organizationId);
  }

  private async leaveTypes(org:string,kind:'BALANCE'|'REQUEST',page=0):Promise<EssReply> {
    if(!(await this.entitlements.hasFeature(org,Feature.LEAVE)))return actionMessage('🌴 Leave unavailable','Leave is not enabled for your company.',leaveActions);
    const types=await this.prisma.leaveType.findMany({where:{organizationId:org},orderBy:{name:'asc'},take:100});
    if(!types.length)return actionMessage('🌴 Leave types','No leave types configured. Contact HR.',leaveActions);
    page=Math.max(0,Math.min(page,Math.floor((types.length-1)/7)));
    const rows=types.slice(page*7,page*7+7).map((t,i)=>({id:`WA_TYPE_${kind}_${t.id}`,title:t.name.slice(0,24),description:`${page*7+i+1}. ${t.name}`.slice(0,72)}));
    if(page>0)rows.push({id:`WA_TYPES_${kind}_${page-1}`,title:'Previous types',description:'See earlier leave types'});
    if((page+1)*7<types.length)rows.push({id:`WA_TYPES_${kind}_${page+1}`,title:'More leave types',description:'See additional leave types'});
    rows.push({id:'WA_MENU_LEAVE',title:'Back to Leave menu',description:'Choose a different leave action'});
    return {interactive:{type:'list',header:{type:'text',text:kind==='BALANCE'?'🌴 Check leave balance':'🌴 Request leave'},body:{text:'Choose your leave type below.'},footer:{text:'Reply 0 to cancel and open the main menu'},action:{button:'Choose leave type',sections:[{title:'Leave types',rows}]}},fallback:'*Choose leave type*\n\n'+types.slice(0,20).map((t,i)=>`${i+1}. ${t.name}`).join('\n')+'\n\nReply with its number, or 0 to cancel.'};
  }
  private async selectedLeaveType(employee:{id:string;organizationId:string},actor:TenantJwtUser,sessionId:string,kind:'BALANCE'|'REQUEST',leaveTypeId:string):Promise<EssReply> {
    if(!(await this.entitlements.hasFeature(actor.organizationId,Feature.LEAVE))){await this.setFlow(sessionId,null);return actionMessage('🌴 Leave unavailable','Leave is not enabled for your company.',leaveActions);}
    const type=await this.prisma.leaveType.findFirst({where:{id:leaveTypeId,organizationId:actor.organizationId}});
    if(!type)return actionMessage('🌴 Leave type unavailable','Refresh the Leave menu and choose a listed type.',leaveActions);
    const asOf=calendarDate(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
    let guidance='';
    try {const value=await this.policy.availability(actor.organizationId,employee.id,leaveTypeId,asOf);
      guidance=value.balanceRequired?`Available to request now: ${value.availableToRequest.toFixed(2)} days (${value.maxFullDays} full working ${value.maxFullDays===1?'day':'days'}).\nAccrued: ${value.accrued.toFixed(2)} days\nUsed: ${value.used.toFixed(2)} days\nReserved for requests: ${value.reserved.toFixed(2)} days${value.negativeAllowance?`\nPolicy negative allowance: ${value.negativeAllowance} days`:''}`:'This leave type does not use an entitlement balance. Requests still need approval.';
      if(kind==='BALANCE'){await this.setFlow(sessionId,null);return actionMessage(`🌴 ${type.name} balance`,guidance,[{id:`WA_REQUEST_${type.id}`,title:'Request leave'},{id:'WA_MENU_LEAVE',title:'Back to Leave'},{id:'WA_MENU_HOME',title:'Main menu'}]);}
    }catch {if(kind==='BALANCE')return actionMessage('🌴 Leave balance','A leave balance is not configured for this type. Contact HR.',leaveActions);}
    await this.setFlow(sessionId,{kind:'LEAVE_START',leaveTypeId});
    return actionMessage(`🌴 Request ${type.name}`,`${guidance}\n\nEnter leave start date YYYY-MM-DD. Availability is checked again for your requested dates.`,[{id:'WA_MENU_LEAVE',title:'Cancel'},{id:'WA_MENU_HOME',title:'Main menu'}]);
  }
  private async menu(organizationId: string, category: MenuCategory = 'HOME') {
    const features = [Feature.CORE_HR, Feature.LEAVE, Feature.ATTENDANCE, Feature.PAYSLIPS, Feature.EARLY_PAY];
    const checks = await Promise.all(features.map(async feature => ({ feature, enabled: await this.entitlements.hasFeature(organizationId, feature) })));
    return buildWhatsAppMenu(new Set(checks.filter(c => c.enabled).map(c => c.feature)), category);
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
