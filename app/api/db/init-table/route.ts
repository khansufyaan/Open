import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE_DEFINITIONS = [
  {
    name: "blue-wallet-users",
    createCommand: new CreateTableCommand({
      TableName: "blue-wallet-users",
      KeySchema: [
        {
          AttributeName: "userId",
          KeyType: "HASH",
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: "userId",
          AttributeType: "S",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  },
  {
    name: "blue-wallet-transfers",
    createCommand: new CreateTableCommand({
      TableName: "blue-wallet-transfers",
      KeySchema: [
        {
          AttributeName: "transferId",
          KeyType: "HASH",
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: "transferId",
          AttributeType: "S",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  },
  {
    name: "blue-wallet-recipient-wallets",
    createCommand: new CreateTableCommand({
      TableName: "blue-wallet-recipient-wallets",
      KeySchema: [
        {
          AttributeName: "recipientKey",
          KeyType: "HASH",
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: "recipientKey",
          AttributeType: "S",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  },
];

export async function POST() {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-2",
  });

  const results: Array<{ table: string; status: string }> = [];

  try {
    for (const definition of TABLE_DEFINITIONS) {
      try {
        await client.send(
          new DescribeTableCommand({
            TableName: definition.name,
          })
        );

        results.push({ table: definition.name, status: "exists" });
      } catch {
        await client.send(definition.createCommand);
        results.push({ table: definition.name, status: "created" });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Table initialization failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to initialize tables",
      },
      { status: 500 }
    );
  }
}
