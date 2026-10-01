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
  KnownId,
  SetupForm,
  string,
  numeric,
  values,
  useSetup,
  refreshed,
  type InputSpec,
} from "./common";
export const profileFields: InputSpec[] = [
  { required: true, name: "name", label: "Company name", maxLength: 200 },
  { required: true, name: "legalName", label: "Legal name", maxLength: 200 },
  {
    required: true,
    name: "registrationNumber",
    label: "Registration number",
    maxLength: 100,
  },
  {
    name: "taxNumber",
    label: "Tax number",
    maxLength: 100,
  },
  {
    required: true,
    name: "email",
    label: "Contact email",
    type: "email",
    maxLength: 200,
  },
  {
    required: true,
    name: "phoneNumber",
    label: "Contact phone",
    maxLength: 50,
  },
  { name: "website", label: "Website", type: "url", maxLength: 500 },
  {
    required: true,
    name: "addressLine1",
    label: "Street address",
    maxLength: 200,
  },
  { name: "addressLine2", label: "Address line 2", maxLength: 200 },
  { required: true, name: "city", label: "City", maxLength: 100 },
  { required: true, name: "province", label: "Province", maxLength: 100 },
  { required: true, name: "postalCode", label: "Postal code", maxLength: 30 },
  { required: true, name: "country", label: "Country", maxLength: 100 },
  { required: true, name: "timezone", label: "Timezone", maxLength: 100 },
  {
    name: "brandPrimaryColor",
    label: "Brand colour (#RRGGBB)",
    pattern: "#[0-9A-Fa-f]{6}",
    maxLength: 7,
  },
];
export function CompanySetup() {
  const setup = useSetup(),
    action = useAction();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    void action.run(async () => {
      setProfile(await api.setupCompanyProfile());
    });
  }, [setup.pending]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <>
      <Notice error={action.error} message={action.message} />
      {!profile ? (
        <Card title="Company profile & registration">
          <p>Loading saved company profile…</p>
          <button
            className={secondary}
            disabled={action.busy}
            onClick={() =>
              void action.run(async () =>
                setProfile(await api.setupCompanyProfile()),
              )
            }
          >
            Retry profile loading
          </button>
        </Card>
      ) : (
        <SetupForm
          key={profile ? "loaded" : "new"}
          title="Company profile & registration"
          description="Fields marked * are required before saving this profile. Tax number is required when payroll is included in your company setup. Optional blank fields are left unchanged. A company logo is also required for activation."
          fields={profileFields.map((f) => ({
            ...f,
            required:
              f.required ||
              (f.name === "taxNumber" && profile.payrollRequired === true),
            label: `${f.label}${f.required || (f.name === "taxNumber" && profile.payrollRequired === true) ? " *" : " (optional)"}`,
            value: (profile[f.name] ??
              (f.name === "country"
                ? "South Africa"
                : f.name === "timezone"
                  ? "Africa/Johannesburg"
                  : "")) as string,
          }))}
          reset={false}
          save={async (d) => {
            const p = values(d);
            const missing = profileFields
              .filter(
                (f) =>
                  f.required ||
                  (f.name === "taxNumber" && profile.payrollRequired === true),
              )
              .filter((f) => !p[f.name]?.trim());
            if (missing.length)
              throw new Error(
                `Complete required fields: ${missing.map((f) => f.label).join(", ")}.`,
              );
            setProfile({ ...profile, ...(await api.setupProfile(p)) });
            await refreshed(setup.refresh);
          }}
        />
      )}
      <Card title="Company logo (required for activation)">
        <Notice error={action.error} message={action.message} />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              file = new FormData(form).get("file");
            void action.run(async () => {
              if (!(file instanceof File)) throw new Error("Choose a logo.");
              await api.setupUploadLogo(file);
              form.reset();
              await refreshed(setup.refresh);
            }, "Logo uploaded.");
          }}
        >
          <Field label="PNG or JPEG, up to 2 MB">
            <input
              className={control}
              name="file"
              type="file"
              accept="image/png,image/jpeg"
              required
            />
          </Field>
          <button className={button} disabled={action.busy}>
            Upload logo
          </button>
        </form>
        <button
          className={secondary + " mt-4"}
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              setUrl(URL.createObjectURL(await api.setupLogoBlob()));
            })
          }
        >
          View saved logo
        </button>
        {url && (
          <img
            src={url}
            alt="Company logo"
            className="mt-4 max-h-40 max-w-full object-contain"
          />
        )}
      </Card>
      <SetupForm
        title="Create company administrator"
        description="Add an independent checker for pending setup. Two different active company administrators in this company can complete onboarding verification; self-approval remains blocked."
        fields={[
          { name: "fullName", label: "Full name", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          {
            name: "password",
            label: "Initial password",
            type: "password",
            required: true,
            minLength: 12,
          },
        ]}
        save={async (d) => {
          const u = await api.setupAdministrator({
            fullName: string(d, "fullName"),
            email: string(d, "email"),
            password: String(d.get("password") ?? ""),
          });
          action.setMessage(`Administrator created: ${u.email} · ${u.id}`);
          await refreshed(setup.refresh);
        }}
      />
    </>
  );
}
export function StructureSetup() {
  const setup = useSetup();
  const review = useAction();
  const [created, setCreated] = useState<api.SetupOption[]>([]);
  const remember = async (
    kind: "departments" | null,
    item: api.SetupOption,
  ) => {
    if (kind) setup.remember(kind, [item]);
    if (!kind) setCreated((old) => [item, ...old]);
    await refreshed(setup.refresh);
  };
  return (
    <>
      <SetupForm
        title="1. Create a department"
        submitLabel="Create department"
        description="Start with a department, such as Operations, Administration or Sales. Fields marked * are required."
        fields={[
          {
            name: "name",
            label: "Department name",
            required: true,
            maxLength: 200,
            placeholder: "e.g. Operations",
          },
        ]}
        save={async (d) => {
          const name = string(d, "name");
          if (
            setup.choices.departments.some(
              (item) => item.name.trim().toLowerCase() === name.toLowerCase(),
            )
          )
            throw new Error(
              "This department already exists. Choose it when creating a job role, or enter another name.",
            );
          await remember("departments", await api.setupDepartment(name));
        }}
      />
      {setup.choices.departments.length === 0 ? (
        <Card title="2. Create positions / job roles">
          <p className="text-sm text-slate-600">
            Create a department above first. Then add job roles such as Security
            Officer, Supervisor or Administrator within it.
          </p>
        </Card>
      ) : (
        <SetupForm
          title="2. Create a position / job role"
          submitLabel="Create position"
          description="A position is a job role, such as Security Officer or Supervisor. Select its department. Give it a short code, such as SEC-OFFICER, for employee imports. Fields marked * are required."
          fields={[
            {
              name: "name",
              label: "Job role name",
              placeholder: "e.g. Security Officer",
              required: true,
              maxLength: 120,
            },
            {
              name: "code",
              label: "Position code",
              placeholder: "e.g. SEC-OFFICER",
              required: true,
              maxLength: 40,
            },
          ]}
          save={async (d) => {
            const departmentId = string(d, "departmentId"),
              name = string(d, "name"),
              code = string(d, "code").toUpperCase();
            if (
              !setup.choices.departments.some(
                (item) => item.id === departmentId,
              )
            )
              throw new Error(
                "Choose a saved department before creating a job role.",
              );
            if (
              setup.choices.positions.some(
                (item) =>
                  item.departmentId === departmentId &&
                  (item.code.toUpperCase() === code ||
                    item.name.toLowerCase() === name.toLowerCase()),
              )
            )
              throw new Error(
                "A position with this name or code already exists in this department. Use another name/code or select the saved position for employees.",
              );
            const position = await api.setupPosition({
              departmentId,
              name,
              code,
            });
            setup.remember("positions", [position]);
            await refreshed(setup.refresh);
          }}
        >
          <KnownId
            name="departmentId"
            label="Department"
            items={setup.choices.departments}
          />
        </SetupForm>
      )}
      <Card title="3. Saved departments & job roles">
        <Notice error={review.error} message={review.message} />
        {!setup.choices.departments.length && (
          <p className="text-sm text-slate-500">
            No departments yet. Start with step 1 above.
          </p>
        )}
        <p className="text-sm">
          Lists are loaded from your company and remain available after reload.
        </p>
        {setup.choices.departments.map((d) => (
          <div key={d.id} className="border-t py-3">
            <strong>{d.name}</strong>
            {!setup.choices.positions.some((p) => p.departmentId === d.id) && (
              <p className="text-sm text-slate-500">
                No job roles yet. Add one using step 2 above.
              </p>
            )}
            {setup.choices.positions
              .filter((p) => p.departmentId === d.id)
              .map((p) => (
                <p key={p.id} className="text-sm">
                  {p.name} · {p.code} · {p.isActive ? "Active" : "Retired"}{" "}
                  {p.isActive && (
                    <button
                      className="text-indigo-600 underline"
                      disabled={review.busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Retire this position? Existing assignments stay in history; new assignment and pending activation will be blocked.",
                          )
                        )
                          void review.run(async () => {
                            const retired = await api.retirePosition(p.id);
                            setup.remember("positions", [retired]);
                            await refreshed(setup.refresh);
                          }, "Position retired. Existing assignments remain in history.");
                      }}
                    >
                      Retire
                    </button>
                  )}
                </p>
              ))}
          </div>
        ))}
      </Card>
      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <summary className="cursor-pointer font-semibold">
          Attendance setup: work locations & shifts
        </summary>
        <p className="my-4 text-sm text-slate-600">
          Complete these when setting up attendance. They are optional for a
          Core HR-only company. Required inputs are marked *.
        </p>
        <div className="space-y-6">
          <SetupForm
            title="Create a work location"
            submitLabel="Create location"
            fields={[
              {
                name: "code",
                label: "Location code",
                required: true,
                maxLength: 40,
              },
              {
                name: "name",
                label: "Location name",
                required: true,
                maxLength: 120,
              },
              {
                name: "type",
                label: "Location type",
                type: "select",
                required: true,
                options: [
                  "HEAD_OFFICE",
                  "BRANCH",
                  "CALL_CENTRE",
                  "WAREHOUSE",
                  "CLIENT_SITE",
                  "FIELD_SITE",
                  "OTHER",
                ],
              },
              { name: "addressLine1", label: "Address", maxLength: 160 },
              { name: "city", label: "City", maxLength: 100 },
              {
                name: "timezone",
                label: "Timezone",
                value: "Africa/Johannesburg",
                maxLength: 80,
              },
              {
                name: "latitude",
                label: "Latitude (optional)",
                type: "number",
                min: -90,
                max: 90,
                step: 0.000001,
              },
              {
                name: "longitude",
                label: "Longitude (optional)",
                type: "number",
                min: -180,
                max: 180,
                step: 0.000001,
              },
              {
                name: "geofenceRadiusMeters",
                label: "Geofence radius in metres (optional)",
                type: "number",
                min: 10,
                max: 100000,
              },
              {
                name: "attendanceEnabled",
                label: "Enable attendance",
                type: "checkbox",
                value: true,
              },
            ]}
            save={async (d) => {
              const p: Record<string, unknown> = values(d);
              p.attendanceEnabled = d.get("attendanceEnabled") === "on";
              const latitude = string(d, "latitude"),
                longitude = string(d, "longitude");
              if (Boolean(latitude) !== Boolean(longitude))
                throw new Error(
                  "Enter latitude and longitude together, or leave both blank.",
                );
              if (string(d, "geofenceRadiusMeters") && !latitude)
                throw new Error(
                  "A geofence radius needs both latitude and longitude.",
                );
              for (const k of ["latitude", "longitude", "geofenceRadiusMeters"])
                if (string(d, k)) p[k] = numeric(d, k);
              await remember(null, await api.setupLocation(p));
            }}
          />
          <SetupForm
            title="Create a shift"
            submitLabel="Create shift"
            description="Local wall-clock times. End before start means an overnight shift."
            fields={[
              {
                name: "code",
                label: "Shift code",
                required: true,
                maxLength: 40,
              },
              {
                name: "name",
                label: "Shift name",
                required: true,
                maxLength: 120,
              },
              {
                name: "startTime",
                label: "Start time",
                type: "time",
                required: true,
              },
              {
                name: "endTime",
                label: "End time",
                type: "time",
                required: true,
              },
              {
                name: "unpaidBreakMinutes",
                label: "Unpaid break minutes",
                type: "number",
                required: true,
                min: 0,
                max: 1439,
                value: 0,
              },
            ]}
            save={async (d) => {
              const start = string(d, "startTime"),
                end = string(d, "endTime"),
                minutes = (s: string) =>
                  Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
              const duration = (minutes(end) - minutes(start) + 1440) % 1440;
              if (!duration || numeric(d, "unpaidBreakMinutes") >= duration)
                throw new Error(
                  "Shift duration must be positive and exceed its unpaid break.",
                );
              await remember(
                null,
                await api.setupShift({
                  code: string(d, "code"),
                  name: string(d, "name"),
                  startTime: start,
                  endTime: end,
                  unpaidBreakMinutes: numeric(d, "unpaidBreakMinutes"),
                }),
              );
            }}
          />
        </div>
      </details>
      {!!created.length && (
        <Card title="Created in this setup session">
          <ul className="space-y-3">
            {created.map((c) => (
              <li key={c.id} className="break-all">
                {c.name}
              </li>
            ))}
          </ul>
          <p className="text-sm mt-4">
            Saved departments and positions are reloaded from the company. Newly
            created locations and shifts are shown here for this session.
          </p>
        </Card>
      )}
    </>
  );
}
