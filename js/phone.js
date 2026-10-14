/* 電話（Batch 13）：網頁沒有可靠的標準 API 能偵測真實來電或代接電話，所以：
   - 撥號：只能開啟系統的 tel: 連結，由系統電話 App 處理；行駛中不可輸入號碼（緊急號碼除外）。
   - 來電：僅提供「模擬來電」(DEMO) 以驗證畫面不遮蔽導航資訊；模擬通話時音樂暫停，導航語音照常播報。 */
(function () {
  const A = window.AIGPS, S = A.State, EMERGENCY = ['110', '119', '112', '911', '999'], RING_MS = 30000;
  const valid = n => /^\+?[0-9\-\s()]{3,20}$/.test(String(n || '').trim()), digits = n => String(n).replace(/[^\d+]/g, '');
  let opener = u => { try { window.location.href = u; } catch (_) {} }, ringTimer = 0;
  const end = () => { clearTimeout(ringTimer); S.set({ call: null }); };

  function dial(number) {
    if (!valid(number)) return { ok: false, reason: 'invalid', message: '電話號碼格式不正確' };
    const d = digits(number), emergency = EMERGENCY.includes(d);
    if (!emergency && A.Safety && !A.Safety.canInteract('input')) return { ok: false, reason: 'moving', message: '行駛中無法輸入號碼撥打（緊急號碼除外），請停車後再操作' };
    opener('tel:' + d); A.Log.info('撥號（交給系統電話 App）', emergency ? '緊急號碼' : '一般號碼'); return { ok: true, via: 'tel-link', emergency };
  }
  function simulateIncoming(name, number) {
    if (S.get().call) return { ok: false, message: '目前已有通話' }; name = name || 'Demo 聯絡人'; number = number || '0900-000-000';
    S.set({ call: { state: 'ringing', name, number, demo: true, since: Date.now() } });
    if (A.Notifications) A.Notifications.notify({ source: 'phone', title: `來電：${name}`, body: number, priority: 'urgent' });
    ringTimer = setTimeout(() => { const c = S.get().call; if (c && c.state === 'ringing') { end(); if (A.Notifications) A.Notifications.notify({ source: 'phone', title: `未接來電：${name}`, body: number, priority: 'normal' }); } }, RING_MS);
    return { ok: true };
  }
  function answer() { const c = S.get().call; if (!c || c.state !== 'ringing') return { ok: false }; clearTimeout(ringTimer); S.set({ call: Object.assign({}, c, { state: 'active', startedAt: Date.now() }) }); if (A.Media) A.Media.pauseForCall(); return { ok: true }; }
  function decline() { const c = S.get().call; if (!c || c.state !== 'ringing') return { ok: false }; end(); return { ok: true }; }
  function hangup() { const c = S.get().call; if (!c) return { ok: false }; end(); if (A.Media) A.Media.resumeAfterCall(); return { ok: true }; }

  const api = { name: 'Phone（tel: 撥號／模擬來電）', isDemo: true, caps: { dial: true, detectIncoming: false, realCall: false }, dial, state: () => S.get().call, simulateIncoming, answer, decline, hangup, EMERGENCY, _setOpener(f) { opener = f; } };
  A.Phone = api; A.Providers.register('phone', api);
})();
