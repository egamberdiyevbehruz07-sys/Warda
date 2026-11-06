'use strict';
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAqFp2SG979LRDAFDCXfrhbam3eA8vtsbA';
const { getTelegramToken, telegram, saveTelegramSettings, getTelegramSettings, listSeenChats, webhookSecret, dashDefaults } = require('../lib/telegram-report-core.cjs');
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
async function signedIn(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const idToken = h.replace(/^Bearer\s+/i, ''); if (!idToken) return false;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) return false; const j = await r.json().catch(() => ({})); return !!(j.users && j.users.length);
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST' }, body: '' };
    if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
    if (!(await signedIn(event))) return reply(401, { error: 'Sign in to Stock Book first.' });
    const body = JSON.parse(event.body || '{}'), action = String(body.action || '');
    const token = getTelegramToken();
    if (action === 'getSettings') {
      const settings = await getTelegramSettings();
      if (settings === null) return reply(200, { ok:true, settings:null, storage:'firebase-fallback' });
      let chatTitle = '';
      if (settings && settings.chatId) { try { const c = await telegram('getChat', token, { chat_id: settings.chatId }); chatTitle = c.title || ''; } catch (_) {} }
      return reply(200, { ok:true, settings: settings && settings.chatId ? { ...settings, chatTitle } : settings, storage:'supabase' });
    }
    if (action === 'findChats') {
      const bot = await telegram('getMe', token, {});
      const expectedBot = 'wardareport2026_bot';
      if (String(bot.username || '').toLowerCase() !== expectedBot) {
        return reply(400, { error: 'The token belongs to @' + (bot.username || 'unknown bot') + ', not @' + expectedBot + '. Update TELEGRAM_BOT_TOKEN in Netlify with the token from @BotFather for the correct bot, then redeploy.' });
      }
      const webhook = await telegram('getWebhookInfo', token, {});
      if (webhook.url && /\/\.netlify\/functions\/telegram-bot$/.test(webhook.url)) {
        // Bot menu is active: Telegram delivers updates to our webhook, so getUpdates is unavailable.
        const seen = await listSeenChats();
        return reply(200, { ok: true, chats: seen, viaWebhook: true });
      }
      if (webhook.url) return reply(400, { error: 'The correct bot is reachable (@' + bot.username + '), but it already has a Telegram webhook configured. getUpdates cannot list chats while a webhook is active. If this bot is only for Stock Book, remove the old webhook, then send /start and try again. Otherwise enter your chat ID manually.' });
      const url = `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=%5B%22message%22%2C%22my_chat_member%22%2C%22channel_post%22%5D`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) }); const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return reply(400, { error: 'Could not read Telegram updates: ' + (data.description || 'Telegram API error') + '. Open @' + expectedBot + ', press Start, send /start, and try again.' });
      const unique = new Map();
      for (const u of data.result || []) { const m = u.message || u.edited_message || u.channel_post || u.my_chat_member; const c = m && m.chat; if (!c || c.id == null) continue;
        const label = [c.title, [c.first_name, c.last_name].filter(Boolean).join(' '), c.username ? '@'+c.username : '', c.type].filter(Boolean).join(' · ');
        unique.set(String(c.id), { id: String(c.id), label: label || String(c.id), type: c.type || 'chat' }); }
      return reply(200, { ok: true, chats: [...unique.values()] });
    }
    if (action === 'sendTest') {
      const chatId = String(body.chatId || '').trim(); if (!chatId) return reply(400, { error: 'Choose or enter the private Telegram group chat ID.' });
      const bot = await telegram('getMe', token, {});
      if (String(bot.username || '').toLowerCase() !== 'wardareport2026_bot') {
        return reply(400, { error: 'The configured token belongs to @' + (bot.username || 'unknown bot') + ', not @wardareport2026_bot. Replace TELEGRAM_BOT_TOKEN with the token created for the correct bot, then redeploy.' });
      }
      // Do not call getChat here: Telegram can return CHAT_NOT_FOUND for a group
      // that was already discovered from getUpdates. A successful sendMessage is
      // the definitive check that this bot can post to the selected chat.
      const savedToSupabase = await saveTelegramSettings(chatId, false);
      return reply(200, { ok: true, chatId, chatTitle: '', botUsername: bot.username, chatType: 'group-or-supergroup', storage:savedToSupabase?'supabase':'firebase-fallback' });
    }
    if (action === 'enableBot') {
      const bot = await telegram('getMe', token, {});
      if (String(bot.username || '').toLowerCase() !== 'wardareport2026_bot') return reply(400, { error: 'The token belongs to @' + (bot.username || 'unknown bot') + ', not @wardareport2026_bot.' });
      const siteUrl = String(process.env.URL || '').replace(/\/$/, '');
      if (!siteUrl) return reply(500, { error: 'Netlify URL is missing; deploy the site first.' });
      const url = siteUrl + '/.netlify/functions/telegram-bot';
      await telegram('setWebhook', token, { url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query', 'my_chat_member'], drop_pending_updates: false, max_connections: 10 });
      await telegram('setMyCommands', token, { commands: [{ command: 'start', description: 'Dashboardni ochish' }] });
      let menuButton = true;
      try { await telegram('setChatMenuButton', token, { menu_button: { type: 'web_app', text: 'Dashboard', web_app: { url: siteUrl + '/tg/' } } }); } catch (e) { menuButton = false; }
      try { // text shown on the bot's profile page
        await telegram('setMyShortDescription', token, { short_description: 'Do‘kon hisobotlari: savdo, kirim va hafta/oy taqqoslash.' });
        await telegram('setMyDescription', token, { description: 'Do‘kon hisobotlari: savdo, kirim, Top 10 mahsulotlar va hafta/oy taqqoslash.\n\nDashboardni ochish uchun pastdagi «Open» tugmasini bosing yoki /start yuboring.' });
      } catch (_) {}
      try { // pre-build last month and the month before so the dashboard opens instantly
        await fetch(siteUrl + '/.netlify/functions/daily-telegram-report-background', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: 'dash', months: [dashDefaults().a, dashDefaults().b, dashDefaults().wa, dashDefaults().wb] }), signal: AbortSignal.timeout(8000) });
      } catch (_) {}
      return reply(200, { ok: true, webhook: url, menuButton });
    }
    if (action === 'sendReportNow') return reply(403, { error: 'Telegram chat reports are disabled. Open the Dashboard Mini App.' });
    return reply(400, { error: 'Unknown action.' });
  } catch (e) { return reply(500, { error: String((e && e.message) || e) }); }
};
