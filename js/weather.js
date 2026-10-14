/* 離線天氣快照（Batch 10）。目前沒有天氣來源，資料為 Demo 快照（時間為示意，非真實氣象），
   每筆資料都帶「資料時間」並依年齡標示是否過時；任何畫面都不得稱為「即時」。 */
(function () {
  const A = window.AIGPS, S = A.State, H = 3600000;
  const COND = { clear: { label: '晴', rain: 5, color: '#8a5600' }, cloudy: { label: '多雲', rain: 20, color: '#58626e' }, rain: { label: '降雨', rain: 80, color: '#0b5cad' }, storm: { label: '雷雨', rain: 95, color: '#5f3dc4' }, fog: { label: '起霧', rain: 10, color: '#58626e' } };
  const ADVICE = { rain: '路面濕滑，請放慢速度並加大車距', storm: '雷雨強風，建議避免行駛或到安全處停靠', fog: '能見度低，請開霧燈並降低車速' };
  const rep = (c, n) => Array(n).fill(c);
  const ZONES = {
    NW: { name: '西北區', base: 24, wind: 12, vis: 10, seq: [...rep('cloudy', 6), ...rep('rain', 3), ...rep('cloudy', 3)] },
    NE: { name: '東北區', base: 22, wind: 25, vis: 6, seq: [...rep('rain', 4), 'storm', 'rain', ...rep('cloudy', 4), 'clear', 'clear'] },
    SW: { name: '西南區', base: 26, wind: 8, vis: 15, seq: [...rep('clear', 9), ...rep('cloudy', 3)] },
    SE: { name: '東南區', base: 23, wind: 6, vis: 10, seq: [...rep('fog', 3), ...rep('cloudy', 2), ...rep('clear', 7)] }
  };
  const DRIFT = [0, 0, -1, -1, -2, -2, -2, -1, -1, 0, 0, 1];
  const zoneOf = (x, y) => (y >= 0 ? 'N' : 'S') + (x >= 0 ? 'E' : 'W');
  const visOf = (z, c) => c === 'fog' ? 0.8 : c === 'storm' ? 3 : c === 'rain' ? 5 : z.vis;

  function snapshot(asOf) {
    const zones = {};
    Object.keys(ZONES).forEach(id => { const z = ZONES[id]; zones[id] = { id, name: z.name, hourly: z.seq.map((c, i) => ({ t: asOf + i * H, cond: c, temp: z.base + DRIFT[i], rain: COND[c].rain, wind: z.wind + (c === 'storm' ? 20 : 0), vis: visOf(z, c) })) }; });
    return { demo: true, live: false, asOf, zones };
  }
  const ageLevel = (now, asOf) => { const a = now - asOf; return a <= 6 * H ? 'fresh' : a <= 24 * H ? 'stale' : 'veryStale'; };
  function at(zone, now, asOf) {
    const raw = Math.floor((now - asOf) / H), i = Math.max(0, Math.min(zone.hourly.length - 1, raw));
    return Object.assign({}, zone.hourly[i], { idx: i, expired: raw >= zone.hourly.length });
  }
  const summary = (snap, zid, now) => { const z = snap.zones[zid], w = at(z, now, snap.asOf); return { zone: zid, zoneName: z.name, cond: w.cond, label: COND[w.cond].label, temp: w.temp, rain: w.rain, wind: w.wind, vis: w.vis, advice: ADVICE[w.cond] || null, asOf: snap.asOf, ageLevel: ageLevel(now, snap.asOf), expired: w.expired, demo: true, live: false }; };
  /* 沿路線每 100 m 取樣，列出依序經過的區域，並以抵達該處的預估時間查預報 */
  function routeWeather(snap, pts, durationS, now) {
    const segs = []; let last = null, along = 0, total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 100));
      for (let k = 0; k < n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, zid = zoneOf(x, y), d = along + len * t;
        if (zid !== last) { last = zid; const eta = now + (total ? durationS * 1000 * d / total : 0), w = at(snap.zones[zid], eta, snap.asOf); segs.push({ zone: zid, name: snap.zones[zid].name, along: Math.round(d), etaMs: eta, cond: w.cond, label: COND[w.cond].label, temp: w.temp, advice: ADVICE[w.cond] || null, hazard: !!ADVICE[w.cond], expired: w.expired }); }
      }
      along += len;
    }
    return segs;
  }

  let asOf = Math.floor(Date.now() / H) * H - H, snap = snapshot(asOf), lastZone = null;
  const refresh = () => { snap = snapshot(asOf); const l = S.get().currentLocation, z = l ? zoneOf(l.x, l.y) : 'NE'; lastZone = null; tick(true, z); };
  function tick(force, z0) {
    const l = S.get().currentLocation, z = z0 || (l ? zoneOf(l.x, l.y) : 'NE'); if (!force && z === lastZone) return;
    const first = lastZone == null; lastZone = z; const w = summary(snap, z, Date.now()); S.set({ weather: w });
    if (!first && A.Nav && A.Nav.active && w.advice) S.set({ notice: { id: Date.now() + Math.random(), type: 'weather', text: `進入${w.zoneName}：${w.label}，${w.advice}` } });
  }
  const api = { name: 'Offline Weather（Demo 快照）', isDemo: true, live: false, COND, ADVICE, zoneOf, snapshot: () => snap, setAge(ms) { asOf = Date.now() - ms; refresh(); }, asOf: () => asOf,
    summary: (zid, now) => summary(snap, zid, now || Date.now()), routeWeather: (pts, dur, now) => routeWeather(snap, pts, dur, now || Date.now()),
    getCurrent(o) { o = o || {}; return Promise.resolve(Object.assign({ ok: true }, summary(snap, zoneOf(o.x || 0, o.y || 0), Date.now()))); },
    _snapshot: snapshot, _ageLevel: ageLevel, _at: at, _route: routeWeather, _zoneOf: zoneOf };
  A.Weather = api; A.Providers.register('weather', api);
  S.subscribe((s, ch) => { if (ch.includes('currentLocation')) tick(false); });
  document.addEventListener('DOMContentLoaded', () => tick(true));
})();
