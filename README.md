# Family Finances

A private, mobile-first expense tracking app for Sarah & David. Built with Next.js 14, Supabase, and the Anthropic Claude API.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Google Cloud](https://console.cloud.google.com) project with OAuth credentials
- An [Anthropic](https://console.anthropic.com) API key
- A [Vercel](https://vercel.com) account (for deployment)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd family-finances
npm install
```

### 2. Fill in environment variables

Open `.env.local` and fill in the real values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_EMAILS=sarah@gmail.com,david@gmail.com
```

> **Security note:** `ANTHROPIC_API_KEY` is used only in server-side API routes. It must never be referenced in any client component or prefixed with `NEXT_PUBLIC_`.

Replace `ALLOWED_EMAILS` with the real Gmail addresses for Sarah and David. Only these emails will be granted access after Google login.

### 3. Run the database migration

1. Open your [Supabase Dashboard](https://app.supabase.com)
2. Go to **SQL Editor**
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and run it

This creates all tables, enables Row Level Security, seeds categories, and sets up the auto-profile trigger.

### 4. Configure Google OAuth in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Enable **Google**
3. In [Google Cloud Console](https://console.cloud.google.com):
   - Create OAuth 2.0 credentials (Web Application type)
   - Add `https://your-project.supabase.co/auth/v1/callback` as an authorized redirect URI
   - Add `http://localhost:3000` (for local dev) and your production URL as authorized origins
4. Copy the **Client ID** and **Client Secret** back into Supabase

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running tests

```bash
npm test
```

Tests are in `__tests__/` and cover:

- `calculateBalance()` — lifetime running balance with dated split ratios
- `detectDuplicates()` — fuzzy merchant matching and ±1 day date tolerance
- `detectMissingExpenses()` — required monthly expense detection
- `generateForecast()` — average-based annual forecast calculation
- `applyRatioToExpense()` — ratio selection by expense date

---

## Deployment to Vercel

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. Add all environment variables from `.env.local` in Vercel's project settings
4. Update `NEXT_PUBLIC_APP_URL` to your Vercel production URL
5. Update the Google OAuth redirect URI in Google Cloud Console to include your production URL
6. Deploy

---

## Testing Checklist

Run these manually before considering the app production-ready:

### AUTH & SECURITY

- [ ] Log in with Sarah's Google account — access granted
- [ ] Log in with an unknown Google account — access denied, redirected to `/access-denied`
- [ ] Confirm `ANTHROPIC_API_KEY` does not appear in any client-side bundle (`npm run build`, then search `/.next/static/` for the key string)

### BALANCE CALCULATION

- [ ] Add expense paid by Sarah — balance shows David owes Sarah
- [ ] Add expense paid by David — balance adjusts correctly
- [ ] Change ratio mid-month in Settings — old expenses use old ratio, new expenses use new ratio
- [ ] Log a partial payment — remainder shows correctly as ongoing balance

### EXPENSE ENTRY

- [ ] Add a recurring expense — appears in next 12 months on Expenses tab
- [ ] Edit recurring expense "this month only" — other months unchanged
- [ ] Edit recurring expense "all future months" — all future months updated
- [ ] Deactivate recurring — future months deleted, past months preserved

### MISSING EXPENSES

- [ ] Mark a category as required in Settings — switch to month with no entry — alert banner appears on Home
- [ ] Use bulk backfill to add 3 missing months — all save correctly

### STATEMENT UPLOAD

- [ ] Upload a valid CSV — rows parsed and shown in review screen
- [ ] Upload the same CSV again — duplicates flagged with yellow badge
- [ ] Override an AI category — re-upload same merchant — correction is remembered

### SECURITY (CRITICAL)

- [ ] Log in as David — attempt to view Sarah's individual expenses — confirm cannot see them (RLS blocks it)
- [ ] Confirm individual expenses with `is_visible_to_partner=false` are not accessible via direct URL

---

## Architecture notes

- **Balance calculation** lives in `lib/utils/balance.ts` as a single shared `calculateBalance()` function used on the Home and Settle Up screens
- **AI categorization** happens server-side in `app/api/categorize/route.ts` — the Anthropic API key never touches the client
- **Input sanitization** uses `isomorphic-dompurify` via `lib/utils/sanitize.ts` before all database writes
- **Decimal arithmetic** uses the `decimal.js` library to avoid floating-point currency errors
- **Recurring expenses** are pre-created 12 months forward on save and cleaned up on deactivation
- **Row Level Security** is enforced in Supabase; individual expenses are private by default
