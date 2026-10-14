/* Map Engine（Batch 1）：Canvas 自繪 Demo 地圖。支援拖曳、滾輪／按鈕縮放、2D/3D、North Up/Heading Up、跟隨車輛。 */
(function () {
  const A = window.AIGPS, $ = id => document.getElementById(id);
  const cam = { cx: 0, cy: 0, zoom: 0.5, rot: 0, tilt: 1, tiltT: 1, follow: true, headingUp: true, mode3d: false };
  let cv, ctx, W = 0, H = 0, dpr = 1, col = {}, frameN = 0;

  const readColors = () => { const c = getComputedStyle(document.documentElement); ['bg', 'panel', 'line', 'accent', 'muted', 'text'].forEach(k => col[k] = c.getPropertyValue('--' + k).trim()); };
  const rad = d => d * Math.PI / 180;
  function w2s(x, y) {
    const dx = x - cam.cx, dy = y - cam.cy, c = Math.cos(rad(cam.rot)), s = Math.sin(rad(cam.rot));
    const rx = dx * c - dy * s, ry = dx * s + dy * c;
    return [W / 2 + rx * cam.zoom, (cam.mode3d ? H * 0.68 : H / 2) - ry * cam.zoom * cam.tilt];
  }
  function s2dWorld(dxs, dys) {   // 螢幕位移 → 世界位移（拖曳用）
    const rx = dxs / cam.zoom, ry = -dys / (cam.zoom * cam.tilt), c = Math.cos(rad(cam.rot)), s = Math.sin(rad(cam.rot));
    return [rx * c + ry * s, -rx * s + ry * c];
  }
  function line(pts, w, color, alpha) {
    ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = w2s(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function draw() {
    const D = Object.assign({}, A.DemoData, (A.Search && A.Search.mapMeta) || {}), g = D.grid, e = D.extent, p = A.Gps.pose;
    // 相機
    cam.tilt += (cam.tiltT - cam.tilt) * 0.15;
    if (A.Nav && A.Nav.active && cam.follow) { const t = A.Nav.nextDist != null && A.Nav.nextDist < 150 ? 1.3 : 0.8; cam.zoom += (t - cam.zoom) * 0.04; }   // 接近路口自動放大
    if (cam.follow) { cam.cx += (p.x - cam.cx) * 0.2; cam.cy += (p.y - cam.cy) * 0.2; }
    const wantRot = cam.headingUp ? p.heading : 0, d = ((wantRot - cam.rot + 540) % 360) - 180;
    cam.rot = (cam.rot + d * 0.12 + 360) % 360;
    if (++frameN % 30 === 1) readColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
    // 街區
    ctx.fillStyle = col.panel;
    for (let x = -e; x < e; x += g) for (let y = -e; y < e; y += g) {
      const m = 14, q = [[x + m, y + m], [x + g - m, y + m], [x + g - m, y + g - m], [x + m, y + g - m]];
      ctx.beginPath(); q.forEach((a, i) => { const [sx, sy] = w2s(a[0], a[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath(); ctx.fill();
    }
    // 道路
    for (let k = -e; k <= e; k += g) {
      const major = k % D.major === 0, w = Math.max(1.5, (major ? 18 : 10) * cam.zoom);
      line([[k, -e], [k, e]], w, col.line); line([[-e, k], [e, k]], w, col.line);
    }
    // Demo 路線
    const st = A.State.get(), rp = st.route ? st.route.points : D.route;
    (st.alternativeRoutes || []).forEach(r => line(r.points, Math.max(3, 8 * cam.zoom), col.muted, 0.5));
    line(rp, Math.max(4, 14 * cam.zoom), col.accent, 0.35); line(rp, Math.max(2, 6 * cam.zoom), col.accent, 0.9);
    // 交通事件（離線／模擬）
    (st.trafficEvents || []).forEach(ev => {
      line([ev.a, ev.b], Math.max(5, 12 * cam.zoom), ev.closed ? '#e03131' : '#f08c00', 0.9);
      const [mx, my] = w2s((ev.a[0] + ev.b[0]) / 2, (ev.a[1] + ev.b[1]) / 2); ctx.beginPath(); ctx.arc(mx, my, 9, 0, 6.3); ctx.fillStyle = ev.closed ? '#e03131' : '#f08c00'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ev.closed ? '×' : '!', mx, my + 4);
    });
    // 駕駛警示（離線資料包，Demo）
    const AL = A.Alerts && A.Alerts.items;
    if (AL && cam.zoom >= 0.4) AL.forEach(it => { const T = A.Alerts.TYPES[it.type]; if (!T || !A.Alerts.prefs.types[it.type]) return; const [x, y] = w2s(it.x, it.y); ctx.fillStyle = T.color; ctx.fillRect(x - 8, y - 8, 16, 16); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(T.badge, x, y + 4); });
    // POI（來自離線資料包）
    const P = A.Search && A.Search.pois;
    if (P && cam.zoom >= 0.35) { ctx.fillStyle = col.muted; const R = Math.max(W, H) / cam.zoom; for (const q of P) { if (Math.abs(q.x - cam.cx) > R || Math.abs(q.y - cam.cy) > R) continue; const [x, y] = w2s(q.x, q.y); ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.3); ctx.fill(); } }
    const dst = A.State.get().destination; $('dst').textContent = dst ? dst.name : '—';
    if (dst) { const [x, y] = w2s(dst.x, dst.y); ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.3); ctx.fillStyle = '#e03131'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = col.text; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(dst.name, x, y - 18); }
    // 3D 地平線漸層
    if (cam.mode3d) { const gr = ctx.createLinearGradient(0, 0, 0, H * 0.35); gr.addColorStop(0, col.bg); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H * 0.35); }
    // 車輛
    const [vx, vy] = w2s(p.x, p.y), a = rad(p.heading - cam.rot), ux = Math.sin(a), uy = -Math.cos(a) * cam.tilt, nx = -uy, ny = ux, L = 20, B = 12;
    ctx.beginPath(); ctx.moveTo(vx + ux * L, vy + uy * L); ctx.lineTo(vx - ux * L * .7 + nx * B, vy - uy * L * .7 + ny * B); ctx.lineTo(vx - ux * L * .3, vy - uy * L * .3); ctx.lineTo(vx - ux * L * .7 - nx * B, vy - uy * L * .7 - ny * B); ctx.closePath();
    ctx.fillStyle = col.accent; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.fill();
    // 北方標示
    const [nxp, nyp] = [W - 36, 80], na = rad(-cam.rot); ctx.fillStyle = col.text; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', nxp + Math.sin(na) * 14, nyp - Math.cos(na) * 14 + 5);
    // HUD
    $('spd').textContent = Math.round(p.speed); $('hdg').textContent = Math.round(p.heading) + '°';
    requestAnimationFrame(draw);
  }
  function resize() { const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; }
  const zoom = f => { cam.zoom = Math.max(0.15, Math.min(3, cam.zoom * f)); };
  const press = (id, on) => $(id).setAttribute('aria-pressed', on);

  function init() {
    cv = $('map'); if (!cv) return; ctx = cv.getContext('2d'); readColors(); resize(); new ResizeObserver(resize).observe(cv);
    let drag = null, pinch = null; const pts = new Map();
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; const old = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(d / pinch); pinch = d; return; }
      const [dx, dy] = s2dWorld(e.clientX - old[0], e.clientY - old[1]);
      if (Math.abs(e.clientX - drag[0]) + Math.abs(e.clientY - drag[1]) > 4 && cam.follow) { cam.follow = false; press('btnFollow', false); }
      if (!cam.follow) { cam.cx -= dx; cam.cy -= dy; }
    });
    const up = e => { pts.delete(e.pointerId); pinch = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    $('btnZoomIn').onclick = () => zoom(1.3); $('btnZoomOut').onclick = () => zoom(1 / 1.3);
    $('btn3d').onclick = () => { cam.mode3d = !cam.mode3d; cam.tiltT = cam.mode3d ? 0.5 : 1; if (cam.mode3d) cam.zoom = Math.max(cam.zoom, 0.8); $('btn3d').textContent = cam.mode3d ? '3D' : '2D'; press('btn3d', cam.mode3d); };
    $('btnHead').onclick = () => { cam.headingUp = !cam.headingUp; $('btnHead').textContent = cam.headingUp ? '車頭朝上' : '北方朝上'; };
    $('btnFollow').onclick = () => { cam.follow = true; press('btnFollow', true); };
    $('btnStart').onclick = async () => { const run = A.Gps.pose.running; await (run ? A.Gps.stop() : A.Gps.start()); $('btnStart').textContent = run ? '▶ 開始 Demo GPS' : '⏸ 暫停'; };
    $('btnSpeed').onclick = () => { const n = { 1: 2, 2: 4, 4: 1 }[A.Gps.getFactor()]; A.Gps.setFactor(n); $('btnSpeed').textContent = '速度 ×' + n; };
    $('btnReset').onclick = () => { A.Gps.reset(); cam.follow = true; press('btnFollow', true); };
    cam.cx = A.Gps.pose.x; cam.cy = A.Gps.pose.y; requestAnimationFrame(draw); A.Log.info('Map Engine 啟動（Demo 地圖）');
  }
  function fitRoute() {   // 路線預覽：北方朝上、2D、縮放到整條路線
    const r = A.State.get().route; if (!r || !r.points.length) return false;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; r.points.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    cam.follow = false; cam.headingUp = false; cam.mode3d = false; cam.tiltT = 1; cam.cx = (x0 + x1) / 2; cam.cy = (y0 + y1) / 2;
    cam.zoom = Math.max(0.15, Math.min(3, Math.min(W / (x1 - x0 + 300), H * 0.7 / (y1 - y0 + 300))));
    press('btnFollow', false); press('btn3d', false); $('btn3d').textContent = '2D'; $('btnHead').textContent = '北方朝上'; return true;
  }
  A.Map = { cam, fitRoute }; document.addEventListener('DOMContentLoaded', init);
})();
