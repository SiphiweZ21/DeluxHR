const fs = require("fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    f,
  );
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3000";
global.window = {};
global.localStorage = { getItem: () => "token" };
global.File = require("node:buffer").File;
const calls = [],
  files = [];
global.fetch = async (url, options) => {
  calls.push({ url, ...options });
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
global.document = {
  body: { appendChild() {} },
  createElement() {
    return {
      click() {
        files.push(this.download);
      },
      remove() {},
    };
  },
};
const root = require("node:path").resolve(__dirname, ".."),
  api = require(root + "/src/lib/customer-onboarding-api.ts");
(async () => {
  const dept = "00000000-0000-4000-8000-000000000001",
    pos = "00000000-0000-4000-8000-000000000002",
    lookups = {
      departments: [{ id: dept, name: "Operations" }],
      positions: [
        {
          id: pos,
          departmentId: dept,
          name: "Assistant",
          code: "OPS-1",
          isActive: true,
        },
      ],
    };
  const csv =
    "firstName,lastName,email,phoneNumber,departmentName,positionCode,employmentType,employmentStartDate,identityType,identityNumber\nTest,Person,TEST@example.test,123,Operations,OPS-1,PERMANENT,2026-09-01,OTHER,PILOT-01\n";
  const employees = api.parseEmployeeCsv(csv, lookups);
  assert.equal(employees[0].departmentId, dept);
  assert.equal(employees[0].positionId, pos);
  assert.equal(employees[0].email, "test@example.test");
  assert(!("departmentName" in employees[0]));
  assert(!("positionCode" in employees[0]));
  assert.throws(() =>
    api.parseEmployeeCsv(
      csv.replace("OPS-1,PERMANENT", "UNKNOWN,PERMANENT"),
      lookups,
    ),
  );
  assert.throws(() =>
    api.parseEmployeeCsv(csv, {
      ...lookups,
      positions: [{ ...lookups.positions[0], isActive: false }],
    }),
  );
  assert.throws(() =>
    api.parseEmployeeCsv(
      csv.replace("Operations,OPS-1", "Missing,OPS-1"),
      lookups,
    ),
  );
  assert.equal(
    api.parseEmployeeCsv(
      `firstName,lastName,email,phoneNumber,departmentId\nTest,Person,test@example.test,123,${dept}\n`,
    )[0].departmentId,
    dept,
  );
  await api.setupLookups();
  await api.setupPosition({
    departmentId: dept,
    name: "Assistant",
    code: "OPS-1",
  });
  await api.retirePosition(pos);
  await api.setupCreateEmployee({ ...employees[0] });
  await api.setupImport(employees);
  await api.setupDocuments("employee");
  await api.setupDocumentDecision("employee", "document", "verify");
  await api.setupDocumentDecision(
    "employee",
    "document",
    "reject",
    "Wrong document",
  );
  const f = new File(["%PDF-1.7\n"], "test.pdf", { type: "application/pdf" });
  await api.setupUploadDocument("employee", f, {
    documentType: "ID_DOCUMENT",
    issuedAt: "",
    expiresAt: "",
  });
  await api.setupDownloadDocument("employee", {
    id: "document",
    originalFileName: "test.pdf",
  });
  await api.setupCompanyDocuments();
  await api.setupUploadCompanyDocument(f, "REGISTRATION");
  await api.setupCompanyDocumentDecision(
    "company-doc",
    "VERIFIED",
    "Reviewed registration",
  );
  await api.setupDownloadCompanyDocument({
    id: "company-doc",
    originalFileName: "registration.pdf",
  });
  await api.setupEmployeeProfile("employee");
  assert.equal(calls.length, 15);
  assert(calls.every((c) => c.cache === "no-store"));
  assert(
    calls
      .filter((c) => !(c.headers instanceof Headers))
      .every((c) => c.headers.Authorization === "Bearer token"),
  );
  for (const i of [8, 11]) {
    assert(calls[i].headers instanceof Headers);
    assert.equal(calls[i].headers.get("Authorization"), "Bearer token");
    assert.equal(calls[i].headers.get("Content-Type"), null);
    assert.equal(calls[i].body.get("file").name, "test.pdf");
  }
  assert.equal(calls[8].body.get("expiresAt"), null);
  assert.equal(
    calls[0].url,
    "http://localhost:3000/customer-onboarding/lookups",
  );
  assert.equal(JSON.parse(calls[4].body).employees[0].positionId, pos);
  assert.deepEqual(JSON.parse(calls[6].body), {});
  assert.deepEqual(files, ["test.pdf", "registration.pdf"]);
  await assert.rejects(
    api.setupUploadDocument(
      "employee",
      new File(["text"], "bad.txt", { type: "text/plain" }),
      { documentType: "OTHER" },
    ),
  );
  await api.setupUploadCompanyDocument(f, "COIDA_ASSESSMENT", {
    referenceNumber: "CF123",
    assessmentAmount: "1234.56",
    assessmentPeriod: "2026",
    liabilityPeriod: "2026-09",
  });
  const assessmentCall = calls.at(-1);
  assert.equal(assessmentCall.body.get("assessmentAmount"), "1234.56");
  assert.equal(assessmentCall.body.get("liabilityPeriod"), "2026-09");
  await api.setupUploadCompanyDocument(f, "PSIRA_EMPLOYEE_REGISTRATION", {
    referenceNumber: "PS123",
    employeeId: dept,
    officerGrade: "C",
  });
  assert.equal(calls.at(-1).body.get("officerGrade"), "C");
  await require(root + "/src/lib/api.ts").getAttendanceEvents(2);
  assert.equal(
    calls.at(-1).url,
    "http://localhost:3000/attendance-events?page=2",
  );
  assert.equal(calls.at(-1).cache, "no-store");
  await api.setupCompanyProfile();
  assert.equal(
    calls.at(-1).url,
    "http://localhost:3000/customer-onboarding/profile",
  );
  assert.equal(calls.at(-1).cache, "no-store");
  console.log(
    "Passed 19 onboarding/attendance HTTP contracts plus named/legacy CSV resolution, retired/foreign position errors, exact rich import payloads and private multipart/download behavior.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
