/* 資料包下載／驗證／安裝（規格 §5.2–5.5）：分片下載、可暫停／續傳、SHA-256、原子切換、保留舊版。 */
(function () {
  const A = window.AIGPS, S = A.State, DB = A.Storage, BASE = 'packages/';
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const sha = async buf => { if (!(window.crypto && crypto.subtle)) throw mk('NO_CRYPTO', '此環境不支援 SHA-256（需 localhost 或 HTTPS）'); return hex(await crypto.subtle.digest('SHA-256', buf)); };
  const mk = (code, msg) => Object.assign(new Error(msg), { code });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const retryCfg = { tries: 3, delay: 400 };   // 每個分片最多嘗試 3 次，間隔 0.4 s、0.8 s（指數退避）
  const fetchBuf = async u => {
    let r; try { r = await fetch(u, { cache: 'no-store' }); } catch (_) { throw mk('NETWORK', '網路中斷，無法下載：' + u); }
    if (!r.ok) throw Object.assign(mk('HTTP', '下載失敗 HTTP ' + r.status + '：' + u), { status: r.status }); return r.arrayBuffer();
  };
  const retryable = e => e.code === 'NETWORK' || e.code === 'CORRUPT' || (e.code === 'HTTP' && (e.status >= 500 || e.status === 408 || e.status === 429));
  async function fetchPart(url, p) {
    for (let a = 0; ; a++) {
      try { const buf = await fetchBuf(url); if (buf.byteLength !== p.size || await sha(buf) !== p.sha256) throw mk('CORRUPT', '分片驗證失敗（' + p.path + '），資料包已拒絕'); return buf; }
      catch (e) {
        if (!retryable(e) || a >= retryCfg.tries - 1) throw e;
        emit({ type: 'retry', attempt: a + 1, max: retryCfg.tries - 1, reason: e.code }); await wait(retryCfg.delay * Math.pow(2, a)); if (ctl && ctl.stop) throw mk(ctl.stop, ctl.stop === 'PAUSED' ? '已暫停' : '已取消');
      }
    }
  }
  const subs = new Set(), emit = e => subs.forEach(f => { try { f(e); } catch (_) {} });
  let ctl = null; const sim = { quota: false, slow: false };

  async function install(id, ver) {
    if (ctl) throw mk('BUSY', '已有下載進行中'); ctl = { stop: null };
    const key = id + '@' + ver, hadActive = !!(await DB.get('meta', 'active')), idle = hadActive ? 'ready' : 'none';
    try {
      const m = JSON.parse(new TextDecoder().decode(await fetchBuf(`${BASE}${id}/${ver}/manifest.json`)));
      if (m.schemaVersion !== A.VERSION.dataSchema) throw mk('INCOMPATIBLE', '資料包 schema 版本與此 App 不相容，請更新 App');
      const est = (navigator.storage && navigator.storage.estimate) ? await navigator.storage.estimate() : null;
      const free = sim.quota ? 0 : est ? est.quota - est.usage : Infinity;
      if (m.sizeBytes * 2 > free) throw mk('QUOTA', '儲存空間不足：需要約 ' + Math.ceil(m.sizeBytes * 2 / 1048576) + ' MB，請先清理舊資料包');
      S.set({ offlinePackageStatus: hadActive ? 'updating' : 'downloading' }); A.Log.info('開始下載 ' + key);
      const parts = m.files.flatMap(f => f.parts), staged = new Set((await DB.keys('staging', key + '/')).map(k => k.slice(key.length + 1)));
      let done = parts.filter(p => staged.has(p.path)).reduce((a, p) => a + p.size, 0); const total = m.files.reduce((a, f) => a + f.size, 0), t0 = performance.now(), base = done;
      for (const p of parts) {
        if (staged.has(p.path)) continue;
        if (ctl.stop) throw mk(ctl.stop, ctl.stop === 'PAUSED' ? '已暫停' : '已取消');
        const buf = await fetchPart(`${BASE}${id}/${ver}/${p.path}`, p);
        await DB.put('staging', key + '/' + p.path, buf); done += p.size;
        const sp = (done - base) / ((performance.now() - t0) / 1000 || 1);
        emit({ type: 'progress', key, done, total, percent: Math.round(done / total * 100), speed: sp, eta: sp ? (total - done) / sp : null });
        if (sim.slow) await wait(250);
      }
      emit({ type: 'verifying', key });
      const rec = { manifest: m, files: {} };
      for (const f of m.files) {   // 組裝並驗證整檔
        const bufs = []; for (const p of f.parts) bufs.push(await DB.get('staging', key + '/' + p.path));
        const all = new Uint8Array(f.size); let o = 0; bufs.forEach(b => { all.set(new Uint8Array(b), o); o += b.byteLength; });
        if (o !== f.size || await sha(all.buffer) !== f.sha256) throw mk('CORRUPT', '檔案驗證失敗：' + f.path);
        rec.files[f.path] = all.buffer;
      }
      if (await sha(new TextEncoder().encode(m.files.map(f => f.sha256).sort().join('')).buffer) !== m.sha256) throw mk('CORRUPT', '資料包整體 SHA-256 不符');
      await DB.swap(key, rec, id, ver);                // 驗證全部通過後才切換
      await DB.delPrefix('staging', key + '/'); await DB.prune();
      A.Log.info('資料包安裝完成並切換：' + key); emit({ type: 'done', key });
    } catch (e) {
      if (e.code === 'PAUSED' || e.code === 'CANCELED') { if (e.code === 'CANCELED') await DB.delPrefix('staging', key + '/'); A.Log.warn(e.message + '：' + key); emit({ type: e.code === 'PAUSED' ? 'paused' : 'canceled', key }); }
      else { if (e.code === 'CORRUPT') await DB.delPrefix('staging', key + '/'); A.Log.error('資料包失敗', e.message); emit({ type: 'error', key, code: e.code, message: e.message || String(e) }); }
    } finally { ctl = null; if (A.OM) await A.OM.refresh(idle); }
  }
  A.PM = {
    install, sim, retry: retryCfg, on: f => (subs.add(f), () => subs.delete(f)), busy: () => !!ctl,
    pause: () => { if (ctl) ctl.stop = 'PAUSED'; }, cancel: () => { if (ctl) ctl.stop = 'CANCELED'; },
    async listAvailable() { if (typeof navigator !== 'undefined' && navigator.onLine === false) throw mk('NETWORK', '目前沒有網路，無法取得版本清單'); return JSON.parse(new TextDecoder().decode(await fetchBuf(BASE + 'index.json'))); },
    async pending() { const g = {}; (await DB.keys('staging', '')).forEach(k => { const p = k.split('/')[0]; g[p] = (g[p] || 0) + 1; }); return g; },
    async verifyActive() {
      const a = await DB.get('meta', 'active'); if (!a) throw mk('NONE', '尚未安裝資料包');
      const rec = await DB.get('packages', a.id + '@' + a.version); if (!rec) throw mk('MISSING', '資料包紀錄遺失');
      for (const f of rec.manifest.files) if (await sha(rec.files[f.path]) !== f.sha256) return { ok: false, file: f.path };
      return { ok: true, version: a.version };
    },
    async rollback() { await DB.rollback(); await DB.prune(); await A.OM.refresh(); A.Log.warn('已回復到上一個版本'); },
    async removeAll() { await DB.clearAll(); await A.OM.refresh(); }
  };
})();
