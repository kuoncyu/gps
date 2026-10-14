/* 離線路由引擎（Batch 4）：Dijkstra，路網來自資料包。純函式核心可在 node 單元測試。
   偏好：fastest／shortest；避開：高速、收費、未鋪裝（軟性避開，必要時仍會通行並警告）、自訂路段（硬性封鎖）。 */
(function () {
  const A = window.AIGPS, S = A.State, DB = A.Storage;
  const ek = (a, b) => a[0] + ',' + a[1] + '>' + b[0] + ',' + b[1];
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let m = i; const L = 2 * i + 1, R = L + 1; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; }
  }
  function build(data) {
    const idx = new Map(), nodes = data.nodes, adj = nodes.map(() => []);
    nodes.forEach((n, i) => idx.set(n[0] + ',' + n[1], i));
    for (const e of data.edges) {
      const a = idx.get(e.a.join()), b = idx.get(e.b.join()); if (a == null || b == null) continue;
      adj[a].push(Object.assign({ to: b, key: ek(e.a, e.b) }, e)); adj[b].push(Object.assign({ to: a, key: ek(e.b, e.a) }, e));
    }
    const edgeMap = new Map(); adj.forEach(l => l.forEach(e => edgeMap.set(e.key, e)));
    return { nodes, adj, edgeMap, hasAttrs: Array.isArray(data.attrs) };
  }
  const nearest = (g, p) => { let bi = 0, bd = Infinity; g.nodes.forEach((n, i) => { const d = Math.hypot(n[0] - p.x, n[1] - p.y); if (d < bd) { bd = d; bi = i; } }); return bi; };
  function dijkstra(g, s, t, cost) {
    const dist = new Array(g.nodes.length).fill(Infinity), prev = new Array(g.nodes.length).fill(null), h = new Heap(); dist[s] = 0; h.push(0, s);
    while (h.size) {
      const [d, u] = h.pop(); if (d > dist[u]) continue; if (u === t) break;
      for (const e of g.adj[u]) { const c = cost(e); if (c === Infinity) continue; const nd = d + c; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e }; h.push(nd, e.to); } }
    }
    if (dist[t] === Infinity) return null;
    const edges = []; for (let v = t; prev[v]; v = prev[v].from) edges.unshift(prev[v].e);
    return { start: s, edges, cost: dist[t] };
  }
  /* pts：[{x,y}, 途經點…, {x,y}] */
  function plan(g, pts, opt) {
    opt = opt || {}; const base = [];
    if (!g.hasAttrs && (opt.avoidHighway || opt.avoidToll || opt.avoidUnpaved)) base.push('此資料包不含道路屬性，避開條件無法套用');
    if (opt.avoidFerry) base.push('資料包無渡輪資料，「避開渡輪」未套用');
    const blocked = new Set((opt.avoidEdges || []).flatMap(([a, b]) => [ek(a, b), ek(b, a)]));
    const mk = (mode, pen) => e => {
      if (blocked.has(e.key)) return Infinity;
      if (opt.walk && e.cls === 'highway') return Infinity;   // 行人不可走高速
      const tr = opt.traffic && opt.traffic[e.key]; if (tr && tr.closed) return Infinity;
      let f = tr && mode !== 'shortest' ? tr.factor : 1; if (opt.avoidHighway && e.cls === 'highway') f *= 10; if (opt.avoidToll && e.toll) f *= 10; if (opt.avoidUnpaved && e.unpaved) f *= 10; if (pen && pen.has(e.key)) f *= 3;
      return (mode === 'shortest' || opt.walk ? e.len : e.len / (e.kmh / 3.6)) * f;
    };
    /* 目的地吸附到最近的道路：回傳該道路兩端點與目的地在道路上的投影點 q（道路被封閉／封鎖時只用最近節點） */
    function targetNodes(p) {
      const n = nearest(g, p), none = [{ n, q: null, kmh: 0 }]; let best = null;
      g.adj.forEach((list, i) => list.forEach(e => { if (e.to < i) return; const a = e.a, b = e.b, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2)), d = Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy)); if (!best || d < best.d) best = { d, i, j: e.to, e, t }; }));
      if (!best || best.d > 150) return none; const e = best.e, tr = opt.traffic && opt.traffic[e.key];
      if (blocked.has(e.key) || (tr && tr.closed) || (opt.walk && e.cls === 'highway')) return none;
      const q = [e.a[0] + best.t * (e.b[0] - e.a[0]), e.a[1] + best.t * (e.b[1] - e.a[1])]; return [{ n: best.i, q, kmh: e.kmh }, { n: best.j, q, kmh: e.kmh }];
    }
    function route(mode, pen) {
      const out = { points: [[pts[0].x, pts[0].y]], distance: 0, duration: 0, delay: 0, keys: [], use: { highway: 0, toll: 0, unpaved: 0 } };
      const add = (x, y) => { const l = out.points[out.points.length - 1]; if (l[0] !== x || l[1] !== y) out.points.push([x, y]); };
      const walkSpd = 1.2, stubSpd = opt.walk ? walkSpd : 20 / 3.6;   // 路網外的接駁段以 20 km/h（步行 1.2 m/s）估算
      for (let i = 0; i < pts.length - 1; i++) {
        const s = nearest(g, pts[i]); let pick = null;
        for (const c of targetNodes(pts[i + 1])) {   // 在候選終點中選「路網成本＋沿路到投影點＋接駁段」最低者
          const rr = dijkstra(g, s, c.n, mk(mode, pen)); if (!rr) continue; const nx = g.nodes[c.n], last = c.q || nx;
          const along = c.q ? Math.hypot(c.q[0] - nx[0], c.q[1] - nx[1]) : 0, stubD = Math.hypot(last[0] - pts[i + 1].x, last[1] - pts[i + 1].y), spd = opt.walk ? walkSpd : (c.kmh || 20) / 3.6;
          const total = rr.cost + (mode === 'shortest' ? along + stubD : along / spd + stubD / stubSpd);
          if (!pick || total < pick.total) pick = { c, r: rr, along, stubD, spd, total };
        }
        if (!pick) return null; const r = pick.r, sd = Math.hypot(g.nodes[s][0] - pts[i].x, g.nodes[s][1] - pts[i].y);
        out.distance += sd + pick.along + pick.stubD; out.duration += sd / stubSpd + pick.along / pick.spd + pick.stubD / stubSpd;
        add(g.nodes[s][0], g.nodes[s][1]);
        for (const e of r.edges) { out.distance += e.len; { const base = opt.walk ? e.len / 1.2 : e.len / (e.kmh / 3.6), tr = opt.traffic && opt.traffic[e.key], tf = tr && !tr.closed ? tr.factor : 1; out.duration += base * tf; out.delay += base * (tf - 1); } out.keys.push(e.key); { const q = e.key.split('>')[1].split(',').map(Number); add(q[0], q[1]); } if (e.cls === 'highway') out.use.highway++; if (e.toll) out.use.toll++; if (e.unpaved) out.use.unpaved++; }
        if (pick.c.q) add(Math.round(pick.c.q[0] * 10) / 10, Math.round(pick.c.q[1] * 10) / 10);   // 沿路走到目的地在道路上的投影點，再接駁
        add(pts[i + 1].x, pts[i + 1].y);
      }
      out.distance = Math.round(out.distance); out.duration = Math.round(out.duration); out.delay = Math.round(out.delay); return out;
    }
    const fast = route('fastest'); if (!fast) return { ok: false, demo: true, reason: 'NO_ROUTE', message: '找不到可行路線（可能被自訂封鎖路段阻擋）' };
    const cands = [Object.assign({ label: '最快' }, fast)], same = (a, b) => a.distance === b.distance && a.duration === b.duration;
    const short = route('shortest'); if (short && !cands.some(c => same(c, short))) cands.push(Object.assign({ label: '最短' }, short));
    const alt = route('fastest', new Set(fast.keys.flatMap(k => { const [a, b] = k.split('>'); return [k, b + '>' + a]; }))); if (alt && !cands.some(c => same(c, alt))) cands.push(Object.assign({ label: '替代' }, alt));
    if (opt.mode === 'shortest') cands.sort((a, b) => a.distance - b.distance);
    if (opt.walk) { cands.length = 1; cands[0].label = '步行'; }
    const now = Date.now();
    cands.forEach((c, i) => {
      c.id = 'c' + i; c.warnings = base.slice(); c.eta = new Date(now + c.duration * 1000).toISOString();
      if (opt.avoidHighway && c.use.highway) c.warnings.push('仍使用高速公路路段（無更好替代）'); if (opt.avoidToll && c.use.toll) c.warnings.push('仍使用收費路段（無更好替代）'); if (opt.avoidUnpaved && c.use.unpaved) c.warnings.push('仍使用未鋪裝路段（無更好替代）');
      if (c.delay >= 30) c.warnings.push('途經受交通事件影響的路段，約延誤 ' + Math.round(c.delay / 60 * 10) / 10 + ' 分鐘');
      delete c.keys;
    });
    return { ok: true, demo: true, candidates: cands };
  }

  let graph = null, seq = 0;
  async function load() {
    const my = ++seq, info = S.get().offlinePackage;
    if (!info || !['ready', 'limited', 'updating'].includes(S.get().offlinePackageStatus)) { graph = null; return; }
    try { const rec = await DB.get('packages', info.id + '@' + info.version), f = rec.manifest.components.routing, d = rec.files[f] && JSON.parse(new TextDecoder().decode(rec.files[f])); if (my === seq) { graph = d ? build(d) : null; A.Log.info('離線路網已載入', graph ? graph.nodes.length + ' 節點' : '無路網'); } } catch (e) { A.Log.error('載入路網失敗', String(e)); }
  }
  const noPkg = () => ({ ok: false, demo: true, reason: 'NO_PACKAGE', message: '尚未安裝離線資料包，請先到「下載中心」下載。' });
  function calculate(o) {
    if (!graph) return Promise.resolve(noPkg()); o = o || {}; const st = S.get(), from = o.from || st.currentLocation, to = o.to || st.destination;
    if (!from || !to) return Promise.resolve({ ok: false, demo: true, reason: 'NO_ENDPOINTS', message: '請先設定起點與目的地' });
    if (o.traffic === undefined && A.Traffic && !o.walk) o.traffic = A.Traffic.edgeMap();
    return Promise.resolve(plan(graph, [from].concat(o.waypoints || st.waypoints || [], [to]), o));
  }
  /* 目前所在道路的速限（Demo 路網的道路速度）。離道路超過 40 m 回傳 null，不猜測。
     在路口時多條道路距離相同，改用車頭方向（hd，度）挑選與行進方向一致的那條。 */
  function limitOf(g, x, y, hd) {
    const i = nearest(g, { x, y }), c = [];
    for (const e of g.adj[i]) {
      const a = e.a, b = e.b, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const axis = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 180, off = hd == null ? 0 : (((axis - hd) % 180) + 180) % 180;
      c.push({ d: Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)), kmh: e.kmh, ang: Math.min(off, 180 - off) });
    }
    if (!c.length) return null; const dmin = Math.min(...c.map(k => k.d)); if (dmin > 40) return null;
    return c.filter(k => k.d <= dmin + 1).sort((p, q) => p.ang - q.ang)[0].kmh;
  }
  function evalPoints(pts, traffic) {   // 估算一串路徑點在交通事件下的剩餘時間
    if (!graph) return null; traffic = traffic || {}; let dur = 0, delay = 0, closed = false; const hit = new Set();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], k = ek(a, b), e = graph.edgeMap.get(k), t = traffic[k];
      if (e) { const base = e.len / (e.kmh / 3.6), f = t && !t.closed ? t.factor : 1; dur += base * f; delay += base * (f - 1); if (t) { hit.add(t.id); if (t.closed) closed = true; } }
      else dur += Math.hypot(b[0] - a[0], b[1] - a[1]) / (20 / 3.6);
    }
    return { duration: Math.round(dur), delay: Math.round(delay), closed, events: [...hit] };
  }
  const api = { name: 'Offline Routing（資料包）', isDemo: true, calculate, evalPoints, limitAt: (x, y, hd) => (graph ? limitOf(graph, x, y, hd) : null), _limit: limitOf, reroute: o => calculate(o), load, _build: build, _plan: plan, ready: () => !!graph };
  A.Routing = api; A.Providers.register('routing', api);
  S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) load(); });
  document.addEventListener('DOMContentLoaded', load);
})();
