"use client";
import { useEffect, useState } from "react";
import { workforceRequest as request } from "../../lib/api";
import { useWorkspaceAccess } from "../layout/workspace-access";
type Alert = {
  id: string;
  kind: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export function AttendanceAlerts() {
  const { access } = useWorkspaceAccess(),
    [rows, setRows] = useState<Alert[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!access?.features.includes("ATTENDANCE")) return;
    let live = true;
    const load = () =>
      request<Alert[]>("attendance/review/alerts")
        .then((r) => {
          if (live) {
            setRows(r.filter((a) => !a.readAt));
            setError("");
          }
        })
        .catch(() => {
          if (live) setError("Attendance alerts could not refresh.");
        });
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [access?.features]);
  if (!rows.length)
    return error ? (
      <p className="text-xs text-slate-500 mb-3">{error}</p>
    ) : null;
  return (
    <details className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-5">
      <summary className="font-semibold cursor-pointer">
        Attendance alerts · {rows.length}
      </summary>
      {error && <p role="alert">{error}</p>}
      {rows.map((a) => (
        <div key={a.id} className="border-t border-amber-200 mt-3 pt-3 text-sm">
          <p>{a.message}</p>
          <button
            className="underline mt-1"
            onClick={() =>
              void request(`attendance/review/alerts/${a.id}/read`, "POST")
                .then(() => setRows((r) => r.filter((x) => x.id !== a.id)))
                .catch(() => setError("Could not mark alert as read."))
            }
          >
            Mark as read
          </button>
        </div>
      ))}
    </details>
  );
}
