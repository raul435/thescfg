const fs = require('fs');
const path = require('path');

// Vercel KV REST API configuration
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

module.exports = async (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data.json');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

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
      } catch (e) {
        console.error('Local read error:', e);
      }
      return initialStructure;
    };

    // Helper to fetch from Vercel KV
    const kvFetch = async (command, ...args) => {
      if (!KV_URL || !KV_TOKEN) return null;
      
      const url = `${KV_URL}/${command}/${args.join('/')}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`KV API responded with ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      return data.result;
    };

    const writeData = async (data) => {
      if (KV_URL && KV_TOKEN) {
        const response = await fetch(`${KV_URL}/set/site_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`KV Write failed (${response.status}): ${errText}`);
        }
        return true;
      }
      
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
      } catch (error) {
        throw new Error(`Local write failed: ${error.message}`);
      }
    };

    const readData = async () => {
      if (KV_URL && KV_TOKEN) {
        const data = await kvFetch('get', 'site_data');
        if (data) {
          return typeof data === 'string' ? JSON.parse(data) : data;
        }
        
        // MIGRATION: If KV is empty, seed it
        const localData = getLocalData();
        await writeData(localData);
        return localData;
      }
      return getLocalData();
    };

    if (req.method === 'GET') {
      const data = await readData();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const currentData = await readData();
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      
      const { type, category, item } = body || {};
      if (!type || !item) {
        return res.status(400).json({ error: 'Missing type or item' });
      }

      if (type === 'galleries') {
        if (!category) return res.status(400).json({ error: 'Missing category' });
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
        if (category && currentData.galleries && currentData.galleries[category]) {
          currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await writeData(currentData);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });

  } catch (globalError) {
    console.error('GLOBAL API ERROR:', globalError);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: globalError.message,
      stack: process.env.NODE_ENV === 'development' ? globalError.stack : undefined
    });
  }
};
