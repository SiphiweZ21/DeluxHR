"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Card,
  Field,
  Notice,
  button,
  secondary,
  control,
  text,
} from "../leave/ui";
import { getUser } from "../../lib/auth";
import * as api from "../../lib/remittance-payments-api";
export function RemittanceBeneficiaries() {
  const [rows, setRows] = useState<api.Beneficiary[]>([]),
    [route, setRoute] = useState<api.Beneficiary["route"]>("BANK_TRANSFER"),
    [selected, setSelected] = useState(""),
    [full, setFull] = useState<
      (api.Beneficiary & { accountNumber: string | null }) | null
    >(null),
    [password, setPassword] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const epoch = useRef(0),
    live = useRef(true),
    actor = getUser()?.id;
  const current = rows.find((p) => p.id === selected);
  function hide() {
    setFull(null);
    setPassword("");
  }
  async function load() {
    const token = epoch.current,
      list = await api.getBeneficiaries();
    if (live.current && token === epoch.current) setRows(list);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Beneficiary action failed.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  useEffect(() => {
    live.current = true;
    void run(load);
    function blur() {
      epoch.current++;
      hide();
    }
    window.addEventListener("blur", blur);
    return () => {
      live.current = false;
      epoch.current++;
      window.removeEventListener("blur", blur);
    };
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form),
      payload: Record<string, string | boolean> = {
        name: text(d, "name"),
        route,
        reason: text(d, "reason"),
      };
    if (route === "BANK_TRANSFER")
      for (const key of [
        "code",
        "creditorName",
        "bankName",
        "accountHolder",
        "accountNumber",
        "branchCode",
        "accountType",
        "payeeReference",
      ])
        payload[key] = text(d, key);
    else {
      payload.registrationEvidence = text(d, "registrationEvidence");
      payload.uifViaSars =
        route === "SARS_EFILING" && text(d, "uifViaSars") === "yes";
    }
    await run(async () => {
      await api.createBeneficiary(payload);
      form.reset();
      epoch.current++;
      hide();
      setSelected("");
      await load();
      setMessage(
        "Profile submitted. A different company administrator must inspect and approve it.",
      );
    });
  }
  async function action(kind: "inspect" | "APPROVED" | "REJECTED" | "retire") {
    if (!current) return;
    const auth = { password, reason },
      key = current.id,
      token = epoch.current;
    setPassword("");
    await run(async () => {
      if (kind === "inspect") {
        const p = await api.inspectBeneficiary(key, auth);
        if (live.current && token === epoch.current) setFull(p);
        return;
      }
      if (kind === "retire") await api.retireBeneficiary(key, auth);
      else await api.reviewBeneficiary(key, { ...auth, decision: kind });
      epoch.current++;
      hide();
      await load();
      setMessage("Beneficiary decision saved.");
    });
  }
  return (
    <div className="space-y-6">
      <Notice error={error} message={message} />
      <Card title="Create a creditor or statutory payment route">
        <p className="text-sm text-slate-500">
          Profiles are immutable after creation and require a second company
          administrator. Ordinary creditor code and name must match the payroll
          liability bucket exactly. Early Pay repayments use their separate
          workflow.
        </p>
        <form onSubmit={create} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Profile name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  className={control}
                />
              </Field>
              <Field label="Payment route">
                <select
                  value={route}
                  onChange={(e) =>
                    setRoute(e.target.value as api.Beneficiary["route"])
                  }
                  className={control}
                >
                  <option value="BANK_TRANSFER">
                    Ordinary creditor bank payment
                  </option>
                  <option value="SARS_EFILING">SARS EMP201 / eFiling</option>
                  <option value="UIF_PORTAL">Direct UIF / uFiling</option>
                </select>
              </Field>
            </div>
            {route === "BANK_TRANSFER" ? (
              <div key="ordinary" className="grid gap-4 sm:grid-cols-2">
                {[
                  ["code", "Exact payroll liability code"],
                  ["creditorName", "Exact payroll creditor name"],
                  ["bankName", "Beneficiary bank"],
                  ["accountHolder", "Account holder"],
                  ["accountNumber", "Account number"],
                  ["branchCode", "Six-digit branch code"],
                  [
                    "payeeReference",
                    "Beneficiary reference (max 20 ASCII characters)",
                  ],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      name={key}
                      required
                      maxLength={
                        key === "payeeReference"
                          ? 20
                          : key === "branchCode"
                            ? 6
                            : key === "accountNumber"
                              ? 20
                              : key === "creditorName"
                                ? 200
                                : key === "code"
                                  ? 120
                                  : key === "bankName"
                                    ? 80
                                    : 100
                      }
                      minLength={
                        ["accountNumber", "branchCode"].includes(key) ? 6 : 1
                      }
                      pattern={
                        key === "accountNumber"
                          ? "[0-9]{6,20}"
                          : key === "branchCode"
                            ? "[0-9]{6}"
                            : key === "payeeReference"
                              ? "[A-Za-z0-9 /-]{1,20}"
                              : undefined
                      }
                      className={control}
                    />
                  </Field>
                ))}
                <Field label="Account type">
                  <select name="accountType" className={control}>
                    <option value="CURRENT">Current</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="TRANSMISSION">Transmission</option>
                  </select>
                </Field>
              </div>
            ) : (
              <div key="statutory" className="space-y-4">
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  SARS-registered UIF employers must pay UIF through SARS.
                  Direct uFiling is for employers whose UIF is payable directly
                  to UIF. Check the registration documents before approval.
                  DeluxHR records the approved route; it does not verify
                  registration with the authority.
                </p>
                {route === "SARS_EFILING" && (
                  <Field label="Is UIF payable through SARS under this registration?">
                    <select name="uifViaSars" required className={control}>
                      <option value="yes">
                        Yes — include PAYE, SDL and UIF
                      </option>
                      <option value="no">
                        No — PAYE and SDL only (verify registration)
                      </option>
                    </select>
                  </Field>
                )}
                <Field label="Registration verification evidence / document reference">
                  <textarea
                    name="registrationEvidence"
                    required
                    minLength={10}
                    maxLength={500}
                    className={control}
                  />
                </Field>
              </div>
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
            <button className={button}>Create pending profile</button>
          </fieldset>
        </form>
      </Card>
      <Card title="Beneficiary review & retirement">
        <div className="flex flex-wrap gap-3">
          <Field label="Profile">
            <select
              className={control}
              disabled={busy}
              value={selected}
              onChange={(e) => {
                epoch.current++;
                hide();
                setSelected(e.target.value);
                setReason("");
              }}
            >
              <option value="">Choose a profile</option>
              {rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.route.replaceAll("_", " ")} · {p.status}
                </option>
              ))}
            </select>
          </Field>
          <button
            className={secondary}
            disabled={busy}
            onClick={() => {
              epoch.current++;
              hide();
              void run(load);
            }}
          >
            Refresh profiles
          </button>
        </div>
        {current && (
          <div className="space-y-4">
            <p className="text-sm">
              {current.route === "BANK_TRANSFER"
                ? `${current.code} · ${current.creditorName} · ${current.bankName} · ${current.accountNumberMasked}`
                : `${current.route} · UIF through SARS: ${current.uifViaSars ? "Yes" : "No"}`}
            </p>
            {current.registrationEvidence && (
              <p className="text-sm text-slate-500">
                {current.registrationEvidence}
              </p>
            )}
            {full && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  Account holder: {full.accountHolder} · bank: {full.bankName}
                </p>
                <p>
                  Account {full.accountNumber} · branch {full.branchCode} ·{" "}
                  {full.accountType}
                </p>
                <p>
                  Creditor {full.code} / {full.creditorName} · reference{" "}
                  {full.payeeReference}
                </p>
                <button className={secondary} onClick={hide}>
                  Hide full account details
                </button>
              </div>
            )}
            {current.status === "PENDING_APPROVAL" &&
              current.createdBy === actor && (
                <p className="text-sm text-slate-500">
                  Your profile awaits another company administrator.
                </p>
              )}
            {(current.status === "APPROVED" ||
              (current.status === "PENDING_APPROVAL" &&
                current.createdBy !== actor)) && (
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
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
                    type="password"
                    required
                    autoComplete="current-password"
                    maxLength={200}
                    className={control}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {current.status === "PENDING_APPROVAL" ? (
                    <>
                      <button
                        disabled={busy || !password || reason.trim().length < 3}
                        className={secondary}
                        onClick={() => void action("inspect")}
                      >
                        Inspect profile
                      </button>
                      <button
                        disabled={
                          busy || !password || reason.trim().length < 3 || !full
                        }
                        className={button}
                        onClick={() => void action("APPROVED")}
                      >
                        Approve reviewed profile
                      </button>
                      <button
                        disabled={busy || !password || reason.trim().length < 3}
                        className={secondary}
                        onClick={() => void action("REJECTED")}
                      >
                        Reject profile
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={busy || !password || reason.trim().length < 3}
                      className={secondary}
                      onClick={() => void action("retire")}
                    >
                      Retire profile
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Each action verifies your password. Cancel unsubmitted batches
                  before retirement.
                </p>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
