const fs = require('fs');
const path = require('path');

// Vercel KV REST API configuration
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

module.exports = async (req, res) => {
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
    try {
      const url = `${KV_URL}/${command}/${args.join('/')}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('KV Fetch Exception:', error);
      return null;
    }
  };

  const writeData = async (data) => {
    if (KV_URL && KV_TOKEN) {
      try {
        const response = await fetch(`${KV_URL}/set/site_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          body: JSON.stringify(data)
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    }
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  };

  const readData = async () => {
    if (KV_URL && KV_TOKEN) {
      const data = await kvFetch('get', 'site_data');
      if (data) {
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
      
      // MIGRATION: If KV is empty, try to seed it with local data
      console.log('KV empty, seeding from local data.json...');
      const localData = getLocalData();
      await writeData(localData);
      return localData;
    }
    return getLocalData();
  };

  if (req.method === 'GET') {
    try {
      const data = await readData();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Read error', details: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
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
      
      if (await writeData(currentData)) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Write failed' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'POST failed', details: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { type, category, id } = req.query;
      let currentData = await readData();

      if (type === 'galleries') {
        if (category && currentData.galleries && currentData.galleries[category]) {
          currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      if (await writeData(currentData)) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Delete failed' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Delete failed', details: error.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
