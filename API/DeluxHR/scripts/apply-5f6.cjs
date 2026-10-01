const fs = require('fs');

function fail(message) {
  console.error(`5F.6 patch failed: ${message}`);
  process.exit(1);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first === -1) fail(`could not find ${label}`);
  if (text.indexOf(from, first + from.length) !== -1) {
    fail(`${label} matched more than once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

// ----- Prisma schema -----
const schemaPath = 'prisma/schema.prisma';
let schema = fs.readFileSync(schemaPath, 'utf8');

schema = replaceOnce(
  schema,
  `enum Permission {
  MANAGE_COMPANY`,
  `enum Permission {
  MANAGE_COMPANY`,
  'Permission enum anchor',
);

schema = replaceOnce(
  schema,
  `  VIEW_PAYROLL
  MANAGE_PAYROLL
  GENERATE_PAYROLL
  REVIEW_PAYROLL
  APPROVE_PAYROLL
  VIEW_ALL_PAYSLIPS`,
  `  VIEW_PAYROLL
  MANAGE_PAYROLL
  GENERATE_PAYROLL
  REVIEW_PAYROLL
  APPROVE_PAYROLL
  VIEW_ALL_PAYSLIPS

  PREPARE_PAYROLL_PAYMENTS
  APPROVE_PAYROLL_PAYMENTS
  EXPORT_PAYROLL_PAYMENTS`,
  'payroll permission block',
);

schema = replaceOnce(
  schema,
  `enum PayrollPaymentBatchStatus {
  PREPARED
  EXPORTED`,
  `enum PayrollPaymentBatchStatus {
  PREPARED
  APPROVED_FOR_EXPORT
  EXPORTED`,
  'PayrollPaymentBatchStatus enum',
);

schema = replaceOnce(
  schema,
  `  preparedByUserId String
  preparedAt       DateTime @default(now())

  exportedByUserId String?`,
  `  preparedByUserId String
  preparedAt       DateTime @default(now())

  approvedForExportByUserId String?
  approvedForExportAt       DateTime?

  exportedByUserId String?`,
  'payment approval fields',
);

fs.writeFileSync(schemaPath, schema);

// ----- Access-control service: organization-only + hard deny -----
const accessPath = 'src/common/access/access-control.service.ts';
let access = fs.readFileSync(accessPath, 'utf8');

access = replaceOnce(
  access,
  `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,
]);`,
  `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.PREPARE_PAYROLL_PAYMENTS,
  Permission.APPROVE_PAYROLL_PAYMENTS,
  Permission.EXPORT_PAYROLL_PAYMENTS,
]);`,
  'organization-only permission set',
);

access = replaceOnce(
  access,
  `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,
]);`,
  `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.PREPARE_PAYROLL_PAYMENTS,
  Permission.APPROVE_PAYROLL_PAYMENTS,
  Permission.EXPORT_PAYROLL_PAYMENTS,
]);`,
  'manager/employee hard-denied permission set',
);

fs.writeFileSync(accessPath, access);

// ----- Company user permission validation: prevent manager/employee grants -----
const companyUsersPath = 'src/modules/company-users/company-users.service.ts';
if (fs.existsSync(companyUsersPath)) {
  let companyUsers = fs.readFileSync(companyUsersPath, 'utf8');

  companyUsers = replaceOnce(
    companyUsers,
    `    const managerForbiddenPermissions: Permission[] = [
      ...accessManagementPermissions,
      Permission.ADD_EMPLOYEES,
    ];`,
    `    const managerForbiddenPermissions: Permission[] = [
      ...accessManagementPermissions,
      Permission.ADD_EMPLOYEES,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      Permission.EXPORT_PAYROLL_PAYMENTS,
    ];`,
    'manager forbidden permissions',
  );

  companyUsers = replaceOnce(
    companyUsers,
    `      Permission.APPROVE_PAYROLL,
      Permission.MANAGE_EARLY_PAY_POLICY,`,
    `      Permission.APPROVE_PAYROLL,
      Permission.PREPARE_PAYROLL_PAYMENTS,
      Permission.APPROVE_PAYROLL_PAYMENTS,
      Permission.EXPORT_PAYROLL_PAYMENTS,
      Permission.MANAGE_EARLY_PAY_POLICY,`,
    'employee forbidden payroll permissions',
  );

  fs.writeFileSync(companyUsersPath, companyUsers);
}

// ----- Payroll payment service -----
const servicePath = 'src/modules/payroll-payments/payroll-payments.service.ts';
let service = fs.readFileSync(servicePath, 'utf8');

// Export validation must operate only after release approval.
service = replaceOnce(
  service,
  `    const batch = await this.loadPreparedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );`,
  `    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );`,
  'validateExport loader',
);

service = replaceOnce(
  service,
  `    const batch = await this.loadPreparedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );`,
  `    const batch = await this.loadApprovedPaymentBatchForExport(
      organizationId,
      paymentBatchId,
    );`,
  'generateExport loader',
);

// Export transition now starts from APPROVED_FOR_EXPORT.
service = replaceOnce(
  service,
  `            status: PayrollPaymentBatchStatus.PREPARED,
          },
          data: {
            status: PayrollPaymentBatchStatus.EXPORTED,`,
  `            status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
          },
          data: {
            status: PayrollPaymentBatchStatus.EXPORTED,`,
  'conditional export transition',
);

service = replaceOnce(
  service,
  `'Payment batch is no longer PREPARED and cannot be exported.'`,
  `'Payment batch is no longer APPROVED_FOR_EXPORT and cannot be exported.'`,
  'export conflict message',
);

// Rename loader and enforce approval status.
service = replaceOnce(
  service,
  `  private async loadPreparedPaymentBatchForExport(`,
  `  private async loadApprovedPaymentBatchForExport(`,
  'export loader method name',
);

service = replaceOnce(
  service,
  `    if (paymentBatch.status !== PayrollPaymentBatchStatus.PREPARED) {
      throw new BadRequestException(
        \`Export requires a PREPARED payment batch. Current status is \${paymentBatch.status}.\`,
      );
    }`,
  `    if (
      paymentBatch.status !== PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT
    ) {
      throw new BadRequestException(
        \`Export requires an APPROVED_FOR_EXPORT payment batch. Current status is \${paymentBatch.status}.\`,
      );
    }`,
  'export loader status check',
);

// Insert approval method before listExportAdapters.
const approvalMethod = `  async approveForExport(
    organizationId: string,
    paymentBatchId: string,
    actor: TenantJwtUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const paymentBatch = await tx.payrollPaymentBatch.findFirst({
          where: {
            id: paymentBatchId,
            organizationId,
          },
          select: {
            id: true,
            payrollBatchId: true,
            status: true,
            currency: true,
            employeeCount: true,
            totalAmount: true,
            preparedByUserId: true,
            preparedAt: true,
            approvedForExportByUserId: true,
            approvedForExportAt: true,
          },
        });

        if (!paymentBatch) {
          throw new NotFoundException('Payroll payment batch not found.');
        }

        if (paymentBatch.status !== PayrollPaymentBatchStatus.PREPARED) {
          throw new BadRequestException(
            \`Release approval requires a PREPARED payment batch. Current status is \${paymentBatch.status}.\`,
          );
        }

        if (paymentBatch.preparedByUserId === actor.sub) {
          throw new BadRequestException(
            'The user who prepared the payment batch cannot approve the same batch for export.',
          );
        }

        const approvedAt = new Date();

        const updated = await tx.payrollPaymentBatch.updateMany({
          where: {
            id: paymentBatchId,
            organizationId,
            status: PayrollPaymentBatchStatus.PREPARED,
            preparedByUserId: {
              not: actor.sub,
            },
          },
          data: {
            status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
            approvedForExportByUserId: actor.sub,
            approvedForExportAt: approvedAt,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Payment batch changed before approval could be completed.',
          );
        }

        await this.auditService.log(
          {
            organizationId,
            action: 'PAYROLL_PAYMENT_BATCH_APPROVED_FOR_EXPORT',
            entity: 'PayrollPaymentBatch',
            entityId: paymentBatchId,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              payrollBatchId: paymentBatch.payrollBatchId,
              preparedByUserId: paymentBatch.preparedByUserId,
              approvedForExportByUserId: actor.sub,
              employeeCount: paymentBatch.employeeCount,
              totalAmount: paymentBatch.totalAmount,
              currency: paymentBatch.currency,
            },
          },
          tx,
        );

        return {
          id: paymentBatch.id,
          payrollBatchId: paymentBatch.payrollBatchId,
          status: PayrollPaymentBatchStatus.APPROVED_FOR_EXPORT,
          currency: paymentBatch.currency,
          employeeCount: paymentBatch.employeeCount,
          totalAmount: paymentBatch.totalAmount,
          preparedByUserId: paymentBatch.preparedByUserId,
          preparedAt: paymentBatch.preparedAt,
          approvedForExportByUserId: actor.sub,
          approvedForExportAt: approvedAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

`;

service = replaceOnce(
  service,
  `  listExportAdapters() {`,
  approvalMethod + `  listExportAdapters() {`,
  'listExportAdapters insertion point',
);

// Include approval metadata in normal reads.
service = replaceOnce(
  service,
  `        preparedAt: true,
        exportedAt: true,`,
  `        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedAt: true,`,
  'list approval metadata',
);

service = replaceOnce(
  service,
  `        preparedAt: true,
        exportedByUserId: true,`,
  `        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedByUserId: true,`,
  'findOne approval metadata',
);

fs.writeFileSync(servicePath, service);

console.log('5F.6 source changes applied successfully.');
