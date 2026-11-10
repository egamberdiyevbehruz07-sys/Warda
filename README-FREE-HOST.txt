RUNNING STOCK BOOK WITHOUT NETLIFY (FREE HOST)

server.mjs runs the SAME website and the SAME functions (bot, dashboard, reports, BILLZ proxy, 22:30 report, retry, monthly job,
background jobs). Nothing in index.html or the bot changes. Tested locally; not yet tested on Render itself.
Your data stays where it is: Firebase (Stock Book), Supabase (reports/bot), BILLZ.

STEP 1 - PUT THE FILES ON GITHUB (free)
1. github.com > Sign up > New repository (name: warda-system, Private is fine) > Create.
2. "uploading an existing file" > unzip this ZIP on your computer > drag EVERYTHING inside (index.html, package.json, server.mjs,
   the folders netlify and tg, the .sql and .txt files) into the page > Commit changes.
   Check that the folders netlify/functions, netlify/lib and tg appear in the repository.

STEP 2 - CREATE THE FREE SERVER ON RENDER
1. render.com > Sign up with GitHub > New + > Web Service > choose the repository.
2. Language: Node. Build command: npm install      Start command: node server.mjs      Instance type: Free.
3. Environment variables (Add):
     TELEGRAM_BOT_TOKEN, BILLZ_INT_KEY_2, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (same values as in Netlify)
     NODE_VERSION = 22
4. Create Web Service. After a few minutes you get an address like  https://warda-system.onrender.com
   Open it: the Stock Book login page must appear. Also open  /healthz  (shows ok).

STEP 3 - KEEP IT AWAKE (needed for the bot and the 22:30 report)
A free Render server falls asleep after ~15 minutes without visitors. Use a free pinger:
uptimerobot.com > Add New Monitor > HTTP(s) > URL = https://YOUR-ADDRESS.onrender.com/healthz > interval 5 minutes.

STEP 4 - CONNECT EVERYTHING TO THE NEW ADDRESS
1. Open the new address > sign in > Report > Telegram delivery > "Enable bot menu (/start)".
   (moves the Telegram bot and the Open button to the new address)
2. BotFather > Configure Mini App > URL = https://YOUR-ADDRESS.onrender.com/tg/
3. Firebase Console (project system-proof) > Authentication > Settings > Authorized domains > add YOUR-ADDRESS.onrender.com
4. In Telegram send /start in the group. The old Netlify site can stay paused or be deleted.

NOTES
- Free plans change; check Render's current free limits on its pricing page. If the server restarts, schedules resume by themselves.
- If Render asks for a card, the same ZIP also runs on other Node hosts (Koyeb, Railway, Fly.io, a VPS): start command "node server.mjs",
  the same environment variables, and PUBLIC_URL = the public https address if the host does not set it automatically.
- The website itself is served by server.mjs, so BILLZ keys stay on the server like before. Source code, SQL and notes are never served.
