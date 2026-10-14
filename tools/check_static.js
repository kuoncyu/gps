// 靜態檢查（node tools/check_static.js）：頁面引用的檔案、Service Worker 快取清單、程式引用的 DOM id 是否都存在
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(f, 'utf8'), pages = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const sw = read('sw.js'), shell = [...sw.match(/\bSHELL\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]).filter(f => f !== './');
const errors = [], INDEX_ONLY = new Set(['pkg', 'net', 'stateDump', 'dev', 'ver', 'simOffline', 'simOnline', 'simDl', 'simUp', 'simBad', 'simReady', 'simReset', 'providers', 'log', 'provTest']);   // app.js 的開發面板，只存在首頁，其他頁面以空值檢查略過
shell.forEach(f => { if (!fs.existsSync(f)) errors.push(`sw.js 快取清單的檔案不存在：${f}`); });
const used = new Set();
for (const pg of pages) {
  const html = read(pg), scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  [...scripts, ...links].forEach(f => { used.add(f); if (!fs.existsSync(f)) errors.push(`${pg} 引用不存在的檔案：${f}`); if (!shell.includes(f)) errors.push(`${pg} 引用的 ${f} 不在 sw.js 快取清單`); });
  if (!shell.includes(pg)) errors.push(`${pg} 不在 sw.js 快取清單`);
  const code = scripts.filter(f => fs.existsSync(f)).map(read).join('\n'), dyn = new Set([...code.matchAll(/id=\\?["']([A-Za-z0-9_-]+)\\?["']/g), ...code.matchAll(/\.id\s*=\s*['"]([A-Za-z0-9_-]+)['"]/g)].map(m => m[1]));
  const ids = new Set([...code.matchAll(/(?:\$|getElementById)\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)].map(m => m[1]));
  ids.forEach(id => { if ((pg !== 'index.html' && INDEX_ONLY.has(id)) || (id === 'navSvc' && pg !== 'navigation.html')) return; if (!html.includes(`id="${id}"`) && !dyn.has(id)) errors.push(`${pg}：程式使用了 #${id}，但頁面與程式都沒有建立這個元素`); });
  // 無障礙與響應式基本要求
  if (!/<html lang="zh-Hant"/.test(html)) errors.push(`${pg}：缺少 <html lang="zh-Hant">`); if (!/<meta name="viewport" content="width=device-width/.test(html)) errors.push(`${pg}：缺少 viewport`);
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${pg}：缺少 <title>`); if (!/class="skip" href="#main"/.test(html) || !/id="main"/.test(html)) errors.push(`${pg}：缺少「跳到主要內容」連結或 #main`);
  [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].forEach(m => { const name = (/aria-label="[^"]+"/.test(m[1])) || m[2].replace(/<[^>]*>/g, '').trim(); if (!name) errors.push(`${pg}：按鈕沒有可存取名稱：<button${m[1].slice(0, 40)}>`); });
  const labels = [...html.matchAll(/<label[^>]*>[\s\S]*?<\/label>/g)].map(m => m[0]);
  [...html.matchAll(/<(input|select|textarea)([^>]*)>/g)].forEach(m => { if (/type="hidden"/.test(m[2])) return; if (!/aria-label="[^"]+"/.test(m[2]) && !labels.some(l => l.includes(m[0]))) errors.push(`${pg}：表單欄位沒有標籤或 aria-label：${m[0].slice(0, 60)}`); });
  const dupe = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]).filter((x, i, a) => a.indexOf(x) !== i); dupe.forEach(d => errors.push(`${pg}：重複的 id #${d}`));
}
shell.filter(f => f.endsWith('.js') && !used.has(f)).forEach(f => errors.push(`sw.js 快取了未被任何頁面使用的檔案：${f}`));
const jsFiles = fs.readdirSync('js').map(f => 'js/' + f); jsFiles.filter(f => !shell.includes(f)).forEach(f => errors.push(`js 檔案未列入 sw.js：${f}`));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); } console.log('static check PASS（' + pages.length + ' 頁、' + shell.length + ' 個快取檔）');
