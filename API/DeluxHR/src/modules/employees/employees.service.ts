import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateEmployeeDto) {
    const department = await this.prisma.department.findFirst({
      where: {
        id: dto.departmentId,
        organizationId,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        email: dto.email,
        organizationId,
      },
    });

    if (existingEmployee) {
      throw new BadRequestException('Employee with this email already exists');
    }

    const employee = await this.prisma.employee.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        whatsappNumber: dto.whatsappNumber ?? dto.phoneNumber,
        whatsappOptInAt: new Date(),
        departmentId: dto.departmentId,
        organizationId,
      },
      include: {
        department: true,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee.id,
    });

    return employee;
  }

  async bulkCreate(organizationId: string, employees: CreateEmployeeDto[]) {
    if (!employees.length) throw new BadRequestException('No employees supplied');
    if (employees.length > 1000) throw new BadRequestException('Bulk import is limited to 1000 employees per upload');

    const departments = await this.prisma.department.findMany({ where: { organizationId }, select: { id: true } });
    const departmentIds = new Set(departments.map((d) => d.id));
    const existing = await this.prisma.employee.findMany({ where: { organizationId }, select: { email: true } });
    const existingEmails = new Set(existing.map((e) => e.email.toLowerCase()));
    const seen = new Set<string>();
    const errors: Array<{ row: number; email: string; message: string }> = [];
    const valid: CreateEmployeeDto[] = [];

    employees.forEach((employee, index) => {
      const email = employee.email.trim().toLowerCase();
      if (!departmentIds.has(employee.departmentId)) errors.push({ row: index + 2, email, message: 'Department not found' });
      else if (existingEmails.has(email) || seen.has(email)) errors.push({ row: index + 2, email, message: 'Duplicate employee email' });
      else { seen.add(email); valid.push({ ...employee, email }); }
    });

    if (errors.length) return { imported: 0, failed: errors.length, errors, employees: [] };

    const created = await this.prisma.$transaction(valid.map((employee) => this.prisma.employee.create({
      data: { ...employee, whatsappNumber: employee.whatsappNumber ?? employee.phoneNumber, whatsappOptInAt: new Date(), organizationId },
      include: { department: true },
    })));
    await this.auditService.log({ organizationId, action: 'EMPLOYEES_BULK_CREATED', entity: 'Employee', entityId: `bulk:${created.length}` });
    return { imported: created.length, failed: 0, errors: [], employees: created };
  }

  async list(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      include: {
        department: true,
      },
      orderBy: {
        firstName: 'asc',
      },
    });
  }

  async findOne(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      include: {
        department: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }
}