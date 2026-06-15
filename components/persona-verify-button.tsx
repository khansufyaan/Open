"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const PERSONA_SCRIPT_SRC = "https://cdn.withpersona.com/dist/persona-v5.5.0.js";
const PERSONA_SCRIPT_INTEGRITY =
  "sha384-UK+a2yEU9KOzEmsgI4IlkrXWE4AekM/iAgWF60Zuyule702g7qaQ2nYccO3tnT0A";

const TEMPLATE_ID =
  process.env.NEXT_PUBLIC_PERSONA_TEMPLATE_ID ?? "itmpl_ANNcryQcPAVajcJH6JTzBeaAZ19vP5";
const ENVIRONMENT_ID =
  process.env.NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID ?? "env_ANNcryQ5EmsRXTJwE31hMF1TqsVtqj";

export type PersonaResult = {
  inquiryId: string;
  status: string;
  fields?: Record<string, unknown>;
};

type PersonaClientOptions = {
  templateId: string;
  environmentId: string;
  referenceId?: string;
  onReady?: () => void;
  onComplete?: (result: PersonaResult) => void;
  onCancel?: (result: { inquiryId?: string; sessionToken?: string }) => void;
  onError?: (error: { code?: string; message?: string }) => void;
};

type PersonaClient = {
  open: () => void;
};

declare global {
  interface Window {
    Persona?: {
      Client: new (options: PersonaClientOptions) => PersonaClient;
    };
  }
}

function loadPersonaScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Persona can only load in the browser."));
      return;
    }

    if (window.Persona) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PERSONA_SCRIPT_SRC}"]`
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Persona.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = PERSONA_SCRIPT_SRC;
    script.integrity = PERSONA_SCRIPT_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load Persona.")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

type PersonaVerifyButtonProps = {
  referenceId?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  onComplete: (result: PersonaResult) => void;
  onError?: (message: string) => void;
};

export function PersonaVerifyButton({
  referenceId,
  label = "Verify my identity",
  className,
  disabled,
  onComplete,
  onError,
}: PersonaVerifyButtonProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  const launch = useCallback(async () => {
    setIsLaunching(true);

    try {
      await loadPersonaScript();

      if (!window.Persona) {
        throw new Error("Persona client unavailable after script load.");
      }

      const client = new window.Persona.Client({
        templateId: TEMPLATE_ID,
        environmentId: ENVIRONMENT_ID,
        ...(referenceId ? { referenceId } : {}),
        onReady: () => client.open(),
        onComplete: ({ inquiryId, status, fields }) => {
          onCompleteRef.current({ inquiryId, status, fields });
        },
        onCancel: () => {
          setIsLaunching(false);
        },
        onError: (error) => {
          setIsLaunching(false);
          onErrorRef.current?.(error.message ?? "Persona verification failed.");
        },
      });
    } catch (error) {
      setIsLaunching(false);
      onErrorRef.current?.(
        error instanceof Error ? error.message : "Unable to start identity verification."
      );
    }
  }, [referenceId]);

  return (
    <Button
      type="button"
      onClick={() => void launch()}
      disabled={disabled || isLaunching}
      className={className ?? "w-full h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700"}
    >
      {isLaunching ? "Opening verification…" : label}
    </Button>
  );
}
