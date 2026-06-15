"use client";

import { useCallback, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { BridgeKycButton } from "@/components/bridge-kyc-button";

const PERSONA_SCRIPT_SRC = "https://cdn.withpersona.com/dist/persona-v5.5.0.js";
const PERSONA_SCRIPT_INTEGRITY =
  "sha384-UK+a2yEU9KOzEmsgI4IlkrXWE4AekM/iAgWF60Zuyule702g7qaQ2nYccO3tnT0A";

type PersonaCompletePayload = { inquiryId: string; status: string };

type PersonaClientInstance = { open: () => void };

type PersonaClientOptions = {
  templateId: string;
  environmentId: string;
  referenceId?: string;
  onReady: () => void;
  onComplete: (payload: PersonaCompletePayload) => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
};

type PersonaGlobal = {
  Client: new (options: PersonaClientOptions) => PersonaClientInstance;
};

declare global {
  interface Window {
    Persona?: PersonaGlobal;
  }
}

function loadPersona(): Promise<PersonaGlobal> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Persona can only load in the browser."));
      return;
    }
    if (window.Persona) {
      resolve(window.Persona);
      return;
    }

    const finish = () => {
      if (window.Persona) resolve(window.Persona);
      else reject(new Error("Persona SDK failed to initialize."));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PERSONA_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => reject(new Error("Failed to load Persona.")));
      return;
    }

    const script = document.createElement("script");
    script.src = PERSONA_SCRIPT_SRC;
    script.integrity = PERSONA_SCRIPT_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error("Failed to load Persona."));
    document.body.appendChild(script);
  });
}

type Phase = "idle" | "loading" | "open" | "verifying";

type PersonaKycProps = {
  fullName?: string;
  referenceId?: string;
  onVerified: () => void;
  onError?: (message: string) => void;
};

/**
 * Runs Bridge KYC inline via the embedded Persona SDK (no separate tab). On
 * completion the Persona inquiry id is sent to the server, which ingests it
 * into Bridge and reads back the authoritative verification result.
 *
 * Falls back to the Bridge-hosted KYC link when Persona env vars aren't set.
 */
export function PersonaKyc({ fullName, referenceId, onVerified, onError }: PersonaKycProps) {
  const { getAccessToken } = usePrivy();
  const templateId = process.env.NEXT_PUBLIC_PERSONA_TEMPLATE_ID;
  const environmentId = process.env.NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID;
  const [phase, setPhase] = useState<Phase>("idle");

  const submitInquiry = useCallback(
    async (inquiryId: string) => {
      setPhase("verifying");
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/bridge/kyc-inquiry", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ inquiryId }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message ?? "We couldn't verify your identity.");
        }
        if (data.verified) {
          onVerified();
          return;
        }
        onError?.(
          "Your identity check is being reviewed. This can take a moment — check back shortly."
        );
        setPhase("idle");
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Verification failed.");
        setPhase("idle");
      }
    },
    [getAccessToken, onError, onVerified]
  );

  const start = useCallback(async () => {
    if (!templateId || !environmentId) return;
    setPhase("loading");
    try {
      const Persona = await loadPersona();
      const client = new Persona.Client({
        templateId,
        environmentId,
        ...(referenceId ? { referenceId } : {}),
        onReady: () => {
          setPhase("open");
          client.open();
        },
        onComplete: ({ inquiryId }) => {
          void submitInquiry(inquiryId);
        },
        onCancel: () => setPhase("idle"),
        onError: (error) => {
          onError?.(
            error instanceof Error ? error.message : "Identity verification could not start."
          );
          setPhase("idle");
        },
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not load identity verification.");
      setPhase("idle");
    }
  }, [templateId, environmentId, referenceId, submitInquiry, onError]);

  // Fallback to the hosted Bridge KYC link when Persona isn't configured.
  if (!templateId || !environmentId) {
    return <BridgeKycButton fullName={fullName} onVerified={onVerified} onError={onError} />;
  }

  const label =
    phase === "loading"
      ? "Loading…"
      : phase === "open"
        ? "Verifying…"
        : phase === "verifying"
          ? "Finishing up…"
          : "Verify my identity";

  return (
    <Button
      type="button"
      onClick={() => void start()}
      disabled={phase !== "idle"}
      className="w-full h-11 text-base font-semibold gradient-blue hover:opacity-90"
    >
      {label}
    </Button>
  );
}
