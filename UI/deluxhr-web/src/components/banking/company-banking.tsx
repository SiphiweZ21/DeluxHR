"use client";
import { useEffect, useState } from "react";
import {
  Card,
  Empty,
  Field,
  Notice,
  Badge,
  button,
  secondary,
  control,
  text,
  useAction,
} from "../leave/ui";
import { RemittanceBeneficiaries } from "../remittances/beneficiaries";
import * as api from "../../lib/company-banking-api";
const label = (s: string) => s.replaceAll("_", " ");
export function CompanyBanking() {
  const [data, setData] = useState<api.BankingWorkspace | null>(null),
    [bank, setBank] = useState("FNB"),
    [adapterId, setAdapterId] = useState("FNB_OBE_CSV"),
    [reviewId, setReviewId] = useState(""),
    [revealed, setRevealed] = useState("");
  const action = useAction();
  async function refresh() {
    setRevealed("");
    setData(await api.getCompanyBanking());
  }
  useEffect(() => {
    void action.run(refresh);
  }, []);
  async function saved() {
    try {
      await refresh();
    } catch {
      throw new Error(
        "Change saved, but the list could not refresh. Refresh before making another change.",
      );
    }
  }
  const adapters = data?.adapters.filter((a) => a.bank === bank) ?? [],
    selected = data?.adapters.find((a) => a.id === adapterId),
    review = data?.profiles.find((p) => p.id === reviewId);
  return (
    <div className="space-y-6">
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer font-medium">
          Remittance beneficiaries & statutory routing
        </summary>
        <div className="mt-4">
          <RemittanceBeneficiaries />
        </div>
      </details>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Banking & payments
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Configure company funding accounts and payment defaults. A different
            company administrator reviews each account.
          </p>
        </div>
        <button
          className={secondary}
          disabled={action.busy}
          onClick={() => void action.run(refresh)}
        >
          Refresh
        </button>
      </div>
      <Notice error={action.error} message={action.message} />
      <Card title="Payment format readiness">
        <p className="text-sm">
          Bank-specific payment exporters are awaiting implementation and bank
          validation. You can approve account configuration and choose defaults
          here; approval does not verify bank compatibility or make a payment.
          Existing generic payroll CSV remains a report.
        </p>
        <p className="text-sm">
          Company profiles fund salaries, ordinary liabilities and repayment to
          DeluxHR. DeluxHR-funded Early Pay payouts use separate platform
          treasury accounts.
        </p>
      </Card>
      {!data ? (
        <Empty>Banking settings have not loaded. Use Refresh to retry.</Empty>
      ) : (
        <>
          <Card title="Add a funding profile">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  d = new FormData(form);
                void action.run(async () => {
                  if (
                    !window.confirm(
                      "Submit this funding account for independent review?",
                    )
                  )
                    return false;
                  try {
                    await api.createBankingProfile({
                      name: text(d, "name"),
                      adapterId,
                      accountHolder: text(d, "accountHolder"),
                      accountNumber: text(d, "accountNumber"),
                      branchCode: text(d, "branchCode"),
                      accountType: text(d, "accountType"),
                      originatorId: text(d, "originatorId") || undefined,
                      ownReference: text(d, "ownReference"),
                      reason: text(d, "reason"),
                    });
                    form.reset();
                    await saved();
                  } finally {
                    const account = form.elements.namedItem(
                      "accountNumber",
                    ) as HTMLInputElement | null;
                    if (account) account.value = "";
                  }
                }, "Funding profile submitted for review.");
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Profile name">
                  <input
                    className={control}
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Monthly salaries"
                  />
                </Field>
                <Field label="Bank">
                  <select
                    className={control}
                    value={bank}
                    onChange={(e) => {
                      setBank(e.target.value);
                      setAdapterId(
                        data.adapters.find((a) => a.bank === e.target.value)
                          ?.id ?? "",
                      );
                    }}
                  >
                    {Array.from(new Set(data.adapters.map((a) => a.bank))).map(
                      (b) => (
                        <option key={b}>{b}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Banking channel and format">
                  <select
                    className={control}
                    value={adapterId}
                    onChange={(e) => setAdapterId(e.target.value)}
                  >
                    {adapters.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.channel} · {a.format}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Account holder">
                  <input
                    className={control}
                    name="accountHolder"
                    autoComplete="off"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </Field>
                <Field label="Funding account number">
                  <input
                    className={control}
                    name="accountNumber"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    pattern="[0-9]{6,20}"
                    minLength={6}
                    maxLength={20}
                  />
                </Field>
                <Field label="Branch code">
                  <input
                    className={control}
                    name="branchCode"
                    inputMode="numeric"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                  />
                </Field>
                <Field label="Account type">
                  <select className={control} name="accountType">
                    <option value="CURRENT">Current</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="TRANSMISSION">Transmission</option>
                  </select>
                </Field>
                <Field label="Originator identifier (if supplied by your bank)">
                  <input
                    className={control}
                    name="originatorId"
                    maxLength={40}
                  />
                </Field>
                <Field label="Own statement reference">
                  <input
                    className={control}
                    name="ownReference"
                    required
                    maxLength={20}
                    placeholder="DELUXHR PAYROLL"
                  />
                </Field>
                <Field label="Reason">
                  <input
                    className={control}
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                  />
                </Field>
              </div>
              {selected && (
                <p className="text-sm text-slate-500">
                  South Africa · ZAR · Specification{" "}
                  {selected.specification.toLowerCase()} · Export not ready.{" "}
                  <a
                    href={selected.source}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 underline"
                  >
                    Official reference
                  </a>
                </p>
              )}
              <button className={button} disabled={action.busy || !adapterId}>
                Submit profile
              </button>
            </form>
          </Card>
          <Card title="Funding profiles">
            {!data.profiles.length ? (
              <Empty>No funding accounts configured.</Empty>
            ) : (
              <div className="space-y-4">
                {data.profiles.map((p) => (
                  <div key={p.id} className="rounded-xl border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      <Badge value={p.status} />
                    </div>
                    <p className="text-sm">
                      {label(p.bank)} · {p.channel} · {p.accountNumberMasked}
                    </p>
                    <p className="text-sm">
                      {p.accountHolder} · Branch {p.branchCode} ·{" "}
                      {p.accountType} · Own reference {p.ownReference}
                    </p>
                    <p className="text-xs text-slate-500">
                      Format version: {p.adapterVersion} · Payment export
                      unavailable
                    </p>
                    {p.decisionReason && (
                      <p className="text-sm">Review: {p.decisionReason}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {p.status === "PENDING_APPROVAL" && (
                        <button
                          className={secondary}
                          disabled={action.busy}
                          onClick={() => {
                            setRevealed("");
                            setReviewId(p.id);
                          }}
                        >
                          Review profile
                        </button>
                      )}
                      {p.status !== "RETIRED" && (
                        <button
                          className={secondary}
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              const reason = window.prompt(
                                "Reason for retiring this profile? Its payment defaults will be cleared.",
                              );
                              if (!reason) return false;
                              if (
                                !window.confirm("Retire this funding profile?")
                              )
                                return false;
                              await api.retireBankingProfile(p.id, reason);
                              if (reviewId === p.id) setReviewId("");
                              await saved();
                            }, "Profile retired and its defaults cleared.")
                          }
                        >
                          Retire
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {review && review.status === "PENDING_APPROVAL" && (
            <Card title={`Review ${review.name}`}>
              <p className="text-sm">
                Verify the funding account against company bank evidence. Sign
                in as a different company administrator from the submitter.
                Approved details are immutable; create a new profile for any
                change.
              </p>
              <form
                key={review.id}
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    d = new FormData(form);
                  void action.run(async () => {
                    if (!window.confirm("Record this independent review?"))
                      return false;
                    try {
                      await api.reviewBankingProfile(
                        review.id,
                        text(d, "decision") as "APPROVED" | "REJECTED",
                        String(d.get("password") ?? ""),
                        text(d, "reason"),
                      );
                      setReviewId("");
                      await saved();
                    } finally {
                      const password = form.elements.namedItem(
                        "password",
                      ) as HTMLInputElement | null;
                      if (password) password.value = "";
                    }
                  }, "Review recorded.");
                }}
              >
                <Field label="Decision">
                  <select className={control} name="decision">
                    <option value="APPROVED">
                      Approve account configuration
                    </option>
                    <option value="REJECTED">Reject</option>
                  </select>
                </Field>
                <Field label="Reason">
                  <input
                    className={control}
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                  />
                </Field>
                <Field label="Your current password">
                  <input
                    className={control}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={200}
                  />
                </Field>
                {revealed && (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="font-mono">Funding account: {revealed}</p>
                    <button
                      type="button"
                      className={secondary + " mt-2"}
                      onClick={() => setRevealed("")}
                    >
                      Hide account
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className={secondary}
                  disabled={action.busy}
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (!form || !form.reportValidity()) return;
                    const d = new FormData(form);
                    void action.run(async () => {
                      setRevealed("");
                      try {
                        const result = await api.inspectBankingProfile(
                          review.id,
                          String(d.get("password") ?? ""),
                          text(d, "reason"),
                        );
                        setRevealed(result.accountNumber);
                      } finally {
                        const password = form.elements.namedItem(
                          "password",
                        ) as HTMLInputElement | null;
                        if (password) password.value = "";
                      }
                    });
                  }}
                >
                  Inspect full account for review
                </button>
                <div className="flex gap-2">
                  <button className={button} disabled={action.busy}>
                    Record review
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => {
                      setRevealed("");
                      setReviewId("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Card>
          )}
          <Card title="Payment-purpose defaults">
            <p className="text-sm">
              Select independently approved profiles. These defaults do not
              activate bank exports.
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {data.purposes.map((purpose) => {
                const current = data.defaults.find(
                  (d) => d.purpose === purpose,
                );
                return (
                  <form
                    key={purpose + ":" + (current?.profileId ?? "")}
                    className="space-y-3 rounded-xl border p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void action.run(async () => {
                        if (
                          !window.confirm(
                            `Change the ${label(purpose)} default?`,
                          )
                        )
                          return false;
                        const id = text(d, "profileId");
                        if (id)
                          await api.setBankingDefault(
                            purpose,
                            id,
                            text(d, "reason"),
                          );
                        else
                          await api.clearBankingDefault(
                            purpose,
                            text(d, "reason"),
                          );
                        await saved();
                      }, "Payment default updated.");
                    }}
                  >
                    <Field label={label(purpose)}>
                      <select
                        className={control}
                        name="profileId"
                        defaultValue={current?.profileId ?? ""}
                      >
                        <option value="">No default</option>
                        {data.profiles
                          .filter((p) => p.status === "APPROVED")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.accountNumberMasked}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Reason">
                      <input
                        className={control}
                        name="reason"
                        required
                        minLength={3}
                        maxLength={500}
                      />
                    </Field>
                    <button className={secondary} disabled={action.busy}>
                      Save default
                    </button>
                  </form>
                );
              })}
            </div>
          </Card>
          <Card title="Statutory payments">
            <p className="text-sm">
              SARS and direct UIF routing will be configured in the remittance
              batch. For SARS-registered employers, PAYE, UIF and SDL must
              follow the employer declaration and issued payment reference. Do
              not use an ordinary liability export as a substitute for that
              workflow.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
