/* 前方服務（Up Ahead）與前方城市（Cities Ahead）：列出路線前方的服務與城市，依距離排序，可加入途經點。資料來自離線資料包（Demo）。 */
(function () {
  const A = window.AIGPS, S = A.State;
  const SVC = ['加油', '餐廳', '停車', '充電', '休息站', '咖啡', '超商'];
  /* 純函式：找出落在路線上（偏離 ≤ maxOff）且在目前位置之前方（≤ maxAhead）的項目 */
  function compute(R, locate, alongNow, items, o) {
    o = o || {}; const maxOff = o.maxOff || 300, maxAhead = o.maxAhead || 30000, out = [];
    for (const it of items) { const l = locate(R, it.x, it.y, null); if (!l || l.dist > maxOff) continue; const d = l.along - alongNow; if (d < 0 || d > maxAhead) continue; out.push({ item: it, ahead: Math.round(d), off: Math.round(l.dist) }); }
    return out.sort((a, b) => a.ahead - b.ahead);
  }
  function ctx() {
    const rt = S.get().route; if (!rt || !rt.points || rt.points.length < 2) return null;
    const active = A.Nav && A.Nav.active && A.Nav.getRoute(); return { R: active || A.Nav._prepare(rt.points), along: active ? (A.Nav.along || 0) : 0, rt, live: !!active };
  }
  const shape = (e, c) => Object.assign({}, e.item, { ahead: e.ahead, off: e.off, etaSec: c.R.total ? Math.round(c.rt.duration * (e.ahead / c.R.total)) : 0 });
  function services(cat, limit) {
    const c = ctx(); if (!c) return { ok: false, reason: 'NO_ROUTE', message: '請先選用路線' }; if (!A.Search.pois) return { ok: false, reason: 'NO_PACKAGE', message: '尚未安裝離線資料包' };
    const items = A.Search.pois.filter(p => cat ? p.cat === cat : SVC.includes(p.cat)), list = compute(c.R, A.Nav._locate, c.along, items, { maxOff: 300 }).map(e => shape(e, c));
    return { ok: true, demo: true, navigating: c.live, total: list.length, results: list.slice(0, limit || 12) };
  }
  function cities(limit) {
    const c = ctx(); if (!c) return { ok: false, reason: 'NO_ROUTE', message: '請先選用路線' }; if (!A.Search.pois) return { ok: false, reason: 'NO_PACKAGE', message: '尚未安裝離線資料包' };
    const list = compute(c.R, A.Nav._locate, c.along, A.Search.cities || [], { maxOff: 2000 }).map(e => shape(e, c));
    return { ok: true, demo: true, navigating: c.live, total: list.length, results: list.slice(0, limit || 12) };
  }
  async function addWaypoint(p) {
    const w = A.Places.addWaypoint(p); if (!w.ok) return { ok: false, reply: w.message };
    return A.Assistant._planAndApply('已加入途經點並重新規劃路線');
  }
  A.UpAhead = { SVC, services, cities, addWaypoint, _compute: compute };
})();
