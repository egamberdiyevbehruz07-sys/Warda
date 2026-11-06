export const config = { schedule: '30 17 * * *' };

// Telegram chat delivery is intentionally disabled. Reports are viewed only in the Mini App.
export default async function dailyTelegramReport() { console.log('Skipped: dashboard-only mode; no Telegram chat reports are sent.'); }
