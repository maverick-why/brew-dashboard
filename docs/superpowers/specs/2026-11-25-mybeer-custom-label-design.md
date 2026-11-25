# 客製啤酒包裝網站 /mybeer — 設計文檔

_日期：2026-11-25 · 項目：brew-dashboard_

---

> **2026-11-25 修訂（老闆要求：不能影響現有項目代碼）**：只新增檔案，不修改任何現有檔案
> （`admin.html`、`api/admin.js`、`api/menu-public.js`、`vercel.json` 都不動）。
> 後台改為獨立頁面 `mybeer-admin.html`（同一個後台密碼）；接口改為新檔 `api/mybeer.js`；
> 網址先用 `/mybeer.html`，`/mybeer` 短網址需老闆另外同意在 `vercel.json` 加一行。以下各節以此修訂為準。

## 一、目的

把 DB BREW 的「客製啤酒包裝」服務做成一個可以直接發給潛在客戶的網站：
展示做過的案例（半島石油、中歐足球隊等），讓個人客人自己填字預覽酒標，讓企業／球隊留下詢價。
老闆要能在後台自己換首頁罐子圖和換字體，不需要找開發者。

## 二、網址與上線

- 網址：`dashboard.dbbrewbeer.com/mybeer`（沿用 `/db` 邀請頁的做法，零新增 DNS）
- `vercel.json` 新增 rewrite：`/mybeer` → `/mybeer.html`
- 在獨立分支 `feat/mybeer` 開發。**main 會自動部署到酒吧電視，所以合併前必須給老闆看改動、得到同意。**

## 三、頁面內容（已在 claude.ai 預覽版第 8 版確認）

沿用已確認的預覽版，搬進項目：

1. 頂部選單：DB BREW 標誌、6 個錨點、中／EN 切換、「立即訂製」按鈕
2. 大標題 CUSTOM BEER PACKAGING + 中英介紹
3. 六罐一排（靜、航、生日、婚禮、聖誕、Sideline Hero × CEIBS）+ 五個場合標籤
   - 手機：改為罐子方格，一屏看完
4. 服務流程：4 步時間線（電腦橫排、手機豎排）
5. 套餐價格：12 CANS · HK$499、標準自助定制、專屬設計諮詢
6. 案例展示（全部顯示完整罐身）：
   - 半島石油 · 足球系列 6 罐（整行）
   - 中歐足球隊 · Sideline Hero（Session IPA 4.5%）
   - 中歐 FMBA 2020 級開學 4 周年慶典 · 重逢 Reunion Tales（Double Hazy IPA 5.5%）
     英文說明：CEIBS FMBA Class of 2020 · 4th anniversary celebration
   - 半島石油 · 靜 & 航
   - 電腦：第一行足球系列，第二行三個案例並排；手機：兩列，最後一個佔整行
7. 立即訂製：選場合 → 輸入文字 → 即時預覽酒標（手機上預覽固定在頂部）→ 聯絡資料 → 複製查詢內容
8. 專屬設計諮詢表單
9. 中／EN 全站切換，默認中文（繁體），記住訪客選擇

## 四、後台（新增「客製網站」分頁）

放在現有 `admin.html`，用同一個後台密碼（`x-admin-pass`），新增分頁「客製網站」：

| 功能 | 說明 |
|---|---|
| 首頁罐子圖 | 顯示目前圖片；上傳新圖（JPG/PNG/WebP，≤5MB，建議透明背景、橫向、寬 2000px 以上）；「恢復原圖」 |
| 整體字體 | 4 套預設，點選即顯示樣字：經典襯線（現在）、現代簡約、優雅雜誌、運動力量。酒標預覽字體不受影響 |
| 儲存 | 按「儲存」後網站立即生效（訪客重新整理即看到） |

換了自訂罐子圖後，罐子下方五個場合標籤改為平均排列（不再對準每個罐子）；手機上改為文字方格。

## 五、資料與接口

- **設定存放**：Redis 鍵 `mybeer_settings_v1`（項目已用 Redis 存酒單），內容 `{ font, lineupUrl, updatedAt }`。不需要建資料表、不需要手動跑 SQL。
- **圖片存放**：沿用現有 Supabase 公開 bucket `poster-assets`，路徑前綴 `mybeer/`，沿用簽名上傳流程。
- **後台接口**（加在現有 `api/admin.js`，不新增函數檔，避免超出 Vercel 函數數量）：
  - `GET  /api/admin?op=mybeer-get` 讀設定
  - `POST /api/admin?op=mybeer-upload` 取得簽名上傳網址
  - `POST /api/admin?op=mybeer-save` 儲存 `{ font, lineupUrl }`（lineupUrl 只接受本項目 Supabase bucket 的網址或空值＝原圖）
- **公開讀取**：加在現有 `api/menu-public.js`：`GET /api/menu-public?mybeer=1`（沿用該檔 `?poster=1` 的寫法）回傳 `{ font, lineupUrl }`，帶短快取（60 秒）。讀取失敗時頁面用預設值，不影響顯示。

## 六、靜態資源

圖片轉為 WebP，以 `mybeer-` 前綴放在項目根目錄（現有建置指令會複製 `*.webp`；JPG 不會被複製，所以全部轉 WebP）：
六罐圖、手機版單罐圖 5 張、三張空白酒標底圖、四張案例圖（含「重逢」）。合計約 1.6MB。

## 七、不做的事

- 不做線上付款；查詢仍是「複製查詢內容」，有 WhatsApp 號碼後再加「用 WhatsApp 發送」按鈕
- 不改動酒標底圖、案例圖的後台管理（只開放首頁罐子圖和字體）
- 不改動現有後台其他分頁的行為

## 八、驗收

- 本地或 Vercel 預覽網址上：電腦與手機寬度顯示正常、中英切換正常、酒標輸入即時更新
- 後台換圖、換字體、恢復原圖後，`/mybeer` 重新整理即反映
- 合併 main 前列出所有改動檔案給老闆確認
