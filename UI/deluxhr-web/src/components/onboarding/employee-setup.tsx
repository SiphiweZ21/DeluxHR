"use client";
import { useEffect, useState } from "react";
import {
  Card,
  Field,
  Notice,
  button,
  control,
  secondary,
  useAction,
} from "../leave/ui";
import * as api from "../../lib/customer-onboarding-api";
import {
  SetupForm,
  KnownId,
  useSetup,
  string,
  values,
  refreshed,
  employeeOptions,
} from "./common";
function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob(
      [
        "firstName,lastName,employeeCode,email,phoneNumber,departmentName,positionCode,employmentType,employmentStartDate,employmentEndDate,identityType,identityNumber,whatsappNumber\n",
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "deluxhr-onboarding-employees.csv";
  a.click();
  URL.revokeObjectURL(url);
}
export function EmployeeSetup() {
  const setup = useSetup(),
    action = useAction();
  const [rows, setRows] = useState<api.ImportEmployee[]>([]),
    [fileName, setFileName] = useState(""),
    [result, setResult] = useState<api.ImportResult | null>(null);
  return (
    <>
      <Notice error={action.error} message={action.message} />
      <a href="#pending-employee-approvals" className="text-indigo-600 underline">View pending employees</a>
      <Card title="1. Add employees">
        <p className="text-sm">
          Build your employee list below, or import a CSV. Fields marked * are required.
        </p>
        <button
          className={secondary + " mt-3"}
          disabled={setup.lookupLoading || action.busy}
          onClick={() =>
            void action.run(async () => {
              await setup.reloadChoices?.();
            }, "Lists refreshed.")
          }
        >
          {setup.lookupLoading
            ? "Loading departments & positions…"
            : "Refresh departments & positions"}
        </button>
        {setup.lookupError && (
          <p className="text-sm text-red-700 mt-2">
            Saved lists could not load. Refresh them before adding employees.
          </p>
        )}
      </Card>
      {setup.lookupLoading || setup.lookupError ? (
        <Card title="Employee form">
          <p>
            {setup.lookupLoading
              ? "Loading saved company choices…"
              : "Refresh the saved lists above to continue."}
          </p>
        </Card>
      ) : !setup.choices.departments.length ? (
        <Card title="Create a department first">
          <p className="text-sm">
            Open Departments, locations & shifts and create a department, for
            example Operations. Then create its positions, for example Security
            Officer.
          </p>
        </Card>
      ) : (
        <SetupForm
          title="Add employees"
          description="Create your employee list now. Each record stays pending until another authorised user approves it; you can keep adding employees."
          childrenFirst
          submitLabel="Save & add another employee"
          fields={[
            {
              name: "firstName",
              label: "First name",
              required: true,
              placeholder: "Example: Thabo",
            },
            {
              name: "lastName",
              label: "Last name",
              required: true,
              placeholder: "Example: Dlamini",
            },
            {
              name: "email",
              label: "Email (optional)",
              type: "email",
              placeholder: "Example: thabo@example.com",
            },
            {
              name: "employeeCode",
              label: "EmployeeCode (optional)",
              placeholder: "Example: SEC-001",
            },
            {
              name: "phoneNumber",
              label: "Phone",
              required: true,
              placeholder: "Example: +27821234567",
            },
            {
              name: "employmentType",
              label: "Employment type",
              type: "select",
              required: true,
              options: [
                "PERMANENT",
                "FIXED_TERM",
                "TEMPORARY",
                "PART_TIME",
                "CONTRACTOR",
                "INTERN",
              ],
            },
            {
              name: "employmentStartDate",
              label: "Employment start",
              type: "date",
              required: true,
            },
            {
              name: "identityType",
              label: "Identity type",
              type: "select",
              required: true,
              options: ["SOUTH_AFRICAN_ID", "PASSPORT", "OTHER"],
            },
            {
              name: "identityNumber",
              label: "Identity number",
              required: true,
            },
          ]}
          save={async (d) => {
            const payload = values(d);
            const position = setup.choices.positions.find(
              (p) =>
                p.id === payload.positionId &&
                p.isActive &&
                p.departmentId === payload.departmentId,
            );
            if (!position)
              throw new Error(
                "Choose an active position in the selected department.",
              );
            const employee = await api.setupCreateEmployee(payload);
            setup.remember("employees", [employee]);
            await refreshed(setup.refresh);
          }}
        >
          <EmployeePositionSelection required />
        </SetupForm>
      )}
      <details className="rounded border p-4 mb-5">
        <summary className="cursor-pointer font-semibold">
          Import many employees (CSV)
        </summary>
        <Card title="Employee bulk import">
          <p className="text-sm mb-4">
            Download the template and use saved department names and position
            codes. Maximum 1,000 rows / 5 MB. Review the preview before
            importing.
          </p>
          <button className={secondary} onClick={downloadTemplate}>
            Download CSV template
          </button>
          <Field label="Employee CSV *">
            <input
              className={control}
              type="file"
              accept=".csv,text/csv"
              disabled={
                action.busy || setup.lookupLoading || !!setup.lookupError
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                setRows([]);
                setResult(null);
                setFileName("");
                if (f)
                  void action.run(async () => {
                    if (f.size > 5 * 1024 * 1024)
                      throw new Error("CSV must be at most 5 MB.");
                    const parsed = api.parseEmployeeCsv(
                      await f.text(),
                      setup.choices,
                    );
                    setRows(parsed);
                    setFileName(f.name);
                  });
                e.target.value = "";
              }}
            />
          </Field>
          {rows.length > 0 && (
            <>
              <p className="my-3">
                {fileName} · {rows.length} rows ready to submit
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Name</th>
                      <th className="text-left">Email</th>
                      <th className="text-left">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.firstName} {r.lastName}
                        </td>
                        <td>{r.email}</td>
                        <td className="break-all">
                          {setup.choices.departments.find(
                            (d) => d.id === r.departmentId,
                          )?.name ?? "Unknown department"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && (
                <p className="text-sm">Showing the first 20 rows.</p>
              )}
              <button
                className={button + " mt-4"}
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    if (
                      !window.confirm(
                        `Import ${rows.length} pending employees?`,
                      )
                    )
                      return false;
                    const imported = await api.setupImport(rows);
                    setResult(imported);
                    if (imported.failed || imported.errors.length)
                      throw new Error(
                        "Import rejected. Correct the rows listed below and upload again.",
                      );
                    setup.remember("employees", imported.employees);
                    setRows([]);
                    setFileName("");
                    await refreshed(setup.refresh);
                  }, "Employees imported. Complete profiles and arrange authorised verification.")
                }
              >
                Import employees
              </button>{" "}
              <button
                className={secondary}
                disabled={action.busy}
                onClick={() => {
                  setRows([]);
                  setFileName("");
                }}
              >
                Cancel
              </button>
            </>
          )}
          {result && (
            <div className="mt-4 space-y-2">
              <p>
                Imported: {result.imported} · Failed: {result.failed}
              </p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-red-700">
                  Row {e.row} · {e.email}: {e.message}
                </p>
              ))}
              {result.employees.map((e) => (
                <p key={e.id} className="break-all">
                  {e.firstName} {e.lastName} · {e.status}
                </p>
              ))}
            </div>
          )}
        </Card>
      </details>
      {setup.choices.employees.length > 0 && (
        <>
          <Card title="2. Review & complete profiles">
            <p className="text-sm">
              Review a saved employee. Use Edit profile only if details need
              completing or correcting.
            </p>
          </Card>
          <EmployeeReview />
          <details className="border rounded p-4 mb-5">
            <summary className="cursor-pointer font-semibold">
              Edit or complete an employee profile
            </summary>
            <SetupForm
              title="Complete employee profile"
              description="Choose the employee first. Blank optional fields keep their saved values."
              childrenFirst
              submitLabel="Save employee profile"
              fields={[
                { name: "firstName", label: "First name (optional)" },
                { name: "lastName", label: "Last name (optional)" },
                { name: "email", label: "Email (optional)", type: "email" },
                { name: "employeeCode", label: "EmployeeCode (optional)" },
                {
                  name: "phoneNumber",
                  label: "Phone (optional: keep current)",
                },
                {
                  name: "clearEmployeeCode",
                  label: "Clear saved EmployeeCode",
                  type: "checkbox",
                },
                {
                  name: "clearEmail",
                  label: "Clear saved email",
                  type: "checkbox",
                },
                {
                  name: "jobTitle",
                  label: "Job title (optional for older records)",
                  placeholder: "Example: Security Officer",
                },
                {
                  name: "employmentType",
                  label: "Employment type",
                  type: "select",
                  required: true,
                  options: [
                    "PERMANENT",
                    "FIXED_TERM",
                    "TEMPORARY",
                    "PART_TIME",
                    "CONTRACTOR",
                    "INTERN",
                  ],
                },
                {
                  name: "employmentStartDate",
                  label: "Employment start",
                  type: "date",
                  required: true,
                },
                {
                  name: "employmentEndDate",
                  label: "Employment end (optional)",
                  type: "date",
                },
                {
                  name: "identityType",
                  label: "Identity type",
                  type: "select",
                  required: true,
                  options: ["SOUTH_AFRICAN_ID", "PASSPORT", "OTHER"],
                },
                {
                  name: "identityNumber",
                  label: "Identity number",
                  required: true,
                },
              ]}
              save={async (d) => {
                const p = values(d),
                  id = p.employeeId;
                delete p.employeeId;
                if (d.get("clearEmployeeCode") === "on") p.employeeCode = "";
                if (d.get("clearEmail") === "on") p.email = "";
                delete p.clearEmployeeCode;
                delete p.clearEmail;
                if (
                  p.employmentEndDate &&
                  p.employmentEndDate < p.employmentStartDate
                )
                  throw new Error("Employment end cannot precede start.");
                const employee = await api.setupEmployee(id, p);
                setup.remember("employees", [employee]);
                await refreshed(setup.refresh);
              }}
            >
              <KnownId
                name="employeeId"
                label="Employee"
                items={employeeOptions(setup.choices.employees)}
              />
              <EmployeePositionSelection />
            </SetupForm>
          </details>
          <Card title="3. Independent verification">
            <p className="text-sm">
              Sign in as the second company administrator to review and activate
              pending employees. The creator can approve their own records if authorised.
            </p>
          </Card>
          <SetupForm
            title="Activate eligible employee"
            description="Review identity and employment documents before activation."
            submitLabel="Verify & activate employee"
            fields={[]}
            confirm="Activate this employee after authorised verification?"
            save={async (d) => {
              const e = await api.setupActivateEmployee(
                string(d, "employeeId"),
              );
              setup.remember("employees", [e]);
              await refreshed(setup.refresh);
            }}
          >
            <KnownId
              name="employeeId"
              label="Employee"
              items={employeeOptions(
                setup.choices.employees.filter(
                  (e) => e.status === "PENDING_VERIFICATION",
                ),
              )}
            />
          </SetupForm>
        </>
      )}
      {setup.choices.employees.length > 0 && (
        <>
          {" "}
          <PendingEmployeeQueue />
          <Card title="Saved company employees">
            <div className="space-y-3">
              {setup.choices.employees.map((e) => (
                <div key={e.id}>
                  <strong>
                    {e.firstName} {e.lastName}
                  </strong>
                  <p className="text-sm break-all">
                    {e.employeeCode || "No code"} · {e.email || "No email"} ·{" "}
                    {e.status}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export function EmployeePositionSelection({
  required = false,
}: {
  required?: boolean;
}) {
  const { choices } = useSetup(),
    [department, setDepartment] = useState("");
  const positions = choices.positions.filter(
    (p) => p.isActive && p.departmentId === department,
  );
  return (
    <>
      <Field
        label={
          required ? "Department *" : "Department (optional: keep current)"
        }
      >
        <select
          required={required}
          className={control}
          name="departmentId"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">Choose department</option>
          {choices.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={
          required
            ? "Position / job role *"
            : "Position / job role (optional: keep current)"
        }
      >
        <select
          key={department}
          name="positionId"
          disabled={!department || !positions.length}
          required={required}
          defaultValue=""
          className={control}
        >
          <option value="">
            {required
              ? department
                ? "Choose active position"
                : "Choose department first"
              : "Keep current position / use legacy job title"}
          </option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.code}
            </option>
          ))}
        </select>
      </Field>
      {department && !positions.length && (
        <p className="md:col-span-2 text-sm text-amber-700">
          No active positions in this department. Create a position in
          Departments, locations & shifts, then refresh the lists.
        </p>
      )}
    </>
  );
}

function EmployeeReview() {
  const { choices } = useSetup(),
    [id, setId] = useState(""),
    [profile, setProfile] = useState<
      | (api.SetupEmployee & {
          phoneNumber: string;
          employmentEndDate: string | null;
        })
      | null
    >(null),
    action = useAction();
  useEffect(() => {
    let live = true;
    setProfile(null);
    if (id)
      void action.run(async () => {
        const p = await api.setupEmployeeProfile(id);
        if (live) setProfile(p);
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Card title="Review saved employee profile">
      <Notice error={action.error} message={action.message} />
      <Field label="Employee">
        <select
          disabled={action.busy}
          value={id}
          onChange={(e) => setId(e.target.value)}
          className={control}
        >
          <option value="">Choose employee to review</option>
          {employeeOptions(choices.employees).map((e) => (
            <option value={e.id} key={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      {profile && (
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <p>
            {profile.firstName} {profile.lastName} · {profile.status}
          </p>
          <p>
            {profile.email} · {profile.phoneNumber}
          </p>
          <p>
            Department:{" "}
            {
              choices.departments.find((d) => d.id === profile.departmentId)
                ?.name
            }
          </p>
          <p>EmployeeCode: {profile.employeeCode || "Not assigned"}</p>
          <p>Position: {profile.jobTitle}</p>
          <p>
            {profile.employmentType} · starts{" "}
            {profile.employmentStartDate?.slice(0, 10)}
            {profile.employmentEndDate
              ? " · ends " + profile.employmentEndDate.slice(0, 10)
              : ""}
          </p>
          <p>
            Identity: {profile.identityType} · {profile.identityNumber}
          </p>
          <p className="sm:col-span-2 text-slate-500">
            Identity numbers are masked. Review the uploaded identity and
            employment evidence in Company & employee documents before
            activating the record.
          </p>
        </div>
      )}
    </Card>
  );
}

function PendingEmployeeQueue() {
  const setup = useSetup(),
    action = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const pending = setup.choices.employees.filter(
    (e) =>
      e.status === "PENDING_VERIFICATION" &&
      `${e.firstName} ${e.lastName} ${e.employeeCode || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div id="pending-employee-approvals"><Card title="Pending approval list">
      <Notice error={action.error} message={action.message} />
      <p className="text-sm mb-3">
        Keep adding employees above. Return here when an authorised
        approver is ready. Review profiles and documents before selecting a
        batch (maximum 100).
      </p>
      <input
        aria-label="Search pending employees"
        className={control}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or EmployeeCode"
      />
      {pending.map((e) => (
        <label key={e.id} className="flex gap-3 py-3 border-b">
          <input
            type="checkbox"
            checked={selected.includes(e.id)}
            disabled={
              action.busy ||
              (!selected.includes(e.id) && selected.length >= 100)
            }
            onChange={(event) =>
              setSelected((ids) =>
                event.target.checked
                  ? [...ids, e.id]
                  : ids.filter((id) => id !== e.id),
              )
            }
          />
          <span>
            {e.firstName} {e.lastName} · {e.employeeCode || "No code"} · Pending
            approval
          </span>
        </label>
      ))}
      {!pending.length && (
        <p className="py-3">No pending employees match this view.</p>
      )}
      <button
        className={button + " mt-4"}
        disabled={action.busy || !selected.length}
        onClick={() =>
          void action.run(async () => {
            if (
              !window.confirm(
                `Approve ${selected.length} employees after authorised review?`,
              )
            )
              return false;
            const response = await api.setupApproveBatch(selected);
            await setup.reloadChoices?.();
            await setup.refresh();
            setSelected(
              response.results.filter((r) => !r.approved).map((r) => r.id),
            );
            const failed = response.results.filter((r) => !r.approved);
            if (failed.length)
              throw new Error(
                response.results.filter((r) => r.approved).length +
                  " approved. " +
                  failed.map((r) => `${r.id}: ${r.message}`).join("; "),
              );
          }, "Selected employees approved.")
        }
      >
        Approve selected ({selected.length})
      </button>
    </Card></div>
  );
}
