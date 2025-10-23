# Receiver Matching Safeguards

## Overview
- Every transfer stores a SHA-256 hash of the sender’s raw routing/account digits (`sha256(<routing>|<account>)`).
- We also persist masked routing/account strings, the last four digits, the tokenized Plaid coordinates, transfer amount (in cents), wallet metadata, and timestamps.
- When a recipient links Plaid we try to resolve their transfer in two passes: exact hash first, then a constrained fallback.

## Matching Pipeline
1. **Exact hash lookup**
   - We sanitize Plaid’s routing/account digits and recompute the hash.
   - A DynamoDB query on `recipientKey` returns the transfer immediately when Plaid echoes the sender’s digits (most non-tokenizing banks).
2. **Fallback lookup**
   - If the hash path misses (e.g., Chase tokenizes ACH numbers), we fall back to `recipientLast4` **and** `amountCents`.
   - We scan DynamoDB for matching last-four + amount, sort by `createdAt`, and return the latest record only.

## Persisted Bank Coordinates
- `plaidAchAccounts` captures the Plaid `account_id`, tokenized routing/account numbers, optional wire routing, and the Plaid-supplied `mask` (original last four).
- These records let us display the institution mask verbatim and audit which bank (via ABA) each wallet was provisioned for, even if digits are tokenized.

## Collision Mitigation
- The fallback path requires two conditions: matching bank mask and exact transfer amount. The probability of an accidental collision stays low until very high volume.
- If no record satisfies both, the UI shows “No transfers found” and the managed wallet remains locked—funds aren’t lost, they’re simply unclaimed.

## Operational Notes
- The `/api/transfers` endpoint already supports an `amount` query parameter; wiring the client to pass the amount (in dollars) ensures the amount filter is active.
- We log and persist Plaid link metadata (`plaidItemId`, `plaidLastLinkedAt`, identity snapshot) to support audits and fraud investigations.

## Future Hardening Roadmap
- Persist Plaid `account_id` alongside transfer records to eliminate reliance on masks for fallback.
- Issue claim tokens (or identity anchors) that the sender can pass to the recipient, enabling deterministic matching even if bank digits change.
- Track deposit events (e.g., ACH settlement records) to reconcile actual bank movements against Plaid-link claims.
