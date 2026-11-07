import core from '../lib/telegram-report-core.cjs';

// Dashboard-only Telegram webhook. It records group membership updates so Stock Book can
// discover the connected group; it never sends messages, photos or report replies.
const ok = () => new Response('ok', { status: 200 });

export default async function telegramBot(request) {
  if (request.method !== 'POST') return new Response('Telegram webhook', { status: 200 });
  let token;
  try { token = core.getTelegramToken(); } catch { return new Response('Not configured', { status: 500 }); }
  if (request.headers.get('x-telegram-bot-api-secret-token') !== core.webhookSecret()) return new Response('Unauthorized', { status: 401 });
  const update = await request.json().catch(() => null);
  if (!update) return ok();
  try {
    // Remember groups for Stock Book's Find groups feature. Never post into chats.
    if (update.my_chat_member) await core.recordSeenChat(update.my_chat_member.chat);
    if (update.message && update.message.chat) await core.recordSeenChat(update.message.chat);
    // /start is intentionally silent. The persistent Telegram menu button opens the Mini App.
    if (update.callback_query) {
      await core.telegram('answerCallbackQuery', token, { callback_query_id: update.callback_query.id }).catch(() => {});
    }
  } catch (e) {
    console.error('telegram-bot webhook error:', e && e.stack ? e.stack : String(e));
  }
  return ok();
}
