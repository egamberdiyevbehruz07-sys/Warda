Warda Stock Book / Telegram Mini App — report reliability update
Release: 2026-11-12-stockbook-report-reconcile-r5
Version: 1.5.0

Changes:
- Dashboard cache keys are versioned; existing Supabase cache rows are left untouched and the new release builds fresh BILLZ summaries under new keys.
- Manual refresh now forces a fresh BILLZ build for completed historical days, weeks and months as well as the current period.
- Current periods are considered fresh for 3 minutes; verified completed periods for 12 hours; unverified completed periods for 1 hour.
- The Mini App tracks in-flight background builds, continues polling until the build completes, and releases the build lock if the worker could not be started.
- Stale data is explicitly labelled while it is being refreshed.
- Older in-flight Mini App requests are ignored after the user changes the selected date or view.

Data safety:
- No Firebase, Firestore or Supabase business records are deleted or rewritten by this code update.
- Old dashboard cache entries are not deleted; the app reads the new versioned cache namespace.
- This release fetches sales/import/write-off rows from BILLZ and retains the existing independent sales/returns total check.
- The Telegram Mini App in this package does not currently calculate historical stock-on-hand balances. To reconcile the remaining stock exactly, a BILLZ historical stock snapshot or a complete opening-balance + movement history is still required. Do not infer historical remaining stock from today's catalog balances.

Deploy:
1. Back up the currently deployed project/repository.
2. Extract the ZIP and deploy the correct project root (the folder containing package.json, server.mjs, netlify.toml, and tg/).
3. Keep the existing BILLZ, Telegram and Supabase environment variables unchanged.
4. Wait for the deployment to finish, then open the Telegram bot's Dashboard Mini App and use the refresh icon once.
5. Test 12 Nov 2026 and 9 Nov 2026; confirm the BILLZ verification badge says the totals match. If it shows a warning, compare the two displayed totals with BILLZ before treating the date as reconciled.

No production deployment or live BILLZ/Supabase reconciliation was performed by editing this ZIP.
