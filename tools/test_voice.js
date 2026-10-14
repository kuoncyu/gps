// 語音單元測試（node tools/test_voice.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync('js/voice.js', 'utf8');
function mk(opt) {
  opt = opt || {}; const clock = { t: 1e12 }, spoken = [], cancels = [], beeps = [], subs = [], st = { settings: {}, driverAlerts: [], notice: null };
  class UT { constructor(t) { this.text = t; } }
  const ss = opt.noSS ? undefined : { voices: opt.voices || [], getVoices() { return this.voices; }, speak(u) { spoken.push(u); }, cancel() { cancels.push(1); } };
  const A = { Log: { info() {}, warn() {}, error() {} }, Alerts: { TYPES: { speedCamera: { label: '測速照相' } }, beep: n => beeps.push(n) }, State: { get: () => st, set(p) { Object.assign(st, p); }, subscribe(f) { subs.push(f); } } };
  const win = { AIGPS: A, speechSynthesis: ss, SpeechSynthesisUtterance: opt.noSS ? undefined : UT };
  vm.runInNewContext(code, { window: win, localStorage: { getItem: () => null, setItem() {} }, Date: { now: () => clock.t }, Math }); 
  const emit = (patch) => { const ch = Object.keys(patch).filter(k => st[k] !== patch[k]); Object.assign(st, patch); subs.forEach(f => f(st, ch)); };
  return { A, V: A.Voice, st, spoken, cancels, beeps, clock, emit, texts: () => spoken.map(u => u.text) };
}
const ZH = [{ voiceURI: 'a', lang: 'en-US', localService: true }, { voiceURI: 'tw-net', lang: 'zh-TW', localService: false }, { voiceURI: 'cn', lang: 'zh-CN', localService: true }, { voiceURI: 'tw-local', lang: 'zh-TW', localService: true }];
const ins = (type, text, stage, d) => ({ type, text, stage, distance: d || 0, dir: 'right', turn: 90 });
// 1 語音選擇與可用狀態
let t = mk({ voices: ZH }); assert.strictEqual(t.V.status(), 'ready'); assert.strictEqual(t.V._pick().voiceURI, 'tw-local', '優先 zh-TW 且離線語音');
t = mk({ voices: ZH.slice(0, 2) }); assert.strictEqual(t.V._pick().voiceURI, 'tw-net', '只有網路語音時仍可用');
t = mk({ voices: [ZH[0]] }); assert.strictEqual(t.V.status(), 'no-zh'); assert.strictEqual(t.V.canSpeak(), false); assert.strictEqual(t.V.speak('x', 2), false, '沒有中文語音不發聲');
t = mk({ noSS: true }); assert.strictEqual(t.V.status(), 'unsupported');
// 2 文字
const V0 = mk({ voices: ZH }).V;
assert.strictEqual(V0._turn(ins('turn', '右轉', '500')), '500 公尺後右轉'); assert.strictEqual(V0._turn(ins('turn', '左轉', '300')), '300 公尺後左轉'); assert.strictEqual(V0._turn(ins('turn', '右轉', '100')), '100 公尺後右轉');
assert.strictEqual(V0._turn(ins('turn', '右轉', 'now')), '現在右轉'); assert.strictEqual(V0._turn(ins('turn', '右轉', 'far')), null); assert.strictEqual(V0._turn(ins('arrive', '抵達目的地', '300')), '前方300 公尺抵達目的地'.replace('方300', '方300'));
assert.strictEqual(V0._turn(ins('arrive', '', 'now')), '您已抵達目的地'); assert.strictEqual(V0._turn(ins('reroute', '', 'now')), '偏離路線，正在重新規劃'); assert.strictEqual(V0._turn(ins('warn', '', 'far')), null);
const T = { label: '測速照相' }; assert.strictEqual(V0._alert({ stage: 'warn', dist: 480, kmh: 50 }, T), '前方500 公尺測速照相，限速50'); assert.strictEqual(V0._alert({ stage: 'near', dist: 120, kmh: 50 }, T), '前方測速照相，限速50'); assert.strictEqual(V0._alert({ stage: 'now', dist: 10 }, T), null);
// 3 導航流程：每個階段只說一次，下一個同樣的轉彎仍會再說
t = mk({ voices: ZH }); const fin = () => t.spoken.length && t.spoken[t.spoken.length - 1].onend && t.spoken[t.spoken.length - 1].onend();
t.emit({ navigationStatus: 'navigating' }); assert.deepStrictEqual(t.texts(), ['開始導航']); fin();
t.emit({ currentInstruction: ins('turn', '右轉', 'far', 800) }); assert.strictEqual(t.spoken.length, 1, '遠距離不播報');
for (const [stg, expect] of [['500', '500 公尺後右轉'], ['300', '300 公尺後右轉'], ['100', '100 公尺後右轉'], ['now', '現在右轉']]) { t.emit({ currentInstruction: ins('turn', '右轉', stg, 100) }); assert.strictEqual(t.texts().pop(), expect); fin(); }
const n = t.spoken.length; t.emit({ currentInstruction: ins('turn', '右轉', 'now', 5) }); assert.strictEqual(t.spoken.length, n, '同階段不重複播報');
t.emit({ currentInstruction: ins('turn', '右轉', 'far', 700) }); t.emit({ currentInstruction: ins('turn', '右轉', '500', 480) }); assert.strictEqual(t.texts().pop(), '500 公尺後右轉', '下一個相同轉彎會重新播報'); fin();
t.emit({ navigationStatus: 'rerouting' }); t.emit({ currentInstruction: ins('reroute', '', 'now') }); assert.strictEqual(t.texts().pop(), '偏離路線，正在重新規劃'); fin();
t.emit({ route: { label: '重新規劃' }, navigationStatus: 'navigating' }); assert.strictEqual(t.texts().pop(), '已重新規劃路線'); fin();
t.emit({ navigationStatus: 'arrived' }); assert.strictEqual(t.texts().pop(), '您已抵達目的地');
// 4 警示：每個等級一次、超速節流、有語音時不響提示音由 alerts.js 控制
t = mk({ voices: ZH }); t.emit({ driverAlerts: [{ id: 'a1', type: 'speedCamera', stage: 'warn', dist: 480, kmh: 50 }] }); assert.strictEqual(t.texts().pop(), '前方500 公尺測速照相，限速50'); t.spoken.at(-1).onend();
t.emit({ driverAlerts: [{ id: 'a1', type: 'speedCamera', stage: 'warn', dist: 400, kmh: 50 }] }); assert.strictEqual(t.spoken.length, 1, '同等級不重複');
t.emit({ driverAlerts: [{ id: 'a1', type: 'speedCamera', stage: 'near', dist: 140, kmh: 50, overspeed: true }] }); assert(t.texts().includes('您已超速，限速50') && t.texts().includes('前方測速照相，限速50'));
// 5 優先序與排隊
t = mk({ voices: ZH }); t.V.speak('導航', 2); assert.strictEqual(t.spoken.length, 1); t.V.speak('提示', 1); assert.strictEqual(t.spoken.length, 1, '低優先排隊，不打斷'); 
t.V.speak('警示', 3); assert.strictEqual(t.texts().pop(), '警示'); assert(t.cancels.length >= 1, '高優先打斷目前語音');
t.spoken.at(-1).onend(); assert.strictEqual(t.texts().includes('提示'), false, '被高優先清掉的低優先語音不再播放');
t = mk({ voices: ZH }); t.V.speak('A', 2); t.V.speak('B', 1, 3000); t.clock.t += 5000; t.spoken[0].onend(); assert.deepStrictEqual(t.texts(), ['A'], '排隊過久的舊語音被丟棄');
t = mk({ voices: ZH }); t.V.speak('A', 2); t.V.speak('B', 1, 3000); t.clock.t += 1000; t.spoken[0].onend(); assert.deepStrictEqual(t.texts(), ['A', 'B'], '未過期的排隊語音會接續播放');
// 6 一般提示、關閉、無語音退回提示音
t = mk({ voices: ZH }); t.emit({ notice: { id: 1, text: '進入東北區：降雨' } }); assert.strictEqual(t.texts().pop(), '進入東北區：降雨'); t.spoken.at(-1).onend(); t.emit({ notice: { id: 1, text: '進入東北區：降雨' } }); assert.strictEqual(t.spoken.length, 1, '同一則提示只念一次');
t.V.prefs.on = false; t.emit({ notice: { id: 2, text: 'x' } }); assert.strictEqual(t.spoken.length, 1, '關閉語音後不發聲');
t = mk({ voices: [ZH[0]] }); t.emit({ navigationStatus: 'navigating' }); t.emit({ currentInstruction: ins('turn', '右轉', '100', 90) }); assert.deepStrictEqual(t.beeps, [1], '無中文語音時以提示音代替'); assert.strictEqual(t.spoken.length, 0);
assert(!JSON.stringify(t.V.voices()).includes('即時'));
console.log('voice tests PASS');
