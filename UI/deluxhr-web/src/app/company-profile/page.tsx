'use client';

import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  getCurrentOrganization,
  updateCurrentOrganizationProfile,
  type OrganizationProfile,
} from '../../lib/api';

type FormState = {
  name: string;
  legalName: string;
  registrationNumber: string;
  taxNumber: string;
  email: string;
  phoneNumber: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timezone: string;
};

const emptyForm: FormState = {
  name: '',
  legalName: '',
  registrationNumber: '',
  taxNumber: '',
  email: '',
  phoneNumber: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'South Africa',
  timezone: 'Africa/Johannesburg',
};

function toForm(
  organization: OrganizationProfile,
): FormState {
  return {
    name: organization.name ?? '',
    legalName: organization.legalName ?? '',
    registrationNumber:
      organization.registrationNumber ?? '',
    taxNumber: organization.taxNumber ?? '',
    email: organization.email ?? '',
    phoneNumber:
      organization.phoneNumber ?? '',
    website: organization.website ?? '',
    addressLine1:
      organization.addressLine1 ?? '',
    addressLine2:
      organization.addressLine2 ?? '',
    city: organization.city ?? '',
    province: organization.province ?? '',
    postalCode:
      organization.postalCode ?? '',
    country:
      organization.country ?? 'South Africa',
    timezone:
      organization.timezone ??
      'Africa/Johannesburg',
  };
}

export default function CompanyProfilePage() {
  const [form, setForm] =
    useState<FormState>(emptyForm);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setIsLoading(true);
      setError('');

      const organization =
        await getCurrentOrganization();

      setForm(toForm(organization));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load company profile.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateField(
    field: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    const requiredFields: Array<
      keyof FormState
    > = [
      'name',
      'legalName',
      'email',
      'phoneNumber',
      'addressLine1',
      'city',
      'province',
      'postalCode',
      'country',
      'timezone',
    ];

    const missing = requiredFields.some(
      (field) => !form[field].trim(),
    );

    if (missing) {
      setError(
        'Complete all required company profile fields.',
      );
      return;
    }

    try {
      setIsSaving(true);

      const updated =
        await updateCurrentOrganizationProfile({
          name: form.name.trim(),
          legalName: form.legalName.trim(),
          registrationNumber:
            form.registrationNumber.trim(),
          taxNumber: form.taxNumber.trim(),
          email: form.email.trim(),
          phoneNumber:
            form.phoneNumber.trim(),
          website: form.website.trim(),
          addressLine1:
            form.addressLine1.trim(),
          addressLine2:
            form.addressLine2.trim(),
          city: form.city.trim(),
          province: form.province.trim(),
          postalCode:
            form.postalCode.trim(),
          country: form.country.trim(),
          timezone: form.timezone.trim(),
        });

      setForm(toForm(updated));

      setMessage(
        'Company profile saved successfully. Your onboarding progress will update automatically.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save company profile.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading company profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Company setup
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Company profile
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Add the company information DeluxHR
            needs to establish your workspace.
          </p>
        </div>

        <Link
          href="/onboarding"
          className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          ← Company Setup
        </Link>
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

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <FormSection
          title="Company identity"
          description="Your trading and registered company information."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Trading / display name"
              required
              value={form.name}
              onChange={(value) =>
                updateField('name', value)
              }
              placeholder="e.g. Acme Services"
            />

            <Field
              label="Legal company name"
              required
              value={form.legalName}
              onChange={(value) =>
                updateField(
                  'legalName',
                  value,
                )
              }
              placeholder="e.g. Acme Services (Pty) Ltd"
            />

            <Field
              label="Registration number"
              value={form.registrationNumber}
              onChange={(value) =>
                updateField(
                  'registrationNumber',
                  value,
                )
              }
              placeholder="Company registration number"
            />

            <Field
              label="Tax number"
              value={form.taxNumber}
              onChange={(value) =>
                updateField(
                  'taxNumber',
                  value,
                )
              }
              placeholder="Company tax number"
            />
          </div>
        </FormSection>

        <FormSection
          title="Contact details"
          description="Primary company contact information."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Company email"
              required
              type="email"
              value={form.email}
              onChange={(value) =>
                updateField('email', value)
              }
              placeholder="hr@company.co.za"
            />

            <Field
              label="Phone number"
              required
              value={form.phoneNumber}
              onChange={(value) =>
                updateField(
                  'phoneNumber',
                  value,
                )
              }
              placeholder="+27..."
            />

            <div className="md:col-span-2">
              <Field
                label="Website"
                type="url"
                value={form.website}
                onChange={(value) =>
                  updateField(
                    'website',
                    value,
                  )
                }
                placeholder="https://www.company.co.za"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Company address"
          description="The primary physical or registered business address."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field
                label="Address line 1"
                required
                value={form.addressLine1}
                onChange={(value) =>
                  updateField(
                    'addressLine1',
                    value,
                  )
                }
                placeholder="Street address"
              />
            </div>

            <div className="md:col-span-2">
              <Field
                label="Address line 2"
                value={form.addressLine2}
                onChange={(value) =>
                  updateField(
                    'addressLine2',
                    value,
                  )
                }
                placeholder="Building, unit or suburb"
              />
            </div>

            <Field
              label="City"
              required
              value={form.city}
              onChange={(value) =>
                updateField('city', value)
              }
              placeholder="City"
            />

            <Field
              label="Province"
              required
              value={form.province}
              onChange={(value) =>
                updateField(
                  'province',
                  value,
                )
              }
              placeholder="Province"
            />

            <Field
              label="Postal code"
              required
              value={form.postalCode}
              onChange={(value) =>
                updateField(
                  'postalCode',
                  value,
                )
              }
              placeholder="Postal code"
            />

            <Field
              label="Country"
              required
              value={form.country}
              onChange={(value) =>
                updateField(
                  'country',
                  value,
                )
              }
            />
          </div>
        </FormSection>

        <FormSection
          title="Regional settings"
          description="Used for company dates, payroll periods and operational timestamps."
        >
          <Field
            label="Timezone"
            required
            value={form.timezone}
            onChange={(value) =>
              updateField(
                'timezone',
                value,
              )
            }
            placeholder="Africa/Johannesburg"
          />
        </FormSection>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/onboarding"
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to setup
          </Link>

          <button
            disabled={isSaving}
            type="submit"
            className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? 'Saving…'
              : 'Save company profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 border-b border-slate-100 pb-5">
        <h2 className="text-lg font-semibold text-slate-950">
          {title}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
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
