import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HrServiceDeskService } from './hr-service-desk.service';
const actor = { sub: 'user-1', email: 'employee@example.com', organizationId: 'org-1', role: 'EMPLOYEE' as const };
describe('HR service desk access and workflow', () => {
 const db: any = { employee: { findFirst: jest.fn() }, hrServiceRequest: { findFirst: jest.fn() }, hrRequestAttachment: { findFirst: jest.fn() }, $transaction: jest.fn() };
 const service = new HrServiceDeskService(db, {} as any);
 beforeEach(() => jest.clearAllMocks());
 it('rejects another employee’s request as not found', async () => {
  db.hrServiceRequest.findFirst.mockResolvedValue({ id: 'request-1', employeeId: 'employee-2' });
  db.employee.findFirst.mockResolvedValue({ id: 'employee-1' });
  await expect(service.detail(actor as any,'request-1')).rejects.toBeInstanceOf(NotFoundException);
 });
 it('refuses employee internal notes', async () => {
  db.hrServiceRequest.findFirst.mockResolvedValue({ id: 'request-1', employeeId: 'employee-1', status: 'OPEN' });
  db.employee.findFirst.mockResolvedValue({ id: 'employee-1' });
  await expect(service.comment(actor as any,'request-1',{ body: 'secret', internal: true })).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('enforces valid status transitions', async () => {
  db.hrServiceRequest.findFirst.mockResolvedValue({ id: 'request-1', employeeId: 'employee-1', status: 'OPEN' });
  db.$transaction.mockImplementation(async (fn: any) => fn({ hrServiceRequest: { findFirst: jest.fn().mockResolvedValue({ id: 'request-1', status: 'OPEN' }) } }));
  await expect(service.status(actor as any,'request-1','CLOSED')).rejects.toBeInstanceOf(BadRequestException);
 });
 it('rejects a forged or unsupported upload', async () => {
  db.hrServiceRequest.findFirst.mockResolvedValue({ id: 'request-1', employeeId: 'employee-1', status: 'OPEN' });
  db.employee.findFirst.mockResolvedValue({ id: 'employee-1' });
  await expect(service.attach(actor as any,'request-1',{ buffer: Buffer.from('not a pdf'), size: 9, originalname: 'a.pdf' } as any)).rejects.toBeInstanceOf(BadRequestException);
 });
});
