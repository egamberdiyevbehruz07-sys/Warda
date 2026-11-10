// Sends LAST MONTH's overall report on the 1st of every month: 09:00 and 13:00 Asia/Tashkent
// (04:00 and 08:00 UTC). The second run is a safety net; it does nothing if the report was already sent.
export const config = { schedule: '0 4,8 1 * *' };

export default async function monthlyTelegramReport() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing; cannot dispatch the monthly report.');
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!siteUrl) throw new Error('Netlify URL is missing; cannot dispatch the monthly report.');
  const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'monthly', requestedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Could not start the monthly report job (${r.status}).`);
  console.log('Monthly report job accepted:', r.status);
}
