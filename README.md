<div align="center">

# Blue Wallet

Identity-attested crypto wallets for compliant on-chain transactions.

</div>

## Overview

Blue Wallet links bank-verified, identity-attested users to custodial stablecoin wallets. Individuals sign in with email, verify their identity with Persona, and receive a "blue" verification badge that institutions can trust. Custodial wallets, on-chain transfers, and signing are handled by the Bridge API — the app never touches private keys.

Key frontend tech:

- Next.js App Router + TypeScript
- Tailwind CSS with ShadCN/ui primitives
- `next-themes` powered light/dark mode toggle
- Bridge-hosted KYC (Persona-powered) for identity verification in the sign-in journey
- Bridge API for custodial wallets and transfers (server-side)
- Privy for external-wallet connect on the sender side
- Typography stack mirrors Claude's interface using `Söhne` (falls back to Inter/Helvetica if the licensed font isn't installed)

Further product planning lives in [`docs/tasklist.md`](docs/tasklist.md).

## Getting Started

Install dependencies (only needed once):

```bash
npm install
```

Run the dev server (managed manually—avoid running `npm run dev` in automated environments as per project conventions):

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/            # Next.js routes (App Router)
  contact/     # Contact page with mailto form (no backend yet)
components/     # Shared UI pieces (navbar, auth flow, providers, shadcn buttons)
docs/           # Product requirements and task lists
lib/            # Utility helpers (Tailwind class name merge)
public/         # Static assets
```

## Authentication & Verification Flow

1. **Sign in with email** – `POST /api/auth/session` establishes a lightweight session keyed by a deterministic id derived from the email address.
2. **Verify identity with Bridge KYC** – `POST /api/bridge/kyc-link` requests a short-lived `bridge.withpersona.com` link (Persona-powered) which the client opens. `GET /api/bridge/kyc-status` then reads the **authoritative** result back from Bridge; the client never asserts its own verification status. On first approval the user's Bridge customer + custodial wallet are provisioned.
3. **Link a bank account** – Plaid supplies bank identity and ACH coordinates so inbound transfers can be routed to the right recipient.
4. **Claim & withdraw** – recipients claim deposits from the company vault into their managed Bridge wallet, then withdraw to any external Base address. Both are executed as Bridge transfers; Bridge custodies the keys and broadcasts on-chain.

### Backend integration map

| Concern | Provider | Routes |
| --- | --- | --- |
| Session | App (email) | `app/api/auth/session` |
| Identity / KYC | Bridge (Persona-powered) | `app/api/bridge/kyc-link`, `app/api/bridge/kyc-status`, `components/bridge-kyc-button.tsx` |
| Custodial wallets | Bridge | `app/api/bridge/wallet`, `lib/bridge/server.ts` |
| Customers | Bridge | `app/api/bridge/customer` |
| Transfers (claim/withdraw) | Bridge | `app/api/transfers/[transferId]/{claim,withdraw}` |
| Bank linking | Plaid | `app/api/plaid/*` |

## Scripts

- `npm run dev` – start the development server with Turbopack
- `npm run build` – create a production build
- `npm run start` – run the production server
- `npm run lint` – lint the codebase with ESLint

## Environment

The following environment variables are required for production deployment (configured in Amplify environment variables). See [`.env.example`](.env.example) for the full list.

- `PLAID_CLIENT_ID` / `PLAID_SECRET`
- `BRIDGE_API_KEY` (server-side Bridge API key)
- `BRIDGE_COMPANY_CUSTOMER_ID` / `BRIDGE_COMPANY_WALLET_ID` / `COMPANY_WALLET_ADDRESS` (company vault)
- `NEXT_PUBLIC_PRIVY_APP_ID` (external wallet connect for senders)
- KYC runs through Bridge's hosted flow — no client-side Persona keys required. Optional: `BRIDGE_KYC_REDIRECT_URI`, and `BRIDGE_DEMO_AUTOAPPROVE=true` for local demo without Bridge credentials.
- Optional Bridge tuning: `BRIDGE_API_BASE_URL`, `BRIDGE_API_VERSION`, `BRIDGE_DEFAULT_CHAIN`, `BRIDGE_TRANSFER_CURRENCY`

## Contributing

1. Create a new branch for your change.
2. Implement and test locally.
3. Ensure `npm run lint` passes.
4. Open a pull request referencing relevant tasks in `docs/tasklist.md`.

## License

Proprietary. All rights reserved.
