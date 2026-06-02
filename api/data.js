const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const filePath = path.join(process.cwd(), 'data.json');

  // Set CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(200).json({ matches: [], news: [] });
      }
      const jsonData = fs.readFileSync(filePath, 'utf8');
      return res.status(200).json(JSON.parse(jsonData));
    } catch (error) {
      console.error('Read Error:', error);
      return res.status(500).json({ error: 'Failed to read data', details: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      let currentData = { matches: [], news: [] };
      
      if (fs.existsSync(filePath)) {
        currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }

      const { type, item } = req.body; // type: 'matches' or 'news'

      if (!type || !item || !currentData[type]) {
        return res.status(400).json({ error: 'Invalid data type or missing item' });
      }

      const newItem = {
        id: Date.now(),
        ...item
      };

      currentData[type].push(newItem);
      
      fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2));

      return res.status(200).json(newItem);
    } catch (error) {
      console.error('Write Error:', error);
      return res.status(500).json({ error: 'Failed to save data', details: error.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
