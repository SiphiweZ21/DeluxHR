"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getUser } from "./auth";
// Session-only navigation preferences; never persist payroll or form contents.
export function usePagePreference<T>(
  page: string,
  name: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial),
    [ready, setReady] = useState(false);
  const user = getUser();
  const key = `deluxhr:view:${user?.organizationId ?? ""}:${user?.id ?? ""}:${page}:${name}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) setValue(JSON.parse(saved) as T);
    } catch {
      /* Storage may be disabled. */
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Navigation still works without storage. */
      }
    }
  }, [key, ready, value]);
  return [value, setValue];
}
