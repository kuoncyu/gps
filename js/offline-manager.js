/* 離線管理：把資料包狀態同步到 Navigation State；只有必要元件齊全才 Offline Ready（§5.4）；註冊 Service Worker。 */
(function () {
  const A = window.AIGPS, S = A.State, DB = A.Storage, REQUIRED = ['map', 'routing', 'search'];
  async function refresh(idle) {
    try {
      const a = await DB.get('meta', 'active');
      if (!a) return S.set({ offlinePackageStatus: A.PM && A.PM.busy() ? S.get().offlinePackageStatus : (idle || 'none'), offlinePackage: null });
      const rec = await DB.get('packages', a.id + '@' + a.version);
      if (!rec) return S.set({ offlinePackageStatus: 'error', offlinePackage: null });
      if (rec.manifest.schemaVersion !== A.VERSION.dataSchema) { A.Log.error('資料包格式與 App 不相容', 'schema ' + rec.manifest.schemaVersion); return S.set({ offlinePackage: { id: a.id, version: a.version, demo: !!rec.manifest.demo, components: {}, incompatible: true, schema: rec.manifest.schemaVersion }, offlinePackageStatus: 'error' }); }
      const comps = {}; Object.entries(rec.manifest.components).forEach(([k, p]) => { comps[k] = !!rec.files[p]; });
      S.set({ offlinePackage: { id: a.id, version: a.version, demo: !!rec.manifest.demo, components: comps }, offlinePackageStatus: REQUIRED.every(k => comps[k]) ? 'ready' : 'limited' });
    } catch (e) { A.Log.error('讀取資料包狀態失敗', String(e)); S.set({ offlinePackageStatus: 'error' }); }
  }
  async function estimate() { try { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } catch (_) { return null; } }
  A.OM = { refresh, estimate };
  document.addEventListener('DOMContentLoaded', async () => {
    refresh();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  });
})();
