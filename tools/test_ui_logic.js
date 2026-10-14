// Batch 14 邏輯測試：行程紀錄、首頁版本判斷、版本資訊表、診斷資訊隱私、速限（node tools/test_ui_logic.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = o => JSON.parse(JSON.stringify(o));
function env(extra) {
  const store = {}, subs = [], clock = { t: 1e12 }, st = Object.assign({ navigationStatus: 'idle', tripData: { distance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0 }, destination: null, route: null, speed: 0, offlinePackage: null, offlinePackageStatus: 'none', networkStatus: 'online', dataServiceStatus: 'ONLINE' }, extra && extra.state);
  const logs = [], A = { Log: { info: (m) => logs.push(['info', m]), warn() {}, error: (m) => logs.push(['error', m]), all: () => logs.map((l, i) => ({ t: '00:00:0' + (i % 10), level: l[0], msg: l[1] })) }, VERSION: { app: '9.9.9', batch: 14, dataSchema: 1 },
    State: { get: () => st, set(p) { const ch = Object.keys(p).filter(k => st[k] !== p[k]); Object.assign(st, p); subs.forEach(f => f(st, ch)); }, subscribe(f) { subs.push(f); } } };
  const ctx = { window: { AIGPS: A, addEventListener() {} }, document: { addEventListener() {} }, navigator: { userAgent: 'TestUA', onLine: true }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, Date: Object.assign(function () { return new Date(...arguments); }, { now: () => clock.t }), Math, JSON };
  return { A, st, store, clock, ctx, set: p => A.State.set(p), run: f => vm.runInNewContext(fs.readFileSync(f, 'utf8'), ctx) };
}
// ---- 行程紀錄 ----
let e = env(); e.run('js/trip.js'); const T = e.A.Trip;
e.set({ destination: { name: '咖啡 0012, "旗艦店"', x: 1, y: 2, lat: 25.1, lng: 121.5 }, tripData: { distance: 2400, duration: 600, avgSpeed: 40, maxSpeed: 55 }, navigationStatus: 'navigating' }); e.set({ navigationStatus: 'arrived' });
let log = T.readLog(); assert(log.length === 1 && log[0].completed === true && log[0].distance === 2400 && log[0].dest.includes('旗艦店'), '抵達 → 記錄一筆（已抵達）');
assert.deepStrictEqual(Object.keys(log[0]).sort(), ['avg', 'completed', 'dest', 'distance', 'duration', 'max', 't', 'walk'], '紀錄只含摘要欄位，不含位置或軌跡'); assert(!JSON.stringify([log, e.store['aigps.tripLive']]).match(/lat|lng|"x"|"y"|121\.5/), '紀錄與即時快照都不含座標');
e.set({ navigationStatus: 'idle' }); assert.strictEqual(T.readLog().length, 1, '抵達後再回到 idle 不會重複記錄');
e = env(); e.run('js/trip.js'); e.set({ navigationStatus: 'navigating', tripData: { distance: 60, duration: 30, avgSpeed: 7, maxSpeed: 9 } }); e.set({ navigationStatus: 'arrived' }); assert.strictEqual(e.A.Trip.readLog().length, 0, '少於 100 m 的行程不記錄');
e = env(); e.run('js/trip.js'); e.set({ navigationStatus: 'navigating', tripData: { distance: 800, duration: 120, avgSpeed: 24, maxSpeed: 50 } }); e.set({ navigationStatus: 'idle' }); log = e.A.Trip.readLog(); assert(log.length === 1 && log[0].completed === false, '中途結束 → 記錄為未完成');
e = env(); e.run('js/trip.js'); for (let i = 0; i < 60; i++) { e.set({ tripData: { distance: 1000 + i, duration: 1, avgSpeed: 1, maxSpeed: 1 }, navigationStatus: 'navigating' }); e.set({ navigationStatus: 'arrived' }); e.set({ navigationStatus: 'idle' }); }
log = e.A.Trip.readLog(); assert(log.length === 50 && log[0].distance === 1059, '最多 50 筆，最新在前');
const csv = e.A.Trip.toCsv([{ t: 0, dest: '甲,乙 "丙"', distance: 1, duration: 2, avg: 3, max: 4, walk: true, completed: false }]).split('\n'); assert.strictEqual(csv.length, 2); assert(csv[1].includes('"甲,乙 ""丙"""') && csv[1].endsWith(',步行,否'), 'CSV 正確跳脫逗號與引號');
e.A.Trip.clearLog(); assert(!e.store['aigps.tripLog'] && !e.store['aigps.tripLive'] && e.A.Trip.readLog().length === 0, '清除');
// 即時快照節流與跨頁讀取
e = env(); e.run('js/trip.js'); e.set({ navigationStatus: 'navigating' }); const t0 = JSON.parse(e.store['aigps.tripLive']).t; e.clock.t += 500; e.set({ tripData: { distance: 10, duration: 1, avgSpeed: 1, maxSpeed: 1 } }); assert.strictEqual(JSON.parse(e.store['aigps.tripLive']).t, t0, '2 秒內不重複寫入');
e.clock.t += 2500; e.set({ tripData: { distance: 20, duration: 3, avgSpeed: 1, maxSpeed: 1 } }); const live = e.A.Trip.readLive(); assert(JSON.parse(e.store['aigps.tripLive']).t > t0 && live.ageSec === 0, '超過 2 秒更新'); e.clock.t += 15000; assert.strictEqual(e.A.Trip.readLive().ageSec, 15, '可算出資料年齡以判斷導航頁是否仍在運作');
// ---- 首頁：最新版本 ----
e = env(); e.run('js/home.js'); const H = e.A.Home, idx = { packages: [{ id: 'P', versions: [{ version: '2026.11.01' }, { version: '2026.11.15' }, { version: '2026.11.99', testOnly: 'corrupt' }] }] };
assert.strictEqual(H.latestVersion(idx, 'P'), '2026.11.15', '不把測試用損壞版當成最新版'); assert.strictEqual(H.latestVersion(idx, 'X'), null); assert.strictEqual(H.latestVersion({ packages: [] }, 'P'), null); assert.strictEqual(H.latestVersion(null, 'P'), null); assert('2026.11.15' > '2026.11.01' && '2026.12.01' > '2026.11.99', '版本字串可直接比較');
// ---- 設定：版本資訊 ----
e = env(); e.run('js/settings-page.js'); const rows = (s, m) => Object.fromEntries(e.A.SettingsPage.versionRows(s, m, e.A.VERSION));
let r = rows({ offlinePackage: null }, null); assert(r['App 版本'] === '9.9.9' && r['資料格式（schema）'] === 'v1' && r['離線資料包'] === '尚未安裝' && r['駕駛警示資料'] === '尚未載入' && r['相容性'] === '—');
r = rows({ offlinePackage: { id: 'TW-DEMO', version: '2026.11.15' } }, { version: '2026.11-demo', updatedAt: '2026-11-01T00:00:00Z', trust: 'ok' }); assert(r['路由資料'] === 'TW-DEMO v2026.11.15' && r['POI 資料'] === 'TW-DEMO v2026.11.15' && /2026-11-01/.test(r['駕駛警示資料']) && /正常/.test(r['駕駛警示資料']) && r['相容性'] === '相容');
r = rows({ offlinePackage: { id: 'TW-DEMO', version: '2027.01.01', incompatible: true, schema: 2 } }, { version: 'v', updatedAt: null, trust: 'unknown' }); assert(/不相容/.test(r['離線資料包']) && /格式 v2/.test(r['離線資料包']) && /請到下載中心安裝新版資料包/.test(r['相容性']), '不相容時清楚提示並指出更新路徑'); assert(/來源不明/.test(r['駕駛警示資料']));
// ---- 診斷資訊：不含位置／目的地／路線 ----
e = env({ state: { currentLocation: { lat: 25.0123456, lng: 121.5987654, x: -800, y: -800 }, destination: { name: '秘密地點ABC', x: 5, y: 5 }, route: { points: [[1, 2], [3, 4]] }, offlinePackage: { id: 'TW-DEMO', version: '2026.11.15' }, offlinePackageStatus: 'ready' } }); e.run('js/app.js');
e.A.Log.error('測試錯誤'); const d = e.A.diagnostics(), dj = JSON.parse(d); assert(dj.app.app === '9.9.9' && dj.status.package === 'ready' && dj.package.version === '2026.11.15' && dj.ua === 'TestUA' && dj.logs.length >= 1 && dj.logs.length <= 50);
assert(!/25\.0123456|121\.5987654|秘密地點ABC|points|currentLocation|destination/.test(d), '診斷資訊不含位置、目的地、路線');
// ---- 速限（使用資料包實際路網）----
const A2 = { Log: { info() {}, warn() {}, error() {} }, Providers: { register() {} }, Storage: {}, State: { get: () => ({}), subscribe() {} } };
vm.runInNewContext(fs.readFileSync('js/routing.js', 'utf8'), { window: { AIGPS: A2 }, document: { addEventListener() {} }, TextDecoder });
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json')), f = m.files.find(x => x.path === 'routing/graph.json');
const g = A2.Routing._build(JSON.parse(Buffer.concat(f.parts.map(p => fs.readFileSync(dir + p.path))).toString())), L = (x, y, h) => A2.Routing._limit(g, x, y, h);
assert.strictEqual(L(500, 0), 90, '高速公路 90'); assert.strictEqual(L(1000, -300), 30, '未鋪裝道路 30（路段中）'); assert.strictEqual(L(1000, -400, 0), 30, '路口：朝北行駛 → 取南北向的未鋪裝道路'); assert.strictEqual(L(1000, -400, 90), 60, '路口：朝東行駛 → 取東西向的主要道路'); assert.strictEqual(L(1000, -400, 180), 30, '反向行駛同一條路也適用'); assert.strictEqual(L(100, 100), null, '離道路超過 40 m 不猜測速限'); assert.strictEqual(L(-800, -500), 60, '主要道路 60'); assert.strictEqual(A2.Routing.limitAt(0, 0), null, '路網尚未載入時回傳 null');
console.log('ui logic tests PASS');
