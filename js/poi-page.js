/* 我的地點／POI 詳情頁 */
(function () {
  const A = window.AIGPS, P = A.Places, S = A.State, $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
  const say = t => { $('msg').textContent = t; };
  const go = p => { P.setDestination(p); say(`已設定目的地：${p.name}。`); $('msg').insertAdjacentHTML('beforeend', ' <a href="route.html">規劃路線</a>'); };
  let cur = null;

  function list(el, arr, extra) {
    el.innerHTML = arr.length ? arr.map((p, i) => `<li><span><b>${esc(p.name)}</b> <span class="muted">${esc(p.cat || '')}</span></span><span class="row" style="margin:0"><a class="btnlink" href="poi.html?id=${p.id}">詳情</a><button data-g="${i}">前往</button>${extra ? `<button data-x="${i}">${extra}</button>` : ''}</span></li>`).join('') : '<li class="muted">尚無資料</li>';
    el.querySelectorAll('button[data-g]').forEach(b => b.onclick = () => go(arr[+b.dataset.g]));
    return el;
  }
  function lists() {
    const d = P.get();
    const hw = [['家', d.home, () => P.clearHome()], ['公司', d.work, () => P.clearWork()]];
    $('hw').innerHTML = hw.map(([n, p], i) => `<li><span><b>${n}</b>　${p ? esc(p.name) : '<span class="muted">尚未設定</span>'}</span><span class="row" style="margin:0">${p ? `<button data-g="${i}">前往</button><button data-c="${i}">清除</button>` : ''}</span></li>`).join('');
    $('hw').querySelectorAll('button[data-g]').forEach(b => b.onclick = () => go(hw[+b.dataset.g][1])); $('hw').querySelectorAll('button[data-c]').forEach(b => b.onclick = hw[+b.dataset.c][2]);
    list($('fav'), d.fav, '移除').querySelectorAll('button[data-x]').forEach(b => b.onclick = () => P.removeFav(d.fav[+b.dataset.x]));
    list($('hist'), d.hist, '收藏').querySelectorAll('button[data-x]').forEach(b => b.onclick = () => { const p = d.hist[+b.dataset.x]; if (!P.isFav(p)) P.toggleFav(p); });
    if (cur) detailActions();
  }
  function detailActions() {
    const p = cur, fav = P.isFav(p), d = P.get(), isHome = d.home && d.home.x === p.x && d.home.y === p.y, isWork = d.work && d.work.x === p.x && d.work.y === p.y;
    $('dAct').innerHTML = `<button id="aGo" class="primary">設為目的地</button><button id="aVia">加入途經點</button><button id="aFav" aria-pressed="${fav}">${fav ? '★ 已收藏' : '☆ 收藏'}</button><button id="aHome">${isHome ? '✓ 這是家' : '設為家'}</button><button id="aWork">${isWork ? '✓ 這是公司' : '設為公司'}</button>`;
    $('aGo').onclick = () => go(p); $('aFav').onclick = () => P.toggleFav(p); $('aHome').onclick = () => P.setHome(p); $('aWork').onclick = () => P.setWork(p);
    $('aVia').onclick = () => { const r = P.addWaypoint(p); say(r.ok ? `已加入途經點：${p.name}。` : r.message); if (r.ok) $('msg').insertAdjacentHTML('beforeend', ' <a href="route.html">規劃路線</a>'); };
  }
  function detail(p) {
    cur = p; $('detail').hidden = false; $('dName').textContent = p.name;
    const l = S.get().currentLocation;
    $('dInfo').textContent = `${p.cat}${p.addr ? '・' + p.addr : ''}・Demo 座標 (${p.x}, ${p.y})${l ? '・距目前位置 ' + fmt(Math.hypot(p.x - l.x, p.y - l.y)) : ''}・DEMO 資料`;
    $('dPark').innerHTML = (p.parking ? '資料標示此地點附近<b>有停車位</b>。' : '資料中沒有此地點的停車標示。') + ' <span class="muted">停車費率、空位數：資料包未提供。</span>';
    const near = A.Search.pois.filter(x => x.cat === '停車' && x.id !== p.id).map(x => Object.assign({}, x, { dist: Math.hypot(x.x - p.x, x.y - p.y) })).filter(x => x.dist <= 500).sort((a, b) => a.dist - b.dist).slice(0, 5);
    $('dNear').innerHTML = near.length ? near.map((x, i) => `<li><span><b>${esc(x.name)}</b> <span class="muted">距此 ${fmt(x.dist)}</span></span><button data-n="${i}">前往停車</button></li>`).join('') : '<li class="muted">500 m 內沒有停車場資料</li>';
    $('dNear').querySelectorAll('button').forEach(b => b.onclick = () => go(near[+b.dataset.n])); detailActions();
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('clrHist').onclick = () => P.clearHistory(); $('clrAll').onclick = () => { if (confirm('清除所有收藏、最近目的地、家與公司？')) P.clearAll(); };
    P.on(lists); lists();
    const id = new URLSearchParams(location.search).get('id'); if (id == null) return;
    const show = () => { const p = A.Search.get(+id); p ? detail(p) : say('找不到這個地點（資料包可能已更新）。'); };
    if (!S.get().offlinePackage && S.get().offlinePackageStatus === 'none') { setTimeout(() => { if (!A.Search.pois) say('尚未安裝離線資料包，無法顯示 POI 詳情。請先到下載中心。'); }, 800); }
    A.Search.whenLoaded(show);
  });
})();
