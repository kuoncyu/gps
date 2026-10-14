// 一鍵執行全部測試：node tools/run_all.js
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const dir = __dirname, units = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort(), jobs = [...units, 'check_static.js', 'qa_acceptance.js', 'qa_stress.js'];
const syntax = fs.readdirSync(path.join(dir, '..', 'js')).map(f => path.join(dir, '..', 'js', f)).concat(path.join(dir, '..', 'sw.js'), jobs.map(f => path.join(dir, f)), path.join(dir, 'qa_env.js'));
let fail = 0; const t0 = Date.now(), rows = [];
for (const f of syntax) { const r = spawnSync(process.execPath, ['--check', f]); if (r.status) { fail++; console.log('語法錯誤：', f, String(r.stderr).split('\n')[0]); } }
for (const j of jobs) { const t = Date.now(), r = spawnSync(process.execPath, [path.join(dir, j)], { cwd: path.join(dir, '..'), encoding: 'utf8' }); const ok = r.status === 0; if (!ok) fail++; rows.push([ok ? 'PASS' : 'FAIL', j, Date.now() - t]); if (!ok) console.log(`\n--- ${j} ---\n${(r.stdout || '').split('\n').slice(-12).join('\n')}\n${(r.stderr || '').split('\n').slice(0, 8).join('\n')}`); }
console.log(rows.map(([s, j, ms]) => `${s}  ${j.padEnd(26)} ${ms} ms`).join('\n')); console.log(`\n語法檢查 ${syntax.length} 個檔案；測試 ${jobs.length} 組；${fail ? fail + ' 項失敗' : '全部通過'}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`); process.exit(fail ? 1 : 0);
