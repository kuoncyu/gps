// 壓力與故障注入測試（Batch 15）：node tools/qa_stress.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { makeEnv, readyEnv, ROOT } = require('./qa_env');
const T = []; const test = (id, name, fn) => T.push({ id, name, fn });
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const isPart = u => /\.\d{3}$/.test(u), ready = e => e.S.get().offlinePackageStatus === 'ready';
const parts = ver => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/TW-DEMO/${ver}/manifest.json`))).files.reduce((a, f) => a + f.parts.length, 0);

test('S1', '弱網：30% 分片隨機失敗，自動重試＋續傳最終完成，已存分片不重複下載', async () => {
  const env = await makeEnv(), R = rng(7), okCount = {}; env.A.PM.retry.delay = 0;
  env.fault = u => { if (!isPart(u)) return null; if (R() < 0.3) return { throw: true }; okCount[u] = (okCount[u] || 0) + 1; return null; };
  let attempts = 0; while (!ready(env) && attempts < 12) { attempts++; await env.install('2026.11.15'); }
  assert(ready(env), '最終完成（嘗試 ' + attempts + ' 次）'); assert(Object.values(okCount).every(n => n === 1), '每個分片只成功下載一次（已暫存者不重抓）'); assert.strictEqual(Object.keys(okCount).length, parts('2026.11.15'));
  assert(env.events.filter(e => e.type === 'retry').length > 5, '有自動重試'); assert.strictEqual((await env.A.PM.verifyActive()).ok, true, '完成後整包驗證通過'); assert.strictEqual(env.idb.stores.staging.size, 0, '暫存已清空');
  const e2 = await makeEnv(); e2.A.PM.retry.delay = 0; e2.fault = u => (isPart(u) ? { status: 503 } : null); await e2.install('2026.11.15'); assert(e2.last('error') && e2.last('error').code === 'HTTP' && !e2.A.PM.busy(), '持續 503 → 重試用盡後明確失敗，不卡住');
  const e3 = await makeEnv(); e3.fault = u => (isPart(u) ? { status: 404 } : null); await e3.install('2026.11.15'); assert.strictEqual(e3.events.filter(e => e.type === 'retry').length, 0, '404 這類永久性錯誤不重試');
});
test('S2', '快速暫停／繼續／取消序列：不卡住、不留殘渣', async () => {
  const env = await makeEnv(); env.A.PM.retry.delay = 0; env.A.PM.pause(); env.A.PM.cancel(); assert(!env.A.PM.busy(), '閒置時暫停／取消無害');
  let n = 0; env.fault = u => { if (isPart(u)) { n++; if (n === 4) env.A.PM.pause(); } return null; }; await env.install('2026.11.15'); assert(env.last('paused') && !env.A.PM.busy());
  n = 0; env.fault = u => { if (isPart(u)) { n++; if (n === 3) env.A.PM.cancel(); } return null; }; await env.install('2026.11.15'); assert(env.last('canceled') && !env.A.PM.busy() && env.idb.stores.staging.size === 0, '取消 → 暫存清除');
  for (let i = 0; i < 5; i++) { n = 0; env.fault = u => { if (isPart(u) && ++n === 2) env.A.PM.pause(); return null; }; await env.install('2026.11.15'); } assert(!env.A.PM.busy(), '連續暫停 5 次');
  env.fault = null; await env.install('2026.11.15'); assert(ready(env), '最後仍可完成'); assert.strictEqual(env.idb.stores.staging.size, 0);
});
test('S3', '並發操作：同時兩個下載，第二個被明確拒絕', async () => {
  const env = await makeEnv(), r = await Promise.allSettled([env.A.PM.install('TW-DEMO', '2026.11.01'), env.A.PM.install('TW-DEMO', '2026.11.15')]); await env.settle(6);
  assert(r.filter(x => x.status === 'rejected').length === 1 && r.find(x => x.status === 'rejected').reason.code === 'BUSY'); assert(ready(env) && env.S.get().offlinePackage.version === '2026.11.01' && !env.A.PM.busy());
});
test('S4', '反覆損壞／還原／更新 20 輪：資料一致、無殘留', async () => {
  const env = await readyEnv('2026.11.01'); env.A.PM.retry.delay = 0;
  for (let i = 0; i < 20; i++) { await env.install(i % 3 === 0 ? '2026.11.99' : i % 3 === 1 ? '2026.11.15' : '2026.11.01'); assert(ready(env), `第 ${i} 輪後仍可用`); }
  assert.strictEqual((await env.A.PM.verifyActive()).ok, true); assert(env.idb.stores.packages.size <= 2 && env.idb.stores.staging.size === 0 && !env.A.PM.busy(), '只保留目前與上一版、無暫存殘留'); assert(env.A.Search.pois.length > 0 && env.A.Routing.ready());
});
test('S5', '長時間導航：連續 40 趟完整導航（含偏航）皆抵達，資料結構不無限成長', async () => {
  const env = await readyEnv(), A = env.A, S = env.S, R = rng(11), pool = A.Search.pois.filter(p => p.cat === '咖啡' && Math.hypot(p.x + 800, p.y + 800) > 800 && Math.hypot(p.x + 800, p.y + 800) < 3000); let base = null, simSec = 0, rer = 0; S.subscribe((s, ch) => { if (ch.includes('navigationStatus') && s.navigationStatus === 'rerouting') rer++; });
  for (let i = 0; i < 40; i++) {
    const dest = pool[Math.floor(R() * pool.length)], plan = await env.planTo(dest); assert(plan.ok, '第 ' + i + ' 趟規劃'); assert(A.Nav.start().ok); A.Gps.setFactor(4); const t0 = env.clock.t; let det = false;
    const ok = await env.drive(() => { if (!det && i % 4 === 0 && env.clock.t - t0 > 15000) { det = true; A.Gps.detour(); } return S.get().navigationStatus === 'arrived'; }, 2000); assert(ok, '第 ' + i + ' 趟抵達'); simSec += (env.clock.t - t0) / 1000; A.Nav.finish();
    if (i === 4) base = env.timerCount();
  }
  assert(env.timerCount() <= base + 2, 'timer 數量穩定（' + base + ' → ' + env.timerCount() + '）'); assert(A.Log.all().length <= 200, '日誌環形緩衝 ≤ 200'); assert(A.Trip.readLog().length === 40, '每一趟都有行程紀錄（≤ 上限 50）'); assert((S.get().inbox || []).length <= 30 && (S.get().aiConversation || []).length <= 30);
  assert.strictEqual(env.overlap, 0, '長時間播報不重疊'); assert(rer > 0, '偏航重算確實發生'); console.log(`        ${40} 趟、模擬行駛 ${(simSec / 60).toFixed(0)} 分鐘、語音 ${env.spoken.length} 句、偏航重算 ${rer} 次`);
});
test('S6', '快速操作：反覆開關導航／偏航連點／語音通知洪水／助理連發／網路狀態亂跳', async () => {
  const env = await readyEnv(), A = env.A, S = env.S; await env.planTo(env.pickDest()); const tm0 = env.timerCount();
  for (let i = 0; i < 200; i++) { assert(A.Nav.start().ok); A.Nav.stop(); } assert(S.get().navigationStatus === 'idle' && !A.Nav.active && !A.Gps.pose.running, '開關 200 次後狀態一致'); env.tick(1500); assert(env.timerCount() <= tm0 + 1, 'timer 不累積（' + tm0 + ' → ' + env.timerCount() + '）');
  A.Nav.start(); A.Gps.setFactor(4); await env.drive(() => false, 20); let calls = 0; S.subscribe((st, ch) => { if (ch.includes('navigationStatus') && st.navigationStatus === 'rerouting') calls++; }); const rp = A.Providers.get('routing'), orig = rp.reroute;
  for (let i = 0; i < 50; i++) { A.Gps.detour(); env.tick(20); await env.settle(1); } await env.drive(() => false, 10); assert(calls >= 1 && calls <= 3, '偏航連點 50 次只重新規劃 ' + calls + ' 次（有冷卻）');
  assert(await env.drive(() => S.get().navigationStatus === 'arrived', 1500), '連點之後仍能抵達');
  const tm1 = env.timerCount(); for (let i = 0; i < 1000; i++) A.Voice.speak('測試' + (i % 7), 1 + (i % 3)); env.tick(2000); assert.strictEqual(env.overlap, 0, '語音洪水不重疊'); assert(env.timerCount() <= tm1 + 2, '語音 timer 會回收');
  for (let i = 0; i < 2000; i++) A.Notifications.notify({ source: 'f', title: 'n' + i, priority: ['low', 'normal', 'urgent'][i % 3] }); assert((S.get().inbox || []).length <= 30, '通知匣上限'); assert(S.get().toast === null || typeof S.get().toast.title === 'string');
  const qs = ['附近有咖啡廳', '再多找幾個', '第二個', '避開收費', '你可以做什麼', '還有多久到', '亂七八糟', '天氣如何', '前方有什麼服務', '結束導航', '取消']; for (let i = 0; i < 300; i++) await A.Assistant.ask(qs[i % qs.length]); assert((S.get().aiConversation || []).length <= 30, '對話上限 30');
  for (let i = 0; i < 500; i++) env.setOnline(i % 2 === 0); assert(S.get().networkStatus === 'online' || S.get().networkStatus === 'offline'); env.setOnline(true);
});
test('S7', '偏航與交通事件風暴：每 5 秒隨機偏航／封閉／壅塞，不卡在重新規劃、不丟例外', async () => {
  const env = await readyEnv(), A = env.A, S = env.S, R = rng(23); await env.planTo(env.pickDest('咖啡', 1800, 2800)); A.Nav.start(); A.Gps.setFactor(4); let stuck = 0, maxStuck = 0, lastAct = env.clock.t, acts = 0;
  const end = env.clock.t + 1500 * 1000; while (env.clock.t < end && S.get().navigationStatus !== 'arrived') {
    env.tick(100); await env.settle(1); stuck = S.get().navigationStatus === 'rerouting' ? stuck + 100 : 0; maxStuck = Math.max(maxStuck, stuck);
    if (env.clock.t - lastAct >= 5000 && A.Nav.active) { lastAct = env.clock.t; acts++; const k = R(); if (k < 0.4) A.Gps.detour(); else if (k < 0.6) A.Traffic.injectAhead('closure', 250 + Math.floor(R() * 300)); else if (k < 0.8) A.Traffic.injectAhead('congestion', 300); else A.Traffic.clearSim(); }
  }
  assert(maxStuck <= 15000, '「重新規劃」最長持續 ' + maxStuck + ' ms'); assert(S.get().navigationStatus === 'arrived' || A.Nav.active, '最後抵達或仍在導航中（' + S.get().navigationStatus + '）'); assert(acts >= 5, '共施加 ' + acts + ' 次擾動');
});
test('S8', '效能基準（回歸防線，門檻放寬）', async () => {
  const env = await readyEnv(), A = env.A, N = A.Nav, rows = []; const bench = (name, n, fn, maxMs) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(i); const ms = Number(process.hrtime.bigint() - t) / 1e6 / n; rows.push([name, ms]); assert(ms <= maxMs, `${name} 平均 ${ms.toFixed(3)} ms > ${maxMs} ms`); };
  const dest = env.pickDest(); await env.planTo(dest); const rt = env.S.get().route, R = N._prepare(rt.points), I = N._build(R), qs = ['咖啡', '加油站', '中山路 12 號', '餐廳 0012', '停車', '飯店', 'atm'];
  bench('導航進度計算 progress', 20000, i => N._progress(R, I, -800, -800 + (i % 1700), Math.floor((i % 1700) / 200)), 0.3); let qi = 0; const sq = []; (async () => { })();
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 40; i++) { const r = await A.Search.query(qs[i % qs.length]); assert(r.ok); } const searchMs = Number(process.hrtime.bigint() - t0) / 1e6 / 40; rows.push(['搜尋 6000 筆 POI', searchMs]); assert(searchMs <= 60, '搜尋 ' + searchMs.toFixed(1) + ' ms');
  const rp = A.Providers.get('routing'); const t1 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) { const r = await rp.calculate({ to: A.Search.pois[i * 37], mode: i % 2 ? 'shortest' : 'fastest', avoidToll: i % 3 === 0 }); assert(r.ok); } const routeMs = Number(process.hrtime.bigint() - t1) / 1e6 / 20; rows.push(['路線規劃（含替代路線）', routeMs]); assert(routeMs <= 40, '路線 ' + routeMs.toFixed(1) + ' ms');
  bench('速限查詢 limitAt', 20000, i => A.Routing.limitAt(-1000 + (i % 2000), (i * 7) % 2000 - 1000, i % 360), 0.2); bench('沿途天氣 routeWeather', 2000, () => A.Weather.routeWeather(rt.points, rt.duration), 0.5);
  bench('警示沿路線比對 onRoute', 500, () => A.Alerts._onRoute(R, A.Alerts.items.length ? A.Alerts.items : [], N._locate), 2); bench('前方服務 services', 100, () => A.UpAhead.services(), 20);
  A.Nav.start(); A.Gps.setFactor(4); const w = Date.now(); env.tick(300 * 1000); const wall = Date.now() - w; rows.push(['導航中模擬 300 秒（含全部模組）', wall]); assert(wall < 8000, '模擬 300 秒耗時 ' + wall + ' ms');
  console.log('        ' + rows.map(([n, ms]) => `${n} ${ms < 1 ? ms.toFixed(3) : ms.toFixed(1)} ms`).join('；'));
});
test('S9', '資料損壞啟動：本機資料缺漏時優雅降級，不崩潰', async () => {
  const on = await readyEnv(); delete on.idb.stores.packages.get('TW-DEMO@2026.11.15').files['search/index.json']; const e1 = await makeEnv({ idb: on.idb, ls: on.ls, offline: true });
  assert(e1.S.get().offlinePackageStatus === 'limited' && !e1.S.get().offlinePackage.components.search, '缺少必要元件 → 標示不完整'); const o = await e1.A.Assistant.ask('附近有咖啡廳'); assert(/最近的咖啡/.test(o.reply), '只需要 POI 的「附近搜尋」仍可用（優雅降級）'); const q = await e1.A.Search.query('咖啡'); assert(q.ok === false && /不完整/.test(q.message), '文字搜尋不可用且訊息正確：' + q.message); const o2 = await e1.A.Assistant.ask('帶我去 咖啡 0012'); assert(/不完整/.test(o2.reply) && !/尚未安裝/.test(o2.reply), '助理說明資料包不完整，而不是「尚未安裝」：' + o2.reply);
  e1.A.Gps.start(); e1.tick(5000); assert(e1.S.get().speed > 0, 'Demo 行駛仍可運作');
  const on2 = await readyEnv(); on2.idb.stores.packages.delete('TW-DEMO@2026.11.15'); const e2 = await makeEnv({ idb: on2.idb, ls: on2.ls, offline: true }); assert.strictEqual(e2.S.get().offlinePackageStatus, 'error', '紀錄遺失 → 錯誤狀態'); assert.strictEqual(e2.A.Search.pois, null);
  const on3 = await readyEnv(); on3.idb.stores.meta.clear(); const e3 = await makeEnv({ idb: on3.idb, ls: on3.ls, offline: true }); assert.strictEqual(e3.S.get().offlinePackageStatus, 'none', '沒有 active 指標 → 視為尚未安裝');
  const on4 = await readyEnv(); const rec = on4.idb.stores.packages.get('TW-DEMO@2026.11.15'); const b = new Uint8Array(rec.files['poi/poi.json']); b[100] ^= 1; const v = await on4.A.PM.verifyActive(); assert(v.ok === false && v.file === 'poi/poi.json', '位元錯誤可被重新驗證偵測');
});
test('S10', 'IndexedDB 寫入失敗：下載中途失敗可恢復；切換失敗不留下半套資料（原子性）', async () => {
  const env = await makeEnv(); env.A.PM.retry.delay = 0; let n = 0; env.idb.failOn = (store, op) => store === 'staging' && op === 'put' && ++n === 6; await env.install('2026.11.15'); assert(env.last('error') && !env.A.PM.busy(), '暫存寫入失敗 → 回報錯誤'); env.idb.failOn = null; await env.install('2026.11.15'); assert(ready(env), '恢復後完成');
  const e2 = await readyEnv('2026.11.01'); e2.idb.failOn = (store, op) => store === 'meta' && op === 'put'; await e2.install('2026.11.15'); assert(e2.last('error')); e2.idb.failOn = null; const meta = e2.idb.stores.meta.get('active'); assert.strictEqual(meta.version, '2026.11.01', 'active 不變'); assert(!e2.idb.stores.packages.has('TW-DEMO@2026.11.15'), '新版資料包沒有半寫入（交易整筆復原）');
  await e2.A.OM.refresh(); assert(ready(e2) && e2.S.get().offlinePackage.version === '2026.11.01', '舊版仍可用');
});

(async () => {
  let pass = 0, fail = 0; const only = process.argv[2] ? process.argv[2].split(',') : null; process.on('unhandledRejection', e => { console.log('  未處理的 Promise rejection：', e && e.message); fail++; });
  for (const t of T) { if (only && !only.includes(t.id)) continue; const s = Date.now(); try { await t.fn(); pass++; console.log(`PASS  ${t.id.padEnd(3)} ${t.name}  (${Date.now() - s} ms)`); } catch (e) { fail++; console.log(`FAIL  ${t.id.padEnd(3)} ${t.name}\n        ${String(e.message).split('\n')[0]}\n        ${(e.stack || '').split('\n').find(l => /qa_stress|js\//.test(l)) || ''}`); } }
  console.log(`\n壓力與故障注入：${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
