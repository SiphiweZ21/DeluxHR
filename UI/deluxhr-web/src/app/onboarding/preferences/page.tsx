'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  cancelOnboardingAssistance,
  getCompanyOnboarding,
  requestOnboardingAssistance,
  updateOnboardingMode,
  type CompanyOnboarding,
  type ModuleReadinessStatus,
  type OnboardingMode,
} from '../../../lib/api';

const moduleLabels: Record<string, string> = {
  CORE_HR: 'Core HR',
  LEAVE: 'Leave',
  ATTENDANCE: 'Attendance',
  TIMESHEETS: 'Timesheets',
  PAYROLL: 'Payroll',
  PAYSLIPS: 'Payslips',
  WHATSAPP: 'WhatsApp',
  EARLY_PAY: 'Early Pay',
  WORKFORCE_INSIGHTS: 'Workforce Insights',
  EXECUTIVE_DASHBOARD: 'Executive Dashboard',
};

export default function OnboardingPage() {
  const [data, setData] =
    useState<CompanyOnboarding | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isUpdating, setIsUpdating] =
    useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setIsLoading(true);
      setError('');

      const result =
        await getCompanyOnboarding();

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load company setup.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeMode(
    mode: OnboardingMode,
  ) {
    try {
      setIsUpdating(true);
      setError('');
      setMessage('');

      await updateOnboardingMode(mode);
      await load();

      setMessage(
        mode === 'ASSISTED'
          ? 'Assisted onboarding selected.'
          : 'Self-service onboarding selected.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update onboarding mode.',
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function requestHelp() {
    try {
      setIsUpdating(true);
      setError('');
      setMessage('');

      await requestOnboardingAssistance();
      await load();

      setMessage(
        'Your onboarding assistance request has been sent to DeluxHR.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to request assistance.',
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function cancelHelp() {
    try {
      setIsUpdating(true);
      setError('');
      setMessage('');

      await cancelOnboardingAssistance();
      await load();

      setMessage(
        'The outstanding assistance request has been cancelled.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to cancel assistance.',
      );
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading company setup…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || 'Company setup could not be loaded.'}
      </div>
    );
  }

  const enabledModules =
    Object.entries(data.modules).filter(
      ([, module]) => module.enabled,
    );

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Company onboarding
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Set up your DeluxHR workspace
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Complete your core company setup and prepare the modules enabled for your organisation.
          </p>
        </div>

        <button
          onClick={() => void load()}
          className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </section>

      {error && (
        <Notice kind="error">
          {error}
        </Notice>
      )}

      {message && (
        <Notice kind="success">
          {message}
        </Notice>
      )}

      <section className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-200">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">
              Core company setup
            </p>

            <p className="mt-3 text-4xl font-bold">
              {data.progress.percentage}%
            </p>

            <p className="mt-2 text-sm text-slate-400">
              {data.progress.completedSteps} of{' '}
              {data.progress.totalSteps} required steps complete
            </p>
          </div>

          <StatusBadge status={data.status} />
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{
              width: `${data.progress.percentage}%`,
            }}
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Core setup
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            These steps establish the company workspace.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SetupCard
            title="Company profile"
            description="Complete the company identity, contact and address information."
            complete={data.steps.companyProfile.complete}
            href="/company-profile"
          />

          <SetupCard
            title="Departments"
            description={
              data.steps.departments.complete
                ? `${data.steps.departments.count} department${
                    data.steps.departments.count === 1
                      ? ''
                      : 's'
                  } configured.`
                : 'Create at least one department.'
            }
            complete={data.steps.departments.complete}
            href="/departments"
          />

          <SetupCard
            title="Access setup"
            description={`${data.steps.accessSetup.activeCompanyAdmins} active Company Admin${
              data.steps.accessSetup.activeCompanyAdmins === 1
                ? ''
                : 's'
            } configured.`}
            complete={data.steps.accessSetup.complete}
            href="/access-setup"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Enabled modules
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {data.productReadiness.readyModules} of{' '}
              {data.productReadiness.enabledModules} enabled modules are ready.
            </p>
          </div>

          <span
            className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${
              data.productReadiness.ready
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {data.productReadiness.ready
              ? 'Product ready'
              : 'Setup remaining'}
          </span>
        </div>

        <div className="mt-6 divide-y divide-slate-100">
          {enabledModules.map(
            ([feature, module]) => (
              <div
                key={feature}
                className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {moduleLabels[feature] ?? feature}
                  </p>

                  {module.reason && (
                    <p className="mt-1 text-xs text-slate-500">
                      {module.reason}
                    </p>
                  )}
                </div>

                <ModuleBadge
                  status={module.status}
                />
              </div>
            ),
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Onboarding preference
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Set up DeluxHR yourself or choose an assisted onboarding experience.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ModeButton
              active={
                data.mode === 'SELF_SERVICE'
              }
              title="Self-service"
              description="Configure your workspace using the setup checklist."
              disabled={isUpdating}
              onClick={() =>
                void changeMode(
                  'SELF_SERVICE',
                )
              }
            />

            <ModeButton
              active={
                data.mode === 'ASSISTED'
              }
              title="Assisted"
              description="Work with DeluxHR while configuring your workspace."
              disabled={isUpdating}
              onClick={() =>
                void changeMode('ASSISTED')
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
            Need help?
          </p>

          <h2 className="mt-3 text-lg font-semibold text-slate-950">
            DeluxHR onboarding assistance
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Request assistance and the DeluxHR platform team will be able to see your onboarding progress and help with setup.
          </p>

          <div className="mt-5">
            {data.assistanceRequested ? (
              <>
                <div className="mb-4 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-700">
                  Assistance requested
                </div>

                <button
                  disabled={isUpdating}
                  onClick={() =>
                    void cancelHelp()
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel request
                </button>
              </>
            ) : (
              <button
                disabled={isUpdating}
                onClick={() =>
                  void requestHelp()
                }
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                Request assistance
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SetupCard({
  title,
  description,
  complete,
  href,
}: {
  title: string;
  description: string;
  complete: boolean;
  href?: string;
}) {
  const content = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${
            complete
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {complete ? '✓' : '○'}
        </div>

        {href && (
          <span className="text-slate-300">
            ↗
          </span>
        )}
      </div>

      <h3 className="mt-4 font-semibold text-slate-950">
        {title}
      </h3>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <p
        className={`mt-4 text-xs font-bold ${
          complete
            ? 'text-emerald-600'
            : 'text-amber-600'
        }`}
      >
        {complete
          ? 'Complete'
          : 'Action required'}
      </p>
    </div>
  );

  return href ? (
    <Link href={href}>{content}</Link>
  ) : (
    content
  );
}

function ModeButton({
  active,
  title,
  description,
  disabled,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
        active
          ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100'
          : 'border-slate-200 bg-white hover:border-indigo-200'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900">
          {title}
        </p>

        <span
          className={`h-4 w-4 rounded-full border-4 ${
            active
              ? 'border-indigo-600 bg-white'
              : 'border-slate-300 bg-white'
          }`}
        />
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </button>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const label =
    status === 'COMPLETED'
      ? 'Complete'
      : status === 'IN_PROGRESS'
        ? 'In progress'
        : 'Not started';

  return (
    <span className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/10">
      {label}
    </span>
  );
}

function ModuleBadge({
  status,
}: {
  status: ModuleReadinessStatus;
}) {
  const styles: Record<
    ModuleReadinessStatus,
    string
  > = {
    READY:
      'bg-emerald-50 text-emerald-700',
    SETUP_REQUIRED:
      'bg-amber-50 text-amber-700',
    BLOCKED:
      'bg-rose-50 text-rose-700',
    DISABLED:
      'bg-slate-100 text-slate-500',
  };

  const labels: Record<
    ModuleReadinessStatus,
    string
  > = {
    READY: 'Ready',
    SETUP_REQUIRED: 'Setup required',
    BLOCKED: 'Blocked',
    DISABLED: 'Disabled',
  };

  return (
    <span
      className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function Notice({
  kind,
  children,
}: {
  kind: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        kind === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      {children}
    </div>
  );
}
