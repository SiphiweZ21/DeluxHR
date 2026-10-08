"use client";
import { useEffect, useState } from "react";
import { workforceRequest } from "../lib/api";
type Grant = { permission: string; scope: string; denied?: boolean };
type User = {
  id: string;
  fullName: string;
  role: string;
  permissions: Grant[];
};
type Presets = {
  roles: Record<string, Grant[]>;
  departments: { name: string; role: string }[];
};
export function AccessPresets() {
  const [users, setUsers] = useState<User[]>([]),
    [presets, setPresets] = useState<Presets | null>(null),
    [id, setId] = useState(""),
    [grants, setGrants] = useState<Grant[]>([]),
    [effective, setEffective] = useState<Grant[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const control = "rounded-lg border p-2 w-full";
  useEffect(() => {
    void Promise.all([
      workforceRequest<User[]>("company-users"),
      workforceRequest<Presets>("company-users/access-presets"),
    ])
      .then(([u, p]) => {
        setUsers(u);
        setPresets(p);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function select(userId: string) {
    setId(userId);
    setMessage("");
    setError("");
    setGrants(users.find((u) => u.id === userId)?.permissions || []);
    try {
      setEffective(
        await workforceRequest<Grant[]>(
          `company-users/${userId}/effective-permissions`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load access");
    }
  }
  function suggest(role: string) {
    const suggested = presets?.roles[role] || [];
    const all = new Set([
      ...Object.values(presets?.roles || {})
        .flat()
        .map((g) => g.permission),
      ...grants.map((g) => g.permission),
    ]);
    setGrants(
      [...all].map(
        (permission) =>
          suggested.find((g) => g.permission === permission) || {
            permission,
            scope: "ORGANIZATION",
            denied: true,
          },
      ),
    );
  }
  const relevant = [
    "VIEW_EMPLOYEES",
    "ADD_EMPLOYEES",
    "MANAGE_EMPLOYEES",
    "APPROVE_EMPLOYEES",
    "VIEW_EXECUTIVE_DASHBOARD",
    "VIEW_WORKFORCE_COST",
    "VIEW_WORKFORCE_INSIGHTS",
    "VIEW_PAYROLL",
    "VIEW_ALL_PAYSLIPS",
  ];
  function value(permission: string) {
    const explicit = grants.find((g) => g.permission === permission);
    return explicit ? (explicit.denied ? "DENY" : "ALLOW") : "DEFAULT";
  }
  function change(permission: string, value: string) {
    setGrants((g) => [
      ...g.filter((x) => x.permission !== permission),
      ...(value === "DEFAULT"
        ? []
        : [{ permission, scope: "ORGANIZATION", denied: value === "DENY" }]),
    ]);
  }
  return (
    <section className="rounded-xl border bg-white p-6 space-y-4">
      <h2 className="text-xl font-semibold">
        Department suggestions & individual access
      </h2>
      <p className="text-sm">
        Job positions and departments do not grant access. Choose a user, review
        a department suggestion or role defaults, then save. Explicit
        restrictions override role grants. Department transfers leave access
        unchanged.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-700">
          {message}
        </p>
      )}
      <label className="block">
        User
        <select
          className={control}
          value={id}
          onChange={(e) => void select(e.target.value)}
        >
          <option value="">Choose user</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} · {u.role}
            </option>
          ))}
        </select>
      </label>
      {id && presets && (
        <>
          <div className="flex flex-wrap gap-3">
            {presets.departments.map((d) => (
              <button
                key={d.name}
                type="button"
                className="rounded-lg border p-2"
                onClick={() => suggest(d.role)}
              >
                Suggest {d.name} access
              </button>
            ))}
            <button
              type="button"
              className="rounded-lg border p-2"
              onClick={() => setGrants([])}
            >
              Use assigned role defaults
            </button>
          </div>
          <p className="text-sm">
            Suggestions replace this user's overrides when saved. Review every
            change below. Executive summaries and detailed payroll access are
            separate.
          </p>
          {relevant.map((permission) => (
            <label key={permission} className="grid gap-2 sm:grid-cols-2">
              {permission.replaceAll("_", " ")}
              <select
                className={control}
                value={value(permission)}
                onChange={(e) => change(permission, e.target.value)}
              >
                <option value="DEFAULT">Assigned role default</option>
                <option value="ALLOW">Allow in this company</option>
                <option value="DENY">Restrict</option>
              </select>
            </label>
          ))}
          <details>
            <summary>All proposed overrides ({grants.length})</summary>
            {grants.map((g) => (
              <p key={g.permission} className="text-xs py-1">
                {g.permission}: {g.denied ? "Restricted" : g.scope}
              </p>
            ))}
          </details>
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await workforceRequest(
                  `company-users/${id}/permissions`,
                  "PUT",
                  { permissions: grants },
                );
                setEffective(
                  await workforceRequest<Grant[]>(
                    `company-users/${id}/effective-permissions`,
                  ),
                );
                setUsers(await workforceRequest<User[]>("company-users"));
                setMessage("Access saved.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Access update failed",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save access
          </button>
          <details open>
            <summary>Effective saved access ({effective.length})</summary>
            <div className="text-xs mt-2">
              {effective.map((g) => (
                <p key={g.permission}>
                  {g.permission} · {g.scope}
                </p>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
