import { RejectEmployeeDocumentDto } from '../employee-documents/dto/reject-employee-document.dto';
import {
  CreatePositionDto,
  CompanyDocumentDto,
  CompanyDocumentDecisionDto,
} from './customer-onboarding.dto';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { EmployeeDocumentsService } from '../employee-documents/employee-documents.service';
import { UploadEmployeeDocumentDto } from '../employee-documents/dto/upload-employee-document.dto';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { OrganizationsService } from '../organizations/organizations.service';
import { UpdateCompanyProfileDto } from '../organizations/dto/update-company-profile.dto';
import { DepartmentsService } from '../departments/departments.service';
import { CreateDepartmentDto } from '../departments/dto/create-department.dto';
import { WorkLocationsService } from '../work-locations/work-locations.service';
import { CreateWorkLocationDto } from '../work-locations/dto/create-work-location.dto';
import { ShiftsService } from '../shifts/shifts.service';
import { CreateShiftDto } from '../shifts/dto/create-shift.dto';
import { LeaveTypesService } from '../leave/leave-types/leave-types.service';
import { CreateLeaveTypeDto } from '../leave/leave-types/dto/create-leave-type.dto';
import { LeavePolicyService } from '../leave/leave-policy/leave-policy.service';
import {
  AdjustLeaveBalanceDto,
  AssignLeavePolicyDto,
  CreateLeavePolicyDto,
  CreatePublicHolidayDto,
} from '../leave/leave-policy/dto/leave-policy.dto';
import { PayrollConfigurationService } from '../payroll-configuration/payroll-configuration.service';
import {
  UpdatePayrollSettingsDto,
  UpsertPayrollProfileDto,
} from '../payroll-configuration/dto/payroll-configuration.dto';
import { EmployeesService } from '../employees/employees.service';
import { BulkCreateEmployeesDto } from '../employees/dto/bulk-create-employees.dto';
import { UpdateEmployeeDto } from '../employees/dto/update-employee.dto';
import { CompanyUsersService } from '../company-users/company-users.service';
import { EmployeePaymentDetailsService } from '../employee-payment-details/employee-payment-details.service';
import { CreateEmployeePaymentDetailDto } from '../employee-payment-details/dto/create-employee-payment-detail.dto';
import { ApproveEmployeePaymentDetailDto } from '../employee-payment-details/dto/approve-employee-payment-detail.dto';
import { CreateCompanyUserDto } from '../company-users/dto/create-company-user.dto';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { OnboardingConfirmationDto } from './customer-onboarding.dto';
@UseGuards(JwtAuthGuard, TenantAccessGuard)
@AllowPendingOnboarding()
@Controller('customer-onboarding')
export class CustomerOnboardingController {
  constructor(
    private readonly documents: EmployeeDocumentsService,
    private readonly onboarding: CustomerOnboardingService,
    private readonly org: OrganizationsService,
    private readonly departments: DepartmentsService,
    private readonly locations: WorkLocationsService,
    private readonly shifts: ShiftsService,
    private readonly leaveTypes: LeaveTypesService,
    private readonly leave: LeavePolicyService,
    private readonly payroll: PayrollConfigurationService,
    private readonly employees: EmployeesService,
    private readonly users: CompanyUsersService,
    private readonly paymentDetails: EmployeePaymentDetailsService,
  ) {}
  private admin(actor: TenantJwtUser) {
    this.onboarding.assertAdmin(actor);
    return actor.organizationId;
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('lookups')
  lookups(@CurrentTenantUser() a: TenantJwtUser) {
    this.admin(a);
    return this.onboarding.lookups(a);
  }
  @Post('positions') position(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: CreatePositionDto,
  ) {
    return this.onboarding.position(a, d);
  }
  @Post('positions/:id/retire') retirePosition(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.onboarding.retirePosition(a, id);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('employees/:id')
  employeeProfile(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.employees.findOne(this.admin(a), id);
  }
  @Post('employees') createEmployee(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: CreateEmployeeDto,
  ) {
    return this.employees.create(this.admin(a), d, a);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('employees/:id/documents')
  documentsList(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.documents.list(this.admin(a), id);
  }
  @Post('employees/:id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  documentUpload(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Body() d: UploadEmployeeDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.upload(this.admin(a), id, d, file, a);
  }
  @Get('employees/:id/documents/:documentId/file') async documentFile(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const f = await this.documents.getFile(this.admin(a), id, documentId, a);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', 'attachment');
    return res.send(f.buffer);
  }

  @Get('employees/:id/documents/checklist') checklist(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.documents.getChecklist(this.admin(a), id);
  }
  @Post('employees/:id/documents/:documentId/verify') async verifyDocument(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    const org = this.admin(a),
      doc = (await this.documents.list(org, id)).find(
        (d) => d.id === documentId,
      );
    if (!doc || doc.uploadedByUserId === a.sub)
      throw new BadRequestException(
        'A different company administrator must review this document.',
      );
    return this.documents.verify(org, id, documentId, a);
  }
  @Post('employees/:id/documents/:documentId/reject') async rejectDocument(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() d: RejectEmployeeDocumentDto,
  ) {
    const org = this.admin(a),
      doc = (await this.documents.list(org, id)).find(
        (v) => v.id === documentId,
      );
    if (!doc || doc.uploadedByUserId === a.sub)
      throw new BadRequestException(
        'A different company administrator must review this document.',
      );
    return this.documents.reject(org, id, documentId, d.reason, a);
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('documents')
  companyDocuments(@CurrentTenantUser() a: TenantJwtUser) {
    this.admin(a);
    return this.onboarding.companyDocuments(a);
  }
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  uploadCompanyDocument(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: CompanyDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.admin(a);
    return this.onboarding.uploadCompanyDocument(a, d.category, file, d);
  }
  @Get('documents/:id/file') async companyDocumentFile(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const f = await this.onboarding.companyDocumentFile(a, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', 'attachment');
    return res.send(f.buffer);
  }
  @Post('documents/:id/decision') companyDocumentDecision(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id') id: string,
    @Body() d: CompanyDocumentDecisionDto,
  ) {
    this.admin(a);
    return this.onboarding.decideCompanyDocument(a, id, d.status, d.reason);
  }
  @Get('readiness') readiness(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.onboarding.readiness(this.admin(actor));
  }
  @Get('profile')
  @Header('Cache-Control', 'private, no-store')
  async companyProfile(@CurrentTenantUser() actor: TenantJwtUser) {
    const id = this.admin(actor);
    const [profile, readiness] = await Promise.all([
      this.org.findOne(id),
      this.onboarding.readiness(id),
    ]);
    const fields = [
      'name',
      'legalName',
      'registrationNumber',
      'taxNumber',
      'email',
      'phoneNumber',
      'website',
      'addressLine1',
      'addressLine2',
      'city',
      'province',
      'postalCode',
      'country',
      'timezone',
      'brandPrimaryColor',
    ] as const;
    return {
      ...Object.fromEntries(fields.map((key) => [key, profile[key]])),
      payrollRequired: readiness.checklist.some(
        (step) => step.key === 'payrollSettings' && step.required,
      ),
    };
  }
  @Patch('profile') profile(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.org.updateProfile(this.admin(actor), dto, actor);
  }
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  logo(
    @CurrentTenantUser() actor: TenantJwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.onboarding.logo(actor, file);
  }
  @Get('logo') async getLogo(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Res() res: Response,
  ) {
    this.admin(actor);
    const { bytes, mimeType } = await this.onboarding.getLogo(actor);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
  @Post('departments') department(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.departments.create(this.admin(actor), dto);
  }
  @Post('locations') location(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateWorkLocationDto,
  ) {
    return this.locations.create(this.admin(actor), dto, actor);
  }
  @Post('shifts') shift(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateShiftDto,
  ) {
    return this.shifts.create(this.admin(actor), dto, actor);
  }
  @Post('leave-types') leaveType(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveTypes.create(this.admin(actor), dto);
  }
  @Post('leave-policies') leavePolicy(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateLeavePolicyDto,
  ) {
    this.admin(actor);
    return this.leave.create(actor, dto);
  }
  @Post('leave-assignments') leaveAssignment(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: AssignLeavePolicyDto,
  ) {
    this.admin(actor);
    return this.leave.assign(actor, dto);
  }
  @Post('holidays') holiday(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreatePublicHolidayDto,
  ) {
    this.admin(actor);
    return this.leave.addHoliday(actor, dto);
  }
  @Patch('payroll-settings') payrollSettings(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: UpdatePayrollSettingsDto,
  ) {
    return this.payroll.updateSettings(this.admin(actor), dto);
  }
  @Post('administrators') administrator(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: CreateCompanyUserDto,
  ) {
    const org = this.admin(actor);
    if (dto.role !== UserRole.COMPANY_ADMIN)
      throw new BadRequestException(
        'Only company administrators can be created during onboarding',
      );
    return this.users.create(org, dto, actor);
  }
  @Post('employees/bulk') bulk(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: BulkCreateEmployeesDto,
  ) {
    return this.employees.bulkCreate(this.admin(actor), dto.employees, actor);
  }
  @Patch('employees/:id') employee(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(this.admin(actor), id, dto, actor);
  }
  @Post('employees/:id/activate') activateEmployee(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.employees.activate(this.admin(actor), id, actor, true);
  }
  @Post('opening-leave') openingLeave(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: AdjustLeaveBalanceDto,
  ) {
    this.admin(actor);
    if (dto.type !== 'OPENING')
      throw new BadRequestException('Opening balance adjustment type required');
    return this.leave.adjust(actor, dto);
  }
  @Patch('opening-payroll/:employeeId') openingPayroll(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('employeeId') id: string,
    @Body() dto: UpsertPayrollProfileDto,
  ) {
    return this.payroll.upsertProfile(this.admin(actor), id, dto);
  }
  @Post('opening-payroll/:employeeId/payment-details') payment(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('employeeId') id: string,
    @Body() dto: CreateEmployeePaymentDetailDto,
  ) {
    return this.paymentDetails.submit(this.admin(actor), id, dto, {
      id: actor.sub,
      email: actor.email,
      role: actor.role,
    });
  }
  @Post('opening-payroll/:employeeId/payment-details/:paymentDetailId/approve')
  approvePayment(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('employeeId') id: string,
    @Param('paymentDetailId') paymentDetailId: string,
    @Body() dto: ApproveEmployeePaymentDetailDto,
  ) {
    return this.paymentDetails.approve(
      this.admin(actor),
      id,
      paymentDetailId,
      dto.password,
      { id: actor.sub, email: actor.email, role: actor.role },
      true,
    );
  }
  @Post('confirm/:step') confirm(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('step') step: string,
    @Body() dto: OnboardingConfirmationDto,
  ) {
    return this.onboarding.confirm(actor, step, dto.note);
  }
}
