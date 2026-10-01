"use client";
import { useEffect, useState } from "react";
import { getAttendanceEvents, type AttendanceEventPage } from "../../lib/api";
export function AttendanceEvents() {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AttendanceEventPage | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setData(null);
    getAttendanceEvents(page)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load attendance events.",
          );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [page, refresh]);
  const btn = "rounded-lg border px-4 py-2 text-sm disabled:opacity-40";
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6">
        <div>
          <h2 className="font-semibold text-slate-900">
            Attendance events · WhatsApp, kiosk & web
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Individual captures with shared location evidence. Shared
            coordinates are not proof of physical presence or site verification.
          </p>
        </div>
        <button
          className={btn}
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh events
        </button>
      </div>
      {error && (
        <p role="alert" className="p-6 text-red-700">
          {error}
        </p>
      )}
      {busy ? (
        <p className="p-6 text-slate-500">Loading attendance events…</p>
      ) : (
        data && (
          <>
            {!data.items.length ? (
              <p className="p-6 text-slate-500">
                No attendance events on this page.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      {[
                        "Employee",
                        "Action",
                        "Captured at",
                        "Channel",
                        "Assigned site",
                        "Shared coordinates",
                        "Site verification",
                      ].map((h) => (
                        <th className="px-5 py-3" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.items.map((e) => (
                      <tr key={e.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium">
                            {e.employee.firstName} {e.employee.lastName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {e.employee.department?.name ?? "No department"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {e.eventType.replaceAll("_", " ")}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {new Date(e.capturedAt).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-5 py-4">
                          {e.channel.replaceAll("_", " ")}
                        </td>
                        <td className="px-5 py-4">
                          {e.workLocation?.name ?? "No site assigned"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {e.latitude != null && e.longitude != null
                            ? `${e.latitude.toFixed(6)}, ${e.longitude.toFixed(6)}`
                            : "Not captured"}
                        </td>
                        <td className="px-5 py-4">
                          {e.locationVerificationStatus.replaceAll("_", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <span className="text-sm text-slate-500">
          Page {page}
          {data ? ` · ${data.total} events` : ""}
        </span>
        <div className="flex gap-2">
          <button
            className={btn}
            disabled={busy || page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            className={btn}
            disabled={busy || !data || page * data.pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
