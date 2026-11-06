import core from '../lib/telegram-report-core.cjs';

// Telegram webhook: handles /start (menu) and the inline-button taps.
// It answers Telegram immediately and hands the slow work (BILLZ sync + sending photos)
// to the Netlify Background Function, so Telegram never times out or retries.
const ok = () => new Response('ok', { status: 200 });

async function dispatchReport(chatId, scope, period) {
  const token = core.getTelegramToken();
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!siteUrl) throw new Error('Netlify URL is missing.');
  const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'bot', chatId: String(chatId), scope, period }),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`Background job rejected (${r.status}).`);
}

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
