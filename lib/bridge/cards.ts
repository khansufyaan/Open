import { createHash } from "crypto";

import {
  requestCardsEndorsement,
  createCardAccount,
  isBridgeConfigured,
  BridgeRequestError,
  type BridgeCardAccount,
} from "@/lib/bridge/server";
import { updateUser } from "@/lib/db/store";
import type { CardDetails, UserRecord } from "@/types/user";

/**
 * Issues a stablecoin-backed card for a user. Attempts real Bridge issuance
 * when possible; otherwise (Bridge unconfigured, or the Cards product not yet
 * enabled on the account) returns a clearly-labeled demo card so the UX is
 * visible. A demo card is upgraded to a real one on a later attempt once cards
 * are enabled.
 */

function mapCard(card: BridgeCardAccount): CardDetails {
  const details = card.card_details ?? {};
  const expMonth = details.expiry_month;
  const expYear = details.expiry_year;
  return {
    id: card.id,
    brand: details.brand ?? card.brand ?? "visa",
    last4: details.last_4 ?? details.last4 ?? card.last_4 ?? "0000",
    expMonth: expMonth != null ? Number(expMonth) : undefined,
    expYear: expYear != null ? Number(expYear) : undefined,
    status: card.status ?? "active",
    type: card.type ?? "virtual",
    source: "bridge",
  };
}

function demoCard(userId: string): CardDetails {
  const hash = createHash("sha256").update(`card:${userId}`).digest("hex");
  let last4 = "";
  for (const char of hash) {
    last4 += (parseInt(char, 16) % 10).toString();
    if (last4.length >= 4) break;
  }
  return {
    id: `demo_card_${userId.slice(-8)}`,
    brand: "visa",
    last4: last4.slice(0, 4),
    expMonth: 12,
    expYear: new Date().getFullYear() + 3,
    status: "active",
    type: "virtual",
    source: "demo",
  };
}

export type IssueCardResult = { card: CardDetails; note?: string };

export async function issueCard(user: UserRecord): Promise<IssueCardResult> {
  // A real card already exists — return it.
  if (user.card?.source === "bridge") {
    return { card: user.card };
  }

  // Demo when Bridge isn't usable for cards yet.
  if (!isBridgeConfigured() || !user.bridgeCustomerId || !user.walletAddress) {
    const card = demoCard(user.userId);
    await updateUser(user.userId, { card });
    return {
      card,
      note: isBridgeConfigured()
        ? "Finish onboarding to issue a real card."
        : "Demo card — set a Bridge API key to issue a real one.",
    };
  }

  try {
    // The cards endorsement may already be present or shaped differently;
    // tolerate failure and proceed to card creation.
    try {
      await requestCardsEndorsement(user.bridgeCustomerId);
    } catch (endorseError) {
      console.warn("[Cards] Endorsement request did not succeed (continuing):", endorseError);
    }

    const created = await createCardAccount({
      customerId: user.bridgeCustomerId,
      walletId: user.bridgeWalletId,
      walletAddress: user.walletAddress,
      idempotencyKey: `card-${user.userId}`,
    });

    const card = mapCard(created);
    await updateUser(user.userId, { card });
    return { card };
  } catch (error) {
    // Most likely the Cards product isn't enabled on this Bridge account yet.
    // Fall back to a demo card with a clear explanation.
    console.error("[Cards] Real card issuance failed, using demo card:", error);
    const card = demoCard(user.userId);
    await updateUser(user.userId, { card });
    const reason =
      error instanceof BridgeRequestError
        ? error.message
        : "Cards aren't enabled on your Bridge account yet.";
    return { card, note: `Showing a demo card — ${reason}` };
  }
}
