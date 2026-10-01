'use client';

import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  createCompanyUser,
  getCompanyUsers,
  updateCompanyUserRole,
  updateCompanyUserStatus,
  type CompanyUser,
  type CompanyUserRole,
} from '../../lib/api';

const roles: Array<{
  value: CompanyUserRole;
  label: string;
  description: string;
}> = [
  {
    value: 'COMPANY_ADMIN',
    label: 'Company Admin',
    description:
      'Manages company configuration and user access.',
  },
  {
    value: 'EXECUTIVE',
    label: 'Executive',
    description:
      'Executive-level access to company information and insights.',
  },
  {
    value: 'HR_ADMIN',
    label: 'HR Admin',
    description:
      'Manages people and HR operations.',
  },
  {
    value: 'PAYROLL_ADMIN',
    label: 'Payroll Admin',
    description:
      'Manages payroll-related operations.',
  },
  {
    value: 'MANAGER',
    label: 'Manager',
    description:
      'Management access for permitted team functions.',
  },
  {
    value: 'EMPLOYEE',
    label: 'Employee',
    description:
      'Limited employee web access when explicitly required.',
  },
];

function roleLabel(
  role: CompanyUserRole,
) {
  return (
    roles.find(
      (item) => item.value === role,
    )?.label ?? role
  );
}

export default function AccessSetupPage() {
  const [users, setUsers] =
    useState<CompanyUser[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [busyUserId, setBusyUserId] =
    useState<string | null>(null);

  const [showAddUser, setShowAddUser] =
    useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [fullName, setFullName] =
    useState('');

  const [email, setEmail] = useState('');

  const [password, setPassword] =
    useState('');

  const [role, setRole] =
    useState<CompanyUserRole>(
      'HR_ADMIN',
    );

  async function load() {
    try {
      setIsLoading(true);
      setError('');

      const result =
        await getCompanyUsers();

      setUsers(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load company users.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (
      !fullName.trim() ||
      !email.trim() ||
      !password
    ) {
      setError(
        'Complete all required user details.',
      );
      return;
    }

    if (password.length < 12) {
      setError(
        'Temporary password must be at least 12 characters.',
      );
      return;
    }

    try {
      setIsSubmitting(true);

      await createCompanyUser({
        fullName: fullName.trim(),
        email: email
          .trim()
          .toLowerCase(),
        password,
        role,
      });

      setFullName('');
      setEmail('');
      setPassword('');
      setRole('HR_ADMIN');
      setShowAddUser(false);

      await load();

      setMessage(
        'Company user created successfully.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create company user.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRoleChange(
    user: CompanyUser,
    nextRole: CompanyUserRole,
  ) {
    if (user.role === nextRole) {
      return;
    }

    try {
      setBusyUserId(user.id);
      setError('');
      setMessage('');

      await updateCompanyUserRole(
        user.id,
        nextRole,
      );

      await load();

      setMessage(
        `${user.fullName}'s access role was updated.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update user role.',
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleStatusChange(
    user: CompanyUser,
  ) {
    const action = user.isActive
      ? 'deactivate'
      : 'activate';

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.fullName}?`,
      )
    ) {
      return;
    }

    try {
      setBusyUserId(user.id);
      setError('');
      setMessage('');

      await updateCompanyUserStatus(
        user.id,
        !user.isActive,
      );

      await load();

      setMessage(
        `${user.fullName} was ${
          user.isActive
            ? 'deactivated'
            : 'activated'
        }.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${action} company user.`,
      );
    } finally {
      setBusyUserId(null);
    }
  }

  const activeAdmins = users.filter(
    (user) =>
      user.role === 'COMPANY_ADMIN' &&
      user.isActive,
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Company setup
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Access setup
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Manage the people who are
            authorised to access your DeluxHR
            web workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/onboarding"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Company Setup
          </Link>

          <button
            onClick={() =>
              setShowAddUser(
                (current) => !current,
              )
            }
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-500"
          >
            {showAddUser
              ? 'Close'
              : '+ Add company user'}
          </button>
        </div>
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

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Company users"
          value={users.length}
        />

        <SummaryCard
          label="Active users"
          value={
            users.filter(
              (user) => user.isActive,
            ).length
          }
        />

        <SummaryCard
          label="Active Company Admins"
          value={activeAdmins}
          highlight={
            activeAdmins > 0
          }
        />
      </section>

      {showAddUser && (
        <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 border-b border-slate-100 pb-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Add company user
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              Create web access only for
              people who need administrative,
              HR, payroll, executive or
              management access.
            </p>
          </div>

          <form
            onSubmit={handleCreate}
            className="space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Full name"
                required
                value={fullName}
                onChange={setFullName}
                placeholder="Full name"
              />

              <Field
                label="Email"
                required
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="name@company.co.za"
              />

              <Field
                label="Temporary password"
                required
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Minimum 12 characters"
                hint="The user should replace this with their own password when the invite flow is introduced."
              />

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Access role
                  <span className="ml-1 text-rose-500">
                    *
                  </span>
                </span>

                <select
                  value={role}
                  onChange={(event) =>
                    setRole(
                      event.target
                        .value as CompanyUserRole,
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  {roles.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    ),
                  )}
                </select>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {
                    roles.find(
                      (item) =>
                        item.value ===
                        role,
                    )?.description
                  }
                </p>
              </label>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              Company roles control system
              access. A person's job title
              does not automatically grant
              DeluxHR permissions.
            </div>

            <div className="flex justify-end">
              <button
                disabled={isSubmitting}
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Creating…'
                  : 'Create company user'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">
              Company users
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Authorised web users for this
              company.
            </p>
          </div>

          {activeAdmins > 0 && (
            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              Access setup ready
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">
            Loading company users…
          </div>
        ) : users.length === 0 ? (
          <div className="p-8">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-xl text-indigo-600">
                👤
              </div>

              <h3 className="mt-4 font-semibold text-slate-900">
                No company users found
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Add an authorised company
                user to begin configuring
                access.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => {
              const busy =
                busyUserId === user.id;

              return (
                <div
                  key={user.id}
                  className="p-5"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                        {initials(
                          user.fullName,
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-slate-900">
                            {
                              user.fullName
                            }
                          </p>

                          <StatusBadge
                            active={
                              user.isActive
                            }
                          />
                        </div>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {user.email}
                        </p>

                        <p className="mt-2 text-xs font-semibold text-indigo-600">
                          {roleLabel(
                            user.role,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">
                          Role
                        </span>

                        <select
                          disabled={busy}
                          value={user.role}
                          onChange={(
                            event,
                          ) =>
                            void handleRoleChange(
                              user,
                              event.target
                                .value as CompanyUserRole,
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                        >
                          {roles.map(
                            (
                              option,
                            ) => (
                              <option
                                key={
                                  option.value
                                }
                                value={
                                  option.value
                                }
                              >
                                {
                                  option.label
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <button
                        disabled={busy}
                        onClick={() =>
                          void handleStatusChange(
                            user,
                          )
                        }
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                          user.isActive
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {busy
                          ? 'Updating…'
                          : user.isActive
                            ? 'Deactivate'
                            : 'Activate'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-slate-900">
          Access control
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Roles provide the standard DeluxHR
          access preset. Granular permissions
          and data scopes are managed
          separately and remain protected by
          DeluxHR's access-control rules.
        </p>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        highlight
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
        active
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-slate-100 text-slate-500'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0][0]
      ?.toUpperCase() ?? 'U';
  }

  return `${parts[0][0] ?? ''}${
    parts[parts.length - 1][0] ?? ''
  }`.toUpperCase();
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}

        {required && (
          <span className="ml-1 text-rose-500">
            *
          </span>
        )}
      </span>

      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />

      {hint && (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {hint}
        </p>
      )}
    </label>
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
