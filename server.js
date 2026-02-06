import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Notion API 代理路由
app.post('/api/notion/query', async (req, res) => {
  try {
    const { token, databaseId } = req.body;

    if (!token || !databaseId) {
      return res.status(400).json({ 
        error: '缺少必要參數：token 和 databaseId' 
      });
    }

    // 轉發請求到 Notion API
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body.query || {})
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `Notion API 錯誤: ${errorText}` 
      });
    }

    const data = await response.json();
    
    // 記錄回應資訊（用於調試）
    console.log('Notion API 回應:', {
      object: data.object,
      resultsCount: data.results?.length || 0,
      hasMore: data.has_more,
      nextCursor: data.next_cursor ? '存在' : 'null'
    });
    
    res.json(data);
  } catch (error) {
    console.error('Notion API 代理錯誤:', error);
    res.status(500).json({ 
      error: '伺服器錯誤', 
      message: error.message 
    });
  }
});

// 同步現價 API（使用 Yahoo Finance API）
app.post('/api/sync-prices', async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: '缺少必要參數：tickers（陣列）' 
      });
    }

    const prices = {};
    
    // 並行抓取所有標的的價格
    const pricePromises = tickers.map(async (ticker) => {
      try {
        // 台灣股票代碼格式：所有台股和 ETF 都使用 .TW 後綴
        // 00922 和 00923 等 ETF 也使用 .TW，不是 .TWO
        const yahooTicker = `${ticker}.TW`;
        
        // 使用 Yahoo Finance API
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Referer': 'https://finance.yahoo.com/'
          }
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`Yahoo Finance API 錯誤 (${ticker}):`, response.status, text.substring(0, 200));
          throw new Error(`HTTP ${response.status}`);
        }

        // 檢查回應內容類型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error(`非 JSON 回應 (${ticker}):`, text.substring(0, 200));
          throw new Error('API 返回非 JSON 格式');
        }

        const data = await response.json();
        
        if (data.chart && data.chart.result && data.chart.result[0]) {
          const result = data.chart.result[0];
          const meta = result.meta;
          
          // 優先使用 regularMarketPrice，其次 previousClose
          const regularMarketPrice = meta.regularMarketPrice || meta.previousClose || 0;
          
          if (regularMarketPrice > 0) {
            return { ticker, price: regularMarketPrice };
          } else {
            throw new Error('價格資料為空');
          }
        } else {
          throw new Error('無法解析價格資料結構');
        }
      } catch (error) {
        console.error(`抓取 ${ticker} 價格失敗:`, error.message);
        return { ticker, price: null, error: error.message };
      }
    });

    const results = await Promise.all(pricePromises);
    
    results.forEach(({ ticker, price, error }) => {
      if (price !== null && price > 0) {
        prices[ticker] = price;
      } else {
        console.warn(`標的 ${ticker} 無法取得價格${error ? `: ${error}` : ''}`);
      }
    });

    console.log('同步現價結果:', {
      total: tickers.length,
      success: Object.keys(prices).length,
      failed: tickers.length - Object.keys(prices).length
    });

    res.json({ 
      prices,
      successCount: Object.keys(prices).length,
      totalCount: tickers.length,
      failedTickers: tickers.filter(t => !prices[t])
    });
  } catch (error) {
    console.error('同步現價錯誤:', error);
    res.status(500).json({ 
      error: '伺服器錯誤', 
      message: error.message 
    });
  }
});

// 健康檢查路由
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '後端 API 運行中' });
});

app.listen(PORT, () => {
  console.log(`🚀 後端伺服器運行在 http://localhost:${PORT}`);
  console.log(`📡 Notion API 代理已啟用`);
  console.log(`💰 同步現價 API 已啟用: POST /api/sync-prices`);
});
