/* Day / Night / Auto（規格 §7） */
(function () {
  const A = window.AIGPS, ORDER = ['auto', 'day', 'night'], KEY = 'aigps.theme';
  const apply = t => document.documentElement.setAttribute('data-theme', t);
  const save = t => A.State.set({ settings: Object.assign({}, A.State.get().settings, { theme: t }) });
  A.Theme = {
    init() { let t = 'auto'; try { t = localStorage.getItem(KEY) || 'auto'; } catch (_) {} save(t); apply(t); },
    set(t) { if (!ORDER.includes(t)) return; try { localStorage.setItem(KEY, t); } catch (_) {} save(t); apply(t); },
    cycle() {
      const t = ORDER[(ORDER.indexOf(A.State.get().settings.theme) + 1) % ORDER.length];
      try { localStorage.setItem(KEY, t); } catch (_) {}
      save(t); apply(t); A.Log.info('主題切換：' + t);
    }
  };
})();
