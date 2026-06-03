const fs = require('fs');
const path = require('path');

// Vercel KV REST API configuration - Flexible detection
let KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.KV_URL;
let KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

// Support for REDIS_URL fallback (Attempt to derive REST URL for Upstash)
if (!KV_REST_API_URL && process.env.REDIS_URL) {
  const rUrl = process.env.REDIS_URL;
  if (rUrl.includes('@') && rUrl.includes('db.redis.io')) {
    const parts = rUrl.split('@');
    const password = parts[0].split(':').pop();
    const host = parts[1].split(':')[0].replace('.db.redis.io', '.upstash.io');
    KV_REST_API_URL = `https://${host}`;
    KV_REST_API_TOKEN = password;
  }
}

module.exports = async (req, res) => {
  // Diagnostic info
  console.log('API Request:', req.method, 'ENV:', {
    has_rest_url: !!KV_REST_API_URL,
    has_rest_token: !!KV_REST_API_TOKEN,
    has_redis_url: !!process.env.REDIS_URL,
    node_env: process.env.NODE_ENV
  });

  try {
    const filePath = path.join(process.cwd(), 'data.json');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const initialStructure = { 
      matches: [], 
      news: [], 
      galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } 
    };

    const getLocalData = () => {
      try {
        if (fs.existsSync(filePath)) {
          const jsonData = fs.readFileSync(filePath, 'utf8');
          return jsonData ? JSON.parse(jsonData) : initialStructure;
        }
      } catch (e) {}
      return initialStructure;
    };

    const kvFetch = async (command, ...args) => {
      if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
      const url = `${KV_REST_API_URL}/${command}/${args.join('/')}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } });
      if (!response.ok) throw new Error(`KV API Error: ${response.status}`);
      const data = await response.json();
      return data.result;
    };

    const writeData = async (data) => {
      if (KV_REST_API_URL && KV_REST_API_TOKEN) {
        const response = await fetch(`${KV_REST_API_URL}/set/site_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
          body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('KV Write failed');
        return true;
      }
      if (process.env.VERCEL) {
        throw new Error('Database not configured. Need KV_REST_API_URL or REDIS_URL.');
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    };

    const readData = async () => {
      if (KV_REST_API_URL && KV_REST_API_TOKEN) {
        const data = await kvFetch('get', 'site_data');
        if (data) return typeof data === 'string' ? JSON.parse(data) : data;
        const localData = getLocalData();
        await writeData(localData);
        return localData;
      }
      return getLocalData();
    };

    if (req.method === 'GET') return res.status(200).json(await readData());

    if (req.method === 'POST') {
      const currentData = await readData();
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const { type, category, item } = body || {};
      if (!type || !item) return res.status(400).json({ error: 'Missing type/item' });

      if (type === 'galleries') {
        if (!currentData.galleries[category]) currentData.galleries[category] = [];
        currentData.galleries[category].push({ id: Date.now(), ...item });
      } else {
        if (!currentData[type]) currentData[type] = [];
        currentData[type].push({ id: Date.now(), ...item });
      }
      await writeData(currentData);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { type, category, id } = req.query;
      let currentData = await readData();
      if (type === 'galleries') {
        if (currentData.galleries[category]) currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }
      await writeData(currentData);
      return res.status(200).json({ success: true });
    }
    return res.status(405).end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
