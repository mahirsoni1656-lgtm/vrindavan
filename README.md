# GateCount — QR Event Manager

React + Vite + Tailwind CSS + Supabase. Includes sign up/sign in, category capacity, unique QR pass generation, camera scanning, automatic IN/OUT tracking, and recent scan history.

## 1. Requirements
- Node.js 20+ recommended
- A Supabase project
- Browser camera access (localhost or HTTPS)

## 2. Set up Supabase
1. Open your Supabase project.
2. Go to **SQL Editor** and run `supabase/schema.sql`.
3. In **Project Settings → API** (or Connect), copy the Project URL and publishable/anon key.
4. In the Supabase Authentication settings, configure email confirmation as desired for your event. For initial testing, you can disable email confirmation in Auth settings.

## 3. Configure the app
Copy `.env.example` to `.env` and replace the values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Never put the `service_role` key in a browser app.

## 4. Run locally
```bash
npm install
npm run dev
```
Open the localhost URL Vite prints. Create an account, then create categories and passes.

## 5. Test the four-person capacity
1. Create category **Vada Pav Stall** with capacity **4**.
2. Generate four passes (e.g. Vada Pav 01–04).
3. Scan each pass once: each should report **Entry approved**.
4. Generate a fifth pass and scan it: it should report **Capacity reached**.
5. Scan one of the first four passes again: that person exits, freeing a spot.
6. Scan the fifth pass again: entry should now succeed.

A QR is permanently tied to its database category. The scanner does not let the operator choose a different category for the token.

## Notes and production hardening
- A pass toggles between IN and OUT on each successful scan. If a person loses their QR, disable that pass and issue a new one.
- The dashboard's event counts are based on the most recent 100 loaded events. For audited daily totals, add a dedicated aggregate query/report.
- The database serializes scans by category before checking capacity, so concurrent scans cannot both claim the final slot.
- Treat QR codes as access credentials. Do not post them publicly. Add staff roles, rate limits, audit retention, and pass revocation workflows before production deployment.
- The starter uses email/password auth. Confirmed-email behavior depends on your Supabase Auth settings.
