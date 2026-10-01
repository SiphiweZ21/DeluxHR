"use client";
import { useEffect, useState } from "react";
import { useWorkspaceAccess } from "../../components/layout/workspace-access";
import { grant } from "../../lib/workspace-access";
import * as api from "../../lib/payroll-payments-api";
import {
  Card,
  Empty,
  Field,
  Notice,
  PageTitle,
  Badge,
  button,
  secondary,
  control,
  text,
  useAction,
} from "../../components/leave/ui";
export default function Page() {
  const { access } = useWorkspaceAccess(),
    action = useAction();
  const [batches, setBatches] = useState<api.PaymentBatch[]>([]),
    [selected, setSelected] = useState<api.PaymentBatch | null>(null),
    [check, setCheck] = useState<api.ExportCheck | null>(null),
    [cycles, setCycles] = useState<api.PaymentCycle[]>([]),
    [funding, setFunding] = useState<api.FundingChoice[]>([]);
  const allowed = (p: string) => !!access && grant(access, p, true);
  async function refresh() {
    setBatches(await api.listPaymentBatches());
    if (allowed("PREPARE_PAYROLL_PAYMENTS")) {
      const [c, f] = await Promise.all([
        api.getPaymentCycles(),
        api.getPaymentFunding(),
      ]);
      setCycles(c.filter((c) => c.status === "LOCKED"));
      setFunding(f);
    }
    if (selected) setSelected(await api.getPaymentBatch(selected.id));
  }
  useEffect(() => {
    void action.run(refresh);
  }, []);
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Payroll & payments"
        title="Payroll payment batches"
        text="Freeze funding details, independently approve release and review files."
      />
      <Notice error={action.error} message={action.message} />
      <Card title="Bank export readiness">
        <p className="text-sm">
          Bank-compatible production exports remain blocked pending bank
          validation. Reports and FNB drafts do not change payment status or
          confirm a transfer. The FNB draft must not be uploaded for payments.
        </p>
      </Card>
      {allowed("PREPARE_PAYROLL_PAYMENTS") && (
        <Card title="Prepare a locked payroll cycle">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void action.run(async () => {
                if (
                  !window.confirm(
                    "Freeze the selected approved funding profile and employee payment details for this payroll cycle?",
                  )
                )
                  return false;
                const result = await api.preparePaymentBatch(
                  text(d, "payrollBatchId"),
                  text(d, "fundingProfileId") || undefined,
                );
                setSelected(await api.getPaymentBatch(result.id));
                setCheck(null);
                setBatches(await api.listPaymentBatches());
              }, "Payment batch prepared. A different authorized user must approve release.");
            }}
          >
            <Field label="Locked payroll cycle">
              <select
                className={control}
                name="payrollBatchId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select a locked payroll cycle
                </option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.paymentDate?.slice(0, 10)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Funding profile">
              <select
                className={control}
                name="fundingProfileId"
                defaultValue=""
              >
                <option value="">
                  Company salary default (or legacy report-only batch)
                </option>
                {funding.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.bank} · {f.accountNumberMasked} ·{" "}
                    {f.adapterId}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-slate-500">
              The company administrator manages approved profiles in Banking &
              Payments. Without an override or salary default, this is a legacy
              report-only batch. Only a frozen FNB Enterprise Bankserv profile
              enables its draft.
            </p>
            <button className={button} disabled={action.busy}>
              Prepare batch
            </button>
          </form>
        </Card>
      )}
      <Card title="Company payment batches">
        <button
          className={secondary}
          disabled={action.busy}
          onClick={() => void action.run(refresh)}
        >
          Refresh
        </button>
        {!batches.length ? (
          <Empty>No payment batches loaded.</Empty>
        ) : (
          <div className="divide-y">
            {batches.map((b) => (
              <button
                key={b.id}
                className="flex w-full flex-wrap justify-between gap-3 py-4 text-left"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    setSelected(await api.getPaymentBatch(b.id));
                    setCheck(null);
                  })
                }
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {b.payrollBatch?.title ?? b.id}
                  </span>
                  <span className="block break-all text-xs text-slate-500">
                    {b.id} · {b.employeeCount} employees · {b.currency}{" "}
                    {b.totalAmount.toFixed(2)}
                  </span>
                </span>
                <Badge value={b.status} />
              </button>
            ))}
          </div>
        )}
      </Card>
      {selected && (
        <Card title="Selected payment batch">
          <p className="break-all text-sm">{selected.id}</p>
          <Badge value={selected.status} />
          <p>
            {selected.currency} {selected.totalAmount.toFixed(2)} ·{" "}
            {selected.employeeCount} employees
          </p>
          <p className="text-sm">
            Frozen payment date:{" "}
            {selected.paymentDateSnapshot?.slice(0, 10) ??
              "Legacy batch; no frozen date"}
          </p>
          {selected.funding ? (
            <p className="text-sm">
              Frozen funding: {selected.funding.name} · {selected.funding.bank}{" "}
              · {selected.funding.accountNumberMasked} ·{" "}
              {selected.funding.adapterId} / {selected.funding.adapterVersion}
            </p>
          ) : (
            <p className="text-sm">
              No frozen funding profile. Bank drafts are unavailable.
            </p>
          )}
          {selected.exportSha256 && (
            <p className="break-all text-xs">
              Stored export SHA-256: {selected.exportSha256}
            </p>
          )}
          {selected.items && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Employee</th>
                    <th className="p-2">Frozen beneficiary</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">
                        {item.frozenEmployeeName ??
                          (item.employee
                            ? `${item.employee.firstName} ${item.employee.lastName}`
                            : item.id)}
                      </td>
                      <td className="p-2">
                        {item.beneficiary.accountHolderName} ·{" "}
                        {item.beneficiary.accountNumberMasked}
                        <br />
                        {item.beneficiary.branchCode} ·{" "}
                        {item.beneficiary.accountType}
                      </td>
                      <td className="p-2">
                        {selected.currency} {item.amount.toFixed(2)}
                      </td>
                      <td className="p-2">
                        {item.beneficiary.paymentReference ??
                          "Legacy reference"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {selected.status === "PREPARED" &&
              allowed("APPROVE_PAYROLL_PAYMENTS") && (
                <button
                  className={button}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      if (
                        !window.confirm(
                          "Approve release after reviewing funding, employee beneficiaries and totals?",
                        )
                      )
                        return false;
                      await api.approvePaymentBatch(selected.id);
                      await refresh();
                    }, "Release approved.")
                  }
                >
                  Approve release
                </button>
              )}
            {["APPROVED_FOR_EXPORT", "EXPORTED"].includes(selected.status) &&
              allowed("EXPORT_PAYROLL_PAYMENTS") && (
                <>
                  <button
                    className={secondary}
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        () => api.downloadPaymentFile(selected.id),
                        "Report downloaded; no payment status changed.",
                      )
                    }
                  >
                    Download report CSV
                  </button>
                  {selected.funding?.adapterId === "FNB_OBE_BANKSERV" && (
                    <>
                      <button
                        className={secondary}
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () =>
                            setCheck(
                              await api.checkPaymentExport(
                                selected.id,
                                "FNB_OBE_BANKSERV",
                              ),
                            ),
                          )
                        }
                      >
                        Validate FNB draft
                      </button>
                      <button
                        className={secondary}
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            if (
                              !window.confirm(
                                "Download a draft for format review only? Do not upload it for bank payments.",
                              )
                            )
                              return false;
                            await api.downloadPaymentFile(selected.id, true);
                          }, "Draft downloaded. Not for bank upload; no payment status changed.")
                        }
                      >
                        Download FNB draft
                      </button>
                    </>
                  )}
                </>
              )}
          </div>
          {check && (
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">
                {check.adapter.displayName}:{" "}
                {check.validation.valid
                  ? "Layout checks passed; bank validation still pending"
                  : "Blocked by layout checks"}
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-2">
                {check.validation.issues.map((i, n) => (
                  <li key={n}>
                    {i.severity}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
