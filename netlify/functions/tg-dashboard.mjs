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
  if (!(await core.isAuthorizedUser(user.id))) return json(403, { error: 'Sizga ruxsat berilmagan. Hisobot guruhining a’zosi bo‘lishingiz kerak.', userId: user.id });

  const base = { options: core.dashOptions(), weekOptions: core.dashWeekOptions(), dayOptions: core.dashDayOptions(), defaults: core.dashDefaults(), user: { id: user.id, name: user.first_name || '' } };
  const months = [...new Set((Array.isArray(body.months) ? body.months : []).map(String))].filter(core.validMonth).slice(0, 2);
  if (!months.length) return json(200, { ...base, status: 'ready', months: {} });

  const out = {}; let allFresh = true;
  for (const m of months) { const { payload, fresh } = await core.dashGet(m); out[m] = payload; if (!fresh) allFresh = false; }
  if (!allFresh || body.refresh === true) {
    const todo = await core.dashClaimBuilds(months, body.refresh === true && months.some(m => out[m] && out[m].meta && out[m].meta.partial));
    if (todo.length) {
      for (const m of todo) await core.cacheSet('dasherr:' + m, { msg: '', at: 0 }).catch(() => {}); // a new attempt replaces the old error
      const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
      const fail = async msg => { console.error('Could not start dashboard build:', msg); for (const m of todo) await core.cacheSet('dasherr:' + m, { msg, at: Date.now() }).catch(() => {}); await core.cacheSet('dashbuild:' + todo[0], { at: 0 }).catch(() => {}); };
      if (!siteUrl) await fail('Netlify site URL is not available to the function (environment variable URL is empty).');
      else try {
        const r = await fetch(`${siteUrl}/.netlify/functions/daily-telegram-report-background`, {
          method: 'POST', headers: { Authorization: `Bearer ${core.getTelegramToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'dash', months: todo }), signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) await fail(`The background job did not start (HTTP ${r.status}${r.status === 401 ? ' - bot token mismatch' : r.status === 404 ? ' - function daily-telegram-report-background is not deployed' : ''}).`);
      } catch (e) { await fail('The background job could not be reached: ' + String(e && e.message)); }
    }
  }
  for (const m of months) if (out[m]) out[m].meta = { ...out[m].meta, ...core.dashLabels(m) }; // labels depend on today's date, so they are never read from the cache
  const ready = months.every(m => out[m]);
  if (!ready) {
    for (const m of months) { if (out[m]) continue; const err = await core.dashError(m); if (err) return json(200, { ...base, status: 'build_error', error: err, months: out }); }
    const storeErr = await core.cacheSelfTest(); // nothing is ready and no error was recorded: make sure storage works at all
    if (storeErr) return json(200, { ...base, status: 'build_error', error: storeErr, months: out });
  }
  return json(200, { ...base, status: ready ? (allFresh ? 'ready' : 'updating') : 'building', months: out });
}
