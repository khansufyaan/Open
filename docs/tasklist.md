# Blue Wallet - KYC Wallet Verification Platform

## Project Overview

Blue Wallet is a KYC (Know Your Customer) wallet verification service that links cryptocurrency wallets to verified real-world identities. The platform solves the problem of anonymous wallets that regulated businesses and financial institutions won't interact with.

### Core Value Proposition
- Enable regulated businesses (banks, financial institutions) to verify wallet ownership before conducting transactions
- Create "blue wallets" (verified/KYC'd wallets) as opposed to anonymous wallets
- Provide an API that can be called to verify wallet identity and ownership

## Technical Stack

- **Framework:** Next.js (App Router)
- **UI Components:** ShadCN/ui
- **Styling:** Tailwind CSS
- **Sign-in:** Email-based session; bank verification via Plaid
- **Identity / KYC:** Persona (hosted identity verification flow)
- **Wallet Infrastructure:** Bridge (custodial stablecoin wallets + transfers; Bridge custodies keys and broadcasts transactions server-side)
  - Bridge handles customer onboarding, wallet provisioning, and transfer execution via its REST API

## Project Architecture

### User Flow
1. User signs in with email and verifies identity via Persona (establishes verified identity / KYC)
2. System provisions a custodial Bridge wallet for the user (and links bank coordinates via Plaid)
3. System links verified identity to wallet address(es)
4. Other parties can query via API to verify wallet ownership and identity

### Data Storage Strategy
- Consider storing only Plaid User ID (reference token) + wallet address mappings
- Fetch sensitive identity data from Plaid's API on-demand to reduce liability
- Alternative: Store encrypted identity data with proper security measures

## Build Task List

### UI Components & Pages

1. **Landing/Home Page**
   - Hero section explaining Blue Wallet concept
   - Value proposition for users and businesses
   - CTA buttons for "Verify Your Wallet" and "For Businesses"

2. **Authentication Flow**
   - Plaid Link integration button
   - Loading states during bank authentication
   - Success/error handling screens

3. **Dashboard (Post-Authentication)**
   - Display verified identity status
   - Show connected/created wallets
   - Wallet connection interface
   - Add new wallet functionality

4. **Wallet Connection UI**
   - Connect existing wallet button (WalletConnect/MetaMask via Privy)
   - Create new custodial wallet option (Bridge integration)
   - Display connected wallets with addresses
   - Verification status badges
   - Note: UI placeholder for "Connect wallet" removed; revisit once external wallet signature flow is planned.

5. **API Key Management (For Businesses)**
   - Generate API keys
   - View API documentation
   - Usage analytics/dashboard
   - Rate limiting information

6. **Wallet Verification Display**
   - Show verification status (verified vs unverified)
   - Display identity information (controlled visibility)
   - Verification timestamp
   - Revocation/unlinking functionality

### Backend Functionality (Serverless/API Routes)

7. **Plaid Integration API Routes**
   - `/api/plaid/create-link-token` - Generate Plaid Link token
   - `/api/plaid/exchange-public-token` - Exchange public token for access token
   - `/api/plaid/get-identity` - Fetch user identity data

8. **Bridge Integration API Routes**
   - `/api/bridge/customer` - Create/fetch the Bridge customer for a user
   - `/api/bridge/wallet` - Create/list custodial Bridge wallets
   - `/api/persona/inquiry` - Record Persona verification + provision Bridge customer/wallet

9. **Wallet Verification API Routes**
   - `/api/wallet/connect` - Connect existing wallet via signature verification
   - `/api/wallet/verify` - Verify wallet ownership with signature
   - `/api/wallet/link-identity` - Link Plaid identity to wallet address

10. **Public Verification API**
    - `/api/public/verify-wallet` - Public endpoint to check if wallet is verified
    - `/api/public/get-wallet-info` - Get permitted identity info for wallet (with proper access controls)

### Data Models & State Management

11. **Database Schema Design**
    - User profiles (Plaid user ID, metadata)
    - Wallet mappings (address → user reference)
    - API keys (for business customers)
    - Verification records (timestamps, status)

12. **State Management**
    - Authentication state
    - Connected wallets state
    - Verification status state
    - Loading/error states

### Security & Compliance

13. **Security Measures**
    - API key authentication for business endpoints
    - Rate limiting implementation
    - Input validation and sanitization
    - Secure session management
    - Gate inflows/outflows using Bridge transfer controls and require KYC (Persona) before unlocking wallet actions

14. **Privacy Controls**
    - User consent flows
    - Data visibility controls (what identity info is shared)
    - Wallet unlinking/revocation functionality
    - Data deletion capabilities

### Additional Features

15. **Settings & Profile**
    - Edit privacy settings
    - Manage connected wallets
    - View verification history
    - Account deletion

16. **Business Dashboard**
    - API usage statistics
    - Verification request logs
    - Integration guides
    - Support resources

17. **Documentation Pages**
    - API documentation
    - Integration guides
    - FAQs
    - Terms of service & privacy policy

## Important Development Notes

### For Codex
- **DO NOT run `npm run dev`** - the developer will run this manually in their own terminal instance
- Build features incrementally based on developer's specific requests
- The developer will specify which component/feature to build next from this task list
- Focus on one task at a time as directed
- Ask for clarification on implementation details when needed

### Technical Considerations
- Use Next.js App Router for all routing
- Implement proper TypeScript types throughout
- Use ShadCN components for consistent UI
- Follow security best practices for handling sensitive data
- Consider implementing proper error boundaries
- Add loading states for all async operations
- Bridge custodies wallet keys and broadcasts transfers server-side; the app never handles private keys
- Persona inquiries can be handed to Bridge to satisfy KYC; plan UI hooks that surface verification status to users

### API Integration Notes
- Plaid SDK will need API keys (store in environment variables)
- Bridge API requires a server-side API key and an idempotency key on all mutating requests
- Persona requires a template id + environment id (public, client-side)
- Consider implementing webhook handlers for real-time updates (Bridge transfer state, Persona inquiry status)
- Plan for API versioning from the start

### No Backend Infrastructure Assumption
- Leverage Next.js API routes for all backend functionality
- Use serverless functions (Vercel/deployment platform native)
- Consider edge runtime where appropriate for performance
- Database can be added later if needed (start with localStorage or external service)

## Getting Started

This is a reference document. The developer will:
1. Create a new Next.js project with ShadCN
2. Reference this document when instructing Codex
3. Request implementation of specific tasks in preferred order
4. Iterate on each feature before moving to the next

The order of implementation is flexible and will be determined by the developer during the build process.
