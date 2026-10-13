const fs = require("fs"),
  assert = require("node:assert/strict"),
  Module = require("module"),
  ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, f) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(f, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      f,
    );
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3000";
let path = "/attendance",
  slots = [],
  cursor = 0,
  effects = [],
  calls = 0,
  focus = new Map();
const user = { id: "admin", role: "COMPANY_ADMIN", organizationId: "company" },
  access = {
    ...user,
    features: ["ATTENDANCE", "CORE_HR"],
    services: [{ feature: "ATTENDANCE", included: true }],
    permissions: [{ permission: "VIEW_ATTENDANCE", scope: "ORGANIZATION" }],
  };
const hooks = {
  ...React,
  useState(initial) {
    const n = cursor++;
    if (!slots[n])
      slots[n] = { value: typeof initial === "function" ? initial() : initial };
    return [
      slots[n].value,
      (v) => (slots[n].value = typeof v === "function" ? v(slots[n].value) : v),
    ];
  },
  useRef(initial) {
    const n = cursor++;
    if (!slots[n]) slots[n] = { ref: { current: initial } };
    return slots[n].ref;
  },
  useEffect(fn, deps) {
    const n = cursor++;
    if (!slots[n] || deps.some((v, i) => !Object.is(v, slots[n].deps[i]))) {
      slots[n]?.cleanup?.();
      slots[n] = { deps };
      effects.push(() => (slots[n].cleanup = fn()));
    }
  },
};
global.window = {
  addEventListener: (n, f) => focus.set(n, f),
  removeEventListener: (n) => focus.delete(n),
};
const router = {
  replace() {
    throw Error("Unexpected redirect");
  },
  push() {
    throw Error("Unexpected redirect");
  },
};
function AppShell() {
  return null;
}
function PlatformShell() {
  return null;
}
const original = Module._load;
Module._load = function (request) {
  if (request === "react") return hooks;
  if (request === "next/navigation")
    return { usePathname: () => path, useRouter: () => router };
  if (request === "next/link")
    return {
      __esModule: true,
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    };
  if (request === "./app-shell") return { AppShell };
  if (request === "../platform-admin/platform-shell") return { PlatformShell };
  if (request === "./workspace-access")
    return {
      useWorkspaceAccess: () => ({ access }),
      WorkspaceAccessProvider: ({ children }) => children,
    };
  if (request === "../../lib/auth")
    return {
      getUser: () => user,
      getToken: () => "test-session",
      homeForRole: () => "/dashboard",
      logout() {},
    };
  if (request === "../../lib/customer-onboarding-api")
    return {
      setupIdentity: async () => {
        calls++;
        return {
          role: user.role,
          organization: { id: "company", status: "ACTIVE" },
        };
      },
    };
  return original.apply(this, arguments);
};
function render(Component) {
  cursor = 0;
  effects = [];
  const result = Component({ children: "page" });
  for (const e of effects) e();
  return result;
}
(async () => {
  const { RootShell } = require("../src/components/layout/root-shell.tsx");
  render(RootShell);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(render(RootShell).type, AppShell);
  assert.equal(calls, 1);
  for (const next of ["/attendance-sites", "/shifts", "/attendance"]) {
    path = next;
    assert.equal(render(RootShell).type, AppShell);
    assert.equal(calls, 1, "navigation must retain identity check and shell");
  }
  focus.get("focus")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(render(RootShell).type, AppShell);
  assert.equal(calls, 2, "focus must verify access in background");
  slots = [];
  path = "/attendance-sites";
  const {
    GroupedNavigation,
  } = require("../src/components/layout/grouped-navigation.tsx");
  const menu = renderToStaticMarkup(render(GroupedNavigation));
  assert(menu.includes('aria-current="page"'));
  assert(menu.includes('href="/attendance-sites"'));
  assert(menu.includes('aria-expanded="true"'));
  const { siteDateInstant } = require("../src/lib/site-assignments-api.ts");
  assert.equal(
    siteDateInstant("2026-10-13", "Africa/Johannesburg"),
    "2026-10-12T22:00:00.000Z",
  );
  assert.equal(
    siteDateInstant("2026-07-13", "Europe/London"),
    "2026-07-12T23:00:00.000Z",
  );
  assert.equal(
    siteDateInstant("2026-12-13", "Europe/London"),
    "2026-12-13T00:00:00.000Z",
  );
  console.log(
    "Passed navigation lifecycle, background access check, active menu expansion/highlight and site timezone/DST checks.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => (Module._load = original));
