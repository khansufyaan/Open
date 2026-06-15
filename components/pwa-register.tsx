"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable as a PWA (and runs
 * standalone when added to the iPhone home screen). Only registers in
 * production to avoid caching the dev server.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.warn("Service worker registration failed", error));
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
