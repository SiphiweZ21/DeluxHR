import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceWebModule } from './modules/attendance-web/attendance-web.module';";
const newImport =
  "import { AttendanceIdentitiesModule } from './modules/attendance-identities/attendance-identities.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.6 AttendanceWebModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceWebModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceWebModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceIdentitiesModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceIdentitiesModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.7 AppModule registration complete.');
