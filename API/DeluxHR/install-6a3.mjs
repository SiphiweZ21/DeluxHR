import fs from 'node:fs';

const path = 'src/app.module.ts';
let text = fs.readFileSync(path, 'utf8');

const importAnchor =
  "import { WorkLocationsModule } from './modules/work-locations/work-locations.module';";
const newImport =
  "import { EmployeeWorkLocationsModule } from './modules/employee-work-locations/employee-work-locations.module';";

if (!text.includes(importAnchor)) {
  throw new Error(
    'Expected 6A.2 WorkLocationsModule import was not found. No changes were made.',
  );
}

if (!text.includes(newImport)) {
  text = text.replace(importAnchor, `${importAnchor}\n${newImport}`);
}

const moduleAnchor = '    WorkLocationsModule,\n';
if (!text.includes(moduleAnchor)) {
  throw new Error(
    'Expected WorkLocationsModule entry was not found. No changes were made.',
  );
}

if (!text.includes('    EmployeeWorkLocationsModule,\n')) {
  text = text.replace(
    moduleAnchor,
    `${moduleAnchor}    EmployeeWorkLocationsModule,\n`,
  );
}

fs.writeFileSync(path, text);
console.log('6A.3 AppModule registration complete.');
