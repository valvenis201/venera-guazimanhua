# Venera 漫畫160 漫畫源（測試版）

- 來源網站：<https://m.mh160mh.com/>，桌面備援：<https://www.mh160mh.com/>
- 來源識別碼（key）：`mh160mh`
- 測試版：`0.1.2`，最低 Venera 版本：`1.6.0`
- 檔案：`mh160mh.js`、`index.json`

## 狀態

這是可匯入 Venera 的**v0.1.2 修正版**，尚未通過 Venera App + 實際網站章節圖片的端對端驗證。網站在目前執行環境中無法直接使用 HTTP 取得完整的原始章節 HTML，因此程式先支援常見的 `img` lazy-load 與 JavaScript 陣列格式，不會把未取得的圖片臆造為有效內容。

| 功能 | 實作 | 驗證情況 |
| --- | --- | --- |
| 最新/全部漫畫列表 | `zaixian_recent.html`、`all/` 分頁 | URL 規則確認；需 App 實測 |
| 人氣排行榜 | `zaixian_hit.html` | 網站存在；需 App 實測 |
| 題材、地區分類 | `rexue/`, `zaixian_dlmh/` 等 | 部分規則確認；需 App 實測 |
| 搜尋 | 自動解析搜尋 form 與備援路徑 | 搜尋 action 尚待確認 |
| 漫畫詳情、章節列表 | `/kanmanhua/<slug>/` | 網站連結規則確認；需 App 實測 |
| 章節圖片 | 解析 `qTcms_S_m_murl_e` Base64 圖片路徑及 DOM lazy load | **已加入 Base64 路徑解碼；仍待 Venera 實際閱讀測試** |

## 安裝 / 測試

1. 從本專案取得 `mh160mh.js`，以 Venera 的「從本地檔案匯入漫畫源」功能測試。
2. GitHub 已使用 `valvenis201/venera-guazimanhua` 的獨立 `mh160mh` 分支發布，**不會變更主分支的瓜子漫畫源**。在 Venera 的「新增漫畫源倉庫」輸入 `https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/index.json`。這是**獨立分支**，不是新的 GitHub Repository；要建立全新 Repository 需日後遷移。
3. 測試推薦：開啟「人氣排行」→ 進入《風起蒼嵐》→ 查看章節 → 打開最新章節。
4. 測試搜尋「斗羅大陸」，測試分類「熱血」，再檢查縮圖及圖片是否顯示。

## GitHub 發布位置

- 專案程式碼：<https://github.com/valvenis201/venera-guazimanhua/tree/mh160mh>
- 訂閱索引：<https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/index.json>
- 漫畫源 JS：<https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/mh160mh.js>

## 網頁路由整理（2026-10-14）

- 排行：`/kanmanhua/zaixian_hit.html`
- 最新：`/kanmanhua/zaixian_recent.html`
- 全部分類：`/kanmanhua/all/`；第 2 頁：`/kanmanhua/all/2.html`
- 熱血：`/kanmanhua/rexue/`
- 漫畫：`/kanmanhua/12094/` (風起蒼嵐)
- 章節：`/kanmanhua/<comic-id>/<chapter-file>.html`

## 出錯時如何提供除錯資料

- 搜尋失敗：提供從網站手動搜尋任一漫畫後的「結果頁網址」，以及 Network 裡搜尋請求方法/URL/參數（不需要 Cookies 或 Token）。
- 圖片空白：提供該章節的網址、瀏覽器 Network 裡的圖片請求 URL（可遮蔽私人參數）及章節 HTML 中的圖片載入片段。若需要修改程式，勿分享登入密碼或 Cookie。
- 如遇 403 / 429：先降低頻率並遵守網站存取規則，不加入繞過驗證機制。

## 本地測試

需要 Node.js >= 18：

```bash
node --check mh160mh.js
node --test tests/*.test.cjs
```

`--check` 僅做語法檢查，不修改系統。`--test` 執行本專案離線單元測試，不發送網路請求、不修改系統其他檔案。

## 參考文件

- [Venera 漫畫源開發文件](https://github.com/haukuen/venera/blob/main/doc/comic_source.md)
- [現有瓜子漫畫源（比較格式用）](https://github.com/valvenis201/venera-guazimanhua)

## 注意

本程式僅提供公開頁面解析，不含任何漫畫素材，也不包含認證繞過或圖片鏡像。使用時應遵守網站條款及內容授權。

## v0.1.2（2026-10-15）問題修正

- 依據 `log.txt` 修正縮圖空 URL 所造成的 `relative URL without a base`：若缺失原始封面，使用倉庫內 `assets/no-cover.png` 當作可辨識的保底封面。
- 依據公開漫畫160腳本，章節圖片解析 `qTcms_S_m_murl_e`、`qTcms_S_p_id`；以 Venera 的 `Convert.decodeBase64` / `Convert.decodeUtf8` 解碼 `$qingtiandy$` 分隔路徑並套用站點圖片 CDN。
- 優先請求 `m.mh160mh.com`，解析相對章節連結，圖片使用手機站 Referer。
- 倉庫 `index.json` 改用官方文件明確支援的 `url` 欄位（避免匯入 UI 因找不到 URL 出錯）。
- 本環境無法直接連線源站，實機仍可能遇到 CDN 限制。遇到頁面無法載入請保留新日誌供確認。

參考：<https://github.com/venera-app/venera/blob/master/doc/comic_source.md>、<https://openuserjs.org/scripts/zsyjklive.cn/ComicLooms/source>。
