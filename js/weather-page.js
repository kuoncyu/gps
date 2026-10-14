/* 天氣頁 */
(function () {
  const A = window.AIGPS, S = A.State, W = A.Weather, $ = id => document.getElementById(id), H = 3600000;
  const hm = ms => new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const full = ms => new Date(ms).toLocaleString('zh-TW', { hour12: false });
  const ago = ms => { const a = Date.now() - ms; return a < H ? '不到 1 小時前' : a < 48 * H ? Math.round(a / H) + ' 小時前' : Math.round(a / (24 * H)) + ' 天前'; };
  const chip = c => `<span class="wchip" style="background:${W.COND[c].color}">${W.COND[c].label}</span>`;
  const LV = { fresh: ['離線快照（Demo）：非即時氣象，時間為示意。', 'muted'], stale: ['⚠ 資料已超過 6 小時，僅供參考。', 'lvl-warn'], veryStale: ['⚠ 資料已超過 24 小時，可能與目前天氣不符。', 'lvl-error'] };
  const card = (w, title) => `<h2>${title}</h2><p>${w.zoneName}　${chip(w.cond)}　<b>${w.temp}°C</b>・降雨機率 ${w.rain}%・風速 ${w.wind} km/h・能見度 ${w.vis} km</p>${w.advice ? `<p class="lvl-warn">⚠ ${w.advice}</p>` : ''}${w.expired ? '<p class="lvl-error">預報已過期（超過 12 小時），請在有網路時更新（本版尚無更新來源）。</p>' : ''}`;

  function render() {
    const s = S.get(), snap = W.snapshot(), now = Date.now(), lvl = W.COND && snap && W._ageLevel(now, snap.asOf), l = s.currentLocation || { x: 0, y: 0 };
    $('asof').innerHTML = `資料時間：<b>${full(snap.asOf)}</b>（${ago(snap.asOf)}）`; $('lvl').textContent = LV[lvl][0]; $('lvl').className = LV[lvl][1];
    const zid = W.zoneOf(l.x, l.y), cur = W.summary(zid, now);
    $('cur').innerHTML = card(cur, '目前位置' + (s.currentLocation ? '' : '（未取得位置，以預設區域顯示）'));
    const z = snap.zones[zid]; $('hourly').innerHTML = z.hourly.map((h, i) => `<li class="${i === cur.idx ? 'now' : h.t + H < now ? 'past' : ''}"><span>${hm(h.t)}</span>${chip(h.cond)}<span>${h.temp}°</span><span class="muted">${h.rain}%</span></li>`).join('');
    const d = s.destination, rt = s.route;
    if (d) { const dz = W.zoneOf(d.x, d.y), ew = rt && rt.eta ? W.summary(dz, Date.parse(rt.eta)) : W.summary(dz, now); $('dest').innerHTML = card(ew, `目的地：${d.name}` + (rt && rt.eta ? '（預計抵達時）' : '')); } else $('dest').innerHTML = '<h2>目的地</h2><p class="muted">尚未設定目的地。</p>';
    if (rt && rt.points) { const segs = W.routeWeather(rt.points, rt.duration, now), bad = segs.filter(x => x.hazard);
      $('along').innerHTML = `<h2>沿途天氣</h2>${bad.length ? `<p class="lvl-warn">⚠ 路線經過 ${bad.length} 段需留意的天氣</p>` : '<p>路線沿途天氣良好。</p>'}<ul class="l">${segs.map(x => `<li><span>${x.name}・約 ${Math.max(0, Math.round((x.etaMs - now) / 60000))} 分鐘後</span>${chip(x.cond)}<span>${x.temp}°</span>${x.advice ? `<span class="lvl-warn">${x.advice}</span>` : ''}</li>`).join('')}</ul>`; }
    else $('along').innerHTML = '<h2>沿途天氣</h2><p class="muted">選用路線後，這裡會列出沿途各區天氣。</p>';
    $('zones').innerHTML = Object.keys(snap.zones).map(id => { const w = W.summary(id, now); return `<li><span>${w.zoneName}</span>${chip(w.cond)}<span>${w.temp}°</span><span class="muted">${w.rain}%</span></li>`; }).join('');
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('age').onchange = () => { W.setAge(+$('age').value * H); render(); };
    S.subscribe((s, ch) => { if (ch.includes('weather') || ch.includes('currentLocation')) render(); }); render();
  });
})();
