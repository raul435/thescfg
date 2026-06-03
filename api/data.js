const fs = require('fs');
const path = require('path');

// Vercel KV REST API configuration
let KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.KV_URL;
let KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

// Fallback logic for derived REDIS_URL
if (!KV_REST_API_URL && process.env.REDIS_URL) {
  try {
    const rUrl = process.env.REDIS_URL;
    if (rUrl.includes('@')) {
      const parts = rUrl.split('@');
      const auth = parts[0].split(':');
      const password = auth.pop();
      const hostPort = parts[1].split(':');
      const host = hostPort[0];
      // For Upstash, the REST URL is usually https://HOST
      KV_REST_API_URL = `https://${host}`;
      KV_REST_API_TOKEN = password;
    }
  } catch (e) {
    console.error('Error parsing REDIS_URL:', e);
  }
}

module.exports = async (req, res) => {
  // Log request for debugging in Vercel Dashboard
  console.log(`[${req.method}] Request received. DB Configured: ${!!KV_REST_API_URL}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const filePath = path.join(process.cwd(), 'data.json');
  const initialStructure = { 
    matches: [], 
    news: [], 
    galleries: { mens: [], womens: [], academy: [], goalkeepers: [] },
    registrations: []
  };

  const getLocalData = () => {
    try {
      if (fs.existsSync(filePath)) {
        const jsonData = fs.readFileSync(filePath, 'utf8');
        return jsonData ? JSON.parse(jsonData) : initialStructure;
      }
    } catch (e) { console.error('Local read error:', e); }
    return initialStructure;
  };

  const writeData = async (data) => {
    if (KV_REST_API_URL && KV_REST_API_TOKEN) {
      const url = `${KV_REST_API_URL}/set/site_data`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`KV Write Error (${response.status}): ${txt}`);
      }
      return true;
    }
    
    if (process.env.VERCEL) {
      throw new Error('Database not configured on Vercel.');
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  };

  const readData = async () => {
    if (KV_REST_API_URL && KV_REST_API_TOKEN) {
      const url = `${KV_REST_API_URL}/get/site_data`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });
      if (response.ok) {
        const data = await response.json();
        const result = data.result;
        if (result) return typeof result === 'string' ? JSON.parse(result) : result;
      }
      // If empty in KV, seed from local
      const local = getLocalData();
      await writeData(local);
      return local;
    }
    return getLocalData();
  };

  try {
    if (req.method === 'GET') {
      const data = await readData();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const currentData = await readData();
      let body = req.body;
      
      // Robust body parsing
      if (typeof body === 'string' && body.trim()) {
        try { body = JSON.parse(body); } catch(e) { console.error('Body parse error:', e); }
      }
      
      const { type, category, item } = body || {};
      if (!type || !item) return res.status(400).json({ error: 'Invalid request body' });

      if (type === 'galleries') {
        if (!currentData.galleries) currentData.galleries = {};
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
        if (currentData.galleries && currentData.galleries[category]) {
          currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }
      
      await writeData(currentData);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
