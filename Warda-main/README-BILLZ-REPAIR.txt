BILLZ / FIRESTORE DATA-SAFETY NOTES

This build keeps the operational Stock Book database in the existing Firebase/Firestore project. Supabase remains limited to Telegram group settings and prepared Mini App dashboard cache.

SOURCE-CODE FIX INCLUDED
- BILLZ-synced movement rows use deterministic per-source-line IDs and are written in small batches. If a later batch fails, retrying the same import reuses the same IDs, preventing duplicate rows while still allowing missing rows to be written.
- The sales importer compares gross sold and returned quantities separately before adding missing differences.
- The build does not automatically delete, archive, or rewrite historical Firestore records.

SAFE VERIFICATION
1. Back up the existing Firestore project and keep a separate copy of a BILLZ export.
2. In Stock Book > BILLZ > Advanced BILLZ tools, use the read-only comparison first.
3. Compare by store and date, including gross sold, returns, net sales and stock movements.
4. Review any difference and the backup before choosing an explicit repair action. Do not use a fresh rebuild until the preview and opening date are checked.

LIMITATION
This source package cannot access the production Firebase database or private BILLZ account. Therefore it cannot independently verify or correct historical totals by itself. A matching BILLZ sales/returns export and current Firestore backup are required to confirm the actual figures. Revenue may use current BILLZ price information where historical receipt prices are unavailable; check this against source receipts before treating it as audited revenue.
