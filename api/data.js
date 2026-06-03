const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Detect all possible names Vercel might be using
  const DB_URL = process.env.TSCFG_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const DB_TOKEN = process.env.TSCFG_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // Logging for Vercel Dashboard (visible in Logs tab)
  console.log('--- DB CONFIG CHECK ---');
  console.log('TSCFG_URL present:', !!process.env.TSCFG_URL);
  console.log('TSCFG_TOKEN present:', !!process.env.TSCFG_TOKEN);
  console.log('KV_URL present:', !!process.env.KV_REST_API_URL);
  console.log('Final URL used:', DB_URL ? DB_URL.substring(0, 15) + '...' : 'NONE');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DB_URL || !DB_TOKEN) {
    return res.status(500).json({ 
      error: "Database configuration incomplete", 
      details: "Vercel is not passing the environment variables. Please check Settings -> Environment Variables and click REDEPLOY in the Deployments tab." 
    });
  }

  const kvRequest = async (path, method = 'GET', body = null) => {
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
    return response.json();
  };

  try {
    if (req.method === 'GET') {
      const raw = await kvRequest('/get/site_data');
      let data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.result) {
        data = { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
        await kvRequest('/set/site_data', 'POST', data);
        return res.status(200).json(data);
      }
      const finalResult = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      return res.status(200).json(finalResult);
    }

    if (req.method === 'POST') {
      const raw = await kvRequest('/get/site_data');
      let currentData = raw.result;
      currentData = typeof currentData === 'string' ? JSON.parse(currentData) : (currentData || { matches: [], news: [], galleries: {}, registrations: [] });
      
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
      let currentData = typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result;

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
