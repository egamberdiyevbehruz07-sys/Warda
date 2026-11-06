STOCK BOOK — TELEGRAM BOT MENU (NEW)

WHAT IT DOES
- In the saved private group, send /start (or /menu). The bot shows buttons:
    [Bugun | Kecha]
    [Umumiy hisobot]
    [Amani] [Warda]
    [Afiya noor] [Warda 2]
- Tapping a button sends that report: a summary, a numbered Top 10 list, then ONE PICTURE PER PRODUCT
  with its rank, name and quantity sold. Products without a photo are sent as text with "(rasm mavjud emas)".
- Today's data is re-fetched from BILLZ if the saved snapshot is older than 10 minutes, so the first tap can take
  about a minute. Yesterday uses the saved snapshot when it exists.
- The 22:30 nightly report now sends: overall summary + Top 10 with pictures, the import album, and the menu.
  Per-store reports are one tap away. To ALSO push all four store reports every night, add the Netlify variable
  TELEGRAM_NIGHTLY_STORES = 1 (about 50 messages per night).

NEW / CHANGED FILES
- netlify/functions/telegram-bot.mjs (new)  — Telegram webhook (menu + button taps)
- netlify/functions/daily-telegram-report-background.mjs — new "bot" job type
- netlify/functions/telegram-setup.js — new action enableBot; "Find groups" still works with the webhook
- netlify/lib/telegram-report-core.cjs — report builders, menu, per-product photo sending
- SUPABASE-TELEGRAM-SCHEMA.sql — one new small table (stock_book_telegram_chats)
- index.html — new button "Enable bot menu (/start)" in Report > Telegram delivery

DEPLOY (no new secrets needed)
1. Run the updated SUPABASE-TELEGRAM-SCHEMA.sql in the Supabase SQL Editor (safe to re-run).
2. Deploy the whole ZIP to the existing Netlify site (production deploy).
3. Stock Book > Report > Telegram delivery > click "Enable bot menu (/start)". This registers the webhook.
4. In the group send /start. The menu appears.

SECURITY
- Only the saved group (or chat IDs listed in optional variable TELEGRAM_ALLOWED_CHAT_IDS, comma separated) can open
  reports. Any other chat only gets its own chat ID.
- The webhook rejects requests that do not carry the secret header (derived from your bot token; nothing to configure).

NOTES
- While the webhook is on, Telegram does not allow getUpdates. "Find groups" now reads chats from the new Supabase table,
  which fills when someone sends /start in a group. If you connect a NEW group, send /start there first, then click Find groups.
- Photos depend on BILLZ returning image URLs for the product (unchanged from before).

NIGHTLY SAFETY NET + SAVED GROUP (UPDATE)
- 22:30 Tashkent: normal nightly report. When its first message is delivered, the day is marked "sent" in Supabase.
- 22:45 and 23:45 Tashkent: new function daily-telegram-report-retry checks that mark. If today's report was NOT sent,
  it starts the report again automatically. If it was sent, it does nothing (no duplicates).
  Deploy the ZIP and check Netlify > Functions for daily-telegram-report-retry (scheduled functions run only on a published deploy).
- Saved group: the group is stored in Supabase once ("Save group & send test") and is used for every daily report and the
  /start menu. Report > Telegram delivery now shows "Saved: <group name> · <id>" every time you open it.
- If Telegram upgrades the group to a supergroup (its chat ID changes), the bot follows the new ID automatically and saves it.
- Optional backup: Netlify variable TELEGRAM_CHAT_ID is used if nothing is saved in Supabase.

7-DAY AND LAST-MONTH REPORTS (UPDATE)
- The /start menu now has: [Bugun | Kecha] [Oxirgi 7 kun | O‘tgan oy], then Overall and the four stores.
  Pick the period first (the dot marks the active one), then tap Overall or a store.
- "Oxirgi 7 kun" = the last 7 days counting back from today (today + 6 days before). It does NOT start on Monday.
- "O‘tgan oy" = the previous full calendar month (on 1 Nov 2026 it is 01.10 – 31.10.2026).
- Each report shows sold / returned / net, daily average, imports, write-offs, per-store totals, most-sold color,
  and Top 10 products with pictures. Store taps show the same for that store only.
- AUTOMATIC: on the 1st of every month at 09:00 Tashkent time the bot sends LAST MONTH's overall report to the saved group.
  A second run at 13:00 is a safety net and does nothing if the report was already sent.
  (Function: monthly-telegram-report. Check it appears in Netlify > Functions after deploy.)
- 7-day / month data is fetched live from BILLZ (about 20-60 seconds the first time). A finished month is cached, so the
  next taps are fast. This needs the new table stock_book_range_cache: re-run SUPABASE-TELEGRAM-SCHEMA.sql (safe to re-run).
  Without the table the reports still work, only slower on every tap.

3D LOOK (UPDATE, index.html only)
- New visual layer at the end of the stylesheet ("3D DEPTH LAYER"). It changes only colors, shadows, gradients and hover motion:
  sizes, spacing and positions of everything are unchanged (checked element by element).
- Raised 3D buttons that press down, layered cards, glowing logo/avatar, pressed-in input fields, animated glow stripe,
  soft colored background light with one slowly floating 3D sphere, and stat tiles that tilt toward the cursor.
- Everything is built from the theme colors, so Style > "Choose theme image" (uploaded theme) recolors all of it automatically.
- 3 new built-in themes: aurora, obsidian, pearl.
- Style menu > "3D effects: On / Off" switches the motion off (also automatic on phones' animations and with "reduce motion").

COLORS IN TOP 10 (UPDATE)
- Every Top 10 product now shows which colors were sold and how many of each, in the list and under each photo:
    1. Rubashka lolali — 5 dona
        🎨 binafsha — 3, bordo — 2
- Colors are read from the BILLZ product attribute "Цвет" and shown in Uzbek. Shows the 5 most-sold colors, then "+N rang".
- Works in the 22:30 report, Today/Yesterday, Last 7 days, Last month, Overall and each store.

LARGE CATALOG FIX (UPDATE)
- The BILLZ reader used to stop silently after 10,000 rows. The catalog has about 11,400 products, so some products could
  have lost their photo/color in the reports. The limit is now 40,000 rows, and the logs warn if it is ever reached.
- A full catalog read takes roughly 1 minute (BILLZ allows ~2 requests per second), so the first tap of a button can take 1-1.5 minutes.

MINI APP DASHBOARD + MONTH COMPARISON (UPDATE)
WHAT YOU GET
- A dashboard that opens INSIDE Telegram. In a private chat with the bot: the "Hisobot" button next to the message box,
  and the "📊 Dashboardni ochish" button after /start. In the group, the menu has "📊 Dashboard (shaxsiy chatda)"
  which opens the private chat with the bot.
- Compare ANY two months (default: last month vs the month before, e.g. Oktabr vs Sentabr). Pick months at the top.
- Switch between Hammasi (all stores) and Amani / Warda / Afiya noor / Warda 2.
- Sold, Imports, Net, Returned, Written off, Sold/Import ratio, each with the % change and the other month's number.
  "Kuniga" switch = per-day average (fair when months have 30 vs 31 days).
- Daily chart (sales or imports, tap the chart for a day), store-by-store comparison, Top 10 with photos + colors and the
  change vs the other month, biggest risers/fallers, top colors. Light and dark mode follow Telegram.
- Preview in any browser: https://YOUR-SITE.netlify.app/tg/?demo=1  (sample data, add &dark for dark mode)

SETUP (once)
1. Deploy this ZIP. 2. Run SUPABASE-TELEGRAM-SCHEMA.sql again (adds stock_book_range_cache if you skipped it).
3. Stock Book > Report > Telegram delivery > "Enable bot menu (/start)" again. It also sets the Hisobot menu button and starts
   building last month + the month before in the background (takes a few minutes the first time; later opens are instant).
4. IMPORTANT: make the bot an ADMIN of your private group (Telegram: group > Administrators > add the bot).
   Telegram only lets a bot check who is a group member if it is an admin. Without this, nobody is let in.
5. Each person opens the bot once in a private chat and sends /start.

WHO CAN OPEN IT: only members of the saved private group (checked with Telegram's signed login on every request).
Extra people: Netlify variable TELEGRAM_ALLOWED_USER_IDS = 123,456 (Telegram user IDs, comma separated).
The 1st-of-the-month job now also pre-builds the dashboard data for the new "last month".

WEEKLY + MONTHLY COMPARISON EVERYWHERE (UPDATE)
- Mini App: new switch at the top "Oylik | Haftalik". Weekly = last 7 days counted back from today (NOT from Monday)
  vs the 7 days before. You can pick any other 7-day window from the lists (12 windows). Same pages as monthly:
  summary, numbers with % change, daily chart, stores, Top 10 with colors, risers/fallers, colors.
- Bot menu (group and private): two new buttons "📈 Hafta taqqoslash" and "📈 Oy taqqoslash" send a short text comparison
  (all numbers + each store) straight into the chat. Month = last month vs the month before.
- On the 1st of every month the bot now sends last month's report AND the month comparison automatically.
- Deploy: deploy ZIP, click "Enable bot menu (/start)" once more (it pre-builds both months and both weeks).
- Everything from before is still included: /start menu with Overall + 4 stores, photos + colors in Top 10, 7-day and last-month
  reports, 22:30 report with 22:45/23:45 safety net, saved group, 3D look, large-catalog fix, Mini App dashboard.

"OPEN" BUTTON ON THE BOT (UPDATE)
Telegram only lets BotFather (not code) switch on the big "Open" button on the bot's profile. Do this once (2 minutes):
1. Telegram > @BotFather > /mybots > choose your report bot > Bot Settings > Configure Mini App (or "Menu Button").
2. Enable Mini App and send this URL:   https://YOUR-SITE.netlify.app/tg/
3. In Stock Book > Report > Telegram delivery click "Enable bot menu (/start)" once more (sets the "Open" menu button next to the
   message box, and the bot's description text).
4. Optional, so the Dashboard button inside the GROUP opens it directly (no private chat step):
   Netlify > Site settings > Environment variables > add  TELEGRAM_MAIN_MINIAPP = 1  and redeploy.
Result: opening the bot shows "Open" -> the dashboard opens inside Telegram.
