const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Use environment variables (User must set these in Vercel)
  const DB_URL = process.env.TSCFG_URL;
  const DB_TOKEN = process.env.TSCFG_TOKEN;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validate presence
  if (!DB_URL || !DB_TOKEN) {
    return res.status(500).json({ 
      error: "Database configuration incomplete", 
      details: "Please ensure TSCFG_URL (starts with https://) and TSCFG_TOKEN are set in Vercel Settings -> Environment Variables." 
    });
  }

  const kvRequest = async (path, method = 'GET', body = null) => {
    // Sanitize URL
    const baseUrl = DB_URL.endsWith('/') ? DB_URL.slice(0, -1) : DB_URL;
    const url = `${baseUrl}${path}`;
    
    const options = {
      method,
      headers: { 'Authorization': `Bearer ${DB_TOKEN}` }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upstash Error ${response.status}: ${text}`);
    }
    const data = await response.json();
    return data.result;
  };

  try {
    if (req.method === 'GET') {
      const raw = await kvRequest('/get/site_data');
      let data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data) {
        data = { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
        await kvRequest('/set/site_data', 'POST', data);
      }
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const raw = await kvRequest('/get/site_data');
      let currentData = typeof raw === 'string' ? JSON.parse(raw) : (raw || { matches: [], news: [], galleries: {}, registrations: [] });
      
      let payload = req.body;
      if (typeof payload === 'string' && payload.trim()) payload = JSON.parse(payload);
      
      const { type, category, item } = payload || {};
      if (type === 'galleries') {
        if (!currentData.galleries) currentData.galleries = {};
        if (!currentData.galleries[category]) currentData.galleries[category] = [];
        currentData.galleries[category].push({ id: Date.now(), ...item });
      } else {
        if (!currentData[type]) currentData[type] = [];
        currentData[type].push({ id: Date.now(), ...item });
      }

      await kvRequest('/set/site_data', 'POST', currentData);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { type, category, id } = req.query;
      const raw = await kvRequest('/get/site_data');
      let currentData = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (type === 'galleries') {
        currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await kvRequest('/set/site_data', 'POST', currentData);
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error("API Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
