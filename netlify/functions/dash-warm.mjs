// Keeps the Telegram dashboard ready: every 30 minutes between 09:00 and 23:30 (Asia/Tashkent) it starts a
// background job that refreshes today's, this week's and (every few hours) this month's summary, so opening
// the dashboard does not have to wait for BILLZ.
export const config = { schedule: '*/30 4-18 * * *' };

export default async function dashWarm() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!token || !siteUrl) { console.log('Dashboard warm-up skipped: bot token or site URL missing.'); return; }
  const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'dashwarm', requestedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Could not start the dashboard warm-up (${r.status}).`);
}
