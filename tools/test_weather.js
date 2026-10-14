// 離線天氣單元測試（node tools/test_weather.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const st = { currentLocation: null }, A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; } }, State: { get: () => st, set(p) { Object.assign(st, p); }, subscribe() {} } };
vm.runInNewContext(fs.readFileSync('js/weather.js', 'utf8'), { window: { AIGPS: A }, document: { addEventListener() {} }, Date, Math });
const W = A.Weather, H = 3600000, T0 = Date.UTC(2026, 9, 10, 0, 0);
assert.strictEqual(A.Providers.reg.weather.live, false, '天氣來源不是即時'); assert.strictEqual(W.isDemo, true);
assert.deepStrictEqual([W._zoneOf(-5, 5), W._zoneOf(5, 5), W._zoneOf(-5, -5), W._zoneOf(5, -5), W._zoneOf(0, 0)], ['NW', 'NE', 'SW', 'SE', 'NE'], '分區與邊界');
const snap = W._snapshot(T0), again = W._snapshot(T0); assert.strictEqual(JSON.stringify(snap), JSON.stringify(again), '同一資料時間產生相同快照');
assert(Object.values(snap.zones).every(z => z.hourly.length === 12 && z.hourly.every((h, i) => h.t === T0 + i * H && W.COND[h.cond])), '每區 12 小時預報');
assert.strictEqual(W._ageLevel(T0 + 1 * H, T0), 'fresh'); assert.strictEqual(W._ageLevel(T0 + 6 * H, T0), 'fresh'); assert.strictEqual(W._ageLevel(T0 + 7 * H, T0), 'stale'); assert.strictEqual(W._ageLevel(T0 + 24 * H, T0), 'stale'); assert.strictEqual(W._ageLevel(T0 + 25 * H, T0), 'veryStale');
const ne = snap.zones.NE; let w = W._at(ne, T0 + 30 * 60000, T0); assert(w.idx === 0 && !w.expired && w.cond === 'rain'); w = W._at(ne, T0 + 4.5 * H, T0); assert.strictEqual(w.cond, 'storm', '依時間取對應小時');
w = W._at(ne, T0 + 20 * H, T0); assert(w.expired && w.idx === 11, '超過 12 小時標示過期'); w = W._at(ne, T0 - 2 * H, T0); assert(w.idx === 0 && !w.expired);
// 路線沿途：由西南往東北穿越四區
const pts = [[-800, -800], [-800, 800], [800, 800]], segs = W._route(snap, pts, 2400, T0 + 5 * 60000);
assert.deepStrictEqual(JSON.parse(JSON.stringify(segs.map(s => s.zone))), ['SW', 'NW', 'NE'], '依序經過的區域'); assert(segs[0].along === 0 && segs[1].along >= 800 && segs[1].along < 900);
assert(segs.every((s, i) => !i || s.etaMs > segs[i - 1].etaMs), 'ETA 遞增'); const ne2 = segs.find(s => s.zone === 'NE'); assert(ne2.hazard && /路面濕滑|雷雨/.test(ne2.advice), '降雨區有駕駛建議');
assert(!segs.find(s => s.zone === 'SW').hazard, '晴天無警示');
// 摘要、Provider、用語
const sum = W.summary('NE', Date.now()); assert(sum.demo === true && sum.live === false && sum.zoneName === '東北區');
const text = JSON.stringify([W.COND, W.ADVICE, sum]); assert(!text.includes('即時'), '不得出現「即時」');
(async () => { const r = await W.getCurrent({ x: 100, y: 100 }); assert(r.ok && r.demo && r.live === false && r.zone === 'NE'); console.log('weather tests PASS'); })();
