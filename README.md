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
- Persona hosted flow for identity verification (KYC) in the sign-in journey
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
2. **Verify identity with Persona** – the hosted Persona flow runs against the configured template/environment. On completion the inquiry is posted to `POST /api/persona/inquiry`, which records the result and (when Bridge is configured) provisions the user's Bridge customer and custodial wallet.
3. **Link a bank account** – Plaid supplies bank identity and ACH coordinates so inbound transfers can be routed to the right recipient.
4. **Claim & withdraw** – recipients claim deposits from the company vault into their managed Bridge wallet, then withdraw to any external Base address. Both are executed as Bridge transfers; Bridge custodies the keys and broadcasts on-chain.

### Backend integration map

| Concern | Provider | Routes |
| --- | --- | --- |
| Session | App (email) | `app/api/auth/session` |
| Identity / KYC | Persona | `app/api/persona/inquiry`, `components/persona-verify-button.tsx` |
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
- `NEXT_PUBLIC_PERSONA_TEMPLATE_ID` / `NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID` (defaults baked into the client)
- `NEXT_PUBLIC_PRIVY_APP_ID` (external wallet connect for senders)
- Optional Bridge tuning: `BRIDGE_API_BASE_URL`, `BRIDGE_API_VERSION`, `BRIDGE_DEFAULT_CHAIN`, `BRIDGE_TRANSFER_CURRENCY`

## Contributing

1. Create a new branch for your change.
2. Implement and test locally.
3. Ensure `npm run lint` passes.
4. Open a pull request referencing relevant tasks in `docs/tasklist.md`.

## License

Proprietary. All rights reserved.
