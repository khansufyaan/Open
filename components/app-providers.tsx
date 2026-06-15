"use client";

import { PrivyProvider } from "@privy-io/react-auth";

import { ThemeProvider } from "@/components/theme-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const renderWithTheme = (tree: React.ReactNode) => (
    <ThemeProvider enableSystem={false}>{tree}</ThemeProvider>
  );

  // Privy powers external-wallet connect on the sender side. Custody, wallet
  // provisioning, and transfer signing are handled server-side by Bridge.
  if (!privyAppId) {
    console.warn(
      "Missing Privy configuration. Set NEXT_PUBLIC_PRIVY_APP_ID to enable external wallet connect for senders."
    );
    return renderWithTheme(children);
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        // Email OTP provides the email-ownership proof the receiver flow needs;
        // wallet login remains available for senders.
        loginMethods: ["email", "wallet"],
        appearance: {},
        embeddedWallets: {},
      }}
    >
      {renderWithTheme(children)}
    </PrivyProvider>
  );
}
