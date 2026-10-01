import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceFieldModule } from './modules/attendance-field/attendance-field.module';";
const newImport =
  "import { AttendanceHistoryModule } from './modules/attendance-history/attendance-history.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.11 AttendanceFieldModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceFieldModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceFieldModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceHistoryModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceHistoryModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.12 AppModule registration complete.');
