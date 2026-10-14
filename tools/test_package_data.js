// 資料包內容與地址搜尋測試（node tools/test_package_data.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json'));
const read = path => JSON.parse(Buffer.concat(m.files.find(x => x.path === path).parts.map(p => fs.readFileSync(dir + p.path))).toString());
const poi = read('poi/poi.json').items, idx = read('search/index.json').items, cities = read('cities/cities.json').items;
assert(m.components.cities && m.demo === true && m.version === '2026.11.15');
const cats = new Set(poi.map(p => p.cat)); ['餐廳', '咖啡', '加油', '充電', '停車', '飯店', '醫院', '警察', '學校', '超商', '賣場', 'ATM', '景點', '車站', '機場', '休息站'].forEach(c => assert(cats.has(c), '含類別 ' + c));
assert(poi.every(p => /路 \d+ 號$/.test(p.addr)), '每個 POI 都有地址'); assert.strictEqual(cities.length, 6);
assert(idx.every((e, i) => e.k.includes(poi[i].addr.toLowerCase())), '搜尋索引包含地址');
const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { register() {} }, Storage: {}, State: { get: () => ({ currentLocation: { x: 0, y: 0 } }), subscribe() {} } };
vm.runInNewContext(fs.readFileSync('js/search.js', 'utf8'), { window: { AIGPS: A }, document: { addEventListener() {} }, TextDecoder }); A.Search._setData(poi);
(async () => {
  const target = poi.find(p => p.addr.startsWith('中山路')); const num = target.addr.match(/(\d+) 號/)[1];
  let r = await A.Search.query('中山路 ' + num + ' 號'); assert(r.ok && r.results.some(x => x.id === target.id), '依地址搜尋'); assert(r.results.every(x => x.addr.startsWith('中山路')), '地址搜尋只回傳符合的路名');
  r = await A.Search.query('ATM'); assert(r.results.length > 0 && r.results.every(p => p.cat === 'ATM'), '新類別 ATM'); r = await A.Search.query('休息站'); assert(r.results.length > 0 && r.results.every(p => p.cat === '休息站'));
  r = await A.Search.query('機場'); assert(r.results.every(p => p.cat === '機場')); r = await A.Search.query('提款機'); assert(r.results.every(p => p.cat === 'ATM'), '類別同義詞');
  console.log('package data tests PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
