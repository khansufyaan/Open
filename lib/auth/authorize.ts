import { GetCommand } from "@aws-sdk/lib-dynamodb";

import { docClient, USERS_TABLE } from "@/lib/db/dynamo";
import { recipientKeysForAccounts } from "@/lib/recipient-key";

/**
 * Returns true when the authenticated user controls the bank account behind a
 * transfer's recipientKey (i.e. one of their linked Plaid accounts hashes to
 * it). Used to authorize claim/withdraw so a transferId alone is not enough to
 * move someone else's funds.
 */
export async function userOwnsRecipientKey(userId: string, recipientKey: string): Promise<boolean> {
  const response = await docClient.send(
    new GetCommand({ TableName: USERS_TABLE, Key: { userId } })
  );

  const accounts = response.Item?.plaidAchAccounts as
    | Array<{ routingNumber?: string | null; accountNumber?: string | null }>
    | undefined;

  return recipientKeysForAccounts(accounts).has(recipientKey);
}

/** Returns true when the Bridge customer id belongs to the authenticated user. */
export async function userOwnsBridgeCustomer(userId: string, customerId: string): Promise<boolean> {
  const response = await docClient.send(
    new GetCommand({ TableName: USERS_TABLE, Key: { userId } })
  );
  return response.Item?.bridgeCustomerId === customerId;
}
