WARDA STOCK BOOK — DASHBOARD-ONLY DEPLOYMENT

- Telegram chat report delivery is disabled in this build, including scheduled, retry, manual and photo/album delivery.
- `/start` is silent. Use the persistent Dashboard menu button to open the Mini App.
- Reports and photos are Mini App only.
- The Reports page has Access Management. Connect a private group; members of that group get access. Add/remove people inside Telegram. The bot must be an administrator.
- Access Management requires TELEGRAM_BOT_TOKEN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side.
- Render start command: npm start (node server.mjs). Keep current environment variables.
- Do not deploy a nested restore/backup folder; this ZIP intentionally contains one main project only.
- Do not clear Firestore or delete records. Use the BILLZ compare tool and export a backup before any repair.
