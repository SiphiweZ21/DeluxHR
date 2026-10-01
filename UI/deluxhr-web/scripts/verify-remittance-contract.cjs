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
  api = require(root + "/src/lib/remittance-payments-api.ts");
(async () => {
  const auth = {
    password: "test",
    reason: "Checked official declaration evidence",
  };
  await api.getBeneficiaries();
  await api.createBeneficiary({
    name: "SARS",
    route: "SARS_EFILING",
    uifViaSars: true,
    registrationEvidence: "Registration checked",
    reason: auth.reason,
  });
  await api.inspectBeneficiary("profile", auth);
  await api.reviewBeneficiary("profile", { ...auth, decision: "APPROVED" });
  await api.retireBeneficiary("profile", auth);
  await api.getRemittanceWorkspace("2026-09");
  await api.getRemittanceBatch("batch");
  await api.prepareRemittance({
    period: "2026-09",
    beneficiaryId: "profile",
    paymentDate: "2026-09-30",
    officialReference: "1234567890123456789",
    declaredPaymentCents: 10000,
    declarationEvidence: "EMP201 declaration checked",
    reason: auth.reason,
  });
  await api.remittanceAction("batch", "approve", auth);
  await api.remittanceAction("batch", "cancel", auth);
  await api.inspectRemittance("batch", auth);
  await api.submitRemittance("batch", {
    ...auth,
    method: "SARS_EFILING",
    bankReference: "bank-123",
    evidence: "Credit push instruction authorized",
  });
  await api.recordRemittanceResult("batch", {
    ...auth,
    outcome: "MISMATCH",
    actualPaidCents: 5000,
    paidAt: "2026-09-29",
    bankReference: "bank-123",
    evidence: "Partial bank amount verified",
  });
  await api.downloadRemittance("batch");
  await api.downloadRemittance("batch", true);
  assert.equal(calls.length, 15);
  assert(
    calls.every(
      (c) =>
        c.cache === "no-store" && c.headers.Authorization === "Bearer token",
    ),
  );
  assert.equal(
    calls[5].url,
    "http://localhost:3000/remittance-payments/workspace?period=2026-09",
  );
  assert.deepEqual(JSON.parse(calls[8].body), auth);
  assert.deepEqual(JSON.parse(calls[9].body), auth);
  assert.equal(JSON.parse(calls[7].body).declaredPaymentCents, 10000);
  assert.equal(JSON.parse(calls[11].body).method, "SARS_EFILING");
  assert.equal(JSON.parse(calls[12].body).actualPaidCents, 5000);
  assert.deepEqual(files, [
    "DeluxHR-remittance-preparation-batch.csv",
    "DRAFT-NOT-FOR-BANK-UPLOAD-REMITTANCE-batch.txt",
  ]);
  const { routeAllowed, routeRoot } = require(
    root + "/src/lib/workspace-access.ts",
  );
  const scoped = {
    role: "PAYROLL_ADMIN",
    features: ["PAYROLL"],
    permissions: [{ permission: "VIEW_PAYROLL", scope: "ORGANIZATION" }],
  };
  assert(routeAllowed(scoped, "/remittance-payments"));
  assert(!routeAllowed({ ...scoped, features: [] }, "/remittance-payments"));
  assert(
    !routeAllowed(
      {
        ...scoped,
        permissions: [{ permission: "VIEW_PAYROLL", scope: "SELF" }],
      },
      "/remittance-payments",
    ),
  );
  assert(!routeAllowed(scoped, "/remittance-beneficiaries"));
  assert(
    routeAllowed(
      { ...scoped, role: "COMPANY_ADMIN", features: [] },
      "/remittance-beneficiaries",
    ),
  );
  assert.equal(
    routeRoot("/remittance-payments/batches/id"),
    "/remittance-payments",
  );
  assert.equal(
    routeRoot("/remittance-beneficiaries"),
    "/remittance-beneficiaries",
  );
  console.log(
    "Passed 15 remittance HTTP/download contracts, exact approval payloads, statutory amounts, auth/no-store, separate report/draft names and scoped routes.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
