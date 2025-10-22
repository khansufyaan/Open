"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";

interface PlaidAchAccount {
  accountId: string;
  accountNumber: string;
  routingNumber: string;
  wireRoutingNumber?: string | null;
  mask?: string | null;
  name?: string | null;
}

interface PlaidIdentityData {
  names: string[];
  emails: string[];
  phones: string[];
  addresses: Array<{
    street: string;
    city: string;
    region: string;
    postal_code: string;
    country: string;
  }>;
  achAccounts: PlaidAchAccount[];
}

interface PlaidConnectButtonProps {
  onSuccess: (identityData: PlaidIdentityData) => void;
  onError: (error: string) => void;
}

export function PlaidConnectButton({ onSuccess, onError }: PlaidConnectButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch link token from our backend
  useEffect(() => {
    async function fetchLinkToken() {
      try {
        const response = await fetch("/api/plaid/create-link-token", {
          method: "POST",
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Plaid link token error:", errorData);
          throw new Error(errorData.message || "Failed to create link token");
        }

        const data = await response.json();
        setLinkToken(data.link_token);
      } catch (error) {
        console.error("Failed to initialize Plaid:", error);
        const message = error instanceof Error ? error.message : "Failed to initialize Plaid";
        onError(message);
      }
    }

    fetchLinkToken();
  }, [onError]);

  const handleSuccess = useCallback(
    async (public_token: string) => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ public_token }),
        });

        if (!response.ok) {
          throw new Error("Failed to exchange token");
        }

        const data = await response.json();

        if (data.success && data.identity) {
          const identityData: PlaidIdentityData = {
            ...data.identity,
            achAccounts: Array.isArray(data.achAccounts) ? data.achAccounts : [],
          };
          onSuccess(identityData);
        } else {
          throw new Error("No identity data received");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch identity data";
        onError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, onError]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: (error) => {
      if (error) {
        onError(error.error_message || "Plaid Link was closed");
      }
    },
  });

  return (
    <Button
      onClick={() => open()}
      disabled={!ready || isLoading}
      className="w-full sm:w-auto"
    >
      {isLoading ? "Verifying..." : "Connect Bank Account"}
    </Button>
  );
}
