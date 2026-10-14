/* 部署用的安全與快取標頭規則（單一來源）：serve.js 與 release.js（產生 _headers）共用。 */
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self'", "font-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const COMMON = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'geolocation=(self), microphone=(), camera=(), payment=()', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin' };
const NO_CACHE = 'no-cache', IMMUTABLE = 'public, max-age=31536000, immutable';
// 依序比對（後面的覆蓋前面的）。pattern：精確路徑、以 * 結尾的前綴
const RULES = [
  ['/*', COMMON],
  ['/', { 'Cache-Control': NO_CACHE }], ['/*.html', { 'Cache-Control': NO_CACHE }], ['/js/*', { 'Cache-Control': NO_CACHE }], ['/css/*', { 'Cache-Control': NO_CACHE }],
  ['/sw.js', { 'Cache-Control': NO_CACHE, 'Service-Worker-Allowed': '/' }],           // Service Worker 必須每次重新驗證，否則無法發現新版
  ['/manifest.webmanifest', { 'Cache-Control': NO_CACHE, 'Content-Type': 'application/manifest+json; charset=utf-8' }],
  ['/assets/*', { 'Cache-Control': 'public, max-age=604800' }],
  ['/packages/*', { 'Cache-Control': IMMUTABLE }],                                    // 資料包以版本資料夾發布，內容不可變
  ['/packages/index.json', { 'Cache-Control': NO_CACHE }]                             // 版本清單要隨時能看到新版
];
const match = (pat, p) => pat === p || (pat.endsWith('/*') && p.startsWith(pat.slice(0, -1))) || (pat === '/*.html' && p.endsWith('.html')) || (pat === '/*');
function headersFor(p) { const h = {}; for (const [pat, hs] of RULES) if (match(pat, p)) Object.assign(h, hs); return h; }
function toHeadersFile() { return RULES.map(([pat, hs]) => `${pat === '/*.html' ? '/*.html' : pat}\n` + Object.entries(hs).map(([k, v]) => `  ${k}: ${v}`).join('\n')).join('\n\n') + '\n'; }
module.exports = { CSP, COMMON, RULES, headersFor, toHeadersFile };
