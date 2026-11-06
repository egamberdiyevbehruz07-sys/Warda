STOCK BOOK — REPORTING-ONLY SUPABASE CONNECTION

ARCHITECTURE
- Firebase remains unchanged as the source of truth for the Stock Book app: catalog, variants, colors/sizes, stock, sales, imports, transfers, app authentication and normal BILLZ sync.
- Supabase is used ONLY for Telegram chat settings and compact daily report snapshots.
- The Telegram report functions fetch that day's sales, imports, write-offs and store totals directly from BILLZ, prepare the report, and save the snapshot in Supabase. They do not read or write Firestore.
- Telegram delivery reads the prepared report snapshot and chat settings from Supabase. If a selected historical date has no snapshot, the manual send action fetches that date from BILLZ and archives it first.
- This isolates Telegram report generation from Firestore read quotas. It does not migrate or change the main Stock Book database.

SUPABASE SETUP
1. Open the existing Supabase project used for Stock Book Telegram reporting.
2. Open SQL Editor > New query.
3. Run the complete contents of SUPABASE-TELEGRAM-SCHEMA.sql. If the two tables already exist, CREATE TABLE IF NOT EXISTS and the RLS statements are safe to run again.
4. In Supabase Project Settings > API, copy the Project URL and the server-side service_role/secret key. Never use the anon/publishable key for this backend.
5. In Netlify > Site configuration > Environment variables, set these as secret variables with Functions + Production enabled:
   - SUPABASE_URL = https://YOUR_PROJECT_REF.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY = your Supabase service_role/secret key

OTHER REQUIRED NETLIFY VARIABLES
- TELEGRAM_BOT_TOKEN = token for @wardareport2026_bot
- BILLZ_INT_KEY_2 (or the working legacy BILLZ_INT_KEY / BILLZ_SECRET variable)
- Keep the existing Firebase client/auth variables used by the Stock Book website unchanged.
- FIREBASE_SERVICE_ACCOUNT_JSON is NOT required by the Telegram report functions in this build. Do not delete it if another unrelated server function in your deployment uses it; this report path simply does not access Firestore.

DEPLOY AND CONNECT
1. Deploy all files from this ZIP to the existing Stock Book Netlify site, including index.html, netlify/functions, netlify/lib, netlify.toml and package.json.
2. Trigger a production deploy after updating variables.
3. Open Stock Book > Report > Telegram daily report.
4. Select the saved Telegram chat, enable automatic reports, then click Save chat & send test.
5. Click Send selected day now to generate a real report from BILLZ and archive it in Supabase.
6. The scheduled report runs daily at 17:30 UTC = 22:30 Asia/Tashkent.

REPORT CONTENT
- Sales are the main section: gross units, returns, net units, store totals and top 10 products by units sold.
- Top 10 product photos are resolved by matching daily sales rows to the full BILLZ /v2/products catalog using barcode, product ID, or SKU plus variant color/size. Photos are sent when BILLZ catalog records contain usable public image URLs; missing photos are skipped rather than invented.
- Imports include total units/lines and up to 5 top imported products in a compact photo album when image URLs are available.
- Write-offs show quantity and causes only; no product names or photos are sent for write-offs.
- Historical dates are fetched directly from BILLZ when a snapshot does not yet exist in Supabase.

SECURITY
- SUPABASE_SERVICE_ROLE_KEY and TELEGRAM_BOT_TOKEN are powerful server-side secrets. Add them only in Netlify environment variables; never put them in index.html, GitHub, Telegram or ChatGPT.
- No public RLS policies are created. Only the Supabase service-role key can access the two reporting tables.
- The manual setup endpoint still requires the user to be signed in to Stock Book through its existing Firebase authentication.

LIMITATIONS / IMPORTANT
- This reporting-only change does not migrate Firebase catalog, inventory or operational records.
- The report snapshot is based on BILLZ's daily report endpoints, not a scan of the Stock Book Firestore moves collection.
- Photo availability depends on image URLs returned in BILLZ report data. If BILLZ omits those URLs, the text ranking still sends but some photos may be absent.
- The Netlify scheduled function runs only on a published deployment. Check Netlify Function logs if the scheduled fetch or Telegram delivery fails.

PRIVATE GROUP DELIVERY (FOUR RECIPIENTS)
1. In Telegram, create one private group and add the four recipients (you, both bosses and the manager).
2. Add @wardareport2026_bot to that group. The bot must remain a member and be allowed to send messages.
3. In the group, send this command: /start@wardareport2026_bot
4. In Stock Book > Report > Telegram delivery, click Find groups. Select the private group (group/supergroup), then click Save group & send test.
5. Confirm that the test message appears in the group. This saves that one group chat ID in Supabase; all four members receive the same scheduled report.

The report is generated once per day. It sends a separate text summary and a separate Top 10 photo album for each store when 2-10 product images are available. A single available image is sent as an individual photo; unavailable product images are skipped without dropping the product from the text ranking. The existing album sender splits/falls back safely for smaller image sets.
