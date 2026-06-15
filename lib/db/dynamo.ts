import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const USERS_TABLE = "blue-wallet-users";
export const TRANSFERS_TABLE = "blue-wallet-transfers";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

export const docClient = DynamoDBDocumentClient.from(dynamoClient);
