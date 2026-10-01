import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { EmployeeWorkLocationsModule } from './modules/employee-work-locations/employee-work-locations.module';";
const newImport =
  "import { AttendancePoliciesModule } from './modules/attendance-policies/attendance-policies.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.3 EmployeeWorkLocationsModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(importAnchor, `${importAnchor}\n${newImport}`);
}

const moduleAnchor = '    EmployeeWorkLocationsModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected EmployeeWorkLocationsModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendancePoliciesModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendancePoliciesModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.4 AppModule registration complete.');
