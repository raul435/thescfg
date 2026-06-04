const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Local data file path
const DATA_FILE = path.join(process.cwd(), 'data.json');

const getLocalData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading local data:', err);
  }
  return { matches: [], news: [], galleries: { mens: [], womens: [], academy: [], goalkeepers: [] }, registrations: [] };
};

const saveLocalData = (data) => {
  // In Vercel production, the filesystem is read-only.
  if (process.env.VERCEL) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving local data:', err);
  }
};

const sendEmail = async (registration) => {
  const { membership_type, full_name, dob, phone, email } = registration;
  
  console.log('Attempting to send email for registration:', full_name);
  console.log('EMAIL_USER exists:', !!process.env.EMAIL_USER);
  console.log('EMAIL_PASS exists:', !!process.env.EMAIL_PASS);

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials missing (EMAIL_USER/EMAIL_PASS), skipping email.');
    return;
  }

  // SMTP Config for Resend (Professional & Reliable)
  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true, 
    auth: {
      user: "resend", // Always "resend"
      pass: process.env.EMAIL_PASS.trim(), // Your re_... API Key from Vercel
    }
  });

  const mailOptions = {
    from: "onboarding@resend.dev", // Default Resend sender for new accounts
    to: process.env.EMAIL_TO || "raullopez.tscfg@hotmail.com", // Destination email
    subject: `REGISTRATION: ${full_name || 'New User'} - TSCFG`,
    text: `NEW REGISTRATION RECEIVED\n\nName: ${full_name}\nMembership: ${membership_type}\nDOB: ${dob}\nPhone: ${phone}\nEmail: ${email}\nDate: ${new Date().toLocaleString()}`,
    html: `
      <div style="font-family: sans-serif; padding: 10px;">
        <h2 style="color: #C8102E;">New TSCFG Registration</h2>
        <hr>
        <p><strong>Name:</strong> ${full_name}</p>
        <p><strong>Membership:</strong> ${membership_type}</p>
        <p><strong>DOB:</strong> ${dob}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email}</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error in sendMail:', error.message);
    if (error.code === 'EAUTH') {
      console.error('Authentication failed. Please check EMAIL_USER and EMAIL_PASS. Outlook may require "Allow SMTP AUTH" to be enabled in admin settings.');
    }
    throw error;
  }
};

module.exports = async (req, res) => {
  const DB_URL = process.env.KV_REST_API_URL || "https://pure-rabbit-143044.upstash.io";
  const DB_TOKEN = process.env.KV_REST_API_TOKEN || "gQAAAAAAAi7EAAIgcDJjZDJmZjBkNDIwZTk0YzQwYTBhNzlhN2E1NjhmZTkxZA";

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvRequest = async (path, method = 'GET', body = null) => {
    const url = `${DB_URL.replace(/\/$/, '')}${path}`;
    const options = {
      method,
      headers: { 'Authorization': `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000) 
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
    let siteData;
    let usingDB = false;

    try {
      const data = await kvRequest('/get/site_data');
      if (data && data.result) {
        siteData = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        usingDB = true;
      }
    } catch (dbErr) {
      console.warn('Database connection failed, using local storage:', dbErr.message);
      siteData = getLocalData();
    }

    if (!siteData) siteData = getLocalData();

    if (req.method === 'GET') {
      return res.status(200).json(siteData);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string' && body.trim()) body = JSON.parse(body);
      const { type, category, item } = body || {};

      if (type === 'galleries') {
        if (!siteData.galleries) siteData.galleries = {};
        if (!siteData.galleries[category]) siteData.galleries[category] = [];
        siteData.galleries[category].push({ id: Date.now(), ...item });
      } else {
        if (!siteData[type]) siteData[type] = [];
        const newItem = { id: Date.now(), ...item };
        siteData[type].push(newItem);

        if (type === 'registrations') {
          try {
            await sendEmail(item);
          } catch (emailErr) {
            console.error('Email failed:', emailErr.message);
            // We'll return the error message so the user can see it in the alert
            return res.status(200).json({ 
              success: true, 
              emailError: emailErr.message,
              note: 'Registration saved, but email failed.' 
            });
          }
        }
      }

      saveLocalData(siteData);

      if (usingDB) {
        try {
          await kvRequest('/set/site_data', 'POST', siteData);
        } catch (e) {
          console.error('Failed to update DB after update');
        }
      }

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { type, category, id } = req.query;

      if (type === 'galleries') {
        if (siteData.galleries && siteData.galleries[category]) {
          siteData.galleries[category] = siteData.galleries[category].filter(i => i.id.toString() !== id.toString());
        }
      } else {
        if (siteData[type]) {
          siteData[type] = siteData[type].filter(i => i.id.toString() !== id.toString());
        }
      }

      saveLocalData(siteData);

      if (usingDB) {
        try {
          await kvRequest('/set/site_data', 'POST', siteData);
        } catch (e) {
          console.error('Failed to update DB after delete');
        }
      }

      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
