import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedTransactionFromActivity } from "@turnkey/http";
import { createPublicClient, encodeFunctionData, formatEther, http, parseAbi, serializeTransaction } from "viem";
import type { Address, Hex } from "viem";
import { base } from "viem/chains";

import { getTurnkeyApiClient, isTurnkeyConfigured } from "@/lib/turnkey/server";
import type { TurnkeySDKApiTypes } from "@turnkey/sdk-server";

const TRANSFERS_TABLE = "blue-wallet-transfers";
const BASE_USDC_CONTRACT = (process.env.BASE_USDC_CONTRACT ?? "0x833589fCD6edb6E08f4c7C0dC1bC64ED875FfC4d").toLowerCase();
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type PublicClientType = ReturnType<typeof createPublicClient>;

type TransferRecord = {
  recipientKey: string;
  transferId: string;
  walletId: string;
  walletAddress: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "WITHDRAWN";
  withdrawalTxHash?: string;
  withdrawalTargetAddress?: string;
};

function normalizeAddress(address: string): string {
  return address.trim();
}

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function centsToUsdcUnits(amountCents: number): bigint {
  return BigInt(amountCents) * 10000n; // convert cents (1e2) to micro units (1e6)
}

async function findTransferById(transferId: string): Promise<TransferRecord | null> {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "transferId = :transferId",
      ExpressionAttributeValues: {
        ":transferId": transferId,
      },
    })
  );

  const record = response.Items?.[0] as TransferRecord | undefined;
  return record ?? null;
}

function createBasePublicClient(): PublicClientType {
  return createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });
}

async function fetchFeeData(publicClient: PublicClientType) {
  try {
    const feeData = await publicClient.estimateFeesPerGas();
    if (feeData) {
      const fallback = await publicClient.getGasPrice();
      const maxFeePerGas = feeData.maxFeePerGas ?? feeData.maxPriorityFeePerGas ?? fallback;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? feeData.maxFeePerGas ?? fallback;
      return { maxFeePerGas, maxPriorityFeePerGas };
    }
  } catch (error) {
    console.warn("Failed to estimate fees per gas, falling back to gasPrice", error);
  }

  const gasPrice = await publicClient.getGasPrice();
  return {
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
  };
}

async function prepareWithdrawalTransaction({
  publicClient,
  walletAddress,
  destination,
  amountUnits,
}: {
  publicClient: PublicClientType;
  walletAddress: Address;
  destination: Address;
  amountUnits: bigint;
}) {
  const contractAddress = BASE_USDC_CONTRACT as Address;

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [destination, amountUnits],
  });

  const nonce = await publicClient.getTransactionCount({ address: walletAddress });

  const gasLimit = await publicClient.estimateGas({
    account: walletAddress,
    to: contractAddress,
    value: 0n,
    data,
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await fetchFeeData(publicClient);

  const unsignedTransaction = serializeTransaction({
    type: "eip1559",
    chainId: base.id,
    nonce,
    to: contractAddress,
    value: 0n,
    gas: gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data,
  });

  const totalFeeWei = gasLimit * maxFeePerGas;

  return {
    unsignedTransaction: unsignedTransaction as Hex,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    totalFeeWei,
  };
}

async function buildWithdrawalQuote({
  publicClient,
  walletAddress,
  destination,
  amountUnits,
}: {
  publicClient: PublicClientType;
  walletAddress: Address;
  destination: Address;
  amountUnits: bigint;
}) {
  const prepared = await prepareWithdrawalTransaction({
    publicClient,
    walletAddress,
    destination,
    amountUnits,
  });

  const bufferedTotalFeeWei = (prepared.totalFeeWei * BigInt(125) + BigInt(99)) / BigInt(100);
  const walletBalanceWei = await publicClient.getBalance({ address: walletAddress });
  const topUpWei = bufferedTotalFeeWei > walletBalanceWei ? bufferedTotalFeeWei - walletBalanceWei : 0n;

  return {
    ...prepared,
    totalFeeWei: bufferedTotalFeeWei,
    walletBalanceWei,
    topUpWei,
  };
}

type RouteParams = {
  transferId: string;
};

type RouteContext = {
  params: Promise<RouteParams> | RouteParams;
};

export async function POST(request: Request, context: RouteContext) {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_NOT_CONFIGURED",
        message: "Turnkey is not configured on the server.",
      },
      { status: 500 }
    );
  }

  const resolvedParams = await Promise.resolve(context.params);
  const { transferId } = resolvedParams ?? {};

  if (!transferId) {
    return NextResponse.json(
      {
        error: "MISSING_TRANSFER_ID",
        message: "transferId parameter is required.",
      },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  const targetAddressInput =
    typeof body === "object" && body && "targetAddress" in body
      ? normalizeAddress(String((body as { targetAddress?: unknown }).targetAddress ?? ""))
      : "";

  if (!isHexAddress(targetAddressInput)) {
    return NextResponse.json(
      {
        error: "INVALID_TARGET_ADDRESS",
        message: "A valid Base wallet address (0x...) is required.",
      },
      { status: 400 }
    );
  }

  const turnkeyClient = getTurnkeyApiClient();

  if (!turnkeyClient) {
    return NextResponse.json(
      {
        error: "TURNKEY_CLIENT_ERROR",
        message: "Unable to initialize Turnkey client.",
      },
      { status: 500 }
    );
  }

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_FOUND",
        message: "No transfer record matches the supplied transferId.",
      },
      { status: 404 }
    );
  }

  if (record.status === "WITHDRAWN") {
    return NextResponse.json(
      {
        error: "ALREADY_WITHDRAWN",
        message: "This transfer has already been withdrawn.",
      },
      { status: 409 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer status must be DEPOSITED to withdraw (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  const walletAddress = normalizeAddress(record.walletAddress);

  if (!isHexAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: "INVALID_WALLET_ADDRESS",
        message: "Stored wallet address for this transfer is invalid.",
      },
      { status: 500 }
    );
  }

  const amountUnits = centsToUsdcUnits(record.amountCents ?? Math.round(Number(record.amount) * 100));

  if (amountUnits <= 0n) {
    return NextResponse.json(
      {
        error: "INVALID_AMOUNT",
        message: "Transfer amount must be greater than zero.",
      },
      { status: 400 }
    );
  }

  const publicClient = createBasePublicClient();
  const destination = targetAddressInput as Address;

  try {
    const quote = await buildWithdrawalQuote({
      publicClient,
      walletAddress: walletAddress as Address,
      destination,
      amountUnits,
    });

    if (quote.topUpWei > 0n) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_GAS",
          message: `Managed wallet requires ${formatEther(quote.topUpWei)} ETH for gas. Top up before withdrawing.`,
          requiredTopUpWei: quote.topUpWei.toString(),
        },
        { status: 400 }
      );
    }

    const activity: TurnkeySDKApiTypes.TSignTransactionResponse = await turnkeyClient.signTransaction({
      signWith: walletAddress,
      unsignedTransaction: quote.unsignedTransaction,
      type: "TRANSACTION_TYPE_ETHEREUM",
    });

    const signedTransaction = getSignedTransactionFromActivity(activity.activity) as Hex;

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });

    const timestamp = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TRANSFERS_TABLE,
        Key: {
          recipientKey: record.recipientKey,
          transferId: record.transferId,
        },
        UpdateExpression:
          "SET #status = :status, withdrawalTxHash = :txHash, withdrawalTargetAddress = :targetAddress, withdrawnAt = :withdrawnAt, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "WITHDRAWN",
          ":txHash": txHash,
          ":targetAddress": destination,
          ":withdrawnAt": timestamp,
          ":updatedAt": timestamp,
        },
      })
    );

    return NextResponse.json({
      success: true,
      txHash,
    });
  } catch (error) {
    console.error("Transfer withdrawal failed:", error);

    return NextResponse.json(
      {
        error: "WITHDRAWAL_FAILED",
        message: error instanceof Error ? error.message : "Failed to broadcast withdrawal transaction.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const { transferId } = resolvedParams ?? {};

  if (!transferId) {
    return NextResponse.json(
      {
        error: "MISSING_TRANSFER_ID",
        message: "transferId parameter is required.",
      },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetAddressInput = normalizeAddress(searchParams.get("targetAddress") ?? "");

  if (!isHexAddress(targetAddressInput)) {
    return NextResponse.json(
      {
        error: "INVALID_TARGET_ADDRESS",
        message: "A valid Base wallet address (0x...) is required.",
      },
      { status: 400 }
    );
  }

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_FOUND",
        message: "No transfer record matches the supplied transferId.",
      },
      { status: 404 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer status must be DEPOSITED to quote withdrawal gas (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  const walletAddress = normalizeAddress(record.walletAddress);

  if (!isHexAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: "INVALID_WALLET_ADDRESS",
        message: "Stored wallet address for this transfer is invalid.",
      },
      { status: 500 }
    );
  }

  const amountUnits = centsToUsdcUnits(record.amountCents ?? Math.round(Number(record.amount) * 100));

  if (amountUnits <= 0n) {
    return NextResponse.json(
      {
        error: "INVALID_AMOUNT",
        message: "Transfer amount must be greater than zero to quote withdrawal.",
      },
      { status: 400 }
    );
  }

  const publicClient = createBasePublicClient();
  const destination = targetAddressInput as Address;

  try {
    const quote = await buildWithdrawalQuote({
      publicClient,
      walletAddress: walletAddress as Address,
      destination,
      amountUnits,
    });

    return NextResponse.json({
      success: true,
      transferId,
      walletAddress: record.walletAddress,
      destination,
      amount: record.amount,
      amountCents: record.amountCents,
      gasLimit: quote.gasLimit.toString(),
      maxFeePerGasWei: quote.maxFeePerGas.toString(),
      maxPriorityFeePerGasWei: quote.maxPriorityFeePerGas.toString(),
      totalFeeWei: quote.totalFeeWei.toString(),
      totalFeeEth: formatEther(quote.totalFeeWei),
      walletBalanceWei: quote.walletBalanceWei.toString(),
      walletBalanceEth: formatEther(quote.walletBalanceWei),
      topUpWei: quote.topUpWei.toString(),
      topUpEth: formatEther(quote.topUpWei),
      hasSufficientBalance: quote.topUpWei === 0n,
      chainId: base.id,
    });
  } catch (error) {
    console.error("Withdrawal quote failed:", error);

    return NextResponse.json(
      {
        error: "WITHDRAWAL_QUOTE_FAILED",
        message: error instanceof Error ? error.message : "Unable to compute withdrawal quote.",
      },
      { status: 500 }
    );
  }
}
