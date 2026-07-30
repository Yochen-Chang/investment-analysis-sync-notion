// Netlify Serverless Function for Notion API proxy
// Notion Database Query：自動分頁抓取全部資料（每頁最多 100 筆）
async function queryAllNotionPages(token, databaseId, query = {}) {
  const allResults = [];
  let startCursor = undefined;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    pageCount += 1;
    const body = {
      ...query,
      page_size: 100,
      ...(startCursor ? { start_cursor: startCursor } : {})
    };

    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`Notion API 錯誤: ${errorText}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    allResults.push(...(data.results || []));
    hasMore = data.has_more === true;
    startCursor = data.next_cursor || undefined;
  }

  return {
    object: 'list',
    results: allResults,
    has_more: false,
    next_cursor: null,
    page_count: pageCount
  };
}

exports.handler = async (event, context) => {
  // 只允許 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { token, databaseId } = body;

    if (!token || !databaseId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: '缺少必要參數：token 和 databaseId' 
        })
      };
    }

    const data = await queryAllNotionPages(token, databaseId, body.query || {});

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
      statusCode: error.status || 500,
      body: JSON.stringify({ 
        error: error.status ? error.message : '伺服器錯誤', 
        message: error.message 
      })
    };
  }
};
