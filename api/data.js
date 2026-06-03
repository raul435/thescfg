const fs = require('fs');
const path = require('path');

// Explicit custom variables to avoid Vercel automapping confusion
const DB_URL = process.env.TSCFG_URL;
const DB_TOKEN = process.env.TSCFG_TOKEN;

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic validation
  if (!DB_URL || !DB_TOKEN) {
    return res.status(500).json({ 
      error: "Database configuration missing", 
      details: "Please set TSCFG_URL and TSCFG_TOKEN in Vercel Environment Variables." 
    });
  }

  const kvRequest = async (path, method = 'GET', body = null) => {
    const url = `${DB_URL}${path}`;
    const options = {
      method,
      headers: { 'Authorization': `Bearer ${DB_TOKEN}` }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DB Error ${response.status}: ${text}`);
    }
    const data = await response.json();
    return data.result;
  };

  try {
    // 1. GET DATA
    if (req.method === 'GET') {
      const raw = await kvRequest('/get/site_data');
      let data = raw;
      if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch(e) { data = null; }
      }
      if (!data) {
        data = { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
        await kvRequest('/set/site_data', 'POST', data);
      }
      return res.status(200).json(data);
    }

    // 2. POST DATA
    if (req.method === 'POST') {
      const raw = await kvRequest('/get/site_data');
      let currentData = typeof raw === 'string' ? JSON.parse(raw) : (raw || { matches: [], news: [], galleries: {}, registrations: [] });
      
      let payload = req.body;
      if (typeof payload === 'string') payload = JSON.parse(payload);
      
      const { type, category, item } = payload;
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

    // 3. DELETE DATA
    if (req.method === 'DELETE') {
      const { type, category, id } = req.query;
      const raw = await kvRequest('/get/site_data');
      let currentData = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (type === 'galleries') {
        if (currentData.galleries[category]) {
          currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await kvRequest('/set/site_data', 'POST', currentData);
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error("Critical API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
