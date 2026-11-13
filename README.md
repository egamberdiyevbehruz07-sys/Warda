# Warda Stock Book — version 1.5.0
Release: `2026-11-12-stockbook-report-reconcile-r5`

This release repairs the Telegram Dashboard Mini App report refresh and cache lifecycle.

## What changed
- Historical completed dates can now be force-refreshed from BILLZ.
- Existing old dashboard summaries are bypassed using a new cache namespace; no old Supabase rows are deleted.
- Current periods refresh on a short freshness window, while completed verified periods are periodically rechecked.
- The API tracks active background builds, keeps the Mini App polling until the build finishes, and clears a build lock if the worker cannot be started.
- The Mini App shows a clear notice while the displayed saved snapshot is being refreshed and ignores older requests after a date/view change.

## Deploy
1. Back up the currently deployed repository and data configuration.
2. Copy this project root's contents into the existing deployment root — the folder containing `package.json`, `server.mjs`, `netlify.toml`, `netlify/`, and `tg/`.
3. Keep existing BILLZ, Telegram and Supabase environment variables unchanged. Never add secrets to frontend files or this ZIP.
4. Deploy using the hosting service already connected to the project.
5. Open the Telegram bot's Dashboard Mini App. The first load after this release may rebuild selected periods under the new cache version. Use the refresh icon to force a fresh BILLZ query for a selected date.
6. Check 12 November 2026 and 9 November 2026. The BILLZ comparison badge should say that the aggregate sales/returns totals match. If it displays a warning or says it was not compared, investigate that discrepancy in BILLZ before relying on the numbers.

## Data limitations
- This ZIP has not been deployed to the live service and has not connected to the production BILLZ or Supabase accounts.
- No Firebase/Firestore, Supabase business records, or old cache rows are deleted or rewritten by the code update. The Mini App reads a new versioned summary-cache key.
- The Telegram Mini App currently reports sales, returns, imports and write-offs. It does not calculate historical stock-on-hand. Exact historical remaining stock requires a BILLZ stock snapshot for that date or a complete opening balance plus every stock movement. Do not infer a past balance from today's catalog stock.
