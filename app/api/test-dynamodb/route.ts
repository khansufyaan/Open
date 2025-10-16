import { NextResponse } from "next/server";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

export async function GET() {
  try {
    // AWS SDK will automatically use:
    // - Local: credentials from .env.local (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    // - Production: IAM role attached to Amplify
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-2",
    });

    const command = new ListTablesCommand({});
    const response = await client.send(command);

    return NextResponse.json({
      success: true,
      message: "DynamoDB connection successful!",
      tables: response.TableNames || [],
      region: process.env.AWS_REGION || "us-east-2",
    });
  } catch (error) {
    console.error("DynamoDB test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to connect to DynamoDB. Check IAM permissions.",
      },
      { status: 500 }
    );
  }
}
