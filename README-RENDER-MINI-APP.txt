STOCK BOOK — TELEGRAM MINI APP (RENDER-ONLY PACKAGE)

WHAT IS INCLUDED
- /tg/ Mini App page (does not include the main Stock Book website/catalog).
- Telegram dashboard API endpoint.
- Dashboard cache-build background endpoint.
- Shared report core used by the Mini App.
- Standalone Node.js server and Render configuration.
- Product image tap-to-preview, with close button, double-tap zoom and two-finger pinch zoom.

WHAT IS NOT INCLUDED
- Main Stock Book catalog / management system.
- Netlify deployment files or Netlify main-site shell.
- Telegram webhook / bot command management or scheduled group delivery. Keep those in the existing service unless you intentionally migrate them separately.
- Database migrations or changes to Firebase/Supabase records.

RENDER SETTINGS
1. Create a separate Render Web Service using this ZIP/repository root.
2. Runtime: Node.
3. Build command: npm install
4. Start command: npm start
5. Health check path: /healthz
6. Node version: 20 or newer.
7. Add these environment variables in Render Dashboard > Environment:
   - TELEGRAM_BOT_TOKEN: the token for @wardareport2026_bot
   - SUPABASE_URL: https://YOUR_PROJECT_REF.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY: service-role/secret key (keep private)
   - BILLZ_TME_KEY: current BILLZ integration key
   - TELEGRAM_ALLOWED_USER_IDS: optional comma-separated Telegram numeric user IDs

The app uses the same Supabase report snapshots/settings and queries BILLZ through the existing reporting core. Use the same Supabase project and BILLZ key as the currently working report service. Never put secrets in HTML or commit them to GitHub.

TELEGRAM MINI APP URL
- After Render deploys, copy the public HTTPS URL, for example https://YOUR-SERVICE.onrender.com.
- Set the bot's Mini App / Web App URL in BotFather to that Render URL.
- The dashboard page is served at both / and /tg/.
- The browser dashboard API is served by this same Render service at /.netlify/functions/tg-dashboard.
- The existing Telegram bot webhook and scheduled report service can remain where they are; do not reset the webhook just to deploy this Mini App page.

ACCESS NOTE
- The current authorization code allows members of the Telegram group saved in Stock Book, plus numeric user IDs listed in TELEGRAM_ALLOWED_USER_IDS.
- This Render package does not yet add a management screen for adding usernames dynamically. Telegram user IDs, not usernames, are required for the environment-variable allowlist. A dynamic invite/approval list needs a coordinated Stock Book Access Management + Supabase update.

TESTING
- Open https://YOUR-SERVICE.onrender.com/healthz and confirm it returns "ok".
- Open the Mini App through the Telegram bot (not a normal browser) so Telegram supplies signed initData.
- Verify dashboard loads, date/store filters respond, and product photos open a clear preview.
- Verify a valid account can view reports; an unauthorized account should receive an access error.
- Render Free services may sleep when idle and cold-start on the next request. This can delay the first Mini App open; it is separate from BILLZ/Supabase report-build time.
