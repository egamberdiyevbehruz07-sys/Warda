export const config = { schedule: '45 17,18 * * *' };

// Telegram chat delivery is intentionally disabled. Reports are viewed only in the Mini App.
export default async function dailyTelegramReportRetry() { console.log('Skipped: dashboard-only mode; no Telegram chat reports are sent.'); }
