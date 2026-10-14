#!/usr/bin/env node
/* Production build 與發布關卡：node tools/release.js [--skip-tests] [--skip-e2e] [--no-minify] [--no-packages]
   1) 版本以 package.json 為唯一來源，同步到 js/state.js 與 sw.js
   2) 開發樹完整測試（run_all） 3) 建置 dist：壓縮 JS／CSS、Service Worker 快取清單由檔案自動產生、版本含內容雜湊
   4) 對 dist「正式版產物」重跑靜態檢查／安全／發布／17 項驗收／壓力測試（用壓縮後的程式）
   5) 產出 release/ 內的 dist 與原始碼壓縮檔與 SHA256SUMS */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'release'), args = new Set(process.argv.slice(2));
const sha = b => crypto.createHash('sha256').update(b).digest('hex'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), say = (...a) => console.log(...a);
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]);
function run(file, a, o = {}) { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', file), ...a], Object.assign({ cwd: ROOT, encoding: 'utf8' }, o)); if (r.status) { console.error(`\n✗ ${file} 失敗\n${(r.stdout || '').split('\n').slice(-15).join('\n')}\n${r.stderr || ''}`); process.exit(1); } return r.stdout; }

// 1) 版本
const pkg = JSON.parse(rd('package.json')), V = pkg.version; if (!/^\d+\.\d+\.\d+$/.test(V)) { console.error('package.json version 必須是 x.y.z：' + V); process.exit(1); }
for (const [f, re, to] of [['js/state.js', /(app:\s*)'[^']*'/, `$1'${V}'`], ['sw.js', /(const VER = )'[^']*'/, `$1'${V}'`]]) { const s = rd(f), n = s.replace(re, to); if (s !== n) { fs.writeFileSync(path.join(ROOT, f), n); say(`同步版本 ${f} → ${V}`); } }
say(`\n=== AI GPS ${V} 發布建置 ===`);
// 2) 開發樹測試
if (!args.has('--skip-tests')) { say('\n[1/5] 開發樹完整測試…'); say(run('run_all.js', []).trim().split('\n').slice(-2).join('\n')); } else say('\n[1/5] 略過開發樹測試（--skip-tests）');
// 3) 建置
say('\n[2/5] 建置 dist…'); fs.rmSync(DIST, { recursive: true, force: true }); fs.mkdirSync(DIST, { recursive: true });
let esbuild = null; if (!args.has('--no-minify')) { try { esbuild = require('esbuild'); } catch (_) { console.error('找不到 esbuild：請先執行 npm install（或加 --no-minify）'); process.exit(1); } }
const put = (f, data) => { fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true }); fs.writeFileSync(path.join(DIST, f), data); };
let rawBytes = 0, outBytes = 0; const min = (f, loader) => { const src = rd(f); rawBytes += Buffer.byteLength(src); const out = esbuild ? esbuild.transformSync(src, { loader, minify: true, target: 'es2019', legalComments: 'none' }).code : src; outBytes += Buffer.byteLength(out); put(f, out); };
fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => put(f, rd(f).replace(/<!--[\s\S]*?-->/g, '')));
put('manifest.webmanifest', JSON.stringify(JSON.parse(rd('manifest.webmanifest'))));
for (const f of fs.readdirSync(path.join(ROOT, 'css'))) if (f.endsWith('.css')) min('css/' + f, 'css'); for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) min('js/' + f, 'js'); min('sw.js', 'js');
for (const f of walk(path.join(ROOT, 'assets'))) put('assets/' + f, fs.readFileSync(path.join(ROOT, 'assets', f)));
if (!args.has('--no-packages')) for (const f of walk(path.join(ROOT, 'packages'))) put('packages/' + f, fs.readFileSync(path.join(ROOT, 'packages', f)));
for (const f of ['DEPLOY.md', 'CHANGELOG.md']) if (fs.existsSync(path.join(ROOT, f))) put(f, rd(f));
// Service Worker 快取清單：由 dist 檔案自動產生（不再手動維護）；build id = 內容雜湊
const htmls = fs.readdirSync(DIST).filter(f => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
const shell = ['./', ...htmls, 'manifest.webmanifest', ...walk(path.join(DIST, 'assets/icons')).sort().map(f => 'assets/icons/' + f), ...walk(path.join(DIST, 'css')).sort().map(f => 'css/' + f), ...walk(path.join(DIST, 'js')).sort().map(f => 'js/' + f)];
const h = crypto.createHash('sha256'); shell.filter(f => f !== './').sort().forEach(f => { h.update(f + '\0'); h.update(fs.readFileSync(path.join(DIST, f))); }); const BUILD = h.digest('hex').slice(0, 10);
const stamp = (f, re, to) => { const s = fs.readFileSync(path.join(DIST, f), 'utf8'), n = s.replace(re, to); if (s === n) { console.error('建置標記失敗：' + f + ' ' + re); process.exit(1); } fs.writeFileSync(path.join(DIST, f), n); };
stamp('js/state.js', /build:\s*["']dev["']/, `build:"${BUILD}"`); stamp('sw.js', /VER\s*=\s*["'][^"']*["']/, `VER="${V}+${BUILD}"`); stamp('sw.js', /SHELL\s*=\s*\[[\s\S]*?\]/, `SHELL=${JSON.stringify(shell)}`);
const { toHeadersFile } = require('./headers'); put('_headers', toHeadersFile());
const files = walk(DIST).filter(f => f !== 'BUILD.json').sort().map(f => { const b = fs.readFileSync(path.join(DIST, f)); return { path: f, size: b.length, sha256: sha(b) }; });
put('BUILD.json', JSON.stringify({ name: pkg.name, version: V, build: BUILD, date: new Date().toISOString(), dataSchema: 1, files }, null, 1));
say(`  版本 ${V}　build ${BUILD}　${files.length} 個檔案　JS/CSS ${(rawBytes / 1024).toFixed(0)} KB → ${(outBytes / 1024).toFixed(0)} KB（${esbuild ? '已壓縮' : '未壓縮'}）　SW 快取清單 ${shell.length} 項`);
// 4) 驗證 dist
say('\n[3/5] 驗證 dist 檔案…'); for (const f of files.filter(x => x.path.endsWith('.js'))) { const r = cp.spawnSync(process.execPath, ['--check', path.join(DIST, f.path)]); if (r.status) { console.error('語法錯誤：' + f.path); process.exit(1); } }
const banned = files.map(f => f.path).filter(f => /^(tools|node_modules|docs|data|release)\//.test(f) || /\.(py|map|md)$/.test(f) && !/^(DEPLOY|CHANGELOG)\.md$/.test(f) || /^(QA|README)\.md$/.test(f)); if (banned.length) { console.error('dist 含不該出貨的檔案：' + banned.join(', ')); process.exit(1); } say('  JS 語法 OK；沒有原始碼工具、測試、文件雜物');
say('\n[4/5] 對 dist 正式版重跑檢查（壓縮後的程式碼）…'); const env = Object.assign({}, process.env, { AIGPS_ROOT: DIST });
say('  ' + run('check_static.js', [], { cwd: DIST }).trim()); say('  ' + run('test_security.js', [], { env }).trim()); say('  ' + run('test_release.js', [], { env }).trim());
say('  ' + run('qa_acceptance.js', [], { env }).trim().split('\n').slice(-1)[0]); say('  ' + run('qa_stress.js', [], { env }).trim().split('\n').slice(-1)[0]);
// 真實瀏覽器端對端（需要全域安裝 Playwright；找不到時明確警告，不假裝通過）
if (args.has('--skip-e2e')) say('  略過瀏覽器 E2E（--skip-e2e）'); else { let hasPw = false; try { hasPw = fs.existsSync(path.join(cp.execSync('npm root -g').toString().trim(), 'playwright')); } catch (_) {}
  if (!hasPw) say('  ⚠ 找不到 Playwright，略過瀏覽器 E2E（正式發布前請務必在有瀏覽器的環境執行）'); else say('  ' + run('e2e.js', []).trim().split('\n').slice(-1)[0]); }
// 5) 封裝
say('\n[5/5] 封裝…'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const tag = `ai-gps-${V}+${BUILD}`, zip = (name, cwd, extra) => { const r = cp.spawnSync('zip', ['-qr', path.join(OUT, name), '.', ...extra], { cwd }); if (r.status) { console.error('zip 失敗：' + r.stderr); process.exit(1); } };
zip(`${tag}-dist.zip`, DIST, ['-x', 'BUILD.json.tmp']); zip(`${tag}-src.zip`, ROOT, ['-x', 'node_modules/*', 'dist/*', 'release/*', '.git/*']);
const sums = fs.readdirSync(OUT).sort().map(f => `${sha(fs.readFileSync(path.join(OUT, f)))}  ${f}`).join('\n') + '\n'; fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), sums);
for (const f of fs.readdirSync(OUT).sort()) say(`  ${f.padEnd(40)} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`); say(`\n✓ 發布完成：${tag}`);
