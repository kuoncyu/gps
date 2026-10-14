/* Demo GPS（Batch 1）：沿 Demo 路線平滑行駛，狀態寫入唯一 Navigation State。
   實機定位 Provider（navigator.geolocation）將於後續批次以同一介面加入。 */
(function () {
  const A = window.AIGPS, S = A.State, D = () => A.DemoData;
  const R = () => { const r = S.get().route; return r && r.points && r.points.length > 1 ? r.points : D().route; };
  const KMH = 3.6, CRUISE = 50 / KMH, SLOW = 20 / KMH, ACC = 3;
  let off = { x: 0, y: 0 }, seg = 0, along = 0, v = 0, raf = 0, last = 0, lastPush = 0, factor = 1, t0 = 0;
  const trip = { dist: 0, time: 0, max: 0 };
  const pose = { x: 0, y: 0, heading: 0, speed: 0, running: false };
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  const segInfo = i => { const r = R(), a = r[i], b = r[i + 1], dx = b[0] - a[0], dy = b[1] - a[1]; return { a, len: Math.hypot(dx, dy), ux: dx / Math.hypot(dx, dy), uy: dy / Math.hypot(dx, dy), hd: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 }; };
  function place() { const s = segInfo(seg); pose.x = s.a[0] + s.ux * along + off.x; pose.y = s.a[1] + s.uy * along + off.y; return s; }
  function reset(keep) { seg = 0; along = 0; off = { x: 0, y: 0 }; if (!keep) { v = 0; Object.assign(trip, { dist: 0, time: 0, max: 0 }); } const s = place(); pose.heading = s.hd; pose.speed = keep ? v * KMH : 0; }

  function frame(now) {
    if (!pose.running) return;
    const dt = Math.min((now - last) / 1000, 0.1) * factor; last = now;
    let s = segInfo(seg);
    const toCorner = s.len - along, lastSeg = seg === R().length - 2;
    const walk = !!(S.get().route && S.get().route.walk), target = toCorner < 40 && !lastSeg ? (walk ? 3 / KMH : SLOW) : (walk ? 5 / KMH : CRUISE);
    v += Math.max(-ACC * 2 * dt, Math.min(ACC * dt, target - v));
    along += v * dt; trip.dist += v * dt; trip.time += dt; trip.max = Math.max(trip.max, v * KMH);
    if (along >= s.len) {
      if (lastSeg) { A.Log.info('Demo 路線結束，從起點重新開始'); reset(true); } else { along -= s.len; seg++; }
    }
    s = place();
    pose.heading = (pose.heading + Math.sign(angDiff(pose.heading, s.hd)) * Math.min(Math.abs(angDiff(pose.heading, s.hd)), 150 * dt) + 360) % 360;
    pose.speed = v * KMH;
    if (now - lastPush > 100) { lastPush = now; push(); }
    raf = requestAnimationFrame(frame);
  }
  function push() {
    const o = D().origin, k = 111320;
    S.set({
      currentLocation: { lat: o.lat + pose.y / k, lng: o.lng + pose.x / (k * Math.cos(o.lat * Math.PI / 180)), x: pose.x, y: pose.y, demo: true },
      heading: Math.round(pose.heading), speed: Math.round(pose.speed), accuracy: 5, currentRoad: 'Demo 道路',
      tripData: { distance: Math.round(trip.dist), duration: Math.round(trip.time), avgSpeed: trip.time ? Math.round(trip.dist / trip.time * KMH) : 0, maxSpeed: Math.round(trip.max) }
    });
  }
  const api = {
    name: 'Demo GPS', isDemo: true, pose,
    async start() { if (pose.running) return { ok: true, demo: true }; pose.running = true; last = performance.now(); raf = requestAnimationFrame(frame); A.Log.info('Demo GPS 開始'); return { ok: true, demo: true }; },
    async stop() { pose.running = false; cancelAnimationFrame(raf); v = 0; pose.speed = 0; push(); A.Log.info('Demo GPS 暫停'); return { ok: true, demo: true }; },
    setFactor(f) { factor = f; A.Log.info('Demo 速度倍率 ×' + f); },
    getFactor: () => factor, reset(keep) { reset(keep); push(); },
    detour() { const h = pose.heading * Math.PI / 180; off = { x: off.x + 120 * Math.cos(h), y: off.y - 120 * Math.sin(h) }; A.Log.warn('模擬偏航：車輛向右偏離約 120 m'); push(); }
  };
  A.Gps = api; A.Providers.register('location', api);
  S.subscribe((st, ch) => { if (ch.includes('route')) { reset(S.get().navigationStatus === 'rerouting'); push(); } });
  reset(); push();
})();
