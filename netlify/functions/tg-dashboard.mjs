import core from '../lib/telegram-report-core.cjs';

// API for the Telegram Mini App dashboard (/tg/).
// Every request carries Telegram's signed initData: we verify the signature, then check that the user
// belongs to the saved private group. Month summaries are built in the background and cached in Supabase.
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async function tgDashboard(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  let body; try { body = await request.json(); } catch { return json(400, { error: 'Bad request' }); }
  let user;
  try { user = core.verifyInitData(String(body.initData || '')); } catch (e) { return json(500, { error: 'Bot is not configured.' }); }
  if (!user) return json(401, { error: 'Telegram imzosi tasdiqlanmadi. Dashboardni bot ichidan oching.' });
  if (!(await core.isAuthorizedUser(user.id))) return json(403, { error: 'Bu Dashboard faqat Access Management bo‘limida ulangan Telegram guruhi a’zolari uchun. Guruh adminidan guruhga qo‘shishni so‘rang.' });

  const base = { options: core.dashOptions(), weekOptions: core.dashWeekOptions(), dayOptions: core.dashDayOptions(), defaults: core.dashDefaults(), user: { id: user.id, name: user.first_name || '' } };
  const months = [...new Set((Array.isArray(body.months) ? body.months : []).map(String))].filter(core.validMonth).slice(0, 2);
  if (!months.length) return json(200, { ...base, status: 'ready', months: {} });

  const out = {}; let allFresh = true, anyBuilding = false;
  for (const m of months) {
    const { payload, fresh, building } = await core.dashGet(m);
    out[m] = payload;
    if (!fresh) allFresh = false;
    if (building) anyBuilding = true;
  }
  if (!allFresh || body.refresh === true) {
    // A manual refresh must rebuild completed historical dates too, not only partial periods.
    const todo = await core.dashClaimBuilds(months, body.refresh === true);
    if (todo.length) {
      const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
      try {
        if (!siteUrl) throw new Error('Hosting URL is not configured.');
        const started = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
          method: 'POST', headers: { Authorization: `Bearer ${core.getTelegramToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'dash', months: todo }), signal: AbortSignal.timeout(8000)
        });
        if (!started.ok) throw new Error(`Background worker returned HTTP ${started.status}.`);
        anyBuilding = true;
      } catch (e) {
        await core.dashReleaseBuilds(todo).catch(() => {});
        console.error('Could not start dashboard build:', String(e && e.message));
        return json(503, { error: 'BILLZ hisobotini yangilash ishga tushmadi. Internet yoki server holatini tekshirib, qayta urinib ko‘ring.' });
      }
    } else if (body.refresh === true) {
      // No new worker was claimed because a build is already running; keep the UI polling.
      anyBuilding = anyBuilding || months.some(m => out[m]);
    }
  }
  for (const m of months) if (out[m]) out[m].meta = { ...out[m].meta, ...core.dashLabels(m) }; // labels depend on today's date, so they are never read from the cache
  const ready = months.every(m => out[m]);
  const status = !ready ? 'building' : (allFresh && !anyBuilding ? 'ready' : 'updating');
  return json(200, { ...base, status, months: out });
}
