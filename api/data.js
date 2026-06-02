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

  const readData = () => {
    try {
      if (!fs.existsSync(filePath)) {
        return { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
      }
      const jsonData = fs.readFileSync(filePath, 'utf8');
      return jsonData ? JSON.parse(jsonData) : { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
    } catch (error) {
      console.error('Read error:', error);
      return { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] } };
    }
  };

  const writeData = (data) => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Write error:', error);
      return false;
    }
  };

  if (req.method === 'GET') {
    return res.status(200).json(readData());
  }

  if (req.method === 'POST') {
    try {
      const currentData = readData();
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
      
      if (writeData(currentData)) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Failed to save data. If you are on Vercel, note that local file storage is not supported.' });
      }
    } catch (error) {
      console.error('POST error:', error);
      return res.status(500).json({ error: 'Failed to process request: ' + error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { type, category, id } = req.query;
      if (!type || !id) {
        return res.status(400).json({ error: 'Missing type or id' });
      }

      let currentData = readData();

      if (type === 'galleries') {
        if (category && currentData.galleries && currentData.galleries[category]) {
          currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      if (writeData(currentData)) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: 'Failed to delete data' });
      }
    } catch (error) {
      console.error('DELETE error:', error);
      return res.status(500).json({ error: 'Failed to process delete: ' + error.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
