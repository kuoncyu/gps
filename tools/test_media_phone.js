// 媒體／電話單元測試（node tools/test_media_phone.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function mk() {
  const store = {}, calls = [], timers = [], st = { media: null, call: null }, speakCbs = [], subs = [];
  const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; } },
    State: { get: () => st, set(p) { Object.assign(st, p); subs.forEach(f => f(st, Object.keys(p))); }, subscribe(f) { subs.push(f); } },
    Voice: { prefs: { on: true }, onSpeaking: f => speakCbs.push(f), stop() { calls.push('voiceStop'); } }, Safety: { moving: false, canInteract(k) { return k === 'simple' || !this.moving; } }, Notifications: { notify(n) { calls.push(['notify', n.priority, n.title]); }, trunc: (x) => x } };
  const eng = { log: [], gain: null, playing: null, start(t) { this.playing = t.title; this.log.push('start:' + t.title); }, stop() { this.playing = null; this.log.push('stop'); }, setGain(v) { this.gain = v; } };
  const win = { AIGPS: A }, ctx = { window: win, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, URL: { createObjectURL: f => 'blob:' + f.name, revokeObjectURL() {} }, setTimeout: (f, ms) => { timers.push({ f, ms, cleared: false }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; }, Date, Math, Array };
  vm.runInNewContext(fs.readFileSync('js/media.js', 'utf8'), ctx); A.Media._setEngine(eng); vm.runInNewContext(fs.readFileSync('js/phone.js', 'utf8'), ctx);
  return { A, st, calls, timers, eng, speakCbs, store, M: A.Media, P: A.Phone };
}
// ---- 媒體 ----
let t = mk(); assert.strictEqual(t.A.Providers.reg.media, t.M); assert.strictEqual(t.M.caps.controlOtherApps, false, '不宣稱能控制其他 App');
assert(t.st.media.status === 'stopped' && t.st.media.count === 3 && t.st.media.demo === true, '預設是 Demo 合成音軌');
let r = t.M.play(); assert(r.ok && r.demo && t.eng.playing === '測試音軌 1（合成音）' && t.st.media.status === 'playing'); t.M.play(); assert.strictEqual(t.eng.log.filter(x => x.startsWith('start')).length, 1, '重複播放不重啟');
t.M.pause(); assert(t.st.media.status === 'paused' && t.eng.playing === null); t.M.toggle(); assert.strictEqual(t.st.media.status, 'playing');
t.M.next(); assert.strictEqual(t.eng.playing, '測試音軌 2（合成音）', '播放中切歌會立即換曲'); t.M.next(); t.M.next(); assert.strictEqual(t.st.media.index, 0, '下一首循環'); t.M.prev(); assert.strictEqual(t.st.media.index, 2, '上一首循環'); t.M.select(1); assert.strictEqual(t.eng.playing, '測試音軌 2（合成音）');
t.M.pause(); t.M.next(); assert(t.eng.playing === null && t.st.media.status === 'paused', '暫停時切歌不會自動播放');
// 音量與降低音量
t = mk(); t.M.play(); t.M.setVolume(0.8); assert.strictEqual(t.eng.gain, 0.8); t.M.setVolume(1.7); assert.strictEqual(t.st.media.volume, 1); t.M.setVolume(-1); assert.strictEqual(t.st.media.volume, 0); t.M.setVolume(0.8);
t.speakCbs[0](true); assert(Math.abs(t.eng.gain - 0.8 * t.M.DUCK) < 1e-9 && t.st.media.ducked === true, '導航語音說話時降低音量'); t.speakCbs[0](false); assert(t.eng.gain === 0.8 && t.st.media.ducked === false, '說完恢復音量');
t.speakCbs[0](true); t.A.Voice.prefs.on = false; t.A.Voice.stop(); assert.strictEqual(t.st.media.status, 'playing', '關閉導航語音不會停掉音樂'); assert.strictEqual(JSON.parse(t.store['aigps.media']).volume, 0.8, '音量有保存');
t = mk(); t.store['aigps.media'] = JSON.stringify({ volume: 0.3 }); const t2 = mk(); assert(t2.st.media.volume === 0.6, '預設音量');
// 通話暫停／恢復
t = mk(); t.M.play(); t.M.pauseForCall(); assert.strictEqual(t.st.media.status, 'paused'); t.M.resumeAfterCall(); assert.strictEqual(t.st.media.status, 'playing', '通話結束後恢復');
t = mk(); t.M.play(); t.M.pause(); t.M.pauseForCall(); t.M.resumeAfterCall(); assert.strictEqual(t.st.media.status, 'paused', '通話前本來就暫停的，不會自己播放');
// 本機檔案
t = mk(); r = t.M.loadFiles([{ name: 'a.txt', type: 'text/plain' }]); assert.strictEqual(r.ok, false); r = t.M.loadFiles([{ name: '晨間.mp3', type: 'audio/mpeg' }, { name: 'b.wav', type: '' }, { name: 'c.pdf', type: 'application/pdf' }]);
assert(r.ok && r.count === 2 && t.st.media.source === 'file' && t.st.media.title === '晨間' && t.st.media.demo === false, '只收音訊檔、標題去掉副檔名'); t.M.play(); assert.strictEqual(t.eng.playing, '晨間'); t.M.useDemo(); assert(t.st.media.demo === true && t.st.media.index === 0);
// ---- 電話 ----
t = mk(); let opened = []; t.P._setOpener(u => opened.push(u)); assert.strictEqual(t.P.caps.detectIncoming, false); assert.strictEqual(t.P.caps.realCall, false, '不宣稱能偵測或接聽真實來電');
assert.strictEqual(t.P.dial('abc').reason, 'invalid'); assert.strictEqual(t.P.dial('').reason, 'invalid'); r = t.P.dial('0912-345-678'); assert(r.ok && r.via === 'tel-link' && opened[0] === 'tel:0912345678', '以 tel: 連結交給系統電話 App');
t.A.Safety.moving = true; r = t.P.dial('0912-345-678'); assert(!r.ok && r.reason === 'moving' && opened.length === 1, '行駛中不可輸入號碼撥打'); r = t.P.dial('119'); assert(r.ok && r.emergency && opened[1] === 'tel:119', '緊急號碼行駛中也可撥打'); assert.strictEqual(t.P.dial('+886 912 345 678').reason, 'moving');
t.A.Safety.moving = false;
// 模擬來電流程
t = mk(); t.M.play(); assert(t.P.simulateIncoming('小明', '0900').ok); assert.deepStrictEqual(t.st.call && [t.st.call.state, t.st.call.name, t.st.call.demo], ['ringing', '小明', true]); assert(t.calls.some(c => c[0] === 'notify' && c[1] === 'urgent'), '來電以緊急通知送出'); assert.strictEqual(t.P.simulateIncoming('另一人').ok, false, '已有來電時不重複');
assert.strictEqual(t.st.media.status, 'playing', '響鈴時音樂不受影響（導航語音也不會被通話擋住）'); t.P.answer(); assert(t.st.call.state === 'active' && t.st.media.status === 'paused', '接聽後音樂暫停'); assert(t.timers[0].cleared, '接聽後取消未接計時');
t.P.hangup(); assert(t.st.call === null && t.st.media.status === 'playing', '掛斷後音樂恢復');
t = mk(); t.M.play(); t.P.simulateIncoming('小明'); t.P.decline(); assert(t.st.call === null && t.st.media.status === 'playing', '拒接不影響音樂'); assert.strictEqual(t.P.answer().ok, false);
t = mk(); t.P.simulateIncoming('小華', '0911'); t.timers[0].f(); assert(t.st.call === null && t.calls.some(c => c[0] === 'notify' && c[1] === 'normal' && /未接來電：小華/.test(c[2])), '響鈴逾時 → 未接來電通知'); assert.strictEqual(t.timers[0].ms, 30000);
console.log('media/phone tests PASS');
