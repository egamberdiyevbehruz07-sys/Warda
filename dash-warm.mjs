import core from '../lib/telegram-report-core.cjs';

// Keeps the Mini App fast: every 20 minutes (08:00-24:00 Tashkent) rebuilds today, this week, yesterday and this month
// in the background, so opening the dashboard shows ready numbers instead of waiting for BILLZ.
export const config = { schedule: '*/20 3-19 * * *' };

export default async function dashWarm() {
  const d = core.dashDefaults();
  const keys = [d.da, d.wa, d.db, core.dashOptions()[0].key].filter(core.validMonth);
  for (const k of keys) {
    try {
      const todo = await core.dashClaimBuilds([k], false);
      if (todo.length) { const t = Date.now(); await core.dashBuild(k); console.log('Dashboard warmed:', k, Date.now() - t, 'ms'); }
    } catch (e) { console.error('Dashboard warm failed:', k, String(e && e.message)); }
  }
  return new Response('ok');
}
