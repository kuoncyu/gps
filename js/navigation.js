/* 導航引擎（Batch 5）：路線→轉彎指令、定位投影、距離倒數、ETA、偏航偵測、重新規劃、抵達。
   純函式（prepare / buildInstructions / locate / progress）可在 node 單元測試。 */
(function () {
  const A = window.AIGPS, S = A.State, RAD = Math.PI / 180;
  const heading = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD + 360) % 360;
  const sdiff = (a, b) => ((b - a + 540) % 360) - 180;       // 順時針為正（右轉）
  const OFF_M = 35, OFF_TICKS = 3, ARRIVE_M = 25;

  function prepare(points) {
    const pts = [points[0]]; points.slice(1).forEach(p => { const l = pts[pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.5) pts.push(p); });
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, total: cum[cum.length - 1] };
  }
  function classify(d, at) {
    const a = Math.abs(d), side = d > 0 ? '右' : '左', dir = d > 0 ? 'right' : 'left';
    if (a > 170) return { type: 'uturn', dir: 'uturn', turn: 180, at, text: '迴轉' };
    if (a > 135) return { type: 'sharp', dir, turn: d, at, text: '急' + side + '轉' };
    if (a >= 45) return { type: 'turn', dir, turn: d, at, text: side + '轉' };
    return { type: 'slight', dir, turn: d, at, text: '稍微靠' + side };
  }
  function buildInstructions(R) {
    const { pts, cum, total } = R, out = [{ type: 'depart', dir: 'straight', turn: 0, at: 0, text: '出發' }];
    if (pts.length < 2) return out.concat({ type: 'arrive', dir: 'straight', turn: 0, at: 0, text: '抵達目的地' });
    let last = heading(pts[0], pts[1]);
    for (let i = 1; i < pts.length - 1; i++) { const hd = heading(pts[i], pts[i + 1]), d = sdiff(last, hd); if (Math.abs(d) >= 15) out.push(Object.assign(classify(d, cum[i]), { pt: pts[i], inHd: last })); last = hd; }
    out.push({ type: 'arrive', dir: 'straight', turn: 0, at: total, text: '抵達目的地' }); return out;
  }
  function locate(R, x, y, hint) {
    const n = R.pts.length - 1, from = hint == null ? 0 : Math.max(0, hint - 1), to = hint == null ? n - 1 : Math.min(n - 1, hint + 10); let best = null;
    for (let i = from; i <= to; i++) {
      const a = R.pts[i], b = R.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(x - px, y - py);
      if (!best || d < best.dist) best = { i, dist: d, along: R.cum[i] + t * Math.sqrt(l2) };
    }
    return best;
  }
  const stageOf = d => d <= ARRIVE_M ? 'now' : d <= 100 ? '100' : d <= 300 ? '300' : d <= 500 ? '500' : 'far';
  function progress(R, instr, x, y, hint) {
    const loc = locate(R, x, y, hint), along = Math.min(loc.along, R.total);
    let idx = instr.findIndex(k => k.type !== 'depart' && k.at > along + 2); if (idx < 0) idx = instr.length - 1;
    const next = instr[idx], after = instr[idx + 1] || null, dist = Math.max(0, next.at - along), stage = stageOf(dist);
    const label = next.type === 'arrive' ? (stage === 'now' ? '您已抵達目的地' : stage === 'far' ? '沿道路行駛' : '前方抵達目的地')
      : stage === 'now' ? '現在' + next.text : stage === 'far' ? '沿道路行駛' : stage + ' m 後' + next.text;
    return { loc, along, remaining: R.total - along, idx, next, after, dist, stage, label };
  }

  // ---------- 執行期 ----------
  let R = null, instr = [], hint = 0, off = 0, active = false, lock = 0, rerouting = false, last = '';
  const prefs = () => { try { return JSON.parse(localStorage.getItem('aigps.routePrefs')) || {}; } catch (_) { return {}; } };

  function setRoute(route) { R = prepare(route.points); instr = buildInstructions(R); hint = 0; off = 0; last = ''; }
  function start() {
    const rt = S.get().route; if (!rt || !rt.points || rt.points.length < 2) return { ok: false, reason: 'NO_ROUTE', message: '請先到「路線」頁選用一條路線' };
    setRoute(rt); active = true; rerouting = false; lock = 0;
    S.set({ navigationStatus: 'navigating', currentInstruction: null, nextInstruction: null }); A.Gps.reset(); A.Gps.start(); A.Log.info('開始導航', rt.label); return { ok: true };
  }
  function clear(status) { active = false; S.set({ laneGuidance: null, navigationStatus: status, currentInstruction: null, nextInstruction: null }); }
  function stop() { if (!active) return; A.Gps.stop(); clear('idle'); A.Log.info('結束導航'); }
  function finish() { clear('idle'); S.set({ route: null, alternativeRoutes: [], remainingDistance: null, remainingTime: null, ETA: null, waypoints: [] }); }
  function arrive() { A.Gps.stop(); clear('arrived'); S.set({ remainingDistance: 0, remainingTime: 0 }); A.Log.info('抵達目的地', JSON.stringify(S.get().tripData)); }

  function keepWps(l) { const alongNow = Math.min(locate(R, l.x, l.y, null).along, R.total); return (S.get().waypoints || []).filter(w => locate(R, w.x, w.y, null).along > alongNow + 5); }
  function remainingPoints() { const l = S.get().currentLocation; return R && l ? [[l.x, l.y]].concat(R.pts.slice(hint + 1)) : []; }
  function edgeAhead(d) { if (!R) return null; const t = Math.min((api.along || 0) + d, R.total - 1); let i = 0; while (i < R.pts.length - 2 && R.cum[i + 1] <= t) i++; return [R.pts[i], R.pts[i + 1]]; }
  function applyRoute(c, reason, keep) {
    if (!active) return; S.set({ navigationStatus: 'rerouting' });
    S.set({ waypoints: keep || [], alternativeRoutes: [], route: { label: '交通重新規劃', points: c.points, distance: c.distance, duration: c.duration, eta: c.eta, demo: true, rerouted: true }, notice: { id: Date.now(), type: 'reroute', text: reason } }); A.Log.info(reason);
  }
  async function reroute(l) {
    rerouting = true; S.set({ navigationStatus: 'rerouting', currentInstruction: { type: 'reroute', dir: 'straight', turn: 0, label: '正在重新規劃路線…', distance: 0, stage: 'now' } }); A.Log.warn('偏離路線，重新規劃');
    const keep = keepWps(l);
    let r; try { r = await A.Providers.get('routing').reroute(Object.assign({}, prefs(), { waypoints: keep })); } catch (e) { r = { ok: false, message: String(e) }; }
    rerouting = false; lock = Date.now() + 5000;
    if (!active) return;
    if (!r.ok) { A.Log.error('重新規劃失敗', r.message); off = 0; S.set({ navigationStatus: 'navigating', currentInstruction: { type: 'warn', dir: 'straight', turn: 0, label: '無法重新規劃：' + r.message, distance: 0, stage: 'far' } }); return; }
    const c = r.candidates[0]; S.set({ waypoints: keep, alternativeRoutes: [], route: { label: '重新規劃', points: c.points, distance: c.distance, duration: c.duration, eta: c.eta, demo: true, rerouted: true } });
    A.Log.info('已套用新路線', Math.round(c.distance) + ' m');
  }
  function tick() {
    if (!active || rerouting || !R) return; const s = S.get(), l = s.currentLocation, rt = s.route; if (!l || !rt) return;
    const p = progress(R, instr, l.x, l.y, hint);
    if (p.loc.dist > OFF_M) { if (++off >= OFF_TICKS && Date.now() > lock) reroute(l); return; }
    off = 0; hint = p.loc.i;
    const lg = p.dist <= 300 && p.next.pt && A.Lanes ? A.Lanes.forManeuver(p.next) : null;
    const frac = R.total ? p.remaining / R.total : 0, secs = Math.round(rt.duration * frac), sig = [p.idx, p.stage, lg ? 1 : 0, Math.round(p.dist / 5), Math.round(p.remaining / 10)].join();
    api.nextDist = p.dist; api.along = p.along; if (sig === last) return; last = sig;
    S.set({ laneGuidance: lg, remainingDistance: Math.round(p.remaining), remainingTime: secs, ETA: new Date(Date.now() + secs * 1000).toISOString(),
      currentInstruction: { type: p.next.type, dir: p.next.dir, turn: p.next.turn, text: p.next.text, label: p.label, distance: Math.round(p.dist), stage: p.stage },
      nextInstruction: p.after && p.after.at - p.next.at < 400 ? { type: p.after.type, dir: p.after.dir, turn: p.after.turn, text: p.after.text, distance: Math.round(p.after.at - p.next.at) } : null });
    if (p.next.type === 'arrive' && p.dist <= ARRIVE_M) arrive();
  }
  function preview(route) {
    const r = prepare(route.points), I = buildInstructions(r);
    return I.map((x, i) => ({ text: x.text, dir: x.dir, turn: x.turn, at: x.at, dist: i ? x.at - I[i - 1].at : 0, lane: !!(A.Lanes && A.Lanes.has(x)) }));
  }
  const api = { getRoute: () => R, remainingPoints, keepWaypoints: () => { const l = S.get().currentLocation; return R && l ? keepWps(l) : []; }, edgeAhead, applyRoute, along: 0, preview, start, stop, finish, get active() { return active; }, nextDist: null, _prepare: prepare, _build: buildInstructions, _locate: locate, _progress: progress, _stageOf: stageOf };
  A.Nav = api;
  S.subscribe((s, ch) => {
    if (!active) return;
    if (ch.includes('route') && s.route && s.route.rerouted) { setRoute(s.route); lock = Math.max(lock, Date.now() + 3000); /* 保留較長的冷卻，避免偏航連點造成重算風暴 */ S.set({ navigationStatus: 'navigating', currentInstruction: null }); }
    else if (ch.includes('currentLocation')) tick();
  });
})();
