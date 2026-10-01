import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendancePoliciesModule } from './modules/attendance-policies/attendance-policies.module';";
const newImport =
  "import { AttendanceEventsModule } from './modules/attendance-events/attendance-events.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.4 AttendancePoliciesModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(importAnchor, `${importAnchor}\n${newImport}`);
}

const moduleAnchor = '    AttendancePoliciesModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendancePoliciesModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceEventsModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceEventsModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.5 AppModule registration complete.');
