"use client";
import { useEffect, useState } from "react";
import {
  Card,
  Field,
  Notice,
  button,
  control,
  secondary,
  useAction,
} from "../leave/ui";
import { useSetup, employeeOptions } from "./common";
import { getUser } from "../../lib/auth";
import * as api from "../../lib/customer-onboarding-api";
export function EmployeeDocumentsSetup() {
  const { choices } = useSetup(),
    [employee, setEmployee] = useState(""),
    [documents, setDocuments] = useState<api.SetupDocument[]>([]);
  const action = useAction();
  useEffect(() => {
    let live = true;
    setDocuments([]);
    if (employee)
      void action.run(async () => {
        const docs = await api.setupDocuments(employee);
        if (live) setDocuments(docs);
      });
    return () => {
      live = false;
    };
  }, [employee]);
  async function refresh() {
    setDocuments(await api.setupDocuments(employee));
  }
  return (
    <Card title="Employee document storage">
      <Notice error={action.error} message={action.message} />
      <p className="text-sm text-slate-500">
        Private PDF, PNG or JPEG files, up to 10 MB. Uploads are pending
        verification. A second administrator can download, inspect and verify or
        reject them. Store identity, employment contracts, banking proof and
        other employee records here. Uploading banking proof does not approve
        payment details.
      </p>
      <Field label="Employee">
        <select
          disabled={action.busy}
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          className={control}
        >
          <option value="">Choose employee</option>
          {employeeOptions(choices.employees).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      {employee && (
        <>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form),
                file = d.get("file");
              void action.run(async () => {
                if (!(file instanceof File))
                  throw new Error("Choose a document.");
                await api.setupUploadDocument(employee, file, {
                  documentType: String(d.get("documentType")),
                  issuedAt: String(d.get("issuedAt") ?? ""),
                  expiresAt: String(d.get("expiresAt") ?? ""),
                });
                form.reset();
                await refresh();
              }, "Document uploaded for review.");
            }}
          >
            <Field label="Document type">
              <select name="documentType" className={control}>
                {[
                  "ID_DOCUMENT",
                  "PASSPORT",
                  "EMPLOYMENT_CONTRACT",
                  "PROOF_OF_BANKING",
                  "TAX_DOCUMENT",
                  "QUALIFICATION",
                  "CERTIFICATE",
                  "WORK_PERMIT",
                  "VISA",
                  "MEDICAL_CERTIFICATE",
                  "OTHER",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="File">
              <input
                type="file"
                name="file"
                required
                accept="application/pdf,image/png,image/jpeg"
                className={control}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issued date (optional)">
                <input name="issuedAt" type="date" className={control} />
              </Field>
              <Field label="Expiry (only for document types that support it)">
                <input name="expiresAt" type="date" className={control} />
              </Field>
            </div>
            <button disabled={action.busy} className={button}>
              Upload document
            </button>
          </form>
          <div className="space-y-3">
            {documents.map((d) => (
              <article key={d.id} className="rounded-xl border p-4 space-y-3">
                <p className="font-medium">
                  {d.documentType.replaceAll("_", " ")} · {d.originalFileName}
                </p>
                <p className="text-sm">
                  {d.status} · {d.validityStatus} ·{" "}
                  {(d.fileSizeBytes / 1024).toFixed(1)} KB
                </p>
                <button
                  disabled={action.busy}
                  className={secondary}
                  onClick={() =>
                    void action.run(() =>
                      api.setupDownloadDocument(employee, d),
                    )
                  }
                >
                  Download privately
                </button>
                {d.status === "PENDING_VERIFICATION" &&
                  d.uploadedByUserId !== getUser()?.id && (
                    <>
                      <button
                        disabled={action.busy}
                        className={button}
                        onClick={() =>
                          void action.run(async () => {
                            await api.setupDocumentDecision(
                              employee,
                              d.id,
                              "verify",
                            );
                            await refresh();
                          }, "Document verified.")
                        }
                      >
                        Verify reviewed document
                      </button>
                      <button
                        disabled={action.busy}
                        className={secondary}
                        onClick={() => {
                          const reason = window.prompt(
                            "Reason for rejecting this document:",
                          );
                          if (reason?.trim())
                            void action.run(async () => {
                              await api.setupDocumentDecision(
                                employee,
                                d.id,
                                "reject",
                                reason.trim(),
                              );
                              await refresh();
                            }, "Document rejected.");
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
              </article>
            ))}
            {!documents.length && (
              <p className="text-sm text-slate-500">
                No documents uploaded for this employee.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function CompanyDocumentsSetup() {
  const { choices } = useSetup();
  const [category, setCategory] = useState("REGISTRATION");
  const [group, setGroup] = useState("ALL");
  const [documents, setDocuments] = useState<api.CompanySetupDocument[]>([]);
  const action = useAction();
  async function refresh() {
    setDocuments(await api.setupCompanyDocuments());
  }
  useEffect(() => {
    void action.run(refresh);
  }, []);
  return (
    <Card title="Company compliance & document storage">
      <Notice error={action.error} message={action.message} />
      <p className="text-sm text-slate-500">
        Store company registration, COIDA and PSiRA evidence privately.
        Documents are retained separately from the profile and logo;
        verification records an internal evidence review, not confirmation from
        an external authority. COIDA and PSiRA records are optional for company
        setup and do not automatically block activation.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form),
            file = d.get("file");
          void action.run(async () => {
            if (!(file instanceof File)) throw new Error("Choose a file.");
            await api.setupUploadCompanyDocument(
              file,
              String(d.get("category")),
              Object.fromEntries(
                [
                  "referenceNumber",
                  "issuedAt",
                  "expiresAt",
                  "employeeId",
                  "officerGrade",
                  "assessmentAmount",
                  "assessmentPeriod",
                  "liabilityPeriod",
                ].map((k) => [k, String(d.get(k) ?? "")]),
              ),
            );
            form.reset();
            await refresh();
          }, "Company document uploaded.");
        }}
      >
        <Field label="Category">
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={control}
          >
            {[
              "REGISTRATION",
              "TAX_REGISTRATION",
              "ADDRESS_PROOF",
              "OTHER",
              "COIDA_REGISTRATION",
              "COIDA_GOOD_STANDING",
              "COIDA_ASSESSMENT",
              "PSIRA_BUSINESS_REGISTRATION",
              "PSIRA_GOOD_STANDING",
              "PSIRA_EMPLOYEE_REGISTRATION",
              "PSIRA_FEE_ASSESSMENT",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {(category.startsWith("COIDA_") || category.startsWith("PSIRA_")) && (
          <>
            <Field label="Authority reference / registration number">
              <input
                name="referenceNumber"
                required
                maxLength={100}
                className={control}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date">
                <input
                  name="issuedAt"
                  type="date"
                  required={category.endsWith("GOOD_STANDING")}
                  className={control}
                />
              </Field>
              <Field label="Expiry date (use the certificate)">
                <input
                  name="expiresAt"
                  type="date"
                  required={category.endsWith("GOOD_STANDING")}
                  className={control}
                />
              </Field>
            </div>
            {category === "PSIRA_EMPLOYEE_REGISTRATION" && (
              <>
                <Field label="Employee">
                  <select name="employeeId" required className={control}>
                    <option value="">Choose employee</option>
                    {employeeOptions(choices.employees).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="PSiRA grade">
                  <select name="officerGrade" required className={control}>
                    {["A", "B", "C", "D", "E"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {["COIDA_ASSESSMENT", "PSIRA_FEE_ASSESSMENT"].includes(
              category,
            ) && (
              <>
                <Field label="Assessed amount (ZAR)">
                  <input
                    name="assessmentAmount"
                    type="number"
                    min="0"
                    max="10000000"
                    step="0.01"
                    required
                    className={control}
                  />
                </Field>
                <Field label="Assessment period">
                  <input
                    name="assessmentPeriod"
                    required
                    maxLength={100}
                    className={control}
                  />
                </Field>
                <Field label="Liability month">
                  <input
                    name="liabilityPeriod"
                    type="month"
                    required
                    className={control}
                  />
                </Field>
                <p className="text-sm text-slate-500">
                  Record the authority-issued assessment once. Independent
                  verification adds this employer liability to the selected
                  month's register. It does not calculate fees or mark payment
                  as made. Use Payroll Liabilities &amp; Remittances for payment
                  preparation with an independently approved beneficiary.
                </p>
              </>
            )}
          </>
        )}
        <Field label="PDF, PNG or JPEG, up to 10 MB">
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            name="file"
            required
            className={control}
          />
        </Field>
        <button disabled={action.busy} className={button}>
          Upload company document
        </button>
      </form>
      {documents.some(
        (d) =>
          d.status !== "REJECTED" &&
          ["EXPIRED", "EXPIRING_SOON"].includes(d.validity?.status),
      ) && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">
          Some evidence has expired or expires within 30 days. Review the
          records below; an older retained certificate may have been replaced by
          newer evidence.
        </p>
      )}
      <Field label="Show records">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className={control}
        >
          <option value="ALL">All company records</option>
          <option value="COIDA_">COIDA / Compensation Fund</option>
          <option value="PSIRA_">PSiRA / Security industry</option>
        </select>
      </Field>
      {documents
        .filter((d) => group === "ALL" || d.category.startsWith(group))
        .map((d) => (
          <div key={d.id} className="border-t py-4 space-y-3">
            <p className="font-medium">
              {d.category.replaceAll("_", " ")} · {d.originalFileName}
            </p>
            <p className="text-sm">
              {d.referenceNumber && <>Reference: {d.referenceNumber} · </>}
              {d.officerGrade && (
                <>
                  Grade: {d.officerGrade} · Employee:{" "}
                  {employeeOptions(choices.employees).find(
                    (e) => e.id === d.employeeId,
                  )?.name ?? "Unavailable"}{" "}
                  ·{" "}
                </>
              )}
              {d.issuedAt && <>Issued {d.issuedAt.slice(0, 10)} · </>}
              {d.validity?.status}{" "}
              {d.expiresAt && <> · Expires {d.expiresAt.slice(0, 10)}</>}
              {d.assessmentAmount != null && (
                <>
                  {" "}
                  · ZAR {d.assessmentAmount} · {d.assessmentPeriod} · Liability
                  month {d.liabilityPeriod}
                </>
              )}
            </p>
            <p className="text-sm">
              {d.status} · {(d.fileSizeBytes / 1024).toFixed(1)} KB ·{" "}
              {d.reviewReason}
              {d.reviewedAt && <> · Reviewed {d.reviewedAt.slice(0, 10)}</>}
            </p>
            <button
              disabled={action.busy}
              className={secondary}
              onClick={() =>
                void action.run(() => api.setupDownloadCompanyDocument(d))
              }
            >
              Download privately
            </button>
            {d.status === "PENDING_VERIFICATION" &&
              d.uploadedBy !== getUser()?.id &&
              (["VERIFIED", "REJECTED"] as const).map((status) => (
                <button
                  key={status}
                  disabled={action.busy}
                  className={secondary}
                  onClick={() => {
                    const reason = window.prompt(
                      status === "VERIFIED"
                        ? "Review evidence / reason:"
                        : "Rejection reason:",
                    );
                    if (reason && reason.trim().length >= 3)
                      void action.run(async () => {
                        await api.setupCompanyDocumentDecision(
                          d.id,
                          status,
                          reason.trim(),
                        );
                        await refresh();
                      }, "Review saved.");
                  }}
                >
                  {status === "VERIFIED"
                    ? "Verify reviewed document"
                    : "Reject"}
                </button>
              ))}
          </div>
        ))}
      <button
        disabled={action.busy}
        className={secondary}
        onClick={() => void action.run(refresh)}
      >
        Refresh company documents
      </button>
    </Card>
  );
}
