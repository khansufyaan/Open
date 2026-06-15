/**
 * Lightweight app session used across the receiver experience.
 *
 * Replaces the former Turnkey `Session` type. The `userId` is a stable
 * identifier derived from the signed-in email address and is used as the
 * partition key for the user record in DynamoDB.
 */
export type Session = {
  userId: string;
  email?: string;
};
