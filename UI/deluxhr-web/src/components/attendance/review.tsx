"use client";
import { useWorkspaceAccess } from "../layout/workspace-access";
import { grant } from "../../lib/workspace-access";
import { useEffect, useState } from "react";
import { workforceRequest as request } from "../../lib/api";
import { Card, Field, Notice, button, control, secondary } from "../leave/ui";
type Route = {
  workLocationId: string;
  reviewerUserId: string;
  locationMode?: string;
};
type Settings = {
  whatsappAlerts?: boolean;
  enabled: boolean;
  locationMode: string;
  reminderMinutes: number;
  supervisorMinutes: number;
  escalationMinutes: number;
  reviewerUserId: string | null;
  operationsUserId: string | null;
  siteRouting: Route[];
};
type Choices = {
  reviewers: { id: string; fullName: string }[];
  locations: { id: string; name: string }[];
};
type Attempt = {
  id: string;
  status: string;
  eventType: string;
  reason: string;
  mode: string;
  capturedAt: string;
  distanceM: number | null;
  latitude: number;
  longitude: number;
  lateMinutes: number;
  explanation: string | null;
  resolution: string | null;
  workLocationId: string | null;
  employee?: {
    firstName: string;
    lastName: string;
    employeeCode: string | null;
  };
  workLocation?: { name: string };
};
export function AttendanceReview({
  setupOnly = false,
}: {
  setupOnly?: boolean;
}) {
  const { access } = useWorkspaceAccess();
  const allowed =
    setupOnly || (!!access && grant(access, "MANAGE_ATTENDANCE", true));
  const [unavailable, setUnavailable] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null),
    [choices, setChoices] = useState<Choices>({ reviewers: [], locations: [] }),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<Attempt | null>(null),
    [reason, setReason] = useState(""),
    [site, setSite] = useState("");
  async function load() {
    const [s, c] = await Promise.all([
      request<Settings>("attendance/review/settings"),
      request<Choices>("attendance/review/choices"),
    ]);
    setSettings(s);
    setChoices(c);
    if (!setupOnly)
      setAttempts(await request<Attempt[]>("attendance/review/attempts"));
  }
  useEffect(() => {
    if (!allowed) return;
    void load().catch((e) => {
      const message =
        e instanceof Error ? e.message : "Unable to load attendance review";
      if (message.toLowerCase().includes("not included")) setUnavailable(true);
      else setError(message);
    });
  }, [setupOnly, allowed]);
  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      await load();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }
  const reviewers = (value: string | null, onChange: (v: string) => void) => (
    <select
      className={control}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Company administrators (fallback)</option>
      {choices.reviewers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.fullName}
        </option>
      ))}
    </select>
  );
  if (!allowed || unavailable) return null;
  return (
    <div className="space-y-5">
      <Notice error={error} message={message} />
      <Card title="Attendance policy & alert routing">
        <p className="text-sm text-slate-600">
          Location attempts awaiting review do not count as worked time. Late
          attendance is recorded and flagged without an automatic pay deduction.
          Alerts appear inside DeluxHR; scheduled WhatsApp alerts require
          approved templates.
        </p>
        <button
          className={secondary}
          disabled={busy}
          onClick={() => void run(load, "Status refreshed.")}
        >
          Refresh
        </button>
        {settings && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request("attendance/review/settings", "POST", {
                  whatsappAlerts: settings.whatsappAlerts ?? false,
                  enabled: settings.enabled,
                  locationMode: settings.locationMode,
                  reminderMinutes: settings.reminderMinutes,
                  supervisorMinutes: settings.supervisorMinutes,
                  escalationMinutes: settings.escalationMinutes,
                  siteRouting: settings.siteRouting,
                  reviewerUserId: settings.reviewerUserId || undefined,
                  operationsUserId: settings.operationsUserId || undefined,
                });
              }, "Attendance settings saved.");
            }}
            className="space-y-4"
          >
            <fieldset disabled={busy} className="space-y-4">
              <Field label="Default location policy">
                <select
                  className={control}
                  value={settings.locationMode}
                  onChange={(e) => update("locationMode", e.target.value)}
                >
                  <option value="REVIEW">
                    Review required — save attempt for approval
                  </option>
                  <option value="STRICT">
                    Strict — reject outside-site attendance
                  </option>
                  <option value="FLEXIBLE">
                    Flexible — record and flag outside-site attendance
                  </option>
                </select>
              </Field>
              <p className="text-xs text-slate-500">
                Missing shifts, sites or geofences always need review. Configure
                coordinates and radius under work locations. Lateness uses the
                assigned recurring schedule and its grace period.
              </p>
              <Field label="Default attendance reviewer">
                {reviewers(settings.reviewerUserId, (v) =>
                  update("reviewerUserId", v || null),
                )}
              </Field>
              <Field label="Operations escalation recipient">
                {reviewers(settings.operationsUserId, (v) =>
                  update("operationsUserId", v || null),
                )}
              </Field>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.whatsappAlerts ?? false}
                  onChange={(e) => update("whatsappAlerts", e.target.checked)}
                />
                Also queue WhatsApp alerts (approved template and recipient
                opt-in required)
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
                Enable scheduled monitoring for active companies
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["reminderMinutes", "Employee reminder (minutes)"],
                    ["supervisorMinutes", "Supervisor alert (minutes)"],
                    ["escalationMinutes", "Operations escalation (minutes)"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      className={control}
                      type="number"
                      min={1}
                      max={720}
                      required
                      value={settings[key]}
                      onChange={(e) => update(key, Number(e.target.value))}
                    />
                  </Field>
                ))}
              </div>
              <p className="text-xs">
                Times are measured after shift start and must increase. Approved
                leave and confirmed check-ins suppress missing-attendance
                alerts. A recurring shift schedule is required.
              </p>
              <details>
                <summary className="font-medium cursor-pointer">
                  Site-specific reviewer and location policy
                </summary>
                <div className="space-y-4 mt-3">
                  {choices.locations.map((l) => {
                    const row = settings.siteRouting.find(
                      (r) => r.workLocationId === l.id,
                    );
                    return (
                      <div key={l.id} className="border rounded p-3 space-y-2">
                        <strong className="text-sm">{l.name}</strong>
                        {reviewers(row?.reviewerUserId ?? null, (v) =>
                          update("siteRouting", [
                            ...settings.siteRouting.filter(
                              (r) => r.workLocationId !== l.id,
                            ),
                            ...(v
                              ? [
                                  {
                                    workLocationId: l.id,
                                    reviewerUserId: v,
                                    locationMode:
                                      row?.locationMode ??
                                      settings.locationMode,
                                  },
                                ]
                              : []),
                          ]),
                        )}
                        {row && (
                          <select
                            className={control}
                            value={row.locationMode ?? settings.locationMode}
                            onChange={(e) =>
                              update(
                                "siteRouting",
                                settings.siteRouting.map((r) =>
                                  r.workLocationId === l.id
                                    ? { ...r, locationMode: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          >
                            <option value="REVIEW">Review required</option>
                            <option value="STRICT">Strict</option>
                            <option value="FLEXIBLE">Flexible</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
              <button className={button} type="submit">
                Save attendance settings
              </button>
              {!setupOnly && (
                <button
                  className={secondary + " ml-3"}
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await request("attendance/review/scan", "POST");
                    }, "Current shifts checked.")
                  }
                >
                  Check current shifts now
                </button>
              )}
            </fieldset>
          </form>
        )}
      </Card>
      {!setupOnly && (
        <Card title="Location & setup review queue">
          <p className="text-sm">
            Pending attempts are not confirmed attendance. Rejected attempts
            remain visible as evidence.
          </p>
          {attempts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No pending or rejected attempts.
            </p>
          ) : (
            attempts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap justify-between items-center gap-3 border-b py-3"
              >
                <div>
                  <p className="font-medium">
                    {a.employee?.firstName} {a.employee?.lastName} ·{" "}
                    {a.eventType.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs">
                    {new Date(a.capturedAt).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}{" "}
                    SAST · {a.workLocation?.name ?? "No assigned site"} ·{" "}
                    {a.status}
                  </p>
                  <p className="text-sm">
                    {a.reason.replaceAll("_", " ").replaceAll(",", " · ")}
                    {a.distanceM !== null
                      ? ` · ${Math.round(a.distanceM)} m from site centre`
                      : ""}
                  </p>
                </div>
                <button
                  className={secondary}
                  onClick={() => {
                    setActive(a);
                    setReason("");
                    setSite(a.workLocationId ?? "");
                  }}
                >
                  Review attempt
                </button>
              </div>
            ))
          )}
        </Card>
      )}
      {active && (
        <Card title="Review attendance attempt">
          <p>
            {active.employee?.firstName} {active.employee?.lastName} ·{" "}
            {active.status}
          </p>
          <p className="text-sm">
            Shared coordinates: {active.latitude}, {active.longitude}.{" "}
            {active.lateMinutes ? `Late by ${active.lateMinutes} minutes.` : ""}
          </p>
          <p className="text-sm">
            Employee explanation: {active.explanation ?? "Not provided"}
          </p>
          {active.resolution && (
            <p className="text-sm">Previous review: {active.resolution}</p>
          )}
          <Field label="Authorised site (accepting a different site updates its effective primary assignment)">
            <select
              className={control}
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="">Choose site</option>
              {choices.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Review reason *">
            <textarea
              className={control}
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {(["ACCEPT", "REQUEST_LOCATION", "REJECT"] as const).map(
              (action) => (
                <button
                  key={action}
                  className={action === "ACCEPT" ? button : secondary}
                  disabled={
                    busy ||
                    active.status !== "PENDING" ||
                    reason.trim().length < 5 ||
                    (action === "ACCEPT" && !site)
                  }
                  onClick={() =>
                    void run(async () => {
                      await request(
                        `attendance/review/attempts/${active.id}/review`,
                        "POST",
                        {
                          action,
                          reason: reason.trim(),
                          ...(action === "ACCEPT"
                            ? { workLocationId: site }
                            : {}),
                        },
                      );
                      setActive(null);
                    }, "Review saved. The original attempt remains in the audit history.")
                  }
                >
                  {action === "ACCEPT"
                    ? "Accept attendance"
                    : action === "REQUEST_LOCATION"
                      ? "Request fresh location"
                      : "Reject attempt"}
                </button>
              ),
            )}
            <button className={secondary} onClick={() => setActive(null)}>
              Close
            </button>
          </div>
          <p className="text-xs">
            Your own attempt must be reviewed by another authorised user. If a
            later event exists, use the audited correction workflow instead.
          </p>
        </Card>
      )}
    </div>
  );
}
