// Vercel Serverless Function for syncing stock prices
export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: '缺少必要參數：tickers（陣列）' 
      });
    }

    // 輔助函數：從 Yahoo Finance 抓取價格（指定後綴）
    const fetchYahooPrice = async (ticker, suffix) => {
      const yahooTicker = `${ticker}.${suffix}`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('返回非 JSON 格式');
      }

      const data = await response.json();
      
      // 檢查 API 錯誤
      if (data.chart && data.chart.error) {
        throw new Error(`API 錯誤: ${JSON.stringify(data.chart.error)}`);
      }
      
      if (data.chart && data.chart.result && data.chart.result.length > 0) {
        const result = data.chart.result[0];
        
        // 檢查結果錯誤
        if (result.error) {
          throw new Error(`結果錯誤: ${JSON.stringify(result.error)}`);
        }
        
        const meta = result.meta;
        
        // 嘗試多種價格欄位（優先順序）
        const price = meta.regularMarketPrice || 
                     meta.previousClose || 
                     meta.close || 
                     meta.chartPreviousClose || 0;
        
        if (price > 0) {
          return price;
        } else {
          throw new Error('價格資料為空');
        }
      } else {
        throw new Error('無法解析價格資料結構');
      }
    };

    const prices = {};
    
    // 並行抓取所有標的的價格（先嘗試 .TW，失敗則嘗試 .TWO）
    const pricePromises = tickers.map(async (ticker) => {
      // 先嘗試 .TW 格式
      try {
        console.log(`嘗試從 Yahoo Finance 取得 ${ticker} (${ticker}.TW) 的價格...`);
        const price = await fetchYahooPrice(ticker, 'TW');
        console.log(`✓ Yahoo Finance 成功取得 ${ticker} (${ticker}.TW) 價格: ${price}`);
        return { ticker, price };
      } catch (error) {
        console.log(`✗ ${ticker}.TW 查詢失敗: ${error.message}`);
        
        // 如果 .TW 失敗，嘗試 .TWO 格式
        try {
          console.log(`嘗試從 Yahoo Finance 取得 ${ticker} (${ticker}.TWO) 的價格...`);
          const price = await fetchYahooPrice(ticker, 'TWO');
          console.log(`✓ Yahoo Finance 成功取得 ${ticker} (${ticker}.TWO) 價格: ${price}`);
          return { ticker, price };
        } catch (error2) {
          console.error(`✗ ${ticker}.TWO 也失敗: ${error2.message}`);
          console.error(`抓取 ${ticker} 價格失敗（已嘗試 .TW 和 .TWO）`);
          return { ticker, price: null, error: `${error.message}; ${error2.message}` };
        }
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
}
