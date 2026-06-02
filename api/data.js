const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const filePath = path.join(process.cwd(), 'data.json');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(200).json({ matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } });
      }
      const jsonData = fs.readFileSync(filePath, 'utf8');
      return res.status(200).json(JSON.parse(jsonData));
    } catch (error) {
      return res.status(500).json({ error: 'Failed to read data' });
    }
  }

  if (req.method === 'POST') {
    try {
      const currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const { type, category, item } = req.body;

      if (type === 'galleries') {
        if (!currentData.galleries[category]) currentData.galleries[category] = [];
        const newItem = { id: Date.now(), ...item };
        currentData.galleries[category].push(newItem);
      } else {
        if (!currentData[type]) return res.status(400).json({ error: 'Invalid type' });
        const newItem = { id: Date.now(), ...item };
        currentData[type].push(newItem);
      }
      
      fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2));
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save data' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { type, category, id } = req.query;
      let currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (type === 'galleries') {
        currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2));
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to delete data' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
