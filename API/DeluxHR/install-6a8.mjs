import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceIdentitiesModule } from './modules/attendance-identities/attendance-identities.module';";
const newImport =
  "import { AttendanceKiosksModule } from './modules/attendance-kiosks/attendance-kiosks.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.7 AttendanceIdentitiesModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceIdentitiesModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceIdentitiesModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceKiosksModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceKiosksModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.8 AppModule registration complete.');
