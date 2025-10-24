/**
 * Script to retrieve existing company wallet details
 *
 * Usage:
 *   SUB_ORG_ID=<sub-org-id> npx tsx scripts/get-company-wallet-details.ts
 */

import { Turnkey } from "@turnkey/sdk-server";

async function getWalletDetails() {
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const subOrgId = process.env.SUB_ORG_ID;

  if (!apiPublicKey || !apiPrivateKey || !subOrgId) {
    console.error("Missing required environment variables:");
    console.error("- TURNKEY_API_PUBLIC_KEY");
    console.error("- TURNKEY_API_PRIVATE_KEY");
    console.error("- SUB_ORG_ID");
    process.exit(1);
  }

  console.log("Fetching wallet details...\n");

  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey,
    apiPrivateKey,
    defaultOrganizationId: subOrgId,
  });

  const client = turnkey.apiClient();

  try {
    const walletsResponse = await client.getWallets({
      organizationId: subOrgId,
    });

    console.log("Wallets:", JSON.stringify(walletsResponse, null, 2));

    if (!walletsResponse.wallets || walletsResponse.wallets.length === 0) {
      console.error("No wallets found in sub-organization");
      process.exit(1);
    }

    const wallet = walletsResponse.wallets[0];
    const walletId = wallet.walletId;

    const accountsResponse = await client.getWalletAccounts({
      organizationId: subOrgId,
      walletId,
    });

    const walletAddress = accountsResponse.accounts?.[0]?.address;

    console.log("\n✅ Company wallet details:\n");
    console.log("─".repeat(80));
    console.log(`COMPANY_WALLET_SUB_ORG_ID=${subOrgId}`);
    console.log(`COMPANY_WALLET_ID=${walletId}`);
    console.log(`COMPANY_WALLET_ADDRESS=${walletAddress}`);
    console.log("─".repeat(80));

  } catch (error) {
    console.error("Failed to fetch wallet details:", error);
    process.exit(1);
  }
}

getWalletDetails();
