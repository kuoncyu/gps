/* 駕駛警示（Batch 8）：測速照相、學校區、施工區、急彎。資料來自離線資料包（目前為 Demo 資料，UI 一律標示 DEMO）。
   導航中依「路線前方」判斷；未導航時依「車頭前方」判斷。提醒分三級：warn → near（150 m）→ now（30 m）。 */
(function () {
  const A = window.AIGPS, S = A.State, DB = A.Storage;
  const TYPES = { speedCamera: { label: '測速照相', badge: '測', warn: 500, color: '#c92a2a' }, schoolZone: { label: '學校區', badge: '校', warn: 300, color: '#a14d00' },
    constructionZone: { label: '施工區', badge: '工', warn: 300, color: '#b0300a' }, sharpCurve: { label: '急彎', badge: '彎', warn: 250, color: '#5f3dc4' },
    railCrossing: { label: '鐵路平交道', badge: '鐵', warn: 300, color: '#495057' }, speedLimitDrop: { label: '速限降低', badge: '速', warn: 300, color: '#0b7285' } };
  const KEY = 'aigps.alertPrefs', angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180), RANK = { warn: 1, near: 2, now: 3 };
  const stageOf = (d, warn) => d < -20 ? null : d <= 30 ? 'now' : d <= 150 ? 'near' : d <= warn ? 'warn' : null;

  /* 找出落在路線上、行進方向一致的警示，依路線位置排序 */
  function onRoute(R, items, locate) {
    const out = [];
    for (const it of items) {
      const l = locate(R, it.x, it.y, null); if (!l || l.dist > 25) continue;
      if (it.heading != null) { const a = R.pts[l.i], b = R.pts[l.i + 1], hd = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360; if (angDiff(hd, it.heading) > 60) continue; }
      out.push({ item: it, along: l.along });
    }
    return out.sort((a, b) => a.along - b.along);
  }
  /* 未導航：車頭前方 25° 錐形範圍、方向一致、距離內 */
  function aheadFree(items, x, y, hd, maxD) {
    const out = [];
    for (const it of items) {
      const dx = it.x - x, dy = it.y - y, d = Math.hypot(dx, dy); if (d > maxD || d < 1) continue;
      if (angDiff((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, hd) > 25) continue;
      if (it.heading != null && angDiff(it.heading, hd) > 60) continue; out.push({ item: it, dist: d });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  const prefs = { types: { speedCamera: true, schoolZone: true, constructionZone: true, sharpCurve: true, railCrossing: true, speedLimitDrop: true }, sound: true, volume: 0.5, tol: 5, restSec: 7200 };
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p) { Object.assign(prefs.types, p.types); ['sound', 'volume', 'tol', 'restSec'].forEach(k => { if (p[k] != null) prefs[k] = p[k]; }); } } catch (_) {}
  let items = [], routeEntries = [], lastR = null, lastStage = {}, lastSig = '', ac = null, seq = 0;

  function beep(n) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      for (let i = 0; i < n; i++) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = Math.max(0, Math.min(1, prefs.volume)) * 0.3; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * 0.2; o.start(t); o.stop(t + 0.12); }
    } catch (_) {}
  }
  function compute() {
    const s = S.get(), l = s.currentLocation; if (!l || (s.route && s.route.walk)) return [];
    const nav = A.Nav && A.Nav.active && A.Nav.getRoute(), found = [];
    if (nav) {
      if (lastR !== nav) { lastR = nav; routeEntries = onRoute(nav, items, A.Nav._locate); lastStage = {}; }
      routeEntries.forEach(e => found.push({ item: e.item, dist: e.along - (A.Nav.along || 0) }));
    } else { lastR = null; aheadFree(items, l.x, l.y, s.heading || 0, 500).forEach(e => found.push(e)); }
    const out = [];
    for (const f of found) {
      const T = TYPES[f.item.type]; if (!T || !prefs.types[f.item.type]) continue; const stage = stageOf(f.dist, T.warn); if (!stage) continue;
      const over = !!(f.item.kmh && s.speed > f.item.kmh + prefs.tol && stage !== 'warn');
      out.push({ id: f.item.id, type: f.item.type, kmh: f.item.kmh || null, dist: Math.max(0, Math.round(f.dist)), stage, overspeed: over, demo: true });
    }
    return out.slice(0, 2);
  }
  function tick() {
    restCheck();
    const list = compute(), sig = list.map(a => a.id + a.stage + Math.round(a.dist / 10) + a.overspeed).join('|'); if (sig === lastSig) return; lastSig = sig;
    list.forEach(a => { const prev = lastStage[a.id] || 0; if (RANK[a.stage] > prev) { lastStage[a.id] = RANK[a.stage]; if (prefs.sound && !(A.Voice && A.Voice.canSpeak() && A.Voice.prefs.alerts)) beep(RANK[a.stage]); } });
    S.set({ driverAlerts: list });
  }
  /* 資料信任：來源或更新時間缺漏 → unknown；超過 2 年 → expired（兩者都停止顯示）；超過 1 年 → low（標示資料較舊） */
  const DAY = 86400000;
  const trustOf = (meta, now) => { if (!meta || !meta.source || !meta.updatedAt || isNaN(Date.parse(meta.updatedAt))) return 'unknown'; const age = now - Date.parse(meta.updatedAt); return age > 730 * DAY ? 'expired' : age > 365 * DAY ? 'low' : 'ok'; };
  let meta = null, restBase = 0;
  const restDue = (dur, base, interval) => interval > 0 && dur - base >= interval;
  function restCheck() {   // 休息提醒：依連續行駛時間
    const s = S.get(), d = (s.tripData && s.tripData.duration) || 0; if (d < restBase) restBase = 0;
    if (!(A.Gps && A.Gps.pose && A.Gps.pose.running) || !restDue(d, restBase, prefs.restSec)) return; restBase = d;
    const h = d >= 3600 ? (d / 3600).toFixed(1) + ' 小時' : Math.max(1, Math.round(d / 60)) + ' 分鐘';
    S.set({ notice: { id: Date.now() + Math.random(), type: 'rest', text: `您已連續駕駛約 ${h}，建議找安全地點休息。可在「前方服務」查看休息站。` } });
  }
  async function load() {
    const my = ++seq, info = S.get().offlinePackage;
    if (!info || !['ready', 'limited', 'updating'].includes(S.get().offlinePackageStatus)) { items = []; meta = null; lastR = null; return; }
    try {
      const rec = await DB.get('packages', info.id + '@' + info.version), f = rec.manifest.components.alerts, d = rec.files[f] && JSON.parse(new TextDecoder().decode(rec.files[f])); if (my !== seq) return;
      meta = d ? { version: d.version || null, updatedAt: d.updatedAt || null, source: d.source || null } : null; if (meta) meta.trust = trustOf(meta, Date.now());
      const show = meta && (meta.trust === 'ok' || meta.trust === 'low');
      items = show ? ((d && d.items) || []).filter(x => TYPES[x.type]) : []; lastR = null;
      if (!show) A.Log.warn('駕駛警示資料來源不明或已過期，停止顯示', meta ? meta.trust : 'no-meta'); else A.Log.info('離線駕駛警示已載入', items.length + ' 筆（Demo）・信任 ' + meta.trust);
    } catch (e) { A.Log.error('載入駕駛警示失敗', String(e)); }
  }
  const api = { name: 'Offline Alerts（Demo 資料）', isDemo: true, TYPES, prefs, save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} }, beep, load,
    get items() { return items; }, getAlerts: () => Promise.resolve({ ok: true, demo: true, items: items.slice() }), _onRoute: onRoute, _ahead: aheadFree, _stage: stageOf, _setItems(x) { items = x; } };
  api.getMeta = () => meta; api._trust = trustOf; api._restDue = restDue; A.Alerts = api; A.Providers.register('alerts', api);
  S.subscribe((s, ch) => { if (ch.includes('currentLocation')) tick(); if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) load(); });
  document.addEventListener('DOMContentLoaded', load);
})();
