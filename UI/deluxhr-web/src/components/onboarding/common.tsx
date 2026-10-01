"use client";
import {
  createContext,
  useContext,
  useState,
  useId,
  type ReactNode,
} from "react";
import { Card, Field, Notice, button, control, useAction } from "../leave/ui";
import type {
  SetupOption,
  SetupEmployee,
  SetupPosition,
} from "../../lib/customer-onboarding-api";
export type Choices = {
  positions: SetupPosition[];
  departments: SetupOption[];
  leaveTypes: SetupOption[];
  policies: SetupOption[];
  employees: SetupEmployee[];
};
export const SetupContext = createContext<{
  choices: Choices;
  remember: (
    kind: keyof Choices,
    items: SetupOption[] | SetupEmployee[] | SetupPosition[],
  ) => void;
  refresh: () => Promise<void>;
  pending: boolean;
  reloadChoices?: () => Promise<void>;
  lookupLoading?: boolean;
  lookupError?: string;
} | null>(null);
export function useSetup() {
  const value = useContext(SetupContext);
  if (!value) throw new Error("Setup workspace required");
  return value;
}
export type InputSpec = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "date"
    | "time"
    | "url"
    | "checkbox"
    | "select"
    | "textarea";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  minLength?: number;
  value?: string | number | boolean;
  options?: string[];
  pattern?: string;
  placeholder?: string;
};
export function SetupForm({
  title,
  description,
  fields,
  save,
  children,
  confirm,
  reset = true,
  submitLabel = "Save",
  childrenFirst = false,
}: {
  title: string;
  description?: string;
  fields: InputSpec[];
  save: (data: FormData) => Promise<void>;
  children?: ReactNode;
  confirm?: string;
  reset?: boolean;
  submitLabel?: string;
  childrenFirst?: boolean;
}) {
  const action = useAction();
  return (
    <Card title={title}>
      <p className="mb-4 text-sm text-slate-500">{description}</p>
      <Notice error={action.error} message={action.message} />
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (action.busy) return;
          const form = e.currentTarget,
            data = new FormData(form);
          void action.run(async () => {
            if (confirm && !window.confirm(confirm)) return false;
            try {
              const missing = fields.filter(
                (f) =>
                  f.required &&
                  f.type !== "checkbox" &&
                  !String(data.get(f.name) ?? "").trim(),
              );
              if (missing.length)
                throw new Error(
                  `Complete required fields: ${missing.map((f) => f.label.replace(/ \*$/, "")).join(", ")}.`,
                );
              await save(data);
              if (reset) form.reset();
            } finally {
              for (const field of Array.from(
                form.querySelectorAll<HTMLInputElement>(
                  'input[type="password"],input[name="accountNumber"]',
                ),
              ))
                field.value = "";
              data.delete("password");
              data.delete("accountNumber");
            }
          }, "Saved.");
        }}
      >
        {childrenFirst && children}
        {fields.map((f) => (
          <Field
            key={f.name}
            label={
              f.required && !f.label.endsWith(" *") ? `${f.label} *` : f.label
            }
          >
            {f.type === "checkbox" ? (
              <input name={f.name} type="checkbox" defaultChecked={!!f.value} />
            ) : f.type === "select" ? (
              <select
                className={control}
                name={f.name}
                required={f.required}
                defaultValue={String(f.value ?? "")}
              >
                <option value="">Choose</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                className={control}
                name={f.name}
                required={f.required}
                minLength={f.minLength}
                maxLength={f.maxLength}
                defaultValue={String(f.value ?? "")}
              />
            ) : (
              <input
                className={control}
                name={f.name}
                type={f.type ?? "text"}
                required={f.required}
                min={f.min}
                max={f.max}
                step={f.step}
                minLength={f.minLength}
                maxLength={f.maxLength}
                pattern={f.pattern}
                placeholder={f.placeholder}
                defaultValue={
                  typeof f.value === "boolean" ? undefined : f.value
                }
                autoComplete={
                  f.type === "password" ? "new-password" : undefined
                }
              />
            )}
          </Field>
        ))}
        {!childrenFirst && children}
        <div className="md:col-span-2">
          <button className={button} disabled={action.busy}>
            {action.busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Card>
  );
}
export function KnownId({
  name,
  label,
  items,
}: {
  name: string;
  label: string;
  items: SetupOption[];
}) {
  return (
    <Field label={label.endsWith(" *") ? label : `${label} *`}>
      <select name={name} required className={control} defaultValue="">
        <option value="">Choose {label.toLowerCase()}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export const string = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
export const numeric = (d: FormData, k: string) => {
  const n = Number(string(d, k));
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number.`);
  return n;
};
export const values = (d: FormData) =>
  Object.fromEntries(
    Array.from(d.entries())
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => [k, String(v).trim()]),
  );
export const employeeOptions = (employees: SetupEmployee[]) =>
  employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName} · ${e.email}`,
  }));
export async function refreshed(task: () => Promise<void>) {
  try {
    await task();
  } catch {
    throw new Error(
      "Saved, but readiness refresh failed. Refresh the checklist before repeating this action.",
    );
  }
}
