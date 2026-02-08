/**
 * 版本：Notion 串接版 (2026/02/08)
 * 功能：
 * 1. 支援 Notion API 串接：可設定 Token 與 Database ID。
 * 2. Cookie 儲存：設定資訊持久化，不需重複輸入。
 * 3. 動態同步：點擊「同步資料」後抓取 Notion 資料並自動計算聚合指標。
 * 4. 保持第一、二版的所有分析功能 (含息/未實現/利息切換、壓力測試、交易明細)。
 */
import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  Activity,
  RefreshCw,
  Search,
  ChevronRight,
  ListFilter,
  Calendar,
  Settings,
  X,
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Database
} from 'lucide-react';

// --- Cookie Helper ---
const setCookie = (name, value, days = 30) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
};

const getCookie = (name) => {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
};

const App = () => {
  // --- States ---
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState({});
  const [displayMode, setDisplayMode] = useState('total');
  const [currentPrices, setCurrentPrices] = useState({});
  const [selectedTicker, setSelectedTicker] = useState('');
  
  // Notion Config
  const [showSettings, setShowSettings] = useState(false);
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  
  // Sync Status
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [syncMessage, setSyncMessage] = useState({ text: '', type: '' });

  // --- Initialize Config from Cookie ---
  useEffect(() => {
    const savedToken = getCookie('notion_token');
    const savedDbId = getCookie('notion_db_id');
    if (savedToken) setNotionToken(savedToken);
    if (savedDbId) setNotionDbId(savedDbId);
  }, []);

  // --- Auto-select first ticker when stocks are loaded ---
  useEffect(() => {
    if (stocks.length > 0 && (!selectedTicker || !stocks.find(s => s.ticker === selectedTicker))) {
      setSelectedTicker(stocks[0].ticker);
    }
  }, [stocks, selectedTicker]);

  // --- Functions ---
  const saveSettings = () => {
    setCookie('notion_token', notionToken);
    setCookie('notion_db_id', notionDbId);
    setShowSettings(false);
    setSyncMessage({ text: '設定已儲存！', type: 'success' });
    setTimeout(() => setSyncMessage({ text: '', type: '' }), 3000);
  };

  // 解析 Notion 資料格式
  const parseNotionData = (notionResults) => {
    const stocksMap = {};
    const transactionsMap = {};

    if (!Array.isArray(notionResults)) {
      console.error('notionResults 不是陣列:', notionResults);
      return { stocks: [], transactions: {} };
    }

    notionResults.forEach((page, index) => {
      // 檢查 page 結構
      if (!page || !page.properties) {
        console.warn(`第 ${index + 1} 筆記錄缺少 properties:`, page);
        return;
      }

      const props = page.properties;
      
      // 取得欄位名稱列表（用於調試）
      const fieldNames = Object.keys(props);
      if (index === 0) {
        console.log('Notion Database 欄位名稱:', fieldNames);
      }
      
      // 嘗試多種可能的欄位名稱（支援中英文）
      const ticker = props['標的名稱']?.select?.name ||
                     props['標的']?.select?.name;
      
      const date = props['投資日期']?.date?.start ||
                   props['日期']?.date?.start || 
                   props['Date']?.date?.start || 
                   props['交易日期']?.date?.start ||
                   props['Transaction Date']?.date?.start || '';
      
      const type = props['投資類型']?.select?.name ||
                   props['類型']?.select?.name || 
                   props['Type']?.select?.name || 
                   props['交易類型']?.select?.name ||
                   props['Transaction Type']?.select?.name || '';
      
      const shares = (props['股數']?.number ?? 
                     props['Shares']?.number ?? 
                     props['數量']?.number ??
                     props['Quantity']?.number) ?? 0;
      
      const price = (props['股價']?.number ??
                    props['價格']?.number ?? 
                    props['Price']?.number ?? 
                    props['成交價']?.number ??
                    props['Transaction Price']?.number) ?? 0;
      
      // 成本欄位可能是 formula 類型（計算欄位）
      let costValue = 0;
      const costProp = props['成本'];
      if (costProp) {
        if (costProp.type === 'formula' && costProp.formula?.type === 'number') {
          costValue = costProp.formula.number ?? 0;
        } else if (costProp.type === 'number') {
          costValue = costProp.number ?? 0;
        }
      }
      const cost = costValue || (props['Cost']?.number ?? props['總成本']?.number ?? props['Total Cost']?.number ?? 0);
      
      const dividend = (props['現金股利']?.number ??
                       props['股利']?.number ?? 
                       props['Dividend']?.number ?? 
                       props['股息']?.number ??
                       props['Dividends']?.number) ?? 0;
      
      const fee = (props['手續費']?.number ?? props['Fee']?.number) ?? 0;
      
      const dividendPerShare = (props['每股股利']?.number ?? props['Dividend Per Share']?.number) ?? 0;
      
      const totalShares = props['總股數']?.number ?? 
                          props['Total Shares']?.number ?? 0;
      
      const totalCost = props['總成本']?.number ?? 
                        props['Total Cost']?.number ?? 0;
      
      const totalDividends = props['總股息']?.number ?? 
                             props['Total Dividends']?.number ?? 0;
      
      const defaultPrice = props['預設價格']?.number ?? 
                           props['Default Price']?.number ??
                           props['現價']?.number ??
                           props['Current Price']?.number ?? 0;

      // 如果沒有 ticker，跳過這筆記錄
      if (!ticker) {
        console.warn(`第 ${index + 1} 筆記錄缺少「標的名稱」欄位，可用欄位:`, fieldNames);
        return;
      }

      // 計算總成本（成本 = 股數 * 股價 + 手續費，如果成本欄位有值則優先使用）
      const calculatedCost = shares * price + fee;
      const finalCost = cost || calculatedCost || 0;
      
      // 計算總股利（現金股利 + 每股股利 * 股數）
      const totalDividend = dividend + (dividendPerShare * shares);

      // 初始化標的資料（如果尚未存在）
      if (!stocksMap[ticker]) {
        stocksMap[ticker] = {
          ticker,
          totalShares: 0,
          totalCost: 0,
          totalDividends: 0,
          defaultPrice: defaultPrice || price || 0
        };
      }
      
      // 根據「標的名稱」分組，將相同標的的所有交易記錄進行聚合計算
      // 累加股數（根據交易類型決定是加還是減）
      if (type === '賣出' || type === 'Sell' || type === '賣') {
        stocksMap[ticker].totalShares -= Math.abs(shares);
      } else {
        stocksMap[ticker].totalShares += Math.abs(shares);
      }
      
      // 累加成本（賣出時為負數，買入時為正數）
      if (type === '賣出' || type === 'Sell' || type === '賣') {
        stocksMap[ticker].totalCost -= Math.abs(finalCost);
      } else {
        stocksMap[ticker].totalCost += Math.abs(finalCost);
      }
      
      // 累加股利（股利總是正數）
      stocksMap[ticker].totalDividends += totalDividend;
      
      // 更新預設價格（使用最新的股價，優先使用有值的價格）
      if (price > 0) {
        stocksMap[ticker].defaultPrice = price;
      } else if (defaultPrice > 0 && stocksMap[ticker].defaultPrice === 0) {
        stocksMap[ticker].defaultPrice = defaultPrice;
      }

      // 處理交易明細（如果這筆記錄代表一筆交易）
      if (date && ticker && (shares !== 0 || finalCost !== 0)) {
        if (!transactionsMap[ticker]) {
          transactionsMap[ticker] = [];
        }
        
        // 格式化日期：從 ISO 格式轉換為 YYYY/MM/DD
        let formattedDate = date;
        if (date.includes('T')) {
          formattedDate = date.split('T')[0].replace(/-/g, '/');
        } else if (date.includes('-')) {
          formattedDate = date.replace(/-/g, '/');
        }
        
        transactionsMap[ticker].push({
          date: formattedDate,
          type: type || '買入',
          shares: shares || 0,
          price: price || (finalCost && shares ? (finalCost - fee) / shares : 0),
          fee: fee || 0,
          cost: finalCost,
          dividend: totalDividend || 0
        });
      }
    });

    console.log('=== 資料解析完成 ===');
    console.log('根據「標的名稱」欄位分組後的標的:', Object.keys(stocksMap));
    console.log('各標的的聚合資料:', Object.keys(stocksMap).map(ticker => ({
      ticker,
      totalShares: stocksMap[ticker].totalShares,
      totalCost: stocksMap[ticker].totalCost,
      totalDividends: stocksMap[ticker].totalDividends,
      defaultPrice: stocksMap[ticker].defaultPrice
    })));
    console.log('解析到的交易記錄:', Object.keys(transactionsMap).map(t => ({ ticker: t, count: transactionsMap[t].length })));

    // 轉換為陣列格式
    const stocks = Object.values(stocksMap).map((stock, idx) => ({
      id: idx + 1,
      ...stock
    }));

    // 排序交易明細（最新的在前）
    Object.keys(transactionsMap).forEach(ticker => {
      transactionsMap[ticker].sort((a, b) => {
        const dateA = new Date(a.date.replace(/\//g, '-'));
        const dateB = new Date(b.date.replace(/\//g, '-'));
        return dateB - dateA;
      });
    });

    return { stocks, transactions: transactionsMap };
  };

  const syncWithNotion = async () => {
    if (!notionToken || !notionDbId) {
      setSyncMessage({ text: '請先設定 Notion API 資訊', type: 'error' });
      setShowSettings(true);
      return;
    }

    setIsSyncing(true);
    setSyncMessage({ text: '正在同步 Notion 資料...', type: 'info' });

    try {
      // 透過後端 API 代理呼叫 Notion API
      const response = await fetch('http://localhost:3001/api/notion/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: notionToken,
          databaseId: notionDbId,
          query: {} // 可以添加排序、篩選等條件
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '同步失敗');
      }

      const data = await response.json();
      
      // 檢查回應格式
      if (!data || !data.results || !Array.isArray(data.results)) {
        console.error('Notion API 回應格式錯誤:', data);
        throw new Error('Notion API 回應格式不正確');
      }
      
      console.log('Notion API 回應:', {
        object: data.object,
        resultsCount: data.results.length,
        hasMore: data.has_more,
        nextCursor: data.next_cursor
      });
      
      // 解析 Notion 資料
      const { stocks: parsedStocks, transactions: parsedTransactions } = parseNotionData(data.results);
      
      console.log('解析後的資料:', {
        stocksCount: parsedStocks.length,
        transactionsCount: Object.keys(parsedTransactions).length
      });
      
      if (parsedStocks.length === 0) {
        setSyncMessage({ 
          text: `未找到任何資料（收到 ${data.results.length} 筆記錄）。請檢查 Database 欄位名稱是否正確`, 
          type: 'error' 
        });
        return;
      }

      // 更新狀態
      setStocks(parsedStocks);
      setTransactions(parsedTransactions);
      
      // 設定預設價格
      const prices = {};
      parsedStocks.forEach(stock => {
        if (stock.defaultPrice > 0) {
          prices[stock.ticker] = stock.defaultPrice;
        }
      });
      setCurrentPrices(prices);
      
      setSyncMessage({ text: `同步成功！已載入 ${parsedStocks.length} 個標的`, type: 'success' });
      
    } catch (error) {
      console.error('Notion 同步錯誤:', error);
      setSyncMessage({ 
        text: `同步失敗：${error.message}。請確認後端伺服器已啟動（npm run dev:server）`, 
        type: 'error' 
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage({ text: '', type: '' }), 5000);
    }
  };

  const handlePriceChange = (ticker, value) => {
    setCurrentPrices(prev => ({ ...prev, [ticker]: parseFloat(value) || 0 }));
  };

  const syncCurrentPrices = async () => {
    if (stocks.length === 0) {
      setSyncMessage({ text: '請先同步 Notion 資料', type: 'error' });
      setTimeout(() => setSyncMessage({ text: '', type: '' }), 3000);
      return;
    }

    setIsSyncingPrices(true);
    setSyncMessage({ text: '正在同步現價...', type: 'info' });

    try {
      const tickers = stocks.map(s => s.ticker);
      
      const response = await fetch('http://localhost:3001/api/sync-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tickers })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '同步現價失敗');
      }

      // 檢查回應內容類型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('非 JSON 回應:', text.substring(0, 200));
        throw new Error('後端 API 返回非 JSON 格式，請確認 API 路由正確');
      }

      const data = await response.json();
      
      if (data.prices && Object.keys(data.prices).length > 0) {
        // 更新現價
        setCurrentPrices(prev => ({
          ...prev,
          ...data.prices
        }));
        
        const failedCount = data.totalCount - data.successCount;
        let message = `成功同步 ${data.successCount}/${data.totalCount} 個標的的現價`;
        if (failedCount > 0 && data.failedTickers) {
          message += `（${data.failedTickers.join(', ')} 無法取得）`;
        }
        
        setSyncMessage({ 
          text: message, 
          type: data.successCount === data.totalCount ? 'success' : 'info'
        });
      } else {
        setSyncMessage({ 
          text: `無法取得現價資料（${data.totalCount} 個標的均失敗），請確認標的代碼是否正確或稍後再試`, 
          type: 'error' 
        });
      }
      
    } catch (error) {
      console.error('同步現價錯誤:', error);
      
      // 處理 JSON 解析錯誤
      if (error.message.includes('JSON') || error.message.includes('Unexpected token')) {
        setSyncMessage({ 
          text: '後端 API 回應格式錯誤，請確認後端伺服器正常運行且 API 路由正確', 
          type: 'error' 
        });
      } else {
        setSyncMessage({ 
          text: `同步現價失敗：${error.message}。請確認後端伺服器已啟動`, 
          type: 'error' 
        });
      }
    } finally {
      setIsSyncingPrices(false);
      setTimeout(() => setSyncMessage({ text: '', type: '' }), 5000);
    }
  };

  const analytics = useMemo(() => {
    const stockDetails = stocks.map(stock => {
      const currentPrice = currentPrices[stock.ticker] || 0;
      const avgPrice = stock.totalShares > 0 ? stock.totalCost / stock.totalShares : 0;
      const marketValue = stock.totalShares * currentPrice;
      const unrealizedPnL = marketValue - stock.totalCost;
      const totalPnL = unrealizedPnL + stock.totalDividends;
      return {
        ...stock, avgPrice, marketValue, unrealizedPnL, totalPnL,
        totalROI: stock.totalCost > 0 ? (totalPnL / stock.totalCost) * 100 : 0,
        unrealizedROI: stock.totalCost > 0 ? (unrealizedPnL / stock.totalCost) * 100 : 0,
        dividendROI: stock.totalCost > 0 ? (stock.totalDividends / stock.totalCost) * 100 : 0,
      };
    });

    const totalPortfolioCost = stockDetails.reduce((sum, s) => sum + s.totalCost, 0);
    const totalPortfolioValue = stockDetails.reduce((sum, s) => sum + s.marketValue, 0);
    const totalPortfolioDividends = stockDetails.reduce((sum, s) => sum + s.totalDividends, 0);
    const totalPnL = totalPortfolioValue + totalPortfolioDividends - totalPortfolioCost;

    return {
      stockDetails, totalPortfolioCost, totalPortfolioDividends,
      totalPortfolioROI: totalPortfolioCost > 0 ? (totalPnL / totalPortfolioCost) * 100 : 0,
      totalPortfolioPnL: totalPnL,
      unrealizedROI: totalPortfolioCost > 0 ? ((totalPortfolioValue - totalPortfolioCost) / totalPortfolioCost) * 100 : 0,
      dividendROI: totalPortfolioCost > 0 ? (totalPortfolioDividends / totalPortfolioCost) * 100 : 0
    };
  }, [stocks, currentPrices]);

  const formatCurrency = (val) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  const formatPercent = (val) => val.toFixed(2) + '%';

  const modeInfo = useMemo(() => {
    switch(displayMode) {
      case 'unrealized': return { label: '未實現報酬', roi: analytics.unrealizedROI, pnl: analytics.totalPortfolioPnL - analytics.totalPortfolioDividends };
      case 'dividend': return { label: '累計利息收益', roi: analytics.dividendROI, pnl: analytics.totalPortfolioDividends };
      default: return { label: '總報酬 (含息)', roi: analytics.totalPortfolioROI, pnl: analytics.totalPortfolioPnL };
    }
  }, [displayMode, analytics]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-3 sm:p-4 md:p-8 relative">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-4 sm:mb-6 md:mb-8 flex flex-col gap-3 sm:gap-4 border-b border-slate-200 pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
                <Activity className="text-indigo-600" size={20} /> 
                <span className="hidden sm:inline">投資損益監測儀表板</span>
                <span className="sm:hidden">投資儀表板</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                <p className="text-slate-500 text-xs sm:text-sm font-medium flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                  <span className="hidden sm:inline">2026/02/08 版本</span>
                  <span className="sm:hidden">v2026/02/08</span>
                </p>
                {syncMessage.text && (
                  <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                    syncMessage.type === 'success' ? 'text-emerald-600 bg-emerald-50' : 
                    syncMessage.type === 'error' ? 'text-rose-600 bg-rose-50' : 'text-indigo-600 bg-indigo-50'
                  }`}>
                    {syncMessage.type === 'success' ? <CheckCircle2 size={10}/> : <AlertCircle size={10}/>}
                    <span className="max-w-[200px] sm:max-w-none truncate">{syncMessage.text}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={syncWithNotion}
                disabled={isSyncing}
                className="flex sm:inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-indigo-700 transition shadow-md shadow-indigo-100 disabled:opacity-50"
              >
                {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">同步 Notion 資料</span>
                <span className="sm:hidden">同步資料</span>
              </button>
              <button 
                onClick={syncCurrentPrices}
                disabled={isSyncingPrices || stocks.length === 0}
                className="flex sm:inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 bg-emerald-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-emerald-700 transition shadow-md shadow-emerald-100 disabled:opacity-50"
              >
                {isSyncingPrices ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                <span className="hidden sm:inline">同步現價</span>
                <span className="sm:hidden">現價</span>
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="flex sm:inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 bg-white border border-slate-200 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-50 transition shadow-sm text-slate-600"
              >
                <Settings size={14} />
                <span>設定</span>
              </button>
            </div>
          </div>
        </header>

        {/* 資產總覽卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          <Card title="當前投資總成本" value={formatCurrency(analytics.totalPortfolioCost)} icon={<DollarSign className="text-blue-600" />} />
          <Card title="累計已收股息" value={formatCurrency(analytics.totalPortfolioDividends)} icon={<TrendingUp className="text-emerald-600" />} />
          <Card 
            title={modeInfo.label} 
            value={formatPercent(modeInfo.roi || 0)} 
            subValue={formatCurrency(modeInfo.pnl || 0)}
            isPositive={(modeInfo.pnl || 0) >= 0}
            icon={(modeInfo.pnl || 0) >= 0 ? <TrendingUp className="text-emerald-600" /> : <TrendingDown className="text-rose-600" />} 
          />
        </div>

        {/* 1. 各標的獲利分析 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-4 sm:mb-8 shadow-inner-white">
          <div className="p-6 border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">各標的獲利分析</h2>
              <p className="text-xs text-slate-400 mt-1">輸入最新現價計算各標的獲益狀況</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
              {['total', 'unrealized', 'dividend'].map(mode => (
                <button 
                  key={mode}
                  onClick={() => setDisplayMode(mode)}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${displayMode === mode ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {mode === 'total' ? '含息' : mode === 'unrealized' ? '未實現' : '利息'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="overflow-x-auto sm:-mx-0">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold">
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">標的</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">股數</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">總成本</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">均價</th>
                    {displayMode !== 'dividend' && (
                      <>
                        <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 bg-indigo-50/50 text-indigo-700 font-black whitespace-nowrap">現價</th>
                        <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>市值</span>
                            <span className="text-[8px] sm:text-[9px] font-normal text-slate-400 normal-case">(損益)</span>
                          </div>
                        </th>
                      </>
                    )}
                    {displayMode !== 'unrealized' && <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">股息</th>}
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right font-black text-slate-600 whitespace-nowrap">
                      <span className="hidden sm:inline">{displayMode === 'unrealized' ? '價差報酬率' : displayMode === 'dividend' ? '成本殖利率' : '總報酬率 (含息)'}</span>
                      <span className="sm:hidden">報酬率</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm font-medium">
                  {analytics.stockDetails.length === 0 ? (
                    <tr>
                      <td colSpan={displayMode === 'dividend' ? 6 : displayMode === 'unrealized' ? 7 : 8} className="px-4 sm:px-6 py-8 sm:py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <PieChart className="text-slate-300" size={24} />
                          <p className="text-xs sm:text-sm font-medium">尚無投資標的資料</p>
                          <p className="text-[10px] sm:text-xs">請先同步 Notion 資料以查看投資分析</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    analytics.stockDetails.map((stock) => {
                      let activeROI = stock.totalROI;
                      if (displayMode === 'unrealized') activeROI = stock.unrealizedROI;
                      else if (displayMode === 'dividend') activeROI = stock.dividendROI;

                      return (
                        <tr key={stock.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 font-bold text-slate-900 whitespace-nowrap">{stock.ticker}</td>
                          <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-slate-700 whitespace-nowrap">{stock.totalShares.toLocaleString()}</td>
                          <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-slate-800 font-bold whitespace-nowrap">{formatCurrency(stock.totalCost)}</td>
                          <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-slate-600 whitespace-nowrap">{stock.avgPrice.toFixed(2)}</td>
                          {displayMode !== 'dividend' && (
                            <>
                              <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 bg-indigo-50/20 whitespace-nowrap">
                                <input 
                                  type="number" step="0.01" value={currentPrices[stock.ticker] || ''}
                                  onChange={(e) => handlePriceChange(stock.ticker, e.target.value)}
                                  className="w-16 sm:w-20 px-1.5 sm:px-2 py-1 border border-indigo-200 rounded-lg bg-white text-indigo-700 font-black text-[10px] sm:text-xs outline-none shadow-sm focus:ring-2 focus:ring-indigo-400"
                                />
                              </td>
                              <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                                <div className="font-bold text-slate-800 text-xs sm:text-sm">{formatCurrency(stock.marketValue)}</div>
                                <div className={`text-[10px] sm:text-xs font-medium mt-0.5 ${stock.unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {stock.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(stock.unrealizedPnL)}
                                </div>
                              </td>
                            </>
                          )}
                          {displayMode !== 'unrealized' && (
                            <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 font-bold text-emerald-600 whitespace-nowrap text-xs sm:text-sm">{formatCurrency(stock.totalDividends)}</td>
                          )}
                          <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right whitespace-nowrap">
                            <div className={`inline-flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-black transition-all ${activeROI >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {activeROI >= 0 ? '+' : ''}{formatPercent(activeROI)}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. 各標的購入詳細狀況 */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 overflow-hidden shadow-soft mt-4 sm:mt-0">
          <div className="p-4 sm:p-6 border-slate-100 flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <ListFilter size={18} />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800">各標的購入詳細狀況</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">標的篩選</span>
                <select 
                  value={selectedTicker}
                  onChange={(e) => setSelectedTicker(e.target.value)}
                  className="flex-1 sm:flex-none bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl px-3 sm:px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer hover:bg-white"
                  disabled={stocks.length === 0}
                >
                  {stocks.length === 0 ? (
                    <option value="">請先同步資料</option>
                  ) : (
                    stocks.map(s => <option key={s.ticker} value={s.ticker}>{s.ticker}</option>)
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto sm:-mx-0 max-h-[400px] overflow-y-auto">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 whitespace-nowrap">日期</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 whitespace-nowrap">類型</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 text-right whitespace-nowrap">股數</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 text-right whitespace-nowrap">成交價</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 text-right whitespace-nowrap">手續費</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 text-right whitespace-nowrap">總成本</th>
                    <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-100 text-right whitespace-nowrap">股利</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {(!selectedTicker || (transactions[selectedTicker] || []).length === 0) ? (
                    <tr>
                      <td colSpan="7" className="px-4 sm:px-6 py-8 sm:py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <Database className="text-slate-300" size={24} />
                          <p className="text-xs sm:text-sm font-medium">尚無交易資料</p>
                          <p className="text-[10px] sm:text-xs">請先同步 Notion 資料以查看交易明細</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (transactions[selectedTicker] || []).map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 transition">
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-slate-600 font-medium tabular-nums whitespace-nowrap text-[10px] sm:text-xs">{tx.date}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase ${
                            tx.type === '買入' ? 'bg-blue-100 text-blue-700' :
                            tx.type === '賣出' ? 'bg-rose-100 text-rose-700' :
                            tx.type === '定期定額' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className={`px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right font-bold tabular-nums whitespace-nowrap text-xs sm:text-sm ${tx.shares < 0 ? 'text-rose-500' : 'text-slate-700'}`}>
                          {tx.shares > 0 ? '+' : ''}{tx.shares.toLocaleString()}
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right text-slate-500 tabular-nums whitespace-nowrap text-xs sm:text-sm">{tx.price > 0 ? tx.price.toFixed(2) : '-'}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right text-slate-500 tabular-nums whitespace-nowrap text-xs sm:text-sm">{tx.fee > 0 ? formatCurrency(tx.fee) : '-'}</td>
                        <td className={`px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right font-black tabular-nums whitespace-nowrap text-xs sm:text-sm ${tx.cost < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{formatCurrency(tx.cost)}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right font-bold text-emerald-600 tabular-nums whitespace-nowrap text-xs sm:text-sm">{tx.dividend > 0 ? `+${formatCurrency(tx.dividend)}` : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm sm:text-base">
                  <Database className="text-indigo-600" size={16} /> Notion API 設定
                </div>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition p-1">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Integration Token</label>
                  <input 
                    type="password" 
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                    placeholder="secret_..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                  />
                  <p className="mt-2 text-[9px] sm:text-[10px] text-slate-400">從 Notion Integration 頁面取得的 Access Token</p>
                </div>
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Database ID</label>
                  <input 
                    type="text" 
                    value={notionDbId}
                    onChange={(e) => setNotionDbId(e.target.value)}
                    placeholder="32碼十六進位字串"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                  />
                  <p className="mt-2 text-[9px] sm:text-[10px] text-slate-400">Database 網址中的 ID 部分</p>
                </div>
                <button 
                  onClick={saveSettings}
                  className="w-full bg-indigo-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 text-sm sm:text-base"
                >
                  <Save size={16} /> 儲存設定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border-t border-slate-200 pt-4 sm:pt-6">
          <p className="text-center sm:text-left">© 2026 投資損益管理系統 • Notion 串接版</p>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 items-center">
            <span className="flex items-center gap-1 text-indigo-400"><ChevronRight size={9}/> <span className="hidden sm:inline">API SYNC ENABLED</span><span className="sm:hidden">API</span></span>
            <span className="flex items-center gap-1"><ChevronRight size={9}/> <span className="hidden sm:inline">COOKIE PERSISTENCE</span><span className="sm:hidden">COOKIE</span></span>
          </div>
        </footer>
      </div>
    </div>
  );
};

const Card = ({ title, value, subValue, icon, isPositive = true }) => (
  <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-lg transition-all duration-300">
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <span className="text-slate-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest">{title}</span>
      <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg sm:rounded-xl shadow-inner text-indigo-500">{icon}</div>
    </div>
    <div>
      <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter tabular-nums mb-1">{value}</div>
      {subValue && (
        <div className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md inline-flex ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {isPositive ? <TrendingUp size={9}/> : <TrendingDown size={9}/>} {subValue}
        </div>
      )}
    </div>
  </div>
);

export default App;
