import core from '../lib/telegram-report-core.cjs';

// Dashboard-only background worker. It only builds/caches Mini App data; Telegram chat delivery is disabled.
export default async function dailyTelegramReportBackground(request) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  if (!token || (request.headers.get('authorization') || '') !== `Bearer ${token}`) return new Response('Unauthorized', { status: 401 });
  const job = await request.json().catch(() => ({}));
  if (job.trigger !== 'dash') {
    console.log('Telegram chat delivery disabled; ignored trigger:', job.trigger || 'unknown');
    return new Response('Chat delivery disabled. Dashboard data only.', { status: 200 });
  }
  const startedAt = Date.now();
  for (const month of (Array.isArray(job.months) ? job.months : []).filter(core.validMonth)) {
    try { await core.dashBuild(month); console.log('Dashboard month built:', month, 'after', Date.now() - startedAt, 'ms'); }
    catch (e) { console.error('Dashboard month failed:', month, e && e.stack ? e.stack : String(e)); }
  }
  return new Response('Dashboard cache build complete.', { status: 200 });
}
