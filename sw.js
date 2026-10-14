/* Service Worker：只快取 App Shell；資料包（/packages/）一律走網路並存入 IndexedDB，不進 Cache。 */
const VER = '1.0.0', CACHE = 'aigps-shell-' + VER;   // 正式版建置時 VER 會附上內容雜湊，任何檔案變動都會產生新的快取
const SHELL = ['./', 'index.html', 'navigation.html', 'search.html', 'route.html', 'poi.html', 'trip.html', 'weather.html', 'downloads.html', 'settings.html',
  'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon-180.png', 'assets/icons/favicon-32.png', 'css/variables.css', 'css/main.css', 'css/map.css', 'js/state.js', 'js/providers.js', 'js/demo.js', 'js/theme.js', 'js/gps.js', 'js/map.js', 'js/storage.js', 'js/package-manager.js', 'js/offline-manager.js', 'js/downloads.js', 'js/search.js', 'js/search-page.js', 'js/routing.js', 'js/route-page.js', 'js/pwa.js', 'js/home.js', 'js/trip.js', 'js/trip-page.js', 'js/settings-page.js', 'js/platform.js', 'js/notifications.js', 'js/media.js', 'js/phone.js', 'js/overlay.js', 'js/integ-ui.js', 'js/upahead.js', 'js/parking.js', 'js/assistant.js', 'js/voice.js', 'js/weather.js', 'js/weather-page.js', 'js/places.js', 'js/poi-page.js', 'js/alerts.js', 'js/traffic.js', 'js/lanes.js', 'js/navigation.js', 'js/nav-page.js', 'js/app.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));   // 不 skipWaiting：新版於下次完整開啟時才接手，不破壞目前離線版本
// 只有使用者在頁面上按「立即更新」（且不在導航中）才會收到這個訊息；之後頁面會重新載入
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
// 啟用時只刪除舊版 App Shell 快取（此時新快取已完整就緒）；資料包在 IndexedDB，不受影響
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('aigps-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients && self.clients.claim && self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/packages/')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).catch(() => caches.match('index.html'))));
});
