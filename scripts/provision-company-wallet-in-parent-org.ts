/**
 * Provision company wallet directly in the parent organization
 *
 * This creates a wallet in the parent org instead of a sub-org,
 * avoiding the permission issues with sub-org wallets.
 *
 * Usage:
 *   npx tsx scripts/provision-company-wallet-in-parent-org.ts
 *
 * After running, update your .env.local:
 *   COMPANY_WALLET_ID=... (new wallet ID)
 *   COMPANY_WALLET_ADDRESS=... (new wallet address)
 *   # Remove COMPANY_WALLET_SUB_ORG_ID - no longer needed
 */

import { Turnkey, defaultEthereumAccountAtIndex } from "@turnkey/sdk-server";

async function provisionCompanyWallet() {
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID ?? process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;

  if (!apiPublicKey || !apiPrivateKey || !organizationId) {
    console.error("Missing required environment variables:");
    console.error("- TURNKEY_API_PUBLIC_KEY");
    console.error("- TURNKEY_API_PRIVATE_KEY");
    console.error("- TURNKEY_ORGANIZATION_ID (or NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID)");
    process.exit(1);
  }

  console.log("Creating company wallet in parent organization...\n");

  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey,
    apiPrivateKey,
    defaultOrganizationId: organizationId,
  });

  const client = turnkey.apiClient();

  try {
    const response = await client.createWallet({
      organizationId,
      walletName: "BlueWallet Company Vault",
      accounts: [defaultEthereumAccountAtIndex(0)],
    });

    const walletId = response.walletId;
    const walletAddress = response.addresses?.[0];

    console.log("✅ Company wallet created successfully!\n");
    console.log("Update these in your .env.local file:\n");
    console.log("─".repeat(80));
    console.log(`COMPANY_WALLET_ID=${walletId}`);
    console.log(`COMPANY_WALLET_ADDRESS=${walletAddress}`);
    console.log(`NEXT_PUBLIC_COMPANY_WALLET_ADDRESS=${walletAddress}`);
    console.log("─".repeat(80));
    console.log("\nRemove this line from .env.local:");
    console.log("COMPANY_WALLET_SUB_ORG_ID=...");
    console.log("\nIMPORTANT: Save these values - you won't be able to retrieve them later!");
    console.log("\nNext steps:");
    console.log("1. Update the above variables in .env.local");
    console.log("2. Fund the wallet with ETH for gas (on Base network)");
    console.log("3. Transfer any existing USDC from the old wallet to this new one");
    console.log("4. Restart your development server");

  } catch (error) {
    console.error("Failed to create company wallet:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    process.exit(1);
  }
}

provisionCompanyWallet();
