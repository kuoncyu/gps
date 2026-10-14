// 發布檢查：PWA manifest／圖示／版本一致性／部署標頭（真實 HTTP）：node tools/test_release.js （可用 AIGPS_ROOT 指向 dist）
const fs = require('fs'), path = require('path'), assert = require('assert'), http = require('http');
const ROOT = path.resolve(process.env.AIGPS_ROOT || path.join(__dirname, '..')), R = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), SRC = path.join(__dirname, '..'), isDist = !!process.env.AIGPS_ROOT;
const { createServer } = require('./serve'), { headersFor, toHeadersFile, CSP } = require('./headers'); let n = 0; const ok = (c, m) => { n++; assert(c, m); };
// 1 版本一致（開發樹）：package.json 為唯一來源
const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')); ok(/^\d+\.\d+\.\d+$/.test(pkg.version), 'semver：' + pkg.version);
const stateVer = R('js/state.js').match(/app:\s*['"]([^'"]+)['"]/)[1]; ok(stateVer === pkg.version, `state.js 版本 ${stateVer} ≠ package.json ${pkg.version}`);
const swVer = R('sw.js').match(/VER\s*=\s*['"]([^'"]+)['"]/)[1]; ok(isDist ? swVer.startsWith(pkg.version + '+') : swVer === pkg.version, `sw.js VER ${swVer}`);
if (isDist) { const b = JSON.parse(R('BUILD.json')); ok(b.version === pkg.version && /^[0-9a-f]{10}$/.test(b.build) && swVer === `${pkg.version}+${b.build}` && R('js/state.js').includes(b.build), 'BUILD.json、sw.js、state.js 版本與 build 一致'); ok(b.files.every(f => { const d = fs.readFileSync(path.join(ROOT, f.path)); return d.length === f.size && require('crypto').createHash('sha256').update(d).digest('hex') === f.sha256; }), 'BUILD.json 的檔案雜湊與實際內容相符'); }
// 2 manifest
const m = JSON.parse(R('manifest.webmanifest')); for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'theme_color', 'background_color', 'lang']) ok(m[k], 'manifest 缺 ' + k);
ok(m.display === 'standalone' && m.lang === 'zh-Hant' && m.name.length <= 45 && m.short_name.length <= 12, 'display／lang／名稱長度'); { const base = 'https://example.test/app/manifest.webmanifest', st = new URL(m.start_url, base), sc = new URL(m.scope, base); ok(st.origin === sc.origin && st.pathname.startsWith(sc.pathname), 'start_url 在 scope 內：' + st.pathname + ' / ' + sc.pathname); } ok(fs.existsSync(path.join(ROOT, m.start_url)), 'start_url 檔案存在');
const png = f => { const b = fs.readFileSync(path.join(ROOT, f)); ok(b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), f + ' 是 PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };
for (const ic of m.icons) { const d = png(ic.src), [w, h] = ic.sizes.split('x').map(Number); ok(d.w === w && d.h === h && ic.type === 'image/png', `${ic.src} 實際尺寸 ${d.w}x${d.h} 與宣告 ${ic.sizes} 一致`); }
ok(m.icons.some(i => i.sizes === '192x192' && /any/.test(i.purpose)) && m.icons.some(i => i.sizes === '512x512' && /any/.test(i.purpose)) && m.icons.some(i => /maskable/.test(i.purpose)), '含 192／512／maskable 圖示（可安裝條件）');
for (const s of m.shortcuts || []) ok(fs.existsSync(path.join(ROOT, s.url)), '捷徑頁面存在：' + s.url); ok(png('assets/icons/apple-touch-icon-180.png').w === 180 && png('assets/icons/favicon-32.png').w === 32, 'apple-touch-icon／favicon');
// 3 每個頁面都有 PWA 必要標籤
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.html'))) { const h = R(f); ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(h) && /name="theme-color"/.test(h) && /rel="apple-touch-icon"/.test(h) && /rel="icon"/.test(h) && /js\/pwa\.js/.test(h), f + ' 缺 PWA 標籤或 pwa.js'); }
ok(R('index.html').includes(`content="${m.theme_color}"`), 'theme-color 與 manifest 一致');
// 4 標頭規則與真實 HTTP
const hf = toHeadersFile(); ok(/\/sw\.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: \//.test(hf) && /\/packages\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(hf) && hf.includes(CSP), '_headers 內容');
const srv = createServer(ROOT); const get = (p, o) => new Promise((res, rej) => { const req = http.request(Object.assign({ host: '127.0.0.1', port: srv.address().port, path: p, method: 'GET' }, o), r => { let b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, h: r.headers, body: Buffer.concat(b) })); }); req.on('error', rej); req.end(); });
srv.listen(0, '127.0.0.1', async () => { try {
  let r = await get('/'); ok(r.status === 200 && /text\/html/.test(r.h['content-type']) && r.h['cache-control'] === 'no-cache' && r.h['content-security-policy'] === CSP && r.h['x-content-type-options'] === 'nosniff' && r.h['x-frame-options'] === 'DENY' && r.h['referrer-policy'] === 'no-referrer', '首頁：200、不快取、安全標頭'); const etag = r.h.etag; ok(!!etag);
  r = await get('/', { headers: { 'If-None-Match': etag } }); ok(r.status === 304, '條件式請求 304');
  r = await get('/sw.js'); ok(r.status === 200 && r.h['cache-control'] === 'no-cache' && r.h['service-worker-allowed'] === '/' && /javascript/.test(r.h['content-type']), 'sw.js 每次重新驗證');
  r = await get('/manifest.webmanifest'); ok(/application\/manifest\+json/.test(r.h['content-type']) && r.status === 200, 'manifest MIME');
  r = await get('/assets/icons/icon-192.png'); ok(r.h['content-type'] === 'image/png' && /max-age=604800/.test(r.h['cache-control']), '圖示長快取');
  r = await get('/packages/index.json'); ok(r.h['cache-control'] === 'no-cache', '資料包版本清單不快取'); const v = JSON.parse(r.body.toString()).packages[0].versions.find(x => !x.testOnly).version;
  r = await get(`/packages/TW-DEMO/${v}/manifest.json`); ok(r.status === 200 && /immutable/.test(r.h['cache-control']), '資料包內容不可變、長快取');
  { // 目錄穿越：在根目錄「外面」放機密檔，各種寫法都不能讀到
    const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aigps-')); fs.mkdirSync(path.join(tmp, 'site/.git'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'site/node_modules'));
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'TOP-SECRET'); fs.writeFileSync(path.join(tmp, 'site/index.html'), 'hello'); fs.writeFileSync(path.join(tmp, 'site/.git/config'), 'x'); fs.writeFileSync(path.join(tmp, 'site/node_modules/m.js'), 'x');
    const s2 = createServer(path.join(tmp, 'site')); await new Promise(res => s2.listen(0, '127.0.0.1', res)); const g2 = p => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: s2.address().port, path: p }, x => { let b = ''; x.on('data', c => { b += c; }); x.on('end', () => res({ status: x.statusCode, body: b })); }); q.on('error', rej); q.end(); });
    ok((await g2('/')).body === 'hello', '臨時站台可讀');
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt', '/a/../../secret.txt', '/%2e%2e%2fsecret.txt', '/....//secret.txt', '/.git/config', '/node_modules/m.js']) { const x = await g2(p); ok(!x.body.includes('TOP-SECRET') && x.body !== 'x' && [403, 404].includes(x.status), '擋下 ' + p + ' → ' + x.status); }
    s2.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  r = await get('/nope.html'); ok(r.status === 404 && r.h['content-security-policy'] === CSP, '404 也帶安全標頭'); r = await new Promise(res => { const q = http.request({ host: '127.0.0.1', port: srv.address().port, path: '/', method: 'POST' }, x => res(x)); q.end(); }); ok(r.statusCode === 405, 'POST 405');
  for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.html'))) { r = await get('/' + f); ok(r.status === 200, f + ' 可取得'); }
  console.log(`release tests PASS（${n} 項檢查，${isDist ? 'dist 正式版' : '開發樹'}）`); srv.close(); } catch (e) { console.error('FAIL', e.message); srv.close(); process.exit(1); } });
