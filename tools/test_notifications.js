// 通知策略／遮蔽防護單元測試（node tools/test_notifications.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const J = o => JSON.parse(JSON.stringify(o));
function mk(winExtra) {
  const clock = { t: 1e12 }, st = { speed: 0, navigationStatus: 'idle', currentInstruction: null, inbox: [], toast: null, notice: null }, subs = [], timers = [], sys = [];
  const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; } },
    State: { get: () => st, set(p) { const ch = Object.keys(p).filter(k => st[k] !== p[k]); Object.assign(st, p); subs.forEach(f => f(st, ch)); }, subscribe(f) { subs.push(f); } } };
  const win = Object.assign({ AIGPS: A, document: { hidden: false }, navigator: {}, Notification: undefined }, winExtra || {});
  vm.runInNewContext(fs.readFileSync('js/notifications.js', 'utf8'), { window: win, Date: { now: () => clock.t }, setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, clearTimeout() {}, Math });
  return { A, st, clock, timers, sys, emit: p => A.State.set(p), N: A.Notifications, S: A.Safety, win };
}
const T = mk(), D = T.N.decide, base = { speed: 0, navigating: false, stage: null, now: 1e12, lastShownAt: 0, toastVisible: false, seenAt: 0 };
const ctx = o => Object.assign({}, base, o), nn = (p, o) => Object.assign({ source: 's', title: 't', body: 'b', priority: p }, o);
// 1 決策矩陣
let d = D(nn('normal'), ctx()); assert(d.mode === 'show' && d.actions === 'full' && d.maxChars === 80, '停車時完整顯示');
assert.strictEqual(D(nn('normal'), ctx({ speed: 5 })).mode, 'show', '5 km/h 以下不算行駛'); assert.strictEqual(D(nn('normal'), ctx({ speed: 5.1 })).mode, 'compact', '超過 5 km/h 算行駛');
d = D(nn('normal'), ctx({ speed: 40 })); assert(d.mode === 'compact' && d.actions === 'none' && d.maxChars === 18 && d.ttl === 4000, '行駛中只顯示一行、沒有操作');
assert.strictEqual(D(nn('normal'), ctx({ speed: 40, lastShownAt: 1e12 - 3000 })).reason, 'rate-limit', '顯示間隔不足 8 秒 → 延後'); assert.strictEqual(D(nn('normal'), ctx({ speed: 40, lastShownAt: 1e12 - 9000 })).mode, 'compact');
assert.strictEqual(D(nn('low'), ctx({ speed: 40 })).mode, 'defer', '行駛中低優先延後'); assert.strictEqual(D(nn('low'), ctx()).mode, 'show'); assert.strictEqual(D(nn('low'), ctx({ toastVisible: true })).reason, 'busy');
for (const stage of ['now', '100']) { const c = ctx({ navigating: true, stage }); assert.strictEqual(D(nn('normal'), c).reason, 'maneuver', '接近轉彎（' + stage + '）一般通知延後'); assert.strictEqual(D(nn('low'), c).mode, 'defer'); d = D(nn('urgent'), c); assert(d.mode === 'compact' && d.actions === 'simple', '緊急通知仍顯示，但只給單鍵操作'); }
assert.strictEqual(D(nn('normal'), ctx({ navigating: true, stage: '300' })).mode, 'show', '離轉彎還遠時照常顯示'); assert.strictEqual(D(nn('normal'), ctx({ navigating: false, stage: 'now' })).mode, 'show', '沒在導航時 stage 不影響');
d = D(nn('urgent'), ctx({ speed: 40 })); assert(d.mode === 'compact' && d.actions === 'simple' && d.ttl === 6000, '行駛中緊急通知：精簡＋單鍵'); d = D(nn('urgent'), ctx()); assert(d.mode === 'show' && d.actions === 'full');
assert.strictEqual(D(nn('normal'), ctx({ seenAt: 1e12 - 10000 })).mode, 'drop', '30 秒內重複 → 丟棄'); assert.strictEqual(D(nn('normal'), ctx({ seenAt: 1e12 - 31000 })).mode, 'show');
// 2 notify 執行
let t = mk(); let r = t.N.notify({ source: 'm', title: '很長很長很長很長很長很長很長很長很長很長很長很長', body: '內文', priority: 'normal' }); assert.strictEqual(r.mode, 'show'); t.N.dismiss(); assert.strictEqual(t.st.toast, null);
t = mk(); t.emit({ speed: 40 }); r = t.N.notify({ source: 'm', title: '很長很長很長很長很長很長很長很長很長很長很長很長', body: '內文很多很多', priority: 'normal' });
assert(r.mode === 'compact' && t.st.toast.title.length <= 18 && t.st.toast.title.endsWith('…') && t.st.toast.body === '' && t.st.toast.actions === 'none', '行駛中標題截斷、不顯示內文');
r = t.N.notify({ source: 'm', title: '另一則', body: 'x', priority: 'normal' }); assert.strictEqual(r.mode, 'defer'); assert.strictEqual(t.st.inbox.length, 1, '被延後的進通知匣'); assert.strictEqual(t.st.inbox[0].read, false);
r = t.N.notify({ source: 'm', title: '另一則', body: 'x', priority: 'normal' }); assert.strictEqual(r.mode, 'drop', '同一則不重複');
for (let i = 0; i < 40; i++) t.N.notify({ source: 'bulk', title: '低優先' + i, priority: 'low' }); assert.strictEqual(t.st.inbox.length, 30, '通知匣最多 30 則');
t.N.markAllRead(); assert(t.st.inbox.every(x => x.read)); t.N.clearInbox(); assert.strictEqual(t.st.inbox.length, 0);
// 3 停車後整理摘要（每次停車一次）、轉彎前不整理
t = mk(); t.emit({ speed: 40 }); t.N.notify({ source: 'a', title: 'A', priority: 'low' }); t.N.notify({ source: 'b', title: 'B', priority: 'low' }); assert.strictEqual(t.st.inbox.length, 2);
t.emit({ speed: 0 }); assert(t.st.toast && t.st.toast.title === '有 2 則未讀通知', '停車後出現摘要'); const id1 = t.st.toast.id; t.emit({ speed: 0, currentInstruction: { stage: 'far' } }); assert.strictEqual(t.st.toast.id, id1, '同一次停車不重複提醒');
t = mk(); t.emit({ speed: 40, navigationStatus: 'navigating' }); t.N.notify({ source: 'a', title: 'A', priority: 'low' }); t.emit({ speed: 0, currentInstruction: { stage: '100' } }); assert.strictEqual(t.st.toast, null, '即將轉彎時不整理摘要'); t.emit({ currentInstruction: { stage: '500' } }); assert(t.st.toast && /1 則/.test(t.st.toast.title), '離開轉彎區後才整理');
// 4 行駛中的互動限制
t = mk(); assert.strictEqual(t.S.canInteract('input'), true); assert.strictEqual(t.S.isMoving(), false); t.emit({ speed: 30 }); assert.strictEqual(t.S.canInteract('input'), false, '行駛中不可輸入文字'); assert.strictEqual(t.S.canInteract('read'), false); assert.strictEqual(t.S.canInteract('simple'), true, '單鍵操作永遠可用');
// 5 系統通知橋接
const should = t.N.shouldSystemNotify; assert(should({ priority: 'normal' }, true, 'granted')); assert(!should({ priority: 'normal' }, false, 'granted'), '頁面在前景不發系統通知'); assert(!should({ priority: 'normal' }, true, 'denied')); assert(!should({ priority: 'low' }, true, 'granted'), '低優先不打擾'); assert(!should({ priority: 'urgent' }, true, 'default'), '未授權不發');
const made = []; function FakeN(title, o) { made.push([title, o]); } FakeN.permission = 'granted';
t = mk({ document: { hidden: true }, Notification: FakeN }); t.N.notify({ source: 'phone', title: '來電：小明', body: '0900', priority: 'urgent' }); assert(made.length === 1 && made[0][0] === '來電：小明', '頁面在背景且已授權 → 系統通知');
t = mk({ document: { hidden: false }, Notification: FakeN }); made.length = 0; t.N.notify({ source: 'phone', title: '來電：小明', priority: 'urgent' }); assert.strictEqual(made.length, 0);
assert.strictEqual(T.A.Providers.reg.notifications, T.N);
// 6 遮蔽防護（純函式）
const O = (() => { const A = { Log: { warn() {} } }; vm.runInNewContext(fs.readFileSync('js/overlay.js', 'utf8'), { window: { AIGPS: A } }); return A.Overlay; })();
const R = (l, tp, r, b) => ({ left: l, top: tp, right: r, bottom: b }), core = [R(0, 40, 400, 130), R(0, 500, 400, 560)];
assert.strictEqual(O.intersects(R(0, 0, 10, 10), R(10, 0, 20, 10)), false, '邊緣相接不算重疊'); assert.strictEqual(O.intersects(R(0, 0, 11, 10), R(10, 0, 20, 10)), true);
assert.strictEqual(O.resolve(R(300, 200, 400, 260), R(340, 200, 400, 230), core), 'ok', '不與核心資訊重疊'); assert.strictEqual(O.resolve(R(300, 100, 400, 200), R(340, 140, 400, 170), core), 'min', '縮小後可避開 → 精簡版');
assert.strictEqual(O.resolve(R(300, 100, 400, 200), R(340, 100, 400, 170), core), 'hide', '縮小仍重疊 → 隱藏'); assert.strictEqual(O.resolve(R(0, 0, 10, 10), R(0, 0, 10, 10), []), 'ok');
console.log('notifications tests PASS');
