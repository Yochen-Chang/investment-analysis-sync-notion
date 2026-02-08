// Vercel Serverless Function for Notion API proxy
export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
