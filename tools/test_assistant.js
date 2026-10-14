// AI 助理單元測試（node tools/test_assistant.js）
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync('js/assistant.js', 'utf8');
function mk() {
  const store = {}, calls = [], st = { destination: null, route: null, waypoints: [], aiConversation: [], trafficEvents: [], weather: null, currentInstruction: null, ETA: null }, spoken = [];
  const P = (id, name, cat, dist) => ({ id, name, cat, dist, x: id * 10, y: 0 });
  const ALL = [P(30, 'Demo 餐廳 0030', '餐廳', 500), P(1, 'Demo 咖啡 0001', '咖啡', 100), P(12, 'Demo 咖啡 0012', '咖啡', 300), P(4, 'Demo 咖啡 0004', '咖啡', 400), P(7, 'Demo 咖啡 0007', '咖啡', 700), P(9, 'Demo 咖啡 0009', '咖啡', 900)];
  const places = { home: null, work: null, setDestination(p) { calls.push(['dest', p.name]); st.destination = p; st.route = null; }, addWaypoint(p) { if (st.waypoints.length >= 3) return { ok: false, message: '最多 3 個途經點' }; st.waypoints = st.waypoints.concat(p); return { ok: true }; }, get: () => places, clearHistory() { calls.push(['clearHistory']); }, clearAll() { calls.push(['clearAll']); } };
  const nav = { active: false, stop() { calls.push(['navStop']); nav.active = false; }, start() { calls.push(['navStart']); nav.active = true; return { ok: true }; }, applyRoute(c, reason) { calls.push(['apply', reason]); } };
  const cand = { label: '最快', points: [[0, 0], [0, 100]], distance: 1200, duration: 600, eta: new Date(1e12 + 6e5).toISOString(), warnings: [] };
  const A = { Log: { info() {}, warn() {}, error() {} }, Providers: { reg: {}, register(k, o) { this.reg[k] = o; }, get(k) { return this.reg[k]; } },
    State: { get: () => st, set(p) { Object.assign(st, p); } }, Places: places, Nav: nav,
    Search: { query: async (q) => { const toks = q.toLowerCase().split(/\s+/), r = ALL.filter(p => toks.every(x => p.name.toLowerCase().includes(x))); return { ok: true, total: r.length, results: r }; }, nearby: async (cat, rad, lim) => { const r = ALL.filter(p => p.cat === cat); return { ok: true, total: r.length, results: r.slice(0, lim || 3) }; } },
    UpAhead: { services: (cat) => ({ ok: true, results: [{ id: 50, name: '前方加油 A', cat: cat || '加油', x: 0, y: 500, ahead: 1200, off: 10 }] }), cities: () => ({ ok: true, results: [{ id: 1, name: '示範城', ahead: 3400 }] }), addWaypoint: async (p) => { calls.push(['upWp', p.name]); return { ok: true, summary: '最快路線' }; } },
    Media: { play: () => { calls.push(['mediaPlay']); return { ok: true, title: '測試音軌 1（合成音）', demo: true }; }, pause: () => { calls.push(['mediaPause']); return { ok: true }; }, next: () => { calls.push(['mediaNext']); return { ok: true, title: '測試音軌 2（合成音）', demo: true }; }, prev: () => { calls.push(['mediaPrev']); return { ok: true, title: '測試音軌 3（合成音）', demo: true }; } },
    Routing: { ready: () => true }, Voice: { prefs: { on: true }, save() { calls.push(['voiceSave']); }, stop() {}, speak(t) { spoken.push(t); } },
    Weather: { zoneOf: () => 'NE', summary: () => ({ zoneName: '東北區', label: '降雨', temp: 22, rain: 80, advice: '路面濕滑，請放慢速度並加大車距', asOf: 1e12, ageLevel: 'fresh' }) } };
  A.Providers.register('routing', { calculate: async (o) => { calls.push(['calc', JSON.stringify(o)]); return { ok: true, candidates: [cand] }; } });
  vm.runInNewContext(code, { window: { AIGPS: A }, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, document: null, Date, Math, Promise });
  return { A, st, calls, spoken, nav, places, store, as: A.Assistant };
}
const J = o => JSON.parse(JSON.stringify(o));
// 1 解析表
const T = mk(), parse = t => J(T.as.parse(t));
const table = [
  ['帶我去 咖啡 0012', 'navigate_to_poi', { name: '咖啡 0012' }], ['導航到台北車站。', 'navigate_to_poi', { name: '台北車站' }], ['我要去 餐廳 0003', 'navigate_to_poi', { name: '餐廳 0003' }],
  ['帶我去最近的加油站', 'nearest_category', { cat: '加油' }], ['附近有沒有咖啡廳', 'nearest_category', { cat: '咖啡' }], ['找最近的停車場', 'nearest_category', { cat: '停車' }], ['哪裡有充電站', 'nearest_category', { cat: '充電' }],
  ['避開收費路段', 'avoid_option', { option: 'toll', value: true }], ['不要走高速公路', 'avoid_option', { option: 'highway', value: true }], ['可以走高速了', 'avoid_option', { option: 'highway', value: false }], ['避開渡輪', 'avoid_option', { option: 'ferry', value: true }],
  ['走最短的路線', 'set_route_mode', { mode: 'shortest' }], ['我要最快路線', 'set_route_mode', { mode: 'fastest' }],
  ['順便去 咖啡 0004', 'add_waypoint', { name: '咖啡 0004' }], ['開始導航', 'start_navigation', {}], ['結束導航', 'stop_navigation', {}], ['還有多久到', 'eta_query', {}], ['幾點會到', 'eta_query', {}],
  ['天氣如何', 'weather_query', { target: 'here' }], ['目的地會下雨嗎', 'weather_query', { target: 'destination' }], ['前方有塞車嗎', 'traffic_query', {}], ['有事故嗎', 'traffic_query', {}],
  ['靜音', 'voice_toggle', { on: false }], ['開啟語音', 'voice_toggle', { on: true }], ['再說一次', 'repeat_instruction', {}], ['回家', 'go_home', {}], ['導航回家', 'go_home', {}], ['去公司', 'go_work', {}],
  ['前面有加油站嗎', 'up_ahead', { cat: '加油' }], ['前方有什麼服務', 'up_ahead', {}], ['前方會經過哪些城市', 'cities_ahead', {}], ['播放音樂', 'media_control', { action: 'play' }], ['暫停音樂', 'media_control', { action: 'pause' }], ['關掉音樂', 'media_control', { action: 'pause' }], ['下一首', 'media_control', { action: 'next' }], ['上一首', 'media_control', { action: 'prev' }],
  ['清除最近目的地', 'clear_history', {}], ['清除所有資料', 'clear_all_places', {}], ['你可以做什麼', 'help', {}], ['確定', 'confirm', {}], ['取消', 'cancel', {}], ['今天晚餐吃什麼好呢', 'unknown', {}], ['', 'unknown', {}]
];
table.forEach(([u, intent, slots]) => { const r = parse(u); assert.strictEqual(r.intent, intent, `「${u}」→ ${r.intent}`); assert.deepStrictEqual(r.slots, slots, `「${u}」槽位`); });
assert.strictEqual(parse('帶我去咖啡 0012').intent, 'navigate_to_poi', '含數字的名稱不當作類別查詢');
// 2 白名單驗證
const V = x => T.as.validate(x);
assert.strictEqual(V({ intent: 'drop_database', slots: {} }).ok, false, '未知意圖被拒'); assert.strictEqual(V({ intent: 'navigate_to_poi', slots: {} }).ok, false, '缺少槽位被拒');
assert.strictEqual(V({ intent: 'navigate_to_poi', slots: { name: 123 } }).ok, false, '槽位型別錯誤被拒'); assert.strictEqual(V({ intent: 'navigate_to_poi', slots: { name: 'x'.repeat(100) } }).ok, false, '過長被拒');
assert.strictEqual(V({ intent: 'avoid_option', slots: { option: 'rm -rf', value: true } }).ok, false, '列舉外的值被拒'); assert.strictEqual(V(null).ok, false); assert.strictEqual(V('stop').ok, false);
assert.strictEqual(V({ intent: 'stop_navigation', slots: {}, confirm: false }).intent.confirm, true, '需確認由程式表決定，不聽模型');
assert.deepStrictEqual(J(V({ intent: 'navigate_to_poi', slots: { name: ' 咖啡 ', evil: 'x' } }).intent.slots), { name: '咖啡' }, '多餘槽位被丟棄'); assert.strictEqual(V({ intent: 'avoid_option', slots: { option: 'toll' } }).intent.slots.value, true);
// 3 執行：找地點、不編造
(async () => {
  let t = mk(); let o = await t.as.ask('帶我去 咖啡 0012'); assert(t.calls.some(c => c[0] === 'dest' && c[1] === 'Demo 咖啡 0012') && o.reply.includes('已設定目的地') && t.st.route && t.st.route.points, '單一結果直接設定並規劃'); assert(o.choices.some(c => c.label === '開始導航'));
  t = mk(); o = await t.as.ask('帶我去 不存在的地方'); assert(o.reply.includes('找不到') && !t.calls.some(c => c[0] === 'dest') && t.st.destination === null, '找不到就不設定，不猜測');
  t = mk(); o = await t.as.ask('帶我去 咖啡'); assert(o.choices.length === 3 && o.reply.includes('請選擇') && t.st.destination === null, '多個符合先讓使用者選'); await o.choices[2].run(); assert.strictEqual(t.st.destination.name, 'Demo 咖啡 0004');
  t = mk(); o = await t.as.ask('帶我去最近的咖啡'); assert(o.choices.length === 3 && /Demo 咖啡 0001/.test(o.reply)); t = mk(); o = await t.as.ask('最近的加油站'); assert(o.reply.includes('找不到'), '附近沒有就如實說沒有');
  t = mk(); o = await t.as.ask('今天晚餐吃什麼好呢'); assert(o.intent === 'unknown' && /聽不懂/.test(o.reply) && !t.calls.length, '聽不懂不亂動作');
  // 4 偏好與重新規劃
  t = mk(); o = await t.as.ask('避開收費路段'); assert(JSON.parse(t.store['aigps.routePrefs']).avoidToll === true && /設定目的地後生效/.test(o.reply), '無目的地時只記住偏好');
  await t.as.ask('帶我去 咖啡 0012'); o = await t.as.ask('避開高速'); assert(/重新|最快路線/.test(o.reply) || /約/.test(o.reply)); const last = JSON.parse(t.calls.filter(c => c[0] === 'calc').pop()[1]); assert(last.avoidToll && last.avoidHighway, '規劃時帶入累積的避開條件');
  o = await t.as.ask('可以走高速了'); assert.strictEqual(JSON.parse(t.store['aigps.routePrefs']).avoidHighway, false);
  o = await t.as.ask('避開渡輪'); assert(/沒有渡輪資料/.test(o.reply) && JSON.parse(t.store['aigps.routePrefs']).avoidFerry === undefined, '無資料的選項如實說明且不寫入');
  t = mk(); await t.as.ask('最短路線'); assert.strictEqual(JSON.parse(t.store['aigps.routePrefs']).mode, 'shortest');
  t = mk(); await t.as.ask('帶我去 咖啡 0012'); t.nav.active = true; o = await t.as.ask('避開收費'); assert(t.calls.some(c => c[0] === 'apply'), '導航中直接套用新路線');
  // 5 危險操作需確認
  t = mk(); t.nav.active = true; o = await t.as.ask('結束導航'); assert(/確定要結束目前的導航嗎/.test(o.reply) && t.nav.active && !t.calls.some(c => c[0] === 'navStop'), '先問再做'); o = await t.as.ask('取消'); assert(t.nav.active && /已取消/.test(o.reply)); assert.strictEqual(t.as.pending, null);
  o = await t.as.ask('結束導航'); o = await t.as.ask('確定'); assert(!t.nav.active && /已結束導航/.test(o.reply), '確認後才執行');
  t = mk(); o = await t.as.ask('清除所有資料'); assert(!t.calls.some(c => c[0] === 'clearAll')); await t.as.ask('確定'); assert(t.calls.some(c => c[0] === 'clearAll'));
  t = mk(); o = await t.as.ask('確定'); assert(/沒有需要確認/.test(o.reply) && !t.calls.length, '沒有待確認操作時「確定」無效');
  t = mk(); await t.as.ask('清除最近目的地'); t.as.pending.exp = 0; o = await t.as.ask('確定'); assert(!t.calls.some(c => c[0] === 'clearHistory'), '確認逾時失效');
  t = mk(); t.nav.active = true; t.places.home = { id: 1, name: '我家', cat: '住家', x: 0, y: 0 }; o = await t.as.ask('回家'); assert(/確定要結束目前導航並改往「我家」/.test(o.reply) && t.st.destination === null, '導航中改目的地需確認'); await t.as.ask('確定'); assert(t.st.destination.name === '我家' && t.calls.some(c => c[0] === 'navStop'));
  t = mk(); o = await t.as.ask('回家'); assert(/尚未設定「家」/.test(o.reply));
  // 6 查詢回答的誠實度
  t = mk(); t.st.weather = { zoneName: '東北區', label: '降雨', temp: 22, rain: 80, advice: '路面濕滑', asOf: 1e12, ageLevel: 'stale' }; o = await t.as.ask('天氣如何'); assert(/Demo 離線快照/.test(o.reply) && /並非即時氣象/.test(o.reply) && /已過時/.test(o.reply));
  t = mk(); o = await t.as.ask('前方有塞車嗎'); assert(/沒有已知的交通事件/.test(o.reply) && /並未接入交通即時資料/.test(o.reply)); t.st.trafficEvents = [{ label: '壅塞（模擬）', source: 'simulated' }]; o = await t.as.ask('路況'); assert(/壅塞（模擬）（模擬事件）/.test(o.reply));
  t = mk(); o = await t.as.ask('還有多久到'); assert(/沒有路線/.test(o.reply)); t.nav.active = true; t.st.ETA = new Date(1e12).toISOString(); t.st.remainingDistance = 2400; t.st.remainingTime = 900; o = await t.as.ask('還有多久到'); assert(/還有 2.4 km/.test(o.reply) && /15 分鐘/.test(o.reply) && /估算/.test(o.reply));
  t = mk(); o = await t.as.ask('靜音'); assert.strictEqual(t.A.Voice.prefs.on, false); t.st.currentInstruction = { label: '300 公尺後右轉', distance: 300 }; o = await t.as.ask('再說一次'); assert(/300 公尺後右轉/.test(o.reply));
  // 7 對話與語音
  t = mk(); t.nav.active = true; await t.as.ask('你可以做什麼'); assert(t.spoken.length === 1, '導航中助理回覆會朗讀'); t = mk(); for (let i = 0; i < 20; i++) await t.as.ask('你可以做什麼'); assert.strictEqual(t.st.aiConversation.length, 30, '對話最多保留 30 則');
  // 8 後端替換：LLM 輸出必須合規
  t = mk(); t.as.setBackend({ name: 'fake-llm', parse: async () => ({ intent: 'format_disk', slots: {} }) }); o = await t.as.ask('開始導航'); assert(o.intent === 'start_navigation' || /請先告訴我要去哪裡/.test(o.reply), '後端輸出不合規時退回本機規則');
  t.as.setBackend({ name: 'fake-llm2', parse: async () => ({ intent: 'stop_navigation', slots: {}, confirm: false }) }); t.nav.active = true; o = await t.as.ask('隨便說一句'); assert(/確定要結束/.test(o.reply) && t.nav.active, 'LLM 要求結束導航仍須經確認');
  t.as.setBackend({ name: 'broken', parse: async () => { throw new Error('boom'); } }); o = await t.as.ask('你可以做什麼'); assert(/我可以/.test(o.reply), '後端丟例外時退回本機規則'); assert.throws(() => t.as.setBackend({}), /parse/);
  // 9 多輪上下文（規格：連續三輪搜尋，上下文不丟失）
  t = mk(); o = await t.as.ask('附近有咖啡廳'); assert(o.choices.length === 3 && /0001/.test(o.reply));
  o = await t.as.ask('再多找幾個'); assert(/0007/.test(o.reply) && /0009/.test(o.reply) && o.choices.length === 2, '第二輪沿用上一輪的搜尋，接著列出後面的結果');
  o = await t.as.ask('第一個'); assert(t.st.destination && t.st.destination.name === 'Demo 咖啡 0007', '第三輪「第一個」指的是目前這一頁的第一個');
  t = mk(); await t.as.ask('附近有咖啡廳'); o = await t.as.ask('換成餐廳'); assert(/Demo 餐廳 0030/.test(o.reply), '換成另一個類別仍沿用「附近搜尋」意圖'); o = await t.as.ask('第一個'); assert.strictEqual(t.st.destination.name, 'Demo 餐廳 0030', '選到的是最新一輪的結果');
  t = mk(); await t.as.ask('附近有咖啡廳'); await t.as.ask('再多找幾個'); o = await t.as.ask('再多找幾個'); assert(/沒有更多/.test(o.reply)); o = await t.as.ask('第三個'); assert(/沒有第 3 個/.test(o.reply) && t.st.destination === null, '超出範圍不亂選');
  t = mk(); o = await t.as.ask('第二個'); assert.strictEqual(o.intent, 'unknown', '沒有上一輪結果時，「第二個」不會被亂解讀'); o = await t.as.ask('換成餐廳'); assert.strictEqual(o.intent, 'unknown');
  t = mk(); await t.as.ask('帶我去 咖啡 0012'); o = await t.as.ask('把它加入途經點'); assert(t.st.waypoints.length === 1 && t.st.waypoints[0].name === 'Demo 咖啡 0012' && /已把「Demo 咖啡 0012」加入途經點/.test(o.reply), '「它」指最近一次選定的地點');
  t = mk(); o = await t.as.ask('把它加入途經點'); assert.strictEqual(o.intent, 'unknown', '沒有可指的地點時不猜測');
  // 10 多意圖
  t = mk(); o = await t.as.ask('避開收費並且帶我去 咖啡 0012'); assert.deepStrictEqual(J(o.intents), ['avoid_option', 'navigate_to_poi']); assert(t.st.destination && t.st.destination.name === 'Demo 咖啡 0012' && JSON.parse(t.calls.filter(c => c[0] === 'calc').pop()[1]).avoidToll === true, '兩件事都做了，且依序套用'); assert(o.reply.split('\n').length === 2);
  t = mk(); t.nav.active = true; o = await t.as.ask('避開收費，然後結束導航'); assert(/設定目的地後生效|已避開/.test(o.reply) && /確定要結束目前的導航嗎/.test(o.reply) && t.nav.active, '多意圖中的危險操作仍需確認');
  t = mk(); o = await t.as.ask('帶我去 咖啡 0012，然後唱首歌'); assert(!o.intents || o.intents.length === 1, '有一段聽不懂就不拆開執行'); assert.strictEqual(t.st.destination, null);
  t = mk(); t.as.setBackend({ name: 'multi', parse: async () => ({ intents: [{ intent: 'avoid_option', slots: { option: 'toll' } }, { intent: 'set_route_mode', slots: { mode: 'shortest' } }] }) }); o = await t.as.ask('隨便'); const pr = JSON.parse(t.store['aigps.routePrefs']); assert(pr.avoidToll === true && pr.mode === 'shortest', '後端可一次回傳多個意圖');
  t.as.setBackend({ name: 'multi-bad', parse: async () => ({ intents: [{ intent: 'avoid_option', slots: { option: 'toll' } }, { intent: 'format_disk', slots: {} }] }) }); t.store['aigps.routePrefs'] = '{}'; o = await t.as.ask('你可以做什麼'); assert(/我可以/.test(o.reply) && !JSON.parse(t.store['aigps.routePrefs']).avoidToll, '多意圖中有任何一個不合規就整批丟棄');
  assert.strictEqual(V({ intent: 'select_result', slots: { index: 12 } }).ok, false); assert.strictEqual(V({ intent: 'select_result', slots: { index: 1.5 } }).ok, false); assert.strictEqual(V({ intent: 'select_result', slots: { index: -1 } }).ok, true);
  // 11 前方服務
  t = mk(); o = await t.as.ask('前面有加油站嗎'); assert(/前方加油 A（前方 1.2 km）/.test(o.reply) && o.choices.length === 1); await o.choices[0].run(); assert(t.calls.some(c => c[0] === 'upWp' && c[1] === '前方加油 A'), '可直接把前方服務加入途經點');
  t = mk(); o = await t.as.ask('前方會經過哪些城市'); assert(/示範城（前方 3.4 km）/.test(o.reply));
  // 12 音樂控制（規格：播放／暫停音樂）；靜音導航不影響音樂
  t = mk(); o = await t.as.ask('播放音樂'); assert(t.calls.some(c => c[0] === 'mediaPlay') && /播放：測試音軌 1（合成音）（DEMO 合成音）/.test(o.reply)); o = await t.as.ask('暫停音樂'); assert(t.calls.some(c => c[0] === 'mediaPause') && /已暫停音樂/.test(o.reply));
  o = await t.as.ask('下一首'); assert(/測試音軌 2/.test(o.reply)); t.calls.length = 0; o = await t.as.ask('靜音'); assert(!t.calls.some(c => String(c[0]).startsWith('media')), '靜音導航語音不會動到音樂'); assert.strictEqual(t.A.Voice.prefs.on, false);
  assert.strictEqual(V({ intent: 'media_control', slots: { action: 'format' } }).ok, false, '音樂動作只接受白名單值');
  console.log('assistant tests PASS');
})().catch(e => { console.error('FAIL', e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); });
