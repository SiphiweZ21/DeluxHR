"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { loginUser, LoginError } from "../../lib/api";
import { homeForRole, saveAuth } from "../../lib/auth";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [locks, setLocks] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const remainingSeconds = Math.max(
    0,
    Math.ceil(((locks[email.trim().toLowerCase()] ?? 0) - now) / 1000),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || remainingSeconds > 0) return;
    setErrorMessage("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password.trim()) {
      setErrorMessage("Email and password are required.");
      return;
    }

    try {
      setIsLoading(true);

      const response = await loginUser({
        email: trimmedEmail,
        password,
      });

      if (!response?.accessToken) {
        throw new Error("Login succeeded but no access token was returned.");
      }

      saveAuth(response.accessToken, response.user);

      router.push(
        response.onboardingOnly
          ? "/onboarding"
          : homeForRole(response.user?.role),
      );
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sign in. Please try again.";

      if (error instanceof LoginError && error.retryAfterSeconds) {
        setLocks((previous) => ({
          ...previous,
          [trimmedEmail.toLowerCase()]:
            Date.now() + error.retryAfterSeconds! * 1000,
        }));
        setNow(Date.now());
      }
      setErrorMessage(
        message +
          (error instanceof LoginError &&
          error.remainingAttempts != null &&
          error.remainingAttempts > 0
            ? ` ${error.remainingAttempts} attempt${error.remainingAttempts === 1 ? "" : "s"} remaining.`
            : ""),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email address
        </label>
        <input
          id="email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={isLoading}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-700"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          disabled={isLoading}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isLoading || remainingSeconds > 0}
        className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading
          ? "Signing in..."
          : remainingSeconds > 0
            ? `Try again in ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`
            : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-600">
        Need an admin account?{" "}
        <Link
          href="/register"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Register here
        </Link>
      </p>
    </form>
  );
}
