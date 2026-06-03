const fs = require('fs');
const path = require('path');

// Universal detection for Vercel KV / Upstash
const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async (req, res) => {
  // Diagnostic headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      throw new Error("Missing Database Credentials. Please check Environment Variables in Vercel (KV_REST_API_URL and KV_REST_API_TOKEN).");
    }

    const kvRequest = async (endpoint, options = {}) => {
      const response = await fetch(`${KV_REST_API_URL}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`DB Error (${response.status}): ${text}`);
      }
      return response.json();
    };

    if (req.method === 'GET') {
      const data = await kvRequest('/get/site_data');
      let result = data.result;
      if (!result) {
        // Initialize if empty
        result = { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
        await kvRequest('/set/site_data', { method: 'POST', body: JSON.stringify(result) });
      }
      return res.status(200).json(typeof result === 'string' ? JSON.parse(result) : result);
    }

    if (req.method === 'POST') {
      const dataResponse = await kvRequest('/get/site_data');
      let currentData = dataResponse.result;
      currentData = typeof currentData === 'string' ? JSON.parse(currentData) : (currentData || { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] });

      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const { type, category, item } = body;

      if (type === 'galleries') {
        if (!currentData.galleries[category]) currentData.galleries[category] = [];
        currentData.galleries[category].push({ id: Date.now(), ...item });
      } else {
        if (!currentData[type]) currentData[type] = [];
        currentData[type].push({ id: Date.now(), ...item });
      }

      await kvRequest('/set/site_data', { method: 'POST', body: JSON.stringify(currentData) });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { type, category, id } = req.query;
      const dataResponse = await kvRequest('/get/site_data');
      let currentData = JSON.parse(dataResponse.result);

      if (type === 'galleries') {
        currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await kvRequest('/set/site_data', { method: 'POST', body: JSON.stringify(currentData) });
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error('API CRASH:', err);
    return res.status(500).json({ error: err.message });
  }
};
