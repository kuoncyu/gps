// 車道指引單元測試（node tools/test_lanes.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const A = { Providers: { register(k, o) { A.reg = [k, o.isDemo]; } } };
vm.runInNewContext(fs.readFileSync('js/lanes.js', 'utf8'), { window: { AIGPS: A }, Math });
const L = A.Lanes, J = Object.keys(L.table.junctions);
assert.strictEqual(J.length, 121); assert.strictEqual(A.reg[0], 'lanes'); assert.strictEqual(A.reg[1], true, 'Demo 資料必須標示 isDemo');
const m = (dir, x, y, hd) => ({ dir, pt: [x, y], inHd: hd });
let r = L.forManeuver(m('right', -400, 0, 0)); assert(r && r.demo && r.lanes.length === 4 && r.approach === 'N');
assert.strictEqual(r.lanes.filter(l => l.recommended).length, 1, '只有一條推薦車道');
assert(r.lanes.every(l => !l.recommended || l.available), '推薦車道必為可用車道');
assert(r.lanes.filter(l => l.available).every(l => l.arrows.includes('right')), '可用＝允許該轉向');
const avail = r.lanes.map((l, i) => l.available ? i : -1).filter(i => i >= 0);
assert.strictEqual(r.lanes.findIndex(l => l.recommended), avail[avail.length - 1], '右轉推薦最右可用車道');
r = L.forManeuver(m('left', -400, 0, 0)); assert.strictEqual(r.lanes.findIndex(l => l.recommended), r.lanes.findIndex(l => l.available), '左轉推薦最左可用車道');
assert.strictEqual(L.forManeuver(m('straight', 0, 0, 0)), null, '直行不顯示'); assert.strictEqual(L.forManeuver(m('left', 30, 30, 0)), null, '非路口無資料');
assert.strictEqual(L.forManeuver({ dir: 'left' }), null);
assert.strictEqual(L.approachOf(0), 'N'); assert.strictEqual(L.approachOf(92), 'E'); assert.strictEqual(L.approachOf(181), 'S'); assert.strictEqual(L.approachOf(268), 'W'); assert.strictEqual(L.approachOf(359), 'N');
let n = 0; for (const k of J) for (const hd of [0, 90, 180, 270]) for (const dir of ['left', 'right', 'uturn']) { const [x, y] = k.split(',').map(Number), q = L.forManeuver(m(dir, x, y, hd)); if (q) { n++; assert(q.lanes.filter(l => l.recommended).length === 1 && q.lanes.every(l => !l.recommended || l.available)); } }
assert(n > 600, '大量組合下不變式成立（' + n + '）');
console.log('lanes tests PASS');
