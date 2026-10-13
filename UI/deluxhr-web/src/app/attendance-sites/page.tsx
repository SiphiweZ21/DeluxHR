"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getEmployees, type Employee } from "../../lib/api";
import {
  assignSite,
  endSiteAssignment,
  getSites,
  getSiteAssignments,
  siteDateInstant,
  type Site,
  type SiteAssignment,
} from "../../lib/site-assignments-api";
import { usePagePreference } from "../../lib/use-page-preference";
import { grant } from "../../lib/workspace-access";
import { useWorkspaceAccess } from "../../components/layout/workspace-access";

const input =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2";
const button =
  "rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function label(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: zone || "Africa/Johannesburg",
    dateStyle: "medium",
  }).format(new Date(value));
}
function status(a: SiteAssignment) {
  const now = Date.now();
  return new Date(a.effectiveFrom).getTime() > now
    ? "Scheduled"
    : a.effectiveTo && new Date(a.effectiveTo).getTime() <= now
      ? "Ended"
      : "Current";
}

export default function SiteAssignmentsPage() {
  const { access } = useWorkspaceAccess();
  const canManage = !!access && grant(access, "MANAGE_ATTENDANCE", true);
  const [employees, setEmployees] = useState<Employee[]>([]),
    [sites, setSites] = useState<Site[]>([]);
  const [employeeId, setEmployeeId] = usePagePreference(
      "attendance-sites",
      "employee",
      "",
    ),
    [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(""),
    [endDates, setEndDates] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<SiteAssignment[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const site = sites.find((s) => s.id === siteId);
  useEffect(() => {
    let live = true;
    Promise.all([getEmployees(), getSites()])
      .then(([e, s]) => {
        if (live) {
          setEmployees(e);
          setSites(s);
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load employees and sites.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const key = ++requestId.current;
    setAssignments([]);
    setError("");
    setNotice("");
    if (!employeeId) return;
    setLoading(true);
    getSiteAssignments(employeeId)
      .then((rows) => {
        if (key === requestId.current) setAssignments(rows);
      })
      .catch((e) => {
        if (key === requestId.current)
          setError(
            e instanceof Error ? e.message : "Unable to load assignments.",
          );
      })
      .finally(() => {
        if (key === requestId.current) setLoading(false);
      });
  }, [employeeId]);
  async function run(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setAssignments(await getSiteAssignments(employeeId));
      setNotice(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save the assignment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-indigo-600">
          Workforce time
        </p>
        <h1 className="mt-1 text-3xl font-bold">Employee site assignments</h1>
        <p className="mt-2 text-slate-600">
          Set where an employee should work. Assign their shift separately in
          Shifts &amp; Schedules.
        </p>
        <div className="mt-3 flex gap-4">
          <Link className="text-indigo-700 underline" href="/attendance">
            Attendance
          </Link>
          <Link className="text-indigo-700 underline" href="/attendance-setup">
            Manage locations
          </Link>
          <Link className="text-indigo-700 underline" href="/shifts">
            Shifts &amp; Schedules
          </Link>
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">
          {notice}
        </p>
      )}
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Assign or change primary site</h2>
        <p className="mt-2 text-sm text-slate-600">
          A new primary assignment ends the previous assignment at its start
          date. Future overlapping assignments must be ended or shortened first.
          The end date is exclusive.
        </p>
        <label className="mt-4 block text-sm">
          Employee
          <select
            className={input}
            disabled={busy || loading}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Choose employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
                {e.employeeCode ? ` · ${e.employeeCode}` : ""}
              </option>
            ))}
          </select>
        </label>
        {canManage ? (
          <form
            className="mt-4 space-y-4"
            data-unsaved-form
            onSubmit={(e) => {
              e.preventDefault();
              if (!site) return;
              const form = e.currentTarget;
              void run(async () => {
                await assignSite(employeeId, {
                  workLocationId: site.id,
                  effectiveFrom: siteDateInstant(from, site.timezone),
                  ...(to
                    ? { effectiveTo: siteDateInstant(to, site.timezone) }
                    : {}),
                });
                form.dispatchEvent(
                  new Event("deluxhr:saved", { bubbles: true }),
                );
              }, "Site assignment saved.");
            }}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm">
                Site *
                <select
                  className={input}
                  disabled={busy}
                  required
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                >
                  <option value="">Choose active location</option>
                  {sites
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.code}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                Effective from *
                <input
                  className={input}
                  disabled={busy}
                  required
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                End date (exclusive, optional)
                <input
                  className={input}
                  disabled={busy}
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
            {site && (
              <p className="text-sm text-slate-600">
                Dates use {site.timezone || "Africa/Johannesburg"}.
                {(!site.attendanceEnabled ||
                  site.latitude == null ||
                  site.longitude == null ||
                  !site.geofenceRadiusMeters) && (
                  <span className="block text-amber-800">
                    Location attendance or geofence setup is incomplete. Review
                    the location before testing clock-in.
                  </span>
                )}
              </p>
            )}
            <button
              className={button}
              disabled={
                busy ||
                loading ||
                !employeeId ||
                !siteId ||
                (!!to && to <= from)
              }
            >
              {busy ? "Saving…" : "Save site assignment"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            You can view assignments. An attendance administrator can change
            them.
          </p>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Selected employee’s sites</h2>
        {loading ? (
          <p className="mt-4">Loading…</p>
        ) : !employeeId ? (
          <p className="mt-4 text-slate-500">
            Choose an employee to view their assignments.
          </p>
        ) : !assignments.length ? (
          <p className="mt-4 text-slate-500">No site assigned yet.</p>
        ) : (
          <div className="mt-4 divide-y">
            {assignments.map((a) => (
              <article key={a.id} className="space-y-3 py-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {a.workLocation.name} · {a.workLocation.code}
                    </p>
                    <p className="text-sm text-slate-600">
                      {label(a.effectiveFrom, a.workLocation.timezone)} →{" "}
                      {a.effectiveTo
                        ? label(a.effectiveTo, a.workLocation.timezone) +
                          " (exclusive)"
                        : "Open-ended"}{" "}
                      · {a.isPrimary ? "Primary" : "Additional"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{status(a)}</span>
                </div>
                {canManage && status(a) !== "Ended" && (
                  <form
                    data-unsaved-form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      void run(async () => {
                        await endSiteAssignment(
                          employeeId,
                          a.id,
                          siteDateInstant(
                            endDates[a.id],
                            a.workLocation.timezone,
                          ),
                        );
                        form.dispatchEvent(
                          new Event("deluxhr:saved", { bubbles: true }),
                        );
                      }, "Site assignment ended or shortened.");
                    }}
                  >
                    <label className="text-sm">
                      End date (exclusive)
                      <input
                        required
                        className={input}
                        disabled={busy}
                        type="date"
                        value={endDates[a.id] || ""}
                        onChange={(e) =>
                          setEndDates((old) => ({
                            ...old,
                            [a.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button disabled={busy} className={button}>
                      End assignment
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
