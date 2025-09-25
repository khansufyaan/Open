declare module "@turnkey/sdk-react" {
  import type { ComponentType, ReactNode } from "react";

  export interface AuthConfig {
    emailEnabled?: boolean;
    phoneEnabled?: boolean;
    passkeyEnabled?: boolean;
    googleEnabled?: boolean;
    appleEnabled?: boolean;
    facebookEnabled?: boolean;
    socialLinking?: boolean;
    sessionLengthSeconds?: number;
  }

  export interface AuthProps {
    authConfig: AuthConfig;
    configOrder?: Array<"socials" | "email" | "phone" | "passkey">;
    onAuthSuccess?: (session: unknown) => void;
    onError?: (error: unknown) => void;
    className?: string;
  }

  export const Auth: ComponentType<AuthProps>;

  export interface TurnkeyProviderProps {
    baseUrl?: string;
    children?: ReactNode;
    apiKey?: string;
  }

  export const TurnkeyProvider: ComponentType<TurnkeyProviderProps>;
}
