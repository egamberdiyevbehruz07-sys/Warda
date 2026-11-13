SUPABASE — ACCESS MANAGEMENT

Supabase stores the connected Telegram group and the Mini App's prepared dashboard cache. It is not a replacement for the main Firebase/Firestore Stock Book data.

Required environment variables on the hosting service:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN

Use the supplied SUPABASE-TELEGRAM-SCHEMA.sql in the same Supabase project already connected to this app. Never place the service role key in frontend code or commit it to GitHub.

The bot must be an administrator in the connected private Telegram group so the Mini App can verify group membership.
