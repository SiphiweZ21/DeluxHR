import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceOfflineSyncModule } from './modules/attendance-offline-sync/attendance-offline-sync.module';";
const newImport =
  "import { AttendanceFieldModule } from './modules/attendance-field/attendance-field.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.10 AttendanceOfflineSyncModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceOfflineSyncModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceOfflineSyncModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceFieldModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceFieldModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.11 AppModule registration complete.');
