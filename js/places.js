/* 我的地點（Batch 9）：收藏、最近目的地、家／公司。僅儲存在此裝置的 localStorage，可隨時清除。 */
(function () {
  const A = window.AIGPS, S = A.State, KEY = 'aigps.places', MAX_HIST = 20;
  let d = { fav: [], hist: [], home: null, work: null }; const subs = new Set();
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x) d = Object.assign(d, x); } catch (_) {}
  const snap = p => ({ id: p.id, name: p.name, cat: p.cat, x: p.x, y: p.y, demo: true });
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.name === b.name;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {} subs.forEach(f => { try { f(d); } catch (_) {} }); };

  const api = {
    get: () => d, on: f => (subs.add(f), () => subs.delete(f)),
    isFav: p => d.fav.some(f => same(f, p)),
    toggleFav(p) { const i = d.fav.findIndex(f => same(f, p)); i >= 0 ? d.fav.splice(i, 1) : d.fav.unshift(snap(p)); save(); return i < 0; },
    removeFav(p) { d.fav = d.fav.filter(f => !same(f, p)); save(); },
    setHome(p) { d.home = snap(p); save(); }, setWork(p) { d.work = snap(p); save(); },
    clearHome() { d.home = null; save(); }, clearWork() { d.work = null; save(); },
    record(p) { d.hist = [snap(p)].concat(d.hist.filter(h => !same(h, p))).slice(0, MAX_HIST); save(); },
    clearHistory() { d.hist = []; save(); },
    clearAll() { d = { fav: [], hist: [], home: null, work: null }; save(); },
    /* 設定目的地時同步清除舊路線，避免導航到上一個目的地的路線 */
    setDestination(p) { S.set({ destination: snap(p), route: null, alternativeRoutes: [] }); A.Log.info('設定目的地：' + p.name); },
    addWaypoint(p) {
      const w = (S.get().waypoints || []).slice(); if (w.length >= 3) return { ok: false, message: '最多 3 個途經點' };
      w.push({ id: p.id, name: p.name, x: p.x, y: p.y }); S.set({ waypoints: w, route: null }); return { ok: true };
    },
    _snap: snap
  };
  A.Places = api;
  S.subscribe((s, ch) => { if (ch.includes('destination') && s.destination) api.record(s.destination); });
})();
