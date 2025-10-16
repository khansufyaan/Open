# Plaid Integration Research & Implementation Plan

## Overview

Plaid is a financial services API that allows applications to connect with users' bank accounts for identity verification, authentication, and financial data access. For Blue Wallet, we'll use Plaid primarily for **identity verification** - authenticating users and collecting verified personal information without needing permission to move money.

## Key Plaid Products

### 1. **Plaid Link** (UI Component)
- Drop-in client-side module that handles the entire bank authentication flow
- Provides an optimized UI with input validation
- Supports nearly all major US banks and financial institutions
- Available as a React component (`react-plaid-link`)

### 2. **Identity API**
- Retrieves verified personal information from connected bank accounts
- Confirms account ownership and matches identity data
- Returns names, addresses, emails, and phone numbers
- **This is what we'll use for identity verification**

### 3. **Identity Verification API** (Optional Future Enhancement)
- Advanced KYC compliance tool
- Can verify government IDs, perform selfie checks
- Collects additional fields like date of birth, ID numbers (SSN)
- Supports 190+ countries

## What User Data Can We Get?

When a user connects their bank account through Plaid Identity API, we can retrieve:

| Data Field | Description | Typical Fill Rate |
|------------|-------------|-------------------|
| **Names** | Full legal name(s) of account owner(s) | 100% |
| **Addresses** | Street address, city, state, postal code, country | 93% |
| **Email Addresses** | Primary and secondary emails | 98% |
| **Phone Numbers** | Home, mobile, or other phone types | 90% |

### Important Notes:
- For joint accounts, **all owners' information** is provided
- Each field can have metadata (e.g., "primary" email, "home" phone)
- Data comes directly from the bank, making it more trustworthy than self-reported info
- Business accounts will show business name as owner

## How Plaid Integration Works

### Authentication Flow

```
1. User clicks "Connect Bank Account" button
   ↓
2. Frontend requests a link_token from our backend
   ├─ POST /api/plaid/create-link-token
   └─ Backend calls Plaid API: /link/token/create
   ↓
3. Frontend opens Plaid Link UI with the link_token
   ├─ User searches for their bank
   ├─ User logs in with bank credentials
   └─ User selects account(s) to connect
   ↓
4. Plaid Link returns a public_token (30min expiry)
   ↓
5. Frontend sends public_token to our backend
   ├─ POST /api/plaid/exchange-token
   └─ Backend exchanges for permanent access_token
   ↓
6. Backend stores access_token (encrypted) in database
   ↓
7. Backend calls Plaid Identity API to get user data
   ├─ POST /identity/get with access_token
   └─ Returns verified personal information
   ↓
8. Display user info in UI and store in our database
```

### Token Types

| Token | Lifespan | Purpose | Location |
|-------|----------|---------|----------|
| `link_token` | 30 minutes | Initialize Plaid Link UI | Frontend |
| `public_token` | 30 minutes | Single-use exchange token | Frontend → Backend |
| `access_token` | Permanent* | API authentication | Backend only |

*Can be rotated or revoked

## Technical Implementation Details

### Required NPM Packages

**Frontend:**
```bash
npm install react-plaid-link
```

**Backend:**
```bash
npm install plaid
```

### Frontend Integration (React/Next.js)

```typescript
import { usePlaidLink } from 'react-plaid-link';

function BankConnectButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // 1. Get link token from our backend
  useEffect(() => {
    async function fetchLinkToken() {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      });
      const { link_token } = await response.json();
      setLinkToken(link_token);
    }
    fetchLinkToken();
  }, []);

  // 2. Configure Plaid Link
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      // 3. Send public_token to backend
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        body: JSON.stringify({ public_token }),
      });

      // 4. Fetch and display user identity data
      const userDataResponse = await fetch('/api/plaid/get-identity');
      const userData = await userDataResponse.json();
      // Display in UI
    },
    onExit: (error, metadata) => {
      if (error) console.error('Plaid Link error:', error);
    },
  });

  return (
    <button onClick={() => open()} disabled={!ready}>
      Connect Bank Account
    </button>
  );
}
```

### Backend API Routes (Next.js App Router)

#### 1. Create Link Token
**File:** `app/api/plaid/create-link-token/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox, // or .development, .production
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

export async function POST(request: Request) {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: 'user-id-from-session', // Use Turnkey user ID
      },
      client_name: 'Blue Wallet',
      products: [Products.Identity], // Only Identity product
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
  }
}
```

#### 2. Exchange Public Token
**File:** `app/api/plaid/exchange-token/route.ts`

```typescript
export async function POST(request: Request) {
  const { public_token } = await request.json();

  try {
    // Exchange public token for access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // TODO: Store accessToken in database (encrypted)
    // Associate with current user session

    return NextResponse.json({ success: true, item_id: itemId });
  } catch (error) {
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }
}
```

#### 3. Get Identity Data
**File:** `app/api/plaid/get-identity/route.ts`

```typescript
export async function GET(request: Request) {
  // TODO: Get access_token from database for current user
  const accessToken = 'access-token-from-db';

  try {
    const response = await plaidClient.identityGet({
      access_token: accessToken,
    });

    const accounts = response.data.accounts;
    const identityData = {
      names: accounts[0].owners.map(owner => owner.names).flat(),
      emails: accounts[0].owners.map(owner => owner.emails).flat(),
      phones: accounts[0].owners.map(owner => owner.phone_numbers).flat(),
      addresses: accounts[0].owners.map(owner => owner.addresses).flat(),
    };

    return NextResponse.json(identityData);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch identity' }, { status: 500 });
  }
}
```

### Environment Variables Required

```env
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox  # or development, production
```

Get these from: https://dashboard.plaid.com/developers/keys

### Testing in Sandbox Mode

When testing with `PLAID_ENV=sandbox`, use these credentials:

**Phone Verification (if prompted):**
- Test Phone Number: `415-555-0100`
- Verification Code: `123456`

**Bank Login Credentials:**
After selecting any bank in the Plaid Link UI, use:
- Username: `user_good`
- Password: `pass_good`

**Alternative:** Select "Plaid Sandbox" as the institution for pre-configured test accounts.

More sandbox credentials: https://plaid.com/docs/sandbox/test-credentials/

## Simple Implementation Plan

### 1. Setup
- [ ] Sign up for Plaid account → get Client ID & Secret
- [ ] Install packages: `plaid`, `react-plaid-link`
- [ ] Add env vars: `PLAID_CLIENT_ID`, `PLAID_SECRET`

### 2. Backend (3 API routes)
- [ ] `/api/plaid/create-link-token` - Returns link token for frontend
- [ ] `/api/plaid/exchange-token` - Exchange public token, store access token in DynamoDB
- [ ] `/api/plaid/get-identity` - Fetch identity data from Plaid, return to UI

### 3. DynamoDB Table
```
Table: UserIdentity
Primary Key: userId (Turnkey user ID from session)

Fields:
- userId (string) - PK
- plaidAccessToken (string) - encrypted
- plaidItemId (string)
- name (string)
- email (string)
- phone (string)
- address (map)
- connectedAt (number) - timestamp
```

### 4. Frontend
- [ ] Create `PlaidConnectButton` component
- [ ] Add as Step 3 in auth flow (after wallet creation)
- [ ] Display identity data once fetched
- [ ] Done


## Next Steps

1. **Get Plaid Credentials** - Sign up at https://dashboard.plaid.com
2. **Review this plan** with the team
3. **Start with Phase 1** - basic setup
4. **Iterate** based on user feedback

## Resources

- [Plaid Docs](https://plaid.com/docs/)
- [Plaid Quickstart](https://plaid.com/docs/quickstart/)
- [Plaid Identity API](https://plaid.com/docs/identity/)
- [React Plaid Link](https://plaid.com/docs/link/web/)
- [Plaid GitHub Examples](https://github.com/plaid/quickstart)
- [Next.js 14 Integration Guide](https://medium.com/@nazardubovyk/step-by-step-guide-to-integrate-plaid-with-next-js-14-app-router-356b547b5a4a)

---

**Last Updated:** 2025-10-08
**Status:** Research Complete - Ready for Implementation
**Estimated Implementation Time:** 2-3 days for MVP
