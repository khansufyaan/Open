"use client";

import { PrivyProvider } from "@privy-io/react-auth";

import { ThemeProvider } from "@/components/theme-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

  if (!appId) {
    console.warn("Missing NEXT_PUBLIC_PRIVY_APP_ID; Privy login will be disabled.");
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          accentColor: "#0284c7",
          theme: "light",
        },
        loginMethods: ["email", "google", "apple", "twitter", "wallet"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      <ThemeProvider enableSystem={false}>{children}</ThemeProvider>
    </PrivyProvider>
  );
}
