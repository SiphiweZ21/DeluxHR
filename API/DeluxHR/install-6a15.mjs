import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceSupervisorModule } from './modules/attendance-supervisor/attendance-supervisor.module';";
const newImport =
  "import { AttendanceCorrectionsModule } from './modules/attendance-corrections/attendance-corrections.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.14 AttendanceSupervisorModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(importAnchor, `${importAnchor}\n${newImport}`);
}

const moduleAnchor = '    AttendanceSupervisorModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceSupervisorModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceCorrectionsModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceCorrectionsModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.15 AppModule registration complete.');
