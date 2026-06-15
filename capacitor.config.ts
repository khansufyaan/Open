import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the deployed web app in a native iOS shell. Because Blue
 * Wallet is server-rendered (Next.js App Router + API routes), the native app
 * loads the live deployment via `server.url` rather than bundling static files.
 *
 * Set CAP_SERVER_URL to your deployed URL (Vercel/Amplify) before `cap sync`.
 * See docs/IOS.md for the full build/submit flow (requires macOS + Xcode).
 */
const config: CapacitorConfig = {
  appId: "xyz.bluewallet.app",
  appName: "Blue Wallet",
  webDir: "public",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://blue-wallet.example.com",
    cleartext: false,
  },
};

export default config;
