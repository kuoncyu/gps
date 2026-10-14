// 離線路由單元測試（node tools/test_routing.js）— 使用 packages/ 內實際產生的路網
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const A = { Log: { info() {}, warn() {}, error() {} }, State: { get: () => ({}), subscribe() {} }, Storage: {}, Providers: { register() {} } };
vm.runInNewContext(fs.readFileSync('js/routing.js', 'utf8'), { window: { AIGPS: A }, document: { addEventListener() {} }, TextDecoder });
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json'));
const f = m.files.find(x => x.path === 'routing/graph.json'), g = A.Routing._build(JSON.parse(Buffer.concat(f.parts.map(p => fs.readFileSync(dir + p.path))).toString()));
const P = (x, y) => ({ x, y }), plan = (pts, o) => A.Routing._plan(g, pts, o);
const uses = (r, fn) => r.points.some((p, i) => i && fn(r.points[i - 1], p));
const onToll = (a, b) => a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) >= 0;
assert(g.hasAttrs, '路網含道路屬性');
let r = plan([P(-1000, 0), P(1000, 0)]); assert(r.ok); const fast = r.candidates[0];
assert.strictEqual(fast.label, '最快'); assert(fast.use.highway > 0 && fast.use.toll > 0, '最快走高速收費段');
r = plan([P(-1000, 0), P(1000, 0)], { avoidToll: true }); assert(!r.candidates[0].use.toll && r.candidates[0].duration > fast.duration, '避開收費：繞行、時間較長');
r = plan([P(-1000, 0), P(1000, 0)], { avoidHighway: true }); assert.strictEqual(r.candidates[0].use.highway, 0, '避開高速');
r = plan([P(-1000, 0), P(1000, 0)], { mode: 'shortest' }); assert.strictEqual(r.candidates[0].distance, 2000, '最短 = 2000 m');
r = plan([P(-1000, 0), P(0, 600), P(1000, 0)]); assert(r.candidates[0].distance > 2000 && uses(r.candidates[0], (a, b) => b[0] === 0 && b[1] === 600), '途經點必經');
r = plan([P(-1000, -1000), P(1000, -1000)], { avoidUnpaved: true }); assert.strictEqual(r.candidates[0].use.unpaved, 0, '避開未鋪裝');
r = plan([P(-1000, 0), P(1000, 0)], { avoidFerry: true }); assert(r.candidates[0].warnings.some(w => w.includes('渡輪')), '渡輪無資料需明示');
const around = [[[1000, 0], [800, 0]], [[1000, 0], [1000, 200]], [[1000, 0], [1000, -200]]];
r = plan([P(-1000, 0), P(1000, 0)], { avoidEdges: around }); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'NO_ROUTE', '自訂封鎖使終點不可達');
r = plan([P(-1000, 0), P(1000, 0)]); assert(r.candidates.length >= 2 && new Set(r.candidates.map(c => c.distance + ':' + c.duration)).size === r.candidates.length, '候選路線互不相同');
// 回歸：目的地在兩個路口之間時，沿路走到投影點再接駁，不可開過頭再迴轉
r = plan([P(-800, -800), P(-809, 934)]); const rp = r.candidates[0].points; assert.deepStrictEqual(JSON.parse(JSON.stringify(rp.slice(-3))), [[-800, 800], [-800, 934], [-809, 934]], '沿路到投影點再接駁');
assert(!rp.some(p => p[1] > 934 && p[0] === -800), '不會開過目的地所在位置'); assert.strictEqual(r.candidates[0].distance, 1743);
r = plan([P(-800, -800), P(-791, 66)]); assert.deepStrictEqual(JSON.parse(JSON.stringify(r.candidates[0].points.slice(-3))), [[-800, 0], [-800, 66], [-791, 66]], '目的地靠近路口時選較近的端點');
console.log('routing tests PASS');
