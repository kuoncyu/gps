#!/usr/bin/env node
/* 靜態伺服器（本機預覽／部署前驗證）：node tools/serve.js [目錄=.] [埠=8080]
   套用與正式部署相同的標頭規則（tools/headers.js）。Service Worker 與 SHA-256 需要 localhost 或 HTTPS。 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { headersFor } = require('./headers');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
function createServer(root) {
  root = path.resolve(root);
  return http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400); return res.end('bad request'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    const urlPath = p === '/' ? '/index.html' : p, file = path.resolve(root, '.' + urlPath);
    if ((!file.startsWith(root + path.sep) && file !== root) || /(^|\/)(\.[^/]+|node_modules)(\/|$)/.test(path.relative(root, file))) { res.writeHead(403); return res.end('forbidden'); }   // 擋目錄穿越、隱藏檔與 node_modules
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headersFor(p))); return res.end('not found'); }
      const etag = '"' + crypto.createHash('sha1').update(st.size + ':' + st.mtimeMs).digest('hex').slice(0, 16) + '"', h = Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ETag: etag, 'Content-Length': st.size }, headersFor(p === '/' ? '/' : p));
      if (req.headers['if-none-match'] === etag) { delete h['Content-Length']; res.writeHead(304, h); return res.end(); }
      res.writeHead(200, h); if (req.method === 'HEAD') return res.end(); fs.createReadStream(file).pipe(res);
    });
  });
}
if (require.main === module) { const root = process.argv[2] || '.', port = +(process.argv[3] || process.env.PORT || 8080), s = createServer(root); s.listen(port, () => console.log(`AI GPS 預覽：http://localhost:${port}/  （目錄 ${path.resolve(root)}）`)); }
module.exports = { createServer };
