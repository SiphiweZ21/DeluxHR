"use client";
import { WhatsAppEmployeeSetup } from "../../components/whatsapp-employee-setup";
import { EmployeeChangeQueue } from '../../components/employee-change-queue';
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getDepartments,
  getEmployees,
  createEmployee,
  bulkCreateEmployees,
  workforceRequest,
  type Employee,
  type Department,
} from "../../lib/api";
import {
  getWorkspaceAccess,
  grant,
  type WorkspaceAccess,
} from "../../lib/workspace-access";
import {
  parseEmployeeCsv,
  type SetupPosition,
} from "../../lib/customer-onboarding-api";
const blank = {
  firstName: "",
  lastName: "",
  email: "",
  employeeCode: "",
  phoneNumber: "",
  departmentId: "",
  positionId: "",
  employmentType: "PERMANENT",
  employmentStartDate: "",
  identityType: "SOUTH_AFRICAN_ID",
  identityNumber: "",
};
const control =
  "block w-full mt-1 rounded-lg border border-slate-300 p-2 text-sm";
export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]),
    [departments, setDepartments] = useState<Department[]>([]),
    [positions, setPositions] = useState<SetupPosition[]>([]),
    [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [form, setForm] = useState(blank),
    [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL"),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [changesRevision, setChangesRevision] = useState(0);
  const [approvalResults, setApprovalResults] = useState<
    { id: string; approved: boolean; message?: string }[]
  >([]);
  const allowed = (p: string) => !!access && grant(access, p, true);
  async function load() {
    const [e, d, a, p] = await Promise.all([
      getEmployees(),
      getDepartments(),
      getWorkspaceAccess(),
      workforceRequest<SetupPosition[]>("departments/positions"),
    ]);
    setEmployees(e);
    setDepartments(d);
    setAccess(a);
    setPositions(p);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const visible = useMemo(
    () =>
      employees.filter(
        (e) =>
          (status === "ALL" || e.status === status) &&
          `${e.firstName} ${e.lastName} ${e.employeeCode || ""} ${e.email || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [employees, status, query],
  );
  function change(key: string, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "departmentId" ? { positionId: "" } : {}),
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        email: form.email.trim() || null,
        employeeCode: form.employeeCode.trim() || null,
      };
      const position = positions.find((p) => p.id === form.positionId);
      if (form.positionId && !position) throw new Error("Choose an active position.");
      const data = {
        ...payload,
        jobTitle: position?.name,
        positionId: form.positionId || (editing ? null : undefined),
        employmentStartDate: form.employmentStartDate || undefined,
        ...(!form.identityNumber ? { identityNumber: undefined } : {}),
      };
      const result = editing
        ? await workforceRequest<Employee & { pendingChangeId?: string; approvalMessage?: string }>(`employees/${editing}`, "PATCH", data)
        : await createEmployee({ ...data, positionId: form.positionId || undefined });
      setChangesRevision(value => value + 1);
      setForm({
        ...blank,
        departmentId: form.departmentId,
        positionId: form.positionId,
      });
      setEditing(null);
      await load();
      setMessage(
        editing
          ? ('pendingChangeId' in result && result.pendingChangeId
              ? "Changes awaiting approval. Existing details remain in use until another authorised HR or Executive Leadership user approves them in the queue below."
              : "Employee details updated.")
          : "Employee saved as pending. Add another employee or view pending approvals.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  function edit(e: Employee) {
    setFormOpen(true);
    setEditing(e.id);
    setForm({
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email || "",
      employeeCode: e.employeeCode || "",
      phoneNumber: e.phoneNumber || "",
      departmentId: e.departmentId,
      positionId: e.positionId || "",
      employmentType: e.employmentType || "PERMANENT",
      employmentStartDate: e.employmentStartDate?.slice(0, 10) || "",
      identityType: e.identityType || "SOUTH_AFRICAN_ID",
      identityNumber: "",
    });
    requestAnimationFrame(() => document.getElementById("employee-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function approve(ids: string[]) {
    if (
      !window.confirm(
        `Approve ${ids.length} employees after independent review?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await workforceRequest<{ results: typeof approvalResults }>(
        "employees/approve-batch",
        "POST",
        { employeeIds: ids },
      );
      setApprovalResults(r.results);
      setSelected(r.results.filter((x) => !x.approved).map((x) => x.id));
      await load();
      setMessage(
        `${r.results.filter((x) => x.approved).length} employees approved.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const csv =
      "firstName,lastName,employeeCode,email,phoneNumber,departmentName,positionCode,employmentType,employmentStartDate,identityType,identityNumber\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "deluxhr-employees.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function exportEmployees() {
    const cell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+@\-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const rows = [
      [
        "employeeCode",
        "employeeNumber",
        "firstName",
        "lastName",
        "email",
        "phoneNumber",
        "department",
        "jobTitle",
        "status",
      ],
      ...visible.map((e) => [
        e.employeeCode,
        e.employeeNumber,
        e.firstName,
        e.lastName,
        e.email,
        e.phoneNumber,
        e.department?.name,
        e.jobTitle,
        e.status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(cell).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "deluxhr-employee-directory.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("CSV must be at most 5 MB.");
      const rows = parseEmployeeCsv(await file.text(), {
        departments,
        positions,
      });
      if (!window.confirm(`Import ${rows.length} pending employees?`)) return;
      const result = await bulkCreateEmployees(rows);
      if (result.failed)
        throw new Error(
          result.errors.map((e) => `Row ${e.row}: ${e.message}`).join("; "),
        );
      await load();
      setMessage(`${result.imported} employees saved pending approval.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">HR &amp; Employee Details</h1>

      <p>
        View employee details and review pending approvals. Add employees when needed.
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-700">
          {message}{" "}
          <button
            className="underline ml-2"
            onClick={() => setStatus("PENDING_VERIFICATION")}
          >
            View pending employees
          </button>
        </p>
      )}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold">
          Employee directory & approvals
        </h2>
        {allowed("ADD_EMPLOYEES") && <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => { setEditing(null); setForm(blank); setFormOpen(true); requestAnimationFrame(() => document.getElementById("employee-form")?.scrollIntoView({behavior: "smooth", block: "start"})); }}>Add employee</button>}
        <button className="underline mt-2" onClick={exportEmployees}>
          Export current employee list
        </button>
        <div className="flex flex-wrap gap-3 my-4">
          <input
            aria-label="Search employees"
            className="rounded-lg border p-2"
            placeholder="Search name, code or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Approval status"
            className="rounded-lg border p-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {[
              "ALL",
              "PENDING_VERIFICATION",
              "ACTIVE",
              "SUSPENDED",
              "TERMINATED",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {allowed("APPROVE_EMPLOYEES") && (
            <button
              disabled={busy || !selected.length}
              className="rounded-lg bg-indigo-600 p-2 text-white disabled:opacity-50"
              onClick={() => void approve(selected)}
            >
              Approve selected ({selected.length})
            </button>
          )}
        </div>
        <p className="text-sm mb-3">
          Select pending employees for approval. Active employees do not need approval. Review profiles and documents first. Creators cannot approve
          their own employees.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  ...(allowed("APPROVE_EMPLOYEES") ? ["Approval selection"] : []),
                  "Employee",
                  "Employee code",
                  "Department / position",
                  "Contact",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-t">
                  {allowed("APPROVE_EMPLOYEES") && <td className="p-3">
                    {e.status === "PENDING_VERIFICATION" &&
                      allowed("APPROVE_EMPLOYEES") && (
                        <input
                          aria-label={`Select ${e.firstName} ${e.lastName}`}
                          type="checkbox"
                          disabled={
                            busy ||
                            (!selected.includes(e.id) && selected.length >= 100)
                          }
                          checked={selected.includes(e.id)}
                          onChange={(event) =>
                            setSelected((ids) =>
                              event.target.checked
                                ? [...ids, e.id]
                                : ids.filter((id) => id !== e.id),
                            )
                          }
                        />
                      )}
                    {e.status !== "PENDING_VERIFICATION" && <span className="text-xs text-slate-500">Not pending</span>}
                  </td>}
                  <td className="p-3">
                    {e.firstName} {e.lastName}
                    <p className="text-xs text-slate-500">{e.employeeNumber}</p>
                  </td>
                  <td className="p-3">{e.employeeCode || "—"}</td>
                  <td className="p-3">
                    {e.department?.name}
                    <p>{e.jobTitle}</p>
                  </td>
                  <td className="p-3">
                    {e.email || "No email"}
                    <p>{e.phoneNumber}</p>
                  </td>
                  <td className="p-3">{e.status}</td>
                  <td className="p-3 space-x-3">
                    {allowed("MANAGE_EMPLOYEES") &&
                      e.status !== "TERMINATED" && (
                        <button onClick={() => edit(e)} className="underline">
                          Edit
                        </button>
                      )}
                    {e.status === "PENDING_VERIFICATION" &&
                      allowed("APPROVE_EMPLOYEES") && (
                        <button
                          disabled={busy}
                          onClick={() => void approve([e.id])}
                          className="underline"
                        >
                          Approve
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm">{visible.length} employees shown</p>
        {approvalResults.map((result) => (
          <p
            key={result.id}
            className={result.approved ? "text-green-700" : "text-red-700"}
          >
            {employees.find((e) => e.id === result.id)?.firstName || result.id}:{" "}
            {result.approved ? "Approved" : result.message}
          </p>
        ))}
      </section>
      <EmployeeChangeQueue revision={changesRevision} onReviewed={load}/>
      {allowed("MANAGE_USERS") && access?.features.includes("WHATSAPP") && <WhatsAppEmployeeSetup />}
      {formOpen && (editing ? allowed("MANAGE_EMPLOYEES") : allowed("ADD_EMPLOYEES")) && (
      <section id="employee-form" className="scroll-mt-28 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">
            {editing ? "Edit employee profile" : "Add employee"}
          </h2>
          <button type="button" className="mt-2 text-sm text-slate-600 underline" onClick={() => {setFormOpen(false); setEditing(null); setForm(blank);}}>Close form</button>
          <form onSubmit={save} className="grid gap-4 mt-4 md:grid-cols-3">
            {(
              [
                ["firstName", "First name *"],
                ["lastName", "Last name *"],
                ["employeeCode", "EmployeeCode (optional)"],
                ["email", "Email (optional)"],
                ["phoneNumber", "Phone *"],
                ["employmentStartDate", "Employment start (complete before approval)"],
                [
                  "identityNumber",
                  editing
                    ? "Identity number (blank keeps current)"
                    : "Identity number (complete before approval)",
                ],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className={control}
                  type={
                    key === "email"
                      ? "email"
                      : key === "employmentStartDate"
                        ? "date"
                        : "text"
                  }
                  required={
                    ["firstName", "lastName", "phoneNumber"].includes(key)
                  }
                  value={form[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
            <label>
              Department *
              <select
                required
                className={control}
                value={form.departmentId}
                onChange={(e) => change("departmentId", e.target.value)}
              >
                <option value="">Choose department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Position (complete before approval)
              <select
                className={control}
                value={form.positionId}
                onChange={(e) => change("positionId", e.target.value)}
              >
                <option value="">Choose position</option>
                {positions
                  .filter(
                    (p) => p.departmentId === form.departmentId && p.isActive,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.code}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Employment type *
              <select
                className={control}
                value={form.employmentType}
                onChange={(e) => change("employmentType", e.target.value)}
              >
                {[
                  "PERMANENT",
                  "FIXED_TERM",
                  "TEMPORARY",
                  "PART_TIME",
                  "CONTRACTOR",
                  "INTERN",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Identity type *
              <select
                className={control}
                value={form.identityType}
                onChange={(e) => change("identityType", e.target.value)}
              >
                {["SOUTH_AFRICAN_ID", "PASSPORT", "OTHER"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="md:col-span-3 flex gap-3">
              <button
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {editing ? "Save changes" : "Save & add another employee"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(blank);
                    setFormOpen(false);
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          {allowed("ADD_EMPLOYEES") && (
            <div className="flex gap-4 mt-5">
              <button onClick={download} className="underline">
                Download import template
              </button>
              <label className="underline cursor-pointer">
                Import employee CSV
                <input
                  disabled={busy}
                  className="hidden"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </section>
      )}
  
    </div>
  );
}
