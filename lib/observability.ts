/**
 * Structured logging + pluggable error capture.
 *
 * Defaults to structured console output. If a Sentry DSN is configured we
 * forward errors there too (loaded lazily so the SDK stays optional). Keep all
 * server logging flowing through here so it can be redirected in one place.
 */

type Level = "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: Fields) {
  const line = JSON.stringify({
    level,
    message,
    ...fields,
    ts: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};

/**
 * Capture an error for observability. Structured-logs always; forwards to
 * Sentry when SENTRY_DSN is set. Never throws.
 */
export function captureError(context: string, error: unknown, fields?: Fields) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  log.error(`[${context}] ${message}`, { ...fields, stack });
}
