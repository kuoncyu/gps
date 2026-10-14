/* 設定頁：整合主題、路線偏好、語音、駕駛警示、隱私清除、版本資訊（規格 §24：App／資料格式／各資料版本）、授權說明 */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id), RKEY = 'aigps.routePrefs';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rp = () => { try { return JSON.parse(localStorage.getItem(RKEY)) || {}; } catch (_) { return {}; } };
  const saveRp = p => { try { localStorage.setItem(RKEY, JSON.stringify(p)); } catch (_) {} };
  const say = t => { $('spMsg').textContent = t; };
  const TRUST = { ok: '正常', low: '偏低（資料較舊）', expired: '已過期（停止顯示）', unknown: '來源不明（停止顯示）' };

  /* 純函式：版本資訊表 */
  function versionRows(s, meta, app) {
    const p = s.offlinePackage, rows = [['App 版本', app.app], ['Build', app.build || '—'], ['資料格式（schema）', 'v' + app.dataSchema]];
    if (p) { const v = `${p.id} v${p.version}` + (p.incompatible ? `（格式 v${p.schema}，不相容）` : ''); rows.push(['離線資料包', v], ['地圖資料', v], ['路由資料', v], ['POI 資料', v], ['語音資料', v]); } else rows.push(['離線資料包', '尚未安裝']);
    rows.push(['駕駛警示資料', meta ? `${meta.version || '未知'}（更新 ${meta.updatedAt ? meta.updatedAt.slice(0, 10) : '未知'}・信任：${TRUST[meta.trust] || '未知'}）` : '尚未載入']);
    rows.push(['相容性', !p ? '—' : p.incompatible ? '不相容：請到下載中心安裝新版資料包' : '相容']); return rows;
  }
  function theme() {
    const cur = S.get().settings.theme, L = [['auto', '自動（跟隨系統）'], ['day', '日間'], ['night', '夜間']];
    $('sTheme').innerHTML = L.map(([v, t]) => `<label><input type="radio" name="theme" value="${v}" ${cur === v ? 'checked' : ''}> ${t}</label>`).join('<br>');
    $('sTheme').querySelectorAll('input').forEach(i => { i.onchange = () => A.Theme.set(i.value); });
  }
  function route() {
    const p = rp(), el = $('sRoute');
    el.innerHTML = `<label><input type="radio" name="rm" value="fastest" ${p.mode !== 'shortest' ? 'checked' : ''}> 最快路線</label><br><label><input type="radio" name="rm" value="shortest" ${p.mode === 'shortest' ? 'checked' : ''}> 最短路線</label><br>
      <label><input type="checkbox" data-k="avoidHighway" ${p.avoidHighway ? 'checked' : ''}> 避開高速公路</label><br><label><input type="checkbox" data-k="avoidToll" ${p.avoidToll ? 'checked' : ''}> 避開收費道路</label><br><label><input type="checkbox" data-k="avoidUnpaved" ${p.avoidUnpaved ? 'checked' : ''}> 避開未鋪裝道路</label>`;
    el.querySelectorAll('input[name=rm]').forEach(i => { i.onchange = () => { const q = rp(); q.mode = i.value; saveRp(q); say('已儲存路線偏好'); }; });
    el.querySelectorAll('input[data-k]').forEach(i => { i.onchange = () => { const q = rp(); q[i.dataset.k] = i.checked; saveRp(q); say('已儲存路線偏好'); }; });
  }
  const VMSG = { ready: '語音狀態：可用', 'no-zh': '此裝置沒有中文語音，目前只有提示音。', unsupported: '此瀏覽器不支援語音合成，目前只有提示音。' };
  function voice() {
    const V = A.Voice, p = V.prefs, el = $('sVoice'), st = () => { $('svStatus').textContent = VMSG[V.status()]; };
    const opts = () => { const vs = V.voices(), cur = V.status() === 'ready' ? V._pick() : null; return vs.length ? vs.map(v => `<option value="${esc(v.uri)}" ${cur && cur.voiceURI === v.uri ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}${v.local ? '・離線' : '・可能需網路'}）</option>`).join('') : '<option>無可用中文語音</option>'; };
    el.innerHTML = `<label><input type="checkbox" data-k="on" ${p.on ? 'checked' : ''}> 語音播報</label><br><label><input type="checkbox" data-k="nav" ${p.nav ? 'checked' : ''}> 導航指示</label><br><label><input type="checkbox" data-k="alerts" ${p.alerts ? 'checked' : ''}> 駕駛警示</label><br><label><input type="checkbox" data-k="notices" ${p.notices ? 'checked' : ''}> 一般提示（天氣、交通）</label><br>
      <label>音量 <input type="range" id="svVol" min="0" max="100" value="${Math.round(p.volume * 100)}"></label><br><label>語速 <input type="range" id="svRate" min="7" max="14" value="${Math.round(p.rate * 10)}"></label><br><label>語音 <select id="svVoice">${opts()}</select></label><div class="btns"><button id="svTest">試聽</button></div>`;
    el.querySelectorAll('input[data-k]').forEach(i => { i.onchange = () => { p[i.dataset.k] = i.checked; V.save(); if (!p.on) V.stop(); }; });
    $('svVol').oninput = () => { p.volume = $('svVol').value / 100; V.save(); }; $('svRate').oninput = () => { p.rate = $('svRate').value / 10; V.save(); };
    $('svVoice').onchange = () => { p.voiceURI = $('svVoice').value; V.save(); }; $('svTest').onclick = () => { if (!V.test()) A.Alerts.beep(2); st(); };
    V.onChange(() => { $('svVoice').innerHTML = opts(); st(); }); st();
  }
  function alerts() {
    const L = A.Alerts, p = L.prefs, el = $('sAlerts');
    el.innerHTML = Object.keys(L.TYPES).map(k => `<label><input type="checkbox" data-t="${k}" ${p.types[k] ? 'checked' : ''}> ${L.TYPES[k].label}</label>`).join('<br>') +
      `<br><label><input type="checkbox" id="saSound" ${p.sound ? 'checked' : ''}> 提示音</label><br><label>音量 <input type="range" id="saVol" min="0" max="100" value="${Math.round(p.volume * 100)}"></label><br>
      <label>休息提醒 <select id="saRest"><option value="0">關閉</option><option value="7200">每 2 小時</option><option value="3600">每 1 小時</option><option value="30">測試：30 秒</option></select></label><div class="btns"><button id="saTest">測試提示音</button></div>`;
    $('saRest').value = String(p.restSec); el.querySelectorAll('input[data-t]').forEach(i => { i.onchange = () => { p.types[i.dataset.t] = i.checked; L.save(); }; });
    $('saSound').onchange = () => { p.sound = $('saSound').checked; L.save(); }; $('saVol').oninput = () => { p.volume = $('saVol').value / 100; L.save(); }; $('saRest').onchange = () => { p.restSec = +$('saRest').value; L.save(); }; $('saTest').onclick = () => L.beep(2);
    const m = () => { const x = L.getMeta(); $('saMeta').textContent = x ? `警示資料版本 ${x.version || '未知'}・更新 ${x.updatedAt ? x.updatedAt.slice(0, 10) : '未知'}・來源 ${x.source || '未知'}・信任：${TRUST[x.trust]}` : '尚未載入警示資料（需先安裝資料包）。警示位置為 Demo 資料。'; }; m(); setTimeout(m, 900);
  }
  function app() {
    const P = A.PWA, u = S.get().appUpdate || {}; if (!P) return;
    $('sApp').innerHTML = [['Service Worker', P.hasWorker() ? '已啟用（可離線開啟）' : '未啟用（需 HTTPS 或 localhost，首次載入後才會啟用）'], ['執行模式', P.isStandalone() ? '已安裝為 App' : '瀏覽器分頁'], ['App 更新', u.ready ? '有新版可更新' : u.downloading ? '新版下載中…' : '已是最新，或尚未檢查'], ['上次檢查', u.checkedAt ? new Date(u.checkedAt).toLocaleString('zh-TW', { hour12: false }) : '—']].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    $('btnUpd').disabled = !u.ready; $('btnInst').hidden = !P.canInstall(); $('appHint').textContent = P.isIOS() ? 'iPhone／iPad：請在 Safari 點「分享」→「加入主畫面」安裝。' : '';
  }
  function appButtons() {
    const P = A.PWA, m = t => { $('appMsg').textContent = t; }; if (!P) return;
    $('btnChk').onclick = async () => { m('檢查中…'); const r = await P.check(); m(r.ok ? (r.ready ? '有新版可更新，按「立即更新」套用。' : '已是最新版本。') : r.message); app(); };
    $('btnUpd').onclick = () => { const r = P.apply(); if (!r.ok) m(r.message); }; $('btnInst').onclick = async () => { const r = await P.install(); m(r.ok ? (r.outcome === 'accepted' ? '已開始安裝' : '已取消安裝') : '目前無法安裝'); app(); };
    P.on(app); S.subscribe((s, ch) => { if (ch.includes('appUpdate')) app(); });
  }
  function version() { const rows = versionRows(S.get(), A.Alerts && A.Alerts.getMeta(), A.VERSION); $('sVersion').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join(''); }
  function privacy() {
    $('pvPlaces').onclick = () => { if (confirm('清除所有收藏、最近目的地、家與公司？')) { A.Places.clearAll(); say('已清除收藏、最近目的地、家與公司'); } };
    $('pvTrip').onclick = () => { if (confirm('清除所有行程紀錄？')) { A.Trip.clearLog(); say('已清除行程紀錄'); } };
    $('pvRoute').onclick = () => { S.set({ destination: null, route: null, waypoints: [], alternativeRoutes: [] }); try { localStorage.removeItem('aigps.walkTo'); } catch (_) {} say('已清除目前的目的地與路線'); };
    $('pvAll').onclick = () => { if (!confirm('清除所有本機資料（偏好、目的地、收藏、行程紀錄等）？離線資料包不受影響。')) return; try { Object.keys(localStorage).filter(k => k.startsWith('aigps.')).forEach(k => localStorage.removeItem(k)); } catch (_) {} say('已清除所有本機資料，正在重新載入…'); setTimeout(() => location.reload(), 600); };
    $('sdCopy').onclick = () => { const t = A.diagnostics(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say('已複製診斷資訊'), () => say('無法自動複製，請改用開發者面板的日誌')); };
  }
  A.SettingsPage = { versionRows };
  document.addEventListener('DOMContentLoaded', () => { theme(); route(); voice(); alerts(); privacy(); version(); appButtons(); app(); setTimeout(app, 900); S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) version(); }); setTimeout(version, 900); });
})();
