/* 遮蔽防護（Batch 13）：浮動的音樂列、來電、通知若與導航核心資訊（轉彎橫幅、底部資訊列、車速、車道、警示…）重疊，
   先縮成精簡版；仍重疊就隱藏（來電永不隱藏，只縮小並記錄警告）。 */
(function () {
  const A = window.AIGPS;
  const intersects = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const hit = (r, cores) => cores.some(c => intersects(r, c));
  const resolve = (normal, min, cores) => !hit(normal, cores) ? 'ok' : !hit(min, cores) ? 'min' : 'hide';
  const status = {};
  function start(ids, coreSel, opt) {
    opt = opt || {}; const never = new Set(opt.neverHide || []);
    function step() {
      const cores = coreSel.flatMap(s => Array.from(document.querySelectorAll(s))).filter(e => !e.hidden && e.offsetParent !== null || e.id === 'navTop').map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      ids.forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        el.classList.remove('min', 'hide'); if (el.hidden) { status[id] = 'hidden'; return; }
        const n = el.getBoundingClientRect(); el.classList.add('min'); const m = el.getBoundingClientRect(); el.classList.remove('min');
        let d = resolve(n, m, cores); if (d === 'hide' && never.has(id)) { d = 'min'; A.Log.warn('遮蔽防護：' + id + ' 與導航資訊重疊，已縮到最小'); }
        if (d !== 'ok') el.classList.add(d); status[id] = d;
      });
    }
    const t = setInterval(step, 800); step(); return () => clearInterval(t);
  }
  A.Overlay = { intersects, resolve, start, status };
})();
