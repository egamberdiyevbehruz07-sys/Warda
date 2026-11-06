STOCK BOOK — TELEGRAM BOT / MINI APP FIX

WHAT CHANGED
- Sending /start now shows exactly one button: “📊 Dashboardni ochish”.
- The Telegram Mini App (/tg/) now has four separate views:
  1. Kunlik — daily report, with a date selector.
  2. Haftalik — weekly report, with a 7-day period selector.
  3. Oylik — monthly report, with a month selector.
  4. Taqqoslash — a separate comparison view, with weekly or monthly comparison.
- Store filters remain available in the Mini App.

WHAT WAS LEFT UNCHANGED
- The Stock Book website UI (index.html) is unchanged from the uploaded ORIGINAL-restore project.
- The Render server, catalog, stock, sales, imports, transfers, Firebase data, BILLZ sync, and existing environment-variable names were not changed.
- Only Telegram report/dashboard code was changed: tg/index.html, netlify/functions/tg-dashboard.mjs, and netlify/lib/telegram-report-core.cjs.
- No database schema or environment-variable changes are introduced by this fix.

DEPLOY TO YOUR EXISTING GITHUB + RENDER PROJECT
1. Download and extract this ZIP on your computer.
2. Put the extracted project files in the root of the same GitHub repository (keep the folder structure; do not put everything inside an extra nested folder).
3. Commit and push the changes to the branch connected to your existing Render service.
4. Let Render finish the deployment and confirm the service is Live.
5. Open @wardareport2026_bot in Telegram and send /start again.
6. Press the single “📊 Dashboardni ochish” button. Check Kunlik, Haftalik, Oylik, and Taqqoslash.

IMPORTANT
- Keep your current Render environment variables and existing Supabase/Firebase configuration.
- Do not delete or recreate your database, change the Stock Book settings, or redeploy a different app version.
- The first request for a date/week/month may take longer while BILLZ data is built and cached. Later opens should be faster.

A second ZIP named StockBook-Telegram-Only-Patch.zip contains only the three changed Telegram files, for direct replacement in an existing repository.
