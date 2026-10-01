import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private code(value: string) {
    const code = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code) || code.length > 40) throw new BadRequestException('Invalid shift code');
    return code;
  }
  private name(value: string) {
    const name = value.trim();
    if (!name || name.length > 120) throw new BadRequestException('Shift name is required');
    return name;
  }
  private minutes(value: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException('Time must be HH:mm');
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }
  private validate(start: number, end: number, pause: number) {
    const duration = (end - start + 1440) % 1440;
    if (duration === 0) throw new BadRequestException('Start and end must differ');
    if (!Number.isInteger(pause) || pause < 0 || pause >= duration) throw new BadRequestException('Unpaid break must be shorter than shift duration');
  }
  private present(shift: { startMinute: number; endMinute: number; [key: string]: unknown }) {
    const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const { startMinute, endMinute, ...rest } = shift;
    return { ...rest, startTime: time(startMinute), endTime: time(endMinute), overnight: endMinute < startMinute };
  }
  private async requireShift(organizationId: string, id: string) {
    const shift = await this.prisma.shiftDefinition.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }
  private unique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A shift with this code already exists');
    throw error;
  }
  private async log(organizationId: string, actor: TenantJwtUser, shiftId: string, action: string) {
    await this.audit.log({ organizationId, action, entity: 'ShiftDefinition', entityId: shiftId, actorUserId: actor.sub, actorEmail: actor.email, actorRole: actor.role });
  }
  async create(organizationId: string, dto: CreateShiftDto, actor: TenantJwtUser) {
    const startMinute = this.minutes(dto.startTime), endMinute = this.minutes(dto.endTime);
    this.validate(startMinute, endMinute, dto.unpaidBreakMinutes);
    try {
      const shift = await this.prisma.shiftDefinition.create({ data: { organizationId, code: this.code(dto.code), name: this.name(dto.name), startMinute, endMinute, unpaidBreakMinutes: dto.unpaidBreakMinutes } });
      await this.log(organizationId, actor, shift.id, 'SHIFT_CREATED');
      return this.present(shift);
    } catch (error) { this.unique(error); }
  }
  async list(organizationId: string) {
    const shifts = await this.prisma.shiftDefinition.findMany({ where: { organizationId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return shifts.map(shift => this.present(shift));
  }
  async one(organizationId: string, id: string) { return this.present(await this.requireShift(organizationId, id)); }
  async update(organizationId: string, id: string, dto: UpdateShiftDto, actor: TenantJwtUser) {
    const existing = await this.requireShift(organizationId, id);
    const startMinute = dto.startTime === undefined ? existing.startMinute : this.minutes(dto.startTime);
    const endMinute = dto.endTime === undefined ? existing.endMinute : this.minutes(dto.endTime);
    const unpaidBreakMinutes = dto.unpaidBreakMinutes ?? existing.unpaidBreakMinutes;
    this.validate(startMinute, endMinute, unpaidBreakMinutes);
    if (Object.keys(dto).length === 0) return this.present(existing);
    try {
      const shift = await this.prisma.shiftDefinition.update({ where: { id: existing.id }, data: { code: dto.code === undefined ? undefined : this.code(dto.code), name: dto.name === undefined ? undefined : this.name(dto.name), startMinute, endMinute, unpaidBreakMinutes } });
      await this.log(organizationId, actor, id, 'SHIFT_UPDATED');
      return this.present(shift);
    } catch (error) { this.unique(error); }
  }
  async setActive(organizationId: string, id: string, isActive: boolean, actor: TenantJwtUser) {
    const existing = await this.requireShift(organizationId, id);
    if (existing.isActive === isActive) return this.present(existing);
    const shift = await this.prisma.shiftDefinition.update({ where: { id: existing.id }, data: { isActive } });
    await this.log(organizationId, actor, id, isActive ? 'SHIFT_ACTIVATED' : 'SHIFT_DEACTIVATED');
    return this.present(shift);
  }
}
