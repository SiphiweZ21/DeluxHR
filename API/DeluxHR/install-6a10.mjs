import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceSiteQrModule } from './modules/attendance-site-qr/attendance-site-qr.module';";
const newImport =
  "import { AttendanceOfflineSyncModule } from './modules/attendance-offline-sync/attendance-offline-sync.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.9 AttendanceSiteQrModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceSiteQrModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceSiteQrModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceOfflineSyncModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceOfflineSyncModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.10 AppModule registration complete.');
