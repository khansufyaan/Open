"use client";

import { PrivyProvider } from "@privy-io/react-auth";
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
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId) {
    console.warn("Missing Privy configuration. Set NEXT_PUBLIC_PRIVY_APP_ID to enable wallet connect.");
  }

  const renderWithTheme = (tree: React.ReactNode) => (
    <ThemeProvider enableSystem={false}>{tree}</ThemeProvider>
  );

  if (!apiBaseUrl || !orgId) {
    console.warn(
      "Missing Turnkey configuration. Set NEXT_PUBLIC_TURNKEY_API_BASE_URL and NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID to enable login."
    );

    if (!privyAppId) {
      return renderWithTheme(children);
    }

    return (
      <PrivyProvider
        appId={privyAppId}
        config={{
          appearance: {
            theme: "automatic",
          },
          embeddedWallets: {
            createOnLogin: "off",
          },
        }}
      >
        {renderWithTheme(children)}
      </PrivyProvider>
    );
  }

  const turnkeyConfig = {
    apiBaseUrl,
    defaultOrganizationId: orgId,
    ...(rpId ? { rpId } : {}),
    ...(serverSignUrl ? { serverSignUrl } : {}),
    ...(iframeUrl ? { iframeUrl } : {}),
  };

  const wrapped = (
    <TurnkeyProvider config={turnkeyConfig}>{renderWithTheme(children)}</TurnkeyProvider>
  );

  if (!privyAppId) {
    return wrapped;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "automatic",
        },
        embeddedWallets: {
          createOnLogin: "off",
        },
      }}
    >
      {wrapped}
    </PrivyProvider>
  );
}
