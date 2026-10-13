"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export function UnsavedFormGuard() {
  const path = usePathname();
  useEffect(() => {
    const dirty = new Set<HTMLFormElement>();
    const change = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const form = target.closest<HTMLFormElement>("form[data-unsaved-form]");
        if (form) dirty.add(form);
      }
    };
    const saved = (event: Event) => {
      if (event.target instanceof HTMLFormElement) dirty.delete(event.target);
    };
    const hasChanges = () => [...dirty].some((form) => form.isConnected);
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.pathname === path ||
        !hasChanges()
      )
        return;
      if (!window.confirm("You have unsaved changes. Leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      } else dirty.clear();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (hasChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("change", change);
    document.addEventListener("input", change);
    document.addEventListener("deluxhr:saved", saved);
    document.addEventListener("click", leave, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("change", change);
      document.removeEventListener("input", change);
      document.removeEventListener("deluxhr:saved", saved);
      document.removeEventListener("click", leave, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [path]);
  return null;
}
