const fs = require('fs');

function fail(message) {
  console.error(`5F.6 repair failed: ${message}`);
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

// -----------------------------------------------------------------------------
// PayrollPaymentsService
// -----------------------------------------------------------------------------
const servicePath = 'src/modules/payroll-payments/payroll-payments.service.ts';
let service = fs.readFileSync(servicePath, 'utf8');

if (!service.includes('async approveForExport(')) {
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
    '  listExportAdapters() {',
    approvalMethod + '  listExportAdapters() {',
    'service approval insertion point',
  );
}

// Both validation and generation must load only an approved batch.
while (service.includes('this.loadPreparedPaymentBatchForExport(')) {
  service = service.replace(
    'this.loadPreparedPaymentBatchForExport(',
    'this.loadApprovedPaymentBatchForExport(',
  );
}
service = service.replace(
  'private async loadPreparedPaymentBatchForExport(',
  'private async loadApprovedPaymentBatchForExport(',
);

// Export transition must start from APPROVED_FOR_EXPORT.
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
  'approved export transition',
);

service = replaceOnce(
  service,
  `'Payment batch is no longer PREPARED and cannot be exported.'`,
  `'Payment batch is no longer APPROVED_FOR_EXPORT and cannot be exported.'`,
  'export conflict message',
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
  'approved export loader status',
);

// Approval metadata in list.
if (!service.includes('approvedForExportByUserId: true')) {
  service = replaceOnce(
    service,
    `        preparedByUserId: true,
        preparedAt: true,
        exportedAt: true,`,
    `        preparedByUserId: true,
        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedAt: true,`,
    'list approval metadata',
  );

  service = replaceOnce(
    service,
    `        preparedByUserId: true,
        preparedAt: true,
        exportedByUserId: true,`,
    `        preparedByUserId: true,
        preparedAt: true,
        approvedForExportByUserId: true,
        approvedForExportAt: true,
        exportedByUserId: true,`,
    'findOne approval metadata',
  );
}

fs.writeFileSync(servicePath, service);

// -----------------------------------------------------------------------------
// AccessControlService
// -----------------------------------------------------------------------------
const accessPath = 'src/common/access/access-control.service.ts';
let access = fs.readFileSync(accessPath, 'utf8');

const orgAnchor = `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,
]);`;
if (!access.includes('Permission.PREPARE_PAYROLL_PAYMENTS')) {
  const first = access.indexOf(orgAnchor);
  if (first === -1) fail('could not find organization-only permission anchor');
  access =
    access.slice(0, first) +
    `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.PREPARE_PAYROLL_PAYMENTS,
  Permission.APPROVE_PAYROLL_PAYMENTS,
  Permission.EXPORT_PAYROLL_PAYMENTS,
]);` +
    access.slice(first + orgAnchor.length);

  const second = access.indexOf(orgAnchor, first + 1);
  if (second === -1) fail('could not find manager/employee hard-deny anchor');
  access =
    access.slice(0, second) +
    `  Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

  Permission.PREPARE_PAYROLL_PAYMENTS,
  Permission.APPROVE_PAYROLL_PAYMENTS,
  Permission.EXPORT_PAYROLL_PAYMENTS,
]);` +
    access.slice(second + orgAnchor.length);
}

fs.writeFileSync(accessPath, access);

// -----------------------------------------------------------------------------
// CompanyUsersService
// -----------------------------------------------------------------------------
const companyUsersPath = 'src/modules/company-users/company-users.service.ts';
let companyUsers = fs.readFileSync(companyUsersPath, 'utf8');

if (!companyUsers.includes('Permission.PREPARE_PAYROLL_PAYMENTS')) {
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
    'manager forbidden payment permissions',
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
    'employee forbidden payment permissions',
  );
}

fs.writeFileSync(companyUsersPath, companyUsers);

console.log('5F.6 repair applied successfully.');
console.log('Migration 33 was not changed.');
