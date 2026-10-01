import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceKiosksModule } from './modules/attendance-kiosks/attendance-kiosks.module';";
const newImport =
  "import { AttendanceSiteQrModule } from './modules/attendance-site-qr/attendance-site-qr.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.8 AttendanceKiosksModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceKiosksModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceKiosksModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceSiteQrModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceSiteQrModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.9 AppModule registration complete.');
