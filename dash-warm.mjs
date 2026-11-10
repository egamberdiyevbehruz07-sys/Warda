// Warm Mini App dashboard data only. This scheduled job never sends chat messages or photos.
import core from '../lib/telegram-report-core.cjs';
export const config = { schedule: '*/30 4-18 * * *' };

export default async function dashWarm() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!token || !siteUrl) { console.log('Dashboard warm-up skipped: bot token or site URL missing.'); return; }
  const d = core.dashDefaults();
  const months = [...new Set([d.a, d.b, d.wa, d.wb].filter(core.validMonth))];
  const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'dash', months, requestedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Could not start the dashboard cache warm-up (${r.status}).`);
}
