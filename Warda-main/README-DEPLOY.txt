STOCK BOOK — DEPLOY

1. Back up the current Netlify deploy.
2. Deploy all files from this ZIP, including netlify/functions, netlify/lib, netlify.toml and package.json.
3. Keep an existing BILLZ key configured as a Render secret. Supported names are BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY and legacy BILLZ_SECRET.
4. For automatic Telegram delivery, configure TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the existing BILLZ key (BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY or supported legacy BILLZ_SECRET) for Netlify Functions in Production. FIREBASE_SERVICE_ACCOUNT_JSON is not required by the Telegram reporting functions in this build.
5. Run SUPABASE-TELEGRAM-SCHEMA.sql in the existing Supabase project. The scheduled function fetches the day's report data directly from BILLZ, stores a compact snapshot in Supabase and sends the Telegram report at 17:30 UTC = 22:30 Asia/Tashkent. It does not read or write Firestore.
6. In Stock Book > Report > Telegram daily report, select the Telegram chat, enable automatic reports, save and send a test. Run “Send selected day now” once to verify a real report.
7. If the BILLZ fetch or Supabase archive fails, the scheduled function logs the failure and does not send an unverified/partial report; check Netlify function logs.

Never put BILLZ, Telegram or Firebase service account secrets in frontend code or a public repository. This ZIP has not been deployed to the live site.

NEW IN THIS BUILD
8. Report > Daily sales: select a date/store; click any Sales intelligence chart bar or its date chip to open every saved sale/return line for that date. Daily Excel contains the full detail.
9. Reports now include estimated revenue, cost of goods, gross profit, gross margin, price coverage, per-store estimates, top estimated-profit products, and stock suggestions from the last 30 days.
10. Financial figures are estimates using the latest BILLZ per-store retail/promo and supply prices. Historical transaction prices, discounts, taxes, VAT, payroll and overheads are not stored on sales lines by this build. Missing-price quantities are excluded and a coverage percentage is displayed. Do not use these estimates as statutory accounts.
11. To apply a custom look without redeploying, open Style > Upload a theme image, choose a screenshot/image, and its color palette is applied and saved in that browser. This is browser-local; other devices/users need to import the same image separately. You can also import a theme JSON palette. Built-in theme presets and Reset theme remain available.


PERFORMANCE / STABILITY FIX
12. The previous navigation archive contained a malformed Firebase-listener declaration. This build corrects the listener initialization and passes JavaScript syntax checks for the page and all Netlify functions.
13. Firebase document changes are merged by document ID and browser redraws are coalesced after a short quiet period, rather than rebuilding the entire UI on every individual sync update.
14. The stock/variant model and sales/report calculations are cached in memory until their source data or selected period changes. Financial variant matching now uses prebuilt indexes instead of scanning the entire catalog for each sale line.
15. A browser-local IndexedDB snapshot is used for fast display on later visits while Firebase refreshes the latest records. The first visit on a new browser still needs to download the current Firestore records. This cache is per browser/device and is not shared between users.
16. Theme/language updates now refresh only the visible screen and are batched; normal navigation no longer runs the older page entrance animations.
17. These changes do not migrate, delete or overwrite Firestore records and do not require changing Netlify environment variables.


LATEST CREATIVE + PERFORMANCE UPDATE
18. The BILLZ key alone is enough for the direct BILLZ report fetch, provided BILLZ_INT_KEY_2 is available to Netlify Functions in Production. Telegram reporting additionally requires TELEGRAM_BOT_TOKEN and the Supabase URL/service-role key. FIREBASE_SERVICE_ACCOUNT_JSON is not used by the Telegram report path.
19. Catalog and transaction images now use lazy loading / asynchronous decoding.
20. Transaction groups are cached per Firestore snapshot so the Transfer, Import, Sales, Remove and Report pages reuse group calculations instead of regrouping all history on every navigation.
21. Stock / variant data is now reused when the source move snapshot has not changed; existing action handlers no longer rebuild the whole catalog model repeatedly.
22. Excel matching uses the existing barcode/SKU/article lookup indexes rather than scanning every variant for each row.
23. A section-level render guard shows a retry message if a UI section throws, rather than leaving a blank section.
24. Additional section styling applies theme-aware gradients, refined cards, better table headers, polished upload areas and status panels using lightweight CSS (no added animation framework).
25. These changes preserve the Firestore schema and do not migrate or delete existing records.

FINANCIAL PRICE ESTIMATE FIX
After deploying this build, open BILLZ in Stock Book and run "Sync product catalog only" once. The catalog sync now preserves product-level retail_price, supply_price and promo_price as a fallback when a matching shop_prices entry is absent, and matches store-specific prices by normalized store name. Then reopen Reports. Financial figures remain estimates based on current BILLZ prices; historic paid prices, discounts and taxes are not available unless the source transaction records provide them.

TELEGRAM SUPABASE STORAGE
Telegram reporting uses Supabase for chat settings and prepared daily snapshots only. Run SUPABASE-TELEGRAM-SCHEMA.sql and add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as Netlify Functions secrets. The Telegram report functions fetch BILLZ directly and do not access Firestore. Firebase remains the source of truth for the main Stock Book app and operational data.


SCHEDULED TELEGRAM REPORT TIMEOUT FIX
- The 22:30 Asia/Tashkent cron remains 30 17 * * * (UTC).
- The scheduled function now only starts a Netlify Background Function and exits quickly.
- The background function performs the BILLZ sync, saves the snapshot to Supabase, then sends the report and product photo albums to the saved Telegram group.
- No new environment variable is required; the existing TELEGRAM_BOT_TOKEN is used server-side to authorize the internal dispatch.
- After deployment, check Functions for daily-telegram-report-background and its logs. A successful scheduled log should say the background job was accepted; the background function logs the sync and delivery outcome.


ALL-DEVICE LOGOUT (OPTIONAL)
- This build includes a server-side Log out all devices action. It requires `FIREBASE_SERVICE_ACCOUNT_JSON` in the existing Render environment.
- Use a newly rotated service-account key for Firebase project `system-proof`; do not reuse a key that may have been exposed. Store it only in Render Environment, never in GitHub or chat.
- The package adds the `firebase-admin` dependency. Render must run `npm install` before `node server.mjs`. If the service build command is empty, set it to `npm install`.
- If this variable is not configured, single-device Log out continues to work and Log out all devices shows a clear setup warning.
