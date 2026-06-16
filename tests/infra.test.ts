import { describe, expect, it } from "vitest";

import { enforceRateLimit } from "@/lib/ratelimit";
import { recordAudit } from "@/lib/audit";
import { getEnv, validateEnv } from "@/lib/env";

describe("rate limiting (no KV) fails open", () => {
  it("returns null so requests proceed when limiting is unconfigured", async () => {
    expect(await enforceRateLimit("send", "did:test:user")).toBeNull();
    expect(await enforceRateLimit("default", "did:test:user")).toBeNull();
  });
});

describe("audit logging is best-effort", () => {
  it("never throws without KV configured", async () => {
    await expect(
      recordAudit({ userId: "did:test:user", action: "send.submitted", detail: { amount: "1" } })
    ).resolves.toBeUndefined();
  });
});

describe("env", () => {
  it("getEnv returns an object and validateEnv never throws", () => {
    expect(typeof getEnv()).toBe("object");
    expect(() => validateEnv()).not.toThrow();
  });
});
