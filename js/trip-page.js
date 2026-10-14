/* 行程資料頁：即時（來自導航頁的快照，跨分頁）＋ 行程紀錄 */
(function () {
  const A = window.AIGPS, T = A.Trip, $ = id => document.getElementById(id);
  const km = d => d == null ? '—' : d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m', kmh = v => v == null ? '—' : Math.round(v) + ' km/h';
  const dur = s => s == null ? '—' : s >= 3600 ? Math.floor(s / 3600) + ' 小時 ' + Math.round(s % 3600 / 60) + ' 分' : s >= 60 ? Math.round(s / 60) + ' 分鐘' : Math.round(s) + ' 秒';
  const hm = iso => iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS = { navigating: '導航中', rerouting: '重新規劃中', arrived: '已抵達', idle: '未在導航', planning: '路線已規劃，尚未開始' };
  function live() {
    const l = T.readLive(), note = $('liveNote'), kv = $('liveKv');
    if (!l) { note.textContent = '還沒有行程資料。在導航頁開始導航後，這裡會顯示即時數據。'; kv.innerHTML = ''; return; }
    const active = ['navigating', 'rerouting'].includes(l.status), fresh = l.ageSec <= 10, d = l.tripData || {};
    note.textContent = active ? (fresh ? `${STATUS[l.status]}・${l.ageSec} 秒前更新` : `導航頁已超過 ${l.ageSec} 秒沒有更新（可能已關閉或暫停）。以下為最後一次的數據。`) : `最近一次：${STATUS[l.status] || l.status}（${new Date(l.t).toLocaleString('zh-TW', { hour12: false })}）`;
    kv.innerHTML = [['目前速度', kmh(active && fresh ? l.speed : null)], ['平均速度', kmh(d.avgSpeed)], ['最高速度', kmh(d.maxSpeed)], ['已行駛距離', km(d.distance)], ['已行駛時間', dur(d.duration)], ['剩餘距離', km(active ? l.remainingDistance : null)], ['剩餘時間', dur(active ? l.remainingTime : null)], ['預計抵達', hm(active ? l.ETA : null)], ['海拔', '裝置未提供（Demo）']].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  function log() {
    const L = T.readLog(), box = $('logBox'); $('logCsv').disabled = !L.length; $('logClear').disabled = !L.length;
    if (!L.length) { box.innerHTML = '<div class="empty">還沒有行程紀錄。完成一次導航（或中途結束超過 100 公尺的行程）後會出現在這裡。</div>'; return; }
    box.innerHTML = `<div class="tablewrap"><table class="t"><thead><tr><th>時間</th><th>目的地</th><th>距離</th><th>時間</th><th>平均</th><th>最高</th><th>狀態</th></tr></thead><tbody>${L.map(e => `<tr><td>${new Date(e.t).toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(e.dest || '—')}${e.walk ? '（步行）' : ''}</td><td>${km(e.distance)}</td><td>${dur(e.duration)}</td><td>${kmh(e.avg)}</td><td>${kmh(e.max)}</td><td>${e.completed ? '已抵達' : '中途結束'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('logClear').onclick = () => { if (confirm('清除所有行程紀錄？此動作無法復原。')) { T.clearLog(); log(); live(); } };
    $('logCsv').onclick = () => { const b = new Blob(['\ufeff' + T.toCsv(T.readLog())], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'trip-log.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    window.addEventListener('storage', e => { if (e.key === 'aigps.tripLive') live(); if (e.key === 'aigps.tripLog') log(); });
    live(); log(); setInterval(live, 1000);
  });
})();
