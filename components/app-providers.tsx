"use client";

import { ThemeProvider } from "@/components/theme-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const orgId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
  const appId = process.env.NEXT_PUBLIC_TURNKEY_APP_ID;

  if (!orgId || !appId) {
    console.warn(
      "Missing Turnkey configuration. Set NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID and NEXT_PUBLIC_TURNKEY_APP_ID to enable login."
    );
  }

  return <ThemeProvider enableSystem={false}>{children}</ThemeProvider>;
}
