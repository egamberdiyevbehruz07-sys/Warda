import core from '../lib/telegram-report-core.cjs';

// Safety net for the 22:30 report. Runs at 22:45 and 23:45 Asia/Tashkent (17:45 and 18:45 UTC).
// If today's nightly report was not delivered, it starts the same background job again.
export const config = { schedule: '45 17,18 * * *' };

export default async function dailyTelegramReportRetry() {
  const token = core.getTelegramToken();
  const cfg = await core.getTelegramSettings();
  if (!cfg || !cfg.chatId || cfg.enabled === false) { console.log('Retry skipped: no saved group or automatic reports are paused.'); return; }
  const date = core.todayTashkent();
  if (await core.wasNightlySent(date)) { console.log('Retry not needed: nightly report for', date, 'was already sent.'); return; }
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!siteUrl) throw new Error('Netlify URL is missing; cannot dispatch the retry.');
  const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'retry', date, requestedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Could not start the retry job (${r.status}).`);
  console.log('Nightly report was missing for', date, '- retry job accepted.');
}
