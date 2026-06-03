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

  // Helper to fetch from Vercel KV
  const kvFetch = async (command, ...args) => {
    if (!KV_URL || !KV_TOKEN) {
      console.log('KV credentials missing');
      return null;
    }
    try {
      const url = `${KV_URL}/${command}/${args.join('/')}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await response.json();
      if (data.error) {
        console.error('KV API Error:', data.error);
        return null;
      }
      return data.result;
    } catch (error) {
      console.error('KV Fetch Exception:', error);
      return null;
    }
  };

  const readData = async () => {
    if (KV_URL && KV_TOKEN) {
      console.log('Attempting to read from KV...');
      const data = await kvFetch('get', 'site_data');
      if (data) {
        try {
          return typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          console.error('JSON Parse error from KV:', e);
          return data; // It might already be an object
        }
      }
      console.log('KV returned empty, using initial structure');
      return initialStructure;
    }

    // Fallback to local file
    try {
      if (!fs.existsSync(filePath)) return initialStructure;
      const jsonData = fs.readFileSync(filePath, 'utf8');
      return jsonData ? JSON.parse(jsonData) : initialStructure;
    } catch (error) {
      return initialStructure;
    }
  };

  const writeData = async (data) => {
    if (KV_URL && KV_TOKEN) {
      console.log('Attempting to write to KV...');
      try {
        const response = await fetch(`${KV_URL}/set/site_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        console.log('KV Write result:', result);
        return response.ok && !result.error;
      } catch (error) {
        console.error('KV Write Exception:', error);
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

  if (req.method === 'GET') {
    const data = await readData();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    try {
      const currentData = await readData();
      let body;
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        body = req.body;
      }
      
      const { type, category, item } = body || {};

      if (!type || !item) {
        return res.status(400).json({ error: 'Missing type or item', received: body });
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
      
      const success = await writeData(currentData);
      if (success) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Failed to save to database. Check Vercel logs.' });
      }
    } catch (error) {
      console.error('POST Process error:', error);
      return res.status(500).json({ error: 'Server error: ' + error.message });
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
        return res.status(500).json({ error: 'Failed to delete from database' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Delete error: ' + error.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
