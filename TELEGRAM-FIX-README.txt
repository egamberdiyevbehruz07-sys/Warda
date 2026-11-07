DASHBOARD-ONLY TELEGRAM FIX

This project blocks Telegram chat delivery centrally and disables scheduled daily, retry and monthly report dispatch. The bot webhook does not reply to /start. All reports and product photos remain in the Mini App.

If your group still receives product photos after deploying this source to the same service, check Render for another active web service/worker or an old deploy using the same TELEGRAM_BOT_TOKEN. Changing this source cannot stop a separate service that is still running old code.
