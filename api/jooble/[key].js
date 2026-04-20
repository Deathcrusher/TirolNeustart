export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { key } = request.query;
  const apiKey = Array.isArray(key) ? key[0] : key;

  if (!apiKey) {
    response.status(400).json({ error: 'Missing Jooble API key' });
    return;
  }

  try {
    const joobleResponse = await fetch(`https://jooble.org/api/${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body || {}),
    });

    const text = await joobleResponse.text();
    response.status(joobleResponse.status);
    response.setHeader('Content-Type', joobleResponse.headers.get('content-type') || 'application/json');
    response.send(text);
  } catch (error) {
    console.error('Jooble proxy error:', error);
    response.status(502).json({
      error: 'Jooble proxy request failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
