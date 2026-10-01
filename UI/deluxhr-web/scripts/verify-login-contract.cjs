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
global.window = { location: { href: "/login" } };
global.localStorage = { getItem: () => null };
const api = require("../src/lib/api.ts");
(async () => {
  const call = (status, data) => {
    global.fetch = async () =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    return api.loginUser({ email: "test@example.test", password: "wrong" });
  };
  await assert.rejects(
    call(401, { remainingAttempts: 4 }),
    (e) =>
      e instanceof api.LoginError &&
      e.remainingAttempts === 4 &&
      e.message.includes("Email or password"),
  );
  assert.equal(window.location.href, "/login");
  await assert.rejects(
    call(429, { retryAfterSeconds: 900, remainingAttempts: 0 }),
    (e) => e.retryAfterSeconds === 900,
  );
  await assert.rejects(
    call(500, { message: "secret DB stack" }),
    (e) => !e.message.includes("secret") && e.message.includes("shortly"),
  );
  await assert.rejects(
    call(403, { message: "Account is inactive" }),
    (e) => e.message === "Account is inactive",
  );
  global.fetch = async () => {
    throw new Error("network");
  };
  await assert.rejects(
    api.loginUser({ email: "test@example.test", password: "wrong" }),
    (e) => e.message.includes("connect"),
  );
  const result = await call(200, {
    accessToken: "token",
    user: { role: "SUPER_ADMIN" },
  });
  assert.equal(result.accessToken, "token");
  console.log(
    "Passed 6 login contracts: persistent credential error, retry metadata, safe server error, account status, network error and success.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
