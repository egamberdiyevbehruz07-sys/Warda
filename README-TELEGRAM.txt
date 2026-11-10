STOCK BOOK — TELEGRAM DAILY REPORT

- Automatic report runs daily at 22:30 Asia/Tashkent (17:30 UTC).
- Before sending, the scheduled Netlify function fetches the day's report data directly from BILLZ and stores a compact snapshot in Supabase.
- Telegram delivery reads only the Supabase snapshot and saved Telegram chat settings. The reporting function does not read or write Firestore.
- The main Stock Book catalog, variants, colors/sizes, inventory, operational transactions and normal BILLZ sync remain on Firebase and are not migrated.

REPORT CONTENT
- Sales first: gross units, returns, net units, sales lines, store totals and top 10 products by units sold.
- Top 10 photos are sent when BILLZ returns usable image URLs.
- Imports: total quantity/lines and up to five leading imported products, with photos when available.
- Write-offs: quantity, lines and reasons only; no item names/photos.

REQUIRED NETLIFY VARIABLES
1. TELEGRAM_BOT_TOKEN — token created for @wardareport2026_bot.
2. BILLZ_INT_KEY_2 — or the existing working BILLZ_INT_KEY / BILLZ_SECRET.
3. SUPABASE_URL — existing Supabase project URL.
4. SUPABASE_SERVICE_ROLE_KEY — Supabase server-side service_role/secret key. Never use the publishable/anon key here.

FIREBASE_SERVICE_ACCOUNT_JSON is no longer required by this Telegram reporting function. Keep unrelated Firebase client/auth variables unchanged. Do not delete a Firebase service-account variable if another unrelated function uses it.

SUPABASE TABLES
Run SUPABASE-TELEGRAM-SCHEMA.sql in the existing Supabase project's SQL Editor. The tables store Telegram settings and daily report snapshots only.

CONNECT A CHAT
1. Open https://t.me/wardareport2026_bot and press Start / send /start.
2. In Stock Book > Report > Telegram daily report, click Find Telegram chats.
3. Select your personal chat (numeric chat ID), enable automatic reports, then click Save chat & send test.
4. Click Send selected day now to fetch today's BILLZ report, store it in Supabase and send it immediately.

DEPLOYMENT
- Deploy the complete ZIP contents to the existing Netlify site.
- Trigger a production deploy after adding/changing environment variables.
- Scheduled Netlify functions run only on published deployments.

SECURITY
- Never paste Telegram or Supabase secret keys into the website, GitHub, ChatGPT or a public file.
- The setup endpoint requires an authenticated Stock Book user.

TROUBLESHOOTING
- BILLZ 401: verify BILLZ_INT_KEY_2 is the working key and is available to Netlify Functions in Production.
- Supabase 401/403: verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and run the supplied SQL schema.
- Telegram 403: confirm the token belongs to @wardareport2026_bot and that you pressed Start in your personal chat.
- Missing photo: the BILLZ report response may not include an image URL for that product; the report will retain its sales quantity and text entry.
