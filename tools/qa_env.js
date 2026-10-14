/* QA 整合測試環境（Batch 15）：用「真實的」模組搭配假的 IndexedDB、假網路（讀取 packages/ 並可注入故障）、
   可控制的時鐘／timer／requestAnimationFrame、假的語音合成。邏輯層的整合驗證；瀏覽器端仍需人工驗收（見 QA.md）。 */
const fs = require('fs'), vm = require('vm'), path = require('path'), webcrypto = require('crypto').webcrypto;
const ROOT = path.resolve(process.env.AIGPS_ROOT || path.join(__dirname, '..'));
const MODULES = ['state', 'providers', 'demo', 'storage', 'package-manager', 'offline-manager', 'search', 'routing', 'gps', 'trip', 'places', 'platform', 'notifications', 'voice', 'assistant', 'media', 'phone', 'upahead', 'parking', 'weather', 'traffic', 'alerts', 'lanes', 'navigation'].map(n => `js/${n}.js`);
const tick1 = () => new Promise(r => setImmediate(r));

/* 假的 IndexedDB：支援交易失敗時整筆復原（用來驗證「原子切換」） */
function fakeIDB() {
  const stores = { staging: new Map(), packages: new Map(), meta: new Map() }, api = { stores, failOn: null, ops: 0 };
  api.open = () => {
    const req = {}; setImmediate(() => {
      const db = { createObjectStore() {}, transaction(names) {
        const tx = { pending: 0, undo: [], failed: false, done: false, oncomplete: null, onabort: null, onerror: null };
        const check = () => { if (tx.pending === 0 && !tx.failed) setImmediate(() => { if (tx.pending === 0 && !tx.done && !tx.failed) { tx.done = true; tx.oncomplete && tx.oncomplete(); } }); };
        tx.objectStore = name => {
          const m = stores[name], mk = (op, fn) => { const r = { onsuccess: null, onerror: null, result: undefined }; tx.pending++;
            queueMicrotask(() => { try { if (tx.failed) throw new Error('交易已中止'); if (api.failOn && api.failOn(name, op, api.ops++)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } r.result = fn(); r.onsuccess && r.onsuccess(); }
              catch (e) { r.error = e; if (!tx.failed) { tx.failed = true; tx.undo.reverse().forEach(u => u()); tx.undo = []; tx.error = e; setImmediate(() => tx.onabort && tx.onabort()); } r.onerror && r.onerror(); }
              finally { tx.pending--; check(); } }); return r; };
          return { get: k => mk('get', () => m.get(k)), getAllKeys: () => mk('keys', () => [...m.keys()]),
            put: (v, k) => mk('put', () => { const had = m.has(k), old = m.get(k); m.set(k, v); tx.undo.push(() => (had ? m.set(k, old) : m.delete(k))); return k; }),
            delete: k => mk('delete', () => { const had = m.has(k), old = m.get(k); m.delete(k); tx.undo.push(() => { if (had) m.set(k, old); }); }) };
        };
        setImmediate(check); return tx; } };
      req.result = db; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess(); });
    return req;
  };
  return api;
}

async function makeEnv(opt = {}) {
  const clock = { t: Date.UTC(2026, 10, 1, 8, 0, 0) }, base = clock.t, timers = [], rafs = [], domHandlers = [], winHandlers = {}; let tid = 0, rid = 0;
  const idb = opt.idb || fakeIDB(), ls = opt.ls || new Map();
  const env = { clock, idb, ls, fetchLog: [], fault: null, offline: !!opt.offline, events: [], spoken: [], overlap: 0, quota: opt.quota || { usage: 0, quota: 1e12 } };
  class FDate extends Date { constructor(...a) { if (a.length === 0) super(clock.t); else super(...a); } static now() { return clock.t; } }
  const setT = (fn, ms) => { if (!(ms > 0)) { setImmediate(fn); return -1; } timers.push({ id: ++tid, due: clock.t + ms, fn, every: 0 }); return tid; };
  const setI = (fn, ms) => { timers.push({ id: ++tid, due: clock.t + ms, fn, every: ms }); return tid; };
  const clr = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const runTimers = () => { for (let guard = 0; guard < 1000; guard++) { const due = timers.filter(t => t.due <= clock.t).sort((a, b) => a.due - b.due)[0]; if (!due) break; if (due.every) due.due += due.every; else timers.splice(timers.indexOf(due), 1); due.fn(); } };
  env.timerCount = () => timers.length;
  env.tick = ms => { let left = ms; while (left > 0) { const step = Math.min(left, 50); clock.t += step; left -= step; runTimers(); const cbs = rafs.splice(0); cbs.forEach(r => r.f(clock.t - base)); } };
  env.settle = async (n = 3) => { for (let i = 0; i < n; i++) await tick1(); };
  env.drive = async (pred, maxSimSec = 600, stepMs = 100) => { const end = clock.t + maxSimSec * 1000; while (!pred() && clock.t < end) { env.tick(stepMs); await tick1(); } return pred(); };

  class UT { constructor(t) { this.text = t; } }
  const ss = { voices: [{ voiceURI: 'zh', lang: 'zh-TW', localService: true }], speaking: false, cancelled: false, cur: null, getVoices() { return this.voices; },
    speak(u) { if (this.speaking && !this.cancelled) env.overlap++; this.cancelled = false; this.speaking = true; this.cur = u; env.spoken.push(u.text); setT(() => { if (this.cur === u) { this.speaking = false; this.cur = null; u.onend && u.onend(); } }, 600); },
    cancel() { this.speaking = false; this.cancelled = true; this.cur = null; } };
  const navigator = { onLine: !env.offline, userAgent: 'QA', storage: { estimate: async () => env.quota } };
  const window = { addEventListener: (t, f) => { (winHandlers[t] = winHandlers[t] || []).push(f); }, speechSynthesis: opt.noVoice ? undefined : ss, SpeechSynthesisUtterance: opt.noVoice ? undefined : UT };
  const document = { hidden: false, addEventListener: (t, f) => { if (t === 'DOMContentLoaded') domHandlers.push(f); }, getElementById: () => null, querySelectorAll: () => [] };
  window.navigator = navigator; window.document = document; window.crypto = webcrypto;
  const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  const sleep0 = () => tick1();
  const fetchImpl = async url => {
    env.fetchLog.push(url); await sleep0();
    if (env.offline) throw new TypeError('Failed to fetch');
    const f = env.fault ? env.fault(url, env.fetchLog.length) : null;
    if (f && f.throw) throw new TypeError('network');
    if (f && f.status) return { ok: false, status: f.status, arrayBuffer: async () => new ArrayBuffer(0) };
    const p = path.join(ROOT, url.split('?')[0]); if (!fs.existsSync(p)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    let buf = Buffer.from(fs.readFileSync(p)); if (f && f.tamper) buf[buf.length >> 1] ^= 0xff; if (f && f.mutate) buf = Buffer.from(f.mutate(buf));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  const ctx = vm.createContext({ window, document, navigator, localStorage, indexedDB: idb, fetch: fetchImpl, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, JSON, Math, Date: FDate,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, setTimeout: setT, clearTimeout: clr, setInterval: setI, clearInterval: clr,
    requestAnimationFrame: f => { const id = ++rid; rafs.push({ id, f }); return id; }, cancelAnimationFrame: id => { const i = rafs.findIndex(r => r.id === id); if (i >= 0) rafs.splice(i, 1); },
    performance: { now: () => clock.t - base }, console: { log() {}, error() {}, warn() {} }, localStorageRef: null });
  MODULES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  const A = window.AIGPS; env.A = A; env.S = A.State; env.window = window; env.ss = ss; env.ctx = ctx;
  env.setOnline = on => { navigator.onLine = on; env.offline = !on; (winHandlers[on ? 'online' : 'offline'] || []).forEach(f => f()); };
  env.ready = async () => { for (const f of domHandlers.splice(0)) await f(); await env.settle(6); A.PM.on(e => env.events.push(e)); };
  env.install = async (ver, id = 'TW-DEMO') => { const n = env.events.length; try { await A.PM.install(id, ver); } catch (e) { env.events.push({ type: 'throw', message: e.message, code: e.code }); } await env.settle(6); return env.events.slice(n); };
  env.last = (type) => env.events.slice().reverse().find(e => e.type === type);
  env.pickDest = (cat = '咖啡', min = 1500, max = 2600) => A.Search.pois.filter(p => p.cat === cat && Math.hypot(p.x + 800, p.y + 800) > min && Math.hypot(p.x + 800, p.y + 800) < max)[0];
  env.planTo = async dest => { A.Places.setDestination(dest); return A.Assistant._planAndApply(); };
  await env.ready(); return env;
}
async function readyEnv(ver = '2026.11.15', opt) { const env = await makeEnv(opt); await env.install(ver); if (env.S.get().offlinePackageStatus !== 'ready') throw new Error('資料包未就緒：' + env.S.get().offlinePackageStatus + ' ' + JSON.stringify(env.events.slice(-2))); await env.settle(6); return env; }
module.exports = { makeEnv, readyEnv, fakeIDB, ROOT, tick1 };
