// 色彩對比測試（WCAG 2.1 AA）：node tools/test_contrast.js
const fs = require('fs'), assert = require('assert');
const css = fs.readFileSync('css/variables.css', 'utf8');
const parse = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]));
const light = parse(css.match(/^:root\{([^}]*)\}/m)[1]), night = Object.assign({}, light, parse(css.match(/:root\[data-theme="night"\]\{([^}]*)\}/)[1])), auto = Object.assign({}, light, parse(css.match(/data-theme="auto"\]\{([^}]*)\}/)[1]));
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [前景, 背景, 最低對比, 說明]
const PAIRS = [['text', 'bg', 4.5], ['text', 'panel', 4.5], ['muted', 'bg', 4.5], ['muted', 'panel', 4.5], ['accent', 'panel', 4.5], ['accent', 'bg', 4.5], ['on-accent', 'accent', 4.5], ['ok', 'panel', 4.5], ['on-ok', 'ok', 4.5], ['warn', 'panel', 4.5], ['warn', 'bg', 4.5], ['on-warn', 'warn', 4.5], ['err', 'panel', 4.5], ['err', 'bg', 4.5], ['on-err', 'err', 4.5], ['line', 'panel', 1.3]];
let n = 0;
for (const [name, th] of [['light', light], ['night', night], ['auto-dark', auto]]) for (const [fg, bg, min] of PAIRS) { const r = ratio(th[fg], th[bg]); n++; assert(r >= min, `${name}：${fg} ${th[fg]} 對 ${bg} ${th[bg]} 對比 ${r.toFixed(2)} < ${min}`); }
assert.deepStrictEqual(night, Object.assign({}, night, auto, { shadow: undefined }) && night, '夜間與自動深色使用相同色盤'); for (const k of Object.keys(auto)) assert.strictEqual(auto[k], night[k], 'auto-dark 與 night 色盤一致：' + k);
// 固定色：徽章（白字）與警示類型（白字）
const white = '#ffffff', FIXED = { 'OFFLINE 徽章': '#475569', '一般徽章': '#4a586a', '限速牌邊框(對白底)': '#c92a2a' };
for (const [k, bg] of Object.entries(FIXED)) { n++; assert(ratio(white, bg) >= 4.5 || k.includes('邊框') && ratio(white, bg) >= 3, `${k} 對比 ${ratio(white, bg).toFixed(2)}`); }
const types = [...fs.readFileSync('js/alerts.js', 'utf8').matchAll(/color: '(#[0-9a-f]{6})'/g), ...fs.readFileSync('js/weather.js', 'utf8').matchAll(/color: '(#[0-9a-f]{6})'/g)].map(m => m[1]); assert(types.length >= 11, '警示 6 色＋天氣 5 色');
types.forEach(c => { n++; assert(ratio(white, c) >= 4.5, `警示類型色 ${c} 與白字對比 ${ratio(white, c).toFixed(2)} < 4.5`); });
// 觸控目標：主要按鈕最小高度 ≥ 44
const main = fs.readFileSync('css/main.css', 'utf8'); assert(/--touch:48px/.test(css) && /button\{min-height:var\(--touch\)/.test(main), '按鈕最小高度 48px'); assert(/a\.btnlink\{[^}]*min-height:var\(--touch\)/.test(main) && /#statusbar a\{[^}]*min-height:44px/.test(main), '連結觸控目標 ≥ 44px');
assert(/prefers-reduced-motion:reduce/.test(main), '支援減少動態'); assert(/:focus-visible\{outline:3px/.test(main), '焦點外框可見');
console.log(`contrast tests PASS（${n} 組對比檢查）`);
