import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "blue-wallet-users";

export async function POST() {
  try {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-2",
    });

    // Check if table already exists
    try {
      await client.send(
        new DescribeTableCommand({
          TableName: TABLE_NAME,
        })
      );

      return NextResponse.json({
        success: true,
        message: "Table already exists",
        tableName: TABLE_NAME,
      });
    } catch {
      // Table doesn't exist, create it
      const createCommand = new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          {
            AttributeName: "userId",
            KeyType: "HASH", // Partition key
          },
        ],
        AttributeDefinitions: [
          {
            AttributeName: "userId",
            AttributeType: "S", // String
          },
        ],
        BillingMode: "PAY_PER_REQUEST", // On-demand pricing
      });

      await client.send(createCommand);

      return NextResponse.json({
        success: true,
        message: "Table created successfully",
        tableName: TABLE_NAME,
      });
    }
  } catch (error) {
    console.error("Table initialization failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to initialize table",
      },
      { status: 500 }
    );
  }
}
