<div align="center">

# Blue Wallet

Identity-attested crypto wallets for compliant on-chain transactions.

</div>

## Overview

Blue Wallet links self-custodied wallets to bank-verified identities. Individuals authenticate with Plaid, connect or create wallets via Turnkey, and receive a "blue" verification badge that institutions can trust. The production app will surface minimal, brand-forward messaging while enforcing Turnkey wallet policies for inflow/outflow controls.

Key frontend tech:

- Next.js App Router + TypeScript
- Tailwind CSS with ShadCN/ui primitives
- `next-themes` powered light/dark mode toggle

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
components/     # Shared UI pieces (navbar, theme toggle, providers)
docs/           # Product requirements and task lists
lib/            # Utility helpers (Tailwind class name merge)
public/         # Static assets
```

## Scripts

- `npm run dev` – start the development server with Turbopack
- `npm run build` – create a production build
- `npm run start` – run the production server
- `npm run lint` – lint the codebase with ESLint

## Environment

Integrations will eventually require the following environment variables (store them in `.env.local`):

- `PLAID_CLIENT_ID` / `PLAID_SECRET`
- `TURNKEY_API_KEY` / `TURNKEY_API_SECRET`

## Contributing

1. Create a new branch for your change.
2. Implement and test locally.
3. Ensure `npm run lint` passes.
4. Open a pull request referencing relevant tasks in `docs/tasklist.md`.

## License

Proprietary. All rights reserved.
