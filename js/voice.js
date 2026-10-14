/* 語音播報（Batch 11）：使用瀏覽器內建 SpeechSynthesis，不需網路或金鑰。
   是否有中文語音取決於使用者的裝置／瀏覽器；沒有時退回提示音，並在設定面板明確告知。
   優先序：警示(3) > 導航指示(2) > 一般提示(1)；高優先可打斷低優先，過期的排隊語音會被丟棄。 */
(function () {
  const A = window.AIGPS, S = A.State, KEY = 'aigps.voice';
  const prefs = { on: true, volume: 0.9, rate: 1, voiceURI: null, nav: true, alerts: true, notices: true };
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p) Object.assign(prefs, p); } catch (_) {}
  const ARANK = { warn: 1, near: 2, now: 3 };   // 駕駛警示的階段（與導航指示的距離階段不同）
  const ss = window.speechSynthesis, UT = window.SpeechSynthesisUtterance, RANK = { far: 0, '500': 1, '300': 2, '100': 3, now: 4 }, DIST = { '500': '500 公尺', '300': '300 公尺', '100': '100 公尺' };
  const speakSubs = new Set(); let speaking = false;
  const setSpeaking = b => { if (b !== speaking) { speaking = b; speakSubs.forEach(f => { try { f(b); } catch (_) {} }); } };
  let cur = null, queue = [], lastKey = '', lastRank = 0, lastStatus = null, lastNotice = null; const lastAlert = {}, overAt = {}, subs = new Set();

  function zhVoices() { try { return ((ss && ss.getVoices()) || []).filter(v => /^zh/i.test(v.lang)); } catch (_) { return []; } }
  function pick() {
    const zh = zhVoices();
    return zh.find(v => v.voiceURI === prefs.voiceURI) || zh.find(v => /zh[-_]TW/i.test(v.lang) && v.localService) || zh.find(v => /zh[-_]TW/i.test(v.lang)) || zh.find(v => v.localService) || zh[0] || null;
  }
  const status = () => !ss || !UT ? 'unsupported' : pick() ? 'ready' : 'no-zh';
  const canSpeak = () => prefs.on && status() === 'ready';
  const beepFallback = n => { if (prefs.on && A.Alerts && A.Alerts.beep && status() !== 'ready') A.Alerts.beep(n); };

  function play(item) {
    const u = new UT(item.text), v = pick(); u.voice = v; u.lang = v ? v.lang : 'zh-TW'; u.rate = prefs.rate; u.volume = prefs.volume;
    u.onend = u.onerror = () => { if (cur && cur.u === u) { cur = null; next(); if (!cur) setSpeaking(false); } };
    cur = Object.assign({}, item, { u }); setSpeaking(true); try { ss.speak(u); } catch (e) { cur = null; setSpeaking(false); A.Log.error('語音播放失敗', String(e)); }
  }
  function next() { while (queue.length) { const q = queue.shift(); if (Date.now() - q.t <= q.ttl) { play(q); return; } } }
  function speak(text, pri, ttl) {
    if (!text || !canSpeak()) return false; const item = { text, pri, t: Date.now(), ttl: ttl || 8000 };
    if (!cur) { play(item); return true; }
    if (pri >= cur.pri) { queue = queue.filter(q => q.pri > pri); const old = cur; cur = null; try { ss.cancel(); } catch (_) {} play(item); void old; }
    else queue = queue.concat(item).slice(-2);
    return true;
  }
  const stop = () => { queue = []; cur = null; setSpeaking(false); try { ss && ss.cancel(); } catch (_) {} };

  // ---- 文字產生（純函式）----
  function turnPhrase(c) {
    if (!c || !c.stage) return null; if (c.type === 'reroute') return '偏離路線，正在重新規劃'; if (c.type === 'warn') return null;
    if (c.type === 'arrive') return c.stage === 'now' ? '您已抵達目的地' : c.stage === 'far' ? null : '前方' + DIST[c.stage] + '抵達目的地';
    if (c.stage === 'far') return null; return c.stage === 'now' ? '現在' + c.text : DIST[c.stage] + '後' + c.text;
  }
  const meters = d => d >= 1000 ? (Math.round(d / 100) / 10) + ' 公里' : Math.max(50, Math.round(d / 50) * 50) + ' 公尺';
  function alertPhrase(a, T) {
    const lim = a.kmh ? '，限速' + a.kmh : '';
    return a.stage === 'warn' ? '前方' + meters(a.dist) + T.label + lim : a.stage === 'near' ? '前方' + T.label + lim : null;
  }

  // ---- 狀態監聽 ----
  function turn(s) {
    const c = s.currentInstruction, text = turnPhrase(c); if (!c) return;
    const rank = RANK[c.stage] || 0, key = c.type + '|' + (c.text || ''), fresh = key !== lastKey || rank > lastRank; lastKey = key; lastRank = rank;
    if (!text || !fresh || rank <= 0) return;
    if (!prefs.nav) return; if (canSpeak()) speak(text, 2, 7000); else if (c.stage === '100' || c.stage === 'now') beepFallback(1);
  }
  function alerts(s) {
    if (!prefs.alerts || !A.Alerts) return; Object.keys(lastAlert).forEach(id => { if (!(s.driverAlerts || []).some(a => a.id === id)) delete lastAlert[id]; });   // 警示離開後才忘記，同一個警示不會因開始導航而重念
    (s.driverAlerts || []).forEach(a => {
      const T = A.Alerts.TYPES[a.type]; if (!T) return; const r = ARANK[a.stage] || 0;
      if (a.overspeed) { if (!overAt[a.id] || Date.now() - overAt[a.id] > 15000) { overAt[a.id] = Date.now(); speak('您已超速' + (a.kmh ? '，限速' + a.kmh : ''), 3, 4000); } }
      if (r > (lastAlert[a.id] || 0)) { lastAlert[a.id] = r; const t = alertPhrase(a, T); if (t) speak(t, 3, 5000); }
    });
  }
  function onState(s, ch) {
    if (ch.includes('navigationStatus')) {
      const st = s.navigationStatus;
      if (st === 'navigating' && lastStatus !== 'rerouting') { lastKey = ''; lastRank = 0; if (prefs.nav) speak('開始導航', 2, 4000); }
      else if (st === 'navigating' && lastStatus === 'rerouting' && s.route && s.route.label === '重新規劃' && prefs.nav) speak('已重新規劃路線', 2, 5000);
      else if (st === 'arrived' && prefs.nav) { if (!(lastKey.startsWith('arrive|') && lastRank >= 4)) speak('您已抵達目的地', 3, 6000); }   // 轉彎指示已念過就不再重複
      else if (st === 'idle') stop();
      lastStatus = st;
    }
    if (ch.includes('currentInstruction')) turn(s);
    if (ch.includes('driverAlerts')) alerts(s);
    if (ch.includes('notice') && s.notice && s.notice.id !== lastNotice) { lastNotice = s.notice.id; if (prefs.notices) speak(s.notice.text, 1, 6000); }
  }
  const api = {
    prefs, status, canSpeak, speak, stop, onState, onSpeaking: f => speakSubs.add(f), _turn: turnPhrase, _alert: alertPhrase, _pick: pick,
    voices: () => zhVoices().map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: !!v.localService })), onChange: f => subs.add(f),
    save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} S.set({ settings: Object.assign({}, S.get().settings, { voice: prefs.on }) }); },
    test() { return speak('語音播報測試。300 公尺後右轉。', 3, 5000); }
  };
  A.Voice = api;
  if (ss) { try { ss.onvoiceschanged = () => subs.forEach(f => f()); } catch (_) {} }
  S.subscribe(onState);
})();
