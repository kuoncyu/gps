/* IndexedDB 封裝（規格 §5.6）。stores：staging（下載分片）、packages（已驗證資料包）、meta（active / previous）。 */
(function () {
  const A = window.AIGPS; let dbp;
  const open = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open('aigps', 1); r.onupgradeneeded = () => ['staging', 'packages', 'meta'].forEach(s => r.result.createObjectStore(s)); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const rq = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function run(stores, mode, fn) {
    const db = await open(), tx = db.transaction(stores, mode), st = [].concat(stores).map(s => tx.objectStore(s));
    const done = new Promise((ok, no) => { tx.oncomplete = ok; tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error || new Error('交易中止')); });
    done.catch(() => {});   // 真正的錯誤由 fn 的例外回報；避免未處理的 rejection 觸發全域錯誤提示
    const out = await fn(...st); await done; return out;
  }
  A.Storage = {
    get: (s, k) => run(s, 'readonly', st => rq(st.get(k))),
    put: (s, k, v) => run(s, 'readwrite', st => rq(st.put(v, k))),
    del: (s, k) => run(s, 'readwrite', st => rq(st.delete(k))),
    keys: (s, prefix) => run(s, 'readonly', st => rq(st.getAllKeys())).then(ks => ks.filter(k => String(k).startsWith(prefix || ''))),
    async delPrefix(s, prefix) { const ks = await this.keys(s, prefix); await run(s, 'readwrite', st => Promise.all(ks.map(k => rq(st.delete(k))))); },
    /* 原子切換：新版寫入 + active/previous 在同一交易，失敗則全部不生效 */
    swap: (key, rec, id, version) => run(['packages', 'meta'], 'readwrite', async (p, m) => {
      await rq(p.put(rec, key)); const cur = await rq(m.get('active'));
      if (cur) await rq(m.put(cur, 'previous')); await rq(m.put({ id, version }, 'active'));
    }),
    rollback: () => run('meta', 'readwrite', async m => {
      const prev = await rq(m.get('previous')); if (!prev) throw new Error('沒有可回復的舊版本');
      await rq(m.put(prev, 'active')); await rq(m.delete('previous'));
    }),
    async prune() {   // 只保留 active + previous
      const m = await Promise.all([this.get('meta', 'active'), this.get('meta', 'previous')]), keep = m.filter(Boolean).map(x => x.id + '@' + x.version);
      for (const k of await this.keys('packages')) if (!keep.includes(k)) await this.del('packages', k);
    },
    async clearAll() { for (const s of ['staging', 'packages', 'meta']) for (const k of await this.keys(s)) await this.del(s, k); }
  };
})();
