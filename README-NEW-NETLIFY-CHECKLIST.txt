MOVING TO THE NEW NETLIFY ACCOUNT - CHECKLIST

1. DEPLOY THE WHOLE PROJECT (not only index.html): index.html, netlify.toml, package.json, the folders netlify/ (functions + lib)
   and tg/ (the Telegram dashboard). Make it a PRODUCTION deploy.
2. NETLIFY VARIABLES (Site configuration > Environment variables; scope: Functions + Production), then redeploy:
   - TELEGRAM_BOT_TOKEN        (done)
   - BILLZ_INT_KEY_2           (done)
   - SUPABASE_URL              (REQUIRED - reports and the dashboard are saved here)
   - SUPABASE_SERVICE_ROLE_KEY (REQUIRED - the service_role / secret key, never the anon key)
3. SUPABASE: open SQL Editor, run SUPABASE-TELEGRAM-SCHEMA.sql once (safe to repeat). Same project as before = your saved group is kept.
4. SWITCH OFF THE OLD NETLIFY SITE (pause or delete it), otherwise both sites send the 22:30 report.
5. NEW SITE > Stock Book > Report > Telegram delivery:
   a) click "Enable bot menu (/start)"  (moves the bot to the new site, sets the Open button, starts building the dashboard data)
   b) if the group is not shown: send /start in the group, click "Find groups", select it, "Save group & send test".
6. BOTFATHER > /mybots > your bot > Bot Settings > Configure Mini App > URL = https://YOUR-NEW-SITE.netlify.app/tg/
   (optional: Netlify variable TELEGRAM_MAIN_MINIAPP = 1 so the group's Dashboard button opens it directly)
7. FIREBASE CONSOLE (project system-proof) > Authentication > Settings > Authorized domains > add YOUR-NEW-SITE.netlify.app
   (index.html still uses the same Firebase project; a new Netlify domain must be allowed or sign-in can fail).
8. Make the bot an ADMIN of the private group. Each person opens the bot privately once and sends /start.
9. TEST: /start in the group > tap "Amani" (first time ~1-2 min) > open the Dashboard > wait for 22:30 (check Netlify > Functions logs).

CHECKING NUMBERS AGAINST BILLZ (/tekshir)
In the saved group or in a private chat with the bot send:   /tekshir 28.10.2026   (date optional, default today)
The bot asks BILLZ for that date in 3 ways and replies with rows / sold / returned for each:
  A) the way the system and the reports ask now (day + position)   B) day only   C) whole period total
Compare with the "Tovarlar" number in BILLZ for the same date. If A is much larger than B/BILLZ, the report setting is inflating;
if A = B = BILLZ, BILLZ is fine and the extra numbers come from the data saved inside the Stock Book system.
