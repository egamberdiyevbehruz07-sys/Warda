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
    if (job.trigger === 'monthly') {
      // 1st of the month: send last month's overall report to the saved group.
      const cfg = await core.getTelegramSettings();
      if (!cfg || !cfg.chatId || cfg.enabled === false) { console.log('Monthly report skipped: no saved group or reports paused.'); return; }
      const range = core.rangeForPeriod('m');
      if (await core.wasMonthlySent(range.monthKey)) { console.log('Monthly report already sent for', range.monthKey); return; }
      const result = await core.sendReportView({ chatId: cfg.chatId, scope: 'all', period: 'm' });
      await core.markMonthlySent(range.monthKey);
      try { await core.sendCompareView(cfg.chatId, 'm'); } catch (e) { console.error('Monthly comparison failed:', String(e && e.message)); }
      for (const m of [range.monthKey, core.shiftMonth(range.monthKey, -1)]) { try { await core.dashBuild(m); } catch (e) { console.error('Dashboard pre-build failed:', m, String(e && e.message)); } }
      console.log('Monthly report sent:', JSON.stringify({ ...result, durationMs: Date.now() - startedAt }));
      return;
    }
    if (job.trigger !== 'manual' || job.refresh === true) {
      console.log('Step 1/2: syncing BILLZ daily data into Supabase.');
      const sync = await core.syncBillzToday({ date: job.date });
      console.log('BILLZ snapshot saved:', JSON.stringify(sync));
    } else {
      console.log('Manual send: using the saved Supabase report snapshot.');
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
