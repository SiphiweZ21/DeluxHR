"use client";
import { useEffect, useState } from "react";
import { workforceRequest } from "../lib/api";
import { Card, Field, Notice, button, control, secondary } from "./leave/ui";
type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  email: string | null;
  userId: string | null;
  user: { email: string; isActive: boolean } | null;
  whatsappNumber: string | null;
  whatsappOptInAt: string | null;
  whatsappEssIdentity: { isActive: boolean } | null;
};
type Choices = {
  employees: Employee[];
  users: { id: string; fullName: string; email: string }[];
};
export function WhatsAppEmployeeSetup() {
  const [choices, setChoices] = useState<Choices>({ employees: [], users: [] });
  const [employeeId, setEmployeeId] = useState("");
  const [number, setNumber] = useState("");
  const [account, setAccount] = useState("new");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const employee = choices.employees.find((e) => e.id === employeeId);
  async function load() {
    const data = await workforceRequest<Choices>("whatsapp/ess/setup");
    setChoices(data);
    setLoaded(true);
  }
  useEffect(() => {
    void load().catch((e) =>
      setError(
        e instanceof Error ? e.message : "Could not load WhatsApp setup",
      ),
    );
  }, []);
  function choose(id: string) {
    const e = choices.employees.find((e) => e.id === id);
    setEmployeeId(id);
    setNumber(e?.whatsappNumber || "");
    setEmail(e?.email || "");
    setAccount("new");
    setPassword("");
    setPasswordAgain("");
    setPin("");
    setPinAgain("");
    setConsent(false);
    setNote("");
    setMessage("");
    setError("");
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Employee WhatsApp self-service">
      <p className="text-sm mb-3">
        Choose an active employee, link their login, record their consent and
        set a separate WhatsApp PIN. Requires Manage users permission and the
        WhatsApp package feature.
      </p>
      <Notice error={error} message={message} />
      <button
        type="button"
        className={secondary}
        disabled={busy}
        onClick={() => void run(load)}
      >
        Refresh setup status
      </button>
      {loaded && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (!employee) throw new Error("Choose an employee");
              if (pin !== pinAgain) throw new Error("PINs do not match");
              if (
                !employee.userId &&
                account === "new" &&
                password !== passwordAgain
              )
                throw new Error("Passwords do not match");
              await workforceRequest("whatsapp/ess/setup", "POST", {
                employeeId,
                whatsappNumber: number,
                consent,
                consentNote: note,
                pin,
                ...(!employee.userId
                  ? account === "new"
                    ? { email, password }
                    : { existingUserId: account }
                  : {}),
              });
              setPassword("");
              setPasswordAgain("");
              setPin("");
              setPinAgain("");
              setConsent(false);
              setNote("");
              await load();
              setMessage(
                "WhatsApp setup saved. Send hi to the business number, then reply PIN followed by the employee’s PIN. Share credentials privately with the employee.",
              );
            });
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <Field label="Employee *">
              <select
                className={control}
                required
                value={employeeId}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">Choose employee</option>
                {choices.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} · {e.employeeCode || "No code"}
                  </option>
                ))}
              </select>
            </Field>
            {employee && (
              <>
                <p className="text-sm">
                  Status:{" "}
                  {employee.whatsappOptInAt &&
                  employee.whatsappEssIdentity?.isActive &&
                  employee.user?.isActive
                    ? "Enrolled"
                    : "Setup required"}
                  . Login: {employee.user?.email || "Not linked"}.{" "}
                  {employee.whatsappOptInAt &&
                    `Consent recorded ${new Date(employee.whatsappOptInAt).toLocaleDateString()}.`}
                </p>
                {employee.userId ? (
                  <p className="text-sm">
                    The existing linked login will be kept.{" "}
                    {!employee.user?.isActive &&
                      "Activate the linked user in Access setup before enrolling."}
                  </p>
                ) : (
                  <>
                    <Field label="Employee login account *">
                      <select
                        className={control}
                        value={account}
                        onChange={(e) => {
                          setAccount(e.target.value);
                          setPassword("");
                          setPasswordAgain("");
                        }}
                      >
                        <option value="new">Create employee login</option>
                        {choices.users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} · {u.email}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {account === "new" && (
                      <>
                        <Field label="Login email *">
                          <input
                            className={control}
                            type="email"
                            required
                            maxLength={254}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                          />
                        </Field>
                        <Field label="Login password (at least 12 characters) *">
                          <input
                            className={control}
                            type="password"
                            required
                            minLength={12}
                            maxLength={128}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </Field>
                        <Field label="Confirm login password *">
                          <input
                            className={control}
                            type="password"
                            required
                            value={passwordAgain}
                            onChange={(e) => setPasswordAgain(e.target.value)}
                            autoComplete="new-password"
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}
                <Field label="Employee WhatsApp number *">
                  <input
                    className={control}
                    type="tel"
                    required
                    maxLength={30}
                    placeholder="+27821234567"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </Field>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    The employee has agreed to use this number for DeluxHR
                    WhatsApp self-service.
                  </span>
                </label>
                <Field label="Consent record *">
                  <input
                    className={control}
                    required
                    minLength={5}
                    maxLength={500}
                    placeholder="How and when consent was obtained; do not enter passwords or PINs"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <Field label="WhatsApp PIN (6–8 digits) *">
                  <input
                    className={control}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6,8}"
                    required
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm WhatsApp PIN *">
                  <input
                    className={control}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6,8}"
                    required
                    maxLength={8}
                    value={pinAgain}
                    onChange={(e) => setPinAgain(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <p className="text-sm">
                  Saving resets WhatsApp sessions. The PIN is separate from the
                  portal password. Obtain consent again when changing the
                  number.
                </p>
                <button className={button} type="submit">
                  {busy ? "Saving…" : "Save WhatsApp setup"}
                </button>
                {employee.whatsappOptInAt && (
                  <button
                    className={secondary + " ml-3"}
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Revoke this employee’s WhatsApp consent and end all WhatsApp sessions?",
                        )
                      )
                        void run(async () => {
                          await workforceRequest(
                            `whatsapp/ess/setup/${encodeURIComponent(employeeId)}/revoke`,
                            "POST",
                          );
                          setPin("");
                          setPinAgain("");
                          setConsent(false);
                          await load();
                          setMessage(
                            "WhatsApp consent revoked. The employee login remains linked.",
                          );
                        });
                    }}
                  >
                    Revoke WhatsApp access
                  </button>
                )}
              </>
            )}
          </fieldset>
        </form>
      )}
    </Card>
  );
}
