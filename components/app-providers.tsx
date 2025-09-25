"use client";

import { TurnkeyProvider } from "@turnkey/sdk-react";

import { ThemeProvider } from "@/components/theme-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL;
  const orgId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
  const rpId = process.env.NEXT_PUBLIC_TURNKEY_RP_ID;
  const serverSignUrl = process.env.NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL;
  const iframeUrl = process.env.NEXT_PUBLIC_TURNKEY_IFRAME_URL;

  if (!apiBaseUrl || !orgId) {
    console.warn(
      "Missing Turnkey configuration. Set NEXT_PUBLIC_TURNKEY_API_BASE_URL and NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID to enable login."
    );

    return <ThemeProvider enableSystem={false}>{children}</ThemeProvider>;
  }

  const config = {
    apiBaseUrl,
    defaultOrganizationId: orgId,
    ...(rpId ? { rpId } : {}),
    ...(serverSignUrl ? { serverSignUrl } : {}),
    ...(iframeUrl ? { iframeUrl } : {}),
  };

  return (
    <TurnkeyProvider config={config}>
      <ThemeProvider enableSystem={false}>{children}</ThemeProvider>
    </TurnkeyProvider>
  );
}
