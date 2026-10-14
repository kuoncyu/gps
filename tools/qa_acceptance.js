// 規格 §28 測試驗收總表（17 項）自動化：node tools/qa_acceptance.js
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const { makeEnv, readyEnv, ROOT } = require('./qa_env');
const results = [], J = o => JSON.parse(JSON.stringify(o));
const scenario = (id, name, fn) => results.push({ id, name, fn });
const nowReady = env => env.S.get().offlinePackageStatus === 'ready';

// 1 完全斷網啟動
scenario(1, '完全斷網啟動', async () => {
  const online = await readyEnv(); const off = await makeEnv({ idb: online.idb, ls: online.ls, offline: true });   // 同一份儲存、斷網重開
  assert(nowReady(off) && off.A.Search.pois && off.A.Routing.ready() && off.S.get().dataServiceStatus === 'OFFLINE', '資料包從本機載入並就緒'); assert.strictEqual(off.fetchLog.length, 0, '啟動過程完全不需要網路');
  // Service Worker：App Shell 快取、離線回應、資料包不進快取
  const swCode = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), caches = new Map(), handlers = {}; let offline = false;
  const shell = [...swCode.match(/\bSHELL\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
  const fakeFetch = async u => { if (offline) throw new TypeError('offline'); const p = path.join(ROOT, u === './' ? 'index.html' : u); if (!fs.existsSync(p)) throw new Error('404 ' + u); return { url: u, ok: true, body: fs.readFileSync(p, 'utf8').length }; };
  const cacheApi = { async open(name) { if (!caches.has(name)) caches.set(name, new Map()); const m = caches.get(name); return { async addAll(list) { for (const u of list) m.set(u.replace(/^\.\//, ''), await fakeFetch(u)); } }; }, async keys() { return [...caches.keys()]; }, async delete(k) { return caches.delete(k); },
    async match(req) { const u = (typeof req === 'string' ? req : new URL(req.url).pathname).replace(/^\//, ''); for (const m of caches.values()) if (m.has(u)) return m.get(u); } };
  vm.runInNewContext(swCode, { self: { addEventListener: (t, f) => { handlers[t] = f; } }, caches: cacheApi, fetch: async u => fakeFetch(typeof u === 'string' ? u : u.url), location: { origin: 'http://localhost' }, URL, Promise });
  caches.set('aigps-shell-0.0.1', new Map()); let waited; await handlers.install({ waitUntil: p => { waited = p; } }); await waited; await handlers.activate({ waitUntil: p => { waited = p; } }); await waited;
  assert(!caches.has('aigps-shell-0.0.1') && caches.size === 1, '啟用新版時清掉舊快取、保留新快取'); const cached = [...caches.values()][0]; shell.filter(f => f !== './').forEach(f => assert(cached.has(f), 'App Shell 已快取：' + f));
  offline = true; const respond = async url => { let out; const ev = { request: { method: 'GET', url: 'http://localhost/' + url }, respondWith: p => { out = p; } }; handlers.fetch(ev); return out ? await out : 'PASSTHROUGH'; };
  for (const f of ['index.html', 'navigation.html', 'js/app.js', 'css/main.css', 'settings.html']) assert((await respond(f)).url !== undefined, '斷網仍可回應 ' + f);
  assert.strictEqual(await respond('packages/TW-DEMO/2026.11.15/manifest.json'), 'PASSTHROUGH', '資料包不經 Service Worker 快取（由 IndexedDB 管理）'); assert((await respond('not-cached.html')).url === 'index.html', '快取沒有的頁面退回首頁');
});
// 2 離線搜尋
scenario(2, '離線搜尋', async () => {
  const on = await readyEnv(), off = await makeEnv({ idb: on.idb, ls: on.ls, offline: true }), S = off.A.Search;
  let r = await S.query('咖啡'); assert(r.ok && r.results.length > 0 && r.results.every(p => p.cat === '咖啡'), '類別搜尋'); const t = off.A.Search.pois.find(p => p.addr.startsWith('中山路'));
  r = await S.query(t.addr); assert(r.results.some(p => p.id === t.id) && r.results[0].addr === t.addr, '地址搜尋'); r = await S.query('加油', { radius: 800 }); assert(r.results.every(p => p.dist <= 800));
  r = await S.nearby('停車', 2000, 5); assert(r.ok && r.results.length > 0 && r.results.every((p, i, a) => !i || a[i - 1].dist <= p.dist), '附近搜尋依距離排序'); assert.strictEqual(off.fetchLog.length, 0);
});
// 3 離線導航
scenario(3, '離線導航（選擇 POI 開始導航，路線可計算）', async () => {
  const on = await readyEnv(), env = await makeEnv({ idb: on.idb, ls: on.ls, offline: true }), dest = env.pickDest(); const r = await env.planTo(dest);
  assert(r.ok && env.S.get().route && env.S.get().route.points.length > 3 && env.S.get().route.distance > 1000 && env.S.get().alternativeRoutes.length >= 1, '路線與替代路線'); assert.strictEqual(env.fetchLog.length, 0, '路線計算不需要網路');
  const hw = await env.A.Providers.get('routing').calculate({ avoidToll: true, mode: 'shortest' }); assert(hw.ok, '避開條件與偏好');
});
// 4 Demo 移動
scenario(4, 'Demo 移動（車輛平滑）', async () => {
  const env = await readyEnv(), S = env.S; env.A.Gps.start(); const samples = []; S.subscribe((s, ch) => { if (ch.includes('currentLocation')) samples.push({ t: env.clock.t, x: s.currentLocation.x, y: s.currentLocation.y, v: s.speed, h: s.heading }); });
  await env.drive(() => env.clock.t - Date.UTC(2026, 10, 1, 8, 0, 0) >= 90000, 100); assert(samples.length > 500, '約每 0.1 秒一筆定位（' + samples.length + '）');
  const hd = (a, b) => Math.abs(((b - a + 540) % 360) - 180); let maxV = 0, maxH = 0, maxJump = 0, maxDt = 0;
  for (let i = 1; i < samples.length; i++) { const dt = (samples[i].t - samples[i - 1].t) / 1000; maxDt = Math.max(maxDt, dt);   // 依實際取樣間隔換算
    maxV = Math.max(maxV, Math.abs(samples[i].v - samples[i - 1].v) / dt); maxH = Math.max(maxH, hd(samples[i - 1].h, samples[i].h) / dt); maxJump = Math.max(maxJump, Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y) / dt); }
  assert(maxV <= 6 * 3.6 + 12, '加減速平順（最大 ' + maxV.toFixed(1) + ' km/h 每秒）'); assert(maxH <= 150 + 80, '轉向平順（最大 ' + maxH.toFixed(0) + '° 每秒）'); assert(maxJump <= 14.5, '位置連續、速度不超過巡航（最大 ' + maxJump.toFixed(1) + ' m/s）'); assert(Math.max(...samples.map(s => s.v)) <= 51, '不超過巡航速度');
});
// 5 Turn-by-Turn（含語音：不重疊、不重複）+ 15 抵達
async function navigateAll(env, hook) {
  const dest = env.pickDest(), plan = await env.planTo(dest); assert(plan.ok); const S = env.S, statuses = [], seq = [], trip = [];
  S.subscribe((s, ch) => { if (ch.includes('navigationStatus')) statuses.push(s.navigationStatus); if (ch.includes('currentInstruction') && s.currentInstruction) seq.push(s.currentInstruction.label); if (ch.includes('tripData')) trip.push(s.tripData.distance); });
  const r = env.A.Nav.start(); assert(r.ok); env.A.Gps.setFactor(4); let hooked = false;
  const ok = await env.drive(() => { if (!hooked && hook && env.clock.t - env.t0 >= hook.at * 1000) { hooked = true; hook.fn(); } return S.get().navigationStatus === 'arrived'; }, 1500);
  return { dest, ok, statuses, seq, trip };
}
scenario(5, 'Turn-by-Turn（轉彎前提示、語音不重疊不重複）', async () => {
  const env = await readyEnv(); env.t0 = env.clock.t; const { ok, seq } = await navigateAll(env); assert(ok, '抵達');
  const turns = seq.filter(x => /後.*(轉|靠)|現在/.test(x)); assert(turns.length >= 3, '沿途有轉彎提示（' + turns.length + '）');
  assert(env.spoken.includes('開始導航'), '開始導航語音'); assert(env.spoken.some(t => /^現在.*(轉|靠)/.test(t)) && env.spoken.some(t => /公尺後/.test(t)), '語音有距離提示與「現在轉彎」'); assert(env.spoken.every((x, i) => !i || x !== env.spoken[i - 1]), '語音不連續重複'); assert.strictEqual(env.overlap, 0, '語音沒有重疊播放');
  assert.strictEqual(env.spoken[env.spoken.length - 1], '您已抵達目的地');
});
scenario(15, '抵達（Arrival Screen）', async () => {
  const env = await readyEnv(); env.t0 = env.clock.t; const { ok, dest, statuses } = await navigateAll(env), s = env.S.get(); assert(ok && s.navigationStatus === 'arrived', '進入目的地範圍 → arrived'); assert.strictEqual(statuses.filter(x => x === 'arrived').length, 1, '只觸發一次');
  assert(!env.A.Gps.pose.running, '抵達後停止行駛'); assert(s.tripData.distance > 1000 && s.tripData.duration > 30 && s.tripData.maxSpeed > 20, '抵達摘要有行程數據'); assert(Math.hypot(s.currentLocation.x - dest.x, s.currentLocation.y - dest.y) < 60, '位置確實在目的地附近');
  const log = env.A.Trip.readLog(); assert(log.length === 1 && log[0].completed && log[0].dest === dest.name, '寫入行程紀錄'); env.A.Nav.finish(); assert(env.S.get().navigationStatus === 'idle' && env.S.get().route === null, '完成後清除路線');
});
// 6 偏航
scenario(6, '偏航（模擬偏離路線 → 重新規劃，行程數據不歸零）', async () => {
  const env = await readyEnv(); env.t0 = env.clock.t; const { ok, statuses, trip } = await navigateAll(env, { at: 40, fn: () => env.A.Gps.detour() });
  assert(statuses.includes('rerouting'), '偵測偏航並進入重新規劃'); assert(env.S.get().route.rerouted === true && env.S.get().route.label === '重新規劃', '套用新路線'); assert(ok, '重新規劃後仍抵達目的地');
  assert(trip.every((d, i) => !i || d >= trip[i - 1]), '行駛距離不因重新規劃而歸零'); assert(env.spoken.includes('偏離路線，正在重新規劃') && env.spoken.includes('已重新規劃路線'), '語音提示偏航與新路線'); assert.strictEqual(env.overlap, 0);
});
// 7 交通事件
scenario(7, '交通事件（注入事件 → 重新規劃／顯示替代路線）', async () => {
  const env = await readyEnv(); env.t0 = env.clock.t; let before; const { ok, statuses } = await navigateAll(env, { at: 30, fn: () => { before = env.S.get().route; const r = env.A.Traffic.injectAhead('closure', 300); assert(r.ok); } });
  assert(ok, '封閉事件後仍抵達'); const s = env.S.get(); assert(s.route !== before && s.route.label === '交通重新規劃', '前方封閉 → 自動改道'); assert(s.trafficEvents.some(e => e.source === 'simulated' && e.closed), '事件顯示於狀態');
  assert(!s.route.points.some((p, i) => i && s.trafficEvents.filter(e => e.closed).some(e => (p[0] === e.a[0] && p[1] === e.a[1] && s.route.points[i - 1][0] === e.b[0] && s.route.points[i - 1][1] === e.b[1]) || (p[0] === e.b[0] && p[1] === e.b[1] && s.route.points[i - 1][0] === e.a[0] && s.route.points[i - 1][1] === e.a[1]))), '新路線避開封閉路段');
  const env2 = await readyEnv(); await env2.planTo(env2.pickDest()); env2.A.Nav.start(); env2.A.Gps.setFactor(4); await env2.drive(() => env2.clock.t - env2.t0 > 1e18 || env2.S.get().currentInstruction, 60); env2.A.Traffic.injectAhead('congestion', 300);
  await env2.drive(() => env2.S.get().trafficOffer || env2.S.get().navigationStatus === 'arrived', 300); assert(env2.S.get().trafficOffer || env2.S.get().navigationStatus === 'arrived', '壅塞：有明顯更快的替代路線時提出比較，否則不打擾');
  if (env2.S.get().trafficOffer) { const o = env2.S.get().trafficOffer; assert(o.save >= 120 && o.altDuration < o.curDuration, '比較卡片資料合理'); await env2.A.Traffic.accept(); assert.strictEqual(env2.S.get().route.label, '交通重新規劃'); }
});
// 8 下載中斷
scenario(8, '下載中斷（可恢復或重試）', async () => {
  const env = await makeEnv(); env.A.PM.retry.tries = 1; env.A.PM.retry.delay = 0; let n = 0; env.fault = u => (/\.\d{3}$/.test(u) && ++n === 8 ? { throw: true } : null);
  let ev = await env.install('2026.11.15'); assert(env.last('error') && /網路/.test(env.last('error').message), '中途斷線 → 回報錯誤'); assert(env.S.get().offlinePackageStatus === 'none' && !env.A.PM.busy(), '狀態回到可重試');
  const staged = (await env.A.PM.pending())['TW-DEMO@2026.11.15']; assert(staged >= 6, '已下載的分片保留（' + staged + '）'); env.fault = null; env.fetchLog.length = 0; ev = await env.install('2026.11.15');
  const partFetches = env.fetchLog.filter(u => /\.\d{3}$/.test(u)).length; assert(nowReady(env) && env.last('done'), '重試後完成');
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/TW-DEMO/2026.11.15/manifest.json'))), all = m.files.reduce((a, f) => a + f.parts.length, 0); assert.strictEqual(partFetches, all - staged, '續傳只補下載缺少的分片（共 ' + all + '，已有 ' + staged + '）');
  const e2 = await makeEnv(); e2.A.PM.retry.delay = 0; let k = 0; e2.fault = u => (/\.\d{3}$/.test(u) && ++k === 5 ? { status: 503 } : null); await e2.install('2026.11.15'); assert(nowReady(e2) && e2.events.some(e => e.type === 'retry'), '暫時性錯誤（HTTP 503）自動重試後成功');
  const e3 = await makeEnv(); e3.A.PM.retry.delay = 0; let c = 0; e3.fault = u => (/\.\d{3}$/.test(u) && ++c === 3 ? (e3.A.PM.pause(), null) : null); await e3.install('2026.11.15'); assert(e3.last('paused') && e3.S.get().offlinePackageStatus === 'none', '暫停'); e3.fault = null; await e3.install('2026.11.15'); assert(nowReady(e3), '暫停後繼續完成');
});
// 9 資料損壞
scenario(9, '資料損壞（修改 hash／內容 → 拒絕啟用）', async () => {
  const env = await readyEnv('2026.11.01'); env.A.PM.retry.delay = 0; const keep = env.S.get().offlinePackage.version;
  await env.install('2026.11.99'); assert(env.last('error') && env.last('error').code === 'CORRUPT', '資料包 hash 不符 → 拒絕'); assert(nowReady(env) && env.S.get().offlinePackage.version === keep, '目前版本不受影響'); assert.strictEqual((await env.A.PM.pending())['TW-DEMO@2026.11.99'], undefined, '損壞的暫存已清除');
  env.fault = u => (/\.\d{3}$/.test(u) ? { tamper: true } : null); await env.install('2026.11.15'); assert(env.last('error').code === 'CORRUPT', '傳輸中內容被竄改 → 拒絕'); assert(env.S.get().offlinePackage.version === keep); env.fault = null;
  env.fault = u => (/manifest\.json$/.test(u) ? { mutate: b => JSON.stringify(Object.assign(JSON.parse(b.toString()), { schemaVersion: 2 })) } : null); await env.install('2026.11.15'); assert(env.last('error').code === 'INCOMPATIBLE' && /不相容/.test(env.last('error').message), '資料格式不相容 → 清楚提示'); env.fault = null;
});
// 10 版本更新 + 11 舊版回復
scenario(10, '版本更新（驗證後切換；更新期間仍可使用）', async () => {
  const env = await readyEnv('2026.11.01'); const N = env.A.Search.pois.length; let during = null, c = 0;
  env.fault = u => { if (/\.\d{3}$/.test(u) && ++c === 6) during = { status: env.S.get().offlinePackageStatus, svc: env.S.get().dataServiceStatus, pois: env.A.Search.pois && env.A.Search.pois.length, routing: env.A.Routing.ready(), version: env.S.get().offlinePackage && env.S.get().offlinePackage.version }; return null; };
  await env.install('2026.11.15'); assert.strictEqual(during.status, 'updating', '更新中狀態'); assert(during.svc === 'UPDATING' && during.version === '2026.11.01', '更新期間仍是舊版'); assert(during.pois === N && during.routing === true, '更新期間搜尋與路由仍可使用（不因更新而中斷）');
  assert(nowReady(env) && env.S.get().offlinePackage.version === '2026.11.15' && env.A.Search.pois.length > N, '驗證通過後切換到新版並重新載入資料');
});
scenario(11, '舊版回復（新版故障時仍可用舊版）', async () => {
  const env = await readyEnv('2026.11.01'); await env.install('2026.11.15'); assert(env.S.get().offlinePackage.version === '2026.11.15'); const keys = [...env.idb.stores.packages.keys()].sort(); assert.deepStrictEqual(keys, ['TW-DEMO@2026.11.01', 'TW-DEMO@2026.11.15'], '保留目前與上一版');
  const rec = env.idb.stores.packages.get('TW-DEMO@2026.11.15'); delete rec.files['routing/graph.json']; await env.A.OM.refresh(); assert(env.S.get().offlinePackageStatus === 'limited' && !env.S.get().offlinePackage.components.routing, '新版缺少必要元件 → 標示不完整');
  rec.files['maps/demo.json'][0] = rec.files['maps/demo.json'][0]; const v = await env.A.PM.verifyActive().catch(e => ({ ok: false, err: e.message })); assert(v.ok === false, '重新驗證能發現資料損壞');
  await env.A.PM.rollback(); await env.settle(6); assert(nowReady(env) && env.S.get().offlinePackage.version === '2026.11.01' && env.A.Routing.ready() && env.A.Search.pois.length > 0, '回復舊版後完整可用'); assert.strictEqual((await env.A.PM.verifyActive()).ok, true);
});
// 12 Storage 不足
scenario(12, 'Storage 不足（模擬 quota error → 清理選項）', async () => {
  const env = await readyEnv('2026.11.01'); env.quota = { usage: 999e6, quota: 1e9 }; await env.install('2026.11.15'); const e = env.last('error'); assert(e && e.code === 'QUOTA' && /儲存空間不足/.test(e.message) && /清理/.test(e.message), '提示空間不足並指出清理'); assert(nowReady(env) && env.S.get().offlinePackage.version === '2026.11.01', '舊版不受影響');
  await env.A.PM.removeAll(); await env.settle(6); assert(env.S.get().offlinePackageStatus === 'none', '使用者可清理（刪除全部）'); env.quota = { usage: 0, quota: 1e9 }; await env.install('2026.11.15'); assert(nowReady(env), '清理後可重新下載');
  const e2 = await readyEnv('2026.11.01'); e2.A.PM.sim.quota = true; await e2.install('2026.11.15'); assert(e2.last('error').code === 'QUOTA', '開發測試開關也可觸發');
  const e3 = await makeEnv(); e3.idb.failOn = (store, op) => store === 'packages' && op === 'put'; await e3.install('2026.11.15'); assert(e3.last('error') && e3.S.get().offlinePackageStatus === 'none', '寫入資料包時 IndexedDB 空間不足 → 優雅失敗'); assert.strictEqual(e3.idb.stores.meta.size, 0, '原子切換：失敗時不留下半套資料');
});
// 13 AI 離線命令 + 14 AI 上下文
scenario(13, 'AI 離線命令（斷網說「帶我回家」）', async () => {
  const on = await readyEnv(), home = on.A.Search.pois.find(p => p.cat === '飯店'); on.A.Places.setHome(home); const env = await makeEnv({ idb: on.idb, ls: on.ls, offline: true });
  const out = await env.A.Assistant.ask('帶我回家'); assert(out.intent === 'go_home' && env.S.get().destination.name === home.name, '本地 Intent Parser 設定目的地'); assert(env.S.get().route && /最快路線/.test(out.reply), '並規劃出路線'); assert.strictEqual(env.fetchLog.length, 0, '全程沒有網路請求');
  const o2 = await env.A.Assistant.ask('避開收費並且還有多久到'); assert(o2.intents.join() === 'avoid_option,eta_query');
});
scenario(14, 'AI 上下文（連續三輪搜尋）', async () => {
  const env = await readyEnv(), A = env.A; let o = await A.Assistant.ask('附近有咖啡廳'); assert(o.choices.length === 3, '第一輪'); const first = o.choices[0].label;
  o = await A.Assistant.ask('再多找幾個'); assert(o.choices.length === 3 && !o.choices.some(c => c.label === first), '第二輪沿用上一輪，接著列出後面的結果'); o = await A.Assistant.ask('第二個'); assert(env.S.get().destination && o.reply.includes(env.S.get().destination.name), '第三輪選到目前這頁的第二個');
  const o4 = await A.Assistant.ask('把它加入途經點'); assert(env.S.get().waypoints.length === 1 && env.S.get().waypoints[0].name === env.S.get().destination.name, '「它」指向最近選定的地點');
});
// 16 長途休息提醒
scenario(16, '長途（超過休息時間 → 休息提醒）', async () => {
  const env = await readyEnv(), notes = []; env.S.subscribe((s, ch) => { if (ch.includes('notice') && s.notice && s.notice.type === 'rest') notes.push({ t: env.clock.t, text: s.notice.text, dur: s.tripData.duration }); });
  env.A.Alerts.prefs.restSec = 30; env.A.Gps.start(); await env.drive(() => notes.length > 0, 120); assert(notes.length === 1 && notes[0].dur >= 30 && notes[0].dur < 35, '測試選項：30 秒後提醒一次'); await env.drive(() => false, 20); assert.strictEqual(notes.length, 1, '提醒後重新計時，不會連續狂響');
  const e2 = await readyEnv(), n2 = []; let dur = []; e2.S.subscribe((s, ch) => { if (ch.includes('notice') && s.notice && s.notice.type === 'rest') n2.push(s.tripData.duration); if (ch.includes('tripData')) dur.push(s.tripData.duration); });
  e2.A.Alerts.prefs.restSec = 7200; e2.A.Gps.start(); e2.A.Gps.setFactor(4); await e2.drive(() => n2.length > 0, 8000, 100); assert(n2.length === 1 && n2[0] >= 7200 && n2[0] < 7230, '預設連續行駛 2 小時後提醒（' + Math.round(n2[0]) + ' s）'); assert(/連續駕駛約 2\.0 小時/.test(e2.S.get().notice.text) && /前方服務/.test(e2.S.get().notice.text));
  assert(dur.every((d, i) => !i || d >= dur[i - 1] - 1e-6), '連續行駛時間在路線循環時不歸零');
});
// 17 完全離線的完整導航流程
scenario(17, '完全離線的完整導航流程（搜尋 → 路線 → 導航 → 偏航 → 抵達）', async () => {
  const on = await readyEnv(), env = await makeEnv({ idb: on.idb, ls: on.ls, offline: true }); env.t0 = env.clock.t; const r = await navigateAll(env, { at: 40, fn: () => env.A.Gps.detour() });
  assert(r.ok && r.statuses.includes('rerouting') && env.fetchLog.length === 0, '離線完成導航、偏航重算並抵達，沒有任何網路請求'); assert.strictEqual(env.overlap, 0);
});

// 18 隱私：行車位置不寫入本機儲存（行為測試，對正式版同樣有效）
scenario(18, '隱私（完整導航後，本機儲存不含行車位置）', async () => {
  const env = await readyEnv(); env.t0 = env.clock.t; const { ok, dest } = await navigateAll(env, { at: 30, fn: () => env.A.Gps.detour() }); assert(ok); env.A.Nav.finish(); await env.A.Assistant.ask('帶我去 ' + dest.name); await env.settle(4);
  const entries = [...env.ls.entries()]; assert(entries.length > 0 && entries.every(([k]) => k.startsWith('aigps.')), '所有鍵都有 aigps. 前綴：' + entries.map(e => e[0]));
  for (const [k, v] of entries) { assert(!/"lat"|"lng"|currentLocation|"heading"|"accuracy"/.test(v), k + ' 不得含即時定位欄位'); }
  const keys = entries.map(e => e[0]); assert(!keys.includes('aigps.location') && !keys.includes('aigps.currentLocation'), '沒有儲存即時位置'); const live = JSON.parse(env.ls.get('aigps.tripLive') || '{}'); assert(!('currentLocation' in live) && !/"x"|"y"/.test(JSON.stringify(live)), '即時行程快照不含座標');
  const idbText = JSON.stringify([...env.idb.stores.meta.entries()]); assert(!/lat|lng/.test(idbText), 'IndexedDB meta 不含位置');
});

(async () => {
  let pass = 0, fail = 0; const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  for (const s of results.sort((a, b) => a.id - b.id)) {
    if (only && !only.includes(s.id)) continue; const t = Date.now();
    try { await s.fn(); pass++; console.log(`PASS  ${String(s.id).padStart(2)}  ${s.name}  (${Date.now() - t} ms)`); } catch (e) { fail++; console.log(`FAIL  ${String(s.id).padStart(2)}  ${s.name}\n        ${String(e.message).split('\n')[0]}\n        ${(e.stack || '').split('\n').find(l => /qa_acceptance|js\//.test(l)) || ''}`); }
  }
  console.log(`\n驗收結果：${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
