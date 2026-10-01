"use client";
import { useState } from "react";
import { Card } from "../leave/ui";
import * as api from "../../lib/customer-onboarding-api";
import {
  SetupForm,
  KnownId,
  useSetup,
  string,
  numeric,
  employeeOptions,
  refreshed,
} from "./common";
export function ConfirmStep({
  step,
  title,
}: {
  step: api.ConfirmationStep;
  title: string;
}) {
  const setup = useSetup();
  return (
    <SetupForm
      title={title}
      description="Confirm only after checking all applicable records. A confirmation does not create balances, payroll profiles or bank approvals. Opening confirmations must be repeated after later employee imports."
      fields={[
        {
          name: "note",
          label: "Review note (optional)",
          type: "textarea",
          maxLength: 500,
        },
      ]}
      confirm={`Confirm ${title.toLowerCase()} has been reviewed for this company?`}
      save={async (d) => {
        await api.setupConfirm(step, string(d, "note") || undefined);
        await refreshed(setup.refresh);
      }}
    />
  );
}
export function LeaveSetup() {
  const setup = useSetup(),
    [created, setCreated] = useState<api.SetupOption[]>([]);
  async function add(kind: "leaveTypes" | "policies", item: api.SetupOption) {
    setup.remember(kind, [item]);
    setCreated((old) => [item, ...old]);
    await refreshed(setup.refresh);
  }
  return (
    <>
      <SetupForm
        title="Leave type"
        fields={[{ name: "name", label: "Leave type name", required: true }]}
        save={async (d) =>
          add("leaveTypes", await api.setupLeaveType(string(d, "name")))
        }
      />
      <SetupForm
        title="Leave policy"
        description="Weekdays use Monday=1 through Sunday=7. A default active policy is required when the subscription includes leave."
        fields={[
          { name: "code", label: "Policy code", required: true, maxLength: 40 },
          {
            name: "name",
            label: "Policy name",
            required: true,
            maxLength: 120,
          },
          {
            name: "isDefault",
            label: "Default policy",
            type: "checkbox",
            value: true,
          },
          {
            name: "annualEntitlementDays",
            label: "Annual entitlement (days)",
            type: "number",
            required: true,
            min: 0,
            max: 365,
            step: 0.01,
            value: 15,
          },
          {
            name: "accrualMode",
            label: "Accrual mode",
            type: "select",
            required: true,
            options: ["ANNUAL_UPFRONT", "MONTHLY"],
            value: "ANNUAL_UPFRONT",
          },
          {
            name: "carryOverMaxDays",
            label: "Carry-over maximum (days)",
            type: "number",
            required: true,
            min: 0,
            max: 365,
            step: 0.01,
            value: 0,
          },
          {
            name: "carryOverExpiryMonths",
            label: "Carry-over expiry months",
            type: "number",
            required: true,
            min: 0,
            max: 12,
            value: 0,
          },
          {
            name: "maxNegativeDays",
            label: "Negative balance allowance (days)",
            type: "number",
            required: true,
            min: 0,
            max: 365,
            step: 0.01,
            value: 0,
          },
          {
            name: "probationMonths",
            label: "Probation months",
            type: "number",
            required: true,
            min: 0,
            max: 120,
            value: 0,
          },
          {
            name: "workingWeekdays",
            label: "Working weekdays (comma-separated)",
            required: true,
            value: "1,2,3,4,5",
          },
          {
            name: "excludePublicHolidays",
            label: "Exclude public holidays",
            type: "checkbox",
            value: true,
          },
          {
            name: "supportingDocumentRequired",
            label: "Require supporting document",
            type: "checkbox",
          },
          {
            name: "medicalCertificateAfterDays",
            label: "Medical certificate threshold (optional)",
            type: "number",
            min: 1,
            max: 366,
          },
        ]}
        save={async (d) => {
          const weekdays = string(d, "workingWeekdays")
            .split(",")
            .map((s) => Number(s.trim()));
          if (
            !weekdays.length ||
            weekdays.length > 7 ||
            new Set(weekdays).size !== weekdays.length ||
            weekdays.some((n) => !Number.isInteger(n) || n < 1 || n > 7)
          )
            throw new Error("Choose unique weekdays from 1 to 7.");
          const threshold = string(d, "medicalCertificateAfterDays");
          await add(
            "policies",
            await api.setupLeavePolicy({
              leaveTypeId: string(d, "leaveTypeId"),
              code: string(d, "code"),
              name: string(d, "name"),
              isDefault: d.get("isDefault") === "on",
              annualEntitlementDays: numeric(d, "annualEntitlementDays"),
              accrualMode: string(d, "accrualMode") as
                | "ANNUAL_UPFRONT"
                | "MONTHLY",
              carryOverMaxDays: numeric(d, "carryOverMaxDays"),
              carryOverExpiryMonths: numeric(d, "carryOverExpiryMonths"),
              maxNegativeDays: numeric(d, "maxNegativeDays"),
              probationMonths: numeric(d, "probationMonths"),
              workingWeekdays: weekdays,
              excludePublicHolidays: d.get("excludePublicHolidays") === "on",
              supportingDocumentRequired:
                d.get("supportingDocumentRequired") === "on",
              medicalCertificateAfterDays: threshold
                ? Number(threshold)
                : undefined,
            }),
          );
        }}
      >
        <KnownId
          name="leaveTypeId"
          label="Leave type"
          items={setup.choices.leaveTypes}
        />
      </SetupForm>
      <SetupForm
        title="Assign employee policy"
        description="The end date is exclusive. Overlapping assignments are rejected by the API."
        fields={[
          {
            name: "effectiveFrom",
            label: "Effective from",
            type: "date",
            required: true,
          },
          {
            name: "effectiveTo",
            label: "Exclusive end date (optional)",
            type: "date",
          },
        ]}
        save={async (d) => {
          const from = string(d, "effectiveFrom"),
            to = string(d, "effectiveTo");
          if (to && to <= from)
            throw new Error("End date must be later than the start date.");
          await api.setupLeaveAssignment({
            employeeId: string(d, "employeeId"),
            policyId: string(d, "policyId"),
            effectiveFrom: from,
            effectiveTo: to || undefined,
          });
        }}
      >
        <KnownId
          name="employeeId"
          label="Employee"
          items={employeeOptions(setup.choices.employees)}
        />
        <KnownId
          name="policyId"
          label="Policy"
          items={setup.choices.policies}
        />
      </SetupForm>
      <SetupForm
        title="Public holiday"
        fields={[
          {
            name: "name",
            label: "Holiday name",
            required: true,
            maxLength: 120,
          },
          { name: "date", label: "Date", type: "date", required: true },
        ]}
        save={async (d) => {
          await api.setupHoliday({
            name: string(d, "name"),
            date: string(d, "date"),
          });
          await refreshed(setup.refresh);
        }}
      />
      <ConfirmStep step="PUBLIC_HOLIDAYS" title="Public holiday review" />
      {created.length > 0 && (
        <Card title="Created leave records">
          <ul className="space-y-3">
            {created.map((c) => (
              <li key={c.id} className="break-all">
                {c.name} · {c.id}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
export function OpeningLeave() {
  const setup = useSetup();
  return (
    <>
      <SetupForm
        title="Opening leave balance"
        description="This adds an OPENING adjustment; it does not replace prior adjustments. Record only the amount needed after reviewing existing balances and policy accrual. Zero balances need no adjustment."
        fields={[
          {
            name: "days",
            label: "Opening adjustment days",
            type: "number",
            required: true,
            min: 0.01,
            max: 365,
            step: 0.01,
          },
          {
            name: "effectiveDate",
            label: "Effective date",
            type: "date",
            required: true,
          },
          {
            name: "reason",
            label: "Reason",
            type: "textarea",
            required: true,
            maxLength: 500,
          },
        ]}
        confirm="Record this opening adjustment? Repeating it adds another adjustment."
        save={async (d) => {
          await api.setupOpeningLeave({
            employeeId: string(d, "employeeId"),
            leaveTypeId: string(d, "leaveTypeId"),
            days: numeric(d, "days"),
            effectiveDate: string(d, "effectiveDate"),
            reason: string(d, "reason"),
          });
        }}
      >
        <KnownId
          name="employeeId"
          label="Employee"
          items={employeeOptions(setup.choices.employees)}
        />
        <KnownId
          name="leaveTypeId"
          label="Leave type"
          items={setup.choices.leaveTypes}
        />
      </SetupForm>
      <ConfirmStep step="OPENING_LEAVE" title="Opening leave review" />
    </>
  );
}
