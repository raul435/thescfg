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

  // Helper to fetch from Vercel KV
  const kvFetch = async (command, ...args) => {
    if (!KV_URL || !KV_TOKEN) return null;
    try {
      const response = await fetch(`${KV_URL}/${command}/${args.join('/')}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('KV Error:', error);
      return null;
    }
  };

  const readData = async () => {
    // Try KV first if available
    if (KV_URL && KV_TOKEN) {
      const data = await kvFetch('get', 'site_data');
      if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    }

    // Fallback to local file
    try {
      if (!fs.existsSync(filePath)) {
        return { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
      }
      const jsonData = fs.readFileSync(filePath, 'utf8');
      return jsonData ? JSON.parse(jsonData) : { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
    } catch (error) {
      return { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
    }
  };

  const writeData = async (data) => {
    // Write to KV if available
    if (KV_URL && KV_TOKEN) {
      try {
        const response = await fetch(`${KV_URL}/set/site_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          body: JSON.stringify(data)
        });
        return response.ok;
      } catch (error) {
        console.error('KV Write Error:', error);
        return false;
      }
    }

    // Fallback to local file
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  };

  if (req.method === 'GET') {
    const data = await readData();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    try {
      const currentData = await readData();
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { type, category, item } = body;

      if (!type || !item) {
        return res.status(400).json({ error: 'Missing type or item' });
      }

      if (type === 'galleries') {
        if (!category) return res.status(400).json({ error: 'Missing category for gallery' });
        if (!currentData.galleries) currentData.galleries = {};
        if (!currentData.galleries[category]) currentData.galleries[category] = [];
        const newItem = { id: Date.now(), ...item };
        currentData.galleries[category].push(newItem);
      } else {
        if (!currentData[type]) currentData[type] = [];
        const newItem = { id: Date.now(), ...item };
        currentData[type].push(newItem);
      }
      
      if (await writeData(currentData)) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Failed to save data. Make sure KV is configured in Vercel.' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to process request: ' + error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { type, category, id } = req.query;
      if (!type || !id) {
        return res.status(400).json({ error: 'Missing type or id' });
      }

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
        return res.status(500).json({ error: 'Failed to delete data' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to process delete: ' + error.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
