import core from '../lib/telegram-report-core.cjs';

// Netlify Background Function: lets the report continue beyond the 30-second
// scheduled-function window. Only the scheduled dispatcher (which uses the
// server-side bot token as an internal bearer secret) can start this job.
export default async function dailyTelegramReportBackground(request) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || '').trim();
  const authorization = request.headers.get('authorization') || '';
  if (!token || authorization !== `Bearer ${token}`) {
    console.warn('Rejected unauthorized Telegram report background invocation.');
    return new Response('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const job = await request.json().catch(() => ({}));
  console.log('Telegram report background job started:', job.trigger || 'manual');
  try {
    if (job.trigger === 'bot') {
      // A menu button was tapped in Telegram: build that one report view and send it to that chat.
      const result = await core.sendReportView({ chatId: job.chatId, scope: job.scope, period: job.period, date: job.date });
      console.log('Bot report sent:', JSON.stringify({ ...result, durationMs: Date.now() - startedAt }));
      return;
    }
    if (job.trigger === 'diag') {
      await core.sendSalesCheck(job.chatId, job.date);
      return;
    }
    if (job.trigger === 'compare') {
      await core.sendCompareView(job.chatId, job.kind === 'w' ? 'w' : 'm');
      console.log('Comparison sent:', job.kind, 'after', Date.now() - startedAt, 'ms');
      return;
    }
    if (job.trigger === 'dash') {
      // Mini App dashboard: build the monthly summaries (one after another, each is saved as soon as it is ready).
      for (const m of (Array.isArray(job.months) ? job.months : []).filter(core.validMonth)) {
        try { await core.dashBuild(m); console.log('Dashboard month built:', m, 'after', Date.now() - startedAt, 'ms'); }
        catch (e) { console.error('Dashboard month failed:', m, e && e.stack ? e.stack : String(e)); }
      }
      return;
    }
    if (job.trigger === 'dashwarm') {
      // Refresh the dashboard summaries people open most. The month is rebuilt at most every 3 hours.
      const today = core.todayTashkent();
      const keys = ['d:' + today, 'w:' + today];
      const mk = today.slice(0, 7), hit = await core.cacheGet('dash:' + mk).catch(() => null);
      const age = hit && hit.payload && hit.payload.meta ? Date.now() - Date.parse(hit.payload.meta.built) : Infinity;
      if (age > 3 * 60 * 60 * 1000) keys.push(mk);
      for (const k of keys.filter(core.validMonth)) {
        try { await core.dashBuild(k); console.log('Dashboard warm-up built:', k, 'after', Date.now() - startedAt, 'ms'); }
        catch (e) { console.error('Dashboard warm-up failed:', k, String(e && e.message)); }
      }
      return;
    }
    if (job.trigger === 'monthly') {
      // 1st of the month: build last month's summary for the dashboard and post ONE short message with the dashboard button.
      const cfg = await core.getTelegramSettings();
      if (!cfg || !cfg.chatId || cfg.enabled === false) { console.log('Monthly report skipped: no saved group or reports paused.'); return; }
      const range = core.rangeForPeriod('m');
      if (await core.wasMonthlySent(range.monthKey)) { console.log('Monthly report already sent for', range.monthKey); return; }
      try { await core.dashBuild(range.monthKey); } catch (e) { console.error('Monthly dashboard build failed:', String(e && e.message)); }
      await core.telegram('sendMessage', core.getTelegramToken(), { chat_id: cfg.chatId, parse_mode: 'HTML', text: `📅 <b>${core.monthLabel(range.monthKey)} — oylik hisobot tayyor</b>\nDashboard › Oylik bo‘limida oching.`, reply_markup: { inline_keyboard: [core.dashboardRow(cfg.chatId)] } });
      await core.markMonthlySent(range.monthKey);
      console.log('Monthly notice sent for', range.monthKey, 'after', Date.now() - startedAt, 'ms');
      return;
    }
    if (job.trigger !== 'manual' || job.refresh === true) {
      console.log('Step 1/2: syncing BILLZ daily data into Supabase.');
      const sync = await core.syncBillzToday({ date: job.date });
      console.log('BILLZ snapshot saved:', JSON.stringify(sync));
    } else {
      console.log('Manual send: using the saved Supabase report snapshot.');
    }

    if (job.trigger === 'scheduled' || job.trigger === 'retry') {
      // No automatic group report any more: the group uses the dashboard. Keep today's data fresh for it.
      const today = job.date || core.todayTashkent();
      for (const k of ['d:' + today, 'd:' + core.dashDayOptions()[1].key.slice(2), 'w:' + today, today.slice(0, 7)].filter(core.validMonth)) {
        try { await core.dashBuild(k); } catch (e) { console.error('Dashboard pre-build failed:', k, String(e && e.message)); }
      }
      await core.markNightlySent(today);
      console.log('Nightly sync done; group report is disabled (dashboard only). After', Date.now() - startedAt, 'ms');
      return;
    }
    console.log('Step 2/2: sending daily report and product photo albums to saved Telegram group.');
    const result = await core.sendDailyReport({ date: job.date, force: true, refresh: false, markNightly: job.trigger === 'scheduled' || job.trigger === 'retry' });
    console.log('Telegram daily report completed:', JSON.stringify({
      ...result,
      chatId: result && result.chatId ? '[configured]' : undefined,
      durationMs: Date.now() - startedAt
    }));
  } catch (error) {
    console.error('Telegram report background job failed:', error && error.stack ? error.stack : String(error));
    throw error;
  }
}
