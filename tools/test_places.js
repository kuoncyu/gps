// 我的地點＋沿途搜尋單元測試（node tools/test_places.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const store = {}, st = { destination: null, route: { points: [[0, 0]] }, waypoints: [], alternativeRoutes: [], currentLocation: null, offlinePackage: null, offlinePackageStatus: 'none' }, subs = [];
const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { register() {} }, Storage: {},
  State: { get: () => st, set(p) { const ch = Object.keys(p).filter(k => st[k] !== p[k]); Object.assign(st, p); subs.forEach(f => f(st, ch)); }, subscribe(f) { subs.push(f); } } };
const ctx = { window: { AIGPS: A }, document: { addEventListener() {} }, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, Date, Math, TextDecoder };
vm.runInNewContext(fs.readFileSync('js/search.js', 'utf8'), ctx); vm.runInNewContext(fs.readFileSync('js/places.js', 'utf8'), ctx);
const P = A.Places, poi = (id, name, x, y) => ({ id, name, cat: '咖啡', x, y });
const a = poi(1, 'A 咖啡', 10, 10), b = poi(2, 'B 咖啡', 20, 20);
assert.strictEqual(P.toggleFav(a), true); assert(P.isFav(a)); assert.strictEqual(P.toggleFav(a), false); assert(!P.isFav(a), '收藏切換');
P.toggleFav(a); P.toggleFav(b); assert.strictEqual(P.get().fav[0].name, 'B 咖啡', '最新收藏在最前');
P.setHome(a); P.setWork(b); assert(P.get().home.name === 'A 咖啡' && P.get().work.name === 'B 咖啡'); P.clearHome(); assert.strictEqual(P.get().home, null);
P.setDestination(a); assert(st.destination.name === 'A 咖啡' && st.route === null, '設定目的地會清除舊路線');
assert.strictEqual(P.get().hist.length, 1, '設定目的地自動記入最近目的地');
P.setDestination(b); P.setDestination(a); assert(P.get().hist.length === 2 && P.get().hist[0].name === 'A 咖啡', '最近目的地去重並置頂');
for (let i = 0; i < 30; i++) P.record(poi(100 + i, 'X' + i, i, i)); assert.strictEqual(P.get().hist.length, 20, '最多 20 筆');
assert.strictEqual(P.addWaypoint(a).ok, true); P.addWaypoint(b); P.addWaypoint(poi(3, 'C', 1, 1)); assert.strictEqual(P.addWaypoint(poi(4, 'D', 2, 2)).ok, false, '途經點上限 3');
const saved = JSON.parse(store['aigps.places']); assert(saved.fav.length === 2 && saved.hist.length === 20, '已寫入 localStorage');
P.clearHistory(); assert.strictEqual(P.get().hist.length, 0); P.clearAll(); assert(!P.get().fav.length && !P.get().work, '清除全部');
// 沿途搜尋
const S = A.Search; S._setData([poi(1, '近路線 咖啡', 20, 300), poi(2, '遠離 咖啡', 500, 300), poi(3, '起點旁 咖啡', -30, 50), poi(4, '終點旁 咖啡', 10, 950)]);

(async () => {
  let r = await S.query('咖啡', { routePts: [[0, 0], [0, 1000]], routeMax: 200 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.results.map(x => x.id))), [3, 1, 4], '只含路線兩側、依路線順序排列');
  assert(r.results.every(x => x.routeDist <= 200) && r.results[1].routeDist === 20 && r.results[1].along === 300, '距路線與沿路線位置');
  r = await S.query('咖啡', { routePts: [[0, 0], [0, 1000]], routeMax: 25 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(r.results.map(x => x.id))), [1, 4], '收窄範圍');
  r = await S.query('咖啡'); assert.strictEqual(r.results.length, 4, '未啟用沿途搜尋時行為不變');
  let called = 0; S.whenLoaded(() => called++); assert.strictEqual(called, 1, '資料已載入時 whenLoaded 立即執行'); assert.strictEqual(S.get(2).name, '遠離 咖啡');
  console.log('places tests PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
