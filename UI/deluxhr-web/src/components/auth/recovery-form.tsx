"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { workforceRequest } from "../../lib/api";
import { logout } from "../../lib/auth";
export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (reset) {
      setToken(
        new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [reset]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (reset && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (reset && new TextEncoder().encode(password).length > 72) {
      setError("Password must be at most 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    try {
      const result = await workforceRequest<{ message: string }>(
        reset ? "auth/reset-password" : "auth/forgot-password",
        "POST",
        reset ? { token, password } : { email: email.trim() },
      );
      if (reset) {
        logout();
        setPassword("");
        setConfirm("");
        setToken("");
      }
      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete this request. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <p className="font-semibold text-indigo-600">DeluxHR</p>
        <h1 className="text-2xl font-semibold mt-4">
          {reset ? "Choose a new password" : "Forgot password?"}
        </h1>
        <p className="text-sm text-slate-600 my-4">
          {reset
            ? "Use at least 12 characters. Your existing sessions will be signed out."
            : "Enter your login email. If your account is active, we will email a reset link valid for 30 minutes."}
        </p>
        {error && (
          <p role="alert" className="my-3 text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="my-3 text-emerald-700">
            {message}
          </p>
        )}
        {reset && !token && !message ? (
          <p className="text-amber-700">
            This link is missing or invalid.{" "}
            <Link href="/forgot-password" className="underline">
              Request a new link.
            </Link>
          </p>
        ) : (
          !message && (
            <form onSubmit={submit} className="space-y-4">
              {reset ? (
                <>
                  <label className="block">
                    New password
                    <input
                      required
                      minLength={12}
                      maxLength={72}
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-lg border p-3 mt-2"
                    />
                  </label>
                  <label className="block">
                    Confirm password
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="block w-full rounded-lg border p-3 mt-2"
                    />
                  </label>
                </>
              ) : (
                <label className="block">
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border p-3 mt-2"
                  />
                </label>
              )}
              <button
                disabled={busy}
                className="w-full bg-indigo-600 text-white rounded-lg p-3 disabled:opacity-50"
              >
                {busy
                  ? "Please wait…"
                  : reset
                    ? "Update password"
                    : "Send reset link"}
              </button>
            </form>
          )
        )}
        <p className="mt-6 text-sm">
          <Link href="/login" className="text-indigo-600 font-semibold">
            Back to sign in
          </Link>
        </p>
        {reset && error && (
          <Link href="/forgot-password" className="text-sm underline">
            Request a new reset link
          </Link>
        )}
      </section>
    </main>
  );
}
