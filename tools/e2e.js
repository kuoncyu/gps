#!/usr/bin/env node
/* 真實瀏覽器端對端測試（Chromium + Playwright），對象：dist 正式版（經 tools/serve.js，套用與正式部署相同的標頭與 CSP）。
   用法：node tools/e2e.js [only,ids]   需要全域安裝 playwright，並設定 PLAYWRIGHT_BROWSERS_PATH（本沙箱已設定） */
const path = require('path'), fs = require('fs'), os = require('os'), { execSync } = require('child_process'), assert = require('assert');
const pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')), { createServer } = require('./serve');
const ROOT = path.resolve(__dirname, '..'), DIST = path.join(ROOT, 'dist'), SHOTS = path.join(os.tmpdir(), 'aigps-e2e'); fs.mkdirSync(SHOTS, { recursive: true });
const PAGES = ['index', 'search', 'route', 'navigation', 'poi', 'trip', 'weather', 'downloads', 'settings'];
const steps = [], test = (id, name, fn) => steps.push({ id, name, fn });
let base, browser, ctx, page; const errors = [];
const EXPECTED_OFFLINE = /ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED).*\/(packages\/index\.json|sw\.js)$/;   // 切換離線的瞬間，更新檢查失敗是預期的（UI 會顯示「無法取得版本清單」）
const watch = p => { p.on('console', m => { const t = `[console] ${m.text()} ${(m.location() || {}).url || ''}`; if (m.type() === 'error' && !EXPECTED_OFFLINE.test(t)) errors.push(t); }); p.on('pageerror', e => errors.push(`[pageerror] ${e.message}`)); };
const noErrors = what => { const e = errors.splice(0); assert.strictEqual(e.length, 0, what + ' 出現錯誤：\n  ' + e.join('\n  ')); };
const visible = sel => page.locator(sel).first().isVisible();
const rect = async sel => page.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const hit = (a, b) => a && b && !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
const shot = async (n, p = page) => { const f = path.join(SHOTS, n + '.png'); await p.screenshot({ path: f }); return f; };

test('E1', '首頁載入：無錯誤、無 CSP 違規、首次使用引導', async () => {
  await page.goto(base + '/index.html'); await page.waitForFunction(() => !/檢查資料包/.test(document.querySelector('#homeTitle').textContent), null, { timeout: 8000 });
  assert(/第一次使用/.test(await page.textContent('#homeTitle')), '未安裝資料包 → 引導下載'); assert.strictEqual(await page.locator('#statusbar nav a').count(), 9); assert(/v1\.0\.0（build [0-9a-f]{10}）/.test(await page.textContent('#ver')), '版本與 build 顯示：' + await page.textContent('#ver'));
  assert.strictEqual(await page.evaluate(() => document.querySelector('link[rel=manifest]').href.endsWith('manifest.webmanifest')), true); noErrors('首頁');
});
test('E2', 'Service Worker 註冊、啟用並快取完整 App Shell', async () => {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const r = await page.evaluate(async () => { const ks = await caches.keys(), c = await caches.open(ks[0]); return { ks, n: (await c.keys()).length }; }); const build = JSON.parse(fs.readFileSync(path.join(DIST, 'BUILD.json'), 'utf8'));
  assert(r.ks.length === 1 && r.ks[0] === `aigps-shell-1.0.0+${build.build}`, '快取名稱含版本與 build：' + r.ks); const shell = JSON.parse(fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8').match(/SHELL\s*=\s*(\[[\s\S]*?\])/)[1]); assert.strictEqual(r.n, shell.length, '快取項目數 = SHELL 清單（' + r.n + '）'); noErrors('Service Worker');
});
test('E3', '下載中心：真實下載、SHA-256 驗證（crypto.subtle）、IndexedDB 安裝', async () => {
  await page.goto(base + '/downloads.html'); const li = page.locator('#avail li', { hasText: '2026.11.15' }); await li.waitFor({ timeout: 8000 }); assert(await page.locator('#avail li', { hasText: '2026.11.99' }).getByText('測試用：損壞版本').count() === 1);
  await li.locator('button').click(); await page.waitForFunction(() => /離線導航就緒/.test(document.querySelector('#ready').textContent), null, { timeout: 40000 });
  assert(/TW-DEMO v2026\.11\.15/.test(await page.textContent('#active')), '目前版本'); assert.strictEqual(await page.locator('#checks li .done').count(), 6, '六個元件齊全'); assert(/資料包已驗證並切換完成/.test(await page.textContent('#msg'))); noErrors('下載資料包');
});
test('E4', '損壞資料包被真實瀏覽器拒絕，目前版本不受影響', async () => {
  await page.goto(base + '/downloads.html'); const li = page.locator('#avail li', { hasText: '2026.11.99' }); await li.waitFor(); await li.locator('button').click();
  await page.waitForFunction(() => /驗證失敗|不符|拒絕/.test(document.querySelector('#msg').textContent), null, { timeout: 30000 }); assert(/目前版本未受影響/.test(await page.textContent('#msg'))); assert(/2026\.11\.15/.test(await page.textContent('#active'))); errors.splice(0);
});
test('E5', '完全斷網：重新整理仍可開啟，離線搜尋可用', async () => {
  await ctx.setOffline(true); await page.goto(base + '/index.html'); assert(/離線導航就緒/.test(await (async () => { await page.waitForFunction(() => /離線導航就緒/.test(document.querySelector('#homeTitle').textContent), null, { timeout: 8000 }); return page.textContent('#homeTitle'); })()), '離線開首頁並讀到本機資料包');
  assert(/離線/.test(await page.textContent('#svc')), '狀態徽章顯示離線'); await page.goto(base + '/search.html'); await page.fill('#q', '咖啡'); await page.locator('#results li').first().waitFor({ timeout: 8000 });
  assert((await page.locator('#results li').count()) > 5 && /離線可用/.test(await page.textContent('#status')), '離線搜尋結果'); await page.fill('#q', '中山路'); await page.waitForFunction(() => /中山路/.test(document.querySelector('#results').textContent), null, { timeout: 5000 }); noErrors('離線搜尋');
});
test('E6', '離線：搜尋 → 設定目的地 → 規劃路線 → 選用', async () => {
  await page.fill('#q', ''); await page.click('#chips button[data-c="餐廳"]'); await page.locator('#results li button[data-id]').first().waitFor(); const name = await page.locator('#results li b').first().textContent();
  await page.locator('#results li button[data-id]').first().click(); assert(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.textContent('#dest')), '已設定目的地');
  await page.goto(base + '/route.html'); await page.locator('#cands li').first().waitFor({ timeout: 10000 }); assert((await page.locator('#cands li').count()) >= 1 && /離線路網計算/.test(await page.textContent('#msg')));
  await page.locator('#cands li button').first().click(); assert(/已選用/.test(await page.textContent('#pick')) && (await page.locator('#pick a').count()) === 1, '選用後的確認與「前往導航地圖」連結不會被洗掉'); assert.strictEqual(await page.locator('#pv polyline').count() >= 1, true, '路線預覽圖'); noErrors('規劃路線');
});
test('E7', '導航：Demo GPS 行駛、轉彎橫幅、速限、地圖有繪製（畫布有像素）', async () => {
  await page.goto(base + '/navigation.html'); await page.click('#btnSpeed'); await page.click('#btnSpeed'); assert(/×4/.test(await page.textContent('#btnSpeed'))); await page.click('#btnNav');
  await page.waitForFunction(() => document.querySelector('#navTop') && !document.querySelector('#navTop').hidden, null, { timeout: 8000 }); await page.waitForFunction(() => +document.querySelector('#spd').textContent > 10, null, { timeout: 15000 });
  assert((await page.textContent('#navText')).length > 0 && /\d/.test(await page.textContent('#remD')), '轉彎橫幅與剩餘距離'); await page.waitForFunction(() => !document.querySelector('#limBox').hidden, null, { timeout: 8000 }); assert(/^\d+$/.test(await page.textContent('#lim')), '速限牌');
  const px = await page.evaluate(() => { const c = document.querySelector('#map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 997) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return seen.size; }); assert(px >= 4, '地圖畫布有繪製內容（顏色數 ' + px + '）'); await page.waitForFunction(() => !document.querySelector('#drv').hidden, null, { timeout: 20000 }); const anims = await page.evaluate(async () => { let max = 0; for (let i = 0; i < 12; i++) { max = Math.max(max, document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#drv')).length); await new Promise(r => setTimeout(r, 120)); } return max; }); assert.strictEqual(anims, 0, '警示卡不會持續重播動畫（避免閃爍），偵測到 ' + anims); await shot('nav-desktop'); noErrors('導航中');
});
test('E8', '導航頁版面：5 種視窗尺寸，核心資訊完整在視窗內、互不遮蔽、無橫向捲動', async () => {
  const bad = [], SEL = { top: '#navTop', bottom: '#navBottom', ctrl: '.ctrl', spd: '.hud.speed', drv: '#drv', lanes: '#lanes' };
  for (const [w, h] of [[1280, 800], [768, 1024], [390, 844], [375, 667], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500); const R = {}; for (const [k, s] of Object.entries(SEL)) R[k] = await rect(s);
    for (const [k, r] of Object.entries(R)) if (r && (r.t < -1 || r.l < -1 || r.b > h + 1 || r.r > w + 1)) bad.push(`${w}x${h}：${k} 超出視窗（${Math.round(r.l)},${Math.round(r.t)}–${Math.round(r.r)},${Math.round(r.b)}）`);
    const ks = Object.keys(R); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (hit(R[ks[i]], R[ks[j]])) bad.push(`${w}x${h}：${ks[i]} 與 ${ks[j]} 重疊`);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) bad.push(`${w}x${h}：頁面橫向溢出 ${ov}px`); const sh = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight); if (sh > 1) bad.push(`${w}x${h}：頁面縱向溢出 ${sh}px`);
    await shot(`nav-${w}x${h}`);
  } await page.setViewportSize({ width: 1280, height: 800 }); assert.strictEqual(bad.length, 0, '\n  ' + bad.join('\n  '));
});
test('E9', '導航抵達：抵達摘要、語音以外的完整流程、行程紀錄', async () => {
  await page.waitForFunction(() => document.querySelector('#arrive') && !document.querySelector('#arrive').hidden, null, { timeout: 150000 }); assert(/您已抵達目的地/.test(await page.textContent('#arrive h2')) && /km|m/.test(await page.textContent('#sumD')), '抵達摘要'); await shot('arrived');
  await page.click('#arriveOk'); await page.goto(base + '/trip.html'); await page.locator('#logBox table tbody tr').first().waitFor({ timeout: 5000 }); assert(/已抵達/.test(await page.textContent('#logBox')), '行程紀錄'); noErrors('抵達');
});
test('E10', '鍵盤與焦點：跳過連結、面板 Esc 關閉並回到按鈕', async () => {
  await page.goto(base + '/settings.html'); await page.keyboard.press('Tab'); assert.strictEqual(await page.evaluate(() => document.activeElement.className), 'skip', '第一個 Tab 是「跳到主要內容」');
  await page.goto(base + '/navigation.html'); await page.focus('#btnAlerts'); await page.keyboard.press('Enter'); assert(await visible('#apanel') && await page.evaluate(() => document.activeElement.id) === 'apanel' && await page.getAttribute('#btnAlerts', 'aria-expanded') === 'true', '面板開啟且焦點移入');
  await page.keyboard.press('Escape'); assert(!(await visible('#apanel')) && await page.evaluate(() => document.activeElement.id) === 'btnAlerts' && await page.getAttribute('#btnAlerts', 'aria-expanded') === 'false', 'Esc 關閉並回到按鈕');
  for (const id of ['btnTraffic', 'btnVoice', 'btnAI', 'btnUp', 'btnInteg']) { await page.click('#' + id); const open = await page.evaluate(() => [...document.querySelectorAll('[role=region][aria-label]')].filter(e => !e.hidden).length); assert.strictEqual(open, 1, id + ' 一次只開一個面板'); await page.keyboard.press('Escape'); } noErrors('鍵盤');
});
test('E11', '主題切換與全站手機寬度（375px）無橫向溢出', async () => {
  await page.goto(base + '/index.html'); const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor); const seen = [await bg()]; for (let i = 0; i < 2; i++) { await page.click('#themeBtn'); seen.push(await bg()); }
  assert(seen.includes('rgb(14, 20, 27)') && seen.includes('rgb(243, 245, 248)'), '日／夜主題背景色：' + seen); await page.setViewportSize({ width: 375, height: 667 }); const bad = [];
  for (const p of PAGES) { await page.goto(`${base}/${p}.html`); await page.waitForTimeout(350); const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) bad.push(`${p}：溢出 ${ov}px`); if (['index', 'settings', 'search'].includes(p)) await shot('m375-' + p); }
  await page.setViewportSize({ width: 1280, height: 800 }); assert.strictEqual(bad.length, 0, bad.join('；'));
});
test('E12', 'axe 無障礙掃描（9 頁 × 日夜主題）：沒有嚴重或重大違規', async () => {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'), c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true, locale: 'zh-TW' }), p2 = await c2.newPage(); const found = [];
  for (const scheme of ['light', 'dark']) { await p2.emulateMedia({ colorScheme: scheme }); for (const p of PAGES) { await p2.goto(`${base}/${p}.html`); await p2.waitForTimeout(500); await p2.evaluate(axeSrc); const r = await p2.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }));
    for (const v of r.violations.filter(x => ['serious', 'critical'].includes(x.impact))) found.push(`${scheme}/${p}：${v.id}（${v.impact}）${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`); } } await c2.close(); assert.strictEqual(found.length, 0, '\n  ' + found.join('\n  '));
});
test('E13', 'App 更新策略：背景下載新版 → 提示 → 導航中不可更新 → 按下才切換', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aigps-upd-')); fs.cpSync(DIST, tmp, { recursive: true }); const s2 = createServer(tmp); await new Promise(r => s2.listen(0, '127.0.0.1', r)); const b2 = `http://127.0.0.1:${s2.address().port}`;
  const c3 = await browser.newContext({ viewport: { width: 1280, height: 800 } }), p3 = await c3.newPage(); const errs = []; p3.on('pageerror', e => errs.push(e.message)); p3.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p3.goto(b2 + '/settings.html'); await p3.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }); const v1 = await p3.evaluate(() => caches.keys());
  fs.appendFileSync(path.join(tmp, 'sw.js'), '\n/* new build */'); const sw = fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8').replace(/VER="[^"]*"/, 'VER="1.0.1+test"'); fs.writeFileSync(path.join(tmp, 'sw.js'), sw);
  await p3.click('#btnChk'); await p3.waitForFunction(() => /有新版可更新/.test(document.querySelector('#sApp').textContent), null, { timeout: 15000 }); assert(!(await p3.locator('#btnUpd').isDisabled()), '新版已下載，可更新'); assert(await p3.locator('#updBanner').isVisible(), '更新橫幅');
  assert.deepStrictEqual(await p3.evaluate(() => caches.keys()).then(k => k.sort()), [...v1, 'aigps-shell-1.0.1+test'].sort(), '新舊快取並存（舊版離線版本未被破壞）');
  await p3.evaluate(() => { window.AIGPS.Nav; }); await p3.evaluate(() => { Object.defineProperty(window.AIGPS.Nav || (window.AIGPS.Nav = {}), 'active', { configurable: true, get: () => true }); }); await p3.click('#btnUpd'); assert(/導航進行中不更新/.test(await p3.textContent('#appMsg')), '導航中拒絕更新'); assert((await p3.evaluate(() => caches.keys())).includes(v1[0]), '舊快取仍在');
  await p3.evaluate(() => { Object.defineProperty(window.AIGPS.Nav, 'active', { configurable: true, get: () => false }); }); await Promise.all([p3.waitForNavigation({ timeout: 15000 }), p3.click('#btnUpd')]); await p3.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  assert.deepStrictEqual(await p3.evaluate(() => caches.keys()), ['aigps-shell-1.0.1+test'], '切換後只剩新版快取'); assert.strictEqual(errs.length, 0, errs.join('；')); await c3.close(); s2.close(); fs.rmSync(tmp, { recursive: true, force: true });
});

(async () => {
  if (!fs.existsSync(path.join(DIST, 'BUILD.json'))) { console.error('找不到 dist：請先執行 node tools/release.js'); process.exit(1); }
  const srv = createServer(DIST); await new Promise(r => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await pw.chromium.launch(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' }); page = await ctx.newPage(); watch(page);
  const only = process.argv[2] ? process.argv[2].split(',') : null; let pass = 0, fail = 0;
  for (const s of steps) { if (only && !only.includes(s.id)) continue; const t = Date.now(); try { await s.fn(); pass++; console.log(`PASS  ${s.id.padEnd(4)} ${s.name}  (${Date.now() - t} ms)`); } catch (e) { fail++; const f = await shot('FAIL-' + s.id).catch(() => ''); console.log(`FAIL  ${s.id.padEnd(4)} ${s.name}\n        ${String(e.message).split('\n').join('\n        ')}\n        截圖：${f}`); errors.length = 0; } }
  console.log(`\n真實瀏覽器端對端（Chromium ${browser.version()}，dist 正式版）：${pass} PASS / ${fail} FAIL　截圖目錄：${SHOTS}`); await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
