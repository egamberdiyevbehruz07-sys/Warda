STOCK BOOK — BILLZ / FIRESTORE REPAIR NOTES

This update is designed for the existing Stock Book deployment. Firebase Firestore remains the operational database. Telegram reporting continues to use its existing direct BILLZ -> Supabase path; this update does not move operational records or Telegram reports into another database.

WHAT CHANGED
- BILLZ API key lookup accepts BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY, or the legacy BILLZ_SECRET. No key is embedded in the browser.
- BILLZ product matching prioritizes the stable BILLZ product/variant ID, then barcode, then SKU/article + color + size. Store names are normalized more consistently.
- BILLZ sales keep sold quantities and return quantities separately. Returns are stored as negative outgoing movements so stock and net reporting can calculate them correctly.
- Date-only values keep their date; timestamp values with an explicit timezone are converted to the Uzbekistan (Asia/Tashkent) calendar date.
- The sales-repair check compares gross sold and returned quantities separately. A net-only comparison can hide errors where sold and returned totals are both wrong but net happens to match.
- Product IDs are preserved on movement records and used to resolve products before weaker SKU/barcode aliases. Product-ID-only stock rows are supported in the opening-stock preview.
- Local sign-out reports errors. An optional “Log out all devices” action was added using Firebase Admin on the server.

SAFE FIRST TEST
1. Deploy the ZIP to the EXISTING Render service / connected GitHub repository. Do not create a new service.
2. Confirm your existing BILLZ secret is set in Render. Supported names, in priority order: BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY, BILLZ_SECRET. Do not paste secrets into GitHub or chat.
3. Open Stock Book > BILLZ > Advanced BILLZ tools > Compare stock with BILLZ. This is read-only; record the differences before doing any repair.
4. Under “Repair sales”, click “Check (nothing changes)” for a date range. It compares the saved website gross sales and returns with BILLZ gross sales and returns by store/day. Only use “Fix the differences” after checking the results and downloading the backup it creates.
5. Do not use “Start fresh from BILLZ” until you have exported/downloaded and safely stored a complete backup, confirmed the opening date, and reviewed the preview. The rebuild archives existing active moves in Deleted; it does not physically erase them, but it changes which records are active.

LOG OUT ALL DEVICES (OPTIONAL SETUP)
- A new server function requires FIREBASE_SERVICE_ACCOUNT_JSON in the existing Render service environment.
- The value must be a freshly rotated Firebase service-account JSON for project system-proof. The former private key should be considered exposed and must not be reused.
- Add the value directly in Render > existing Web Service > Environment. Never add the JSON to the repository, ZIP, browser code, or chat.
- The package adds firebase-admin. Ensure the Render build command runs `npm install` before `node server.mjs`.
- The all-device action revokes refresh tokens for the account currently signed in. Devices with the Stock Book app open receive a Firestore revocation marker and sign out. Other accounts are not affected.
- If the environment variable is not configured, ordinary single-device logout still works; the all-device action displays a setup message.

IMPORTANT LIMITATIONS
- This source package cannot access your private BILLZ account or production Firestore, so no live totals can be independently verified from here.
- No Firestore records are automatically rewritten by deployment. The repair tools are explicit actions and should only be run after reviewing their preview/backups.
- The website still listens to the existing Firestore moves collection. Reducing that to paginated summaries is a separate schema/performance project; this update does not risk hiding older history by changing the collection query.
- Telegram's reporting pipeline remains separate and unchanged apart from accepting the BILLZ_TME_KEY alias.
