/* 搜尋頁面邏輯（Batch 9：沿途搜尋、收藏、家／公司快捷、POI 詳情連結） */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id);
  let cat = '', timer = 0, seq = 0;
  const fmt = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const showDest = () => { const d = S.get().destination; $('dest').innerHTML = d ? `目的地：<b>${esc(d.name)}</b>　<a href="navigation.html">在地圖上查看</a>` : ''; };
  function quick() {
    const p = A.Places.get(), b = [];
    if (p.home) b.push(['回家：' + p.home.name, p.home]); if (p.work) b.push(['去公司：' + p.work.name, p.work]);
    $('quick').innerHTML = b.map((x, i) => `<button data-i="${i}">${esc(x[0])}</button>`).join('');
    $('quick').querySelectorAll('button').forEach(el => el.onclick = () => { A.Places.setDestination(b[+el.dataset.i][1]); showDest(); });
  }
  async function run() {
    const my = ++seq, q = $('q').value, r = +$('radius').value, rt = S.get().route, along = $('along').checked && !!rt;
    const opt = { cat, radius: r || 0 }; if (along) { opt.routePts = rt.points; opt.routeMax = 200; }
    const want = q.trim() || cat || r || along, res = !want ? null : (q.trim() || cat || along) ? await A.Search.query(q, opt) : await A.Search.nearby('', r);
    if (my !== seq) return; const box = $('results'), st = $('status');
    if (!res) { st.textContent = '輸入關鍵字、選擇類別，或指定附近範圍。'; box.innerHTML = ''; return; }
    if (!res.ok) { if (A.Search.loading) { st.innerHTML = '<span class="spinner" aria-hidden="true"></span>正在載入離線資料…'; box.innerHTML = ''; setTimeout(run, 400); return; } st.innerHTML = esc(res.message) + ' <a href="downloads.html">前往下載中心</a>'; box.innerHTML = ''; return; }
    st.textContent = `找到 ${res.total} 筆（顯示 ${res.results.length} 筆）・${along ? '依路線順序排列・' : ''}距離以${res.fromGps ? '目前 Demo 位置' : 'Demo 地圖原點'}計算・資料為 DEMO，離線可用`;
    box.innerHTML = res.results.length ? res.results.map(p => `<li><div><b>${esc(p.name)}</b><br><span class="muted">${esc(p.cat)}${p.addr ? '・' + esc(p.addr) : ''}・${fmt(p.dist)}${p.routeDist != null ? '・距路線 ' + p.routeDist + ' m' : ''}${p.parking ? '・有停車' : ''}</span></div>
      <div class="btns" style="margin:0"><a class="btnlink" href="poi.html?id=${p.id}">詳情</a><button data-f="${p.id}" aria-label="收藏" aria-pressed="${A.Places.isFav(p)}">${A.Places.isFav(p) ? '★' : '☆'}</button><button data-id="${p.id}">設為目的地</button></div></li>`).join('') : '<li class="muted">沒有符合的結果，換個關鍵字試試。</li>';
    box.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => { A.Places.setDestination(res.results.find(x => x.id === +b.dataset.id)); showDest(); });
    box.querySelectorAll('button[data-f]').forEach(b => b.onclick = () => { const on = A.Places.toggleFav(res.results.find(x => x.id === +b.dataset.f)); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on); });
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
  document.addEventListener('DOMContentLoaded', () => {
    $('q').addEventListener('input', later); $('radius').onchange = run; $('along').onchange = run;
    $('along').disabled = !S.get().route; if (!S.get().route) $('alongLbl').textContent = '沿途搜尋（需先在「路線」頁選用路線）';
    $('chips').innerHTML = ['全部', ...A.Search.categories].map(c => `<button data-c="${c === '全部' ? '' : c}" aria-pressed="${c === '全部'}">${c}</button>`).join('');
    $('chips').querySelectorAll('button').forEach(b => b.onclick = () => { cat = b.dataset.c; $('chips').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); run(); });
    $('nearPark').onclick = () => { cat = '停車'; $('radius').value = '2000'; $('chips').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === '停車')); run(); };
    $('clearDest').onclick = () => { S.set({ destination: null, route: null }); $('dest').textContent = '已清除目的地'; };
    A.Places.on(quick); quick(); showDest();
    S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) setTimeout(run, 300); }); run();
  });
})();
