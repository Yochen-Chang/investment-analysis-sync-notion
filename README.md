# 投資損益監測儀表板

投資損益監測儀表板 - Notion 串接版

## 功能特色

1. **Notion API 串接**：可設定 Token 與 Database ID，從 Notion 同步投資資料
2. **Cookie 儲存**：設定資訊持久化，不需重複輸入
3. **動態同步**：點擊「同步資料」後抓取 Notion 資料並自動計算聚合指標
4. **完整分析功能**：
   - 含息/未實現/利息切換顯示
   - 壓力測試（模擬現價調整）
   - 交易明細查詢

## 技術棧

- React 18
- Vite
- Tailwind CSS
- Lucide React (圖標庫)
- Express (後端 API 代理)

## 安裝與執行

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動開發環境

**方式一：同時啟動前後端（推薦）**

```bash
npm run dev:all
```

這會同時啟動：
- 後端 API 伺服器：`http://localhost:3001`
- 前端開發伺服器：`http://localhost:5173`

**方式二：分別啟動**

開啟兩個終端機視窗：

```bash
# 終端機 1：啟動後端 API
npm run dev:server

# 終端機 2：啟動前端
npm run dev
```

### 3. 建置生產版本

```bash
npm run build
```

### 4. 預覽生產版本

```bash
npm run preview
```

## Notion API 設定

### 1. 建立 Notion Integration

1. 前往 [Notion Integrations](https://www.notion.so/my-integrations) 建立新的 Integration
2. 複製 Integration Token（格式：`secret_...`）
3. 在 Notion Database 中分享權限給該 Integration
4. 複製 Database ID（從 Database 網址中取得，32 碼十六進位字串）

### 2. Notion Database 欄位設定

您的 Notion Database 需要包含以下欄位：

**必要欄位：**
- `標的名稱` (Title 類型) - 股票代碼或名稱
- `投資日期` (Date 類型) - 交易日期
- `股數` (Number 類型) - 交易股數
- `股價` (Number 類型) - 每股價格
- `成本` (Number 類型) - 總成本（可選，會自動計算為 股數 × 股價 + 手續費）

**選用欄位：**
- `投資類型` (Select 類型) - 交易類型：買入、賣出、定期定額等
- `手續費` (Number 類型) - 交易手續費
- `現金股利` (Number 類型) - 現金股利總額
- `每股股利` (Number 類型) - 每股股利金額
- `備註` (Text 類型) - 備註說明

**欄位對應說明：**
- `標的名稱` → 用於識別股票標的
- `投資日期` → 交易日期
- `投資類型` → 買入/賣出/定期定額等
- `股數` → 交易股數（賣出時為負數）
- `股價` → 每股成交價格
- `手續費` → 交易手續費
- `成本` → 總成本（如果未填寫，會自動計算為 股數 × 股價 + 手續費）
- `現金股利` → 現金股利總額
- `每股股利` → 每股股利金額（會自動乘以股數計算總股利）

### 3. 在應用程式中設定

1. 確保後端伺服器已啟動（`npm run dev:server`）
2. 在應用程式中點擊「設定」按鈕
3. 輸入 Integration Token 和 Database ID
4. 點擊「儲存設定」
5. 點擊「同步 Notion 資料」按鈕來載入資料

## 注意事項

- **必須啟動後端伺服器**：由於瀏覽器 CORS 限制，應用程式透過後端 API 代理來呼叫 Notion API
- 設定資訊會儲存在 Cookie 中，有效期為 30 天
- 如果同步失敗，請確認：
  1. 後端伺服器是否正在運行（`http://localhost:3001`）
  2. Notion Integration Token 是否正確
  3. Database ID 是否正確
  4. Database 是否已分享權限給 Integration
  5. Database 欄位名稱是否符合要求

## 版本資訊

- 版本：Notion 串接版 (2026/02/06)
- 授權：© 2026 投資損益管理系統
