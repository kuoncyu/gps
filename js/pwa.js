/* PWA（Batch 16）：Service Worker 註冊、App 更新策略、安裝提示。
   更新策略：新版 Service Worker 在背景完整下載到新快取（任一檔案失敗就整體放棄，舊版離線版本不受影響）；
   下載完成後只提示，由使用者按「立即更新」才切換；導航進行中不允許切換，避免中斷導航。 */
(function () {
  const A = window.AIGPS, S = A.State, CHECK_MS = 60 * 60 * 1000;
  let reg = null, deferred = null, applying = false, reloading = false, dismissed = false; const subs = new Set();
  const nav = () => window.navigator || {}, sw = () => nav().serviceWorker;
  const setUpdate = p => S.set({ appUpdate: Object.assign({ ready: false, downloading: false, checkedAt: null }, S.get().appUpdate, p) });
  const standalone = () => { try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav().standalone === true; } catch (_) { return false; } };
  const isIOS = () => /iphone|ipad|ipod/i.test(nav().userAgent || '') && !standalone();
  const emit = () => subs.forEach(f => { try { f(); } catch (_) {} });

  function watch(r) {
    reg = r; if (r.waiting && sw().controller) setUpdate({ ready: true });
    r.addEventListener('updatefound', () => {
      const w = r.installing; if (!w) return; setUpdate({ downloading: true });
      w.addEventListener('statechange', () => { if (w.state === 'installed') setUpdate({ downloading: false, ready: !!sw().controller }); else if (w.state === 'redundant') setUpdate({ downloading: false }); });
    });
  }
  async function check() {
    if (!reg) return { ok: false, reason: 'NO_SW', message: '未啟用 Service Worker（需透過 HTTPS 或 localhost）' }; if (nav().onLine === false) return { ok: false, reason: 'OFFLINE', message: '目前沒有網路，無法檢查更新' };
    try { await reg.update(); setUpdate({ checkedAt: Date.now() }); return { ok: true, ready: !!(S.get().appUpdate && S.get().appUpdate.ready) }; } catch (e) { return { ok: false, reason: 'ERROR', message: String(e && e.message || e) }; }
  }
  function apply() {
    if (A.Nav && A.Nav.active) return { ok: false, reason: 'NAVIGATING', message: '導航進行中不更新，導航結束後再更新' };
    if (!reg || !reg.waiting) return { ok: false, reason: 'NONE', message: '目前沒有可套用的更新' };
    applying = true; reg.waiting.postMessage({ type: 'SKIP_WAITING' }); return { ok: true };
  }
  async function install() { if (!deferred) return { ok: false, reason: 'UNAVAILABLE' }; const d = deferred; deferred = null; emit(); d.prompt(); const c = await d.userChoice; return { ok: true, outcome: c.outcome }; }

  function banner() {   // 更新橫幅：導航中不顯示按鈕可用狀態，避免干擾導航
    const u = S.get().appUpdate, doc = window.document; if (!doc || !doc.body) return; let b = doc.getElementById('updBanner');
    if (!u || !u.ready || dismissed) { if (b) b.hidden = true; return; }
    if (!b) {
      b = doc.createElement('div'); b.id = 'updBanner'; b.className = 'errbanner updbanner'; b.setAttribute('role', 'status');
      b.innerHTML = '<span id="updText"></span><span class="btns" style="margin:0"><button class="primary" data-a="apply">立即更新</button><button data-a="later">稍後</button></span>';
      b.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (a === 'later') { dismissed = true; b.hidden = true; } if (a === 'apply') { const r = apply(); if (!r.ok) b.querySelector('#updText').textContent = r.message; } }); doc.body.appendChild(b);
    }
    const busy = !!(A.Nav && A.Nav.active); b.hidden = false; b.querySelector('#updText').textContent = busy ? '新版 App 已下載完成；導航結束後即可更新。' : '新版 App 已下載完成，按「立即更新」套用（會重新載入頁面）。'; b.querySelector('[data-a=apply]').disabled = busy;
  }
  async function init() {
    if (!sw() || (window.location && window.location.protocol === 'file:')) { A.Log.warn('未啟用 Service Worker（需透過 http://localhost 或 HTTPS 開啟）'); return; }
    try { const r = await sw().register('sw.js', { scope: './' }); A.Log.info('Service Worker 已註冊'); watch(r); if (nav().onLine !== false) check(); } catch (e) { A.Log.error('Service Worker 註冊失敗', String(e)); return; }
    sw().addEventListener('controllerchange', () => { if (!applying || reloading) return; reloading = true; window.location.reload(); });
    const doc = window.document; if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', () => { if (!doc.hidden) check(); }); setInterval(check, CHECK_MS);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; A.Log.info('App 已安裝'); emit(); });
  A.PWA = { check, apply, install, canInstall: () => !!deferred, isStandalone: standalone, isIOS, hasWorker: () => !!(sw() && sw().controller), on: f => subs.add(f), init, _banner: banner };
  S.subscribe((s, ch) => { if (ch.includes('appUpdate') || ch.includes('navigationStatus')) banner(); });
  if (window.document && window.document.addEventListener) window.document.addEventListener('DOMContentLoaded', init);
})();
