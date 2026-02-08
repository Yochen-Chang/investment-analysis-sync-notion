// Netlify Serverless Function for syncing stock prices
// 注意：需要從 api/sync-prices.js 複製邏輯並轉換為 Netlify Functions 格式

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { tickers } = JSON.parse(event.body);

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: '缺少必要參數：tickers（陣列）' 
        })
      };
    }

    // 輔助函數：從 Yahoo Finance 抓取價格
    const fetchYahooPrice = async (ticker, suffix) => {
      const yahooTicker = `${ticker}.${suffix}`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      if (data.chart?.result?.[0]?.meta) {
        const price = data.chart.result[0].meta.regularMarketPrice || 
                     data.chart.result[0].meta.previousClose || 0;
        if (price > 0) return price;
      }
      throw new Error('價格資料為空');
    };

    const prices = {};
    const pricePromises = tickers.map(async (ticker) => {
      try {
        const price = await fetchYahooPrice(ticker, 'TW');
        return { ticker, price };
      } catch (error) {
        try {
          const price = await fetchYahooPrice(ticker, 'TWO');
          return { ticker, price };
        } catch (error2) {
          return { ticker, price: null, error: error2.message };
        }
      }
    });

    const results = await Promise.all(pricePromises);
    results.forEach(({ ticker, price }) => {
      if (price !== null && price > 0) {
        prices[ticker] = price;
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prices,
        successCount: Object.keys(prices).length,
        totalCount: tickers.length,
        failedTickers: tickers.filter(t => !prices[t])
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: '伺服器錯誤', 
        message: error.message 
      })
    };
  }
};
