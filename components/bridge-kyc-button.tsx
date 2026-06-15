"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";

type BridgeKycButtonProps = {
  fullName?: string;
  onVerified: (walletAddress?: string | null) => void;
  onError?: (message: string) => void;
};

type Phase = "idle" | "starting" | "awaiting" | "checking";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 120; // ~10 minutes

/**
 * Drives Bridge's hosted Persona KYC flow:
 *   1. Requests a short-lived KYC link from the server and opens it.
 *   2. Polls the server for the authoritative verification status.
 *   3. Calls `onVerified` once Bridge reports approval.
 */
export function BridgeKycButton({ fullName, onVerified, onError }: BridgeKycButtonProps) {
  const { getAccessToken } = usePrivy();
  const [phase, setPhase] = useState<Phase>("idle");
  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onVerifiedRef = useRef(onVerified);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
    onErrorRef.current = onError;
  }, [onVerified, onError]);

  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(input, { ...init, headers });
    },
    [getAccessToken]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const checkStatus = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) {
        setPhase("checking");
      }

      try {
        const response = await authedFetch("/api/bridge/kyc-status");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? "Unable to read verification status.");
        }

        if (data.verified) {
          clearTimer();
          setPhase("idle");
          onVerifiedRef.current(data.walletAddress ?? null);
          return true;
        }
      } catch (error) {
        if (!silent) {
          onErrorRef.current?.(
            error instanceof Error ? error.message : "Unable to read verification status."
          );
        }
      }

      if (!silent) {
        setPhase("awaiting");
      }
      return false;
    },
    [authedFetch, clearTimer]
  );

  const poll = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) {
        return;
      }
      pollCountRef.current += 1;
      const done = await checkStatus({ silent: true });
      if (!done && mountedRef.current && pollCountRef.current < MAX_POLLS) {
        poll();
      }
    }, POLL_INTERVAL_MS);
  }, [checkStatus, clearTimer]);

  const start = useCallback(async () => {
    setPhase("starting");

    try {
      const response = await authedFetch("/api/bridge/kyc-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to start identity verification.");
      }

      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }

      pollCountRef.current = 0;
      setPhase("awaiting");
      poll();

      // Demo mode (no Bridge creds): there is no hosted flow — confirm directly.
      if (data.demo) {
        await checkStatus();
      }
    } catch (error) {
      setPhase("idle");
      onErrorRef.current?.(
        error instanceof Error ? error.message : "Unable to start identity verification."
      );
    }
  }, [authedFetch, fullName, poll, checkStatus]);

  if (phase === "awaiting" || phase === "checking") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Complete verification in the opened tab. We&apos;ll detect it automatically.
        </p>
        <Button
          type="button"
          onClick={() => void checkStatus()}
          disabled={phase === "checking"}
          className="w-full h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
        >
          {phase === "checking" ? "Checking…" : "I've finished — check now"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => void start()}
      disabled={phase === "starting"}
      className="w-full h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
    >
      {phase === "starting" ? "Opening verification…" : "Verify with Bridge"}
    </Button>
  );
}
