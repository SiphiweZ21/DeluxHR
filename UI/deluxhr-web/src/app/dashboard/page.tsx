'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { useWorkspaceAccess } from '../../components/layout/workspace-access';
import { routeAllowed } from '../../lib/workspace-access';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getAuditLogs,
  getCompanyOnboarding,
  getDepartments,
  getEmployees,
  getLeaveRequests,
  getLeaveTypes,
  type AuditLog,
  type CompanyOnboarding,
  type Department,
  type Employee,
  type LeaveRequest,
  type LeaveType,
} from '../../lib/api';

function Link(props: ComponentProps<typeof NextLink>) { const { access } = useWorkspaceAccess(); return access && typeof props.href === 'string' && routeAllowed(access, props.href) ? <NextLink {...props}/> : null; }

function MiniIcon({
  kind,
}: {
  kind: string;
}) {
  const map: Record<string, string> = {
    employees: '👥',
    departments: '▦',
    leave: '◷',
    pending: '✓',
  };

  return (
    <span className="text-lg">
      {map[kind]}
    </span>
  );
}

function Status({
  value,
}: {
  value: string;
}) {
  const c =
    value === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
      : value === 'REJECTED'
        ? 'bg-rose-50 text-rose-700 ring-rose-600/10'
        : 'bg-amber-50 text-amber-700 ring-amber-600/10';

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${c}`}
    >
      {value}
    </span>
  );
}

function fmt(date?: string) {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-ZA',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(new Date(date));
}

export default function DashboardPage() {
  const { access } = useWorkspaceAccess();
  const allowed = (path: string) => !!access && routeAllowed(access, path);

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [departments, setDepartments] =
    useState<Department[]>([]);

  const [leaveTypes, setLeaveTypes] =
    useState<LeaveType[]>([]);

  const [leaveRequests, setLeaveRequests] =
    useState<LeaveRequest[]>([]);

  const [auditLogs, setAuditLogs] =
    useState<AuditLog[]>([]);

  const [onboarding, setOnboarding] =
    useState<CompanyOnboarding | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] = useState('');

  async function loadData() {
    setIsLoading(true);
    setError('');

    const [
      employeesResult,
      departmentsResult,
      leaveTypesResult,
      leaveRequestsResult,
      auditLogsResult,
    ] = await Promise.allSettled([
      allowed('/employees') ? getEmployees() : Promise.resolve([]),
      allowed('/departments') ? getDepartments() : Promise.resolve([]),
      allowed('/leave-types') ? getLeaveTypes() : Promise.resolve([]),
      allowed('/leave-requests') ? getLeaveRequests() : Promise.resolve([]),
      allowed('/audit-logs') ? getAuditLogs() : Promise.resolve([]),
    ]);

    setEmployees(
      employeesResult.status === 'fulfilled' &&
        Array.isArray(
          employeesResult.value,
        )
        ? employeesResult.value
        : [],
    );

    setDepartments(
      departmentsResult.status ===
        'fulfilled' &&
        Array.isArray(
          departmentsResult.value,
        )
        ? departmentsResult.value
        : [],
    );

    setLeaveTypes(
      leaveTypesResult.status ===
        'fulfilled' &&
        Array.isArray(
          leaveTypesResult.value,
        )
        ? leaveTypesResult.value
        : [],
    );

    setLeaveRequests(
      leaveRequestsResult.status ===
        'fulfilled' &&
        Array.isArray(
          leaveRequestsResult.value,
        )
        ? leaveRequestsResult.value
        : [],
    );

    setAuditLogs(
      auditLogsResult.status ===
        'fulfilled' &&
        Array.isArray(
          auditLogsResult.value,
        )
        ? auditLogsResult.value
        : [],
    );

    const operationalResults = [
      employeesResult,
      departmentsResult,
      leaveTypesResult,
      leaveRequestsResult,
      auditLogsResult,
    ];

    const failed =
      operationalResults.find(
        (result) =>
          result.status === 'rejected',
      );

    if (failed?.status === 'rejected') {
      setError(
        failed.reason instanceof Error
          ? failed.reason.message
          : 'Some dashboard data could not be loaded.',
      );
    }

    setIsLoading(false);
  }

  async function loadOnboarding() {
    try {
      const result =
        await getCompanyOnboarding();

      setOnboarding(result);
    } catch {
      /*
       * Onboarding is supplementary to the
       * operational dashboard. A failure here
       * must not prevent the dashboard loading.
       */
      setOnboarding(null);
    }
  }

  useEffect(() => {
    void loadData();
    if (allowed('/onboarding')) void loadOnboarding();
  }, [access]);

  const pending = leaveRequests.filter(
    (request) =>
      request.status === 'PENDING',
  );

  const approved = leaveRequests.filter(
    (request) =>
      request.status === 'APPROVED',
  ).length;

  const approvalRate =
    leaveRequests.length > 0
      ? Math.round(
          (approved /
            leaveRequests.length) *
            100,
        )
      : 0;

  const recent = useMemo(
    () =>
      [...leaveRequests]
        .sort(
          (a, b) =>
            new Date(
              b.createdAt ?? 0,
            ).getTime() -
            new Date(
              a.createdAt ?? 0,
            ).getTime(),
        )
        .slice(0, 5),
    [leaveRequests],
  );

  const stats = [
    [
      'Employees',
      employees.length,
      'People in your organization',
      'employees',
      '/employees',
    ],
    [
      'Departments',
      departments.length,
      'Active business teams',
      'departments',
      '/departments',
    ],
    [
      'Leave Types',
      leaveTypes.length,
      'Configured leave policies',
      'leave',
      '/leave-types',
    ],
    [
      'Pending Requests',
      pending.length,
      'Waiting for approval',
      'pending',
      '/leave-requests',
    ],
  ] as const;

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Organization overview
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Good to see you.
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            A clear view of your people
            operations, approvals and recent
            activity.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/employees"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            View employees
          </Link>

          <Link
            href="/leave-requests"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700"
          >
            Review requests
          </Link>
        </div>
      </section>

      {onboarding &&
        onboarding.status !==
          'COMPLETED' && (
          <OnboardingCard
            onboarding={onboarding}
          />
        )}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading your workspace…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.filter(stat => allowed(stat[4])).map(
              ([
                title,
                value,
                desc,
                kind,
                href,
              ]) => (
                <Link
                  href={href}
                  key={title}
                  className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)] transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 font-semibold text-indigo-700">
                      <MiniIcon
                        kind={kind}
                      />
                    </div>

                    <span className="text-slate-300 transition group-hover:text-indigo-500">
                      ↗
                    </span>
                  </div>

                  <p className="mt-5 text-3xl font-bold tracking-tight text-slate-950">
                    {value}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {title}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {desc}
                  </p>
                </Link>
              ),
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-bold text-slate-900">
                    Recent leave requests
                  </h2>

                  <p className="mt-0.5 text-xs text-slate-400">
                    Latest employee requests
                    and approval status
                  </p>
                </div>

                <Link
                  href="/leave-requests"
                  className="text-xs font-bold text-indigo-600"
                >
                  View all →
                </Link>
              </div>

              {recent.length === 0 ? (
                <div className="p-8 text-sm text-slate-500">
                  No leave requests yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recent.map((req) => (
                    <div
                      key={req.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1.2fr_1fr_auto]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {req.employee
                            ? `${req.employee.firstName[0]}${req.employee.lastName[0]}`
                            : 'HR'}
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {req.employee
                              ? `${req.employee.firstName} ${req.employee.lastName}`
                              : 'Employee'}
                          </p>

                          <p className="text-xs text-slate-400">
                            {req.leaveType
                              ?.name ??
                              'Leave request'}
                          </p>
                        </div>
                      </div>

                      <div className="hidden sm:block">
                        <p className="text-xs font-medium text-slate-600">
                          {fmt(
                            req.startDate,
                          )}{' '}
                          –{' '}
                          {fmt(
                            req.endDate,
                          )}
                        </p>

                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Requested{' '}
                          {fmt(
                            req.createdAt,
                          )}
                        </p>
                      </div>

                      <Status
                        value={req.status}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="space-y-6">
              <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg shadow-slate-200">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-300">
                  HR pulse
                </p>

                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-bold">
                      {approvalRate}%
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Leave approval rate
                    </p>
                  </div>

                  <div className="grid h-14 w-14 place-items-center rounded-full border-4 border-indigo-500/80 text-xs font-bold">
                    {approved}/
                    {
                      leaveRequests.length
                    }
                  </div>
                </div>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${approvalRate}%`,
                    }}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <h2 className="font-bold text-slate-900">
                  Recent activity
                </h2>

                <div className="mt-4 space-y-4">
                  {auditLogs
                    .slice(0, 4)
                    .map((log) => (
                      <div
                        key={log.id}
                        className="flex gap-3"
                      >
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />

                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            {log.action}{' '}
                            <span className="font-normal text-slate-500">
                              {
                                log.entity
                              }
                            </span>
                          </p>

                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {fmt(
                              log.createdAt,
                            )}
                          </p>
                        </div>
                      </div>
                    ))}

                  {auditLogs.length ===
                    0 && (
                    <p className="text-sm text-slate-500">
                      No activity yet.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OnboardingCard({
  onboarding,
}: {
  onboarding: CompanyOnboarding;
}) {
  const steps = [
    {
      label: 'Company Profile',
      complete:
        onboarding.steps.companyProfile
          .complete,
    },
    {
      label: 'Departments',
      complete:
        onboarding.steps.departments
          .complete,
    },
    {
      label: 'Access Setup',
      complete:
        onboarding.steps.accessSetup
          .complete,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-white shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm shadow-indigo-200">
                ✓
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
                  Company setup
                </p>

                <h2 className="mt-0.5 text-lg font-bold text-slate-950">
                  Complete your DeluxHR
                  setup
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              Complete the remaining core
              setup steps to prepare your
              company workspace.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-3xl font-bold tracking-tight text-slate-950">
                {
                  onboarding.progress
                    .percentage
                }
                %
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                {
                  onboarding.progress
                    .completedSteps
                }{' '}
                of{' '}
                {
                  onboarding.progress
                    .totalSteps
                }{' '}
                complete
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-indigo-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{
              width: `${onboarding.progress.percentage}%`,
            }}
          />
        </div>

        <div className="mt-5 flex flex-col justify-between gap-5 border-t border-indigo-100 pt-5 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {steps.map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-2"
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                    step.complete
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {step.complete
                    ? '✓'
                    : '○'}
                </span>

                <span
                  className={`text-xs font-semibold ${
                    step.complete
                      ? 'text-slate-600'
                      : 'text-slate-800'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          <Link
            href="/onboarding"
            className="w-fit rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-500"
          >
            Continue setup →
          </Link>
        </div>
      </div>
    </section>
  );
}
