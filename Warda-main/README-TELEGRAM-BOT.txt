STOCK BOOK — TELEGRAM BOT + MINI APP

START MENU
- Send /start: the bot stays silent and sends no chat message.
- Open the persistent “📊 Dashboard” menu button in the private bot chat to launch the Mini App.
- In a private chat, the button opens the Telegram Mini App directly.
- Telegram does not support showing a standalone inline button in a group without sending a message. Use the persistent Dashboard menu button in the private bot chat.
- The old list of period, comparison and store buttons is no longer shown in the /start menu.

MINI APP (/tg/)
The Mini App has four separate tabs:
1. Kunlik — daily report; choose a date from the recent date list.
2. Haftalik — report for a selected rolling 7-day period.
3. Oylik — report for a selected calendar month.
4. Taqqoslash — a separate comparison view. Choose weekly or monthly comparison and select the two periods.

The store chips (Hammasi, Amani, Warda, Afiya noor, Warda 2) filter the report or comparison. Report views show sold, returned, net sales, imports, write-offs, daily breakdowns where applicable, Top 10 products and available product colors/photos. Comparison retains the comparison charts, store view, Top 10 changes and color analysis.

DATA / FIRST LOAD
- Dashboard summaries are built from BILLZ data and cached in Supabase.
- The first time a date, week or month is opened, the data may take longer to prepare. Subsequent opens use the cache where it is still fresh.
- The Mini App authenticates using Telegram's signed initData. Only authorized group members or IDs in TELEGRAM_ALLOWED_USER_IDS can open it.

EXISTING REPORT DELIVERY
- The automatic daily report schedule and existing monthly report schedule are unchanged by this Mini App fix.
- Existing BILLZ, Supabase, Firebase and Telegram environment variables remain in use. No new variables or schema changes are introduced by this fix. The dashboard API now also returns the recent date options needed by the daily report tab.
- Keep the bot as an administrator of the saved private report group so membership checks can work.

DEPLOYMENT
1. Deploy the updated project files to the existing GitHub repository/Render service.
2. Keep the current environment variables and database configuration.
3. After Render reports the service is Live, open the bot's private chat. /start sends no message.
4. Press the persistent “📊 Dashboard” menu button and test all four tabs.

SECURITY
- Never place Telegram, BILLZ, Firebase or Supabase secret keys in frontend code or public repositories.
- The Telegram webhook validates Telegram's secret header. Dashboard access validates Telegram's signed Mini App initData.
