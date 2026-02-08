// Netlify Serverless Function for Notion API proxy
exports.handler = async (event, context) => {
  // 只允許 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { token, databaseId } = JSON.parse(event.body);

    if (!token || !databaseId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: '缺少必要參數：token 和 databaseId' 
        })
      };
    }

    // 轉發請求到 Notion API
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.parse(event.body).query || {})
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Notion API 錯誤: ${errorText}` 
        })
      };
    }

    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Notion API 代理錯誤:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: '伺服器錯誤', 
        message: error.message 
      })
    };
  }
};
