import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceExceptionsModule } from './modules/attendance-exceptions/attendance-exceptions.module';";
const newImport =
  "import { AttendanceSupervisorModule } from './modules/attendance-supervisor/attendance-supervisor.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.13 AttendanceExceptionsModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceExceptionsModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceExceptionsModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceSupervisorModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceSupervisorModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.14 AppModule registration complete.');
