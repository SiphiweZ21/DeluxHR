"use client";
import Link from 'next/link';
import {WorkspaceAccessProvider} from './workspace-access';
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { PlatformShell } from "../platform-admin/platform-shell";
import { getUser, homeForRole, logout } from "../../lib/auth";
import { setupIdentity } from "../../lib/customer-onboarding-api";
const pendingSetupRoutes=["/onboarding","/onboarding/preferences","/employee-administration","/department-setup","/company-documents","/attendance-setup","/leave-setup","/payroll-setup","/employee-banking","/company-banking"];
const authRoutes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy-policy",
  "/data-deletion",
];
export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [role, setRole] = useState<string | null>(null),
    [mounted, setMounted] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const platformRoute =
    pathname === "/platform-admin" || pathname.startsWith("/platform-admin/");
  useEffect(() => {
    let live = true;
    const user = getUser();
    setRole(user?.role ?? null);
    setMounted(false);
    setError("");
    async function check() {
      if (authRoutes.includes(pathname) || platformRoute) {
        if (live) setMounted(true);
        return;
      }
      if (homeForRole(user?.role) === "/platform-admin") {
        router.replace("/platform-admin");
        if (live) setMounted(true);
        return;
      }
      if (user?.role === "COMPANY_ADMIN") {
        try {
          const current = await setupIdentity();
          if (!live) return;
          setRole(current.role);
          if (homeForRole(current.role) === "/platform-admin")
            router.replace("/platform-admin");
          const setupOnly =
            current.role === "COMPANY_ADMIN" &&
            current.organization?.status === "PENDING";
          setPending(setupOnly);
          if (setupOnly && !pendingSetupRoutes.includes(pathname))
            router.replace("/onboarding");
        } catch (e) {
          if (live)
            setError(
              e instanceof Error
                ? e.message
                : "Unable to verify company access.",
            );
        }
      } else if (live) setPending(false);
      if (live) setMounted(true);
    }
    void check();
    return () => {
      live = false;
    };
  }, [pathname, platformRoute, router, retry]);
  if (authRoutes.includes(pathname)) return <>{children}</>;
  if (platformRoute) return <PlatformShell>{children}</PlatformShell>;
  if (!mounted || homeForRole(role ?? undefined) === "/platform-admin")
    return (
      <div className="p-8 text-sm text-slate-500">Opening your workspace…</div>
    );
  if (error)
    return (
      <div className="p-8 space-y-4">
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((n) => n + 1)}>
          Retry access check
        </button>{" "}
        <button
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </div>
    );
  if (pending)
    return pendingSetupRoutes.includes(pathname) ? (
      <WorkspaceAccessProvider><main className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8"><p className="rounded-xl bg-amber-50 p-3 text-sm">Company onboarding is pending. Complete setup in each feature; payroll processing starts after activation. <Link href="/onboarding" className="underline">Company Setup checklist</Link></p>
        {children}
      </main></WorkspaceAccessProvider>
    ) : (
      <div className="p-8">Opening company setup…</div>
    );
  return <AppShell>{children}</AppShell>;
}
