/* 通知（Batch 13）：通知策略引擎。原則：不遮蔽導航核心資訊；行駛中限制需要閱讀或複雜操作的通知。
   - 行駛中（> 5 km/h）一般通知只顯示一行精簡提示、沒有操作；低優先通知延後進「通知匣」。
   - 接近轉彎（≤ 100 m）時，非緊急通知一律延後。緊急通知（例如來電）仍會顯示，但行駛中只提供單鍵操作。
   - 同一則通知 30 秒內不重複；顯示間隔至少 8 秒。 */
(function () {
  const A = window.AIGPS, S = A.State, MOVING_KMH = 5, GAP_MS = 8000, DEDUPE_MS = 30000, COMPACT = 18, BODY = 80, INBOX_MAX = 30;
  const trunc = (t, n) => { t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const isMoving = s => (s.speedKmh != null ? s.speedKmh : (s.speed || 0)) > MOVING_KMH;

  /* 純函式：決定這則通知該怎麼顯示 */
  function decide(n, ctx) {
    const moving = isMoving(ctx), near = !!ctx.navigating && (ctx.stage === 'now' || ctx.stage === '100');
    if (ctx.seenAt && ctx.now - ctx.seenAt < DEDUPE_MS) return { mode: 'drop', reason: 'duplicate' };
    if (n.priority === 'urgent') return moving || near ? { mode: 'compact', ttl: 6000, maxChars: COMPACT, actions: 'simple', reason: 'urgent-moving' } : { mode: 'show', ttl: 10000, maxChars: BODY, actions: 'full', reason: 'urgent' };
    if (near) return { mode: 'defer', reason: 'maneuver' };
    if (moving) {
      if (n.priority === 'low') return { mode: 'defer', reason: 'moving-low' };
      if (ctx.now - (ctx.lastShownAt || 0) < GAP_MS) return { mode: 'defer', reason: 'rate-limit' };
      return { mode: 'compact', ttl: 4000, maxChars: COMPACT, actions: 'none', reason: 'moving' };
    }
    if (n.priority === 'low' && ctx.toastVisible) return { mode: 'defer', reason: 'busy' };
    return { mode: 'show', ttl: 8000, maxChars: BODY, actions: 'full', reason: 'stopped' };
  }
  /* 行駛中可否做某種互動：simple＝單鍵（接聽、拒接、播放、暫停、下一首）；input／read＝輸入文字、閱讀長內容 */
  const canInteract = (kind, ctx) => kind === 'simple' ? true : !isMoving(ctx || ctxNow());
  const shouldSystemNotify = (n, hidden, perm) => perm === 'granted' && !!hidden && n.priority !== 'low';

  const seen = {}; let lastShownAt = 0, timer = 0, summarized = false, nid = 0;
  function ctxNow() { const s = S.get(), t = s.toast; return { speed: s.speed, navigating: s.navigationStatus === 'navigating', stage: s.currentInstruction && s.currentInstruction.stage, now: Date.now(), lastShownAt, toastVisible: !!(t && t.until > Date.now()) }; }
  function systemNotify(n) {
    const w = window, perm = w.Notification ? w.Notification.permission : 'unsupported';
    if (!shouldSystemNotify(n, w.document && w.document.hidden, perm)) return false;
    try { const o = { body: trunc(n.body, BODY), tag: n.source }; (w.navigator.serviceWorker && w.navigator.serviceWorker.ready) ? w.navigator.serviceWorker.ready.then(r => r.showNotification(n.title, o)).catch(() => new w.Notification(n.title, o)) : new w.Notification(n.title, o); return true; } catch (_) { return false; }
  }
  function notify(n) {
    n = Object.assign({ source: 'app', priority: 'normal', title: '', body: '' }, n); const key = n.source + '|' + n.title, c = ctxNow(); c.seenAt = seen[key] || 0;
    const d = decide(n, c); if (d.mode === 'drop') return { ok: true, mode: 'drop', reason: d.reason };
    seen[key] = c.now;
    if (d.mode === 'defer') { const inbox = (S.get().inbox || []).concat({ id: ++nid, source: n.source, title: n.title, body: n.body, priority: n.priority, t: c.now, read: false }).slice(-INBOX_MAX); S.set({ inbox }); return { ok: true, mode: 'defer', reason: d.reason }; }
    lastShownAt = c.now; clearTimeout(timer);
    S.set({ toast: { id: ++nid, source: n.source, priority: n.priority, mode: d.mode, actions: d.actions, title: trunc(n.title, d.mode === 'compact' ? d.maxChars : 60), body: d.mode === 'compact' ? '' : trunc(n.body, d.maxChars), until: c.now + d.ttl } });
    timer = setTimeout(() => { const t = S.get().toast; if (t && t.until <= Date.now() + 50) S.set({ toast: null }); }, d.ttl);
    systemNotify(n); return { ok: true, mode: d.mode, reason: d.reason };
  }
  /* 停下來且不在轉彎前時，把通知匣裡未讀的整理成一則摘要（每次停車只提醒一次） */
  function flush() {
    const s = S.get(), c = ctxNow(); if (isMoving(c)) { summarized = false; return; }
    const unread = (s.inbox || []).filter(x => !x.read).length; if (!unread || summarized || (c.navigating && (c.stage === 'now' || c.stage === '100'))) return;
    summarized = true; notify({ source: 'inbox', title: `有 ${unread} 則未讀通知`, body: '可在「媒體與通知」的通知頁查看', priority: 'normal' });
  }
  const api = { name: 'In-app Notifications（含系統通知橋接）', isDemo: false, notify, decide, flush, canInteract, shouldSystemNotify, trunc, MOVING_KMH,
    dismiss: () => { clearTimeout(timer); S.set({ toast: null }); }, markAllRead: () => S.set({ inbox: (S.get().inbox || []).map(x => Object.assign({}, x, { read: true })) }), clearInbox: () => S.set({ inbox: [] }),
    requestPermission: async () => { try { return window.Notification ? await window.Notification.requestPermission() : 'unsupported'; } catch (_) { return 'denied'; } } };
  A.Notifications = api; A.Safety = { canInteract: (k) => canInteract(k, ctxNow()), isMoving: () => isMoving(ctxNow()) };
  A.Providers.register('notifications', api);
  S.subscribe((s, ch) => {
    if (ch.includes('speed') || ch.includes('currentInstruction')) flush();
    if (ch.includes('notice') && s.notice) systemNotify({ source: 'nav', title: s.notice.text, body: '', priority: 'normal' });
  });
})();
