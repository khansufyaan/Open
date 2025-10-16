import { NextResponse } from "next/server";
import { TurnkeyRequestError, defaultEthereumAccountAtIndex } from "@turnkey/sdk-server";

import {
  getTurnkeyApiClient,
  isTurnkeyConfigured,
} from "@/lib/turnkey/server";

type TurnkeyTimestamp = {
  seconds?: string;
  nanos?: string;
};

type WalletSummary = {
  walletId: string;
  walletName: string;
  createdAt: string | null;
  updatedAt: string | null;
  exported: boolean;
  imported: boolean;
  accounts: Array<{
    walletAccountId: string;
    address: string;
    addressFormat: string;
    curve: string;
    path: string;
  }>;
};

function toIso(timestamp?: TurnkeyTimestamp): string | null {
  if (!timestamp?.seconds) {
    return null;
  }

  const seconds = Number(timestamp.seconds);
  const nanos = Number(timestamp.nanos ?? "0");

  if (Number.isNaN(seconds)) {
    return null;
  }

  const millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(millis).toISOString();
}

async function buildWalletSummaries() {
  const client = getTurnkeyApiClient();

  if (!client) {
    throw new Error("Unable to initialize Turnkey client.");
  }

  const response = await client.getWallets({});
  const walletList = response.wallets ?? [];

  const summaries = await Promise.all(
    walletList.map(async (wallet) => {
      const accountsResponse = await client.getWalletAccounts({
        walletId: wallet.walletId,
      });

      const accounts = (accountsResponse.accounts ?? []).map((account) => ({
        walletAccountId: account.walletAccountId,
        address: account.address,
        addressFormat: account.addressFormat,
        curve: account.curve,
        path: account.path,
      }));

      return {
        walletId: wallet.walletId,
        walletName: wallet.walletName,
        createdAt: toIso(wallet.createdAt),
        updatedAt: toIso(wallet.updatedAt),
        exported: wallet.exported,
        imported: wallet.imported,
        accounts,
      } satisfies WalletSummary;
    })
  );

  return summaries.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
}

export async function GET() {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_SERVER_NOT_CONFIGURED",
        message: "Turnkey API keys are missing on the server.",
      },
      { status: 500 }
    );
  }

  try {
    const wallets = await buildWalletSummaries();
    return NextResponse.json({ wallets });
  } catch (error) {
    if (error instanceof TurnkeyRequestError) {
      return NextResponse.json(
        {
          error: error.code ?? "TURNKEY_GET_WALLETS_FAILED",
          message: error.message,
          details: error.details ?? null,
        },
        { status: 502 }
      );
    }

    console.error("Turnkey list wallets failed", error);
    return NextResponse.json(
      {
        error: "TURNKEY_GET_WALLETS_FAILED",
        message: "Unexpected error listing Turnkey wallets.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_SERVER_NOT_CONFIGURED",
        message: "Turnkey API keys are missing on the server.",
      },
      { status: 500 }
    );
  }

  const client = getTurnkeyApiClient();

  if (!client) {
    return NextResponse.json(
      {
        error: "TURNKEY_CLIENT_ERROR",
        message: "Unable to initialize Turnkey client.",
      },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const walletNameInput =
    typeof body === "object" && body && "walletName" in body
      ? String((body as { walletName?: unknown }).walletName ?? "")
      : "";

  const timestampLabel = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const walletName = walletNameInput.trim() || `Wallet ${timestampLabel}`;

  try {
    await client.createWallet({
      walletName,
      accounts: [defaultEthereumAccountAtIndex(0)],
    });

    const wallets = await buildWalletSummaries();
    return NextResponse.json({ wallets });
  } catch (error) {
    if (error instanceof TurnkeyRequestError) {
      return NextResponse.json(
        {
          error: error.code ?? "TURNKEY_CREATE_WALLET_FAILED",
          message: error.message,
          details: error.details ?? null,
        },
        { status: 502 }
      );
    }

    console.error("Turnkey create wallet failed", error);
    return NextResponse.json(
      {
        error: "TURNKEY_CREATE_WALLET_FAILED",
        message: "Unexpected error creating Turnkey wallet.",
      },
      { status: 500 }
    );
  }
}
