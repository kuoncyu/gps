/* 唯一的 Navigation State（規格 §6）。全站只允許這一份，不得另建第二套。 */
(function () {
  const A = (window.AIGPS = window.AIGPS || {});
  A.VERSION = { app: '1.0.0', build: 'dev', dataSchema: 1 };
  const buf = [], logSubs = new Set();
  function log(level, msg, extra) {
    const e = { t: new Date().toISOString().slice(11, 19), level, msg, extra };
    buf.push(e); if (buf.length > 200) buf.shift();
    (level === 'error' ? console.error : console.log)('[AIGPS]', level, msg, extra || '');
    logSubs.forEach(f => { try { f(e); } catch (_) {} });
  }
  A.Log = {
    info: (m, x) => log('info', m, x), warn: (m, x) => log('warn', m, x), error: (m, x) => log('error', m, x),
    all: () => buf.slice(), subscribe: f => (logSubs.add(f), () => logSubs.delete(f))
  };
  const initial = () => ({
    currentLocation: null, heading: null, speed: null, accuracy: null, currentRoad: null,
    destination: null, waypoints: [], route: null, alternativeRoutes: [],
    remainingDistance: null, remainingTime: null, ETA: null,
    currentInstruction: null, nextInstruction: null, laneGuidance: null,
    trafficEvents: [], trafficOffer: null, parkingOffer: null, appUpdate: null, media: null, call: null, inbox: [], toast: null, weather: null, nearbyPOIs: [], driverAlerts: [], notice: null,
    navigationStatus: 'idle',
    tripData: { distance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0 },
    networkStatus: navigator.onLine ? 'online' : 'offline',
    offlinePackageStatus: 'none',  offlinePackage: null,   // none | downloading | updating | ready | limited | error
    dataServiceStatus: 'OFFLINE',   // 推導：ONLINE|OFFLINE|DOWNLOADING|UPDATING|DEGRADED
    settings: { theme: 'auto', units: 'metric', voice: true, language: 'zh-Hant' },
    aiConversation: []
  });
  function derive(s) {
    const p = s.offlinePackageStatus;
    if (p === 'downloading') return 'DOWNLOADING';
    if (p === 'updating') return 'UPDATING';
    if (p === 'error' || p === 'limited') return 'DEGRADED';
    return s.networkStatus === 'online' ? 'ONLINE' : 'OFFLINE';
  }
  let state = initial(); state.dataServiceStatus = derive(state);
  const PERSIST = ['destination', 'route', 'waypoints'];
  PERSIST.forEach(k => { try { const d = JSON.parse(localStorage.getItem('aigps.' + k)); if (d) state[k] = d; } catch (_) {} });
  const subs = new Set();
  A.State = {
    get: () => state,
    set(patch) {
      const next = Object.assign({}, state, patch);
      next.dataServiceStatus = derive(next);
      const changed = Object.keys(next).filter(k => state[k] !== next[k]);
      state = next;
      PERSIST.forEach(k => { if (changed.includes(k)) { try { const v = next[k]; (v && !(Array.isArray(v) && !v.length)) ? localStorage.setItem('aigps.' + k, JSON.stringify(v)) : localStorage.removeItem('aigps.' + k); } catch (_) {} } });
      if (changed.length) subs.forEach(f => { try { f(state, changed); } catch (e) { A.Log.error('subscriber 失敗', String(e)); } });
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    reset() { state = initial(); state.dataServiceStatus = derive(state); subs.forEach(f => f(state, ['*'])); },
    isOfflineReady: () => state.offlinePackageStatus === 'ready'
  };
})();
