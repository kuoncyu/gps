/* 導航頁 UI：轉彎橫幅、底部資訊列、偏航模擬、抵達摘要 */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id);
  const km = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
  const mins = s => s >= 3600 ? Math.floor(s / 3600) + ' 小時 ' + Math.round(s % 3600 / 60) + ' 分' : Math.max(0, Math.round(s / 60)) + ' 分';
  const hm = iso => iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
  const ARROW = '<svg viewBox="0 0 24 24" width="52" height="52" aria-hidden="true" style="transform:rotate(%deg)"><path d="M12 2 L21 12 H14 V22 H10 V12 H3 Z" fill="currentColor"/></svg>';

  const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="transform:rotate(%deg)"><path d="M12 3 L19 11 H14 V21 H10 V11 H5 Z" fill="currentColor"/></svg>';
  const NAME = { left: '左轉', right: '右轉', straight: '直行', uturn: '迴轉' }, ROT = { left: -90, right: 90, straight: 0, uturn: 180 };
  function lanes(lg, nav) {
    const el = $('lanes'); if (!lg || !nav) { el.hidden = true; return; } el.hidden = false;
    $('laneBox').innerHTML = lg.lanes.map((l, i) => `<div class="lane ${l.recommended ? 'rec' : l.available ? 'ok' : 'off'}" role="img" aria-label="車道 ${i + 1}：${l.arrows.map(a => NAME[a]).join('、')}${l.recommended ? '（推薦）' : l.available ? '（可用）' : '（不可用）'}">${l.arrows.map(a => ICON.replace('%', ROT[a])).join('')}</div>`).join('');
  }
  function renderPreview(rt) {
    $('pvSum').textContent = `${km(rt.distance)}・${mins(rt.duration)}・預計 ${hm(rt.eta)} 抵達`;
    $('pvList').innerHTML = A.Nav.preview(rt).map(x => `<li>${x.text} <span class="muted">${x.dist ? km(Math.round(x.dist)) : ''}</span>${x.lane ? ' <span class="demo-tag">車道圖 DEMO</span>' : ''}</li>`).join('');
  }
  function startNav() {
    const r = A.Nav.start(), m = $('navMsg');
    if (!r.ok) { m.innerHTML = r.message + '　<a href="route.html">前往路線頁</a>'; m.hidden = false; return; }
    m.hidden = true; $('preview').hidden = true; A.Map.cam.headingUp = true; $('btnHead').textContent = '車頭朝上'; $('btnFollow').click();
  }
  function drv(s) {
    const el = $('drv'), L = s.driverAlerts || []; if (!L.length) { el.hidden = true; return; } el.hidden = false;
    el.innerHTML = L.map(a => { const T = A.Alerts.TYPES[a.type]; return `<div class="drvitem ${a.stage}${a.overspeed ? ' over' : ''}"><span class="bdg" style="background:${T.color}">${T.badge}</span><div><b>${T.label}</b> <span class="demo-tag">DEMO</span><br>前方 ${km(a.dist)}${a.kmh ? '・限速 ' + a.kmh : ''}${a.overspeed ? '・<b>您已超速</b>' : ''}</div></div>`; }).join('');
  }
  function apanel() {
    const p = A.Alerts.prefs; $('aTypes').innerHTML = Object.keys(A.Alerts.TYPES).map(k => `<label><input type="checkbox" data-k="${k}" ${p.types[k] ? 'checked' : ''}> ${A.Alerts.TYPES[k].label}</label>`).join('');
    $('aTypes').querySelectorAll('input').forEach(i => i.onchange = () => { p.types[i.dataset.k] = i.checked; A.Alerts.save(); });
    $('aSound').checked = p.sound; $('aVol').value = Math.round(p.volume * 100); $('aSound').onchange = () => { p.sound = $('aSound').checked; A.Alerts.save(); }; $('aVol').oninput = () => { p.volume = $('aVol').value / 100; A.Alerts.save(); };
    $('aTest').onclick = () => A.Alerts.beep(2); $('aRest').value = String(p.restSec); $('aRest').onchange = () => { p.restSec = +$('aRest').value; A.Alerts.save(); };
  }
  /* 前方服務／城市 */
  let upTab = 'svc', upCat = '', upTimer = 0;
  function refreshUp() {
    if ($('upanel').hidden) return; const U = A.UpAhead, m = $('upMsg'), box = $('upList');
    $('upChips').innerHTML = upTab === 'svc' ? ['全部', ...U.SVC].map(c => `<button data-c="${c === '全部' ? '' : c}" aria-pressed="${(c === '全部' ? '' : c) === upCat}">${c}</button>`).join('') : '';
    $('upChips').querySelectorAll('button').forEach(b => { b.onclick = () => { upCat = b.dataset.c; refreshUp(); }; });
    const r = upTab === 'svc' ? U.services(upCat, 12) : U.cities(12);
    if (!r.ok) { m.textContent = r.message; box.innerHTML = ''; return; }
    m.textContent = (r.navigating ? '依目前位置往前方計算' : '尚未開始導航，以整條路線計算') + `・共 ${r.total} 筆・資料為 DEMO`;
    box.innerHTML = r.results.length ? r.results.map((p, i) => `<li style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span><b>${p.name}</b><br><span class="muted">${p.cat ? p.cat + '・' : ''}前方 ${km(p.ahead)}・約 ${mins(p.etaSec)}${p.off > 30 ? '・偏離路線 ' + km(p.off) : ''}</span></span><button data-i="${i}">加入途經點</button></li>`).join('') : '<li class="muted">前方沒有符合的項目</li>';
    box.querySelectorAll('button').forEach(b => { b.onclick = async () => { b.disabled = true; const x = await U.addWaypoint(r.results[+b.dataset.i]); m.textContent = x.ok ? `已加入途經點。${x.summary}` : x.reply; setTimeout(refreshUp, 800); }; });
  }
  function upanel() {
    const tab = t => { upTab = t; $('upTab1').setAttribute('aria-pressed', t === 'svc'); $('upTab2').setAttribute('aria-pressed', t === 'city'); refreshUp(); };
    $('upTab1').onclick = () => tab('svc'); $('upTab2').onclick = () => tab('city'); clearInterval(upTimer); upTimer = setInterval(refreshUp, 2500);
  }
  /* 停車建議、抵達後步行 */
  function park(s) {
    const o = s.parkingOffer, el = $('parkOffer'); if (!o) { el.hidden = true; return; } el.hidden = false;
    $('parkList').innerHTML = o.list.map((p, i) => `<li style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span><b>${p.name}</b><br><span class="muted">步行約 ${km(p.walk)}、${mins(p.walkSec)}</span></span><button data-i="${i}">改往此處</button></li>`).join('');
    $('parkList').querySelectorAll('button').forEach(b => { b.onclick = () => A.Parking.choose(o.list[+b.dataset.i]); });
  }
  function walkBox(s) {
    const w = A.Parking.walkTarget(), el = $('walkBox'); if (!w) { el.hidden = true; return; } el.hidden = false;
    const i = A.Parking.walkInfo(s.destination, w.orig); $('walkTxt').textContent = `停好車了。步行前往「${w.orig.name}」約 ${km(i.dist)}、${mins(i.sec)}。`;
  }
  const aMeta = () => { const m = A.Alerts.getMeta(), T = { ok: '正常', low: '偏低（資料較舊）', expired: '已過期（停止顯示）', unknown: '來源不明（停止顯示）' }; $('aMeta').textContent = m ? `警示資料版本 ${m.version || '未知'}・更新 ${m.updatedAt ? m.updatedAt.slice(0, 10) : '未知'}・來源 ${m.source || '未知'}・信任：${T[m.trust]}` : '尚未載入警示資料（需先安裝資料包）'; };
  const PANELS = ['apanel', 'tpanel', 'vpanel', 'aipanel', 'upanel', 'ipanel', 'preview'];
  const BTN = { apanel: 'btnAlerts', tpanel: 'btnTraffic', vpanel: 'btnVoice', aipanel: 'btnAI', upanel: 'btnUp', ipanel: 'btnInteg', preview: 'btnPreview' };
  const PLABEL = { apanel: '駕駛警示設定', tpanel: '交通事件', vpanel: '語音設定', aipanel: 'AI 助理', upanel: '前方服務', ipanel: '媒體與通知', preview: '路線預覽' };
  const only = id => {
    PANELS.forEach(p => { if (p !== id) { $(p).hidden = true; if ($(BTN[p])) $(BTN[p]).setAttribute('aria-expanded', 'false'); } });
    const el = $(id), open = el.hidden; el.hidden = !open; const b = $(BTN[id]); if (b) b.setAttribute('aria-expanded', String(open));
    if (open) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } else if (b) b.focus();   // 開啟時焦點移入面板，關閉時回到按鈕
  };
  function a11yPanels() {
    PANELS.forEach(p => { const el = $(p); el.setAttribute('role', 'region'); el.setAttribute('aria-label', PLABEL[p]); if ($(BTN[p])) $(BTN[p]).setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const open = PANELS.find(p => !$(p).hidden); if (open) { e.preventDefault(); only(open); } });   // Esc 關閉面板
  }
  const VMSG = { ready: ['語音狀態：可用', ''], 'no-zh': ['此裝置沒有中文語音，目前只有提示音。可在系統設定安裝中文語音後重新整理。', 'lvl-warn'], unsupported: ['此瀏覽器不支援語音合成，目前只有提示音。', 'lvl-warn'] };
  function vpanel() {
    const V = A.Voice, p = V.prefs, st = () => { const m = VMSG[V.status()]; $('vStatus').textContent = m[0]; $('vStatus').className = m[1]; };
    const fill = () => { const vs = V.voices(), cur = V.status() === 'ready' ? V._pick() : null; $('vVoice').innerHTML = vs.length ? vs.map(v => `<option value="${v.uri}" ${cur && cur.voiceURI === v.uri ? 'selected' : ''}>${v.name}（${v.lang}${v.local ? '・離線' : '・可能需網路'}）</option>`).join('') : '<option>無可用中文語音</option>'; st(); };
    [['vOn', 'on'], ['vNav', 'nav'], ['vAl', 'alerts'], ['vNo', 'notices']].forEach(([id, k]) => { $(id).checked = p[k]; $(id).onchange = () => { p[k] = $(id).checked; V.save(); if (!p.on) V.stop(); }; });
    $('vVol').value = Math.round(p.volume * 100); $('vVol').oninput = () => { p.volume = $('vVol').value / 100; V.save(); }; $('vRate').value = Math.round(p.rate * 10); $('vRate').oninput = () => { p.rate = $('vRate').value / 10; V.save(); };
    $('vVoice').onchange = () => { p.voiceURI = $('vVoice').value; V.save(); }; $('vTest').onclick = () => { if (!V.test()) A.Alerts.beep(2); st(); };
    V.onChange(fill); fill();
  }
  function aipanel() {
    const log = $('aiLog'), bub = (cls, text) => { const d = document.createElement('div'); d.className = 'bub ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    const show = out => {
      bub('a', out.reply); if (!out.choices || !out.choices.length) return;
      const row = document.createElement('div'); row.className = 'btns'; out.choices.forEach(c => { const b = document.createElement('button'); b.textContent = c.label; b.onclick = async () => { row.querySelectorAll('button').forEach(x => { x.disabled = true; }); bub('u', c.label); show(await c.run()); }; row.appendChild(b); }); log.appendChild(row); log.scrollTop = log.scrollHeight;
    };
    const send = async t => { t = (t || '').trim(); if (!t) return; $('aiIn').value = ''; bub('u', t); const out = await A.Assistant.ask(t); show(out); };
    $('aiSend').onclick = () => send($('aiIn').value); $('aiIn').addEventListener('keydown', e => { if (e.key === 'Enter') send($('aiIn').value); });
    $('aiChips').innerHTML = ['最近的加油站', '避開收費', '還有多久', '天氣如何', '開始導航'].map(c => `<button data-q="${c}">${c}</button>`).join(''); $('aiChips').querySelectorAll('button').forEach(b => { b.onclick = () => send(b.dataset.q); });
    bub('a', '你好，我可以幫你找地點、調整路線、查剩餘時間與天氣。試試下方的快捷指令，或輸入「你可以做什麼」。');
  }
  const SRC = { offline: '離線事件', simulated: '模擬事件' };
  function events(s) { $('evList').innerHTML = s.trafficEvents.length ? s.trafficEvents.map(e => `<li>${e.label}　<span class="muted">${SRC[e.source] || e.source}・${e.closed ? '封閉' : '約 ×' + e.factor + ' 耗時'}</span></li>`).join('') : '<li class="muted">目前沒有交通事件</li>'; }
  function offer(s) { const o = s.trafficOffer, el = $('offer'); if (!o || s.navigationStatus !== 'navigating') { el.hidden = true; return; } el.hidden = false; $('offerText').textContent = `${o.reason}。原路線 ${mins(o.curDuration)}，替代路線 ${mins(o.altDuration)}，節省 ${mins(o.save)}`; }
  let lastAlert = null, alertT = 0;
  function alerts(s) { const a = s.notice; if (!a || a.id === lastAlert) return; lastAlert = a.id; const m = $('navMsg'); m.textContent = a.text; m.hidden = false; clearTimeout(alertT); alertT = setTimeout(() => { m.hidden = true; }, 6000); }
  function render(s) {
    const st = s.navigationStatus, nav = st === 'navigating' || st === 'rerouting', w = $('wrap');
    document.body.classList.toggle('navmode', nav); w.classList.toggle('navigating', nav); w.classList.toggle('arrived', st === 'arrived');
    $('arrive').hidden = st !== 'arrived'; $('navTop').hidden = !nav; $('navBottom').hidden = !nav;
    { const w = s.weather; $('wx').textContent = w ? `${w.label} ${w.temp}°（離線）` : '—'; }
    { const l = s.currentLocation, walk = s.route && s.route.walk, lim = l && !walk && A.Routing && A.Routing.ready() ? A.Routing.limitAt(l.x, l.y, s.heading) : null;   // 速限（Demo 路網）
      $('limBox').hidden = !lim; if (lim) $('lim').textContent = lim; $('spd').classList.toggle('over', !!(lim && s.speed > lim + 5)); }
    drv(s); lanes(s.laneGuidance, nav); offer(s); alerts(s); events(s); park(s);
    const c = s.currentInstruction;
    if (nav && c) {
      $('navArrow').innerHTML = ARROW.replace('%', c.type === 'uturn' ? 180 : c.turn || 0); $('navDist').textContent = c.type === 'reroute' || c.type === 'warn' ? '' : km(Math.round(c.distance / 10) * 10 || c.distance);
      $('navText').textContent = c.label; $('navNext').textContent = s.nextInstruction ? `之後：${s.nextInstruction.text}（${km(s.nextInstruction.distance)}）` : '';
      $('navTop').classList.toggle('warn', c.type === 'reroute' || c.type === 'warn');
    }
    if (nav) { $('eta').textContent = hm(s.ETA); $('remD').textContent = s.remainingDistance != null ? km(s.remainingDistance) : '--'; $('remT').textContent = s.remainingTime != null ? mins(s.remainingTime) : '--'; }
    if (st === 'arrived') { const t = s.tripData; $('sumD').textContent = km(t.distance); $('sumT').textContent = mins(t.duration); $('sumA').textContent = t.avgSpeed + ' km/h'; $('sumM').textContent = t.maxSpeed + ' km/h'; $('sumName').textContent = s.destination ? s.destination.name : ''; walkBox(s); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('btnNav').onclick = startNav;
    $('btnPreview').onclick = () => { const rt = S.get().route, m = $('navMsg'); if (!rt) { m.innerHTML = '請先到「路線」頁選用一條路線　<a href="route.html">前往路線頁</a>'; m.hidden = false; return; } m.hidden = true; A.Map.fitRoute(); renderPreview(rt); $('preview').hidden = false; };
    a11yPanels(); apanel(); vpanel(); aipanel(); $('btnAI').onclick = () => only('aipanel'); $('btnAlerts').onclick = () => { only('apanel'); aMeta(); }; $('btnInteg').onclick = () => { only('ipanel'); A.IntegUI.refresh(); }; upanel(); $('btnUp').onclick = () => { only('upanel'); refreshUp(); }; $('btnVoice').onclick = () => only('vpanel');
    $('btnTraffic').onclick = () => only('tpanel');
    const inj = t => () => { const r = A.Traffic.injectAhead(t, 400); if (!r.ok) { const m = $('navMsg'); m.textContent = r.message; m.hidden = false; setTimeout(() => { m.hidden = true; }, 4000); } };
    $('evCong').onclick = inj('congestion'); $('evAcc').onclick = inj('accident'); $('evClose').onclick = inj('closure'); $('evClear').onclick = () => A.Traffic.clearSim();
    $('offerYes').onclick = () => A.Traffic.accept(); $('offerNo').onclick = () => A.Traffic.dismiss();
    $('pvStart').onclick = startNav; $('pvClose').onclick = () => { $('preview').hidden = true; $('btnFollow').click(); };
    $('btnEnd').onclick = () => A.Nav.stop(); $('btnOff').onclick = () => A.Gps.detour(); $('arriveOk').onclick = () => { A.Parking.clearWalkTarget(); A.Nav.finish(); }; $('walkGo').onclick = async () => { const r = await A.Parking.startWalking(); if (!r.ok) { const m = $('navMsg'); m.textContent = r.message; m.hidden = false; } }; $('parkNo').onclick = () => A.Parking.dismiss();
    S.subscribe(render); render(S.get());
  });
})();
