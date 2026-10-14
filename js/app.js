/* App 啟動、全域錯誤處理、共用狀態列、首頁開發面板 */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id);
  const SVC = { ONLINE: '線上', OFFLINE: '離線', DOWNLOADING: '下載中', UPDATING: '更新中', DEGRADED: '功能降級' };
  const PKG = { none: '尚未下載資料包', downloading: '資料包下載中', updating: '資料包更新中', ready: '離線導航就緒', limited: '資料不完整（部分功能不可用）', error: '資料包錯誤' };
  const PAGES = [['index.html', '首頁'], ['navigation.html', '導航'], ['search.html', '搜尋'], ['route.html', '路線'], ['poi.html', 'POI'], ['trip.html', '行程'], ['weather.html', '天氣'], ['downloads.html', '下載中心'], ['settings.html', '設定']];

  /* 診斷資訊：版本、狀態、最近 50 筆日誌；刻意不含位置、目的地或路線 */
  function diagnostics() {
    const s = S.get(), p = s.offlinePackage;
    return JSON.stringify({ app: A.VERSION, ua: navigator.userAgent, online: navigator.onLine, status: { network: s.networkStatus, package: s.offlinePackageStatus, service: s.dataServiceStatus, navigation: s.navigationStatus }, package: p ? { id: p.id, version: p.version } : null, logs: A.Log.all().slice(-50).map(l => `${l.t} ${l.level} ${l.msg}`) }, null, 1);
  }
  A.diagnostics = diagnostics; let lastErr = 0;
  function showError() {
    if (Date.now() - lastErr < 30000) return; lastErr = Date.now(); let b = document.getElementById('errBanner');
    if (!b) {
      b = document.createElement('div'); b.id = 'errBanner'; b.className = 'errbanner'; b.setAttribute('role', 'alert');
      b.innerHTML = '<span>發生非預期的錯誤，已記錄。導航核心通常不受影響；若畫面異常請重新整理。</span><span class="btns" style="margin:0"><button data-a="copy">複製診斷資訊</button><button data-a="reload">重新整理</button><button data-a="close" aria-label="關閉錯誤提示">×</button></span>';
      b.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (a === 'close') b.hidden = true; if (a === 'reload') location.reload(); if (a === 'copy') { const t = diagnostics(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { e.target.textContent = '已複製'; }, () => { e.target.textContent = '無法複製'; }); } });
      document.body.appendChild(b);
    }
    b.hidden = false;
  }
  window.addEventListener('error', e => { A.Log.error('未捕捉錯誤', e.message); showError(); });
  window.addEventListener('unhandledrejection', e => { A.Log.error('未處理的 Promise 錯誤', String(e.reason)); showError(); });
  window.addEventListener('online', () => S.set({ networkStatus: 'online' }));
  window.addEventListener('offline', () => S.set({ networkStatus: 'offline' }));

  function renderBar() {
    const bar = $('statusbar'); if (!bar) return;
    const here = location.pathname.split('/').pop() || 'index.html';
    bar.innerHTML = '<span class="brand">AI GPS</span><nav aria-label="主選單">' +
      PAGES.map(([h, n]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${n}</a>`).join('') +
      '</nav><span id="svc" class="badge" role="status" aria-live="polite"></span><button id="themeBtn" aria-label="主題：切換日夜模式">主題</button>';
    $('themeBtn').onclick = () => A.Theme.cycle();
    const setHdr = () => document.documentElement.style.setProperty('--hdr', bar.offsetHeight + 'px'); setHdr();   // 頁首實際高度（窄螢幕會換行），地圖區據此計算高度
    if (window.ResizeObserver) new ResizeObserver(setHdr).observe(bar); else window.addEventListener('resize', setHdr);
  }
  function paint(s) {
    const b = $('svc'); if (b) { b.className = 'badge ' + s.dataServiceStatus; b.textContent = SVC[s.dataServiceStatus]; }
    const nb = $('navSvc'); if (nb) { nb.className = 'badge navsvc ' + s.dataServiceStatus; nb.textContent = SVC[s.dataServiceStatus]; }
    const p = $('pkg'); if (p) p.textContent = PKG[s.offlinePackageStatus];
    const n = $('net'); if (n) n.textContent = s.networkStatus === 'online' ? '有網路' : '無網路（即時交通／即時天氣不可用）';
    const j = $('stateDump'); if (j) j.textContent = JSON.stringify(s, null, 1);
  }
  function devPanel() {
    if (!$('dev')) return;
    $('ver').textContent = 'v' + A.VERSION.app + (A.VERSION.build && A.VERSION.build !== 'dev' ? '（build ' + A.VERSION.build + '）' : '（開發版）');
    const sim = (id, patch, msg) => { $(id).onclick = () => { S.set(patch); A.Log.info('[開發模擬] ' + msg); }; };
    sim('simOffline', { networkStatus: 'offline' }, '模擬斷網'); sim('simOnline', { networkStatus: 'online' }, '模擬連線');
    sim('simDl', { offlinePackageStatus: 'downloading' }, '模擬下載中'); sim('simUp', { offlinePackageStatus: 'updating' }, '模擬更新中');
    sim('simBad', { offlinePackageStatus: 'error' }, '模擬資料包損壞'); sim('simReady', { offlinePackageStatus: 'ready' }, '模擬資料包就緒（僅測試狀態機）');
    $('simReset').onclick = () => { S.reset(); A.Log.info('狀態已重設'); };
    $('providers').innerHTML = A.Providers.list().map(p => `<li>${p.kind}：${p.name || '未註冊'}${p.isDemo ? '<span class="demo-tag">DEMO</span>' : ''}</li>`).join('');
    const logEl = $('log'), line = e => { const d = document.createElement('div'); d.className = 'lvl-' + e.level; d.textContent = `${e.t} ${e.level} ${e.msg}${e.extra ? ' ' + e.extra : ''}`; logEl.prepend(d); };
    A.Log.all().forEach(line); A.Log.subscribe(line);
    $('provTest').onclick = async () => A.Log.info('Provider 測試', JSON.stringify(await A.Providers.get('routing').calculate()));
  }
  document.addEventListener('DOMContentLoaded', () => {
    try { A.Theme.init(); renderBar(); S.subscribe(paint); paint(S.get()); devPanel(); A.Log.info('App 啟動完成', 'Batch ' + A.VERSION.batch); }
    catch (e) { A.Log.error('啟動失敗', String(e)); document.body.insertAdjacentHTML('afterbegin', '<p style="padding:12px;background:#c53030;color:#fff">啟動失敗：' + String(e) + '</p>'); }
  });
})();
