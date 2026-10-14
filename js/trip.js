/* 行程資料（規格 §20）：行程紀錄（Trip Log）與跨分頁的即時快照。
   隱私：只保存 距離／時間／速度 與目的地名稱，不保存行車軌跡；可隨時清除或匯出。 */
(function () {
  const A = window.AIGPS, S = A.State, LOG = 'aigps.tripLog', LIVE = 'aigps.tripLive', MAX = 50, MIN_DIST = 100;
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const entryOf = (s, completed) => { const t = s.tripData || {}; return { t: Date.now(), dest: s.destination ? s.destination.name : null, distance: t.distance || 0, duration: t.duration || 0, avg: t.avgSpeed || 0, max: t.maxSpeed || 0, walk: !!(s.route && s.route.walk), completed }; };
  function record(s, completed) {
    if (!(s.tripData && s.tripData.distance >= MIN_DIST)) return null;   // 太短的行程不記錄
    const log = (read(LOG) || []); log.unshift(entryOf(s, completed)); write(LOG, log.slice(0, MAX)); return log[0];
  }
  const csv = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCsv = log => ['時間,目的地,距離(m),時間(s),平均(km/h),最高(km/h),方式,完成'].concat(log.map(e => [new Date(e.t).toISOString(), csv(e.dest), e.distance, e.duration, e.avg, e.max, e.walk ? '步行' : '開車', e.completed ? '是' : '否'].join(','))).join('\n');
  const snap = s => ({ t: Date.now(), status: s.navigationStatus, speed: s.speed, tripData: s.tripData, remainingDistance: s.remainingDistance, remainingTime: s.remainingTime, ETA: s.ETA });   // 不含位置
  let last = null, lastLive = 0;
  S.subscribe((s, ch) => {
    if (ch.includes('navigationStatus')) {
      if (s.navigationStatus === 'arrived') record(s, true); else if (['navigating', 'rerouting'].includes(last) && s.navigationStatus === 'idle') record(s, false);
      last = s.navigationStatus; write(LIVE, snap(s)); lastLive = Date.now();
    } else if (ch.includes('tripData') && ['navigating', 'rerouting'].includes(s.navigationStatus) && Date.now() - lastLive > 2000) { lastLive = Date.now(); write(LIVE, snap(s)); }
  });
  A.Trip = { readLog: () => read(LOG) || [], clearLog() { try { localStorage.removeItem(LOG); localStorage.removeItem(LIVE); } catch (_) {} }, readLive() { const l = read(LIVE); return l ? Object.assign({}, l, { ageSec: Math.round((Date.now() - l.t) / 1000) }) : null; }, toCsv, record, _entry: entryOf, MAX, MIN_DIST };
})();
