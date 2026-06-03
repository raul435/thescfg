const fs = require('fs');
const path = require('path');

/**
 * Robustly identify and map Redis/KV credentials
 */
function getCredentials() {
  // 1. Check standard Vercel KV / Upstash REST variables
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // 2. If missing, try to derive from REDIS_URL (which often has the token)
  const redisUrl = process.env.REDIS_URL || "";
  if ((!url || !token) && redisUrl.startsWith('redis://')) {
    try {
      // redis://default:TOKEN@HOST:PORT
      const parts = redisUrl.split('@');
      const auth = parts[0].replace('redis://', '').split(':');
      const password = auth.length > 1 ? auth[1] : auth[0];
      const hostPort = parts[1].split(':');
      const host = hostPort[0];
      
      // If it looks like an Upstash host, map it to the REST host
      if (host.endsWith('.db.redis.io')) {
        url = `https://${host.replace('.db.redis.io', '.upstash.io')}`;
        token = password;
      }
    } catch (e) {
      console.error('Failed to parse REDIS_URL:', e);
    }
  }

  return { url, token };
}

module.exports = async (req, res) => {
  const { url: KV_REST_API_URL, token: KV_REST_API_TOKEN } = getCredentials();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      throw new Error("Missing Database Credentials. Please ensure KV_REST_API_URL and KV_REST_API_TOKEN are set in Vercel.");
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
      if (typeof body === 'string' && body.trim()) body = JSON.parse(body);
      
      const { type, category, item } = body || {};
      if (!type || !item) return res.status(400).json({ error: 'Invalid data' });

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
      let currentData = typeof dataResponse.result === 'string' ? JSON.parse(dataResponse.result) : dataResponse.result;

      if (type === 'galleries') {
        currentData.galleries[category] = currentData.galleries[category].filter(i => i.id.toString() !== id.toString());
      } else if (currentData[type]) {
        currentData[type] = currentData[type].filter(i => i.id.toString() !== id.toString());
      }

      await kvRequest('/set/site_data', { method: 'POST', body: JSON.stringify(currentData) });
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
