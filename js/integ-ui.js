/* 媒體／電話／通知的畫面：浮動音樂列、來電橫幅、通知 toast（都放在右側中段，不遮蔽導航核心資訊）與「媒體與通知」面板 */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id);
  const trunc = (t, n) => A.Notifications.trunc(t, n), moving = () => !A.Safety.canInteract('input');
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let tab = 1;

  function renderMini(s) {
    const m = s.media, el = $('mini'), show = !!m && m.status !== 'stopped'; el.hidden = !show; if (!show) return;
    $('miniTitle').textContent = trunc(m.title, moving() ? 8 : 16); $('miniPlay').textContent = m.status === 'playing' ? '⏸' : '▶'; $('miniPlay').setAttribute('aria-label', m.status === 'playing' ? '暫停' : '播放');
  }
  function renderCall(s) {
    const c = s.call, el = $('callBox'); if (!c) { el.hidden = true; return; } el.hidden = false; el.dataset.state = c.state;
    if (c.state === 'ringing') { $('callTxt').textContent = moving() ? `來電 ${trunc(c.name, 8)}` : `模擬來電：${c.name}（${c.number}）`; $('callOk').hidden = false; $('callNo').setAttribute('aria-label', '拒接'); }
    else { $('callTxt').textContent = `通話中（模擬）${mmss(Math.floor((Date.now() - c.startedAt) / 1000))}`; $('callOk').hidden = true; $('callNo').setAttribute('aria-label', '結束通話'); }
  }
  function renderToast(s) {
    const t = s.toast, el = $('toastBox'); if (!t) { el.hidden = true; return; } el.hidden = false; el.classList.toggle('compact', t.mode === 'compact');
    $('toastTitle').textContent = t.title; $('toastBody').textContent = t.body || ''; $('toastX').hidden = t.actions === 'none';
  }
  function panel() {
    if ($('ipanel').hidden) return; const s = S.get(), caps = A.Platform.caps();
    [1, 2, 3].forEach(i => { $('isec' + i).hidden = i !== tab; $('itab' + i).setAttribute('aria-pressed', i === tab); });
    $('iCaps').textContent = '此裝置：' + A.Platform.label(caps) + '。網頁無法控制其他 App 的音樂，也無法偵測真實來電。';
    if (tab === 1) {
      const m = s.media || A.Media.state(); $('mNow').textContent = `${m.status === 'playing' ? '播放中' : m.status === 'paused' ? '已暫停' : '未播放'}：${m.title}${m.demo ? '（DEMO 合成音）' : ''}${m.ducked ? '・導航語音中，音量已降低' : ''}`;
      $('mPlay').textContent = m.status === 'playing' ? '暫停' : '播放'; $('mVol').value = Math.round((m.volume != null ? m.volume : 0.6) * 100);
      $('mList').innerHTML = A.Media.tracks().map(t => `<li style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(t.title)}</span><button data-i="${t.i}">播放</button></li>`).join('');
      $('mList').querySelectorAll('button').forEach(b => { b.onclick = () => A.Media.select(+b.dataset.i); });
    } else if (tab === 2) {
      const mv = moving(); $('pNum').disabled = mv; $('pDial').disabled = mv; $('pNum').placeholder = mv ? '行駛中無法輸入號碼' : '輸入電話號碼'; $('pSim').disabled = !!s.call;
    } else {
      const ib = s.inbox || []; $('nList').innerHTML = ib.length ? ib.slice().reverse().map(x => `<li>${esc(moving() ? trunc(x.title, 18) : x.title + (x.body ? '：' + x.body : ''))}</li>`).join('') : '<li class="muted">沒有通知</li>';
      $('nState').textContent = `系統通知：${caps.notification ? ({ granted: '已啟用', denied: '已被拒絕', default: '尚未授權' }[caps.notificationPermission] || caps.notificationPermission) : '此瀏覽器不支援'}${moving() ? '・行駛中只顯示標題' : ''}`;
    }
  }
  function init() {
    const N = A.Notifications, P = A.Phone, M = A.Media;
    $('miniPrev').onclick = () => M.prev(); $('miniPlay').onclick = () => M.toggle(); $('miniNext').onclick = () => M.next();
    $('callOk').onclick = () => P.answer(); $('callNo').onclick = () => (S.get().call && S.get().call.state === 'active' ? P.hangup() : P.decline()); $('toastX').onclick = () => N.dismiss();
    [1, 2, 3].forEach(i => { $('itab' + i).onclick = () => { tab = i; panel(); }; });
    $('mPrev').onclick = () => M.prev(); $('mPlay').onclick = () => M.toggle(); $('mNext').onclick = () => M.next(); $('mVol').oninput = () => M.setVolume($('mVol').value / 100); $('mDemo').onclick = () => M.useDemo();
    $('mFiles').onchange = e => { const r = M.loadFiles(e.target.files); if (!r.ok) $('mNow').textContent = r.message; panel(); };
    $('pDial').onclick = () => { const r = P.dial($('pNum').value); $('pMsg').textContent = r.ok ? (r.emergency ? '撥打緊急電話（交給系統電話 App）' : '已交給系統電話 App 撥號') : r.message; };
    $('pSim').onclick = () => P.simulateIncoming('Demo 聯絡人', '0900-000-000');
    $('nInj1').onclick = () => N.notify({ source: 'demo', title: '訊息：晚上要不要吃飯？', body: 'Demo 聯絡人傳來的訊息', priority: 'normal' });
    $('nInj2').onclick = () => N.notify({ source: 'demo', title: '優惠通知：本週限定', body: 'Demo 低優先通知', priority: 'low' });
    $('nInj3').onclick = () => N.notify({ source: 'demo', title: '緊急：Demo 重要通知', body: 'Demo 緊急通知', priority: 'urgent' });
    $('nRead').onclick = () => N.markAllRead(); $('nClear').onclick = () => N.clearInbox(); $('nPerm').onclick = async () => { await N.requestPermission(); panel(); };
    S.subscribe((s, ch) => {
      if (ch.includes('media') || ch.includes('speed')) renderMini(s); if (ch.includes('call') || ch.includes('speed')) renderCall(s); if (ch.includes('toast')) renderToast(s);
      if (ch.some(k => ['media', 'call', 'inbox', 'speed', 'toast'].includes(k))) panel();
    });
    setInterval(() => { const c = S.get().call; if (c && c.state === 'active') renderCall(S.get()); }, 1000);
    renderMini(S.get()); renderCall(S.get()); renderToast(S.get());
    A.Overlay.start(['mini', 'callBox', 'toastBox'], ['#navTop', '#navBottom', '#lanes', '#drv', '#offer', '#parkOffer', '.hud.speed', '.hud.info', '#navMsg'], { neverHide: ['callBox'] });
  }
  A.IntegUI = { refresh: panel, setTab(t) { tab = t; panel(); } };
  document.addEventListener('DOMContentLoaded', init);
})();
