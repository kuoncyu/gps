/* 停車與抵達後步行（Batch 10 補齊）：目的地附近停車建議、步行距離（依格線街道估算）、抵達停車場後切換步行導航。
   停車費率與即時空位：資料包未提供，畫面明確標示。 */
(function () {
  const A = window.AIGPS, S = A.State, KEY = 'aigps.walkTo', WALK = 1.2, NEAR = 1500, MAXWALK = 500;
  const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);      // 格線街道：步行距離 ≈ 曼哈頓距離
  const dismissed = new Set(); let lastKey = null;
  function suggest(dest, pois, n, max) {
    return pois.filter(p => p.cat === '停車' && !(p.x === dest.x && p.y === dest.y)).map(p => Object.assign({}, p, { walk: manh(p, dest) })).filter(p => p.walk <= (max || MAXWALK))
      .sort((a, b) => a.walk - b.walk).slice(0, n || 3).map(p => Object.assign(p, { walkSec: Math.round(p.walk / WALK) }));
  }
  const walkInfo = (a, b) => { const d = manh(a, b); return { dist: d, sec: Math.round(d / WALK) }; };
  const walkTarget = () => { try { const w = JSON.parse(localStorage.getItem(KEY)), d = S.get().destination; return w && d && d.x === w.park.x && d.y === w.park.y ? w : null; } catch (_) { return null; } };
  const clearWalkTarget = () => { try { localStorage.removeItem(KEY); } catch (_) {} };
  const click = () => { const b = typeof document !== 'undefined' && document.getElementById ? document.getElementById('btnNav') : null; b ? b.click() : A.Nav.start(); };

  async function choose(p) {
    const orig = S.get().destination; if (!orig) return;
    try { localStorage.setItem(KEY, JSON.stringify({ orig: { id: orig.id, name: orig.name, cat: orig.cat, x: orig.x, y: orig.y }, park: { x: p.x, y: p.y, name: p.name } })); } catch (_) {}
    S.set({ parkingOffer: null }); A.Nav.stop(); S.set({ waypoints: [] }); A.Places.setDestination(p);
    const r = await A.Assistant._planAndApply('已改往停車場'); if (r.ok) click(); return r;
  }
  function dismiss() { const d = S.get().destination; if (d) dismissed.add(d.x + ',' + d.y); S.set({ parkingOffer: null }); }
  async function startWalking() {
    const w = walkTarget(); if (!w) return { ok: false, message: '沒有可步行前往的目的地' };
    A.Nav.finish(); clearWalkTarget(); A.Places.setDestination(w.orig);
    const r = await A.Providers.get('routing').calculate({ walk: true, waypoints: [] }); if (!r.ok) return { ok: false, message: r.message };
    const c = r.candidates[0]; S.set({ route: { label: '步行', points: c.points, distance: c.distance, duration: c.duration, eta: c.eta, walk: true, demo: true }, alternativeRoutes: [], remainingDistance: c.distance, remainingTime: c.duration, ETA: c.eta, navigationStatus: 'planning' });
    click(); return { ok: true, route: c };
  }
  function monitor(s) {
    const d = s.destination, o = s.parkingOffer;
    if (o && (s.navigationStatus !== 'navigating' || !d || d.x !== o.dest.x || d.y !== o.dest.y)) return S.set({ parkingOffer: null });
    if (o || s.navigationStatus !== 'navigating' || !d || !A.Nav.active || (s.route && s.route.walk) || d.cat === '停車' || walkTarget()) return;
    const key = d.x + ',' + d.y; if (dismissed.has(key) || s.remainingDistance == null || s.remainingDistance > NEAR || !A.Search.pois) return;
    const list = suggest(d, A.Search.pois, 3, MAXWALK); if (!list.length) { dismissed.add(key); return; }
    S.set({ parkingOffer: { dest: { name: d.name, x: d.x, y: d.y }, list } });
  }
  A.Parking = { suggest, walkInfo, walkTarget, clearWalkTarget, choose, dismiss, startWalking, WALK, _manh: manh };
  S.subscribe((s, ch) => { if (ch.includes('remainingDistance') || ch.includes('navigationStatus')) monitor(s); });
})();
