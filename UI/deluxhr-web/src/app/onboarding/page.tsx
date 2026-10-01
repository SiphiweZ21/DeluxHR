"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDepartments, getEmployees, getLeaveTypes } from "../../lib/api";
import { getLeavePolicies } from "../../lib/leave-api";
import * as api from "../../lib/customer-onboarding-api";
import type { TenantReadiness } from "../../lib/platform-api";
import { logout } from "../../lib/auth";
import {
  Card,
  Empty,
  Notice,
  PageTitle,
  button,
  secondary,
  useAction,
} from "../../components/leave/ui";
import { SetupContext, type Choices } from "../../components/onboarding/common";
import {
  CompanySetup,
  StructureSetup,
} from "../../components/onboarding/company-setup";
import {
  LeaveSetup,
  OpeningLeave,
} from "../../components/onboarding/leave-setup";
import { EmployeeSetup } from "../../components/onboarding/employee-setup";
import { CompanyBanking } from "../../components/banking/company-banking";
import {
  CompanyDocumentsSetup,
  EmployeeDocumentsSetup,
} from "../../components/onboarding/employee-documents";
import { PayrollSetup } from "../../components/onboarding/payroll-setup";
const tabs = [
  "Readiness",
  "Company & administrators",
  "Departments, locations & shifts",
  "Leave & holidays",
  "Employee import & verification",
  "Opening leave",
  "Payroll & bank details",
  "Company banking & payments",
  "Company & employee documents",
];
const empty: Choices = {
  positions: [],
  departments: [],
  leaveTypes: [],
  policies: [],
  employees: [],
};
export default function Page() {
  const [identity, setIdentity] = useState<api.SetupIdentity | null>(null),
    [checked, setChecked] = useState(false),
    [ready, setReady] = useState<TenantReadiness | null>(null),
    [tab, setTab] = useState(tabs[0]),
    [choices, setChoices] = useState<Choices>(empty),
    [lookupWarning, setLookupWarning] = useState(""),
    [lookupLoading, setLookupLoading] = useState(false);
  const action = useAction();
  async function refresh() {
    setReady(await api.setupReadiness());
  }
  async function verify() {
    setChecked(false);
    await action.run(async () => {
      const user = await api.setupIdentity();
      if (user.role !== "COMPANY_ADMIN" || !user.organizationId)
        throw new Error(
          "Company administrator access is required for customer onboarding.",
        );
      setIdentity(user);
      await refresh();
      try { await loadChoices(); } catch { /* Inline lookup warning offers retry. */ }
    });
    setChecked(true);
  }
  useEffect(() => {
    void verify();
  }, []);
  async function loadChoices() {
    setLookupLoading(true);
    try {
      setChoices(await api.setupLookups());
      setLookupWarning("");
    } catch (e) {
      setLookupWarning(
        e instanceof Error
          ? e.message
          : "Saved lookup lists could not load. Refresh before importing.",
      );
      throw e;
    } finally { setLookupLoading(false); }
  }
  function remember(
    kind: keyof Choices,
    items: api.SetupOption[] | api.SetupEmployee[] | api.SetupPosition[],
  ) {
    setChoices((old) => ({
      ...old,
      [kind]: [
        ...old[kind].filter((o) => !items.some((i) => i.id === o.id)),
        ...items,
      ],
    }));
  }
  if (!checked) return <Empty>Checking company setup access…</Empty>;
  if (!identity)
    return (
      <>
        <PageTitle
          title="Company onboarding"
          text="Sign in with a company administrator account."
        />
        <Notice error={action.error} message="" />
        <button className={secondary} onClick={() => void verify()}>
          Retry
        </button>{" "}
        <Link href="/login" className={button}>
          Sign in
        </Link>
      </>
    );
  const pending =
    (ready?.status ?? identity.organization?.status) === "PENDING";
  return (
    <SetupContext.Provider value={{ choices, remember, refresh, pending, reloadChoices: loadChoices, lookupLoading, lookupError: lookupWarning }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageTitle
            eyebrow="Customer onboarding"
            title={`Set up ${identity.organization?.name ?? "your company"}`}
            text="Prepare the company, employees and subscribed modules for go-live."
          />
          <div className="flex gap-2">
            <button
              className={secondary}
              disabled={action.busy}
              onClick={() => void action.run(refresh)}
            >
              Refresh readiness
            </button>
            <button
              className={secondary}
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <Notice error={action.error} message={action.message} />
        {lookupWarning && (
          <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
            {lookupWarning}
          </p>
        )}
        {pending && (
          <Card title="Pending company setup">
            <p className="text-sm">
              Complete setup here before platform approval. Saved company
              departments, positions and employees load here during pending
              setup and after reload. A second administrator can select the same
              records by name. Platform administrators configure the
              optional services and activate the company after readiness passes. Core HR is included.
            </p>
          </Card>
        )}
        {ready && (
          <Card title="Go-live progress">
            <p className="text-3xl font-semibold">
              {ready.progress.percentage}%
            </p>
            <p>
              {ready.progress.completedSteps} of {ready.progress.totalSteps}{" "}
              required checks complete · Company {ready.status}
            </p>
            <progress
              className="mt-4 w-full"
              max={100}
              value={ready.progress.percentage}
              aria-label="Go-live progress"
            />
            <p className="mt-3 font-medium">
              {ready.status === "ACTIVE"
                ? "Company active"
                : ready.ready
                  ? "Ready for platform review"
                  : "Setup remaining"}
            </p>
            {ready.status === "ACTIVE" && (
              <Link
                href="/dashboard"
                className={secondary + " mt-3 inline-block"}
              >
                Open company workspace
              </Link>
            )}
          </Card>
        )}
        <nav
          aria-label="Company setup sections"
          className="flex flex-wrap gap-2"
        >
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? button : secondary}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === tabs[7] && <CompanyBanking />}
        {tab === tabs[8] && (
          <div className="space-y-6">
            <CompanyDocumentsSetup />
            <EmployeeDocumentsSetup />
          </div>
        )}
        <div className={tab === tabs[0] ? "space-y-6" : "hidden"}>
          {ready && (
            <>
              <Card title="Readiness checklist">
                <div className="divide-y">
                  {ready.checklist.filter(c => c.key !== 'package').map((c) => (
                    <div
                      key={c.key}
                      className="flex flex-wrap justify-between gap-2 py-3"
                    >
                      <p>
                        {c.key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (s) => s.toUpperCase())}
                      </p>
                      <p
                        className={
                          c.ready ? "text-emerald-700" : "text-amber-700"
                        }
                      >
                        {c.ready ? "Complete" : "Pending"} ·{" "}
                        {c.required ? "Required" : "Optional"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 mt-4 sm:grid-cols-2">
                  {Object.entries(ready.counts).map(([k, v]) => (
                    <p key={k} className="text-sm">
                      {k.replace(/([A-Z])/g, " $1")}: {v}
                    </p>
                  ))}
                </div>
              </Card>
              <Card title="Activation & verification">
                <p>
                  Company activation is performed by a platform administrator;
                  this page cannot approve its own company.
                </p>
                <p className="text-sm mt-3">
                  Independent setup approval: create a second company
                  administrator, then sign in as that administrator to activate
                  employees and approve bank submissions created by the first
                  administrator. Both accounts must be active and belong to this
                  pending company. Creators cannot approve their own records;
                  bank approval requires the checker’s password. Normal checker
                  roles apply after company activation.
                </p>
                <p className="text-sm mt-3">
                  Opening leave/payroll review confirmations must follow the
                  latest employee import. Payroll readiness additionally
                  requires positive salary/rate profiles and approved payment
                  details for all active employees.
                </p>
              </Card>
            </>
          )}
          {
            <>
              <button
                className={secondary}
                onClick={() => void action.run(loadChoices)}
              >
                Refresh existing record choices
              </button>
              <Link className={secondary} href="/onboarding/preferences">
                Onboarding mode & assistance
              </Link>
            </>
          }
        </div>
        <div className={tab === tabs[1] ? "space-y-6" : "hidden"}>
          <CompanySetup />
        </div>
        <div className={tab === tabs[2] ? "space-y-6" : "hidden"}>
          <StructureSetup />
        </div>
        <div className={tab === tabs[3] ? "space-y-6" : "hidden"}>
          <LeaveSetup />
        </div>
        <div className={tab === tabs[4] ? "space-y-6" : "hidden"}>
          <EmployeeSetup />
        </div>
        <div className={tab === tabs[5] ? "space-y-6" : "hidden"}>
          <OpeningLeave />
        </div>
        <div className={tab === tabs[6] ? "space-y-6" : "hidden"}>
          <PayrollSetup />
        </div>
      </div>
    </SetupContext.Provider>
  );
}
