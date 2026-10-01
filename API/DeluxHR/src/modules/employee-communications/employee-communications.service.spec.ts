import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeeCommunicationsService } from './employee-communications.service';
const actor = { sub: 'user-1', email: 'e@example.com', role: 'EMPLOYEE' as const, organizationId: 'org-1' };
describe('Employee communications audience and privacy', () => {
 const db: any = { employee: { findFirst: jest.fn(), findMany: jest.fn() }, department: { findFirst: jest.fn() }, workLocation: { findFirst: jest.fn() }, communicationTeam: { findFirst: jest.fn() }, announcementReceipt: { findFirst: jest.fn() }, announcementAttachment: { findFirst: jest.fn() } };
 const service = new EmployeeCommunicationsService(db,{} as any);
 beforeEach(() => jest.clearAllMocks());
 it('requires a target field matching the audience', async () => {
  await expect(service.recipients(actor as any,{ title: 'Hi', body: 'Hello', audience: 'DEPARTMENT' })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.recipients(actor as any,{ title: 'Hi', body: 'Hello', audience: 'COMPANY', teamId: 'other' })).rejects.toBeInstanceOf(BadRequestException);
 });
 it('rejects a target in another tenant', async () => {
  db.department.findFirst.mockResolvedValue(null);
  await expect(service.recipients(actor as any,{ title: 'Hi', body: 'Hello', audience: 'DEPARTMENT', departmentId: 'other-dept' })).rejects.toBeInstanceOf(BadRequestException);
 });
 it('does not reveal announcements without a recipient receipt', async () => {
  db.employee.findFirst.mockResolvedValue({ id: 'employee-1' }); db.announcementReceipt.findFirst.mockResolvedValue(null);
  await expect(service.visible(actor as any,'announcement-1')).rejects.toBeInstanceOf(NotFoundException);
 });
 it('rejects unlinked accounts', async () => {
  db.employee.findFirst.mockResolvedValue(null);
  await expect(service.visible(actor as any,'announcement-1')).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('does not acknowledge messages that do not require it', async () => {
  db.employee.findFirst.mockResolvedValue({ id: 'employee-1' }); db.announcementReceipt.findFirst.mockResolvedValue({ announcement: { requiresAcknowledgement: false } });
  await expect(service.mark(actor as any,'announcement-1',true)).rejects.toBeInstanceOf(BadRequestException);
 });
});
