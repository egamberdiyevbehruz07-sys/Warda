WARDA STOCK BOOK — DEPLOYMENT

The current build is Dashboard-only for Telegram. Do not use older instructions in prior project archives.

1. Back up your current repository.
2. Deploy the contents of this Warda-main folder to the repository root.
3. On Render, run `npm install` and `npm start` (the start script runs `node server.mjs`).
4. Keep the existing Firebase, BILLZ, Telegram and Supabase environment variables unchanged.
5. In Stock Book > Reports > Access Management, connect the private Telegram group. The bot must be a group administrator.
6. Click Enable Dashboard button once. `/start` must remain silent; use the persistent Dashboard menu button to open `/tg/`.
7. Scheduled, manual, retry, text and photo report delivery to Telegram chats is disabled. Reports and photos are Mini App only.

DATA SAFETY
- This build does not delete or migrate Firestore data.
- The BILLZ compare tool should be run before any repair. Download and review the backup before confirming an archive/reload operation.
- Correctness of historical live data cannot be certified from source code alone; compare the relevant BILLZ export with the production Firestore records.
- Financial estimates use current stored BILLZ prices if historical transaction prices are missing.
