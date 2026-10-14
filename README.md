# AI GPS 智慧車用導航系統

離線優先的智慧車用導航 PWA：搜尋、路線規劃、Turn-by-Turn 導航、車道指引、交通與駕駛警示、天氣、語音、AI 助理，**下載一次離線資料包後，日常使用完全不需要網路**。

> ⚠️ **目前版本使用的是程式產生的 Demo 資料**（地圖、POI、警示、天氣、車道、交通事件），定位來源是 **Demo GPS**（沿路線模擬行駛），尚未接入真實 GPS、真實地圖或即時交通。它是一個功能完整、經過測試的產品骨架與展示，**不可用於真實道路導航**。正式商用前必須取得資料授權、實作真實定位 Provider，並在真實裝置上驗收（見「已知限制」）。

## 快速開始
```bash
npm install                 # 只有開發／建置用的 esbuild、axe-core，執行期零相依
python3 tools/build_demo_packages.py   # （可省略）重新產生 Demo 資料包
npm run serve               # http://localhost:8080  （Service Worker 與 SHA-256 需要 localhost 或 HTTPS）
```
1. 開啟首頁 →「前往下載中心」→ 下載 `2026.11.15`（或 `2026.11.01`）。看到「離線導航就緒」即可斷網使用。
2. 搜尋目的地 → 路線頁選用路線 → 導航頁「開始導航」。可在導航頁用「速度 ×4」加快 Demo。
3. 設定頁可調整主題、語音、警示、隱私，並查看版本資訊。

## 特色
| 領域 | 內容 |
|---|---|
| 離線優先 | 資料包分片下載、可暫停／續傳／自動重試、SHA-256 驗證、原子切換、保留上一版、可回復；更新期間仍可使用目前版本 |
| 導航 | 離線路由（最快／最短／避開收費、高速、未鋪裝）、多途經點、偏航自動重新規劃、Turn-by-Turn、車道指引、抵達摘要、停車與步行導航 |
| 行車輔助 | 測速、學校區、施工區、急彎、鐵路平交道、速限降低、超速提醒、休息提醒、交通事件與改道比較、天氣與沿途天氣 |
| 互動 | 語音播報（瀏覽器內建合成）、本機規則的 AI 助理（多輪上下文、多意圖、危險操作需確認）、音樂／電話／通知抽象層 |
| 產品品質 | 響應式（含橫放車用）、無障礙（axe 掃描通過）、日夜主題（WCAG AA 對比）、鍵盤操作、錯誤與空狀態 |
| PWA | 可安裝、App Shell 離線啟動、**使用者同意才切換的更新策略（導航中不更新）**、嚴格 CSP |

## 專案結構
```
index.html … settings.html   9 個頁面（多頁，無框架、無打包）
js/        模組（IIFE + window.AIGPS 命名空間；state.js 是唯一的 Navigation State）
css/       設計 token 與樣式
sw.js      Service Worker（只快取 App Shell；資料包在 IndexedDB）
manifest.webmanifest, assets/icons/
packages/  Demo 資料包（版本資料夾不可變 + index.json）
tools/     測試、建置、發布、預覽伺服器
```
關鍵設計：
- **Provider 抽象**：`location / map / routing / search / traffic / weather / parking / ai / lanes / alerts / media / phone / notifications`，每個都可替換成真實實作；Demo 實作一律標示 `isDemo`，**絕不假冒真實或「即時」資料**。
- **離線資料包**：manifest（版本、schema、大小、每檔與每分片 SHA-256）→ 下載 → 驗證 → 以單一 IndexedDB 交易切換 active／previous。
- **隱私**：行車軌跡不保存；只在本機保存目的地與路線、收藏與最近目的地、行程摘要與偏好；沒有任何網路請求會帶使用者資料，沒有分析或追蹤程式。

## 開發與測試
| 指令 | 說明 |
|---|---|
| `npm test` | 語法檢查 + 單元測試 + 靜態檢查 + 規格 §28 驗收（18 項）+ 壓力／故障注入（10 項） |
| `npm run build` | **發布關卡**：同步版本 → 完整測試 → 建置 `dist/`（壓縮、SW 快取清單自動產生、內容雜湊）→ 對 dist 重跑檢查與瀏覽器 E2E → 產出 `release/` |
| `npm run e2e` | 真實瀏覽器（Chromium + Playwright）端對端，13 項，針對 `dist/` |
| `npm run serve:dist` | 以正式部署相同的標頭預覽 `dist/` |

## 文件
- [DEPLOY.md](DEPLOY.md)：部署、標頭、資料包發布、更新與回滾策略
- [QA.md](QA.md)：測試報告、人工驗收矩陣、QA 找到並修正的問題
- [CHANGELOG.md](CHANGELOG.md)：版本紀錄
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)：各批次手動驗收清單

## 已知限制
- **只有 Demo 資料與 Demo GPS**；`location` Provider 的真實實作（`navigator.geolocation`）、真實地圖與 POI 資料、即時交通、真實天氣與測速資料皆未接入，且需要各自的授權（見設定頁「授權與資料來源說明」）。
- 地圖是 Canvas 自繪的格線示意圖，不是真實向量地圖；3D 只是傾斜視角。
- 瀏覽器無法控制其他 App 的音樂、也無法偵測或接聽真實來電；撥號僅交給系統的 `tel:`。
- 中文語音是否可用取決於使用者的裝置；沒有時退回提示音。
- 尚未實作：規格 Batch 6 的「交流道」圖形、單位切換（公里／英里）、多語系。
- 自動化測試涵蓋邏輯、整合與 Chromium 桌面／模擬手機視窗；**真實手機、Safari、Firefox、實際語音發聲、實車路測尚未驗收**（見 QA.md）。
