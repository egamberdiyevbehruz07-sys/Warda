Warda Stock Book — version 1.4.0
Release: 2026-11-10-stockbook-cache-refresh-r4

WHY THIS RELEASE HAS A NEW VERSION
- package.json version is now 1.4.0 (previously 1.3.0).
- The in-app Reports page displays Build 1.4.0 · 10 Nov 2026 · Deployment verified.
- /__version returns the new release ID and version 1.4.0.
- Render static responses and the Netlify static configuration instruct clients not to reuse stale HTML.

RENDER DEPLOYMENT — IMPORTANT
1. This ZIP is a source bundle; uploading the ZIP to the Render dashboard by itself does not deploy it.
2. Back up the GitHub repository connected to your existing Render service.
3. Extract the ZIP and copy the CONTENTS directly into the repository root (the same folder containing package.json and server.mjs). Do not put them inside an extra parent folder.
4. Commit and push the changed files to the branch connected to Render.
5. In Render, confirm a new deploy starts for that commit. If it does not, use Manual Deploy → Deploy latest commit.
6. The service must run as a Node web service with Build Command `npm install` and Start Command `node server.mjs`; Root Directory must be the folder containing package.json.
7. After deployment, open https://YOUR-SITE/__version. It must return version `1.4.0` and release `2026-11-10-stockbook-cache-refresh-r4`.
8. Hard-refresh the website (Ctrl+Shift+R) after confirming the new release.

EXISTING FUNCTIONAL CHANGES INCLUDED
- Mini App initial open combines initial options and the default daily report request.
- BILLZ catalog variants are compacted and cached in the existing stock_book_range_cache table for up to six hours, with live-fetch fallback.
- Independent BILLZ verification uses the same date/position detail parameters as the dashboard source query.
- BILLZ product_attributes[].name is recognized for Цвет and Размер.
- Ambiguous SKU-only matches are not guessed to a random variant.
- Narrow-screen layout overflow protections and Firebase initial loading state remain included.

DATA SAFETY / LIMITS
- This release does not delete or rewrite Firestore history.
- Existing Render/Firebase/BILLZ/Supabase environment variables are unchanged.
- This version bump and deployment marker prove which source is live; they do not independently reconcile historical sales/stock. A BILLZ export is still required for that audit.
- If /__version does not change after deployment, the live service is not running this ZIP's server.mjs/root directory yet.
