import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { AttendanceEventsModule } from './modules/attendance-events/attendance-events.module';";
const newImport =
  "import { AttendanceWebModule } from './modules/attendance-web/attendance-web.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.5 AttendanceEventsModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const moduleAnchor = '    AttendanceEventsModule,\n';

if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected AttendanceEventsModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    AttendanceWebModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    AttendanceWebModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.6 AppModule registration complete.');
