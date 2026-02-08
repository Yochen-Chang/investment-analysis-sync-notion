# 部署指南

本專案包含前端（React + Vite）和後端（Express API），以下是各平台的部署方案。

## 🚀 推薦方案：Vercel（最簡單）

Vercel 可以同時部署前端和後端 API，無需額外配置。

### 部署步驟

1. **安裝 Vercel CLI**（如果還沒安裝）
   ```bash
   npm i -g vercel
   ```

2. **登入 Vercel**
   ```bash
   vercel login
   ```

3. **部署專案**
   ```bash
   vercel
   ```

4. **更新前端 API 端點**
   
   部署後，Vercel 會提供一個網址（例如：`https://your-app.vercel.app`）
   
   需要更新 `src/App.jsx` 中的 API 端點：
   ```javascript
   // 將 localhost:3001 改為 Vercel 提供的網址
   const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-app.vercel.app';
   
   // 然後在 fetch 中使用
   fetch(`${API_BASE_URL}/api/notion/query`, ...)
   fetch(`${API_BASE_URL}/api/sync-prices`, ...)
   ```

5. **設定環境變數**（如果需要）
   
   在 Vercel 專案設定中新增環境變數：
   - `VITE_API_URL`: 您的 Vercel 應用網址

### Vercel 配置

專案已包含 `vercel.json` 配置檔案，會自動：
- 將 `/api/*` 路由導向 serverless functions
- 將前端靜態檔案部署到根路徑

---

## 🌐 方案二：Netlify

Netlify 也支援 serverless functions，但需要將 Express 路由轉換為 Netlify Functions。

### 部署步驟

1. **安裝 Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **登入 Netlify**
   ```bash
   netlify login
   ```

3. **初始化專案**
   ```bash
   netlify init
   ```

4. **部署**
   ```bash
   npm run build
   netlify deploy --prod
   ```

5. **更新 API 端點**
   
   將 `src/App.jsx` 中的 API 端點改為：
   ```javascript
   const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-app.netlify.app';
   ```

### Netlify Functions

已建立 `netlify/functions/` 目錄，包含：
- `notion-query.js` - Notion API 代理
- `sync-prices.js` - 同步現價 API（需要從 `api/sync-prices.js` 複製並轉換格式）

---

## ☁️ 方案三：AWS（完整控制）

AWS 提供多種部署選項：

### 選項 A：AWS Amplify（推薦，類似 Vercel）

1. 在 AWS Amplify Console 建立新應用
2. 連接 GitHub/GitLab 儲存庫
3. 設定建置指令：`npm run build`
4. 設定發佈目錄：`dist`
5. 新增環境變數

### 選項 B：AWS Elastic Beanstalk

1. **建立應用程式檔案**
   ```bash
   # 建立 .ebextensions/nodecommand.config
   option_settings:
     aws:elasticbeanstalk:container:nodejs:
       NodeCommand: "npm start"
   ```

2. **初始化 EB**
   ```bash
   eb init
   eb create
   eb deploy
   ```

### 選項 C：AWS EC2 + PM2

1. 在 EC2 上安裝 Node.js
2. 使用 PM2 管理進程：
   ```bash
   npm install -g pm2
   pm2 start server.js --name "investment-api"
   pm2 startup
   pm2 save
   ```

3. 使用 Nginx 作為反向代理：
   ```nginx
   # /etc/nginx/sites-available/investment
   server {
       listen 80;
       server_name your-domain.com;
       
       location /api {
           proxy_pass http://localhost:3001;
       }
       
       location / {
           root /var/www/investment/dist;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

---

## 📦 方案四：Surge（僅前端）

Surge 只支援靜態網站，需要分開部署後端。

### 前端部署到 Surge

1. **建置前端**
   ```bash
   npm run build
   ```

2. **安裝 Surge**
   ```bash
   npm install -g surge
   ```

3. **部署**
   ```bash
   cd dist
   surge
   ```

### 後端部署選項

由於 Surge 不支援後端，需要將後端部署到其他服務：

**選項 1：Railway / Render（推薦）**
- 免費方案可用
- 支援 Node.js
- 自動部署

**選項 2：Heroku**
- 需要信用卡驗證（免費方案已停止）
- 支援 Node.js

**選項 3：AWS Lambda + API Gateway**
- 將 Express 轉換為 Lambda Functions
- 使用 API Gateway 作為入口

---

## 🔧 環境變數設定

無論使用哪個平台，都需要設定環境變數：

### 前端環境變數

建立 `.env.production`：
```env
VITE_API_URL=https://your-api-domain.com
```

### 後端環境變數

```env
PORT=3001
NODE_ENV=production
```

---

## 📝 部署前檢查清單

- [ ] 更新 `src/App.jsx` 中的 API 端點（從 `localhost:3001` 改為實際網址）
- [ ] 確認所有環境變數已設定
- [ ] 測試建置：`npm run build`
- [ ] 檢查 `.gitignore` 確保不會提交敏感資訊
- [ ] 確認 CORS 設定正確（後端允許前端網域）

---

## 🎯 推薦部署流程

**最簡單方案（推薦）：**
1. 使用 **Vercel** 部署（前後端一起）
2. 更新前端 API 端點為 Vercel 網址
3. 完成！

**分離部署方案：**
1. 前端部署到 **Surge**（免費、快速）
2. 後端部署到 **Railway** 或 **Render**（免費 Node.js 託管）
3. 更新前端 API 端點為後端網址

**企業級方案：**
1. 使用 **AWS Amplify** 或 **AWS Elastic Beanstalk**
2. 設定自訂網域
3. 配置 SSL 憑證

---

## 🔗 相關連結

- [Vercel 文件](https://vercel.com/docs)
- [Netlify 文件](https://docs.netlify.com/)
- [AWS Amplify 文件](https://docs.amplify.aws/)
- [Surge 文件](https://surge.sh/help)
