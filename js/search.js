/* 離線搜尋（Batch 3）：資料來自已驗證的資料包（IndexedDB），完全不需網路。
   支援 模糊（子字串／依序比對）、多關鍵字、類別同義詞、附近搜尋、距離排序。 */
(function () {
  const A = window.AIGPS, S = A.State, DB = A.Storage;
  const SYN = { 餐廳: ['餐廳', '餐', '吃', '美食', 'restaurant'], 咖啡: ['咖啡', 'cafe', 'coffee'], 加油: ['加油', '油站', 'gas'], 充電: ['充電', 'ev', 'charge'],
    停車: ['停車', 'parking'], 醫院: ['醫院', '診所', 'hospital'], 超商: ['超商', '便利商店', '商店'], 景點: ['景點', '觀光'],
    飯店: ['飯店', '旅館', '住宿', 'hotel'], 警察: ['警察局', '派出所', '警局', '警察'], 學校: ['學校', '國小', '國中'], ATM: ['atm', '提款機'], 車站: ['車站', '火車站', '捷運'], 機場: ['機場'], 休息站: ['休息站', '服務區'], 賣場: ['賣場', '大賣場', '超市'] };
  const dec = b => JSON.parse(new TextDecoder().decode(b));
  let pois = null, keys = null, byId = null, citiesData = [], loadSeq = 0, loading = false; const cbs = [];
  function prep(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum }; }
  function proj(r, x, y) {   // 點到路線的最短距離與沿路線位置
    let best = { dist: Infinity, along: 0 };
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)); if (d < best.dist) best = { dist: d, along: r.cum[i] + t * Math.sqrt(l2) };
    }
    return best;
  }

  function score(k, q) {
    const i = k.indexOf(q); if (i >= 0) return 100 - Math.min(i, 50);
    let j = 0; for (const ch of k) { if (ch === q[j] && ++j === q.length) return 40; } return 0;
  }
  function catOf(token) { return Object.keys(SYN).find(c => SYN[c].some(w => w === token || (token.length > 1 && w.includes(token)))); }
  function base() { const l = S.get().currentLocation; return l ? { x: l.x, y: l.y, fromGps: true } : { x: 0, y: 0, fromGps: false }; }
  const dist = (p, b) => Math.round(Math.hypot(p.x - b.x, p.y - b.y));
  const shape = (p, b, s) => ({ id: p.id, name: p.name, cat: p.cat, x: p.x, y: p.y, addr: p.addr, parking: p.parking, dist: dist(p, b), score: s });
  const notReady = () => ({ ok: false, demo: true, reason: 'NO_PACKAGE', message: S.get().offlinePackage ? '離線資料包不完整（缺少搜尋所需的資料），請到「下載中心」重新下載或更新資料包。' : '尚未安裝離線資料包，請先到「下載中心」下載。' });

  async function load() {
    const seq = ++loadSeq, info = S.get().offlinePackage;
    if (!info || !['ready', 'limited', 'updating'].includes(S.get().offlinePackageStatus)) { pois = keys = byId = null; citiesData = []; A.Search.mapMeta = null; return; }
    loading = true;
    try {
      const rec = await DB.get('packages', info.id + '@' + info.version), c = rec.manifest.components;
      const [p, i, m, cy] = [c.poi, c.search, c.map, c.cities].map(f => f && rec.files[f] && dec(rec.files[f])); citiesData = cy ? cy.items : [];
      if (seq !== loadSeq) return;
      pois = p ? p.items : null; keys = i ? i.items : null; A.Search.mapMeta = m;
      byId = new Map((pois || []).map(x => [x.id, x]));
      A.Log.info('離線搜尋資料已載入', (pois ? pois.length : 0) + ' 筆 POI'); cbs.splice(0).forEach(f => { try { f(); } catch (_) {} });
    } catch (e) { A.Log.error('載入搜尋資料失敗', String(e)); } finally { if (seq === loadSeq) loading = false; }
  }
  function query(text, opt) {
    opt = opt || {}; if (!pois || !keys) return Promise.resolve(notReady());
    const b = base(), tokens = String(text || '').toLowerCase().trim().split(/\s+/).filter(Boolean), cats = new Set(opt.cat ? [opt.cat] : []);
    const words = [];
    tokens.forEach(t => { const c = catOf(t); (c && !/^\d+$/.test(t)) ? cats.add(c) : words.push(t); });
    const qn = tokens.join(' '), out = [], rp = opt.routePts && opt.routePts.length > 1 ? prep(opt.routePts) : null;
    for (const it of keys) {
      const p = byId.get(it.id); if (!p) continue;
      if (cats.size && !cats.has(p.cat)) continue;
      let s = 0, okAll = true;
      for (const w of words) { const v = score(it.k, w); if (!v) { okAll = false; break; } s += v; }
      if (!okAll) continue;
      if (qn && p.addr && p.addr.toLowerCase().includes(qn)) s += 200;   // 整句與地址完全相符：排到最前面
      if (opt.radius && dist(p, b) > opt.radius) continue;
      let extra = {}; if (rp) { const pr = proj(rp, p.x, p.y); if (pr.dist > (opt.routeMax || 200)) continue; extra = { routeDist: Math.round(pr.dist), along: Math.round(pr.along) }; }
      out.push(Object.assign(shape(p, b, s + (cats.size ? 10 : 0)), extra));
    }
    rp ? out.sort((a, c) => a.along - c.along) : out.sort((a, c) => c.score - a.score || a.dist - c.dist);
    return Promise.resolve({ ok: true, demo: true, total: out.length, fromGps: b.fromGps, results: out.slice(0, opt.limit || 30) });
  }
  function nearby(cat, radius, limit) {
    if (!pois) return Promise.resolve(notReady());
    const b = base(), out = pois.filter(p => (!cat || p.cat === cat) && dist(p, b) <= (radius || 1000)).map(p => shape(p, b, 0)).sort((a, c) => a.dist - c.dist);
    return Promise.resolve({ ok: true, demo: true, total: out.length, fromGps: b.fromGps, results: out.slice(0, limit || 30) });
  }
  const api = { name: 'Offline Search（資料包）', isDemo: true, query, nearby, load, whenLoaded: f => (pois ? f() : cbs.push(f)), get: id => (byId ? byId.get(id) : null), categories: Object.keys(SYN), mapMeta: null,
    get pois() { return pois; }, get cities() { return citiesData; }, get loading() { return loading; }, _setCities(c) { citiesData = c; }, _setData(p) { pois = p; keys = p.map(x => ({ id: x.id, k: (x.name + ' ' + (x.addr || '')).toLowerCase() })); byId = new Map(p.map(x => [x.id, x])); } };
  A.Search = api; A.Providers.register('search', api);
  S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) load(); });
  document.addEventListener('DOMContentLoaded', load);
})();
