'use strict';

const TZ = 'Asia/Tashkent';

// Reporting settings and daily report snapshots live in Supabase; the main Stock Book data remains in Firebase.
function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url && !key) return null; // Supabase is required for the Telegram reporting path
  if (!url || !key) throw new Error('Telegram Supabase setup is incomplete: set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify Functions.');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error('SUPABASE_URL must be your Supabase project URL, for example https://YOUR_PROJECT_REF.supabase.co.');
  return { url, key };
}
async function supabaseRequest(path, options = {}) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const response = await fetch(cfg.url + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: {
      apikey: cfg.key,
      // New-style keys (sb_secret_...) are not JWTs and go in the apikey header only; legacy service_role keys (eyJ...) also go in Authorization.
      ...(cfg.key.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + cfg.key }),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 12000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Supabase request failed (' + response.status + '): ' + cut(body || response.statusText, 350));
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}
async function saveTelegramSettings(chatId, enabled = true) {
  if (!getSupabaseConfig()) return false;
  await supabaseRequest('stock_book_telegram_settings?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { id: 'default', chat_id: String(chatId), enabled: enabled !== false, timezone: TZ, daily_time: '22:30', updated_at: new Date().toISOString() }
  });
  const check = await getTelegramSettings();
  if (!check || String(check.chatId) !== String(chatId)) throw new Error('Telegram group was not saved in Supabase. Check the Supabase service role key and table permissions.');
  return true;
}
async function getTelegramSettings() {
  if (getSupabaseConfig()) {
    const rows = await supabaseRequest('stock_book_telegram_settings?id=eq.default&select=id,chat_id,enabled,timezone,daily_time');
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { chatId: row.chat_id, enabled: row.enabled !== false, timezone: row.timezone || TZ, dailyTime: row.daily_time || '22:30' } : {};
  }
  return null;
}
async function saveDailyReportSnapshot(date, rows, syncStatus, variants = []) {
  if (!getSupabaseConfig()) return false;
  const photoVariants = variants.filter(v => typeof v.photo === 'string' && /^https?:\/\//i.test(v.photo)).map(v => ({
    bc: v.bc || '', productId: v.productId || '', sku: v.sku || '', art: v.art || '',
    color: v.color || '', size: v.size || '', photo: v.photo
  }));
  const previous = await getDailyReportSnapshot(date).catch(() => null);
  await supabaseRequest('stock_book_daily_reports?on_conflict=report_date', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { report_date: date, payload: { date, nightlySentAt: (previous && previous.nightlySentAt) || null, rows: rows.map(x => ({ ...x, photo: (typeof x.photo === 'string' && /^https?:\/\//i.test(x.photo)) ? x.photo : '' })), syncStatus: syncStatus || null, photoVariants }, updated_at: new Date().toISOString() }
  });
  return true;
}
async function getDailyReportSnapshot(date) {
  if (!getSupabaseConfig()) return null;
  const rows = await supabaseRequest('stock_book_daily_reports?report_date=eq.' + encodeURIComponent(date) + '&select=payload');
  return Array.isArray(rows) && rows[0] && rows[0].payload ? rows[0].payload : null;
}

async function wasNightlySent(date) {
  const snap = await getDailyReportSnapshot(date);
  return !!(snap && snap.nightlySentAt);
}
async function markNightlySent(date) {
  const snap = await getDailyReportSnapshot(date);
  if (!snap) return;
  await supabaseRequest('stock_book_daily_reports?on_conflict=report_date', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { report_date: date, payload: { ...snap, nightlySentAt: new Date().toISOString() }, updated_at: new Date().toISOString() }
  });
}

function getTelegramToken() {
  const t = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is missing in Netlify environment variables. Store the bot token in Netlify, not in website code.');
  return t.trim();
}
function todayTashkent() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (v, n = 160) => { const s = String(v == null ? '' : v).trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const qty = x => Math.round(Number(x) || 0);
const picUrl = v => typeof v === 'string' && (/^https?:\/\//i.test(v) || /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(v)) ? v : '';

async function telegram(method, token, payload, timeoutMs = 20000) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs)
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return j.result;
      const description = j.description || 'Unknown Telegram API error';
      const retryable = r.status === 429 || r.status >= 500;
      lastError = new Error(`Telegram ${method} failed (${r.status}): ${cut(description, 300)}`);
      if (j.parameters && j.parameters.migrate_to_chat_id) lastError.migrateTo = String(j.parameters.migrate_to_chat_id);
      if (!retryable || attempt === 2) throw lastError;
      const retryAfter = Number(j.parameters && j.parameters.retry_after) || (attempt + 1) * 2;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 8) * 1000));
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !/fetch failed|network|timeout|timed out|aborted/i.test(String(error && error.message))) throw error;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
    }
  }
  throw lastError || new Error(`Telegram ${method} failed after retries.`);
}
async function sendOnePhoto(token, chatId, item) {
  const p = picUrl(item.photo);
  if (!p) return false;
  const caption = cut(item.caption || '', 900);
  // Try Telegram's remote URL support first; this is the smallest and fastest transfer.
  if (/^https?:\/\//i.test(p)) {
    try { await telegram('sendPhoto', token, { chat_id: chatId, photo: p, caption, parse_mode: 'HTML' }, 6000); return true; }
    catch (_) { /* If Telegram cannot fetch a protected/redirected CDN URL, fetch it here and upload bytes. */ }
  }
  try {
    let bytes, mime = 'image/jpeg', filename = 'product.jpg';
    if (/^data:image\//i.test(p)) {
      const m = p.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i); if (!m) return false;
      mime = m[1]; bytes = Buffer.from(m[2], 'base64'); filename = mime.includes('png') ? 'product.png' : 'product.jpg';
    } else {
      const r = await fetch(p, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return false;
      mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const ab = await r.arrayBuffer(); if (ab.byteLength > 9 * 1024 * 1024 || ab.byteLength < 100) return false;
      bytes = Buffer.from(ab); filename = mime.includes('png') ? 'product.png' : mime.includes('webp') ? 'product.webp' : 'product.jpg';
    }
    if (!/^image\//i.test(mime) || bytes.length > 9 * 1024 * 1024) return false;
    const form = new FormData(); form.set('chat_id', String(chatId)); form.set('caption', caption); form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([bytes], { type: mime }), filename);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(6000) });
    const data = await res.json().catch(() => ({})); return !!(res.ok && data.ok);
  } catch (e) { console.warn('Photo send skipped:', cut(e.message, 160)); return false; }
}
async function sendPhotoAlbum(token, chatId, items, maxItems) {
  const list = items.filter(x => picUrl(x.photo)).slice(0, maxItems);
  if (!list.length) return 0;
  // Group public URLs as an album for a compact Telegram view. Individual upload is a fallback.
  if (list.length >= 2 && list.every(x => /^https?:\/\//i.test(x.photo))) {
    try {
      await telegram('sendMediaGroup', token, { chat_id: chatId, media: list.map(x => ({ type: 'photo', media: x.photo, caption: cut(x.caption || '', 900), parse_mode: 'HTML' })) }, 7000);
      return list.length;
    } catch (e) { console.warn('Photo album URL fallback:', cut(e.message, 180)); }
  }
  let sent = 0;
  // Limit concurrent fallback sends to five, keeping the daily function inside Netlify's short scheduled runtime.
  for (let i = 0; i < list.length; i += 5) {
    const results = await Promise.all(list.slice(i, i + 5).map(x => sendOnePhoto(token, chatId, x).catch(() => false)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}

function variantLookup(variants) {
  const barcode = new Map(), id = new Map(), skus = new Map();
  for (const v of variants) {
    if (v.bc && !barcode.has(String(v.bc))) barcode.set(String(v.bc), v);
    if (v.productId && !id.has(String(v.productId))) id.set(String(v.productId), v);
    for (const k of new Set([v.sku, v.art].filter(Boolean).map(String))) { const a = skus.get(k) || []; a.push(v); skus.set(k, a); }
  }
  return row => {
    if (row.photo && picUrl(row.photo)) return row.photo;
    let v = row.bc ? barcode.get(String(row.bc)) : null;
    if (!v && row.productId) v = id.get(String(row.productId));
    if (!v) {
      const key = String(row.sku || row.art || '');
      const candidates = (skus.get(key) || []).filter(x => (!row.color || !x.color || String(x.color).toLowerCase() === String(row.color).toLowerCase()) && (!row.size || !x.size || String(x.size).toLowerCase() === String(row.size).toLowerCase()));
      if (candidates.length === 1) v = candidates[0];
    }
    return v && picUrl(v.photo) ? v.photo : '';
  };
}
function productKey(x) {
  const name = String(x.name || '').trim().toLocaleLowerCase();
  return name || String(x.art || x.sku || x.bc || 'Noma’lum mahsulot').trim().toLocaleLowerCase();
}

function colorLabelUz(value) {
  const raw = String(value || '').trim();
  const key = raw.toLocaleLowerCase().replace(/ё/g, 'е');
  const map = {
    'черный':'qora','чёрный':'qora','black':'qora','қора':'qora',
    'белый':'oq','white':'oq','белая':'oq','белое':'oq',
    'серый':'kulrang','серая':'kulrang','серое':'kulrang','gray':'kulrang','grey':'kulrang',
    'светло-серый':'och kulrang','светло серый':'och kulrang','light gray':'och kulrang','light grey':'och kulrang',
    'темно-серый':'to‘q kulrang','темно серый':'to‘q kulrang','dark gray':'to‘q kulrang','dark grey':'to‘q kulrang',
    'коричневый':'jigarrang','коричневая':'jigarrang','brown':'jigarrang',
    'светло-коричневый':'och jigarrang','светло коричневый':'och jigarrang','light brown':'och jigarrang',
    'бежевый':'bej','бежевая':'bej','beige':'bej',
    'молочный':'sut rang','молочная':'sut rang','ivory':'ivory','cream':'qaymoqrang',
    'красный':'qizil','красная':'qizil','red':'qizil',
    'бордовый':'bordo','бордовая':'bordo','burgundy':'bordo',
    'синий':'ko‘k','синяя':'ko‘k','blue':'ko‘k','голубой':'havorang','голубая':'havorang','light blue':'havorang',
    'зеленый':'yashil','зелёный':'yashil','зеленая':'yashil','green':'yashil',
    'розовый':'pushti','розовая':'pushti','pink':'pushti',
    'фиолетовый':'binafsha','фиолетовая':'binafsha','purple':'binafsha',
    'хаки':'xaki','khaki':'xaki',
    'оранжевый':'to‘q sariq','orange':'to‘q sariq',
    'желтый':'sariq','жёлтый':'sariq','yellow':'sariq'
  };
  return map[key] || raw;
}

function productLabel(x) { return String(x.name || x.art || x.bc || x.sku || 'Noma’lum mahsulot').trim(); }
function reasonLabel(x) {
  const note = String(x.note || '').trim();
  if (note) return cut(note.replace(/^Billz write-?off\s*/i, '').trim(), 100);
  const map = { mistake: 'Xatolik bilan kiritilgan', damaged: 'Shikastlangan', lost: 'Yo‘qolgan', free: 'Bepul berilgan', other: 'Boshqa sabab / sabab ko‘rsatilmagan' };
  return map[String(x.r || '').toLowerCase()] || 'Sabab ko‘rsatilmagan';
}
function fmtDate(date) { const [y, m, d] = date.split('-'); return `${d}.${m}.${y}`; }
function fmtTashkentTime(iso) { if (!iso) return ''; const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; return new Intl.DateTimeFormat('uz-UZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }

function addColor(map, color, q) {
  const raw = String(color || '').trim(), key = raw.toLocaleLowerCase();
  const o = map.get(key) || { color: raw, qty: 0 }; o.qty += q; map.set(key, o);
}
// "ko‘k — 7, qizil — 5": colors sold for one product (most sold first). Empty when BILLZ has no color for it.
function colorsText(x, max = 5) {
  const list = [...(x.colorMap ? x.colorMap.values() : [])].sort((a, b) => b.qty - a.qty);
  if (!list.some(c => c.color)) return '';
  const shown = list.slice(0, max).map(c => `${esc(cut(c.color ? colorLabelUz(c.color) : 'rang ko‘rsatilmagan', 24))} — ${c.qty.toLocaleString('uz-UZ')}`);
  return shown.join(', ') + (list.length > max ? ` · +${list.length - max} rang` : '');
}

function aggregate(rows, date, opts = {}) {
  const TOP = opts.top || 10;
  const sales = rows.filter(x => x.type === 'out');
  const imports = rows.filter(x => x.type === 'in');
  const writeoffs = rows.filter(x => x.type === 'rem');
  const salesProducts = new Map(), importProducts = new Map(), reasons = new Map(), stores = new Map(), colors = new Map();
  let gross = 0, returns = 0, net = 0;
  for (const x of sales) {
    const q = qty(x.qty); if (q > 0) gross += q; else returns += Math.abs(q); net += q;
    const k = productKey(x); const o = salesProducts.get(k) || { ...x, sold: 0, returned: 0, net: 0, lines: 0, colorMap: new Map() };
    if (q > 0) addColor(o.colorMap, x.color, q);
    if (q > 0) o.sold += q; else o.returned += Math.abs(q); o.net += q; o.lines++; if (!o.photo && x.photo) o.photo = x.photo; salesProducts.set(k, o);
    if (q > 0 && String(x.color || '').trim()) {
      const color = String(x.color).trim();
      const c = colors.get(color.toLocaleLowerCase()) || { color, qty: 0 };
      c.qty += q; colors.set(color.toLocaleLowerCase(), c);
    }
    const st = x.from || 'Do‘kon ko‘rsatilmagan', so = stores.get(st) || { store: st, gross: 0, returns: 0, net: 0, productMap: new Map(), colorMap: new Map() };
    if (q > 0) so.gross += q; else so.returns += Math.abs(q); so.net += q;
    const sp = so.productMap.get(k) || { ...x, sold: 0, returned: 0, net: 0, lines: 0, colorMap: new Map() };
    if (q > 0) addColor(sp.colorMap, x.color, q);
    if (q > 0) sp.sold += q; else sp.returned += Math.abs(q);
    sp.net += q; sp.lines++; if (!sp.photo && x.photo) sp.photo = x.photo; so.productMap.set(k, sp);
    if (q > 0 && String(x.color || '').trim()) {
      const ck = String(x.color).trim().toLocaleLowerCase();
      const co = so.colorMap.get(ck) || { color: String(x.color).trim(), qty: 0 };
      co.qty += q; so.colorMap.set(ck, co);
    }
    stores.set(st, so);
  }
  for (const x of imports) { const k = productKey(x), o = importProducts.get(k) || { ...x, imported: 0, lines: 0 }; o.imported += Math.abs(qty(x.qty)); o.lines++; importProducts.set(k, o); }
  let writeoffQty = 0;
  for (const x of writeoffs) { const q = Math.abs(qty(x.qty)); writeoffQty += q; const key = reasonLabel(x), o = reasons.get(key) || { reason: key, qty: 0, lines: 0 }; o.qty += q; o.lines++; reasons.set(key, o); }
  return {
    date, salesRows: sales, importsRows: imports, writeoffRows: writeoffs,
    gross, returns, net, salesLineCount: sales.length,
    salesProducts: [...salesProducts.values()].sort((a,b) => b.sold - a.sold || b.net - a.net).slice(0, TOP), colors: [...colors.values()],
    topColor: [...colors.values()].sort((a,b) => b.qty - a.qty)[0] || null,
    importQty: imports.reduce((a,x)=>a+Math.abs(qty(x.qty)),0), importLines: imports.length,
    importProducts: [...importProducts.values()].sort((a,b)=>b.imported-a.imported).slice(0, 5),
    writeoffQty, writeoffLines: writeoffs.length,
    reasons: [...reasons.values()].sort((a,b)=>b.qty-a.qty), stores: [...stores.values()].map(st => ({
      store: st.store, gross: st.gross, returns: st.returns, net: st.net,
      topColor: [...st.colorMap.values()].sort((a,b)=>b.qty-a.qty)[0] || null,
      colors: [...st.colorMap.values()],
      salesProducts: [...st.productMap.values()].sort((a,b)=>b.sold-a.sold || b.net-a.net).slice(0,TOP)
    })).sort((a,b)=>a.store.localeCompare(b.store)),
  };
}
function makeMessage(d, date, photoStats, syncStatus = null) {
  const syncCoversDate = !!(syncStatus && (!syncStatus.fromDate || syncStatus.fromDate <= date) && (!syncStatus.toDate || syncStatus.toDate >= date));
  const lines = [
    '📊 <b>KUNLIK HISOBOT</b>',
    `📅 ${fmtDate(date)}`,
    '',
    `🛍️ Sotildi: <b>${d.gross.toLocaleString('uz-UZ')} dona</b>`,
    `↩️ Qaytarildi: ${d.returns.toLocaleString('uz-UZ')} dona`,
    `✅ Sof savdo: <b>${d.net.toLocaleString('uz-UZ')} dona</b>`,
    `📦 Kirim: <b>${d.importQty.toLocaleString('uz-UZ')} dona</b>`,
    `🧾 Hisobdan chiqarildi: <b>${d.writeoffQty.toLocaleString('uz-UZ')} dona</b>`,
    '',
    '🏬 <b>DO‘KONLAR</b>'
  ];
  if (d.stores.length) {
    d.stores.forEach(st => lines.push(`• ${esc(cut(st.store, 50))}: ${st.gross.toLocaleString('uz-UZ')} sotildi · ${st.net.toLocaleString('uz-UZ')} sof`));
  } else {
    lines.push('Do‘konlar bo‘yicha ma’lumot topilmadi.');
  }

  if (syncStatus && syncStatus.attemptLocalDate === date && syncStatus.status === 'complete' && syncCoversDate) {
    lines.push('', `🔄 BILLZ oxirgi sinxronlash: ${fmtTashkentTime(syncStatus.attemptAt)} · muvaffaqiyatli`);
  } else if (syncStatus && syncStatus.lastSuccessfulLocalDate === date && syncStatus.lastSuccessfulAt && syncCoversDate) {
    lines.push('', `🔄 BILLZ oxirgi muvaffaqiyatli sinxronlash: ${fmtTashkentTime(syncStatus.lastSuccessfulAt)}`);
  } else {
    lines.push('', '⚠️ BILLZ sinxronlash holatini tekshiring.');
  }

  let msg = lines.join('\n');
  if (msg.length > 3900) msg = msg.slice(0, 3850) + '\n…';
  return msg;
}

async function sendDailyReport(options = {}) {
  const token = getTelegramToken();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date || '') ? options.date : todayTashkent();
  const cfg = await getTelegramSettings();
  if (cfg === null) throw new Error('Supabase reporting is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.');
  const chatId = options.chatId || cfg.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('Telegram chat is not configured. Open Stock Book > Report > Telegram daily report and save your chat.');
  if (cfg.enabled === false && !options.chatId && !options.force) throw new Error('Telegram daily reports are disabled in the saved settings. Re-enable them from Stock Book > Report.');

  // Reports are deliberately Supabase-only. If this date has not been prepared yet,
  // fetch that date's compact reports directly from BILLZ and archive the result.
  let snapshot = await getDailyReportSnapshot(date);
  if (!snapshot || options.refresh === true) {
    await syncBillzToday({ date });
    snapshot = await getDailyReportSnapshot(date);
  }
  if (!snapshot) throw new Error('The BILLZ report snapshot was not saved to Supabase. Check BILLZ and Supabase credentials, then retry.');

  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const variants = Array.isArray(snapshot.photoVariants) ? snapshot.photoVariants : [];
  const syncStatus = snapshot.syncStatus || null;
  const imageFor = variantLookup(variants), d = aggregate(rows, date);

  // 1) Overall report: summary, then Top 10 with one picture per product.
  const summaryPayload = { text: makeMessage(d, date, {}, syncStatus), parse_mode: 'HTML', disable_web_page_preview: true };
  let target = chatId;
  try { await telegram('sendMessage', token, { chat_id: target, ...summaryPayload }); }
  catch (e) {
    // Telegram changes a group's ID when it is upgraded to a supergroup. Follow it and keep the new ID saved.
    if (!e.migrateTo) throw e;
    target = e.migrateTo;
    await saveTelegramSettings(target, cfg.enabled !== false);
    await telegram('sendMessage', token, { chat_id: target, ...summaryPayload });
  }
  if (options.markNightly) await markNightlySent(date).catch(err => console.warn('Could not mark nightly report as sent:', cut(err.message, 160)));
  let salesPhotoCount = await sendTopBlock(token, target, `🏆 <b>TOP 10 — ENG KO‘P SOTILGAN MAHSULOTLAR (barcha do‘konlar)</b>`, d.salesProducts, imageFor, 'Bu kuni savdo bo‘lmagan.');

  // 2) Imports: compact album (unchanged behaviour).
  const topImports = d.importProducts.map(x => ({ ...x, photo: picUrl(x.photo) || imageFor(x), caption: `📦 <b>${esc(cut(productLabel(x),110))}</b>\nKirim: <b>${x.imported} dona</b>` }));
  const importPhotosAvailable = topImports.filter(x => picUrl(x.photo)).length;
  const importPhotoCount = await sendPhotoAlbum(token, target, topImports, 5);

  // 3) Store reports. Off by default for the nightly push (4 stores x 10 photos = ~50 messages);
  //    every store is one tap away in the /start menu. Set TELEGRAM_NIGHTLY_STORES=1 to push them too.
  if (String(process.env.TELEGRAM_NIGHTLY_STORES || '') === '1') {
    for (const st of d.stores) salesPhotoCount += await sendStoreView(token, target, d, date, st.store, imageFor);
  }
  await sendMenu(token, target, '0', 'Do‘kon bo‘yicha hisobotni ko‘rish uchun tanlang:');
  void importPhotosAvailable;
  return { date, sales: d.gross, returns: d.returns, net: d.net, imports: d.importQty, writeoffs: d.writeoffQty, salesPhotos: salesPhotoCount, importPhotos: importPhotoCount, chatId: String(target), source: 'supabase' };
}

/* ------------------------- Telegram bot menu (/start) ------------------------- */
const STORE_MENU = [
  { key: 'a', name: 'Amani' },
  { key: 'w', name: 'Warda' },
  { key: 'f', name: 'Afiya noor' },
  { key: 'w2', name: 'Warda 2' }
];
const normName = v => String(v || '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
function shiftDate(date, days) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }
function dateForPeriod(p) { return String(p) === '1' ? shiftDate(todayTashkent(), -1) : todayTashkent(); }
function periodForDate(date) { return date === todayTashkent() ? '0' : '1'; }
const PERIODS = ['0', '1', '7', 'm'];
const normPeriod = p => PERIODS.includes(String(p)) ? String(p) : '0';
function dashboardRow(chatId) {
  const site = String(process.env.URL || '').replace(/\/$/, '');
  if (Number(chatId) > 0 && site) return [{ text: '📊 Dashboardni ochish', web_app: { url: site + '/tg/' } }]; // Mini App button: private chats only
  const bot = process.env.TELEGRAM_BOT_USERNAME || 'wardareport2026_bot';
  // Once the Main Mini App is configured in BotFather (TELEGRAM_MAIN_MINIAPP=1) this link opens the dashboard right inside the group.
  if (String(process.env.TELEGRAM_MAIN_MINIAPP || '') === '1') return [{ text: '📊 Dashboardni ochish', url: `https://t.me/${bot}?startapp=dash` }];
  return [{ text: '📊 Dashboardni ochish', url: `https://t.me/${bot}?start=dash` }];
}
function menuKeyboard(period = '0', chatId) {
  return { inline_keyboard: [dashboardRow(chatId === undefined ? 0 : chatId)] }; // one button: the Mini App dashboard
}
function menuText() {
  return '📊 <b>HISOBOT</b>\n\nDashboardda kunlik, haftalik va oylik hisobotlar alohida, taqqoslash esa alohida bo‘limda. Pastdagi tugmani bosing.';
}
async function sendMenu(token, chatId, period = '0', intro) {
  return telegram('sendMessage', token, { chat_id: chatId, text: menuText(period, intro), parse_mode: 'HTML', reply_markup: menuKeyboard(period, chatId) });
}

// One text list for a quick overview, then one picture per product with its name and quantity.
async function sendTopBlock(token, chatId, title, products, imageFor, emptyText) {
  const lines = [title];
  if (!products.length) { lines.push(emptyText); await telegram('sendMessage', token, { chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }); return 0; }
  products.forEach((x, i) => { lines.push(`${i + 1}. ${esc(cut(productLabel(x), 100))} — <b>${x.sold.toLocaleString('uz-UZ')} dona</b>`); const c = colorsText(x); if (c) lines.push(`    🎨 ${c}`); });
  await telegram('sendMessage', token, { chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });
  let sent = 0;
  for (let i = 0; i < products.length; i++) {
    const x = products[i];
    const photo = picUrl(x.photo) || imageFor(x);
    const caption = `<b>#${i + 1}</b> ${esc(cut(productLabel(x), 120))}\nSotildi: <b>${x.sold.toLocaleString('uz-UZ')} dona</b>` + (colorsText(x) ? `\n🎨 Ranglar: ${colorsText(x)}` : '') + (x.returned ? `\nQaytarildi: ${x.returned.toLocaleString('uz-UZ')} dona` : '');
    const ok = photo ? await sendOnePhoto(token, chatId, { photo, caption }).catch(() => false) : false;
    if (ok) sent++;
    else await telegram('sendMessage', token, { chat_id: chatId, text: caption + '\n<i>(rasm mavjud emas)</i>', parse_mode: 'HTML' });
    await sleep(350); // stay under Telegram's per-group message rate limit
  }
  return sent;
}

async function sendStoreView(token, chatId, d, date, storeName, imageFor, meta = {}) {
  const st = d.stores.find(x => normName(x.store) === normName(storeName)) || { store: storeName, gross: 0, returns: 0, net: 0, topColor: null, salesProducts: [] };
  const imp = d.importsRows.filter(x => normName(x.to) === normName(storeName)).reduce((a, x) => a + Math.abs(qty(x.qty)), 0);
  const off = d.writeoffRows.filter(x => normName(x.from) === normName(storeName)).reduce((a, x) => a + Math.abs(qty(x.qty)), 0);
  const head = [
    `🏪 <b>${esc(cut(storeName, 70))} — ${esc(meta.title || 'KUNLIK HISOBOT')}</b>`,
    `📅 ${esc(meta.dateText || fmtDate(date))}`,
    '',
    `• Sotildi: <b>${st.gross.toLocaleString('uz-UZ')} dona</b>`,
    `• Qaytarildi: ${st.returns.toLocaleString('uz-UZ')} dona`,
    `• Sof savdo: <b>${st.net.toLocaleString('uz-UZ')} dona</b>`,
    `• Kirim: ${imp.toLocaleString('uz-UZ')} dona`,
    `• Hisobdan chiqarildi: ${off.toLocaleString('uz-UZ')} dona`,
    st.topColor ? `🎨 Eng ko‘p sotilgan rang: <b>${esc(cut(colorLabelUz(st.topColor.color), 55))}</b> — ${st.topColor.qty.toLocaleString('uz-UZ')} dona` : ''
  ].filter((x, i) => x !== '' || i === 2);
  await telegram('sendMessage', token, { chat_id: chatId, text: head.join('\n'), parse_mode: 'HTML' });
  return sendTopBlock(token, chatId, '🏆 <b>TOP 10 — ENG KO‘P SOTILGAN MAHSULOTLAR</b>', st.salesProducts, imageFor, 'Bu do‘konda ushbu kuni savdo bo‘lmagan.');
}

// Make sure a usable snapshot exists. Today's data is re-synced from BILLZ when older than 10 minutes.
async function ensureSnapshot(date, force) {
  let snap = await getDailyReportSnapshot(date);
  const doneAt = snap && snap.syncStatus && snap.syncStatus.completedAt ? Date.parse(snap.syncStatus.completedAt) : 0;
  const stale = date === todayTashkent() && (Date.now() - doneAt > 10 * 60 * 1000);
  if (!snap || force || stale) { await syncBillzToday({ date }); snap = await getDailyReportSnapshot(date); }
  if (!snap) throw new Error('BILLZ hisobot ma’lumoti saqlanmadi.');
  return snap;
}

// Called by the background function when someone taps a menu button.
async function sendReportView(options = {}) {
  const token = getTelegramToken();
  const chatId = options.chatId;
  if (!chatId) throw new Error('chatId is required.');
  const scope = String(options.scope || 'all');
  const period = normPeriod(options.period);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date || '') ? options.date : dateForPeriod(period);
  try {
    if (period === '7' || period === 'm') return await sendRangeView(token, chatId, period, scope, options.refresh === true);
    const snapshot = await ensureSnapshot(date, options.refresh === true);
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    const imageFor = variantLookup(Array.isArray(snapshot.photoVariants) ? snapshot.photoVariants : []);
    const d = aggregate(rows, date);
    let photos = 0;
    if (scope === 'all') {
      await telegram('sendMessage', token, { chat_id: chatId, text: makeMessage(d, date, {}, snapshot.syncStatus || null), parse_mode: 'HTML', disable_web_page_preview: true });
      photos = await sendTopBlock(token, chatId, '🏆 <b>TOP 10 — ENG KO‘P SOTILGAN MAHSULOTLAR (barcha do‘konlar)</b>', d.salesProducts, imageFor, 'Bu kuni savdo bo‘lmagan.');
    } else {
      const store = STORE_MENU.find(s => s.key === scope);
      if (!store) throw new Error('Noma’lum do‘kon.');
      photos = await sendStoreView(token, chatId, d, date, store.name, imageFor);
    }
    await sendMenu(token, chatId, periodForDate(date), 'Yana hisobot tanlang:');
    return { date, scope, photos };
  } catch (e) {
    console.error('Bot report failed:', e && e.stack ? e.stack : String(e));
    await telegram('sendMessage', token, { chat_id: chatId, text: `⚠️ Hisobotni tayyorlab bo‘lmadi: ${esc(cut(e && e.message, 220))}\nBiroz kutib, qayta urinib ko‘ring.`, parse_mode: 'HTML' }).catch(() => {});
    throw e;
  }
}

// Chats the bot has seen (used by "Find groups" once the webhook is active and getUpdates is unavailable).
async function recordSeenChat(chat) {
  if (!chat || chat.id == null || !getSupabaseConfig()) return;
  try {
    await supabaseRequest('stock_book_telegram_chats?on_conflict=chat_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { chat_id: String(chat.id), title: String(chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || ''), chat_type: String(chat.type || 'chat'), seen_at: new Date().toISOString() }
    });
  } catch (e) { console.warn('Could not record Telegram chat (run the updated SQL schema):', cut(e.message, 160)); }
}
async function listSeenChats() {
  if (!getSupabaseConfig()) return [];
  try {
    const rows = await supabaseRequest('stock_book_telegram_chats?select=chat_id,title,chat_type&order=seen_at.desc&limit=50');
    return (Array.isArray(rows) ? rows : []).map(r => ({ id: String(r.chat_id), label: [r.title, r.chat_type].filter(Boolean).join(' · ') || String(r.chat_id), type: r.chat_type || 'chat' }));
  } catch (_) { return []; }
}
async function isAuthorizedChat(chatId) {
  if (Number(chatId) > 0) return isAuthorizedUser(chatId); // private chat: user id == chat id
  const extra = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (extra.includes(String(chatId))) return true;
  const cfg = await getTelegramSettings().catch(() => null);
  return !!(cfg && cfg.chatId && String(cfg.chatId) === String(chatId));
}
function webhookSecret() { return require('crypto').createHash('sha256').update('stockbook-telegram:' + getTelegramToken()).digest('hex'); }

// Pull today's final BILLZ transaction snapshot on the server immediately before the scheduled Telegram report.
// Writes use deterministic document IDs and small batches; previous BILLZ-synced records for the same date
// are removed only after the replacement snapshot has been saved successfully.
let catalogMemo = null; // the catalog (11k+ products) is slow to read, so a warm server reuses it for 10 minutes
async function collectBillz(rangeFrom, rangeTo, opts = {}) {
  // Fetches sales / imports / write-offs for rangeFrom..rangeTo (inclusive, YYYY-MM-DD) directly from BILLZ.
  const secret = process.env.BILLZ_INT_KEY_2 || process.env.BILLZ_INT_KEY || process.env.BILLZ_TME_KEY || process.env.BILLZ_SECRET;
  if (!secret) throw new Error('BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY or BILLZ_SECRET is missing.');
  const API = 'https://api-admin.billz.ai';
  const PLATFORM_ID = '7d4a4c38-dd84-4902-b744-0488b80a4c01';
  const login = await fetch(API + '/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'platform-id': PLATFORM_ID },
    body: JSON.stringify({ secret_token: secret }), signal: AbortSignal.timeout(15000)
  });
  const lj = await login.json().catch(() => ({}));
  const token = lj && lj.data && lj.data.access_token;
  if (!login.ok || !token) throw new Error('BILLZ login failed (' + login.status + '): ' + cut(lj.message || lj.error || 'unauthorized', 180));

  let lastBillzRequestAt = 0;
  const apiGet = async (path, params = {}) => {
    const wait = Math.max(0, 450 - (Date.now() - lastBillzRequestAt)); if (wait) await new Promise(ok => setTimeout(ok, wait)); lastBillzRequestAt = Date.now();
    const u = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    let r;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await fetch(u, { headers: { Authorization: 'Bearer ' + token, 'platform-id': PLATFORM_ID }, signal: AbortSignal.timeout(20000) });
      if (r.status !== 429 && r.status < 500) break;
      if (attempt < 4) await new Promise(ok => setTimeout(ok, Math.min(5000, 450 * (2 ** attempt))));
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('BILLZ ' + path + ' failed (' + r.status + '): ' + cut(body.message || body.error || 'API error', 200));
    return body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) && !body.rows && !body.shops && !body.Items && !body.items && !body.transfer && !body.products_stats_by_date ? body.data : body;
  };
  const fetchRows = async (path, params, keys, limit = 100) => {
    const all = []; const signatures = new Set();
    const MAX_PAGES = 400; // 400 x 100 = 40,000 rows (the catalog alone is already above 10,000 products)
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (page === MAX_PAGES) console.warn('BILLZ paging reached the safety limit for', path, '- results may be incomplete.');
      const body = await apiGet(path, { ...params, page, limit });
      let rows = Array.isArray(body) ? body : [];
      if (!rows.length && Array.isArray(body.data)) rows = body.data;
      if (!rows.length && body.data && typeof body.data === 'object') {
        for (const key of keys) { if (Array.isArray(body.data[key])) { rows = body.data[key]; break; } }
      }
      if (!rows.length) for (const key of keys) { if (Array.isArray(body[key])) { rows = body[key]; break; } }
      if (!rows.length) break;
      const sig = JSON.stringify(rows.map(x => [x.id || x.product_id || x.external_id || x.external_import_id || x.product_barcode || x.barcode || '', x.date || x.created_at || '', x.product_sku || x.sku || '']));
      if (signatures.has(sig)) break;
      signatures.add(sig); all.push(...rows);
      const total = Number(body.count || body.total_count || body.total || (body.pagination && body.pagination.total) || (body.meta && body.meta.total) || 0);
      if (total && all.length >= total) break;
      if (rows.length < limit && !total) break;
    }
    return all;
  };

  const shopsBody = await apiGet('/v1/shop', { page: 1, limit: 100, only_allowed: 'true' });
  const shops = Array.isArray(shopsBody.shops) ? shopsBody.shops : [];
  if (!shops.length) throw new Error('BILLZ returned no accessible shops.');
  const canonical = ['Warda', 'Amani', 'Afiya noor', 'Warda 2'];
  const normalize = v => String(v || '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
  const storeFor = id => { const s = shops.find(x => String(x.id) === String(id)); if (!s) return ''; const known = canonical.find(n => normalize(n) === normalize(s.name)); return known || String(s.name || 'Unknown store'); };
  const shopIds = shops.map(s => s.id).filter(Boolean);
  const shopNameById = new Map(shops.map(s => [String(s.id), storeFor(s.id)]));
  if (opts.diag) return billzSalesDiag({ from: rangeFrom, to: rangeTo, fetchRows, shopNameById, shopIds });
  const dateOnly = value => {
    if (!value) return '';
    const str = String(value);
    // plain dates / midnight-UTC day labels keep their own date; real timestamps are converted to the Tashkent day
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?(Z|\+00:00)?)?$/.test(str) || (/^\d{4}-\d{2}-\d{2}/.test(str) && !/(Z|[+-]\d{2}:?\d{2})$/.test(str))) return str.slice(0, 10);
    const d = new Date(value); if (!Number.isFinite(d.getTime())) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const resolve = r => {
    const a = r.product || r.product_info || r;
    const bc = String(r.product_barcode || r.barcode || (a && a.barcode) || '').trim();
    const sku = String(r.product_sku || r.sku || r.article || (a && a.sku) || '').trim();
    const id = String(r.product_id || (a && a.id) || '').trim();
    const attrs = [...(Array.isArray(a.product_attributes) ? a.product_attributes : []), ...(Array.isArray(a.attributes) ? a.attributes : [])];
    let color = '', size = '';
    for (const x of attrs) {
      const n = String(x.attribute_name || x.name || x.attribute || '').toLowerCase();
      const val = String(x.attribute_value || x.value_name || x.value || x.name || '').trim();
      if (!val) continue;
      if (!color && /color|colour|цвет|rang/.test(n)) color = val;
      if (!size && /size|размер|razmer|o.?lcham/.test(n)) size = val;
    }
    let match = (bc && catalogByBarcode.get(bc)) || (id && catalogById.get(id)) || null;
    if (!match && sku) {
      const candidates = (catalogBySku.get(sku) || []).filter(v => (!color || !v.color || color.toLowerCase() === v.color.toLowerCase()) && (!size || !v.size || size.toLowerCase() === v.size.toLowerCase()));
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1) match = candidates.find(v => v.photo) || candidates[0];
    }
    const photo = [a.image_url, a.photo_url, a.image, a.photo, r.image_url, r.photo_url, r.image, r.photo].find(x => typeof x === 'string' && /^https?:\/\//i.test(x)) || (match && match.photo) || '';
    return { name: a.name || r.product_base_name || r.product_name || (match && match.name) || '', sku, art: sku, bc, brand: a.brand_name || r.product_brand_name || r.brand_name || r.brand || '', cat: a.category_name || r.category_name || '', color: color || (match && match.color) || '', size: size || (match && match.size) || '', productId: id || (match && match.id) || '', photo };
  };
  const generated = new Map();
  const add = (key, rec) => { if (!key || !rec.date || rec.date < rangeFrom || rec.date > rangeTo || !rec.type) return; const prev = generated.get(key); if (prev) prev.qty += rec.qty; else generated.set(key, rec); };
  const shopsArg = shopIds.join(',');
  const daily = {}; // daily[store][date] = { s: sold, r: returned, i: imported, w: written off }
  const bump = (st, dt, k, v) => { const o = ((daily[st] ||= {})[dt] ||= { s: 0, r: 0, i: 0, w: 0 }); o[k] += v; };
  const [imports, writeoffs, sales, catalog] = await Promise.all([
    fetchRows('/v1/import-report-table', { start_date: rangeFrom, end_date: rangeTo, shop_ids: shopsArg, import_type: 'import' }, ['rows']),
    fetchRows('/v1/write-off-report-table', { start_date: rangeFrom, end_date: rangeTo, shop_ids: shopsArg, currency: 'UZS' }, ['Items','items']),
    fetchRows('/v1/product-general-table', { start_date: rangeFrom, end_date: rangeTo, shop_ids: shopsArg, detalization: 'day', detalization_by_position: 'true', price_type: 0, currency: 'UZS' }, ['products_stats_by_date']),
    (catalogMemo && Date.now() - catalogMemo.at < 10 * 60 * 1000 ? Promise.resolve(catalogMemo.rows) : fetchRows('/v2/products', { include_empty_stocks: 'true' }, ['products','items','Items','rows'], 100).then(rows => { catalogMemo = { at: Date.now(), rows }; return rows; }))
  ]);

  // The BILLZ daily sales report often omits product images. Resolve each sale
  // against the full BILLZ catalog, where product photos and variant attributes live.
  const catalogByBarcode = new Map(), catalogById = new Map(), catalogBySku = new Map();
  const catalogAttr = r => {
    const attrs = [...(Array.isArray(r.product_attributes) ? r.product_attributes : []), ...(Array.isArray(r.attributes) ? r.attributes : []), ...(Array.isArray(r.variant_attributes) ? r.variant_attributes : [])];
    let color = '', size = '';
    for (const a of attrs) {
      const n = String(a.attribute_name || a.name || a.attribute || '').toLowerCase();
      const v = String(a.attribute_value || a.value_name || a.value || '').trim();
      if (!v) continue;
      if (!color && /color|colour|цвет|rang/.test(n)) color = v;
      if (!size && /size|размер|razmer|o.?lcham/.test(n)) size = v;
    }
    return { color, size };
  };
  const catalogPhoto = r => {
    const photos = Array.isArray(r.photos) ? r.photos : Array.isArray(r.images) ? r.images : Array.isArray(r.product_images) ? r.product_images : [];
    const main = photos.find(x => x && (x.is_main || x.is_primary || x.main)) || photos.find(Boolean) || {};
    let photo = r.main_image_url_full || r.main_image_url || r.main_image || r.image_url || r.photo_url || r.picture_url || r.product_image_url || r.photo_url_full || r.image || r.photo ||
      (typeof main === 'string' ? main : (main.photo_url || main.image_url || main.file_url || main.url || main.photo || ''));
    if (photo && typeof photo === 'object') photo = photo.url || photo.src || photo.file_url || photo.photo_url || photo.image_url || '';
    return typeof photo === 'string' && /^https?:\/\//i.test(photo.trim()) ? photo.trim() : '';
  };
  const addCatalog = (r, inherited = {}) => {
    if (!r || typeof r !== 'object') return;
    const merged = { ...inherited, ...r };
    const baseName = merged.product_base_name || merged.base_name || merged.base_product_name || merged.name || merged.product_name || '';
    const photo = catalogPhoto(merged) || inherited.photo || '';
    const attrs = catalogAttr(merged);
    const entry = {
      bc: String(merged.barcode || merged.product_barcode || merged.ean || merged.gtin || '').trim(),
      sku: String(merged.sku || merged.product_sku || merged.article || merged.product_article || '').trim(),
      id: String(merged.id || merged.product_id || merged.variant_id || merged.product_variant_id || '').trim(),
      name: baseName, color: attrs.color, size: attrs.size, photo
    };
    if (entry.bc) catalogByBarcode.set(entry.bc, entry);
    if (entry.id) catalogById.set(entry.id, entry);
    if (entry.sku) {
      const arr = catalogBySku.get(entry.sku) || [];
      arr.push(entry); catalogBySku.set(entry.sku, arr);
    }
    const children = Array.isArray(merged.variations) ? merged.variations :
      Array.isArray(merged.product_variants) ? merged.product_variants :
      Array.isArray(merged.variants) ? merged.variants :
      Array.isArray(merged.product_variations) ? merged.product_variations : [];
    for (const child of children) addCatalog({
      ...merged, ...child,
      product_base_name: child.product_base_name || baseName,
      product_attributes: child.product_attributes || child.attributes || child.variant_attributes || merged.product_attributes || merged.attributes || [],
      photos: child.photos || child.images || child.product_images || merged.photos || merged.images || merged.product_images || [],
      main_image_url_full: child.main_image_url_full || merged.main_image_url_full,
      main_image_url: child.main_image_url || merged.main_image_url
    }, { photo, product_base_name: baseName });
  };
  catalog.forEach(r => addCatalog(r));
  for (const r of imports) {
    const store = shopNameById.get(String(r.shop_id)) || ''; const q = Math.round(Number(r.imported_qty) || 0), d = dateOnly(r.date);
    if (!store || q <= 0 || d < rangeFrom || d > rangeTo) continue;
    bump(store, d, 'i', q);
    const p = resolve(r), ext = String(r.external_import_id || r.import_id || r.id || 'unknown');
    const key = `in|${ext}|${store}|${p.bc || p.sku || p.name}`;
    add(key, { ...p, type:'in', to:store, from:'', qty:q, date:d, note:'Billz import #' + ext, tname:'Import ' + fmtDate(d), bz: ext + '|' + (p.bc || p.sku || p.name), source:'billz-report', autoSync:true });
  }
  for (const r of writeoffs) {
    const from = shopNameById.get(String(r.shop_id)) || '', d = dateOnly(r.created_at), q = Math.round(Number(r.written_off_measurement_value) || 0);
    if (!from || d < rangeFrom || d > rangeTo || q <= 0) continue;
    bump(from, d, 'w', q);
    const p = resolve(r), ext = String(r.write_off_external_id || r.write_off_id || r.id || 'unknown');
    const key = `rem|${ext}|${from}|${p.bc || p.sku || p.name}`;
    add(key, { ...p, type:'rem', from, to:'', qty:q, date:d, note:[r.write_off_reason, r.description].filter(Boolean).join(' · '), r:'other', tname:r.write_off_name || 'Write-off ' + fmtDate(d), bz:'wo' + ext + '|' + (p.bc || p.sku || p.name), source:'billz-report', autoSync:true });
  }
  const saleAgg = new Map();
  for (const r of sales) {
    const d = dateOnly(r.date), shopId = String(r.shop_id || ''), store = shopNameById.get(shopId) || String(r.shop_name || '');
    if (d < rangeFrom || d > rangeTo || !store) continue;
    bump(store, d, 's', Math.max(0, Number(r.sold_measurement_value) || 0)); bump(store, d, 'r', Math.max(0, Number(r.returned_measurement_value) || 0));
    const p = resolve(r), seller = String(r.seller_full_name || '').trim();
    const key = [store, seller, p.bc || p.sku || p.name, p.color, p.size].join('|');
    const o = saleAgg.get(key) || { ...p, date:d, from:store, to:'', seller, sold:0, returned:0, lines:0 };
    o.sold += Math.max(0, Number(r.sold_measurement_value) || 0); o.returned += Math.max(0, Number(r.returned_measurement_value) || 0); o.lines++; saleAgg.set(key,o);
  }
  for (const [key, x] of saleAgg) {
    const ident = key.split('|').join('¦');
    if (x.sold > 0) add('out|' + ident + '|sale', { ...x, type:'out', qty:Math.round(x.sold), note:'BILLZ report', tname:'Sale ' + fmtDate(rangeTo) + ' · ' + x.from, bz:'nightly-sale|' + ident + '|sale', source:'billz-report', autoSync:true });
    if (x.returned > 0) add('out|' + ident + '|return', { ...x, type:'out', qty:-Math.round(x.returned), ret:true, note:'BILLZ report return', tname:'Return ' + fmtDate(rangeTo) + ' · ' + x.from, bz:'nightly-sale|' + ident + '|return', source:'billz-report', autoSync:true });
  }
  let verify = null; // independent check: BILLZ's own period total (no day split) vs. the day-by-day rows we use
  if (opts.verify) {
    try {
      const tot = await fetchRows('/v1/product-general-table', { start_date: rangeFrom, end_date: rangeTo, shop_ids: shopsArg, price_type: 0, currency: 'UZS' }, ['products_stats_by_date', 'products', 'items', 'rows'], 100);
      let bs = 0, br = 0, ss = 0, sr = 0;
      for (const r of tot) { bs += Math.max(0, Number(r.sold_measurement_value) || 0); br += Math.max(0, Number(r.returned_measurement_value) || 0); }
      for (const days of Object.values(daily)) for (const v of Object.values(days)) { ss += v.s; sr += v.r; }
      verify = { ok: Math.abs(bs - ss) < 0.5 && Math.abs(br - sr) < 0.5, bs: Math.round(bs), br: Math.round(br), ss: Math.round(ss), sr: Math.round(sr) };
    } catch (e) { console.warn('BILLZ total check failed:', cut(e.message, 160)); }
  }
  const rows = [...generated.values()];
  return { rows, daily, verify, counts: { imports: imports.length, writeoffs: writeoffs.length, salesRows: sales.length, savedRows: rows.length } };
}

// Nightly / daily snapshot: one day from BILLZ, archived in Supabase.
async function syncBillzToday(options = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date || '') ? options.date : todayTashkent();
  if (!getSupabaseConfig()) throw new Error('Supabase reporting is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.');
  const { rows, counts } = await collectBillz(date, date);
  const completedAt = new Date().toISOString();
  const completedStatus = { status:'complete', attemptLocalDate:date, attemptAt:completedAt, completedAt, fromDate:date, toDate:date, source:'billz-direct-to-supabase', lastSuccessfulAt:completedAt, lastSuccessfulLocalDate:date, lastSuccessfulBy:'Telegram report sync', counts };
  await saveDailyReportSnapshot(date, rows, completedStatus, []);
  return { status:'complete', date, imports:counts.imports, writeoffs:counts.writeoffs, salesRows:counts.salesRows, savedRows:counts.savedRows, storage:'supabase-only' };
}

/* ------------------- 7-day and last-month reports ------------------- */
const MONTHS_UZ = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
function rangeForPeriod(period) {
  const today = todayTashkent(), p = String(period);
  if (p === '7') return { from: shiftDate(today, -6), to: today, label: 'OXIRGI 7 KUN', short: 'Oxirgi 7 kun' };
  if (p === 'm') {
    const first = today.slice(0, 8) + '01', to = shiftDate(first, -1), from = to.slice(0, 8) + '01';
    const name = MONTHS_UZ[Number(to.slice(5, 7)) - 1] + ' ' + to.slice(0, 4);
    return { from, to, label: 'O‘TGAN OY — ' + name.toUpperCase(), short: 'O‘tgan oy (' + name + ')', monthKey: to.slice(0, 7) };
  }
  const d = p === '1' ? shiftDate(today, -1) : today;
  return { from: d, to: d, label: 'KUNLIK HISOBOT', short: p === '1' ? 'Kecha' : 'Bugun' };
}
const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

// Small cache so several taps (overall + 4 stores) fetch BILLZ only once. Needs stock_book_range_cache; skipped if missing.
async function cacheGet(key) {
  try { const r = await supabaseRequest('stock_book_range_cache?key=eq.' + encodeURIComponent(key) + '&select=payload,updated_at'); return Array.isArray(r) && r[0] ? r[0] : null; } catch (_) { return null; }
}
async function cacheSet(key, payload) {
  try { await supabaseRequest('stock_book_range_cache?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { key, payload, updated_at: new Date().toISOString() }, timeoutMs: 25000 }); return true; } catch (e) { console.warn('Range cache not saved:', cut(e.message, 160)); return false; }
}
async function getRangeRows(range, force) {
  const key = (range.monthKey ? 'month:' + range.monthKey : 'range:' + range.from + ':' + range.to);
  const hit = force ? null : await cacheGet(key);
  // A finished month never changes, so it is reused; the rolling 7 days is reused for 10 minutes.
  const fresh = hit && (range.monthKey || (Date.now() - Date.parse(hit.updated_at) < 10 * 60 * 1000));
  if (fresh && Array.isArray(hit.payload.rows)) return hit.payload.rows;
  const { rows } = await collectBillz(range.from, range.to);
  const slim = rows.map(x => ({ type: x.type, qty: x.qty, name: x.name, art: x.art, sku: x.sku, bc: x.bc, color: x.color, size: x.size, from: x.from, to: x.to, note: x.note, r: x.r, photo: picUrl(x.photo) && /^https?:/i.test(x.photo) ? x.photo : '' }));
  await cacheSet(key, { rows: slim, from: range.from, to: range.to });
  return slim;
}
function makeRangeMessage(d, range) {
  const days = dayCount(range.from, range.to);
  const lines = [
    `📊 <b>UMUMIY HISOBOT — ${esc(range.label)}</b>`,
    `📅 ${fmtDate(range.from)} – ${fmtDate(range.to)} (${days} kun)`,
    '',
    `🛍️ Sotildi: <b>${d.gross.toLocaleString('uz-UZ')} dona</b>`,
    `↩️ Qaytarildi: ${d.returns.toLocaleString('uz-UZ')} dona`,
    `✅ Sof savdo: <b>${d.net.toLocaleString('uz-UZ')} dona</b>`,
    `📈 Kunlik o‘rtacha: ${(d.net / days).toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} dona`,
    `📦 Kirim: <b>${d.importQty.toLocaleString('uz-UZ')} dona</b>`,
    `🧾 Hisobdan chiqarildi: <b>${d.writeoffQty.toLocaleString('uz-UZ')} dona</b>`,
    '',
    '🏬 <b>DO‘KONLAR</b>'
  ];
  if (d.stores.length) d.stores.forEach(st => lines.push(`• ${esc(cut(st.store, 50))}: ${st.gross.toLocaleString('uz-UZ')} sotildi · ${st.net.toLocaleString('uz-UZ')} sof`));
  else lines.push('Do‘konlar bo‘yicha ma’lumot topilmadi.');
  if (d.topColor) lines.push('', `🎨 Eng ko‘p sotilgan rang: <b>${esc(cut(colorLabelUz(d.topColor.color), 55))}</b> — ${d.topColor.qty.toLocaleString('uz-UZ')} dona`);
  return lines.join('\n').slice(0, 3900);
}
async function sendRangeView(token, chatId, period, scope, force) {
  const range = rangeForPeriod(period);
  const rows = await getRangeRows(range, force);
  const d = aggregate(rows, range.to), imageFor = variantLookup([]);
  let photos = 0;
  if (scope === 'all') {
    await telegram('sendMessage', token, { chat_id: chatId, text: makeRangeMessage(d, range), parse_mode: 'HTML', disable_web_page_preview: true });
    photos = await sendTopBlock(token, chatId, `🏆 <b>TOP 10 — ENG KO‘P SOTILGAN MAHSULOTLAR</b>\n${esc(range.short)}, barcha do‘konlar`, d.salesProducts, imageFor, 'Bu davrda savdo bo‘lmagan.');
  } else {
    const store = STORE_MENU.find(x => x.key === scope);
    if (!store) throw new Error('Noma’lum do‘kon.');
    photos = await sendStoreView(token, chatId, d, range.to, store.name, imageFor, { title: range.label, dateText: `${fmtDate(range.from)} – ${fmtDate(range.to)} (${dayCount(range.from, range.to)} kun)` });
  }
  await sendMenu(token, chatId, String(period), 'Yana hisobot tanlang:');
  return { period, scope, from: range.from, to: range.to, photos };
}


/* ------------------- Mini App dashboard: monthly summaries ------------------- */
function shiftMonth(key, delta) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7); }
function monthLabel(key) { return MONTHS_UZ[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4); }
function currentMonthKey() { return todayTashkent().slice(0, 7); }
const isWeekKey = k => /^w:\d{4}-\d{2}-\d{2}$/.test(String(k));
const isDayKey = k => /^d:\d{4}-\d{2}-\d{2}$/.test(String(k));
function validMonth(k) {
  k = String(k); const today = todayTashkent();
  if (isDayKey(k)) { const d = k.slice(2); return !Number.isNaN(Date.parse(d)) && d <= today && d >= shiftDate(today, -400); }
  if (isWeekKey(k)) { const to = k.slice(2); return !Number.isNaN(Date.parse(to)) && to <= today && to >= shiftDate(today, -400); }
  const cur = currentMonthKey(); return /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && k <= cur && k >= shiftMonth(cur, -24);
}
const ddmm = d => d.slice(8, 10) + '.' + d.slice(5, 7);
function dashLabels(key) {
  if (isDayKey(key)) {
    const d = key.slice(2), today = todayTashkent(), full = `${ddmm(d)}.${d.slice(0, 4)}`;
    if (d === today) return { kind: 'day', label: `Bugun (${full})`, short: 'Bugun', loc: 'Bugun', dat: 'bugungi kunga' };
    if (d === shiftDate(today, -1)) return { kind: 'day', label: `Kecha (${full})`, short: 'Kecha', loc: 'Kecha', dat: 'kechaga' };
    return { kind: 'day', label: full, short: ddmm(d), loc: full + ' kuni', dat: full + ' kuniga' };
  }
  if (isWeekKey(key)) {
    const to = key.slice(2), from = shiftDate(to, -6), today = todayTashkent(), rng = `${ddmm(from)}–${ddmm(to)}`, ago = Math.round((Date.parse(today) - Date.parse(to)) / 86400000);
    if (ago === 0) return { kind: 'week', label: `Oxirgi 7 kun (${rng})`, short: 'Oxirgi 7 kun', loc: 'Oxirgi 7 kunda', dat: 'oxirgi 7 kunga' };
    if (ago === 7) return { kind: 'week', label: `Oldingi 7 kun (${rng})`, short: 'Oldingi 7 kun', loc: 'Oldingi 7 kunda', dat: 'oldingi 7 kunga' };
    return { kind: 'week', label: rng, short: rng, loc: rng + ' haftasida', dat: rng + ' haftasiga' };
  }
  const name = MONTHS_UZ[Number(key.slice(5, 7)) - 1];
  return { kind: 'month', label: monthLabel(key), short: name, loc: name + 'da', dat: name.toLowerCase() + 'ga' };
}
function dashDayOptions() { const today = todayTashkent(); return Array.from({ length: 31 }, (_, i) => { const key = 'd:' + shiftDate(today, -i); return { key, label: dashLabels(key).label }; }); }
function dashOptions() { const cur = currentMonthKey(); return Array.from({ length: 13 }, (_, i) => { const k = shiftMonth(cur, -i); return { key: k, label: monthLabel(k) + (i === 0 ? ' (hozirgacha)' : '') }; }); }
function dashWeekOptions() { const today = todayTashkent(); return Array.from({ length: 12 }, (_, i) => { const key = 'w:' + shiftDate(today, -7 * i); return { key, label: dashLabels(key).short }; }); }
function dashDefaults() { const cur = currentMonthKey(), today = todayTashkent(); return { da: 'd:' + today, db: 'd:' + shiftDate(today, -1), a: shiftMonth(cur, -1), b: shiftMonth(cur, -2), wa: 'w:' + today, wb: 'w:' + shiftDate(today, -7) }; }
function monthRange(key) {
  if (isDayKey(key)) { const d = key.slice(2); return { key, from: d, to: d, partial: d === todayTashkent(), fullDays: 1, days: 1 }; }
  if (isWeekKey(key)) { const to = key.slice(2); return { key, from: shiftDate(to, -6), to, partial: to === todayTashkent(), fullDays: 7, days: 7 }; }
  const [y, m] = key.split('-').map(Number), fullDays = new Date(Date.UTC(y, m, 0)).getUTCDate(), today = todayTashkent();
  const partial = key === today.slice(0, 7), from = key + '-01', to = partial ? today : key + '-' + String(fullDays).padStart(2, '0');
  return { key, from, to, partial, fullDays, days: dayCount(from, to) };
}
function summarizeMonth(r, rows, daily, verify) {
  const d = aggregate(rows, r.to, { top: 40 });
  const desc = (a, b) => b.qty - a.qty;
  const colorsOut = list => [...(list || [])].sort(desc).slice(0, 8).map(c => [colorLabelUz(c.color), c.qty]);
  const prod = (x, photo) => ({ n: cut(productLabel(x), 70), s: x.sold, rt: x.returned, p: photo ? (picUrl(x.photo) || '') : '', c: [...(x.colorMap ? x.colorMap.values() : [])].sort(desc).slice(0, 6).map(c => [c.color ? colorLabelUz(c.color) : '', c.qty]) });
  const series = name => {
    const s = Array(r.fullDays).fill(0), i = Array(r.fullDays).fill(0);
    for (const [store, days] of Object.entries(daily || {})) {
      if (name && normName(store) !== normName(name)) continue;
      for (const [date, v] of Object.entries(days)) { const ix = dayCount(r.from, date) - 1; if (ix >= 0 && ix < r.fullDays) { s[ix] += v.s || 0; i[ix] += v.i || 0; } }
    }
    return { s, i };
  };
  const stores = STORE_MENU.map(m => {
    const st = d.stores.find(x => normName(x.store) === normName(m.name));
    const imp = d.importsRows.filter(x => normName(x.to) === normName(m.name)).reduce((a, x) => a + Math.abs(qty(x.qty)), 0);
    const off = d.writeoffRows.filter(x => normName(x.from) === normName(m.name)).reduce((a, x) => a + Math.abs(qty(x.qty)), 0);
    return { key: m.key, name: m.name, sold: st ? st.gross : 0, ret: st ? st.returns : 0, net: st ? st.net : 0, imp, off, colors: st ? colorsOut(st.colors) : [], top: st ? st.salesProducts.map((x, i) => prod(x, i < 10)) : [], daily: series(m.name) };
  });
  return {
    meta: { ...dashLabels(r.key), month: r.key, from: r.from, to: r.to, days: r.days, fullDays: r.fullDays, partial: r.partial, built: new Date().toISOString(), verify: verify || null },
    all: { sold: d.gross, ret: d.returns, net: d.net, imp: d.importQty, off: d.writeoffQty, colors: colorsOut(d.colors), top: d.salesProducts.map((x, i) => prod(x, i < 10)), daily: series('') },
    stores
  };
}
async function dashBuild(monthKey) {
  const r = monthRange(monthKey);
  try {
    const { rows, daily, verify } = await collectBillz(r.from, r.to, { verify: true });
    const payload = summarizeMonth(r, rows, daily, verify);
    await cacheSet('dash:' + monthKey, payload);
    return payload;
  } finally { await cacheSet('dashbuild:' + monthKey, { at: 0 }); }
}
async function dashGet(monthKey) {
  const hit = await cacheGet('dash:' + monthKey);
  if (!hit || !hit.payload || !hit.payload.meta) return { payload: null, fresh: false };
  const p = hit.payload, now = monthRange(monthKey).partial;
  const fresh = now ? (Date.now() - Date.parse(p.meta.built) < 30 * 60 * 1000) : !p.meta.partial;
  return { payload: p, fresh };
}
// Returns months that need (re)building and have no build already running; marks them as running.
async function dashClaimBuilds(months, force) {
  const todo = [];
  for (const m of months) {
    const { fresh } = await dashGet(m);
    if (fresh && !force) continue;
    const mk = await cacheGet('dashbuild:' + m);
    if (mk && mk.payload && Date.now() - Number(mk.payload.at || 0) < 8 * 60 * 1000) continue;
    await cacheSet('dashbuild:' + m, { at: Date.now() });
    todo.push(m);
  }
  return todo;
}

/* ------------------- Mini App access (Telegram initData) ------------------- */
function verifyInitData(initData, maxAgeSec = 86400) {
  const crypto = require('crypto');
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData), hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(getTelegramToken()).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date') || 0);
  if (!(age >= 0 && age < maxAgeSec)) return null;
  try { const u = JSON.parse(params.get('user') || 'null'); return u && u.id ? u : null; } catch (_) { return null; }
}
const memberCache = new Map();
async function isAuthorizedUser(userId) {
  const id = String(userId);
  if (String(process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(x => x.trim()).includes(id)) return true;
  const hit = memberCache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.ok;
  let ok = false;
  try {
    const cfg = await getTelegramSettings();
    if (cfg && cfg.chatId) {
      const m = await telegram('getChatMember', getTelegramToken(), { chat_id: cfg.chatId, user_id: Number(id) });
      ok = ['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.is_member === true);
    }
  } catch (e) { console.warn('getChatMember failed (make the bot an admin of the group):', cut(e.message, 140)); }
  memberCache.set(id, { ok, at: Date.now() });
  return ok;
}


/* ------------------- weekly / monthly comparison message for the group ------------------- */
async function ensureDash(key) { const { payload, fresh } = await dashGet(key); return (payload && fresh) ? payload : dashBuild(key); }
async function sendCompareView(chatId, kind) {
  const token = getTelegramToken(), today = todayTashkent(), cur = currentMonthKey();
  const A = kind === 'w' ? 'w:' + today : shiftMonth(cur, -1), B = kind === 'w' ? 'w:' + shiftDate(today, -7) : shiftMonth(cur, -2);
  try {
    await telegram('sendChatAction', token, { chat_id: chatId, action: 'typing' }).catch(() => {});
    const a = await ensureDash(A), b = await ensureDash(B), la = dashLabels(A), lb = dashLabels(B);
    const n = v => Math.round(v).toLocaleString('uz-UZ');
    const dl = (x, y, inv) => { if (!y) return x ? 'yangi' : '—'; const p = Math.round((x - y) / y * 100); return p === 0 ? '0%' : (p > 0 ? '▲ +' : '▼ −') + Math.abs(p) + '%'; };
    const L = (icon, name, k) => `${icon} ${name}: <b>${n(a.all[k])}</b> (${dl(a.all[k], b.all[k])}) · ${esc(lb.short)}: ${n(b.all[k])}`;
    const lines = [`📈 <b>${kind === 'w' ? 'HAFTALIK' : 'OYLIK'} TAQQOSLASH</b>`, `${esc(la.label)}  <b>vs</b>  ${esc(lb.label)}`, '',
      L('🛍️', 'Sotildi', 'sold'), L('📦', 'Kirim', 'imp'), L('✅', 'Sof savdo', 'net'), L('↩️', 'Qaytarildi', 'ret'), L('🧾', 'Hisobdan chiqarildi', 'off'), '', '🏬 <b>DO‘KONLAR</b>'];
    for (const st of a.stores) { const o = b.stores.find(x => x.key === st.key) || { sold: 0, imp: 0 }; lines.push(`• <b>${esc(st.name)}</b>: sotuv ${n(st.sold)} (${dl(st.sold, o.sold)}) · kirim ${n(st.imp)} (${dl(st.imp, o.imp)})`); }
    lines.push('', '📲 Batafsil: Dashboard → Oylik / Haftalik');
    await telegram('sendMessage', token, { chat_id: chatId, text: lines.join('\n').slice(0, 3900), parse_mode: 'HTML' });
    await sendMenu(token, chatId, '0', 'Yana hisobot tanlang:');
  } catch (e) {
    console.error('Compare view failed:', e && e.stack ? e.stack : String(e));
    await telegram('sendMessage', token, { chat_id: chatId, text: `⚠️ Taqqoslashni tayyorlab bo‘lmadi: ${esc(cut(e && e.message, 200))}`, parse_mode: 'HTML' }).catch(() => {});
    throw e;
  }
}


/* ---------- /tekshir: compare what BILLZ returns for one date under different report settings ---------- */
async function billzSalesDiag({ from, to, fetchRows, shopNameById, shopIds }) {
  const base = { start_date: from, end_date: to, shop_ids: shopIds, price_type: 0, currency: 'UZS' };
  const variants = [
    ['A', 'hozirgi usul (kun + pozitsiya)', { ...base, detalization: 'day', detalization_by_position: 'true' }],
    ['B', 'kun, pozitsiyasiz', { ...base, detalization: 'day' }],
    ['C', 'butun davr jami (kunsiz)', { ...base }]
  ];
  const out = [];
  for (const [id, label, params] of variants) {
    try {
      const rows = await fetchRows('/v1/product-general-table', params, ['products_stats_by_date', 'products', 'items', 'rows'], 100);
      let sold = 0, ret = 0; const dates = {}, shops = {}, prods = {};
      for (const r of rows) {
        const s = Math.max(0, Number(r.sold_measurement_value) || 0), rt = Math.max(0, Number(r.returned_measurement_value) || 0);
        sold += s; ret += rt;
        const d = String(r.date || '').slice(0, 10) || '(sanasiz)'; dates[d] = (dates[d] || 0) + 1;
        const sh = shopNameById.get(String(r.shop_id)) || String(r.shop_name || r.shop_id || '?'); shops[sh] = (shops[sh] || 0) + s;
        const pn = String(r.product_base_name || r.product_name || '?'); prods[pn] = (prods[pn] || 0) + s;
      }
      out.push({ id, label, rows: rows.length, sold, ret, dates, shops, top: Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 5), keys: rows[0] ? Object.keys(rows[0]).slice(0, 45) : [] });
    } catch (e) { out.push({ id, label, error: cut(e.message, 160) }); }
  }
  return out;
}
async function sendSalesCheck(chatId, date) {
  const token = getTelegramToken(), n = v => Math.round(v).toLocaleString('uz-UZ');
  try {
    await telegram('sendMessage', token, { chat_id: chatId, text: `🔎 ${fmtDate(date)} savdosi BILLZ dan tekshirilmoqda… (30–60 soniya)` });
    const out = await collectBillz(date, date, { diag: true });
    const lines = [`🔎 <b>BILLZ TEKSHIRUVI — ${fmtDate(date)}</b>`, ''];
    for (const v of out) {
      if (v.error) { lines.push(`<b>${v.id})</b> ${esc(v.label)}: xato — ${esc(v.error)}`); continue; }
      const dts = Object.entries(v.dates).sort().slice(0, 6).map(([d, c]) => `${d.slice(8, 10)}.${d.slice(5, 7)}: ${c}`).join(', ');
      lines.push(`<b>${v.id})</b> ${esc(v.label)}`, `   qatorlar: ${v.rows} · sotildi: <b>${n(v.sold)}</b> · qaytarildi: ${n(v.ret)}`, `   sanalar (qator soni): ${esc(dts || '—')}`);
    }
    const A = out.find(x => x.id === 'A' && !x.error);
    if (A) lines.push('', 'Do‘konlar (A): ' + Object.entries(A.shops).map(([s, q]) => `${esc(s)} ${n(q)}`).join(' · '), 'Top 5 (A): ' + A.top.map(([nm, q]) => `${esc(cut(nm, 22))} ${n(q)}`).join(' · '), 'Maydonlar (A): ' + esc(cut(A.keys.join(', '), 330)));
    lines.push('', 'BILLZ oynasidagi “Tovarlar” soni bilan solishtiring.');
    await telegram('sendMessage', token, { chat_id: chatId, text: lines.join('\n').slice(0, 3900), parse_mode: 'HTML' });
  } catch (e) {
    console.error('Sales check failed:', e && e.stack ? e.stack : String(e));
    await telegram('sendMessage', token, { chat_id: chatId, text: `⚠️ Tekshiruv bajarilmadi: ${esc(cut(e && e.message, 220))}`, parse_mode: 'HTML' }).catch(() => {});
    throw e;
  }
}

async function wasMonthlySent(monthKey) { const r = await cacheGet('monthly-sent:' + monthKey); return !!r; }
async function markMonthlySent(monthKey) { await cacheSet('monthly-sent:' + monthKey, { sentAt: new Date().toISOString() }); }

module.exports = { sendSalesCheck, sendCompareView, dashLabels, dashWeekOptions, cacheGet, cacheSet, shiftMonth, monthLabel, validMonth, dashOptions, dashDayOptions, dashDefaults, dashBuild, dashGet, dashClaimBuilds, summarizeMonth, monthRange, verifyInitData, isAuthorizedUser, rangeForPeriod, wasMonthlySent, markMonthlySent, getTelegramToken, todayTashkent, telegram, sendDailyReport, syncBillzToday, saveTelegramSettings, getTelegramSettings,
  wasNightlySent, markNightlySent, sendMenu, menuText, menuKeyboard, dateForPeriod, sendReportView, recordSeenChat, listSeenChats, isAuthorizedChat, webhookSecret, STORE_MENU };
