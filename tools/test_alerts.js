// 駕駛警示單元測試（node tools/test_alerts.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; } }, Storage: {}, State: { get: () => ({}), set() {}, subscribe() {} } };
const ctx = { window: { AIGPS: A }, document: { addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Date, Math, TextDecoder };
vm.runInNewContext(fs.readFileSync('js/navigation.js', 'utf8'), ctx); vm.runInNewContext(fs.readFileSync('js/alerts.js', 'utf8'), ctx);
const L = A.Alerts, N = A.Nav, R = N._prepare([[-800, -800], [-800, -200], [-200, -200], [-200, 400]]);
assert.strictEqual(A.Providers.reg.alerts.isDemo, true, 'Demo 資料必須標示');
const it = (id, type, x, y, heading) => ({ id, type, x, y, heading, kmh: 50 });
let r = L._onRoute(R, [it('b', 'schoolZone', -800, -400, 0), it('a', 'speedCamera', -800, -600, 0), it('opp', 'speedCamera', -800, -500, 180), it('far', 'speedCamera', 500, 500, 0), it('curve', 'sharpCurve', -500, -200, 90)], N._locate);
assert.deepStrictEqual(JSON.parse(JSON.stringify(r.map(e => e.item.id))), ['a', 'b', 'curve'], '依路線順序排序、排除逆向與路線外');
assert(Math.abs(r[0].along - 200) < 1 && Math.abs(r[2].along - 900) < 1);
assert.strictEqual(L._stage(600, 500), null); assert.strictEqual(L._stage(400, 500), 'warn'); assert.strictEqual(L._stage(150, 500), 'near'); assert.strictEqual(L._stage(30, 500), 'now'); assert.strictEqual(L._stage(-10, 500), 'now'); assert.strictEqual(L._stage(-30, 500), null, '通過後消失');
const ahead = L._ahead([it('f', 'speedCamera', 0, 300, 0), it('side', 'speedCamera', 300, 0, 0), it('back', 'speedCamera', 0, -300, 0), it('opp', 'speedCamera', 0, 200, 180), it('far', 'speedCamera', 0, 900, 0)], 0, 0, 0, 500);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ahead.map(e => e.item.id))), ['f'], '未導航：只取車頭前方、同向、距離內');
assert.strictEqual(L._ahead([it('e', 'speedCamera', 300, 0, 90)], 0, 0, 90, 500).length, 1, '朝東行駛可偵測東方警示');
assert(L.TYPES.speedCamera.warn > L.TYPES.schoolZone.warn, '測速提前提醒距離較長');
// 資料包內容
const dir = 'packages/TW-DEMO/2026.11.15/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json')), f = m.files.find(x => x.path === 'alerts/alerts.json');
const d = JSON.parse(Buffer.concat(f.parts.map(p => fs.readFileSync(dir + p.path))).toString());
assert(d.demo === true && d.items.length >= 20 && d.items.every(x => L.TYPES[x.type] && x.id && x.demo), '資料包警示格式與 Demo 標示');
assert(d.version && d.updatedAt && d.source, '警示資料帶版本、更新時間、來源'); assert(['railCrossing', 'speedLimitDrop'].every(t => d.items.some(x => x.type === t)), '含鐵路平交道與速限降低');
assert.strictEqual(L._trust({ source: 'x', updatedAt: new Date().toISOString() }, Date.now()), 'ok');
L._setItems(d.items); const demoRoute = N._prepare([[-800, -800], [-800, -200], [-200, -200], [-200, 400], [600, 400], [600, 800]]);
const onDemo = L._onRoute(demoRoute, d.items, N._locate).filter(e => /^a00[1-7]$/.test(e.item.id)); assert.strictEqual(onDemo.length, 7, '預設 Demo 路線上有 7 筆固定警示');
// 資料信任與休息提醒
const NOW = Date.UTC(2026, 10, 1), DAYMS = 86400000, iso = d => new Date(NOW - d * DAYMS).toISOString();
assert.strictEqual(L._trust(null, NOW), 'unknown'); assert.strictEqual(L._trust({ updatedAt: iso(1) }, NOW), 'unknown', '缺來源 → 不明'); assert.strictEqual(L._trust({ source: 's' }, NOW), 'unknown', '缺更新時間 → 不明'); assert.strictEqual(L._trust({ source: 's', updatedAt: 'garbage' }, NOW), 'unknown');
assert.strictEqual(L._trust({ source: 's', updatedAt: iso(100) }, NOW), 'ok'); assert.strictEqual(L._trust({ source: 's', updatedAt: iso(400) }, NOW), 'low'); assert.strictEqual(L._trust({ source: 's', updatedAt: iso(800) }, NOW), 'expired');
assert.strictEqual(L._restDue(7199, 0, 7200), false); assert.strictEqual(L._restDue(7200, 0, 7200), true, '連續駕駛滿 2 小時提醒'); assert.strictEqual(L._restDue(9000, 7200, 7200), false, '提醒後重新計時'); assert.strictEqual(L._restDue(99999, 0, 0), false, '關閉時不提醒');
console.log('alerts tests PASS');
