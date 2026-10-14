// 安全與隱私靜態檢查（規格 §23）：node tools/test_security.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.resolve(process.env.AIGPS_ROOT || path.join(__dirname, '..')), R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const list = (d, ext) => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith(ext)).map(f => `${d}/${f}`);
const JS = [...list('js', '.js'), 'sw.js'], HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')), CSS = list('css', '.css');
const lines = f => R(f).split('\n').map((l, i) => [i + 1, l]);
const hits = (files, re, exclude) => files.flatMap(f => lines(f).filter(([, l]) => re.test(l) && !(exclude && exclude.test(l))).map(([n, l]) => `${f}:${n}: ${l.trim().slice(0, 80)}`));
let checks = 0; const none = (name, h) => { checks++; assert.strictEqual(h.length, 0, name + '\n  ' + h.join('\n  ')); };

// 1 API Key／機密不得出現在可公開部署的前端
const SECRET = /sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token|passwd|password|authorization)\s*[:=]\s*['"][^'"]{8,}['"]/i;
none('前端不得含 API Key／密碼／私鑰', hits([...JS, ...HTML, ...CSS, 'manifest.webmanifest'], SECRET));
// 2 不外連：沒有外部網址；網路 API 只出現在資料包下載與 Service Worker；沒有追蹤／分析
none('原始碼不得含外部網址（人類可讀訊息中的 localhost 除外）', hits([...JS, ...HTML, ...CSS], /https?:\/\//, /http:\/\/localhost/));
const NET = /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new Image\(\)\.src/;
const netFiles = hits(JS, NET).map(h => h.split(':')[0]); checks++; assert(netFiles.every(f => ['js/package-manager.js', 'sw.js'].includes(f)), '網路請求只允許在 package-manager.js 與 sw.js：' + [...new Set(netFiles)]);
none('不得含分析／追蹤程式', hits([...JS, ...HTML], /google-analytics|gtag\(|googletagmanager|segment\.com|mixpanel|sentry|hotjar|facebook\.net/i));
// 3 可套用嚴格 CSP（script-src 'self'）
none('HTML 不得含行內 <script>', HTML.flatMap(f => (R(f).match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).map(m => f + ': ' + m)));
none('不得使用行內事件處理或 javascript: 連結', hits([...HTML, ...JS], /\son[a-z]+\s*=\s*["']|javascript:/));
none('不得使用 eval／new Function／document.write', hits(JS, /\beval\(|new Function\(|document\.write\(/));
// 4 使用者位置資料最小化：只有目的地、路線、途經點會跨頁保存；localStorage 鍵一律 aigps. 前綴
const persist = fs.readFileSync(path.join(__dirname, '..', 'js/state.js'), 'utf8').match(/PERSIST\s*=\s*\[([^\]]*)\]/)[1].replace(/\s|['"]/g, '').split(','); checks++; assert.deepStrictEqual(persist, ['destination', 'route', 'waypoints'], '跨頁保存的狀態欄位（不得包含 currentLocation）：' + persist);
const keys = new Set(JS.flatMap(f => [...R(f).matchAll(/localStorage\.(?:get|set|remove)Item\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]))); checks++; assert([...keys].every(k => k.startsWith('aigps.')), 'localStorage 鍵都有 aigps. 前綴：' + [...keys].filter(k => !k.startsWith('aigps.')));
none('currentLocation 不得寫入儲存', hits(JS, /localStorage\.setItem\([^)]*currentLocation|JSON\.stringify\([^)]*currentLocation/));
// 5 資料包完整性：安裝流程必須驗證 SHA-256 與 schema 後才能切換（結構檢查針對原始碼；dist 確認關鍵字串仍在）
const pm = fs.readFileSync(path.join(__dirname, '..', 'js/package-manager.js'), 'utf8'); checks++; assert(/subtle\.digest\('SHA-256'/.test(pm) && pm.indexOf('DB.swap') > pm.indexOf("throw mk('CORRUPT'") && /schemaVersion !== A\.VERSION\.dataSchema/.test(pm), '原始碼：驗證 SHA-256 與 schema 後才切換');
checks++; assert(/subtle\.digest\(["']SHA-256["']/.test(R('js/package-manager.js')) && /schemaVersion/.test(R('js/package-manager.js')), '實際出貨的檔案仍含 SHA-256 驗證');
// 6 CSP 規則本身
const { CSP, headersFor } = require('./headers'); for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "connect-src 'self'", "base-uri 'none'"]) { checks++; assert(CSP.includes(d), 'CSP 含 ' + d); } checks++; assert(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(CSP), 'script-src 不得放寬');
console.log(`security tests PASS（${checks} 項檢查，${JS.length} 個 JS、${HTML.length} 個頁面）`);
