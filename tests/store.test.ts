import { describe, expect, it } from "vitest";

import { updateUser, getUser } from "@/lib/db/store";

// No KV env in tests → store uses its in-memory fallback, which still routes
// through the per-user serialization chain.

describe("updateUser", () => {
  it("creates then merges patches, keeping userId/updatedAt authoritative", async () => {
    const id = "did:test:create";
    const a = await updateUser(id, { email: "a@example.com" });
    expect(a.userId).toBe(id);
    expect(a.email).toBe("a@example.com");
    expect(a.updatedAt).toBeTruthy();

    const b = await updateUser(id, { fullName: "Ada" });
    expect(b.email).toBe("a@example.com"); // preserved
    expect(b.fullName).toBe("Ada");
  });

  it("supports a functional patch that sees the current record", async () => {
    const id = "did:test:fn";
    await updateUser(id, { transactions: [] });
    const res = await updateUser(id, (cur) => ({
      transactions: [
        {
          id: "t1",
          direction: "send",
          amount: "1",
          currency: "USDC",
          status: "x",
          createdAt: new Date().toISOString(),
        },
        ...(cur?.transactions ?? []),
      ],
    }));
    expect(res.transactions).toHaveLength(1);
  });

  it("serializes concurrent functional appends without clobbering", async () => {
    const id = "did:test:race";
    await updateUser(id, { transactions: [] });

    const mk = (n: number) => ({
      id: `t${n}`,
      direction: "send" as const,
      amount: "1",
      currency: "USDC",
      status: "x",
      createdAt: new Date().toISOString(),
    });

    await Promise.all(
      Array.from({ length: 10 }, (_, n) =>
        updateUser(id, (cur) => ({ transactions: [mk(n), ...(cur?.transactions ?? [])] }))
      )
    );

    const final = await getUser(id);
    expect(final?.transactions).toHaveLength(10); // none lost
  });
});
