/* AI 助理（Batch 12）：把自然語言轉成「受白名單限制的意圖」，再呼叫已定義的導航動作。
   - 預設後端是本機規則解析（不需網路／金鑰，語句不上傳）。`ai` Provider 可換成 LLM，但 LLM 只能輸出 {intent, slots}，
     一律經 validate() 檢查白名單與欄位型別；是否需要確認由本表決定，不由模型決定。
   - 地點只來自離線資料包、路況只來自離線／模擬事件、天氣只來自 Demo 快照；找不到就說找不到，不編造。 */
(function () {
  const A = window.AIGPS, S = A.State, KEY = 'aigps.routePrefs';
  const CATS = { 加油: ['加油站', '加油', '油站'], 充電: ['充電站', '充電樁', '充電'], 停車: ['停車場', '停車位', '停車'], 咖啡: ['咖啡廳', '咖啡店', '咖啡'], 餐廳: ['餐廳', '餐館', '吃飯', '美食'], 超商: ['超商', '便利商店'], 醫院: ['醫院', '診所'], 景點: ['景點', '觀光'],
    飯店: ['飯店', '旅館', '住宿'], 警察: ['警察局', '派出所', '警局'], 學校: ['學校'], ATM: ['atm', '提款機'], 車站: ['車站', '火車站'], 機場: ['機場'], 休息站: ['休息站', '服務區'], 賣場: ['賣場', '大賣場'] };
  const OPT = { 收費: 'toll', 高速: 'highway', 快速道路: 'highway', 未鋪裝: 'unpaved', 土路: 'unpaved', 渡輪: 'ferry' }, OPT_LABEL = { toll: '收費路段', highway: '高速公路', unpaved: '未鋪裝道路', ferry: '渡輪' };
  const OPT_KEY = { toll: 'avoidToll', highway: 'avoidHighway', unpaved: 'avoidUnpaved', ferry: 'avoidFerry' };
  /* 意圖白名單：slots 型別、是否需要確認 */
  const INTENTS = {
    navigate_to_poi: { slots: { name: 'string' } }, nearest_category: { slots: { cat: Object.keys(CATS) } }, add_waypoint: { slots: { name: 'string' } },
    avoid_option: { slots: { option: Object.keys(OPT_LABEL), value: 'boolean' }, optional: ['value'] }, set_route_mode: { slots: { mode: ['fastest', 'shortest'] } },
    media_control: { slots: { action: ['play', 'pause', 'next', 'prev'] } }, start_navigation: {}, stop_navigation: { confirm: true, desc: '結束目前的導航' }, eta_query: {}, weather_query: { slots: { target: ['here', 'destination'] }, optional: ['target'] }, traffic_query: {},
    voice_toggle: { slots: { on: 'boolean' } }, repeat_instruction: {}, go_home: {}, go_work: {},
    clear_history: { confirm: true, desc: '清除最近目的地紀錄' }, clear_all_places: { confirm: true, desc: '清除所有收藏、最近目的地、家與公司' },
    select_result: { slots: { index: 'int' } }, more_results: {}, waypoint_last: {}, up_ahead: { slots: { cat: Object.keys(CATS) }, optional: ['cat'] }, cities_ahead: {},
    help: {}, confirm: {}, cancel: {}, unknown: {}
  };
  function validate(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-object' };
    const spec = INTENTS[raw.intent]; if (!spec) return { ok: false, reason: 'unknown-intent' };
    const slots = {};
    for (const [k, t] of Object.entries(spec.slots || {})) {
      const v = (raw.slots || {})[k];
      if (v == null) { if (spec.optional && spec.optional.includes(k)) continue; return { ok: false, reason: 'missing-slot:' + k }; }
      if (t === 'string') { if (typeof v !== 'string' || !v.trim() || v.length > 40) return { ok: false, reason: 'bad-slot:' + k }; slots[k] = v.trim(); }
      else if (t === 'boolean') { if (typeof v !== 'boolean') return { ok: false, reason: 'bad-slot:' + k }; slots[k] = v; }
      else if (t === 'int') { if (!Number.isInteger(v) || v < -1 || v > 9) return { ok: false, reason: 'bad-slot:' + k }; slots[k] = v; }
      else if (Array.isArray(t)) { if (!t.includes(v)) return { ok: false, reason: 'bad-slot:' + k }; slots[k] = v; }
    }
    if (raw.intent === 'avoid_option' && slots.value === undefined) slots.value = true;
    if (raw.intent === 'weather_query' && !slots.target) slots.target = 'here';
    return { ok: true, intent: { intent: raw.intent, slots, confirm: !!spec.confirm } };
  }

  /* ---------- 本地規則解析（純函式）---------- */
  const clean = t => String(t || '').trim().replace(/[。！？!?，,~]+$/g, '').trim();
  const I = (intent, slots) => ({ intent, slots: slots || {} });
  const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const catIn = t => { const l = t.toLowerCase(); for (const [c, ws] of Object.entries(CATS)) if (ws.some(w => l.includes(w.toLowerCase()))) return c; return null; };
  function parse(text, cx) {
    cx = cx || {}; const t = clean(text); if (!t) return I('unknown');
    if (/^(確定|確認|好|好的|是|是的|可以|對|yes|ok|okay)$/i.test(t)) return I('confirm');
    if (/^(取消|不要|不用|否|算了|不|no)$/i.test(t)) return I('cancel');
    if (cx.hasResults) {   // 多輪：沿用上一輪的結果清單
      let n = t.match(/^(?:帶我去|導航到|去|選|選擇|我要|就)?\s*第\s*([一二三四五六七八九]|\d)\s*(?:個|間|家|筆)?(?:吧)?$/); if (n) return I('select_result', { index: (NUM[n[1]] || +n[1]) - 1 });
      if (/^(最近的那個|最近的|就最近的)$/.test(t)) return I('select_result', { index: 0 }); if (/^(最後一個|最遠的)$/.test(t)) return I('select_result', { index: -1 });
      if (/^(再|多)(找|給我|來|看)?.*(幾個|一些|更多|一個)$|^(更多|下一頁|下一個)$/.test(t)) return I('more_results');
    }
    if (cx.hasPlace && /^(?:把它|它|這個|那個)?(?:加入|改成|當作|設為)途經點$/.test(t)) return I('waypoint_last');
    if (cx.lastCat && /(呢|換成|改成|改找|^那)/.test(t) && !/\d/.test(t) && t.length <= 14) { const c = catIn(t); if (c) return I('nearest_category', { cat: c }); }
    if (/(結束|停止|中止)導航|導航(結束|停止)/.test(t)) return I('stop_navigation');
    if (/(開始|啟動)導航|^出發$|^開始$/.test(t)) return I('start_navigation');
    if (/(清除|刪除|清空).*(所有|全部).*(資料|地點|紀錄)/.test(t)) return I('clear_all_places');
    if (/(清除|刪除|清空).*(歷史|最近|紀錄)/.test(t)) return I('clear_history');
    const OPTRE = '(收費|高速|快速道路|未鋪裝|土路|渡輪)';
    let m = t.match(new RegExp('(可以走|可走|允許|恢復|取消避開|不用避開|不必避開)(.*?)' + OPTRE)); if (m) return I('avoid_option', { option: OPT[m[3]], value: false });
    m = t.match(new RegExp('(避開|避免|不要走|不走|別走|不要經過)(.*?)' + OPTRE)); if (m) return I('avoid_option', { option: OPT[m[3]], value: true });
    if (/最短/.test(t) && /路線|路徑|路|走/.test(t)) return I('set_route_mode', { mode: 'shortest' });
    if (/最快/.test(t) && /路線|路徑|路|走/.test(t)) return I('set_route_mode', { mode: 'fastest' });
    if (/(還有多久|多久(會)?到|幾點(會)?到|什麼時候(會)?到|還要多久|還有多遠|剩多少|剩餘(時間|距離)|預計.*到)/.test(t)) return I('eta_query');
    if (/(天氣|下雨|會不會雨|氣溫|溫度|冷不冷|熱不熱)/.test(t)) return I('weather_query', { target: /(目的地|那邊|抵達|到了以後)/.test(t) ? 'destination' : 'here' });
    if (/(路況|塞車|事故|道路封閉|施工|交通狀況|前方.*(狀況|有事))/.test(t)) return I('traffic_query');
    if (/(播放|開始播放|繼續播放|放).*(音樂|歌)|^播放$/.test(t)) return I('media_control', { action: 'play' });
    if (/(暫停|停止|關掉|關閉).*(音樂|歌)/.test(t)) return I('media_control', { action: 'pause' });
    if (/(下一首|下一曲|換一首|切歌)/.test(t)) return I('media_control', { action: 'next' });
    if (/(上一首|上一曲)/.test(t)) return I('media_control', { action: 'prev' });
    if (/(開啟|打開|開)(語音|聲音)|恢復語音/.test(t)) return I('voice_toggle', { on: true });
    if (/(靜音|關閉語音|關掉語音|不要.*(語音|說話)|安靜)/.test(t)) return I('voice_toggle', { on: false });
    if (/(再說一次|再講一次|重複|剛剛說什麼|剛才說什麼)/.test(t)) return I('repeat_instruction');
    if (/^(?:帶我|導航|送我)?(?:回家|去我家|到我家|回我家)$/.test(t)) return I('go_home');
    if (/^(?:帶我|導航|送我)?(?:去|到|回)(?:我的)?公司$|^(?:去|到)上班$/.test(t)) return I('go_work');
    if (/(你會做什麼|你能做什麼|你可以做什麼|可以做什麼|幫助|怎麼用|help)/i.test(t)) return I('help');
    if (/(前方|前面|沿途|路上).*(城市|縣市|哪些城|經過哪)/.test(t)) return I('cities_ahead');
    if (/(前方|前面|沿途|路上).*(服務|有什麼|有哪些)|(前方|前面|沿途|路上).*(有沒有|有)/.test(t)) { const c = catIn(t); if (c || /服務|有什麼|有哪些/.test(t)) return I('up_ahead', c ? { cat: c } : {}); }
    if (!/\d/.test(t) && /(最近|附近|旁邊|找|有沒有|哪裡有|哪邊有)/.test(t)) { const c = catIn(t); if (c) return I('nearest_category', { cat: c }); }
    m = t.match(/^(?:順便|途中|中途|經過|途經|先去|加(?:一個)?途經點)(?:去|到|是)?\s*(.+)$/); if (m) return I('add_waypoint', { name: m[1].trim() });
    m = t.match(/^(?:請)?(?:帶我去|帶我到|導航到|導航去|導航至|前往|我要去|我想去|送我去|去)\s*(.+)$/); if (m) return I('navigate_to_poi', { name: m[1].trim() });
    return I('unknown');
  }

  /* ---------- 執行 ---------- */
  const say = (reply, choices) => ({ reply, choices: choices || [] });
  const km = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' 公尺';
  const mins = s => s >= 3600 ? Math.floor(s / 3600) + ' 小時 ' + Math.round(s % 3600 / 60) + ' 分鐘' : Math.max(1, Math.round(s / 60)) + ' 分鐘';
  const hm = iso => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const prefs = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {} };
  const noPkg = '尚未安裝離線資料包，我還找不到地點。請先到「下載中心」下載。';
  let pending = null, backend = null, last = null;   // last：上一輪的結果清單 {cat, list, page, place}
  const PAGE = 3, remember = (cat, list) => { last = { cat, list, page: 0, place: null }; };

  function askConfirm(desc, fn) {
    pending = { run: fn, exp: Date.now() + 60000 };
    return say(`確定要${desc}嗎？請回答「確定」或「取消」。`, [{ label: '確定', run: () => run(validate(I('confirm')).intent) }, { label: '取消', run: () => run(validate(I('cancel')).intent) }]);
  }
  async function planAndApply(reason) {
    const st = S.get(); if (!st.destination) return { ok: false, reply: '請先告訴我要去哪裡。' };
    if (!A.Routing || !A.Routing.ready()) return { ok: false, reply: noPkg };
    const r = await A.Providers.get('routing').calculate(Object.assign({}, prefs(), { waypoints: st.waypoints || [] })); if (!r.ok) return { ok: false, reply: r.message };
    const c = r.candidates[0], summary = `${c.label}路線，約 ${mins(c.duration)}、${km(c.distance)}` + (c.warnings && c.warnings.length ? `（⚠ ${c.warnings[0]}）` : '');
    if (A.Nav && A.Nav.active) A.Nav.applyRoute(c, reason || '已依新設定重新規劃路線', st.waypoints || []);
    else S.set({ route: { label: c.label, points: c.points, distance: c.distance, duration: c.duration, eta: c.eta, demo: true }, alternativeRoutes: r.candidates.slice(1).map(x => ({ label: x.label, points: x.points })), remainingDistance: c.distance, remainingTime: c.duration, ETA: c.eta, navigationStatus: 'planning' });
    return { ok: true, summary };
  }
  async function doGo(p, stopFirst) {
    if (stopFirst && A.Nav && A.Nav.active) A.Nav.stop(); A.Places.setDestination(p);
    const r = await planAndApply(); if (!r.ok) return say(`已設定目的地：${p.name}。${r.reply}`);
    return say(`已設定目的地：${p.name}（${p.cat}）。${r.summary}。要開始導航嗎？`, [{ label: '開始導航', run: () => EXEC.start_navigation() }]);
  }
  const retarget = p => { if (!last) remember(null, [p]); last.place = p; return retarget0(p); };
  const retarget0 = p => (A.Nav && A.Nav.active) ? askConfirm(`結束目前導航並改往「${p.name}」`, () => doGo(p, true)) : doGo(p, false);
  async function pickPlace(res, name, onPick) {
    if (!res.ok) return say(res.message);
    if (!res.results.length) return say(`找不到「${name}」。我只能搜尋已下載的離線資料，不會猜測地點。`);
    if (res.results.length === 1 || res.results[0].name.toLowerCase() === name.toLowerCase()) return onPick(res.results[0]);
    remember(null, res.results);
    return say(`找到 ${res.total} 個符合「${name}」的地點，請選擇：`, res.results.slice(0, 3).map(p => ({ label: `${p.name}（${km(p.dist)}）`, run: () => onPick(p) })));
  }

  const EXEC = {
    navigate_to_poi: async ({ name }) => pickPlace(await A.Search.query(name, { limit: 5 }), name, retarget),
    nearest_category: async ({ cat }) => {
      const r = await A.Search.nearby(cat, 5000, 10); if (!r.ok) return say(noPkg);
      if (!r.results.length) { last = null; return say(`5 公里內找不到${cat}（僅搜尋已下載的離線資料）。`); }
      remember(cat, r.results); const top = r.results.slice(0, PAGE);
      return say(`最近的${cat}：${top.map(p => `${p.name}（${km(p.dist)}）`).join('、')}。要導航到哪一個？（可以說「第二個」或「再多找幾個」）`, top.map(p => ({ label: `導航到 ${p.name}`, run: () => retarget(p) })));
    },
    select_result: async ({ index }) => {
      if (!last) return say('目前沒有可選擇的結果。'); const pageList = last.list.slice(last.page * PAGE, last.page * PAGE + PAGE), p = index === -1 ? pageList[pageList.length - 1] : pageList[index];
      return p ? retarget(p) : say(`目前這一頁沒有第 ${index + 1} 個結果。`);
    },
    more_results: async () => {
      if (!last) return say('目前沒有可繼續的搜尋。'); const next = last.list.slice((last.page + 1) * PAGE, (last.page + 2) * PAGE); if (!next.length) return say('沒有更多結果了。');
      last.page++; return say(`接著是：${next.map(p => `${p.name}（${km(p.dist)}）`).join('、')}。`, next.map(p => ({ label: `導航到 ${p.name}`, run: () => retarget(p) })));
    },
    waypoint_last: async () => {
      if (!last || !last.place) return say('我不確定你指的是哪個地點，請先選擇一個。'); const p = last.place, w = A.Places.addWaypoint(p); if (!w.ok) return say(w.message);
      const r = S.get().destination ? await planAndApply('已加入途經點並重新規劃路線') : null; return say(`已把「${p.name}」加入途經點。` + (r ? (r.ok ? r.summary + '。' : r.reply) : ''));
    },
    up_ahead: async ({ cat }) => {
      const r = A.UpAhead.services(cat, 3); if (!r.ok) return say(r.reason === 'NO_PACKAGE' ? noPkg : '請先選用路線，我才能查前方的服務。');
      if (!r.results.length) return say(`路線前方 30 公里內沒有找到${cat || '服務設施'}（僅搜尋離線資料）。`);
      return say(`前方${cat || '服務'}：${r.results.map(p => `${p.name}（前方 ${km(p.ahead)}）`).join('、')}。要加入途經點嗎？`, r.results.map(p => ({ label: `加入 ${p.name}`, run: async () => { const x = await A.UpAhead.addWaypoint(p); return say(x.ok ? `已加入途經點：${p.name}。${x.summary}。` : x.reply); } })));
    },
    cities_ahead: async () => {
      const r = A.UpAhead.cities(6); if (!r.ok) return say(r.reason === 'NO_PACKAGE' ? noPkg : '請先選用路線，我才能查前方的城市。');
      return say(r.results.length ? `路線前方會經過或靠近：${r.results.map(c => `${c.name}（前方 ${km(c.ahead)}）`).join('、')}。` : '路線前方沒有已知的城市。');
    },
    add_waypoint: async ({ name }) => pickPlace(await A.Search.query(name, { limit: 5 }), name, async p => {
      const w = A.Places.addWaypoint(p); if (!w.ok) return say(w.message); const r = S.get().destination ? await planAndApply('已加入途經點並重新規劃路線') : null;
      return say(`已加入途經點：${p.name}。` + (r ? (r.ok ? r.summary + '。' : r.reply) : '設定目的地後會一併規劃。'));
    }),
    avoid_option: async ({ option, value }) => {
      if (option === 'ferry') return say('資料包沒有渡輪資料，「避開渡輪」無法生效。');
      const p = prefs(); p[OPT_KEY[option]] = value; savePrefs(p); const head = `已${value ? '' : '取消'}避開${OPT_LABEL[option]}。`;
      if (!S.get().destination) return say(head + '設定目的地後生效。'); const r = await planAndApply('已依新設定重新規劃路線'); return say(head + (r.ok ? r.summary + '。' : r.reply));
    },
    set_route_mode: async ({ mode }) => {
      const p = prefs(); p.mode = mode; savePrefs(p); const head = `已改為${mode === 'shortest' ? '最短' : '最快'}路線偏好。`;
      if (!S.get().destination) return say(head + '設定目的地後生效。'); const r = await planAndApply('已依新設定重新規劃路線'); return say(head + (r.ok ? r.summary + '。' : r.reply));
    },
    start_navigation: async () => {
      if (A.Nav.active) return say('已經在導航中。');
      if (!S.get().route) { if (!S.get().destination) return say('請先告訴我要去哪裡，例如「帶我去 咖啡 0012」。'); const r = await planAndApply(); if (!r.ok) return say(r.reply); }
      const b = typeof document !== 'undefined' && document && document.getElementById ? document.getElementById('btnNav') : null; b ? b.click() : A.Nav.start(); return say('開始導航。');
    },
    stop_navigation: async () => { if (!A.Nav.active) return say('目前沒有進行中的導航。'); A.Nav.stop(); return say('已結束導航。'); },
    eta_query: async () => {
      const s = S.get();
      if (A.Nav.active && s.ETA) return say(`預計 ${hm(s.ETA)} 抵達，還有 ${km(s.remainingDistance)}、約 ${mins(s.remainingTime)}（依規劃路線估算）。`);
      if (s.route) return say(`目前選定的路線約 ${mins(s.route.duration)}、${km(s.route.distance)}。尚未開始導航。`); return say('目前沒有路線。請先設定目的地。');
    },
    weather_query: async ({ target }) => {
      const s = S.get(); let w = s.weather;
      if (target === 'destination') { if (!s.destination || !A.Weather) return say('尚未設定目的地。'); w = A.Weather.summary(A.Weather.zoneOf(s.destination.x, s.destination.y), s.route && s.route.eta ? Date.parse(s.route.eta) : Date.now()); }
      if (!w) return say('目前沒有天氣資料。');
      return say(`${target === 'destination' ? '目的地所在的' : ''}${w.zoneName}：${w.label}，${w.temp}°C，降雨機率 ${w.rain}%。${w.advice ? w.advice + '。' : ''}這是 Demo 離線快照（資料時間 ${hm(w.asOf)}），並非即時氣象。${w.ageLevel !== 'fresh' ? '資料已過時，僅供參考。' : ''}`);
    },
    traffic_query: async () => {
      const ev = S.get().trafficEvents || [], src = { offline: '離線事件', simulated: '模擬事件' };
      return say(ev.length ? `目前已知 ${ev.length} 個交通事件：${ev.map(e => `${e.label}（${src[e.source] || e.source}）`).join('、')}。本系統並未接入交通即時資料，只有離線與模擬事件。` : '目前沒有已知的交通事件。本系統並未接入交通即時資料，只有離線與模擬事件。');
    },
    media_control: async ({ action }) => {
      if (!A.Media) return say('這個裝置沒有可用的媒體功能。'); const r = action === 'play' ? A.Media.play() : action === 'pause' ? A.Media.pause() : action === 'next' ? A.Media.next() : A.Media.prev();
      return say(action === 'pause' ? '已暫停音樂。' : `播放：${r.title}${r.demo ? '（DEMO 合成音）' : ''}。`);
    },
    voice_toggle: async ({ on }) => { A.Voice.prefs.on = on; A.Voice.save(); if (!on) A.Voice.stop(); return say(on ? '已開啟語音播報。' : '已關閉語音播報。'); },
    repeat_instruction: async () => { const c = S.get().currentInstruction; if (!c || !c.label) return say('目前沒有導航指示。'); if (A.Voice) A.Voice.speak(c.label, 2, 5000); return say(c.label + (c.distance ? `（約 ${km(c.distance)}）` : '')); },
    go_home: async () => { const h = A.Places.get().home; return h ? retarget(h) : say('尚未設定「家」。可以在「POI」頁的地點詳情設定。'); },
    go_work: async () => { const h = A.Places.get().work; return h ? retarget(h) : say('尚未設定「公司」。可以在「POI」頁的地點詳情設定。'); },
    clear_history: async () => { A.Places.clearHistory(); return say('已清除最近目的地。'); },
    clear_all_places: async () => { A.Places.clearAll(); return say('已清除所有收藏、最近目的地、家與公司。'); },
    help: async () => say('我可以：帶你去地點（「帶我去 咖啡 0012」）、找最近的加油站／停車場／充電站等、加途經點、避開收費／高速／未鋪裝、改最快或最短路線、開始或結束導航、查剩餘時間、天氣、路況、開關語音、重複導航指示、回家或去公司。我只會使用已下載的離線資料，不會編造地點或路況。'),
    unknown: async () => say('抱歉，我聽不懂這個指令。你可以試試：「帶我去最近的加油站」、「避開收費路段」、「還有多久到」、「天氣如何」。')
  };
  async function run(it) {
    const n = it.intent;
    if (n === 'confirm') { if (!pending || Date.now() > pending.exp) { pending = null; return say('目前沒有需要確認的操作。'); } const p = pending; pending = null; return p.run(); }
    if (n === 'cancel') { const had = !!pending; pending = null; return say(had ? '好的，已取消。' : '好的。'); }
    if (it.confirm) return askConfirm(INTENTS[n].desc, () => EXEC[n](it.slots));
    return EXEC[n](it.slots);
  }

  const local = { name: 'Local Rule Parser（本機）', isDemo: false, local: true, parse: (t, cx) => Promise.resolve(parse(t, cx)) };
  backend = local;
  const log = (role, text) => S.set({ aiConversation: (S.get().aiConversation || []).concat({ role, text, t: Date.now() }).slice(-30) });
  const ctx = () => ({ navigating: !!(A.Nav && A.Nav.active), hasRoute: !!S.get().route, hasDestination: !!S.get().destination, hasResults: !!(last && last.list && last.list.length), lastCat: last ? last.cat : null, hasPlace: !!(last && last.place) });
  /* 多意圖：以連接詞切開，每一段都解析成明確意圖才採用；否則視為單一指令 */
  function splitIntents(text, cx) {
    const parts = clean(text).split(/[，,；;]|並且|而且|然後|接著|同時|之後再/).map(x => x.trim()).filter(Boolean); if (parts.length < 2 || parts.length > 4) return null;
    const vs = parts.map(x => validate(parse(x, cx))); return vs.every(x => x.ok && !['unknown', 'confirm', 'cancel'].includes(x.intent.intent)) ? vs.map(x => x.intent) : null;
  }
  async function ask(text) {
    log('user', text); const cx = ctx(); let raw = null, list = null;
    try { raw = await backend.parse(text, cx); } catch (e) { A.Log.warn('AI 後端失敗', String(e)); }
    if (raw && Array.isArray(raw.intents)) { const vs = raw.intents.slice(0, 4).map(validate); if (vs.length && vs.every(x => x.ok)) list = vs.map(x => x.intent); }   // 後端回傳多個意圖：逐一驗證
    let v = null;
    if (!list && backend === local) list = splitIntents(text, cx);   // 本機規則：先嘗試把多個指令拆開
    if (!list) { v = validate(raw); if (!v.ok) { if (backend !== local) A.Log.warn('AI 後端輸出不合規，改用本地規則', v.reason); list = splitIntents(text, cx); if (!list) { v = validate(parse(text, cx)); list = [v.intent]; } } else list = [v.intent]; }
    const lines = []; let out = say('');
    for (const it of list) {
      try { out = await run(it); } catch (e) { A.Log.error('助理執行失敗', String(e)); out = say('執行時發生錯誤，請稍後再試。'); }
      lines.push(out.reply); if (it.confirm && pending) break;   // 需要確認的操作：後面的步驟等確認後再說
    }
    const reply = lines.join('\n'); log('assistant', reply); if (A.Nav && A.Nav.active && A.Voice) A.Voice.speak(reply, 1, 6000);
    return Object.assign({ intent: list[0].intent, intents: list.map(x => x.intent) }, out, { reply });
  }
  const api = { ask, parse, validate, splitIntents, INTENTS, CATS, run, exec: EXEC, get pending() { return pending; },
    setBackend(p) { if (!p || typeof p.parse !== 'function') throw new Error('AI 後端必須提供 parse(text, ctx)'); backend = p; A.Providers.register('ai', p); }, useLocal() { backend = local; A.Providers.register('ai', local); }, _planAndApply: planAndApply };
  A.Assistant = api; A.Providers.register('ai', local);
})();
