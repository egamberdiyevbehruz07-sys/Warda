WARDA / STOCK BOOK — DASHBOARD-ONLY TELEGRAM BUILD

IMPORTANT
- This is a full project ZIP based on the latest Warda-main source supplied in this conversation.
- Telegram chat delivery is disabled. Scheduled daily, retry and monthly report jobs are no-ops.
- The Telegram webhook is silent for /start and does not send report messages/photos.
- Manual report delivery is disabled. Dashboard data is still built/cached for the Mini App.
- Telegram group connection is retained for group discovery/access membership only; saving a group does not send a test message.
- Telegram Mini App authorization includes Telegram user ID 91882186. Additional IDs can be supplied in TELEGRAM_ALLOWED_USER_IDS (comma-separated).

DEPLOY
1. Back up the currently deployed repository before replacing files.
2. Extract this ZIP and upload the contents of the Warda-main folder to the SAME repository root (do not upload an extra nested Warda-main folder inside the repository).
3. Keep existing environment variables and secrets unchanged. Do not paste tokens or service keys into source files.
4. Deploy on the same host/project.
5. In Stock Book > Reports > Telegram, use Find groups and Save group. This only stores the group; it does not post a test message.
6. Click Enable bot menu to set the webhook and the persistent Dashboard menu button.
7. Test /start in the private bot chat (it should remain silent), then use the Dashboard menu button to open /tg/.
8. Test the Mini App from the second Telegram account (ID 91882186).

HOSTING NOTE
The Render/Node server loads functions from netlify/functions. Netlify deployments also use netlify/functions. Do not deploy only one of the nested restore/backup folders.

LIMITS OF VERIFICATION
Source-level JavaScript syntax checks do not prove that the live bot token, Supabase credentials, Firebase access, Telegram group membership, or production Mini App are configured correctly. Verify those after deployment. No production database or historical sales data is included in this ZIP.
