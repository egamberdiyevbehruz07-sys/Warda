# Warda Stock Book

## Current build

This is the Dashboard-only Telegram build. Telegram is used only for Mini App access and group-membership authorization. No Telegram chat reports, messages, product photos, albums, scheduled delivery, retries, or manual report delivery are enabled.

## Deploy on Render

1. Back up the current GitHub repository.
2. Copy the contents of this `Warda-main` folder to the repository root.
3. Keep the existing environment variables; do not paste secrets into source files.
4. Render build/start: `npm install` then `npm start`.
5. In Stock Book > Reports > Access Management, add the bot to a private Telegram group as administrator, find the group, and save it.
6. Click **Enable Dashboard button** once. `/start` remains silent; the persistent Dashboard menu opens `/tg/`.
7. Add or remove managers in the Telegram group. The server checks each Mini App user's signed Telegram identity and group membership.

## Required server environment

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Existing Firebase/BILLZ variables must remain unchanged.

The bot must remain an administrator in the selected group for Telegram's `getChatMember` membership check to work. The group membership controls who can open the Dashboard; report content remains inside the Mini App.

## Data integrity and safety

- BILLZ-synced movement rows now use deterministic per-source-line Firestore IDs. This makes a partially completed 100-record batch safe to retry without duplicating already-written BILLZ lines or incorrectly skipping the remaining lines.
- Existing Firestore data is not deleted or migrated by this build.
- This source-code repair does not independently reconcile existing production history. Compare Stock Book with a matching BILLZ sales/returns/stock export before making any historical data corrections.
- Back up Firestore and export BILLZ data before any destructive repair or rebuild.
- Revenue may still rely on current BILLZ price data where historical receipt prices are not available; verify this with the BILLZ export.

## Scope of validation

The project source can be syntax-checked and its Telegram delivery guard can be tested locally. Production Firebase records, live BILLZ results, Render environment configuration, and live Telegram group membership must be verified in the deployed environment.
