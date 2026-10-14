// 前方服務／城市／停車步行單元測試（node tools/test_upahead.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const store = {}, st = { destination: null, route: null, navigationStatus: 'idle', remainingDistance: null, waypoints: [] }, subs = [], calls = [];
const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; }, get(k) { return this.reg[k]; } }, Storage: {},
  State: { get: () => st, set(p) { const ch = Object.keys(p).filter(k => st[k] !== p[k]); Object.assign(st, p); subs.forEach(f => f(st, ch)); }, subscribe(f) { subs.push(f); } } };
const ctx = { window: { AIGPS: A }, document: { addEventListener() {} }, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }, Date, Math, TextDecoder };
vm.runInNewContext(fs.readFileSync('js/navigation.js', 'utf8'), ctx); vm.runInNewContext(fs.readFileSync('js/search.js', 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync('js/upahead.js', 'utf8'), ctx); vm.runInNewContext(fs.readFileSync('js/parking.js', 'utf8'), ctx);
const N = A.Nav, U = A.UpAhead, K = A.Parking, J = o => JSON.parse(JSON.stringify(o));
const route = [[0, 0], [0, 1000], [1000, 1000]], R = N._prepare(route);
const P = (id, name, cat, x, y) => ({ id, name, cat, x, y });
const items = [P(1, '近加油', '加油', 20, 300), P(2, '遠加油', '加油', 20, 900), P(3, '身後加油', '加油', 20, 100), P(4, '離路線', '加油', 500, 300), P(5, '轉角餐廳', '餐廳', 500, 1010), P(6, '電影院', '景點', 10, 500)];
let r = U._compute(R, N._locate, 200, items, { maxOff: 300 });
assert.deepStrictEqual(J(r.map(e => e.item.id)), [1, 6, 2, 5], '依前方距離排序、排除身後與離路線者'); assert.strictEqual(r[0].ahead, 100); assert(r.every(e => e.ahead >= 0 && e.off <= 300));
r = U._compute(R, N._locate, 200, items, { maxOff: 300, maxAhead: 500 }); assert.deepStrictEqual(J(r.map(e => e.item.id)), [1, 6], '超過最大前方距離者被排除');
r = U._compute(R, N._locate, 0, [P(9, '遠城', 'x', 900, 1300)], { maxOff: 2000 }); assert.strictEqual(r.length, 1, '城市以較寬的偏離範圍判斷');
// services/cities：需要路線與資料
assert.strictEqual(U.services().reason, 'NO_ROUTE'); st.route = { points: route, duration: 600, distance: 2000 }; assert.strictEqual(U.services().reason, 'NO_PACKAGE');
A.Search._setData(items); A.Search._setCities([{ id: 1, name: '示範城', x: 1000, y: 1200 }]); let s = U.services('加油'); assert(s.ok && s.navigating === false && s.results.map(x => x.name).join() === '身後加油,近加油,遠加油', '未導航：整條路線從起點計算，依距離排序'); assert.strictEqual(s.results[1].etaSec, Math.round(600 * 300 / 2000), '預估時間依路線比例換算');
s = U.services(); assert(s.results.every(x => U.SVC.includes(x.cat)), '預設只列服務類別（不含景點）'); s = U.cities(); assert(s.ok && s.results[0].name === '示範城' && s.results[0].ahead > 0, '前方城市');
// 停車建議與步行
const dest = { x: 0, y: 0, name: '目的地' }, pk = [P(1, '近停', '停車', 100, 50), P(2, '遠停', '停車', 200, 250), P(3, '很遠停', '停車', 900, 900), P(4, '加油站', '加油', 10, 10), P(5, '目的地自己', '停車', 0, 0)];
let sg = K.suggest(dest, pk, 3, 500); assert.deepStrictEqual(J(sg.map(x => x.id)), [1, 2], '步行距離排序、排除過遠與非停車場與目的地本身'); assert.strictEqual(sg[0].walk, 150); assert.strictEqual(sg[0].walkSec, Math.round(150 / 1.2), '步行時間以 1.2 m/s 估算');
assert.deepStrictEqual(J(K.walkInfo({ x: 0, y: 0 }, { x: 30, y: 40 })), { dist: 70, sec: 58 }, '格線街道以曼哈頓距離估算');
// 停車建議觸發條件
Object.defineProperty(A.Nav, 'active', { get: () => true }); A.Nav.stop = () => calls.push('stop'); A.Places = { setDestination: p => { st.destination = p; } };
st.destination = { x: 0, y: 0, name: '目的地', cat: '餐廳' }; A.Search._setData(pk);
st.navigationStatus = 'navigating'; st.remainingDistance = 2000; subs.forEach(f => f(st, ['remainingDistance'])); assert.strictEqual(st.parkingOffer, undefined, '距離 > 1.5 km 不提示');
st.remainingDistance = 1400; subs.forEach(f => f(st, ['remainingDistance'])); assert(st.parkingOffer && st.parkingOffer.list.length === 2, '距離 ≤ 1.5 km 提示停車');
K.dismiss(); assert.strictEqual(st.parkingOffer, null); subs.forEach(f => f(st, ['remainingDistance'])); assert.strictEqual(st.parkingOffer, null, '使用者拒絕後不再提示');
st.destination = { x: 5, y: 5, name: '停車場本身', cat: '停車' }; st.parkingOffer = undefined; subs.forEach(f => f(st, ['remainingDistance'])); assert(!st.parkingOffer, '目的地本身是停車場不提示');
// 步行目標只在抵達停車場時有效
store['aigps.walkTo'] = JSON.stringify({ orig: { name: '原目的地', x: 0, y: 0 }, park: { x: 100, y: 50, name: '近停' } });
st.destination = { x: 100, y: 50 }; assert(K.walkTarget() && K.walkTarget().orig.name === '原目的地'); st.destination = { x: 1, y: 1 }; assert.strictEqual(K.walkTarget(), null, '目的地不是該停車場時無效'); K.clearWalkTarget(); assert.strictEqual(store['aigps.walkTo'], undefined);
// 步行路由：使用資料包的實際路網
const rctx = { window: { AIGPS: A }, document: { addEventListener() {} }, TextDecoder }; vm.runInNewContext(fs.readFileSync('js/routing.js', 'utf8'), rctx);
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json')), f = m.files.find(x => x.path === 'routing/graph.json');
const g = A.Routing._build(JSON.parse(Buffer.concat(f.parts.map(p => fs.readFileSync(dir + p.path))).toString()));
const pts = [{ x: -1000, y: 0 }, { x: 1000, y: 0 }], drive = A.Routing._plan(g, pts, {}).candidates[0], walk = A.Routing._plan(g, pts, { walk: true });
assert(walk.ok && walk.candidates.length === 1 && walk.candidates[0].label === '步行', '步行只有一條路線'); assert.strictEqual(walk.candidates[0].use.highway, 0, '步行不走高速'); assert(drive.use.highway > 0);
assert.strictEqual(walk.candidates[0].duration, Math.round(walk.candidates[0].distance / 1.2), '步行時間 = 距離 ÷ 1.2 m/s'); assert(walk.candidates[0].duration > drive.duration * 5, '步行遠慢於開車');
console.log('upahead/parking tests PASS');
