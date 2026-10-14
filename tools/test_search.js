// 離線搜尋核心單元測試（node tools/test_search.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const A = { Log: { info() {}, warn() {}, error() {} }, State: { get: () => ({ currentLocation: { x: 0, y: 0 }, offlinePackage: null, offlinePackageStatus: 'none' }), subscribe() {} }, Storage: {}, Providers: { register() {} } };
vm.runInNewContext(fs.readFileSync('js/search.js', 'utf8'), { window: A && { AIGPS: A }, document: { addEventListener() {} }, TextDecoder });
const S = A.Search, cats = ['餐廳', '咖啡', '加油'];
(async () => {
  const none = await S.query('咖啡'); assert.strictEqual(none.ok, false); assert.strictEqual(none.reason, 'NO_PACKAGE');
  S._setData(Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Demo ${cats[i % 3]} ${String(i).padStart(4, '0')}`, cat: cats[i % 3], x: i * 50, y: 0, parking: i % 2 === 0 })));
  let r = await S.query('咖啡'); assert(r.results.length === 10 && r.results.every(p => p.cat === '咖啡'), '類別同義詞');
  assert(r.results.every((p, i, a) => !i || a[i - 1].dist <= p.dist), '距離排序');
  r = await S.query('餐 0012'); assert(r.results.length === 1 && r.results[0].id === 12, '多關鍵字');
  r = await S.query('', { cat: '加油', radius: 500 }); assert(r.results.every(p => p.cat === '加油' && p.dist <= 500), '類別＋範圍');
  r = await S.query('zzz'); assert(r.ok && r.results.length === 0, '無結果');
  r = await S.nearby('咖啡', 300); assert(r.results.every(p => p.dist <= 300), '附近');
  console.log('search tests PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
