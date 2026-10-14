/* 下載中心頁面邏輯 */
(function () {
  const A = window.AIGPS, PM = A.PM, DB = A.Storage, $ = id => document.getElementById(id);
  let target = null;
  const mb = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  const msg = (t, l) => { const e = $('msg'); e.textContent = t; e.className = 'lvl-' + (l || 'info'); };
  const LBL = [['map', '地圖'], ['routing', '路由'], ['search', '搜尋'], ['poi', 'POI'], ['alerts', '駕駛警示'], ['voice', '語音']];

  async function render() {
    const act = await DB.get('meta', 'active'), prev = await DB.get('meta', 'previous'), st = A.State.get(), est = await A.OM.estimate(), busy = PM.busy();
    $('active').textContent = act ? `${act.id} v${act.version}${st.offlinePackage && st.offlinePackage.demo ? '（DEMO）' : ''}` : '尚未安裝';
    $('ready').textContent = st.offlinePackageStatus === 'ready' ? '✓ 離線導航就緒' : (st.offlinePackage && st.offlinePackage.incompatible ? '⚠ 資料包格式與此 App 不相容，請安裝新版資料包' : '尚未就緒');
    const c = (st.offlinePackage || {}).components || {};
    $('checks').innerHTML = LBL.map(([k, n]) => `<li>${n} ${c[k] ? '<b class="done">✓</b>' : '<span class="todo">—</span>'}</li>`).join('') +
      `<li>即時交通 <span class="todo">— ${st.networkStatus === 'online' ? '尚未接入' : '無網路'}</span></li><li>即時天氣 <span class="todo">— ${st.networkStatus === 'online' ? '尚未接入' : '無網路'}</span></li>`;
    $('quota').textContent = est ? `已用 ${mb(est.usage)} ／ 配額 ${mb(est.quota)}` : '瀏覽器未提供儲存空間資訊';
    $('btnRollback').disabled = !prev || busy; $('btnVerify').disabled = !act || busy; $('btnRemove').disabled = busy;
    $('btnPause').disabled = !busy; $('btnCancel').disabled = !busy; $('btnResume').disabled = busy || !target;
    let list = '';
    try {
      const idx = await PM.listAvailable(), pend = await PM.pending();
      list = idx.packages.flatMap(p => p.versions.map(v => {
        const key = p.id + '@' + v.version, cur = act && act.id === p.id && act.version === v.version;
        return `<li>${p.id} v${v.version}・${mb(v.sizeBytes)}${v.testOnly ? ' <span class="demo-tag">測試用：損壞版本</span>' : ''}${cur ? ' <b class="done">（目前版本）</b>' : ''}${pend[key] ? ` <span class="todo">（已下載 ${pend[key]} 個分片，可續傳）</span>` : ''}
          <button data-i="${p.id}" data-v="${v.version}" ${cur || busy ? 'disabled' : ''}>${act ? '更新／切換' : '下載'}</button></li>`;
      })).join('');
    } catch (e) { list = '<li class="lvl-warn">無法取得版本清單（可能無網路）。已安裝的資料包不受影響。</li>'; }
    $('avail').innerHTML = list;
    $('avail').querySelectorAll('button[data-i]').forEach(b => b.onclick = () => start(b.dataset.i, b.dataset.v));
  }
  function start(id, v) { target = [id, v]; msg('下載中…'); PM.install(id, v); render(); }
  PM.on(e => {
    if (e.type === 'progress') { $('bar').value = e.percent; $('pct').textContent = `${e.percent}%（${mb(e.done)} / ${mb(e.total)}）・${mb(e.speed)}/s${e.eta != null ? '・約剩 ' + Math.ceil(e.eta) + ' 秒' : ''}`; return; }
    if (e.type === 'retry') return msg(`網路不穩，重試中（第 ${e.attempt} 次，最多 ${e.max} 次）…`, 'warn');
    if (e.type === 'verifying') return msg('驗證 SHA-256…');
    const m = { done: ['資料包已驗證並切換完成', 'info'], paused: ['已暫停，可按「繼續」從中斷處恢復', 'warn'], canceled: ['已取消，暫存已清除', 'warn'], error: [e.message + '。目前版本未受影響。', 'error'] }[e.type];
    if (m) msg(m[0], m[1]); if (e.type === 'done') { target = null; $('bar').value = 100; } render();
  });
  A.State.subscribe((s, ch) => { if (ch.includes('offlinePackageStatus') && !PM.busy()) render(); });
  document.addEventListener('DOMContentLoaded', async () => {
    $('btnPause').onclick = () => PM.pause(); $('btnCancel').onclick = () => PM.cancel(); $('btnResume').onclick = () => target && start(...target);
    $('btnVerify').onclick = async () => { try { const r = await PM.verifyActive(); msg(r.ok ? '驗證通過：v' + r.version : '驗證失敗：' + r.file, r.ok ? 'info' : 'error'); } catch (e) { msg(e.message, 'error'); } };
    $('btnRollback').onclick = async () => { try { await PM.rollback(); msg('已回復到上一個版本', 'warn'); } catch (e) { msg(e.message, 'error'); } render(); };
    $('btnRemove').onclick = async () => { if (confirm('刪除所有離線資料包？之後需重新下載才能離線導航。')) { await PM.removeAll(); msg('已刪除所有資料包', 'warn'); render(); } };
    $('simSlow').onchange = e => PM.sim.slow = e.target.checked; $('simQuota').onchange = e => PM.sim.quota = e.target.checked;
    const p = await PM.pending(); const k = Object.keys(p)[0]; if (k) { target = k.split('@'); msg(`偵測到未完成的下載 ${k}（${p[k]} 個分片已存），可按「繼續」恢復`, 'warn'); }
    render();
  });
})();
