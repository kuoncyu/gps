# 部署手冊

## 1. 需求
- **HTTPS（或 localhost）**：Service Worker、`crypto.subtle`（SHA-256 驗證）、定位、通知都要求安全環境。非 localhost 的 `http://` 會導致資料包下載被拒絕。
- 純靜態託管即可，**不需要後端**、不需要資料庫、不需要任何 API 金鑰（前端沒有也不得放金鑰）。
- 站台可放在網域根目錄或子路徑；所有路徑皆為相對路徑，Service Worker scope 為其所在資料夾。

## 2. 建置
```bash
npm ci
npm run build          # 發布關卡：測試 → 建置 → 驗證 dist → 瀏覽器 E2E → 封裝
```
產出（`release/`）：
- `ai-gps-<版本>+<build>-dist.zip`：**部署這個**（內容與 `dist/` 相同）。
- `ai-gps-<版本>+<build>-src.zip`：原始碼。
- `SHA256SUMS`：兩個壓縮檔的雜湊，部署前請核對。

版本號以 `package.json` 為唯一來源，建置時同步到 `js/state.js` 與 `sw.js`。`build` 是 dist 內容雜湊，Service Worker 快取名稱為 `aigps-shell-<版本>+<build>`，所以**任何檔案變動都會讓瀏覽器偵測到新版**。Service Worker 的快取清單由建置自動產生，不需要手動維護。

`dist/BUILD.json` 列出每個檔案的大小與 SHA-256，可用來驗證部署內容沒有被改動。

## 3. 標頭（重要）
`dist/_headers`（Netlify／Cloudflare Pages 格式）由 `tools/headers.js` 產生，其他伺服器請對應設定：

| 路徑 | 標頭 | 原因 |
|---|---|---|
| 全部 | `Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`Permissions-Policy`、`Cross-Origin-Opener-Policy` | 安全。CSP：`script-src 'self'`（無行內腳本）、`connect-src 'self'`（不得連到其他網站） |
| `/sw.js` | `Cache-Control: no-cache`、`Service-Worker-Allowed: /` | **Service Worker 必須每次重新驗證，否則使用者永遠收不到更新** |
| `/`、`*.html`、`/js/*`、`/css/*`、`/manifest.webmanifest` | `Cache-Control: no-cache` | 以 ETag 重新驗證；實際的離線快取由 Service Worker 負責 |
| `/manifest.webmanifest` | `Content-Type: application/manifest+json` | PWA 安裝 |
| `/assets/*` | `max-age=604800` | 圖示 |
| `/packages/*` | `public, max-age=31536000, immutable` | 資料包以**版本資料夾**發布，內容不可變 |
| `/packages/index.json` | `no-cache` | 版本清單要能立刻看到新版 |

### Nginx 範例
```nginx
server {
  listen 443 ssl http2;  server_name nav.example.com;  root /var/www/aigps;
  include /etc/nginx/aigps-security-headers.conf;   # 依 dist/_headers 的「全部」區塊，用 add_header ... always;
  location = /sw.js              { add_header Cache-Control "no-cache"; add_header Service-Worker-Allowed "/"; include /etc/nginx/aigps-security-headers.conf; }
  location = /manifest.webmanifest { default_type application/manifest+json; add_header Cache-Control "no-cache"; include /etc/nginx/aigps-security-headers.conf; }
  location /packages/            { add_header Cache-Control "public, max-age=31536000, immutable"; include /etc/nginx/aigps-security-headers.conf; }
  location = /packages/index.json { add_header Cache-Control "no-cache"; include /etc/nginx/aigps-security-headers.conf; }
  location ~* \.(html|js|css)$   { add_header Cache-Control "no-cache"; include /etc/nginx/aigps-security-headers.conf; }
  location /assets/              { add_header Cache-Control "public, max-age=604800"; include /etc/nginx/aigps-security-headers.conf; }
  gzip on;  gzip_types text/css text/javascript application/json application/manifest+json;   # 建議啟用 brotli
}
```
nginx 的 `add_header` 不會繼承到有自己 `add_header` 的 location，所以每個 location 都要 include 安全標頭。
**GitHub Pages 等無法自訂標頭的主機**：App 仍可運作（Service Worker、離線、安裝皆可），但沒有 CSP 等標頭與 `sw.js` 的 `no-cache`（GitHub Pages 預設 10 分鐘快取，更新會變慢），不建議作為正式環境。

## 4. 發布資料包（不需要重新部署 App）
資料包放在 `packages/<id>/<版本>/`，由 `tools/build_demo_packages.py`（Demo）或你自己的產線產生：`manifest.json`（版本、schema、大小、每檔與每分片 SHA-256）＋ 分片檔，另有 `packages/index.json` 列出可用版本。
1. 先上傳新版本資料夾（例如 `packages/TW/2026.12.01/`）。
2. **最後**才更新 `packages/index.json`（讓使用者在檔案都就緒後才看到新版）。
3. **不可修改已發布版本資料夾內的檔案**（長快取 + immutable；要修正就發新版本）。
4. 下架：從 `index.json` 移除；已安裝的使用者不受影響。回滾：把 `index.json` 改回舊版本清單。
5. 資料格式（schema）變動時遞增 `schemaVersion`；App 只接受與自己 `dataSchema` 相符的資料包，不相容的會被拒絕並提示使用者更新（舊版資料包保留，不會讓使用者失去離線能力）。
6. 使用者端：新資料包下載與驗證期間繼續使用目前版本，驗證通過才以單一交易切換，保留上一版可回復。

## 5. App 更新與回滾策略
- 新版 App 發布後，已安裝的使用者在下次檢查（開啟頁面、回到前景、每小時）時偵測到新的 `sw.js`，新版 Service Worker 在**背景完整下載**到新快取；任何一個檔案失敗就整體放棄，**既有離線版本完全不受影響**。
- 下載完成後只顯示「新版 App 已下載完成」橫幅；使用者按「立即更新」才切換並重新載入。**導航進行中不會更新**（按鈕停用並說明原因）。
- 切換時才刪除舊版快取；資料包在 IndexedDB，不受 App 更新影響；本機偏好與紀錄（localStorage）沿用。
- **回滾**：重新部署前一個版本的 dist 即可（`sw.js` 內容不同，瀏覽器視為新版本並走同樣的更新流程）。若某版有重大問題，可在更新前先部署修正版，因為使用者只在按下更新後才切換。
- 使用者可在「設定 → App 與更新」手動檢查更新。

## 6. 部署後驗證
```bash
npm run serve:dist                       # 本機先用相同標頭預覽
curl -sI https://nav.example.com/sw.js | grep -i -E "cache-control|service-worker-allowed"
curl -sI https://nav.example.com/ | grep -i -E "content-security-policy|x-frame-options"
sha256sum -c SHA256SUMS                  # 核對壓縮檔
```
人工檢查清單：
- [ ] 以 HTTPS 開啟，DevTools → Application → Service Workers 顯示已啟用；Cache Storage 有 `aigps-shell-…`
- [ ] 下載中心安裝資料包後，DevTools → Network → Offline，重新整理仍可開啟並搜尋
- [ ] 設定頁版本資訊的 App 版本與 build 與 `BUILD.json` 一致
- [ ] 手機瀏覽器出現「安裝」選項（Chrome）或可「加入主畫面」（iOS Safari）
- [ ] Console 沒有 CSP 違規訊息
- [ ] Lighthouse：PWA、Accessibility 通過

## 7. 隱私、安全與合規
- 前端沒有 API 金鑰，也不得放；若日後接入需要金鑰的服務（真實地圖、交通、LLM），**必須經由自己的後端代理**，金鑰只存在後端。
- 沒有分析或追蹤程式；`connect-src 'self'` 會讓瀏覽器擋下對其他網站的請求。
- 使用者資料只在本機：目的地與路線、收藏與最近目的地、行程摘要、偏好。設定頁可一鍵清除；行車軌跡不保存。
- 上線前必須逐項確認（見設定頁「授權與資料來源說明」）：地圖、路由、POI、即時交通、天氣、測速與駕駛警示（合法來源與各地區規範）、第三方 Logo 與圖片、隱私政策、定位資料處理、語音與 AI 服務授權。**目前的 Demo 資料不可商用。**
