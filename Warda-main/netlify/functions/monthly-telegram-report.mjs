export const config = { schedule: '0 4,8 1 * *' };

// Telegram chat delivery is intentionally disabled. Reports are viewed only in the Mini App.
export default async function monthlyTelegramReport() { console.log('Skipped: dashboard-only mode; no Telegram chat reports are sent.'); }
