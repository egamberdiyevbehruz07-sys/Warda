Warda Stock Book 1.4.0 — 2026-11-10-stockbook-cache-refresh-r4

Deployment identification:
- In-app Build label: 1.4.0 · 10 Nov 2026 · Deployment verified
- Server /__version response: version 1.4.0, release 2026-11-10-stockbook-cache-refresh-r4
- Cache policy: no-store on served HTML and release endpoint

Functional contents retained from the preceding Mini App/BILLZ release:
1. First Mini App open combines default report and period options in one initial request.
2. BILLZ catalog variants use existing stock_book_range_cache with six-hour reuse and fallback.
3. BILLZ comparison uses matching date/position details.
4. Product attributes Цвет and Размер are mapped from product_attributes[].name.
5. Ambiguous SKU-only matches are not guessed.
6. Mobile horizontal overflow protections and Firebase first-snapshot loading state are included.

No Firestore records are deleted or rewritten by this release.
