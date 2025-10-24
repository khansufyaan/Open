/**
 * One-time script to provision the company wallet for Blue Wallet
 *
 * This creates a Turnkey sub-organization with a single Ethereum wallet
 * that will be used to receive ALL deposits from senders.
 *
 * Usage:
 *   npx tsx scripts/provision-company-wallet.ts
 *
 * After running, add the output values to your .env.local:
 *   COMPANY_WALLET_SUB_ORG_ID=...
 *   COMPANY_WALLET_ID=...
 *   COMPANY_WALLET_ADDRESS=...
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

  console.log("Creating Turnkey company wallet...\n");

  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey,
    apiPrivateKey,
    defaultOrganizationId: organizationId,
  });

  const client = turnkey.apiClient();

  try {
    const response = await client.createSubOrganization({
      organizationId,
      subOrganizationName: "Blue Wallet Company Pool",
      rootUsers: [
        {
          userName: "Company Wallet Admin",
          userEmail: "company-wallet@bluewallet.internal",
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        },
      ],
      rootQuorumThreshold: 1,
      wallet: {
        walletName: "Company Deposit Wallet",
        accounts: [defaultEthereumAccountAtIndex(0)],
      },
    });

    console.log("Response:", JSON.stringify(response, null, 2));

    const subOrgId = response.subOrganizationId;
    const walletId = response.wallet?.walletId ?? response.walletIds?.[0];
    const walletAddress = response.wallet?.addresses?.[0] ?? response.walletAddresses?.[0];

    console.log("✅ Company wallet created successfully!\n");
    console.log("Add these to your .env.local file:\n");
    console.log("─".repeat(80));
    console.log(`COMPANY_WALLET_SUB_ORG_ID=${subOrgId}`);
    console.log(`COMPANY_WALLET_ID=${walletId}`);
    console.log(`COMPANY_WALLET_ADDRESS=${walletAddress}`);
    console.log("─".repeat(80));
    console.log("\nIMPORTANT: Save these values - you won't be able to retrieve them later!");
    console.log("\nNext steps:");
    console.log("1. Add the above variables to .env.local");
    console.log("2. Fund the wallet with ETH for gas (on Base network)");
    console.log("3. Senders will deposit USDC to this address");

  } catch (error) {
    console.error("Failed to create company wallet:", error);
    process.exit(1);
  }
}

provisionCompanyWallet();
