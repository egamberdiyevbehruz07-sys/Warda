// Netlify scheduled functions have a short execution window. Keep this cron
// handler lightweight: hand the actual BILLZ sync + Telegram delivery to a
// Netlify Background Function, which can run for longer.
export const config = { schedule: '30 17 * * *' }; // 22:30 Asia/Tashkent (UTC+5)

export default async function dailyTelegramReport() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing; cannot securely dispatch the report job.');
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!siteUrl) throw new Error('Netlify URL is missing; cannot dispatch the report background job.');

  const response = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ trigger: 'scheduled', requestedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not start Telegram report background job (${response.status}): ${detail.slice(0, 300)}`);
  }
  console.log('Telegram report background job accepted by Netlify:', response.status);
}
