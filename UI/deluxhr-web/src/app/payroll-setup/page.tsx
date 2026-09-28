'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  assignEmployeeBenefit,
  assignEmployeeDeduction,
  createBenefitPlan,
  createPayrollDeduction,
  getBenefitPlans,
  getPayrollDeductions,
  getPayrollProfiles,
  getPayrollSettings,
  updatePayrollProfile,
  updatePayrollSettings,
  type BenefitPlan,
  type ContributionMethod,
  type PayrollDeductionDefinition,
  type PayrollProfileEmployee,
  type PayrollSettings,
} from '../../lib/api';

const money = (n: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(n || 0);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export default function PayrollSetup() {
  const [settings, setSettings] =
    useState<PayrollSettings | null>(null);

  const [employees, setEmployees] =
    useState<PayrollProfileEmployee[]>([]);

  const [benefits, setBenefits] =
    useState<BenefitPlan[]>([]);

  const [deductions, setDeductions] =
    useState<PayrollDeductionDefinition[]>([]);

  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const s =
      (await getPayrollSettings()) as PayrollSettings;

    const e =
      (await getPayrollProfiles()) as PayrollProfileEmployee[];

    const b =
      (await getBenefitPlans()) as BenefitPlan[];

    const d =
      (await getPayrollDeductions()) as PayrollDeductionDefinition[];

    setSettings(s);
    setEmployees(e);
    setBenefits(b);
    setDeductions(d);

    setSelected((current) => {
      if (
        current &&
        e.some(
          (employee: PayrollProfileEmployee) =>
            employee.id === current,
        )
      ) {
        return current;
      }

      return e[0]?.id ?? '';
    });
  };

  useEffect(() => {
    load().catch((err) => {
      setError(getErrorMessage(err));
    });
  }, []);

  const employee = employees.find(
    (e) => e.id === selected,
  );

  async function saveSettings() {
    if (!settings) return;

    setMessage('');
    setError('');

    try {
      await updatePayrollSettings({
        payFrequency: settings.payFrequency,
        uifRegistered: settings.uifRegistered,
        sdlApplicable: settings.sdlApplicable,
        approvalMode: settings.approvalMode,
      });

      setMessage('Payroll settings saved.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function saveProfile(fd: FormData) {
    if (!employee) {
      throw new Error('Please select an employee.');
    }

    await updatePayrollProfile(employee.id, {
      taxNumber: String(fd.get('taxNumber') || ''),
      dateOfBirth:
        String(fd.get('dateOfBirth') || '') || undefined,
      basicSalary: Number(
        fd.get('basicSalary') || 0,
      ),
      pensionableSalary:
        Number(
          fd.get('pensionableSalary') || 0,
        ) || undefined,
      hourlyRate:
        Number(fd.get('hourlyRate') || 0) || undefined,
      payFrequency: String(
        fd.get('payFrequency'),
      ) as any,
      bankName: String(fd.get('bankName') || ''),
      bankAccountHolder: String(
        fd.get('bankAccountHolder') || '',
      ),
      bankAccountNumber: String(
        fd.get('bankAccountNumber') || '',
      ),
      bankBranchCode: String(
        fd.get('bankBranchCode') || '',
      ),
      bankAccountType: String(
        fd.get('bankAccountType') || '',
      ),
      medicalAidDependants: Number(
        fd.get('medicalAidDependants') || 0,
      ),
    });

    await load();
  }

  async function addBenefit(fd: FormData) {
    await createBenefitPlan({
      name: String(fd.get('name')),
      type: String(fd.get('type')) as any,
      providerName: String(
        fd.get('providerName') || '',
      ),
      employeeMethod: String(
        fd.get('employeeMethod'),
      ) as ContributionMethod,
      employeeValue: Number(
        fd.get('employeeValue') || 0,
      ),
      employerMethod: String(
        fd.get('employerMethod'),
      ) as ContributionMethod,
      employerValue: Number(
        fd.get('employerValue') || 0,
      ),
      contributionBasis: String(
        fd.get('basis'),
      ) as any,
    });

    await load();
  }

  async function addDeduction(fd: FormData) {
    await createPayrollDeduction({
      name: String(fd.get('name')),
      creditorName: String(
        fd.get('creditorName') || '',
      ),
    });

    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-600">
          Payroll foundation
        </p>

        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Payroll Setup
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Configure only what applies to this employer.
          Pension, provident funds, medical aid and other
          benefits are optional and can differ by employee.
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {settings && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">
            Employer payroll settings
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Pay frequency">
              <select
                className="input"
                value={settings.payFrequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    payFrequency:
                      e.target.value as PayrollSettings['payFrequency'],
                  })
                }
              >
                <option value="MONTHLY">
                  MONTHLY
                </option>

                <option value="FORTNIGHTLY">
                  FORTNIGHTLY
                </option>

                <option value="WEEKLY">
                  WEEKLY
                </option>
              </select>
            </Field>

            <Toggle
              label="UIF registered"
              checked={settings.uifRegistered}
              onChange={(v: boolean) =>
                setSettings({
                  ...settings,
                  uifRegistered: v,
                })
              }
            />

            <Toggle
              label="SDL applicable"
              checked={settings.sdlApplicable}
              onChange={(v: boolean) =>
                setSettings({
                  ...settings,
                  sdlApplicable: v,
                })
              }
            />

            <Field label="Payroll approval">
              <select
                className="input"
                value={settings.approvalMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    approvalMode:
                      e.target
                        .value as PayrollSettings['approvalMode'],
                  })
                }
              >
                <option value="SINGLE_APPROVER">
                  Single approver
                </option>

                <option value="MAKER_CHECKER">
                  Maker / checker
                </option>
              </select>
            </Field>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Save employer settings
          </button>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            setMessage('');
            setError('');

            const form = event.currentTarget;

            try {
              await addBenefit(
                new FormData(form),
              );

              form.reset();

              setMessage(
                'Optional benefit created.',
              );
            } catch (err) {
              setError(
                getErrorMessage(err),
              );
            }
          }}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2 className="font-semibold">
            Optional benefits
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Create only benefits offered by this employer.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              name="name"
              label="Plan name"
              required
            />

            <Input
              name="providerName"
              label="Provider"
            />

            <Select
              name="type"
              label="Type"
              options={[
                'RETIREMENT_FUND',
                'MEDICAL_AID',
                'OTHER',
              ]}
            />

            <Select
              name="basis"
              label="Contribution basis"
              options={[
                'BASIC_SALARY',
                'PENSIONABLE_SALARY',
                'CUSTOM',
              ]}
            />

            <Select
              name="employeeMethod"
              label="Employee contribution"
              options={[
                'NONE',
                'FIXED_AMOUNT',
                'PERCENTAGE',
              ]}
            />

            <Input
              name="employeeValue"
              label="Employee value"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />

            <Select
              name="employerMethod"
              label="Employer contribution"
              options={[
                'NONE',
                'FIXED_AMOUNT',
                'PERCENTAGE',
              ]}
            />

            <Input
              name="employerValue"
              label="Employer value"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </div>

          <button
            type="submit"
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Add benefit
          </button>

          <div className="mt-4 space-y-2">
            {benefits.map((b) => (
              <div
                key={b.id}
                className="rounded-xl bg-slate-50 p-3 text-sm"
              >
                <b>{b.name}</b> ·{' '}
                {b.type.replaceAll('_', ' ')}

                <div className="text-xs text-slate-500">
                  Employee {b.employeeMethod}{' '}
                  {b.employeeValue} · Employer{' '}
                  {b.employerMethod}{' '}
                  {b.employerValue}
                </div>
              </div>
            ))}

            {!benefits.length && (
              <p className="text-sm text-slate-400">
                No benefits configured — this is valid.
              </p>
            )}
          </div>
        </form>

        <form
          onSubmit={async (event) => {
            event.preventDefault();

            setMessage('');
            setError('');

            const form = event.currentTarget;

            try {
              await addDeduction(
                new FormData(form),
              );

              form.reset();

              setMessage(
                'Deduction type created.',
              );
            } catch (err) {
              setError(
                getErrorMessage(err),
              );
            }
          }}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2 className="font-semibold">
            Optional deductions
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Garnishees, union fees, loans or other
            employer-specific deductions.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              name="name"
              label="Deduction name"
              required
            />

            <Input
              name="creditorName"
              label="Creditor / recipient"
            />
          </div>

          <button
            type="submit"
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Add deduction
          </button>

          <div className="mt-4 space-y-2">
            {deductions.map((d) => (
              <div
                key={d.id}
                className="rounded-xl bg-slate-50 p-3 text-sm"
              >
                <b>{d.name}</b>

                <div className="text-xs text-slate-500">
                  {d.creditorName ||
                    'No external creditor'}
                </div>
              </div>
            ))}

            {!deductions.length && (
              <p className="text-sm text-slate-400">
                No optional deductions configured.
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">
              Employee payroll profiles
            </h2>

            <p className="text-sm text-slate-500">
              Benefits are assigned per employee; nothing
              is assumed.
            </p>
          </div>

          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setMessage('');
              setError('');
            }}
            className="input md:w-72"
          >
            {employees.map(
              (
                payrollEmployee: PayrollProfileEmployee,
              ) => (
                <option
                  key={payrollEmployee.id}
                  value={payrollEmployee.id}
                >
                  {payrollEmployee.firstName}{' '}
                  {payrollEmployee.lastName}
                </option>
              ),
            )}
          </select>
        </div>

        {employee && (
          <EmployeeForm
            key={employee.id}
            employee={employee}
            benefits={benefits}
            deductions={deductions}
            save={saveProfile}
            onSuccess={() => {
              setError('');
              setMessage(
                'Employee payroll profile saved.',
              );
            }}
            onError={(err: unknown) => {
              setMessage('');
              setError(
                getErrorMessage(err),
              );
            }}
            assignBenefit={async (
              id: string,
            ) => {
              setMessage('');
              setError('');

              try {
                await assignEmployeeBenefit(
                  employee.id,
                  {
                    benefitPlanId: id,
                  },
                );

                await load();

                setMessage(
                  'Benefit assigned.',
                );
              } catch (err) {
                setError(
                  getErrorMessage(err),
                );
              }
            }}
            assignDeduction={async (
              id: string,
              method: ContributionMethod,
              value: number,
            ) => {
              setMessage('');
              setError('');

              try {
                await assignEmployeeDeduction(
                  employee.id,
                  {
                    deductionDefinitionId:
                      id,
                    method,
                    value,
                  },
                );

                await load();

                setMessage(
                  'Deduction assigned.',
                );
              } catch (err) {
                setError(
                  getErrorMessage(err),
                );
              }
            }}
          />
        )}
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 0.65rem 0.8rem;
          font-size: 0.875rem;
          background: white;
        }
      `}</style>
    </div>
  );
}

function EmployeeForm({
  employee,
  benefits,
  deductions,
  save,
  onSuccess,
  onError,
  assignBenefit,
  assignDeduction,
}: any) {
  const p = employee.payrollProfile;

  const [saving, setSaving] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) return;

    const form = event.currentTarget;

    setSaving(true);

    try {
      const formData =
        new FormData(form);

      await save(formData);

      onSuccess();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5">
      <form
        onSubmit={handleSubmit}
        className="grid gap-3 md:grid-cols-3"
      >
        <Input
          name="taxNumber"
          label="Tax number"
          defaultValue={
            p?.taxNumber || ''
          }
        />

        <Input
          name="dateOfBirth"
          label="Date of birth (for PAYE rebates)"
          type="date"
          defaultValue={
            p?.dateOfBirth
              ? p.dateOfBirth.slice(0, 10)
              : ''
          }
        />

        <Input
          name="basicSalary"
          label="Basic salary"
          type="number"
          min="0"
          step="0.01"
          defaultValue={
            p?.basicSalary || 0
          }
        />

        <Input
          name="pensionableSalary"
          label="Pensionable salary (optional)"
          type="number"
          min="0"
          step="0.01"
          defaultValue={
            p?.pensionableSalary || ''
          }
        />

        <Input
          name="hourlyRate"
          label="Hourly rate (optional)"
          type="number"
          min="0"
          step="0.01"
          defaultValue={
            p?.hourlyRate || ''
          }
        />

        <Select
          name="payFrequency"
          label="Pay frequency"
          options={[
            'MONTHLY',
            'FORTNIGHTLY',
            'WEEKLY',
          ]}
          defaultValue={
            p?.payFrequency ||
            'MONTHLY'
          }
        />

        <Input
          name="medicalAidDependants"
          label="Medical aid dependants"
          type="number"
          min="0"
          step="1"
          defaultValue={
            p?.medicalAidDependants || 0
          }
        />

        <Input
          name="bankName"
          label="Bank"
          defaultValue={
            p?.bankName || ''
          }
        />

        <Input
          name="bankAccountHolder"
          label="Account holder"
          defaultValue={
            p?.bankAccountHolder || ''
          }
        />

        <Input
          name="bankAccountNumber"
          label="Account number"
          defaultValue={
            p?.bankAccountNumber || ''
          }
        />

        <Input
          name="bankBranchCode"
          label="Branch code"
          defaultValue={
            p?.bankBranchCode || ''
          }
        />

        <Input
          name="bankAccountType"
          label="Account type"
          defaultValue={
            p?.bankAccountType || ''
          }
        />

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Saving...'
              : 'Save payroll profile'}
          </button>
        </div>
      </form>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <b className="text-sm">
            Assigned benefits
          </b>

          <div className="mt-2 space-y-2">
            {p?.benefits?.map(
              (x: any) => (
                <div
                  key={x.id}
                  className="text-sm"
                >
                  ✓{' '}
                  {x.benefitPlan.name}
                </div>
              ),
            ) || null}
          </div>

          <select
            onChange={(e) => {
              if (e.target.value) {
                assignBenefit(
                  e.target.value,
                );
              }

              e.target.value = '';
            }}
            defaultValue=""
            className="input mt-3"
          >
            <option value="">
              + Assign optional benefit
            </option>

            {benefits
              .filter(
                (b: BenefitPlan) =>
                  !p?.benefits?.some(
                    (x: any) =>
                      x.benefitPlan
                        .id === b.id,
                  ),
              )
              .map(
                (b: BenefitPlan) => (
                  <option
                    key={b.id}
                    value={b.id}
                  >
                    {b.name}
                  </option>
                ),
              )}
          </select>
        </div>

        <DeductionAssign
          deductions={deductions}
          assigned={
            p?.deductions || []
          }
          assign={assignDeduction}
        />
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        Current basic salary:{' '}
        <b>
          {money(
            p?.basicSalary || 0,
          )}
        </b>
        {' · '}
        Bank verification:{' '}
        <b>
          {p?.bankVerificationStatus ||
            'NOT_VERIFIED'}
        </b>
      </div>
    </div>
  );
}

function DeductionAssign({
  deductions,
  assigned,
  assign,
}: any) {
  const [id, setId] =
    useState('');

  const [method, setMethod] =
    useState<ContributionMethod>(
      'FIXED_AMOUNT',
    );

  const [value, setValue] =
    useState(0);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <b className="text-sm">
        Assigned deductions
      </b>

      <div className="mt-2 space-y-2">
        {assigned.map(
          (x: any) => (
            <div
              key={x.id}
              className="text-sm"
            >
              ✓{' '}
              {
                x.deductionDefinition
                  .name
              }
              : {x.method}{' '}
              {x.value}
            </div>
          ),
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <select
          className="input"
          value={id}
          onChange={(e) =>
            setId(e.target.value)
          }
        >
          <option value="">
            Deduction
          </option>

          {deductions.map(
            (
              d: PayrollDeductionDefinition,
            ) => (
              <option
                key={d.id}
                value={d.id}
              >
                {d.name}
              </option>
            ),
          )}
        </select>

        <select
          className="input"
          value={method}
          onChange={(e) =>
            setMethod(
              e.target
                .value as ContributionMethod,
            )
          }
        >
          <option value="FIXED_AMOUNT">
            FIXED_AMOUNT
          </option>

          <option value="PERCENTAGE">
            PERCENTAGE
          </option>
        </select>

        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) =>
            setValue(
              Number(
                e.target.value,
              ),
            )
          }
        />
      </div>

      <button
        type="button"
        onClick={() => {
          if (id) {
            assign(
              id,
              method,
              value,
            );
          }
        }}
        className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold"
      >
        Assign deduction
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: any) {
  return (
    <label className="text-sm font-medium text-slate-700">
      <span className="mb-1 block">
        {label}
      </span>

      {children}
    </label>
  );
}

function Input(p: any) {
  const {
    label,
    ...rest
  } = p;

  return (
    <Field label={label}>
      <input
        className="input"
        {...rest}
      />
    </Field>
  );
}

function Select({
  label,
  options,
  ...rest
}: any) {
  return (
    <Field label={label}>
      <select
        className="input"
        {...rest}
      >
        {options.map(
          (o: string) => (
            <option
              key={o}
              value={o}
            >
              {o}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: any) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          onChange(
            e.target.checked,
          )
        }
      />

      <span>{label}</span>
    </label>
  );
}