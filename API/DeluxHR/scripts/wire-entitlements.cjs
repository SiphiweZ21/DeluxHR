const fs = require('fs');

const controllers = [
  {
    file: 'src/modules/departments/departments.controller.ts',
    feature: 'CORE_HR',
    common: '../../common',
  },
  {
    file: 'src/modules/employees/employees.controller.ts',
    feature: 'CORE_HR',
    common: '../../common',
  },
  {
    file: 'src/modules/organizations/organizations.controller.ts',
    feature: 'CORE_HR',
    common: '../../common',
  },
  {
    file: 'src/modules/leave/leave-types/leave-types.controller.ts',
    feature: 'LEAVE',
    common: '../../../common',
  },
  {
    file: 'src/modules/leave/leave-requests/leave-requests.controller.ts',
    feature: 'LEAVE',
    common: '../../../common',
  },
  {
    file: 'src/modules/attendance/attendance.controller.ts',
    feature: 'ATTENDANCE',
    common: '../../common',
  },
  {
    file: 'src/modules/timesheets/timesheets.controller.ts',
    feature: 'TIMESHEETS',
    common: '../../common',
  },
  {
    file: 'src/modules/earnings/earnings.controller.ts',
    feature: 'PAYROLL',
    common: '../../common',
  },
  {
    file: 'src/modules/payroll-configuration/payroll-configuration.controller.ts',
    feature: 'PAYROLL',
    common: '../../common',
  },
  {
    file: 'src/modules/payroll/payroll.controller.ts',
    feature: 'PAYROLL',
    common: '../../common',
  },
  {
    file: 'src/modules/payslips/payslips.controller.ts',
    feature: 'PAYSLIPS',
    common: '../../common',
  },
  {
    file: 'src/modules/early-pay/early-pay.controller.ts',
    feature: 'EARLY_PAY',
    common: '../../common',
  },
];

for (const config of controllers) {
  let source = fs.readFileSync(config.file, 'utf8');

  if (!source.includes("Feature } from '@prisma/client'")) {
    source =
      `import { Feature } from '@prisma/client';\n` +
      source;
  }

  const guardImport =
    `import { FeaturesGuard } from '${config.common}/entitlements/features.guard';`;

  const decoratorImport =
    `import { RequireFeatures } from '${config.common}/entitlements/require-features.decorator';`;

  if (!source.includes(guardImport)) {
    source =
      `${guardImport}\n${decoratorImport}\n` +
      source;
  }

  source = source.replace(
    /@UseGuards\(JwtAuthGuard,\s*TenantAccessGuard\)/g,
    '@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard)',
  );

  source = source.replace(
    /@UseGuards\(\s*JwtAuthGuard,\s*TenantAccessGuard,\s*PermissionsGuard,\s*\)/g,
    `@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)`,
  );

  const controllerPattern = /(@Controller\([^)]+\))/;

  if (
    !source.includes(
      `@RequireFeatures(Feature.${config.feature})`,
    )
  ) {
    source = source.replace(
      controllerPattern,
      `@RequireFeatures(Feature.${config.feature})\n$1`,
    );
  }

  fs.writeFileSync(config.file, source);

  console.log(
    `Wired ${config.file} -> ${config.feature}`,
  );
}
