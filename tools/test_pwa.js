// PWA 更新策略與 Service Worker 單元測試（node tools/test_pwa.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function mk(opt = {}) {
  const st = { appUpdate: null, navigationStatus: 'idle' }, subs = [], reloads = [], logs = [], wl = {}, swl = {}, posted = [];
  const A = { Log: { info: m => logs.push(m), warn: m => logs.push('W:' + m), error: m => logs.push('E:' + m) }, Nav: { active: false }, State: { get: () => st, set(p) { const ch = Object.keys(p).filter(k => st[k] !== p[k]); Object.assign(st, p); subs.forEach(f => f(st, ch)); }, subscribe(f) { subs.push(f); } } };
  const mkWorker = state => ({ state, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, postMessage: m => posted.push(m) });
  const reg = { waiting: opt.waiting ? mkWorker('installed') : null, installing: null, updates: 0, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, async update() { this.updates++; if (opt.updateFails) throw new Error('net'); } };
  const swc = { controller: opt.noController ? null : {}, async register(url, o) { logs.push('reg:' + url + ':' + o.scope); return reg; }, addEventListener(t, f) { swl[t] = f; } };
  const doc = { hidden: false, body: null, addEventListener(t, f) { (wl['doc:' + t] = f); } };
  const nav = { userAgent: opt.ua || 'Chrome', onLine: opt.online !== false, serviceWorker: opt.noSW ? undefined : swc, standalone: opt.standalone };
  const win = { AIGPS: A, navigator: nav, document: doc, location: { protocol: opt.protocol || 'https:', reload: () => reloads.push(1) }, matchMedia: q => ({ matches: !!opt.standalone }), addEventListener: (t, f) => { wl[t] = f; } };
  vm.runInNewContext(fs.readFileSync('js/pwa.js', 'utf8'), { window: Object.assign(win, { }), setInterval: () => 1, Date, Promise });
  return { A, st, reg, swc, swl, wl, logs, posted, reloads, mkWorker, nav, P: A.PWA };
}
(async () => {
  // 註冊與更新偵測
  let t = mk(); await t.P.init(); assert(t.logs.includes('reg:sw.js:./') && t.reg.updates === 1, '註冊並在線時檢查更新'); assert(!t.st.appUpdate || !t.st.appUpdate.ready);
  t = mk({ waiting: true }); await t.P.init(); assert.strictEqual(t.st.appUpdate.ready, true, '已有等待中的新版 → 可更新');
  t = mk(); await t.P.init(); const w = t.mkWorker('installing'); t.reg.installing = w; t.reg.listeners.updatefound(); assert.strictEqual(t.st.appUpdate.downloading, true, '偵測到新版開始下載'); w.state = 'installed'; w.listeners.statechange(); assert(t.st.appUpdate.ready && !t.st.appUpdate.downloading, '下載完成 → 可更新');
  const w2 = t.mkWorker('installing'); t.reg.installing = w2; t.reg.listeners.updatefound(); w2.state = 'redundant'; w2.listeners.statechange(); assert.strictEqual(t.st.appUpdate.downloading, false, '新版安裝失敗（redundant）→ 結束下載狀態，舊版不受影響');
  t = mk({ noController: true }); await t.P.init(); const w3 = t.mkWorker('installing'); t.reg.installing = w3; t.reg.listeners.updatefound(); w3.state = 'installed'; w3.listeners.statechange(); assert.strictEqual(t.st.appUpdate.ready, false, '第一次安裝（沒有舊版）不算「有更新」');
  // 套用更新：導航中拒絕；controllerchange 只在使用者要求後重新載入
  t = mk({ waiting: true }); await t.P.init(); t.A.Nav.active = true; let r = t.P.apply(); assert(!r.ok && r.reason === 'NAVIGATING' && t.posted.length === 0, '導航中不套用更新'); t.swl.controllerchange(); assert.strictEqual(t.reloads.length, 0, '未要求更新時，controllerchange 不重新載入');
  t.A.Nav.active = false; r = t.P.apply(); assert(r.ok && JSON.stringify(t.posted) === '[{"type":"SKIP_WAITING"}]', '導航結束後才送出 SKIP_WAITING'); t.swl.controllerchange(); t.swl.controllerchange(); assert.strictEqual(t.reloads.length, 1, '只重新載入一次');
  t = mk(); await t.P.init(); assert.strictEqual(t.P.apply().reason, 'NONE', '沒有等待中的新版');
  // 檢查更新
  t = mk({ online: false }); await t.P.init(); assert.strictEqual(t.reg.updates, 0, '離線不檢查'); r = await t.P.check(); assert(!r.ok && r.reason === 'OFFLINE');
  t = mk({ updateFails: true }); await t.P.init(); r = await t.P.check(); assert(!r.ok && r.reason === 'ERROR', '檢查失敗不丟例外');
  t = mk(); await t.P.init(); r = await t.P.check(); assert(r.ok && t.st.appUpdate.checkedAt !== null);
  // 不支援／file:
  t = mk({ noSW: true }); await t.P.init(); assert(t.logs.some(l => /未啟用 Service Worker/.test(l))); assert.strictEqual((await t.P.check()).reason, 'NO_SW'); t = mk({ protocol: 'file:' }); await t.P.init(); assert(!t.logs.some(l => l.startsWith('reg:')), 'file: 不註冊');
  // 安裝提示
  t = mk(); assert.strictEqual(t.P.canInstall(), false); let prevented = 0, prompted = 0; t.wl.beforeinstallprompt({ preventDefault: () => prevented++, prompt: () => prompted++, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert(t.P.canInstall() && prevented === 1, '攔截安裝提示以便自行顯示'); r = await t.P.install(); assert(r.ok && r.outcome === 'accepted' && prompted === 1 && !t.P.canInstall(), '使用者按安裝後才跳系統提示'); assert.strictEqual((await t.P.install()).reason, 'UNAVAILABLE');
  t = mk(); t.wl.beforeinstallprompt({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) }); t.wl.appinstalled(); assert.strictEqual(t.P.canInstall(), false, '安裝完成後清除');
  assert(mk({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }).P.isIOS() && !mk({ ua: 'Mozilla/5.0 (iPhone)', standalone: true }).P.isIOS() && !mk().P.isIOS(), 'iOS 需提示「加入主畫面」；已安裝則不提示'); assert(mk({ standalone: true }).P.isStandalone());

  // ---- Service Worker 本身 ----
  const caches = new Map(), h = {}; let skipped = 0, claimed = 0;
  const swCtx = { self: { addEventListener: (t, f) => { h[t] = f; }, skipWaiting: () => skipped++, clients: { claim: async () => { claimed++; } } }, caches: { async open(n) { if (!caches.has(n)) caches.set(n, new Map()); const m = caches.get(n); return { async addAll(l) { l.forEach(u => m.set(u, 1)); } }; }, async keys() { return [...caches.keys()]; }, async delete(k) { return caches.delete(k); }, async match() { return undefined; } }, fetch: async () => ({}), location: { origin: 'http://x' }, URL, Promise };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), swCtx); caches.set('aigps-shell-0.0.1', new Map()); caches.set('other-app-cache', new Map());
  let p; await h.install({ waitUntil: x => { p = x; } }); await p; assert.strictEqual(skipped, 0, '安裝時不自動 skipWaiting（由使用者決定何時切換）'); assert(caches.has('aigps-shell-1.0.0'));
  h.message({ data: { type: 'SOMETHING' } }); h.message({ data: null }); assert.strictEqual(skipped, 0); h.message({ data: { type: 'SKIP_WAITING' } }); assert.strictEqual(skipped, 1, '收到 SKIP_WAITING 才切換');
  await h.activate({ waitUntil: x => { p = x; } }); await p; assert(!caches.has('aigps-shell-0.0.1') && caches.has('aigps-shell-1.0.0') && caches.has('other-app-cache'), '只刪除舊版 App Shell 快取，不動其他快取'); assert.strictEqual(claimed, 1);
  console.log('pwa tests PASS');
})().catch(e => { console.error('FAIL', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
