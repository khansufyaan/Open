import { Turnkey, TurnkeyApiClient } from "@turnkey/sdk-server";

const baseUrl =
  process.env.TURNKEY_API_HOST ??
  process.env.TURNKEY_BASE_URL ??
  process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL ??
  "https://api.turnkey.com";

const organizationId =
  process.env.TURNKEY_ORGANIZATION_ID ?? process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ?? null;

function createTurnkeyInstance() {
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;

  if (!apiPublicKey || !apiPrivateKey || !organizationId) {
    return null;
  }

  return new Turnkey({
    apiBaseUrl: baseUrl,
    apiPublicKey,
    apiPrivateKey,
    defaultOrganizationId: organizationId,
  });
}

export function getTurnkeyApiClient(): TurnkeyApiClient | null {
  const turnkey = createTurnkeyInstance();
  if (!turnkey) {
    return null;
  }

  return turnkey.apiClient();
}

export function getTurnkeyOrganizationId(): string | null {
  return organizationId;
}

export function isTurnkeyConfigured(): boolean {
  return Boolean(
    process.env.TURNKEY_API_PUBLIC_KEY &&
      process.env.TURNKEY_API_PRIVATE_KEY &&
      organizationId
  );
}
