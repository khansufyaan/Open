# Running Blue Wallet as a web app and an iPhone app

Blue Wallet is a Next.js web app. It ships in two installable forms:

1. **PWA** — installable from the browser (including iPhone via *Share → Add to
   Home Screen*). No build tooling required.
2. **Native iOS app** — a Capacitor shell around the deployed web app, which you
   can build and submit to the App Store (requires macOS + Xcode).

---

## 1. PWA (works today, no extra build)

The app is a fully-configured PWA:

- `app/manifest.ts` → served at `/manifest.webmanifest` (name, icons, theme,
  `display: standalone`).
- `app/layout.tsx` sets the Apple web-app meta (standalone, status bar, icon) and
  `theme-color`.
- `public/sw.js` is a network-first service worker (registered in production by
  `components/pwa-register.tsx`) that caches only static assets — API/auth
  responses are never cached.
- Icons: `public/icon-192.png`, `public/icon-512.png`, `public/apple-icon.png`
  (regenerate from `public/icon.svg`).

**Install on iPhone:** open the deployed URL in Safari → Share → *Add to Home
Screen*. It launches full-screen with the Blue Wallet icon.

---

## 2. Native iOS app (Capacitor)

Because the app is server-rendered (App Router + API routes), the native shell
loads the **deployed** web app via `server.url` rather than bundling static
files. Config lives in `capacitor.config.ts`.

### Prerequisites (macOS only)

- macOS with Xcode and Command Line Tools
- CocoaPods (`sudo gem install cocoapods`)
- An Apple Developer account (to sign and submit)

### Steps

```bash
# 1. Deploy the web app (Vercel/Amplify) and note its URL.
# 2. Point Capacitor at that deployment:
export CAP_SERVER_URL="https://your-blue-wallet-deployment.com"

# 3. Install deps and add the iOS platform (creates the ./ios Xcode project):
npm install
npm run ios:add

# 4. Sync config/plugins into the native project:
npm run ios:sync

# 5. Open in Xcode to run on a simulator/device and submit to the App Store:
npm run ios:open
```

In Xcode: set your Team/signing, bump the bundle id from `xyz.bluewallet.app`
if needed (it must match `appId` in `capacitor.config.ts`), then Archive →
Distribute to submit.

### Notes

- `CAP_SERVER_URL` must be HTTPS (`cleartext: false`).
- The generated `ios/` directory is platform output; commit it or regenerate with
  `npm run ios:add` as your team prefers.
- Persona/Plaid/Privy SDKs run inside the web view; ensure your deployed domain is
  allowlisted in each provider's dashboard.
