"use client";

import { AttendanceEvents } from "../../components/attendance/events";
import { useEffect, useMemo, useState } from "react";
import {
  clockInEmployee,
  clockOutEmployee,
  getAttendanceRecords,
  getEmployees,
  type AttendanceRecord,
  type Employee,
} from "../../lib/api";

function sameLocalDay(value: string, date = new Date()) {
  const candidate = new Date(value);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
}

function durationHours(record: AttendanceRecord) {
  if (!record.clockOut) return null;
  return Math.max(
    0,
    (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) /
      3600000,
  );
}

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "OPEN" | "COMPLETED"
  >("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeRecords = Array.isArray(records) ? records : [];

  const openRecordForSelectedEmployee = useMemo(
    () =>
      safeRecords.find(
        (record) =>
          record.employeeId === selectedEmployeeId && !record.clockOut,
      ),
    [safeRecords, selectedEmployeeId],
  );

  const selectedEmployee = safeEmployees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const todayRecords = safeRecords.filter((record) =>
    sameLocalDay(record.clockIn),
  );
  const clockedInNow = safeRecords.filter((record) => !record.clockOut).length;
  const completedToday = todayRecords.filter(
    (record) => record.clockOut,
  ).length;
  const todayHours = todayRecords.reduce(
    (sum, record) => sum + (durationHours(record) ?? 0),
    0,
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return safeRecords.filter((record) => {
      const name = getEmployeeName(record).toLowerCase();
      const matchesSearch =
        !term ||
        name.includes(term) ||
        record.employee?.department?.name?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OPEN" ? !record.clockOut : Boolean(record.clockOut));
      return matchesSearch && matchesStatus;
    });
  }, [safeRecords, search, statusFilter]);

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const [employeeData, attendanceData] = await Promise.all([
        getEmployees(),
        getAttendanceRecords(),
      ]);
      const employeeList = Array.isArray(employeeData) ? employeeData : [];
      setEmployees(employeeList);
      setRecords(Array.isArray(attendanceData) ? attendanceData : []);
      if (!selectedEmployeeId && employeeList.length > 0)
        setSelectedEmployeeId(employeeList[0].id);
    } catch (error) {
      setEmployees([]);
      setRecords([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load attendance data",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function handleClockIn() {
    if (!selectedEmployeeId)
      return setErrorMessage("Please select an employee.");
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await clockInEmployee({ employeeId: selectedEmployeeId });
      setSuccessMessage(
        `${selectedEmployee?.firstName ?? "Employee"} clocked in successfully.`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to clock in employee",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClockOut() {
    if (!openRecordForSelectedEmployee)
      return setErrorMessage("This employee is not currently clocked in.");
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await clockOutEmployee({
        attendanceId: openRecordForSelectedEmployee.id,
      });
      setSuccessMessage(
        `${selectedEmployee?.firstName ?? "Employee"} clocked out successfully.`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to clock out employee",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Workforce time
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Attendance
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            See who is working now and keep daily time records clear.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-900">
            {safeEmployees.length}
          </span>{" "}
          employees tracked
        </div>
      </div>

      <AttendanceEvents />
      <p className="text-sm text-slate-500">
        The summary and clock controls below show web attendance sessions.
        WhatsApp captures appear in Attendance events above; use WhatsApp to
        finish a WhatsApp clock-in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Clocked in now"
          value={clockedInNow}
          note="Open attendance sessions"
          tone="indigo"
        />
        <Metric
          label="Completed today"
          value={completedToday}
          note="Clock-outs recorded today"
          tone="green"
        />
        <Metric
          label="Hours today"
          value={`${todayHours.toFixed(1)}h`}
          note="Completed sessions"
        />
        <Metric
          label="Today's records"
          value={todayRecords.length}
          note="Attendance activity"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <h2 className="font-semibold text-slate-900">
            Clock employee attendance
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Select an employee and record their current attendance state.
          </p>
        </div>
        <div className="p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto_auto] lg:items-center">
            <select
              value={selectedEmployeeId}
              onChange={(e) => {
                setSelectedEmployeeId(e.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              disabled={isLoading || isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Select employee</option>
              {safeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                  {employee.department?.name
                    ? ` · ${employee.department.name}`
                    : ""}
                </option>
              ))}
            </select>
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${openRecordForSelectedEmployee ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}
            >
              <span className="font-semibold">
                {openRecordForSelectedEmployee
                  ? "● Clocked in"
                  : "○ Clocked out"}
              </span>
              {openRecordForSelectedEmployee && (
                <div className="mt-1 text-xs">
                  Since {formatTime(openRecordForSelectedEmployee.clockIn)}
                </div>
              )}
            </div>
            <button
              onClick={handleClockIn}
              disabled={
                isLoading ||
                isSubmitting ||
                !selectedEmployeeId ||
                Boolean(openRecordForSelectedEmployee)
              }
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clock in
            </button>
            <button
              onClick={handleClockOut}
              disabled={
                isLoading || isSubmitting || !openRecordForSelectedEmployee
              }
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clock out
            </button>
          </div>
          {successMessage && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Web attendance sessions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredRecords.length} of {safeRecords.length} records
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or department"
              className="min-w-64 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"
            >
              <option value="ALL">All statuses</option>
              <option value="OPEN">Clocked in</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">
            Loading attendance records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            No attendance records match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Work date</th>
                  <th className="px-6 py-3">Clock in</th>
                  <th className="px-6 py-3">Clock out</th>
                  <th className="px-6 py-3">Hours</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {getEmployeeName(record)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {record.employee?.department?.name ?? "No department"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatDate(record.workDate || record.clockIn)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatTime(record.clockIn)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {record.clockOut ? formatTime(record.clockOut) : "—"}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {durationHours(record) === null
                        ? "In progress"
                        : `${durationHours(record)!.toFixed(1)}h`}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${record.clockOut ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}
                      >
                        {record.clockOut ? "Completed" : "Clocked in"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: "slate" | "indigo" | "green";
}) {
  const accent =
    tone === "indigo"
      ? "text-indigo-600"
      : tone === "green"
        ? "text-emerald-600"
        : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}
function getEmployeeName(record: AttendanceRecord) {
  return record.employee
    ? `${record.employee.firstName} ${record.employee.lastName}`
    : record.employeeId;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
