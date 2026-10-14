/* 路線規劃頁 */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id), KEY = 'aigps.routePrefs';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m', mins = s => s >= 3600 ? Math.floor(s / 3600) + ' 小時 ' + Math.round(s % 3600 / 60) + ' 分' : Math.max(1, Math.round(s / 60)) + ' 分鐘';
  let cands = [], prefs = { mode: 'fastest', avoidHighway: false, avoidToll: false, avoidUnpaved: false, avoidFerry: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY))); } catch (_) {}

  function preview(list, sel) {
    const P = (pts, cls, w, op) => `<polyline points="${pts.map(p => p[0] + ',' + (-p[1])).join(' ')}" fill="none" stroke="${cls}" stroke-width="${w}" opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`;
    let g = ''; for (let k = -1000; k <= 1000; k += 200) g += `<line x1="${k}" y1="-1000" x2="${k}" y2="1000" stroke="var(--line)" stroke-width="6"/><line x1="-1000" y1="${k}" x2="1000" y2="${k}" stroke="var(--line)" stroke-width="6"/>`;
    list.forEach((c, i) => { if (i !== sel) g += P(c.points, 'var(--muted)', 14, .6); }); if (list[sel]) g += P(list[sel].points, 'var(--accent)', 22, 1);
    const f = S.get().currentLocation, d = S.get().destination, wp = S.get().waypoints || [];
    if (f) g += `<circle cx="${f.x}" cy="${-f.y}" r="40" fill="var(--ok)"/>`; wp.forEach(w => g += `<circle cx="${w.x}" cy="${-w.y}" r="34" fill="var(--warn)"/>`); if (d) g += `<circle cx="${d.x}" cy="${-d.y}" r="44" fill="#e03131"/>`;
    $('pv').innerHTML = g;
  }
  async function calc() {
    const st = S.get(), box = $('cands'), msg = $('msg'); $('dest').textContent = st.destination ? st.destination.name : '尚未設定（請先到「搜尋」頁）';
    renderWps(); if (!st.route) $('pick').textContent = ''; if (!st.destination) { box.innerHTML = ''; msg.textContent = ''; preview([], -1); return; }
    const r = await A.Providers.get('routing').calculate(Object.assign({}, prefs, { waypoints: st.waypoints || [] }));
    if (!r.ok) { cands = []; box.innerHTML = ''; msg.innerHTML = esc(r.message) + (r.reason === 'NO_PACKAGE' ? ' <a href="downloads.html">前往下載中心</a>' : ''); msg.className = 'lvl-warn'; preview([], -1); return; }
    cands = r.candidates; msg.textContent = '路線由離線路網計算（Demo 資料），不需網路。'; msg.className = 'muted';
    const cur = S.get().route, selIdx = Math.max(0, cands.findIndex(c => cur && c.distance === cur.distance && c.duration === cur.duration));
    box.innerHTML = cands.map((c, i) => `<li><div><b>${c.label}</b>　${mins(c.duration)}・${km(c.distance)}${c.use.toll ? '・含收費' : ''}${c.use.highway ? '・含高速' : ''}${c.warnings.map(w => `<br><span class="lvl-warn">⚠ ${esc(w)}</span>`).join('')}</div><button data-i="${i}" class="${i === selIdx && cur ? 'primary' : ''}">${i === selIdx && cur ? '已選用' : '選用此路線'}</button></li>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => choose(+b.dataset.i)); preview(cands, selIdx);
  }
  function choose(i) {
    const c = cands[i]; S.set({ route: { label: c.label, points: c.points, distance: c.distance, duration: c.duration, eta: c.eta, demo: true }, alternativeRoutes: cands.filter((_, j) => j !== i).map(x => ({ label: x.label, points: x.points })), remainingDistance: c.distance, remainingTime: c.duration, ETA: c.eta, navigationStatus: 'planning' });
    A.Log.info('選用路線：' + c.label); $('pick').innerHTML = `已選用「${c.label}」。<a href="navigation.html">前往導航地圖</a>`; calc();
  }
  function renderWps() {
    const w = S.get().waypoints || []; $('wps').innerHTML = w.length ? w.map((p, i) => `<li>${i + 1}. ${esc(p.name)} <button data-r="${i}" aria-label="移除途經點">移除</button></li>`).join('') : '<li class="muted">尚無途經點</li>';
    $('wps').querySelectorAll('button').forEach(b => b.onclick = () => { const a = (S.get().waypoints || []).slice(); a.splice(+b.dataset.r, 1); S.set({ waypoints: a, route: null }); calc(); });
    $('skip').disabled = !w.length;
  }
  document.addEventListener('DOMContentLoaded', () => {
    $(prefs.mode === 'shortest' ? 'mShort' : 'mFast').checked = true; ['avoidHighway', 'avoidToll', 'avoidUnpaved'].forEach(k => $(k).checked = prefs[k]);
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} S.set({ route: null }); calc(); };
    $('mFast').onchange = $('mShort').onchange = () => { prefs.mode = $('mShort').checked ? 'shortest' : 'fastest'; save(); };
    ['avoidHighway', 'avoidToll', 'avoidUnpaved'].forEach(k => $(k).onchange = () => { prefs[k] = $(k).checked; save(); });
    $('skip').onclick = () => { S.set({ waypoints: (S.get().waypoints || []).slice(1), route: null }); calc(); };
    $('wq').addEventListener('input', async () => {
      const q = $('wq').value.trim(); if (!q) { $('wres').innerHTML = ''; return; } const r = await A.Search.query(q, { limit: 5 });
      $('wres').innerHTML = r.ok ? r.results.map(p => `<li>${esc(p.name)} <button data-id="${p.id}">加入途經點</button></li>`).join('') : `<li class="lvl-warn">${esc(r.message)}</li>`;
      $('wres').querySelectorAll('button').forEach(b => b.onclick = () => { const p = r.results.find(x => x.id === +b.dataset.id), w = (S.get().waypoints || []).slice(); if (w.length >= 3) return alert('最多 3 個途經點'); w.push({ id: p.id, name: p.name, x: p.x, y: p.y }); S.set({ waypoints: w, route: null }); $('wq').value = ''; $('wres').innerHTML = ''; calc(); });
    });
    S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) setTimeout(calc, 400); }); setTimeout(calc, 300);
  });
})();
