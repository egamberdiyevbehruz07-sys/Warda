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
    // Bot added to / removed from a group: remember the chat so "Find groups" can list it.
    if (update.my_chat_member) { await core.recordSeenChat(update.my_chat_member.chat); return ok(); }

    if (update.message) {
      const m = update.message, chat = m.chat, text = String(m.text || '').trim();
      if (m.migrate_to_chat_id && (await core.isAuthorizedChat(chat.id))) {
        const cfg = await core.getTelegramSettings().catch(() => ({}));
        await core.saveTelegramSettings(m.migrate_to_chat_id, !cfg || cfg.enabled !== false); // keep the saved group working after Telegram changes its ID
        return ok();
      }
      await core.recordSeenChat(chat);
      const chk = text.match(/^\/(tekshir|check)(@\w+)?(?:\s+(\S+))?/i);
      if (chk) { // /tekshir 28.10.2026  -> shows what BILLZ returns for that date under different report settings
        if (!(await core.isAuthorizedChat(chat.id))) return ok();
        let day = core.todayTashkent(); const a = chk[3] || '';
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : (/^\d{2}\.\d{2}\.\d{4}$/.test(a) ? `${a.slice(6)}-${a.slice(3, 5)}-${a.slice(0, 2)}` : '');
        if (iso && !Number.isNaN(Date.parse(iso)) && iso <= day) day = iso;
        const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
        await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: 'diag', chatId: String(chat.id), date: day }), signal: AbortSignal.timeout(8000) });
        return ok();
      }
      if (!/^\/(start|menu|hisobot|report)(@\w+)?(\s|$)/i.test(text)) return ok();
      if (!(await core.isAuthorizedChat(chat.id))) {
        const priv = Number(chat.id) > 0;
        await core.telegram('sendMessage', token, { chat_id: chat.id, parse_mode: 'HTML',
          text: priv
            ? `🔒 Sizga ruxsat berilmagan.\nSizning ID: <code>${chat.id}</code>\n\nHisobotlar faqat hisobot guruhining a’zolari uchun. Guruhga qo‘shiling (bot guruhda admin bo‘lishi kerak) yoki administratorga shu ID ni yuboring.`
            : `🔒 Bu chat hali ulanmagan.\nChat ID: <code>${chat.id}</code>\n\nStock Book > Report > Telegram delivery bo‘limida shu guruhni tanlab saqlang, so‘ng /start yuboring.` });
        return ok();
      }
      await core.sendMenu(token, chat.id, '0', Number(chat.id) > 0 ? 'Dashboardni oching yoki hisobotni tanlang:' : undefined);
      return ok();
    }

    if (update.callback_query) {
      const q = update.callback_query, msg = q.message, chatId = msg && msg.chat && msg.chat.id, data = String(q.data || '');
      if (!chatId || !(await core.isAuthorizedChat(chatId))) {
        await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id, text: 'Bu chat ulanmagan.', show_alert: true }).catch(() => {});
        return ok();
      }
      const [kind, a, b] = data.split(':');
      const PERIODS = ['0', '1', '7', 'm'];
      if (kind === 'p') { // switch period (Today / Yesterday / Last 7 days / Last month): just redraw the menu
        const p = PERIODS.includes(a) ? a : '0';
        await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id }).catch(() => {});
        await core.telegram('editMessageText', token, { chat_id: chatId, message_id: msg.message_id, text: core.menuText(p), parse_mode: 'HTML', reply_markup: core.menuKeyboard(p, chatId) }).catch(() => {});
        return ok();
      }
      if (kind === 'c') {
        await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id, text: '⏳ Taqqoslash tayyorlanmoqda…' }).catch(() => {});
        const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
        await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: 'compare', chatId: String(chatId), kind: a === 'w' ? 'w' : 'm' }), signal: AbortSignal.timeout(8000) });
        return ok();
      }
      if (kind === 'r') {
        const scope = a, period = PERIODS.includes(b) ? b : '0';
        const known = scope === 'all' || core.STORE_MENU.some(s => s.key === scope);
        if (!known) { await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id, text: 'Noma’lum tugma.' }).catch(() => {}); return ok(); }
        await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id, text: '⏳ Hisobot tayyorlanmoqda, rasmlar bilan birga yuboriladi…' }).catch(() => {});
        await dispatchReport(chatId, scope, period);
        return ok();
      }
      await core.telegram('answerCallbackQuery', token, { callback_query_id: q.id }).catch(() => {});
    }
  } catch (e) {
    console.error('telegram-bot webhook error:', e && e.stack ? e.stack : String(e));
  }
  return ok(); // always 200 so Telegram does not retry the same update
}
