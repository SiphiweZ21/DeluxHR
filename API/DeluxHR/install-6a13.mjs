import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceHistoryModule } from './modules/attendance-history/attendance-history.module';";
const newImport =
  "import { AttendanceExceptionsModule } from './modules/attendance-exceptions/attendance-exceptions.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.12 AttendanceHistoryModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceHistoryModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceHistoryModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceExceptionsModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceExceptionsModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.13 AppModule registration complete.');
