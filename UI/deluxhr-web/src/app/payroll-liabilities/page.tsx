"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspaceAccess } from "../../components/layout/workspace-access";
import { grant } from "../../lib/workspace-access";
import { getUser } from "../../lib/auth";
function useCanManage() {
  const { access } = useWorkspaceAccess();
  return !!access && grant(access, "MANAGE_PAYROLL", true);
}
import * as api from "../../lib/payroll-liabilities-api";
import { dateTimeLabel } from "../../lib/people-services-api";
import {
  Badge,
  Card,
  Empty,
  Field,
  Notice,
  PageTitle,
  button,
  control,
  secondary,
  text,
  useAction,
} from "../../components/leave/ui";

type Tab =
  | "Register"
  | "Payments"
  | "Adjustments"
  | "Reconciliation"
  | "Audit history";
const month = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
export default function PayrollLiabilitiesPage() {
  const [period, setPeriod] = useState(month()),
    [input, setInput] = useState(month());
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Payroll"
        title="Payroll Liabilities & Remittances"
        text="Review posted payroll liabilities, record external remittances, reconcile the ledger and follow the audit trail."
      />
      <div className="rounded-xl border bg-white p-4 text-sm">
        Prepare ordinary and statutory payments with{" "}
        <Link className="text-indigo-600 underline" href="/remittance-payments">
          Remittance Preparation
        </Link>
        . Early Pay recovery deductions use a separate repayment register.{" "}
        <Link
          className="text-indigo-600 underline"
          href="/early-pay-repayments"
        >
          Open Early Pay Repayments
        </Link>
      </div>
      <Card title="Payroll month">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(input)) setPeriod(input);
          }}
        >
          <Field label="Month">
            <input
              required
              type="month"
              min="1900-01"
              max="9999-12"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={control}
            />
          </Field>
          <button className={button}>Load period</button>
        </form>
        <p className="text-sm text-slate-500">
          Showing {period}. Includes LOCKED, PAYMENT_PROCESSING and PAID runs
          whose payroll period ends within this UTC calendar month.
        </p>
      </Card>
      <LiabilityPeriod key={period} period={period} />
    </div>
  );
}
function LiabilityPeriod({ period }: { period: string }) {
  const [tab, setTab] = useState<Tab>("Register"),
    [report, setReport] = useState<api.LiabilityRegister | null>(null),
    [loading, setLoading] = useState(true);
  const action = useAction();
  async function load() {
    try {
      setReport(await api.getLiabilityRegister(period));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void action.run(load);
  }, [period]);
  return (
    <div className="space-y-6">
      <Notice error={action.error} message={action.message} />
      <div className="flex flex-wrap gap-2">
        {(
          [
            "Register",
            "Payments",
            "Adjustments",
            "Reconciliation",
            "Audit history",
          ] as Tab[]
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? button : secondary}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <button
          disabled={action.busy}
          className={secondary}
          onClick={() => void action.run(load)}
        >
          Refresh register
        </button>
        <button
          disabled={action.busy || !report}
          className={secondary}
          onClick={() =>
            void action.run(async () => {
              await api.downloadLiabilityCsv(period);
            }, "Liability CSV downloaded.")
          }
        >
          Export CSV
        </button>
      </div>
      {tab === "Reconciliation" ? (
        <Reconciliation period={period} />
      ) : tab === "Audit history" ? (
        <AuditHistory period={period} />
      ) : loading ? (
        <Empty>Loading liabilities…</Empty>
      ) : (
        report && (
          <>
            {tab === "Register" ? (
              <Register report={report} />
            ) : tab === "Payments" ? (
              <Payments report={report} onSaved={load} />
            ) : (
              <Adjustments report={report} onSaved={load} />
            )}
          </>
        )
      )}
    </div>
  );
}
function MoneyCard({ label, amount }: { label: string; amount: number }) {
  return (
    <Card title={label}>
      <p className="text-2xl font-semibold tabular-nums">
        {api.formatZarCents(amount)}
      </p>
    </Card>
  );
}
function Register({ report: r }: { report: api.LiabilityRegister }) {
  const [status, setStatus] = useState("ALL"),
    [effect, setEffect] = useState("ALL"),
    [search, setSearch] = useState("");
  const rows = r.rows.filter(
    (row) =>
      (status === "ALL" || row.status === status) &&
      (effect === "ALL" || row.effect === effect) &&
      `${row.code} ${row.creditorName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {r.runCount} posted payroll runs · ZAR only. Recorded payments remain
        pending until confirmed; pending amounts do not reduce outstanding
        liability.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MoneyCard label="Base liability" amount={r.totals.baseCents} />
        <MoneyCard label="Adjustments" amount={r.totals.adjustmentCents} />
        <MoneyCard label="Confirmed paid" amount={r.totals.paidCents} />
        <MoneyCard
          label="Recorded, unconfirmed"
          amount={r.totals.pendingCents}
        />
        <MoneyCard label="Outstanding" amount={r.totals.outstandingCents} />
        <MoneyCard label="Reserved" amount={r.totals.reservedCents} />
        <MoneyCard label="Available" amount={r.totals.availableCents} />
      </div>
      <Card title="Statutory & workforce summaries">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["PAYE", r.statutory.payeCents],
            ["UIF employee", r.statutory.uifEmployeeCents],
            ["UIF employer", r.statutory.uifEmployerCents],
            ["UIF combined", r.statutory.uifTotalCents],
            ["SDL employer", r.statutory.sdlCents],
            ["Employee deductions", r.employeeDeductionsCents],
            ["Employer contributions", r.employerContributionsCents],
          ].map(([label, amount]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 font-semibold tabular-nums">
                {api.formatZarCents(Number(amount))}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Summaries include adjustments. UIF combined equals employee plus
          employer UIF. Statutory and effect summaries overlap and should not be
          added together.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyCard
          label="Payroll gross earnings"
          amount={r.payrollTotals.grossEarningsCents}
        />
        <MoneyCard
          label="Payroll net pay"
          amount={r.payrollTotals.netPayCents}
        />
        <MoneyCard
          label="Total employer cost"
          amount={r.payrollTotals.employerCostCents}
        />
      </div>
      <Card title="Liability register">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Search code or creditor">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={control}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={control}
            >
              <option value="ALL">All statuses</option>
              {[
                "UNPAID",
                "PAYMENT_RECORDED",
                "PARTIALLY_PAID",
                "PAID",
                "OVERPAID",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Liability type">
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value)}
              className={control}
            >
              <option value="ALL">All types</option>
              <option value="EMPLOYEE_DEDUCTION">Employee deductions</option>
              <option value="EMPLOYER_LIABILITY">Employer liabilities</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          {rows.length} of {r.rows.length} liability buckets. Summary cards and
          CSV export cover the whole period.
        </p>
        {!rows.length ? (
          <Empty>
            {!r.rows.length
              ? "No liability buckets found in posted payroll for this month."
              : "No buckets match your filters."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {[
                    "Code / category",
                    "Creditor",
                    "Base",
                    "Adjustment",
                    "Confirmed",
                    "Pending",
                    "Reserved",
                    "Available",
                    "Outstanding",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={api.liabilityBucketKey(row)}
                    className="border-b border-slate-100"
                  >
                    <td className="p-3">
                      <p className="font-medium">{row.code}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.category.replaceAll("_", " ")}
                        <br />
                        {row.effect.replaceAll("_", " ")}
                      </p>
                    </td>
                    <td className="p-3">{row.creditorName}</td>
                    {[
                      row.amountCents,
                      row.adjustmentCents,
                      row.paidCents,
                      row.pendingCents,
                      row.reservedCents,
                      row.availableCents,
                      row.outstandingCents,
                    ].map((amount, i) => (
                      <td
                        key={i}
                        className="whitespace-nowrap p-3 tabular-nums"
                      >
                        {api.formatZarCents(amount)}
                      </td>
                    ))}
                    <td className="p-3">
                      <Badge value={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
function BucketSelect({ rows }: { rows: api.LiabilityRow[] }) {
  return (
    <Field label="Liability code & creditor">
      <select name="bucket" required className={control}>
        <option value="">Select posted liability</option>
        {rows.map((row) => (
          <option
            key={api.liabilityBucketKey(row)}
            value={api.liabilityBucketKey(row)}
          >
            {row.code} · {row.creditorName} · Outstanding{" "}
            {api.formatZarCents(row.outstandingCents)}
          </option>
        ))}
      </select>
    </Field>
  );
}
function selectedBucket(
  report: api.LiabilityRegister,
  data: FormData,
): api.LiabilityRow {
  const row = report.rows.find(
    (r) => api.liabilityBucketKey(r) === text(data, "bucket"),
  );
  if (!row) throw new Error("Choose an existing liability bucket.");
  return row;
}
function Payments({
  report,
  onSaved,
}: {
  report: api.LiabilityRegister;
  onSaved: () => Promise<void>;
}) {
  const manage = useCanManage();
  const [filter, setFilter] = useState("ALL");
  const action = useAction();
  const payments = report.payments.filter(
    (p) => filter === "ALL" || p.status === filter,
  );
  return (
    <div className="space-y-6">
      <Notice error={action.error} message={action.message} />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {manage && (
          <Card title="Record remittance payment">
            <p className="text-sm text-slate-500">
              Record a payment made outside DeluxHR. This creates a pending
              accounting record; it does not transfer funds. Confirmation
              reduces the liability.
            </p>
            {!report.rows.length ? (
              <Empty>
                Post and lock payroll to produce liability buckets first.
              </Empty>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    data = new FormData(form);
                  void action.run(async () => {
                    const row = selectedBucket(report, data),
                      amountCents = api.parseZarCents(text(data, "amount")),
                      reference = text(data, "reference"),
                      paidAt = new Date(text(data, "paidAt")).toISOString();
                    if (reference.length < 3)
                      throw new Error(
                        "Payment reference requires at least three characters.",
                      );
                    if (Date.parse(paidAt) > Date.now())
                      throw new Error("Payment date cannot be in the future.");
                    const payment = await api.recordRemittancePayment({
                      period: report.period,
                      code: row.code,
                      creditorName: row.creditorName,
                      amountCents,
                      reference,
                      paidAt,
                    });
                    form.reset();
                    try {
                      await onSaved();
                    } catch {
                      throw new Error(
                        `Payment ${payment.reference} was recorded, but refreshing failed. Refresh the register; do not record it again.`,
                      );
                    }
                  }, "Payment recorded. Confirm it below once verified.");
                }}
              >
                <fieldset disabled={action.busy} className="space-y-4">
                  <BucketSelect rows={report.rows} />
                  <Field label="Amount (ZAR)">
                    <input
                      name="amount"
                      inputMode="decimal"
                      required
                      placeholder="1250.00"
                      className={control}
                    />
                  </Field>
                  <Field label="Unique payment reference">
                    <input
                      name="reference"
                      required
                      minLength={3}
                      maxLength={100}
                      className={control}
                    />
                  </Field>
                  <Field label="Payment date & time">
                    <input
                      type="datetime-local"
                      name="paidAt"
                      required
                      className={control}
                    />
                  </Field>
                  <p className="text-xs text-slate-500">
                    Date/time uses your computer’s local time zone. Amounts
                    cannot exceed the available balance after pending records
                    and batch reservations.
                  </p>
                  <button className={button}>Record external payment</button>
                </fieldset>
              </form>
            )}
          </Card>
        )}
        <Card title="Payment tracking">
          <Field label="Payment status">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={control}
            >
              {["ALL", "RECORDED", "CONFIRMED", "VOIDED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {!payments.length ? (
            <Empty>No payments in this view.</Empty>
          ) : (
            payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onSaved={onSaved} />
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
function PaymentRow({
  payment: p,
  onSaved,
}: {
  payment: api.RemittancePayment;
  onSaved: () => Promise<void>;
}) {
  const manage = useCanManage(),
    actor = getUser()?.id;
  const action = useAction();
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">{p.reference}</h3>
        <Badge value={p.status} />
      </div>
      <p className="text-sm">
        {p.code} · {p.creditorName} ·{" "}
        <strong>{api.formatZarCents(p.amountCents)}</strong>
      </p>
      <p className="text-xs text-slate-500">
        Paid externally {dateTimeLabel(p.paidAt)} · Recorded{" "}
        {dateTimeLabel(p.createdAt)}
      </p>
      {p.confirmedAt && (
        <p className="break-all text-xs text-slate-500">
          Confirmed {dateTimeLabel(p.confirmedAt)} · {p.confirmedByUserId}
        </p>
      )}
      {p.voidedAt && (
        <p className="whitespace-pre-wrap text-sm text-slate-500">
          Voided {dateTimeLabel(p.voidedAt)} · {p.voidReason}
        </p>
      )}
      <Notice error={action.error} message={action.message} />
      {p.status === "RECORDED" && manage && actor !== p.createdByUserId && (
        <form
          className="space-y-3 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void action.run(async () => {
              const status = text(data, "status") as "CONFIRMED" | "VOIDED",
                reason = text(data, "reason");
              if (reason.length < 8)
                throw new Error(
                  "Provide a reason of at least eight characters.",
                );
              if (
                !window.confirm(
                  `${status === "CONFIRMED" ? "Confirm" : "Void"} payment record ${p.reference} for ${api.formatZarCents(p.amountCents)}? This decision cannot be reversed through this API.`,
                )
              )
                return false;
              await api.decideRemittancePayment(
                p.id,
                status,
                reason || undefined,
              );
              try {
                await onSaved();
              } catch {
                throw new Error(
                  "Decision saved, but refreshing failed. Refresh the register before taking further action.",
                );
              }
            }, "Payment decision recorded.");
          }}
        >
          <fieldset disabled={action.busy} className="space-y-3">
            <Field label="Decision">
              <select name="status" className={control}>
                <option value="CONFIRMED">Confirm verified payment</option>
                <option value="VOIDED">Void recorded payment</option>
              </select>
            </Field>
            <Field label="Decision reason (minimum 8 characters)">
              <textarea
                name="reason"
                required
                minLength={8}
                maxLength={500}
                className={control}
              />
            </Field>
            <button className={secondary}>Record decision</button>
          </fieldset>
        </form>
      )}
    </article>
  );
}
function Adjustments({
  report,
  onSaved,
}: {
  report: api.LiabilityRegister;
  onSaved: () => Promise<void>;
}) {
  const manage = useCanManage();
  const action = useAction();
  return (
    <div className="space-y-6">
      <Notice error={action.error} message={action.message} />
      <div className="grid gap-6 xl:grid-cols-2">
        {manage && (
          <Card title="Adjust liability">
            <p className="text-sm text-slate-500">
              Positive amounts increase liability; negative amounts reduce it.
              Adjustments must be nonzero and cannot make the bucket liability
              negative. They leave the payroll ledger intact.
            </p>
            {!report.rows.length ? (
              <Empty>
                No posted liability bucket is available for adjustment.
              </Empty>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    data = new FormData(form);
                  void action.run(async () => {
                    const row = selectedBucket(report, data),
                      amountCents = api.parseZarCents(
                        text(data, "amount"),
                        true,
                      ),
                      reason = text(data, "reason");
                    if (reason.length < 8)
                      throw new Error(
                        "Adjustment reason requires at least eight characters.",
                      );
                    if (row.amountCents + row.adjustmentCents + amountCents < 0)
                      throw new Error(
                        "Adjustment cannot make the liability negative.",
                      );
                    if (
                      !window.confirm(
                        `Apply ${api.formatZarCents(amountCents)} to ${row.code} / ${row.creditorName}?`,
                      )
                    )
                      return false;
                    await api.createLiabilityAdjustment({
                      period: report.period,
                      code: row.code,
                      creditorName: row.creditorName,
                      amountCents,
                      reason,
                    });
                    form.reset();
                    try {
                      await onSaved();
                    } catch {
                      throw new Error(
                        "Adjustment saved, but refreshing failed. Refresh the register; do not submit it again.",
                      );
                    }
                  }, "Liability adjustment recorded.");
                }}
              >
                <fieldset disabled={action.busy} className="space-y-4">
                  <BucketSelect rows={report.rows} />
                  <Field label="Signed amount (ZAR)">
                    <input
                      name="amount"
                      required
                      inputMode="decimal"
                      placeholder="100.00 or -100.00"
                      className={control}
                    />
                  </Field>
                  <Field label="Reason">
                    <textarea
                      name="reason"
                      required
                      minLength={8}
                      maxLength={500}
                      className={control}
                    />
                  </Field>
                  <button className={button}>Record adjustment</button>
                </fieldset>
              </form>
            )}
          </Card>
        )}
        <Card title="Adjustment history">
          {!report.adjustments.length ? (
            <Empty>No adjustments for this month.</Empty>
          ) : (
            report.adjustments.map((a) => (
              <article
                key={a.id}
                className="space-y-3 rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">{a.code}</h3>
                  <span className="font-semibold tabular-nums">
                    {api.formatZarCents(a.amountCents)}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{a.creditorName}</p>
                <p className="whitespace-pre-wrap text-sm">{a.reason}</p>
                <p className="break-all text-xs text-slate-500">
                  {dateTimeLabel(a.createdAt)} · {a.createdByUserId}
                </p>
              </article>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
function Reconciliation({ period }: { period: string }) {
  const [result, setResult] = useState<api.LiabilityReconciliation | null>(
    null,
  );
  const action = useAction();
  async function load() {
    setResult(await api.getLiabilityReconciliation(period));
  }
  useEffect(() => {
    void action.run(load);
  }, [period]);
  return (
    <Card title="Payroll reconciliation">
      <Notice error={action.error} message={action.message} />
      <button
        disabled={action.busy}
        className={secondary}
        onClick={() => void action.run(load)}
      >
        Run reconciliation
      </button>
      {result && (
        <>
          <Badge value={result.balanced ? "BALANCED" : "REVIEW REQUIRED"} />
          <p className="text-sm text-slate-500">
            {result.checkedRuns} posted runs checked. Balanced means no
            statutory ledger differences and every liability bucket has zero
            outstanding amount. Recorded/unconfirmed payments are reported
            separately.
          </p>
          {!result.checkedRuns && (
            <Empty>
              No posted runs in this month. A balanced result here does not
              confirm that payroll has been processed.
            </Empty>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Outstanding (signed total)
              </p>
              <p className="mt-1 text-xl font-semibold">
                {api.formatZarCents(result.unpaidCents)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Recorded, unconfirmed</p>
              <p className="mt-1 text-xl font-semibold">
                {api.formatZarCents(result.recordedUnconfirmedCents)}
              </p>
            </div>
          </div>
          {!result.differences.length ? (
            <Empty>
              No PAYE, UIF or SDL differences between payroll fields and ledger
              entries.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {[
                      "Payroll run",
                      "Code",
                      "Expected",
                      "Ledger",
                      "Difference",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.differences.map((d) => (
                    <tr
                      className="border-b border-slate-100"
                      key={`${d.payrollRunId}:${d.code}`}
                    >
                      <td className="p-3">{d.payrollRunId}</td>
                      <td className="p-3">{d.code}</td>
                      {[d.expectedCents, d.ledgerCents, d.differenceCents].map(
                        (amount, i) => (
                          <td
                            key={i}
                            className="whitespace-nowrap p-3 tabular-nums"
                          >
                            {api.formatZarCents(amount)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
function AuditHistory({ period }: { period: string }) {
  const [items, setItems] = useState<api.RemittanceHistory[]>([]),
    [loaded, setLoaded] = useState(false);
  const action = useAction();
  async function load() {
    setItems(await api.getRemittanceHistory(period));
    setLoaded(true);
  }
  useEffect(() => {
    void action.run(load);
  }, [period]);
  return (
    <Card title="Remittance audit history">
      <Notice error={action.error} message={action.message} />
      <p className="text-sm text-slate-500">
        Latest 500 adjustment, payment and export events for this month.
      </p>
      <button
        disabled={action.busy}
        className={secondary}
        onClick={() => void action.run(load)}
      >
        Refresh history
      </button>
      {loaded && !items.length ? (
        <Empty>No remittance audit events.</Empty>
      ) : (
        items.map((event) => (
          <div
            key={event.id}
            className="space-y-2 rounded-xl border border-slate-200 p-4"
          >
            <p className="text-sm font-medium">
              {event.action
                .replace("PAYROLL_REMITTANCE_", "")
                .replaceAll("_", " ")}
            </p>
            {event.reason && (
              <p className="whitespace-pre-wrap text-sm">{event.reason}</p>
            )}
            <p className="break-all text-xs text-slate-500">
              {dateTimeLabel(event.createdAt)} ·{" "}
              {event.actorEmail ?? event.actorUserId ?? "Unknown actor"}
              {event.actorRole ? ` · ${event.actorRole}` : ""}
            </p>
            <p className="break-all text-xs text-slate-400">
              Reference: {event.entityId}
            </p>
          </div>
        ))
      )}
    </Card>
  );
}
