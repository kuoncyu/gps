/* 交通事件與重新規劃（Batch 7）。事件來源只有「離線（資料包／內建 Demo）」與「模擬（測試注入）」，
   目前沒有即時交通來源，因此任何畫面都不得出現「即時」字樣。 */
(function () {
  const A = window.AIGPS, S = A.State, ek = (a, b) => a[0] + ',' + a[1] + '>' + b[0] + ',' + b[1];
  const TYPES = { congestion: { label: '壅塞', factor: 4 }, closure: { label: '道路封閉', closed: true }, accident: { label: '事故', factor: 3 }, construction: { label: '道路施工', factor: 1.8 } };
  const SAVE_MIN_S = 120, SAVE_MIN_RATIO = 0.9;
  let sim = [], dismissed = new Set(), busy = false, n = 0;
  const prefs = () => { try { return JSON.parse(localStorage.getItem('aigps.routePrefs')) || {}; } catch (_) { return {}; } };
  const offline = () => ((A.DemoData && A.DemoData.offlineEvents) || []).map(e => Object.assign({ source: 'offline' }, e, { factor: TYPES[e.type].factor || 1, closed: !!TYPES[e.type].closed }));
  const all = () => offline().concat(sim);
  function edgeMap() {
    const m = {};
    all().forEach(ev => [ek(ev.a, ev.b), ek(ev.b, ev.a)].forEach(k => { const c = m[k]; m[k] = { factor: Math.max(c ? c.factor : 1, ev.closed ? 1 : ev.factor), closed: (c && c.closed) || !!ev.closed, id: ev.id }; }));
    return m;
  }
  const sync = () => S.set({ trafficEvents: all().map(e => ({ id: e.id, type: e.type, label: e.label || TYPES[e.type].label, a: e.a, b: e.b, source: e.source, closed: e.closed, factor: e.factor })) });
  /* 決策：封閉 → 自動改道；節省 ≥ 2 分鐘且 ≥ 10% → 詢問使用者；否則不動作 */
  const decide = (cur, best, closed) => closed ? 'auto' : (cur - best >= SAVE_MIN_S && best < cur * SAVE_MIN_RATIO) ? 'offer' : null;
  const alert = (text, type) => S.set({ notice: { id: Date.now() + Math.random(), type: type || 'info', text } });

  async function plan(keep, tm) { return A.Providers.get('routing').reroute(Object.assign({}, prefs(), { waypoints: keep, traffic: tm })); }
  async function check() {
    if (busy || !A.Nav || !A.Nav.active || !A.Routing || !A.Routing.ready()) return;
    const s0 = S.get(); if (s0.navigationStatus !== 'navigating' || !s0.currentLocation || (s0.route && s0.route.walk)) return;
    const tm = edgeMap(); if (!Object.keys(tm).length) { if (s0.trafficOffer) S.set({ trafficOffer: null }); return; }
    busy = true;
    try {
      const cur = A.Routing.evalPoints(A.Nav.remainingPoints(), tm); if (!cur) return;
      const keep = A.Nav.keepWaypoints(), r = await plan(keep, tm); if (!A.Nav.active) return;
      const names = all().filter(e => cur.events.includes(e.id)).map(e => e.label || TYPES[e.type].label).join('、');
      if (!r.ok) { if (cur.closed) alert('前方道路封閉，且找不到可行的替代路線', 'warn'); return; }
      const alt = r.candidates[0], act = decide(cur.duration, alt.duration, cur.closed);
      if (act === 'auto') { A.Nav.applyRoute(alt, '前方' + (names || '道路封閉') + '，已自動重新規劃路線', keep); S.set({ trafficOffer: null }); }
      else if (act === 'offer') {
        const sig = cur.events.slice().sort().join() + ':' + Math.round(alt.duration / 30), o = S.get().trafficOffer;
        if (!dismissed.has(sig) && (!o || o.sig !== sig)) S.set({ trafficOffer: { sig, curDuration: cur.duration, altDuration: alt.duration, save: cur.duration - alt.duration, reason: names || '交通事件' } });
      } else if (S.get().trafficOffer) S.set({ trafficOffer: null });
    } catch (e) { A.Log.error('交通檢查失敗', String(e)); } finally { busy = false; }
  }
  async function accept() {   // 採用時重新計算，避免使用過期路線造成車輛位置跳動
    const o = S.get().trafficOffer; if (!o || !A.Nav.active) return;
    const keep = A.Nav.keepWaypoints(), r = await plan(keep, edgeMap());
    if (!r.ok) return alert('無法採用新路線：' + r.message, 'warn');
    A.Nav.applyRoute(r.candidates[0], '已採用較快路線，約節省 ' + Math.round(o.save / 60) + ' 分鐘', keep); S.set({ trafficOffer: null });
  }
  function dismiss() { const o = S.get().trafficOffer; if (o) { dismissed.add(o.sig); S.set({ trafficOffer: null }); A.Log.info('維持原路線'); } }
  function add(type, a, b) { sim.push({ id: 'sim' + (++n), type, a, b, source: 'simulated', label: TYPES[type].label + '（模擬）', factor: TYPES[type].factor || 1, closed: !!TYPES[type].closed }); dismissed.clear(); A.Log.info('加入模擬交通事件', type); sync(); setTimeout(check, 0); }
  function injectAhead(type, dist) {
    const seg = A.Nav && A.Nav.active ? A.Nav.edgeAhead(dist || 400) : null;
    if (!seg) return { ok: false, message: '導航中才能在前方路段加入模擬事件' }; add(type, seg[0], seg[1]); return { ok: true };
  }
  function clearSim() { sim = []; dismissed.clear(); S.set({ trafficOffer: null }); sync(); }

  const api = { name: 'Offline/Simulated Traffic', isDemo: true, live: false, TYPES, edgeMap, add, injectAhead, clearSim, accept, dismiss, check, _decide: decide, _all: all,
    getEvents() { return Promise.resolve({ ok: true, demo: true, live: false, events: all() }); } };
  A.Traffic = api; A.Providers.register('traffic', api);
  S.subscribe((s, ch) => { if (ch.includes('trafficEvents') || ch.includes('navigationStatus')) check(); });
  setInterval(check, 10000);
  document.addEventListener('DOMContentLoaded', sync);
})();
