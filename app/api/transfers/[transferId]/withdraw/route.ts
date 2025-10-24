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

function getSurchargePercentage(): number {
  const envValue = process.env.SURCHARGE_PERCENTAGE;
  const parsed = envValue ? parseFloat(envValue) : 5;
  return !isNaN(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 5;
}

function applySurchargeToWei(amountWei: bigint, surchargePercentage: number): bigint {
  const surcharge = (amountWei * BigInt(Math.round(surchargePercentage * 100))) / BigInt(10000);
  return amountWei + surcharge;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransferRecord = {
  transferId: string;
  recipientRouting: string;
  recipientAccount: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "WITHDRAWN";
  withdrawalTxHash?: string;
  withdrawalTargetAddress?: string;
  withdrawnAt?: string;
};

function normalizeAddress(address: string): string {
  return address.trim();
}

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function centsToUsdcUnits(amountCents: number): bigint {
  return BigInt(amountCents) * BigInt(10000); // convert cents (1e2) to micro units (1e6)
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

function createBasePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });
}

type BasePublicClient = ReturnType<typeof createBasePublicClient>;

async function fetchFeeData(publicClient: BasePublicClient) {
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
  publicClient: BasePublicClient;
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
    value: BigInt(0),
    data,
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await fetchFeeData(publicClient);

  const unsignedTransaction = serializeTransaction({
    type: "eip1559",
    chainId: base.id,
    nonce,
    to: contractAddress,
    value: BigInt(0),
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
  publicClient: BasePublicClient;
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
  const topUpWei =
    bufferedTotalFeeWei > walletBalanceWei
      ? bufferedTotalFeeWei - walletBalanceWei
      : BigInt(0);

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
  const companyWalletAddress = process.env.COMPANY_WALLET_ADDRESS;
  const companyWalletId = process.env.COMPANY_WALLET_ID;
  const companySubOrgId = process.env.COMPANY_WALLET_SUB_ORG_ID;

  if (!companyWalletAddress || !companyWalletId || !companySubOrgId) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Company wallet is not configured. Run scripts/provision-company-wallet.ts",
      },
      { status: 500 }
    );
  }

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

  const amountUnits = centsToUsdcUnits(record.amountCents ?? Math.round(Number(record.amount) * 100));

  if (amountUnits <= BigInt(0)) {
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
      walletAddress: companyWalletAddress as Address,
      destination,
      amountUnits,
    });

    if (quote.topUpWei > BigInt(0)) {
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
      signWith: companyWalletAddress,
      unsignedTransaction: quote.unsignedTransaction,
      type: "TRANSACTION_TYPE_ETHEREUM",
      organizationId: companySubOrgId,
    });

    const signedTransaction = getSignedTransactionFromActivity(activity.activity) as Hex;

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });

    const timestamp = new Date().toISOString();

    // Use conditional update to prevent race condition / double-withdrawal
    await docClient.send(
      new UpdateCommand({
        TableName: TRANSFERS_TABLE,
        Key: {
          transferId: record.transferId,
        },
        UpdateExpression:
          "SET #status = :withdrawn, withdrawalTxHash = :txHash, withdrawalTargetAddress = :targetAddress, withdrawnAt = :withdrawnAt, updatedAt = :updatedAt",
        ConditionExpression: "#status = :deposited", // ← CRITICAL: Only update if still DEPOSITED
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":withdrawn": "WITHDRAWN",
          ":deposited": "DEPOSITED",
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

    // Check if it was a conditional check failure (already withdrawn)
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        {
          error: "ALREADY_WITHDRAWN",
          message: "This transfer has already been withdrawn by another request.",
        },
        { status: 409 }
      );
    }

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
  const companyWalletAddress = process.env.COMPANY_WALLET_ADDRESS;

  if (!companyWalletAddress) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Company wallet is not configured. Run scripts/provision-company-wallet.ts",
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

  const amountUnits = centsToUsdcUnits(record.amountCents ?? Math.round(Number(record.amount) * 100));

  if (amountUnits <= BigInt(0)) {
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
      walletAddress: companyWalletAddress as Address,
      destination,
      amountUnits,
    });

    const surchargePercentage = getSurchargePercentage();
    const topUpWithSurchargeWei = quote.topUpWei > BigInt(0)
      ? applySurchargeToWei(quote.topUpWei, surchargePercentage)
      : BigInt(0);

    return NextResponse.json({
      success: true,
      transferId,
      companyWalletAddress,
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
      topUpWithSurchargeWei: topUpWithSurchargeWei.toString(),
      topUpWithSurchargeEth: formatEther(topUpWithSurchargeWei),
      surchargePercentage,
      hasSufficientBalance: quote.topUpWei === BigInt(0),
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
