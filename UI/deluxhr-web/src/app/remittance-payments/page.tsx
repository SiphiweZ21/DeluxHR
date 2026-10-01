"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Card,
  Field,
  Notice,
  PageTitle,
  button,
  secondary,
  control,
  text,
} from "../../components/leave/ui";
import { useWorkspaceAccess } from "../../components/layout/workspace-access";
import { getUser } from "../../lib/auth";
import { grant } from "../../lib/workspace-access";
import {
  formatZarCents as money,
  parseZarCents,
} from "../../lib/payroll-liabilities-api";
import * as api from "../../lib/remittance-payments-api";
type Action = "approve" | "cancel" | "submit" | "inspect" | "result";
export default function RemittancePaymentsPage() {
  const { access } = useWorkspaceAccess(),
    actor = getUser()?.id,
    allowed = (p: string) => !!access && grant(access, p, true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)),
    [workspace, setWorkspace] = useState<api.Workspace | null>(null),
    [beneficiary, setBeneficiary] = useState(""),
    [batch, setBatch] = useState<api.RemittanceBatch | null>(null),
    [action, setAction] = useState<Action | null>(null),
    [inspection, setInspection] = useState<api.Inspection | null>(null),
    [password, setPassword] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [outcome, setOutcome] = useState<"PAID" | "FAILED" | "MISMATCH">("PAID");
  const epoch = useRef(0),
    live = useRef(true);
  const payee = workspace?.beneficiaries.find((p) => p.id === beneficiary),
    statutory = payee && payee.route !== "BANK_TRANSFER";
  function hide() {
    setInspection(null);
    setPassword("");
  }
  async function load(key?: string) {
    const token = epoch.current,
      w = await api.getRemittanceWorkspace(period);
    if (!live.current || token !== epoch.current) return;
    setWorkspace(w);
    if (key) {
      const b =
        w.batches.find((b) => b.id === key) ??
        (await api.getRemittanceBatch(key));
      if (live.current && token === epoch.current) setBatch(b);
    }
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remittance action failed.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  useEffect(() => {
    live.current = true;
    epoch.current++;
    setWorkspace(null);
    setBatch(null);
    setBeneficiary("");
    setAction(null);
    hide();
    void run(() => load());
    return () => {
      live.current = false;
      epoch.current++;
    };
  }, [period]);
  useEffect(() => {
    function blur() {
      epoch.current++;
      hide();
    }
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  useEffect(() => {
    if (action)
      document
        .getElementById("remittance-action")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [action]);
  function open(kind: Action) {
    epoch.current++;
    hide();
    setReason("");
    setOutcome("PAID");
    setAction(kind);
  }
  async function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    if (!payee) return;
    const payload: api.Prepare = {
        period,
        beneficiaryId: beneficiary,
        paymentDate: text(d, "date"),
        reason: text(d, "reason"),
      },
      funding = text(d, "funding"),
      reference = text(d, "reference");
    if (funding) payload.fundingProfileId = funding;
    if (reference) payload.officialReference = reference;
    if (statutory) {
      payload.declaredPaymentCents = parseZarCents(text(d, "amount"));
      payload.declarationEvidence = text(d, "evidence");
    } else if (text(d, "amount"))
      payload.amountCents = parseZarCents(text(d, "amount"));
    await run(async () => {
      const b = await api.prepareRemittance(payload);
      form.reset();
      epoch.current++;
      hide();
      await load(b.id);
      setMessage(
        "Batch prepared and amount reserved. A different approver must release it.",
      );
    });
  }
  async function execute(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!batch || !action) return;
    const d = new FormData(e.currentTarget),
      key = batch.id,
      kind = action,
      token = epoch.current,
      auth = { password, reason };
    setPassword("");
    await run(async () => {
      if (kind === "inspect") {
        const full = await api.inspectRemittance(key, auth);
        if (live.current && token === epoch.current) {
          setInspection(full);
          setAction(null);
        }
        return;
      }
      if (kind === "submit")
        await api.submitRemittance(key, {
          ...auth,
          method:
            batch.route === "BANK_TRANSFER"
              ? "MANUAL_BANK_PORTAL"
              : batch.route,
          bankReference: text(d, "bankReference"),
          evidence: text(d, "evidence"),
        });
      else if (kind === "result") {
        const value = text(d, "amount"),
          actualPaidCents =
            value === "0" || value === "0.00" ? 0 : parseZarCents(value);
        await api.recordRemittanceResult(key, {
          ...auth,
          outcome,
          actualPaidCents,
          paidAt: text(d, "date"),
          bankReference: text(d, "bankReference"),
          evidence: text(d, "evidence"),
        });
      } else await api.remittanceAction(key, kind, auth);
      epoch.current++;
      hide();
      setAction(null);
      await load(key);
      setMessage("Remittance action saved.");
    });
  }
  const rows = workspace?.register.rows ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <PageTitle
          eyebrow="Payroll & payments"
          title="Remittance payment preparation"
          text="Prepare ordinary creditor payments and official statutory remittances from posted payroll."
        />
        <button
          className={secondary}
          disabled={busy}
          onClick={() => {
            epoch.current++;
            hide();
            void run(() => load(batch?.id));
          }}
        >
          Refresh
        </button>
      </div>
      <Notice error={error} message={message} />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        DeluxHR prepares and records payments. Authorize ordinary transfers in
        your bank portal; use eFiling or the verified direct UIF route for
        statutory payments. Downloads do not send money. Production bank files
        remain unavailable; FNB drafts are for testing only.
      </div>
      <p className="text-sm">
        <Link className="text-indigo-600 underline" href="/payroll-liabilities">
          Liability register & adjustments
        </Link>
        {access?.role === "COMPANY_ADMIN" && (
          <>
            {" "}
            ·{" "}
            <Link
              className="text-indigo-600 underline"
              href="/remittance-beneficiaries"
            >
              Configure beneficiaries
            </Link>
          </>
        )}{" "}
        ·{" "}
        <Link
          className="text-indigo-600 underline"
          href="/early-pay-repayments"
        >
          Separate Early Pay repayments
        </Link>
      </p>
      <Card title="Available liability buckets">
        <Field label="Payroll period ending in">
          <input
            className={control}
            type="month"
            min="2000-01"
            max="2099-12"
            value={period}
            disabled={busy}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>
        {workspace && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [
                  "Available for preparation",
                  workspace.register.totals.availableCents,
                ],
                [
                  "Reserved in batches",
                  workspace.register.totals.reservedCents,
                ],
                ["Confirmed paid", workspace.register.totals.paidCents],
              ].map(([label, n]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-xl font-semibold">{money(Number(n))}</p>
                </div>
              ))}
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Code / creditor",
                      "Outstanding",
                      "Recorded pending",
                      "Reserved",
                      "Available",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={JSON.stringify([r.code, r.creditorName])}
                      className="border-t"
                    >
                      <td className="p-3">
                        {r.code} · {r.creditorName}
                      </td>
                      {[
                        r.outstandingCents,
                        r.pendingCents,
                        r.reservedCents,
                        r.availableCents,
                      ].map((n, i) => (
                        <td key={i} className="p-3 whitespace-nowrap">
                          {money(n)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="p-4 text-sm text-slate-500">
                  No ordinary or statutory liabilities in posted payroll for
                  this period.
                </p>
              )}
            </div>
          </>
        )}
      </Card>
      {workspace && allowed("PREPARE_PAYROLL_PAYMENTS") && (
        <Card title="Prepare payment">
          <form
            onSubmit={(e) =>
              void prepare(e).catch((e) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : "Check payment preparation fields.",
                ),
              )
            }
            className="space-y-4"
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Approved beneficiary / statutory route">
                  <select
                    required
                    value={beneficiary}
                    onChange={(e) => setBeneficiary(e.target.value)}
                    className={control}
                  >
                    <option value="">Choose an approved profile</option>
                    {workspace.beneficiaries.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.route.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Company funding account">
                  <select name="funding" className={control}>
                    <option value="">Use LIABILITIES default</option>
                    {workspace.funding.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {p.accountNumberMasked}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {payee && (
                <div key={payee.id} className="space-y-4">
                  <p className="text-sm text-slate-500">
                    {statutory
                      ? `Official ${payee.route} payment${payee.uifViaSars ? " including UIF" : ""}. The declared payment must match the full available allocation. Reconcile declaration differences, including applicable credits, with justified liability adjustments first.`
                      : `${payee.code} / ${payee.creditorName}. Leave amount blank to prepare the full available balance; smaller amounts are allowed.`}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={
                        statutory
                          ? "Official declared payment (ZAR)"
                          : "Amount (ZAR, optional)"
                      }
                    >
                      <input
                        name="amount"
                        inputMode="decimal"
                        required={!!statutory}
                        className={control}
                      />
                    </Field>
                    <Field label="Planned payment date">
                      <input
                        name="date"
                        type="date"
                        min="2000-01-01"
                        max="2099-12-31"
                        required
                        className={control}
                      />
                    </Field>
                  </div>
                  <Field
                    label={
                      payee.route === "SARS_EFILING"
                        ? "Official 19-digit EMP201 payment reference"
                        : statutory
                          ? "Official UIF declaration / payment reference"
                          : "Beneficiary reference"
                    }
                  >
                    <input
                      name="reference"
                      required={!!statutory}
                      defaultValue={payee.payeeReference ?? ""}
                      maxLength={
                        payee.route === "SARS_EFILING"
                          ? 19
                          : statutory
                            ? 100
                            : 20
                      }
                      pattern={
                        payee.route === "SARS_EFILING"
                          ? "[0-9]{19}"
                          : statutory
                            ? undefined
                            : "[A-Za-z0-9 /-]{1,20}"
                      }
                      className={control}
                    />
                  </Field>
                  {statutory && (
                    <Field label="Official declaration evidence / document reference">
                      <textarea
                        name="evidence"
                        required
                        minLength={10}
                        maxLength={1000}
                        className={control}
                      />
                    </Field>
                  )}
                  <Field label="Audit reason">
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      className={control}
                    />
                  </Field>
                  <button className={button}>Prepare & reserve payment</button>
                </div>
              )}
              {!workspace.beneficiaries.length && (
                <p className="text-sm text-amber-900">
                  A company administrator must configure and independently
                  approve a beneficiary or statutory route first.
                </p>
              )}
            </fieldset>
          </form>
        </Card>
      )}
      <Card title="Prepared remittances">
        <Field label="Select batch (latest 100 for period)">
          <select
            value={batch?.id ?? ""}
            disabled={busy}
            className={control}
            onChange={(e) => {
              epoch.current++;
              hide();
              setAction(null);
              setBatch(
                workspace?.batches.find((b) => b.id === e.target.value) ?? null,
              );
            }}
          >
            <option value="">Choose a batch</option>
            {workspace?.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id.slice(0, 8)} · {b.beneficiary.name} · {b.status} ·{" "}
                {money(b.totalCents)}
              </option>
            ))}
          </select>
        </Field>
        {batch && (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {batch.status} · {batch.route} · {money(batch.totalCents)} ·
              planned {batch.paymentDate.slice(0, 10)}
            </p>
            <p className="text-sm">
              Payment reference: <strong>{batch.paymentReference}</strong>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">Frozen company funding</p>
                <p>
                  {batch.funding.name} · {batch.funding.bank} ·{" "}
                  {batch.funding.accountNumberMasked}
                </p>
                {inspection && (
                  <p className="text-amber-800">
                    Account {inspection.funding.accountNumber} · branch{" "}
                    {inspection.funding.branchCode}
                  </p>
                )}
              </div>
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">Frozen destination</p>
                <p>
                  {batch.beneficiary.name} · {batch.beneficiary.bankName} ·{" "}
                  {batch.beneficiary.accountNumberMasked}
                </p>
                {inspection && batch.route === "BANK_TRANSFER" && (
                  <p className="text-amber-800">
                    {inspection.beneficiary.accountHolder} · account{" "}
                    {inspection.beneficiary.accountNumber} · branch{" "}
                    {inspection.beneficiary.branchCode} ·{" "}
                    {inspection.beneficiary.accountType}
                  </p>
                )}
              </div>
            </div>
            {inspection && (
              <button className={secondary} onClick={hide}>
                Hide account details
              </button>
            )}
            {batch.declarationEvidence && (
              <p className="text-sm text-slate-500">
                Declaration evidence: {batch.declarationEvidence}
              </p>
            )}
            <div className="rounded-xl bg-slate-50 p-3 space-y-2">
              {batch.allocations.map((r) => (
                <p
                  className="flex flex-wrap justify-between gap-2 text-sm"
                  key={r.id}
                >
                  <span>
                    {r.code} · {r.creditorName}
                  </span>
                  <strong>{money(r.amountCents)}</strong>
                </p>
              ))}
            </div>
            {batch.submissionReference && (
              <p className="text-sm">
                Submission: {batch.submissionReference} ·{" "}
                {batch.submissionEvidence}
              </p>
            )}
            {batch.resultReference && (
              <p className="text-sm">
                Bank outcome: {batch.resultReference} · actual{" "}
                {money(batch.actualPaidCents ?? 0)} · {batch.resultEvidence}
              </p>
            )}
            {["FAILED", "EXCEPTION"].includes(batch.status) && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                This payment remains reserved. Investigate the bank outcome
                before any retry. There is no automatic retry or exception
                release in this batch.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {batch.status === "PREPARED" &&
                batch.preparedBy !== actor &&
                allowed("APPROVE_PAYROLL_PAYMENTS") && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => open("approve")}
                  >
                    Approve release
                  </button>
                )}
              {["PREPARED", "APPROVED"].includes(batch.status) &&
                allowed("PREPARE_PAYROLL_PAYMENTS") && (
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => open("cancel")}
                  >
                    Cancel before submission
                  </button>
                )}
              {batch.status === "APPROVED" &&
                allowed("EXPORT_PAYROLL_PAYMENTS") && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => open("submit")}
                  >
                    Record{" "}
                    {batch.route === "BANK_TRANSFER"
                      ? "bank"
                      : "official portal"}{" "}
                    submission
                  </button>
                )}
              {["APPROVED", "SUBMITTED"].includes(batch.status) &&
                allowed("EXPORT_PAYROLL_PAYMENTS") && (
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => open("inspect")}
                  >
                    Inspect payment instructions
                  </button>
                )}
              {batch.status === "SUBMITTED" &&
                batch.preparedBy !== actor &&
                batch.submittedBy !== actor &&
                allowed("APPROVE_PAYROLL_PAYMENTS") && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => open("result")}
                  >
                    Independently reconcile bank result
                  </button>
                )}
              {[
                "APPROVED",
                "SUBMITTED",
                "PAID",
                "FAILED",
                "EXCEPTION",
              ].includes(batch.status) &&
                allowed("EXPORT_PAYROLL_PAYMENTS") && (
                  <>
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.downloadRemittance(batch.id))
                      }
                    >
                      Download preparation report
                    </button>
                    {batch.route === "BANK_TRANSFER" &&
                      batch.funding.adapterId === "FNB_OBE_BANKSERV" && (
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              api.downloadRemittance(batch.id, true),
                            )
                          }
                        >
                          Download FNB test draft
                        </button>
                      )}
                  </>
                )}
            </div>
          </div>
        )}
      </Card>
      {action && batch && (
        <Card
          title={
            action === "result"
              ? "Independent bank reconciliation"
              : action + " remittance"
          }
        >
          <form id="remittance-action" onSubmit={execute} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              {action === "submit" && (
                <p className="text-sm text-amber-900">
                  Record a payment already initiated and authorized externally
                  using the frozen account, amount and reference. This records
                  the instruction; it does not send money or clear liabilities.
                </p>
              )}
              {action === "result" && (
                <>
                  <Field label="Actual bank outcome">
                    <select
                      value={outcome}
                      onChange={(e) =>
                        setOutcome(e.target.value as typeof outcome)
                      }
                      className={control}
                    >
                      <option value="PAID">Full payment confirmed</option>
                      <option value="FAILED">Failed — no funds paid</option>
                      <option value="MISMATCH">
                        Partial / uncertain / mismatched amount
                      </option>
                    </select>
                  </Field>
                  <Field label="Actual paid amount (ZAR)">
                    <input
                      key={outcome}
                      name="amount"
                      inputMode="decimal"
                      required
                      defaultValue={
                        outcome === "PAID"
                          ? (batch.totalCents / 100).toFixed(2)
                          : outcome === "FAILED"
                            ? "0.00"
                            : ""
                      }
                      className={control}
                    />
                  </Field>
                  <Field label="Bank transaction date">
                    <input
                      name="date"
                      type="date"
                      required
                      max={new Date().toISOString().slice(0, 10)}
                      className={control}
                    />
                  </Field>
                  <p className="text-sm text-slate-500">
                    Full payment must equal the frozen total. Failed must be
                    zero. Mismatches stay reserved and do not create confirmed
                    accounting entries.
                  </p>
                </>
              )}
              {["submit", "result"].includes(action) && (
                <>
                  <Field label="Actual bank / portal transaction reference">
                    <input
                      name="bankReference"
                      required
                      minLength={3}
                      maxLength={100}
                      className={control}
                    />
                  </Field>
                  <Field label="Traceable bank evidence / statement reference">
                    <textarea
                      name="evidence"
                      required
                      minLength={10}
                      maxLength={1000}
                      className={control}
                    />
                  </Field>
                </>
              )}
              <Field label="Audit reason">
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  className={control}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Field label="Your password">
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  maxLength={200}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={control}
                />
              </Field>
              <div className="flex gap-2">
                <button className={button}>Confirm action</button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    epoch.current++;
                    hide();
                    setAction(null);
                  }}
                >
                  Close
                </button>
              </div>
            </fieldset>
          </form>
        </Card>
      )}
    </div>
  );
}
