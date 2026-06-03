const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Use Vercel variables if present, otherwise fallback to your known Upstash credentials
  const DB_URL = process.env.TSCFG_URL || process.env.KV_REST_API_URL || "https://aunt-fact-hyperclear-53205.upstash.io";
  const DB_TOKEN = process.env.TSCFG_TOKEN || process.env.KV_REST_API_TOKEN || "Ls7EkTutF7jghRzL8oLEcBkWVOrDnP7c";

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvRequest = async (path, method = 'GET', body = null) => {
    const url = `${DB_URL.replace(/\/$/, '')}${path}`;
    const options = {
      method,
      headers: { 'Authorization': `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upstash Error ${response.status}: ${text}`);
    }
    return response.json();
  };

  try {
    if (req.method === 'GET') {
      const data = await kvRequest('/get/site_data');
      let result = data.result;
      if (!result) {
        result = { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
        await kvRequest('/set/site_data', 'POST', result);
      } else {
        result = typeof result === 'string' ? JSON.parse(result) : result;
      }
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const dataResponse = await kvRequest('/get/site_data');
      let currentData = dataResponse.result;
      currentData = typeof currentData === 'string' ? JSON.parse(currentData) : (currentData || { matches: [], news: [], galleries: {}, registrations: [] });

      let body = req.body;
      if (typeof body === 'string' && body.trim()) body = JSON.parse(body);
      const { type, category, item } = body || {};

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
      const dataResponse = await kvRequest('/get/site_data');
      let currentData = typeof dataResponse.result === 'string' ? JSON.parse(dataResponse.result) : dataResponse.result;

      if (type === 'galleries') {
        currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await kvRequest('/set/site_data', 'POST', currentData);
      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
