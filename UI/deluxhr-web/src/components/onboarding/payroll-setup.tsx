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
  values,
  employeeOptions,
  refreshed,
} from "./common";
import { ConfirmStep } from "./leave-setup";
export function PayrollSetup() {
  const setup = useSetup(),
    [payment, setPayment] = useState<api.PaymentDetail | null>(null);
  return (
    <>
      <Card title="Bank approval requirement">
        <p className="text-sm">
          During pending-company onboarding, a different active COMPANY_ADMIN in
          the same company may approve another active company administrator’s
          bank submission with their own password. Share the employee and
          pending payment-detail IDs with that checker. The requester cannot
          approve their own submission. After company activation, normal
          HR/PAYROLL checker rules apply.
        </p>
      </Card>
      <SetupForm
        title="Company payroll settings"
        description="Choose the payroll cycle, statutory registration settings and approval mode for this company."
        fields={[
          {
            name: "payFrequency",
            label: "Pay frequency",
            type: "select",
            required: true,
            options: ["WEEKLY", "FORTNIGHTLY", "MONTHLY"],
          },
          {
            name: "approvalMode",
            label: "Payroll approval mode",
            type: "select",
            required: true,
            options: ["SINGLE_APPROVER", "MAKER_CHECKER"],
          },
          { name: "uifRegistered", label: "UIF registered", type: "checkbox" },
          { name: "sdlApplicable", label: "SDL applicable", type: "checkbox" },
        ]}
        confirm="Apply these payroll settings to the company?"
        save={async (d) => {
          await api.setupPayrollSettings({
            payFrequency: string(d, "payFrequency"),
            approvalMode: string(d, "approvalMode"),
            uifRegistered: d.get("uifRegistered") === "on",
            sdlApplicable: d.get("sdlApplicable") === "on",
          });
          await refreshed(setup.refresh);
        }}
      />
      <SetupForm
        title="Opening employee payroll profile"
        description="Enter salary/rate in rand. Blank fields remain unchanged. This endpoint configures payroll profiles; it does not import historical payroll or year-to-date tax totals."
        fields={[
          { name: "taxNumber", label: "Employee tax number (optional)" },
          {
            name: "dateOfBirth",
            label: "Date of birth (optional)",
            type: "date",
          },
          {
            name: "basicSalary",
            label: "Basic salary (rand)",
            type: "number",
            min: 0,
            step: 0.01,
          },
          {
            name: "pensionableSalary",
            label: "Pensionable salary (rand)",
            type: "number",
            min: 0,
            step: 0.01,
          },
          {
            name: "hourlyRate",
            label: "Hourly rate (rand)",
            type: "number",
            min: 0,
            step: 0.01,
          },
          {
            name: "payFrequency",
            label: "Pay frequency (optional)",
            type: "select",
            options: ["WEEKLY", "FORTNIGHTLY", "MONTHLY"],
          },
          {
            name: "medicalAidDependants",
            label: "Medical aid dependants (optional)",
            type: "number",
            min: 0,
          },
        ]}
        save={async (d) => {
          const p: Record<string, string | number> = values(d),
            id = String(p.employeeId);
          delete p.employeeId;
          for (const k of [
            "basicSalary",
            "pensionableSalary",
            "hourlyRate",
            "medicalAidDependants",
          ])
            if (string(d, k)) p[k] = numeric(d, k);
          if (!Object.keys(p).length)
            throw new Error("Enter at least one payroll profile value.");
          await api.setupPayrollProfile(id, p);
          await refreshed(setup.refresh);
        }}
      >
        <KnownId
          name="employeeId"
          label="Employee"
          items={employeeOptions(setup.choices.employees)}
        />
      </SetupForm>
      <SetupForm
        title="Submit employee payment details"
        description="Submitting creates a pending bank-detail version. A different permitted user must review and approve it with their own password."
        fields={[
          {
            name: "bankName",
            label: "Bank name",
            required: true,
            maxLength: 100,
          },
          {
            name: "accountHolderName",
            label: "Account holder",
            required: true,
            maxLength: 150,
          },
          {
            name: "accountNumber",
            label: "Account number",
            required: true,
            maxLength: 50,
          },
          {
            name: "branchCode",
            label: "Branch code (optional)",
            maxLength: 20,
          },
          {
            name: "accountType",
            label: "Account type (optional)",
            maxLength: 50,
          },
          {
            name: "changeReason",
            label: "Reason (optional)",
            type: "textarea",
            maxLength: 500,
          },
        ]}
        save={async (d) => {
          const p = values(d),
            id = p.employeeId;
          delete p.employeeId;
          setPayment(await api.setupPayment(id, p));
          await refreshed(setup.refresh);
        }}
      >
        <KnownId
          name="employeeId"
          label="Employee"
          items={employeeOptions(setup.choices.employees)}
        />
      </SetupForm>
      {payment && (
        <Card title="Submitted bank details">
          <p className="break-all">Employee: {payment.employeeId}</p>
          <p className="break-all">Payment-detail ID: {payment.id}</p>
          <p>
            {payment.bankName} · {payment.maskedAccountNumber} ·{" "}
            {payment.status}
          </p>
          <p className="text-sm">
            Give these IDs to the independent checker. Account numbers are shown
            masked.
          </p>
        </Card>
      )}
      <SetupForm
        title="Approve employee payment details"
        description="Sign in as a different permitted checker. The API enforces maker/checker roles and password verification. Approval replaces any previously approved bank-detail version."
        fields={[
          {
            name: "paymentDetailId",
            label: "Pending payment-detail ID",
            required: true,
            pattern:
              "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
          },
          {
            name: "password",
            label: "Your current password",
            type: "password",
            required: true,
            maxLength: 200,
          },
        ]}
        confirm="Approve this pending bank-detail version after independent review?"
        save={async (d) => {
          setPayment(
            await api.setupApprovePayment(
              string(d, "employeeId"),
              string(d, "paymentDetailId"),
              String(d.get("password") ?? ""),
            ),
          );
          await refreshed(setup.refresh);
        }}
      >
        <KnownId
          name="employeeId"
          label="Employee"
          items={employeeOptions(setup.choices.employees)}
        />
      </SetupForm>
      <ConfirmStep step="OPENING_PAYROLL" title="Opening payroll review" />
    </>
  );
}
