/**
 * Shared input validation used by API routes and the client. Pure and
 * dependency-free so it's trivially unit-testable and safe to import anywhere.
 */

export const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const AMOUNT_REGEX = /^\d+(\.\d{1,6})?$/;
/** Client-supplied idempotency token for sends (UUID-ish). */
export const REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;
/** Persona inquiry id, e.g. inq_ABC123. */
export const PERSONA_INQUIRY_REGEX = /^inq_[A-Za-z0-9]+$/;

export function isValidAmount(amount: unknown): amount is string {
  return (
    typeof amount === "string" &&
    AMOUNT_REGEX.test(amount.trim()) &&
    parseFloat(amount) > 0
  );
}

export function isValidAddress(address: unknown): address is string {
  return typeof address === "string" && HEX_ADDRESS_REGEX.test(address.trim());
}

export function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && REQUEST_ID_REGEX.test(id);
}

export function isValidInquiryId(id: unknown): id is string {
  return typeof id === "string" && PERSONA_INQUIRY_REGEX.test(id);
}

/** US ABA routing number: exactly 9 digits. */
export function isValidRoutingNumber(value: unknown): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value.trim());
}

/** US bank account number: 4–17 digits. */
export function isValidAccountNumber(value: unknown): value is string {
  return typeof value === "string" && /^\d{4,17}$/.test(value.trim());
}

export function last4(value: string): string {
  return value.trim().slice(-4);
}
