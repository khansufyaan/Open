import { NextResponse } from "next/server";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedTransactionFromActivity } from "@turnkey/http";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  serializeTransaction,
} from "viem";
import type { Address, Hex } from "viem";
import { base } from "viem/chains";

import { getTurnkeyApiClient, getTurnkeyOrganizationId, isTurnkeyConfigured } from "@/lib/turnkey/server";
import type { TurnkeySDKApiTypes } from "@turnkey/sdk-server";

const TRANSFERS_TABLE = "blue-wallet-transfers";
const BASE_USDC_CONTRACT = (process.env.BASE_USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase();
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address who) view returns (uint256)",
]);

type TransferRecord = {
  transferId: string;
  recipientKey: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "CLAIMED" | "WITHDRAWN";
  walletAddress?: string;
  walletId?: string;
  walletName?: string;
  fundingStatus?: string;
  fundingTxHash?: string;
  claimedAt?: string;
  claimTxHash?: string;
  depositAddress?: string;
};

function centsToUsdcUnits(amountCents: number): bigint {
  return BigInt(amountCents) * BigInt(10_000);
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type RouteParams = {
  transferId: string;
};

type RouteContext = {
  params: Promise<RouteParams> | RouteParams;
};

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

async function prepareVaultTransfer({
  publicClient,
  from,
  destination,
  amountUnits,
}: {
  publicClient: BasePublicClient;
  from: Address;
  destination: Address;
  amountUnits: bigint;
}) {
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [destination, amountUnits],
  });

  const nonce = await publicClient.getTransactionCount({ address: from });

  const gasLimit = await publicClient.estimateGas({
    account: from,
    to: BASE_USDC_CONTRACT as Address,
    data,
    value: 0n,
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await fetchFeeData(publicClient);

  const unsignedTransaction = serializeTransaction({
    type: "eip1559",
    chainId: base.id,
    nonce,
    to: BASE_USDC_CONTRACT as Address,
    value: 0n,
    gas: gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data,
  });

  return {
    unsignedTransaction: unsignedTransaction as Hex,
  };
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

  const record = (response.Items ?? [])[0] as TransferRecord | undefined;
  return record ?? null;
}

export async function POST(request: Request, context: RouteContext) {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_NOT_CONFIGURED",
        message: "Turnkey server credentials are missing.",
      },
      { status: 500 }
    );
  }

  const companyWalletAddress = process.env.COMPANY_WALLET_ADDRESS;
  const companyWalletId = process.env.COMPANY_WALLET_ID;

  if (!companyWalletAddress || !companyWalletId) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Company wallet credentials are missing.",
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

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_FOUND",
        message: "No transfer matched the provided transferId.",
      },
      { status: 404 }
    );
  }

  if (!record.walletAddress) {
    return NextResponse.json(
      {
        error: "RECIPIENT_WALLET_MISSING",
        message: "Transfer is missing a provisioned recipient wallet.",
      },
      { status: 409 }
    );
  }

  if (record.status === "CLAIMED" || record.status === "WITHDRAWN") {
    return NextResponse.json(
      {
        error: "ALREADY_CLAIMED",
        message: "This transfer has already been claimed.",
      },
      { status: 409 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer must be DEPOSITED before claim (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  const amountUnits = centsToUsdcUnits(record.amountCents ?? Math.round(Number(record.amount) * 100));

  if (amountUnits <= 0n) {
    return NextResponse.json(
      {
        error: "INVALID_AMOUNT",
        message: "Transfer amount must be greater than zero to claim.",
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

  const parentOrgId = getTurnkeyOrganizationId();

  if (!parentOrgId) {
    return NextResponse.json(
      {
        error: "TURNKEY_ORG_NOT_CONFIGURED",
        message: "Turnkey organization ID is missing.",
      },
      { status: 500 }
    );
  }

  const publicClient = createBasePublicClient();

  try {
    const vaultBalance = (await publicClient.readContract({
      address: BASE_USDC_CONTRACT as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [companyWalletAddress as Address],
    })) as bigint;

    if (vaultBalance < amountUnits) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_VAULT_BALANCE",
          message:
            "Company vault does not hold enough USDC for this claim yet. Give the sender transaction time to confirm.",
          availableUsdc: vaultBalance.toString(),
          requiredUsdc: amountUnits.toString(),
        },
        { status: 409 }
      );
    }

    const prepared = await prepareVaultTransfer({
      publicClient,
      from: companyWalletAddress as Address,
      destination: record.walletAddress as Address,
      amountUnits,
    });

    const activity: TurnkeySDKApiTypes.TSignTransactionResponse = await turnkeyClient.signTransaction({
      organizationId: parentOrgId,
      signWith: companyWalletAddress,
      unsignedTransaction: prepared.unsignedTransaction,
      type: "TRANSACTION_TYPE_ETHEREUM",
    });

    const signedTransaction = getSignedTransactionFromActivity(activity.activity) as Hex;

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const timestamp = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TRANSFERS_TABLE,
        Key: {
          recipientKey: record.recipientKey,
          transferId: record.transferId,
        },
        UpdateExpression:
          "SET #status = :claimed, claimTxHash = :txHash, claimedAt = :claimedAt, updatedAt = :updatedAt",
        ConditionExpression: "#status = :deposited",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":claimed": "CLAIMED",
          ":deposited": "DEPOSITED",
          ":txHash": txHash,
          ":claimedAt": timestamp,
          ":updatedAt": timestamp,
        },
      })
    );

    return NextResponse.json({
      success: true,
      txHash,
    });
  } catch (error) {
    console.error("Transfer claim failed:", error);

    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        {
          error: "ALREADY_CLAIMED",
          message: "This transfer has already been claimed.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "CLAIM_FAILED",
        message: error instanceof Error ? error.message : "Failed to claim funds from vault.",
      },
      { status: 500 }
    );
  }
}
