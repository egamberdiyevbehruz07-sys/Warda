import core from '../netlify/lib/telegram-report-core.cjs';

const base = String(process.env.MINIAPP_URL || process.env.RENDER_EXTERNAL_URL || process.argv[2] || '').trim().replace(/\/$/, '');
if (!base || !/^https:\/\//i.test(base)) {
  console.error('Set MINIAPP_URL to the public HTTPS Render URL, then run npm run configure:telegram.');
  process.exit(1);
}
const token = core.getTelegramToken();
const bot = await core.telegram('getMe', token, {});
if (String(bot.username || '').toLowerCase() !== 'wardareport2026_bot') {
  throw new Error(`The configured token belongs to @${bot.username || 'unknown'}, not @wardareport2026_bot. Check TELEGRAM_BOT_TOKEN.`);
}
const webhookUrl = `${base}/.netlify/functions/telegram-bot`;
const appUrl = `${base}/tg/`;
await core.telegram('setWebhook', token, {
  url: webhookUrl,
  secret_token: core.webhookSecret(),
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  drop_pending_updates: false,
  max_connections: 10
});
await core.telegram('setMyCommands', token, { commands: [{ command: 'start', description: 'Dashboardni ochish' }] });
await core.telegram('setChatMenuButton', token, {
  menu_button: { type: 'web_app', text: 'Dashboard', web_app: { url: appUrl } }
});
await core.telegram('setMyShortDescription', token, { short_description: 'Do‘kon hisobotlari: savdo, kirim va hafta/oy taqqoslash.' }).catch(() => {});
await core.telegram('setMyDescription', token, { description: 'Do‘kon hisobotlari: savdo, kirim, Top 10 mahsulotlar va hafta/oy taqqoslash.\n\nDashboardni ochish uchun pastdagi «Dashboard» tugmasini bosing.' }).catch(() => {});
console.log('Telegram Mini App configured successfully.');
console.log('Webhook:', webhookUrl);
console.log('Dashboard:', appUrl);
console.log('Note: dashboard users still need to satisfy the currently configured Telegram group-access rule.');
