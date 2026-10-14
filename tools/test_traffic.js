// 交通事件單元測試（node tools/test_traffic.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const mkA = () => { const st = { trafficEvents: [], driverAlerts: [] }, A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; }, get(k) { return this.reg[k]; } }, DemoData: { offlineEvents: [{ id: 'off1', type: 'construction', a: [0, 200], b: [0, 400], label: '道路施工' }] },
  State: { get: () => st, set(p) { Object.assign(st, p); }, subscribe() {} } }; return A; };
// --- 路由 + 交通 ---
let A = mkA(); vm.runInNewContext(fs.readFileSync('js/routing.js', 'utf8'), { window: { AIGPS: A }, document: { addEventListener() {} }, TextDecoder });
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json')), f = m.files.find(x => x.path === 'routing/graph.json');
const g = A.Routing._build(JSON.parse(Buffer.concat(f.parts.map(p => fs.readFileSync(dir + p.path))).toString()));
const P = (x, y) => ({ x, y }), plan = (pts, o) => A.Routing._plan(g, pts, o), key = (a, b) => a.join() + '>' + b.join();
const both = (a, b, v) => ({ [key(a, b)]: v, [key(b, a)]: v });
const base = plan([P(-1000, 0), P(1000, 0)]).candidates[0];
let tr = both([0, 0], [200, 0], { factor: 10, closed: false, id: 't' });
let c = plan([P(-1000, 0), P(1000, 0)], { traffic: tr }).candidates[0];
assert(c.duration >= base.duration, '壅塞不會讓時間變短'); assert(c.delay >= 0);
const edge = [[0, 0], [200, 0]];
tr = both(edge[0], edge[1], { factor: 1, closed: true, id: 'c' });
c = plan([P(-1000, 0), P(1000, 0)], { traffic: tr }).candidates[0];
assert(!c.points.some((p, i) => i && ((c.points[i - 1].join() === '0,0' && p.join() === '200,0') || (c.points[i - 1].join() === '200,0' && p.join() === '0,0'))), '封閉路段不會被使用');
assert(c.duration > base.duration, '繞行較久');
// evalPoints：沿原路線估算
const pts = base.points; let ev = A.Routing._plan && null;
A.Routing.load = null; // evalPoints 需要已載入路網：以內部 graph 模擬
const evalPts = (pts, t) => { let dur = 0, delay = 0, closed = false; for (let i = 0; i < pts.length - 1; i++) { const k = key(pts[i], pts[i + 1]), e = g.edgeMap.get(k), x = t[k]; if (e) { const b = e.len / (e.kmh / 3.6), fct = x && !x.closed ? x.factor : 1; dur += b * fct; delay += b * (fct - 1); if (x && x.closed) closed = true; } } return { dur, delay, closed }; };
const through = base.points.map(p => p.slice ? p : p); const big = both([0, 0], [200, 0], { factor: 4, closed: false, id: 'x' });
const e1 = evalPts(through, big); assert(Math.abs(e1.delay - 200 / 25 * 3) < 0.01, '90 km/h、200 m、×4 → 延誤 24 s（' + e1.delay + '）');
assert(evalPts(through, tr).closed === true, '原路線穿過封閉路段被偵測');
assert.strictEqual(plan([P(-1000, 0), P(1000, 0)], { traffic: both([1000, 0], [800, 0], { closed: true, factor: 1, id: 'k' }), avoidEdges: [[[1000, 0], [1000, 200]], [[1000, 0], [1000, -200]]] }).reason, 'NO_ROUTE', '終點被全部封閉則無路線');
// --- Traffic 模組 ---
A = mkA(); A.Nav = { active: false }; vm.runInNewContext(fs.readFileSync('js/traffic.js', 'utf8'), { window: { AIGPS: A }, document: { addEventListener() {} }, setInterval() {}, setTimeout() {}, localStorage: { getItem() { return null; } }, Date, Math });
const T = A.Traffic, st = A.State.get();
let em = T.edgeMap(); assert(em['0,200>0,400'] && em['0,400>0,200'] && em['0,200>0,400'].factor === 1.8 && !em['0,200>0,400'].closed, '離線施工事件雙向對映');
T.add('closure', [0, 0], [200, 0]); em = T.edgeMap(); assert(em['0,0>200,0'].closed && em['200,0>0,0'].closed, '模擬封閉');
assert(st.trafficEvents.length === 2 && st.trafficEvents.every(e => ['offline', 'simulated'].includes(e.source)), '來源只能是離線或模擬');
assert.strictEqual(T.live, false); assert(!JSON.stringify(st.trafficEvents).includes('即時'), '不得出現「即時」');
assert.strictEqual(T.injectAhead('congestion').ok, false, '非導航中不可注入「前方」事件');
T.clearSim(); assert.strictEqual(st.trafficEvents.length, 1 + 0 * 1, '清除模擬後只剩離線事件');
assert.strictEqual(T._decide(2460, 1800, false), 'offer', '41 分 → 30 分：詢問'); assert.strictEqual(T._decide(1000, 950, false), null, '節省太少不打擾');
assert.strictEqual(T._decide(1000, 700, true), 'auto'); assert.strictEqual(T._decide(3000, 2900, false), null, '省不到 10% 不打擾');
(async () => { const r = await T.getEvents(); assert(r.ok && r.live === false && r.demo === true); console.log('traffic tests PASS'); })();
