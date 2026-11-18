STOCK BOOK — TELEGRAM MINI APP ONLY (RENDER)
Release: 2026-11-18-miniapp-render-r1

WHAT THIS PACKAGE CONTAINS
- Telegram Mini App UI only: /tg/
- Telegram dashboard endpoint: /.netlify/functions/tg-dashboard
- Dashboard background cache builder: /.netlify/functions/daily-telegram-report-background
- Telegram webhook receiver: /.netlify/functions/telegram-bot
- The existing reporting core needed to read BILLZ and use the same Supabase report/cache tables.
- It does NOT contain or deploy the main Stock Book catalog/site.

RENDER SERVICE SETTINGS
Service type: Web Service
Runtime: Node
Build command: npm install
Start command: npm start
Health check path: /healthz
Node: 20 or later

RENDER ENVIRONMENT VARIABLES
1. TELEGRAM_BOT_TOKEN
   Use the existing token for @wardareport2026_bot.
2. BILLZ_TME_KEY
   Use the same existing BILLZ integration key used by the main system.
3. SUPABASE_URL
   Use the same existing Supabase project URL as the main system.
4. SUPABASE_SERVICE_ROLE_KEY
   Use the same existing server-side service-role key. Keep it secret.
5. MINIAPP_URL
   After Render creates the service, set this to its public HTTPS URL, for example:
   https://your-miniapp-service.onrender.com

IMPORTANT DATA / ACCESS BEHAVIOUR
- Main Stock Book Firebase data is not copied or migrated by this package.
- The Mini App dashboard reads sales/import data directly from BILLZ through the existing reporting core.
- Supabase is used for the existing Telegram access/settings and prepared dashboard cache.
- Use the same Supabase project and service-role key as the current reporting setup.
- The current dashboard authorization rule is preserved: the Telegram user must be a member of the connected group saved in stock_book_telegram_settings. The bot must be an administrator of that group for membership checks to work.
- No individual-user access-management redesign is included in this Mini App-only package.
- No Telegram chat report/photo delivery is enabled; reports remain inside the Mini App.

TELEGRAM MENU / WEBHOOK
After the service is deployed and all environment variables are set, run this one-time command from a local terminal in the extracted project folder (with those environment variables set):
  npm run configure:telegram

This sets the bot webhook and Dashboard menu button to this Render service. It changes the bot's current webhook/menu destination. Do not run it until you are ready for the bot's Dashboard button and webhook to point to Render. The main system's existing Access Management "Enable Dashboard" action may reset these URLs back to the main system host if used later; coordinate before running that action again.

SUPABASE SCHEMA
The package includes SUPABASE-TELEGRAM-SCHEMA.sql for reference. If the existing Telegram report feature already works, do not rerun migrations blindly. Confirm that these tables already exist in the same Supabase project:
- stock_book_telegram_settings
- stock_book_range_cache
- stock_book_telegram_chats (used by webhook group discovery)

TEST AFTER DEPLOY
1. Open https://your-miniapp-service.onrender.com/healthz; it should show "ok".
2. Open https://your-miniapp-service.onrender.com/tg/ inside Telegram using the bot's Dashboard menu button.
3. Check the selected day/week/month reports, store filters, product photos and chart.
4. Tap a product photo. The large preview opens; double-tap or pinch to zoom; tap outside or X to close.
5. If the dashboard says the user is not authorized, check the saved group ID, bot admin status, and that the user's Telegram account is a member of the connected group.

SAFETY
- This service is isolated from the main catalog UI and does not contain its HTML or Firebase client application.
- Do not paste TELEGRAM_BOT_TOKEN, BILLZ_TME_KEY or SUPABASE_SERVICE_ROLE_KEY into chat or source files.
- Use a staging Render service first if you are unsure whether changing the bot webhook/menu destination will affect other integrations.
