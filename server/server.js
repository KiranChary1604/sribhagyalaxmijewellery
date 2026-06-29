// server.js – Express API for AURA owner dashboard
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, init, seed, supabase, isConfigured } = require('./db');
const { sendEmail } = require('./email');

// Device verification HMAC-SHA256 settings
const OWNER_DEVICE_SECRET = process.env.OWNER_DEVICE_SECRET || 'sbl-jewellery-default-device-secret-2026';

function generateDeviceToken(deviceId) {
  const payload = JSON.stringify({ deviceId, authorizedAt: Date.now() });
  const signature = crypto.createHmac('sha256', OWNER_DEVICE_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

function verifyDeviceToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  
  const payloadBase64 = parts[0];
  const signature = parts[1];
  
  try {
    const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', OWNER_DEVICE_SECRET).update(payloadStr).digest('hex');
    
    if (signature !== expectedSignature) return false;
    
    const payload = JSON.parse(payloadStr);
    // Valid for 1 year
    const age = Date.now() - payload.authorizedAt;
    if (age > 365 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function generateOtpStateToken(code, email) {
  const hashed = crypto.createHash('sha256').update(code).digest('hex');
  const payload = JSON.stringify({ hashed, email, expiresAt: Date.now() + 5 * 60 * 1000 });
  const signature = crypto.createHmac('sha256', OWNER_DEVICE_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

function verifyOtpStateToken(token, inputCode) {
  if (!token) {
    console.log("[AUTH] verifyOtpStateToken: Failed - ownerOtpState cookie token is missing.");
    return false;
  }
  
  const parts = token.split('.');
  if (parts.length !== 2) {
    console.log("[AUTH] verifyOtpStateToken: Failed - token parts length !== 2");
    return false;
  }
  
  const payloadBase64 = parts[0];
  const signature = parts[1];
  
  try {
    const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', OWNER_DEVICE_SECRET).update(payloadStr).digest('hex');
    
    if (signature !== expectedSignature) {
      console.log("[AUTH] verifyOtpStateToken: Failed - Signature mismatch.");
      return false;
    }
    
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiresAt) {
      console.log("[AUTH] verifyOtpStateToken: Failed - Token expired.");
      return false;
    }
    
    const inputHashed = crypto.createHash('sha256').update(inputCode).digest('hex');
    const match = inputHashed === payload.hashed;
    if (!match) {
      console.log(`[AUTH] verifyOtpStateToken: Failed - Hash mismatch. Input Code: ${inputCode}, Expected Hashed: ${payload.hashed}`);
    } else {
      console.log("[AUTH] verifyOtpStateToken: Successfully verified OTP.");
    }
    return match;
  } catch (err) {
    console.log("[AUTH] verifyOtpStateToken: Exception occurred:", err);
    return false;
  }
}

function requireGate(req, res, next) {
  const isGatePassed = req.cookies && (req.cookies.adminAccessAllowed === 'true' || req.cookies.ownerAuth === 'true');
  if (!isGatePassed) {
    return res.status(401).json({ message: 'Unauthorized: Admin gate access required.' });
  }
  next();
}

// Gold Rate Cache
let goldRateCache = null;
let goldRateCacheTime = 0;
const GOLD_RATE_CACHE_TTL = 60000; // 1 minute in milliseconds

const app = express();
const PORT = process.env.PORT || 5500; // same port as static server for simplicity

// Track blocked IP addresses for device lockout (24 hours)
const blockedIPs = new Map();

// Middleware to block requests from blocked IPs or blocked cookies
function checkBlocked(req, res, next) {
  // 1. Check if blocked cookie is present
  if (req.cookies && req.cookies.adminBlocked === 'true') {
    return res.status(403).json({ message: 'Access Denied: This device is temporarily blocked for 24 hours due to incorrect login credentials.' });
  }

  // 2. Check IP address
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (blockedIPs.has(clientIP)) {
    const blockUntil = blockedIPs.get(clientIP);
    if (Date.now() < blockUntil) {
      const remainingHours = Math.ceil((blockUntil - Date.now()) / (60 * 60 * 1000));
      return res.status(403).json({ message: `Access Denied: This device is temporarily blocked for 24 hours. Try again in ${remainingHours} hour(s).` });
    } else {
      // Block expired
      blockedIPs.delete(clientIP);
    }
  }
  next();
}

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Helper function to decode and save a base64 image (either to Supabase Storage or local fallback)
async function saveBase64Image(base64Data, filenamePrefix, index) {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data; // already a saved url or empty
  }
  
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 input string');
  }
  
  const type = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = type.split('/')[1] || 'png';
  const filename = `${filenamePrefix}_${Date.now()}_${index}.${ext}`;
  
  if (isConfigured) {
    try {
      // Upload to Supabase Storage bucket 'product-images'
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(filename, buffer, {
          contentType: type,
          cacheControl: '3600',
          upsert: false
        });
        
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filename);
        
      return publicUrlData.publicUrl;
    } catch (err) {
      console.error("Failed to upload image to Supabase storage, falling back to local file:", err);
    }
  }
  
  // Fallback to local uploads directory
  try {
    const uploadsDir = path.join(__dirname, '..', 'assets', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const relativePath = `assets/uploads/${filename}`;
    const absolutePath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(absolutePath, buffer);
    return relativePath;
  } catch (err) {
    console.warn("Failed to save image to disk (read-only filesystem?), falling back to storing base64 URL directly:", err.message);
    return base64Data;
  }
}

// Intercept owner dashboard files to hide them from normal customers
app.use((req, res, next) => {
  const urlPath = req.path.toLowerCase();
  
  // 1. First block if client is blacklisted
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const isCookieBlocked = req.cookies && req.cookies.adminBlocked === 'true';
  const isIPBlocked = blockedIPs.has(clientIP) && (Date.now() < blockedIPs.get(clientIP));
  
  if (isCookieBlocked || isIPBlocked) {
    if (urlPath.includes('/owner.html') || urlPath.includes('/owner.js') || urlPath === '/owner' || urlPath === '/owner/') {
      return res.status(403).send('Access Denied: This device is temporarily blocked for 24 hours.');
    }
  }

  // 2. Access control for main owner page/scripts
  if (urlPath.includes('/owner.html') || urlPath.includes('/owner.js') || urlPath === '/owner' || urlPath === '/owner/') {
    // Check gate
    const isGatePassed = req.cookies && (req.cookies.adminAccessAllowed === 'true' || req.cookies.ownerAuth === 'true');
    if (!isGatePassed) {
      return res.status(404).send('Not Found');
    }

    // Serve files directly if gate is passed (to prevent bypassing authentication on static hosting like Vercel)
    if (urlPath === '/owner' || urlPath === '/owner/') {
      return res.redirect('/owner.html');
    }
    if (urlPath.includes('/owner.html')) {
      return res.sendFile(path.resolve(__dirname, '../owner.html'));
    }
    if (urlPath.includes('/owner.js')) {
      return res.sendFile(path.resolve(__dirname, '../owner.js'));
    }
  }
  next();
});

// Secret gate to access the owner portal
app.get('/admin-gate', checkBlocked, (req, res) => {
  const { key } = req.query;
  if (key === 'aura2026') {
    res.cookie('adminAccessAllowed', 'true', { httpOnly: true, maxAge: 2 * 60 * 60 * 1000 }); // 2 hours
    return res.redirect('/owner.html');
  }
  res.status(404).send('Not Found');
});

// Serve static files (the front‑end)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
} else {
  app.use(express.static(path.join(__dirname, '..')));
}

// Simple auth check – owner must have a cookie `ownerAuth=true`
function requireAuth(req, res, next) {
  if (req.cookies && req.cookies.ownerAuth === 'true') {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized: Administrative access required.' });
}

// Initialise DB on server start
init().catch(err => console.error("Failed to initialize database connection:", err));

// Helper for fetching with a timeout to avoid hanging serverless functions
async function fetchWithTimeout(url, options = {}, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// ---------- API ROUTES ---------- //
// Live Gold & Silver Rates API (fetching XAU & XAG price, converting to INR and adding domestic tax/duties)
app.get('/api/gold-rate', async (req, res) => {
  const nowTime = Date.now();
  if (goldRateCache && (nowTime - goldRateCacheTime < GOLD_RATE_CACHE_TTL)) {
    return res.json(goldRateCache);
  }

  try {
    const [goldRes, silverRes] = await Promise.all([
      fetchWithTimeout('https://api.gold-api.com/price/XAU', {}, 4000),
      fetchWithTimeout('https://api.gold-api.com/price/XAG', {}, 4000)
    ]);

    if (!goldRes.ok || !silverRes.ok) {
      throw new Error('Failed to fetch bullion rates from external API');
    }

    const goldData = await goldRes.json();
    const silverData = await silverRes.json();
    
    // Fetch live USDINR rate from dynamic exchange rates API
    let usdINR = 95.38; // fallback exchange rate
    try {
      const exResponse = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 3000);
      if (exResponse.ok) {
        const exData = await exResponse.json();
        if (exData && exData.rates && exData.rates.INR) {
          usdINR = parseFloat(exData.rates.INR);
        }
      }
    } catch (exErr) {
      console.warn("Failed to fetch live USDINR rate, using fallback:", exErr.message);
    }

    // --- GOLD CALCULATION ---
    // 1 Troy Ounce = 31.1034768 Grams
    const pricePerOunceGold = parseFloat(goldData.price);
    const pricePerGramUSDGold = pricePerOunceGold / 31.1034768;
    // Apply USD/INR rate and standard domestic tax + premium factor (approx 1.1803)
    const pricePerGramINRGold = pricePerGramUSDGold * usdINR * 1.1803; 
    
    // Add dynamic second-by-second micro-fluctuations (tick simulator)
    const timeSec = Date.now() / 1000;
    const cycleGold = Math.sin(timeSec * 0.2) * 0.45;
    const noiseGold = (Math.random() - 0.5) * 0.12;
    const finalGoldRate = pricePerGramINRGold + cycleGold + noiseGold;
    
    // Daily change relative to standard baseline of 138.00 USD
    const baselineINRGold = 138.00 * usdINR * 1.1803;
    const changePercentGold = ((finalGoldRate - baselineINRGold) / baselineINRGold * 100).toFixed(2);

    // --- SILVER CALCULATION ---
    const pricePerOunceSilver = parseFloat(silverData.price);
    const pricePerGramUSDSilver = pricePerOunceSilver / 31.1034768;
    // Price per kg in INR: multiply by 1000g, and apply domestic silver premium/tax factor (approx 1.2009)
    const pricePerKgINRSilver = pricePerGramUSDSilver * usdINR * 1000 * 1.2009;

    const cycleSilver = Math.sin(timeSec * 0.15) * 12.5;
    const noiseSilver = (Math.random() - 0.5) * 3.5;
    const finalSilverRate = pricePerKgINRSilver + cycleSilver + noiseSilver;

    // Daily change relative to standard baseline of 65.00 USD per ounce
    const baselineINRSilver = (65.00 / 31.1034768) * usdINR * 1000 * 1.2009;
    const changePercentSilver = ((finalSilverRate - baselineINRSilver) / baselineINRSilver * 100).toFixed(2);
    
    goldRateCache = {
      goldRate: finalGoldRate.toFixed(2),
      goldChange: changePercentGold,
      silverRate: finalSilverRate.toFixed(2),
      silverChange: changePercentSilver,
      currency: "INR",
      goldUnit: "g",
      silverUnit: "kg",
      purity: "24K"
    };
    goldRateCacheTime = nowTime;

    res.json(goldRateCache);
  } catch (err) {
    console.error("Error fetching live bullion rates from API, using fallback:", err);
    // Fallback simulated rates in INR
    let usdINR = 95.38;
    try {
      const exResponse = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 3000);
      if (exResponse.ok) {
        const exData = await exResponse.json();
        if (exData && exData.rates && exData.rates.INR) {
          usdINR = parseFloat(exData.rates.INR);
        }
      }
    } catch (e) {}
    
    const ms = Date.now();
    const fluctuationGold = Math.sin(ms / 2000) * 0.45 + (Math.random() - 0.5) * 0.12;
    const fluctuationSilver = Math.sin(ms / 1500) * 12.5 + (Math.random() - 0.5) * 3.5;

    // Gold fallback calculation
    const baseRateGoldINR = 138.25 * usdINR * 1.1803;
    const currentRateGoldINR = baseRateGoldINR + fluctuationGold;
    
    const baselineINRGold = 138.00 * usdINR * 1.1803;
    const changePercentGold = ((currentRateGoldINR - baselineINRGold) / baselineINRGold * 100).toFixed(2);

    // Silver fallback calculation
    const baseRateSilverINR = (68.00 / 31.1034768) * usdINR * 1000 * 1.2009;
    const currentRateSilverINR = baseRateSilverINR + fluctuationSilver;
    
    const baselineINRSilver = (65.00 / 31.1034768) * usdINR * 1000 * 1.2009;
    const changePercentSilver = ((currentRateSilverINR - baselineINRSilver) / baselineINRSilver * 100).toFixed(2);
    
    goldRateCache = {
      goldRate: currentRateGoldINR.toFixed(2),
      goldChange: changePercentGold,
      silverRate: currentRateSilverINR.toFixed(2),
      silverChange: changePercentSilver,
      currency: "INR",
      goldUnit: "g",
      silverUnit: "kg",
      purity: "24K",
      fallback: true
    };
    goldRateCacheTime = nowTime;

    res.json(goldRateCache);
  }
});

app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT id, name, email, phone, password, isElite, created_at FROM users').all();
    const updatedRows = rows.map(u => ({
      ...u,
      isElite: !!u.isElite
    }));
    res.json(updatedRows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load customers: ' + err.message });
  }
});

app.get('/api/customers/profile', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Customer email is required.' });
    }
    
    const rows = await db.prepare('SELECT id, name, email, phone, password, cart, isElite, created_at FROM users').all();
    const user = rows.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    
    res.json({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      cart: user.cart ? (typeof user.cart === 'string' ? JSON.parse(user.cart) : user.cart) : [],
      isElite: !!user.isElite,
      created_at: user.created_at
    });
  } catch (err) {
    console.error("Error retrieving customer profile:", err);
    res.status(500).json({ message: 'Failed to retrieve customer profile: ' + err.message });
  }
});

app.post('/api/customers/elite', requireAuth, async (req, res) => {
  try {
    const { email, isElite } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Customer email is required.' });
    }
    
    const stmt = db.prepare('UPDATE users SET isElite WHERE email = ?');
    await stmt.run(isElite ? 1 : 0, email.toLowerCase());
    
    // Log action
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Customer ${email} updated: Elite Status = ${isElite ? 'Elite' : 'Standard'}`, 'success')
      .catch(err => console.error("Log error:", err));
      
    res.json({ message: `Customer status updated to ${isElite ? 'SBL Elite' : 'Standard'} Member.` });
  } catch (err) {
    console.error("Error updating customer elite status:", err);
    res.status(500).json({ message: 'Failed to update elite status: ' + err.message });
  }
});

app.get('/api/consultations', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM consultations').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load consultations: ' + err.message });
  }
});

app.post('/api/consultations', async (req, res) => {
  try {
    const { name, email, phone, service, date, time, notes } = req.body;
    if (!name || !email || !phone || !service || !date || !time) {
      return res.status(400).json({ message: 'Missing required consultation details.' });
    }
    
    // Save to DB
    const stmt = db.prepare('INSERT INTO consultations (name, email, phone, service, date, time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    await stmt.run(name, email, phone, service, date, time, notes || '');
    
    // Log activity
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `New consultation booked by ${name}: ${service}`, 'success');
      
    res.json({ message: 'Consultation booked successfully' });
  } catch (err) {
    console.error("Error booking consultation:", err);
    res.status(500).json({ message: 'Failed to book consultation: ' + err.message });
  }
});

app.get('/api/logs', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM logs ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load logs: ' + err.message });
  }
});

// Client Logging Route
app.post('/api/logs', async (req, res) => {
  try {
    const { text, type } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Log text is required' });
    }
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, text, type || 'action');
    res.json({ message: 'Log recorded successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to record log: ' + err.message });
  }
});

// Email Sending Route
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    if (!to) {
      return res.status(400).json({ message: 'Recipient (to) is required.' });
    }
    const result = await sendEmail({ to, subject, text, html });
    res.json(result);
  } catch (err) {
    console.error("Error in /api/send-email:", err);
    res.status(500).json({ message: 'Failed to send email: ' + err.message });
  }
});

app.post('/api/seed', requireAuth, async (req, res) => {
  try {
    await seed();
    res.json({ message: 'Database seeded with default data.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to seed database: ' + err.message });
  }
});

app.delete('/api/customers', requireAuth, async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ message: 'Email or phone required' });
    }
    const stmt = db.prepare('DELETE FROM users WHERE email = ? OR phone = ?');
    const info = await stmt.run(email || null, phone || null);
    
    // Also delete related carts (no-op embedded in users, but kept for compatibility)
    db.prepare('DELETE FROM carts WHERE userId NOT IN (SELECT id FROM users)').run()
      .catch(err => console.error("Cart deletion error:", err));
    
    // Log the action
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Administrator deleted user: ${email || phone}`, 'success')
      .catch(err => console.error("Log error:", err));
      
    res.json({ message: 'User deleted', changes: info.changes });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user: ' + err.message });
  }
});

app.delete('/api/consultations/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const stmt = db.prepare('DELETE FROM consultations WHERE id = ?');
    const info = await stmt.run(id);
    
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Administrator archived consultation booking #${id}`, 'success')
      .catch(err => console.error("Log error:", err));
      
    res.json({ message: 'Consultation deleted', changes: info.changes });
  } catch (err) {
    res.status(500).json({ message: 'Failed to archive consultation: ' + err.message });
  }
});

// ---------- COLLECTIONS API ROUTES ---------- //

// Public: Fetch all collections (seeds defaults if DB is empty)
app.get('/api/collections', async (req, res) => {
  try {
    let rows = await db.prepare('SELECT * FROM collections').all();
    if (!rows || rows.length === 0) {
      const defaults = [
        {
          id: 1,
          title: "Eternity Rings",
          subtitle: "Brilliant solitaires & diamond eternity bands",
          category: "Rings",
          image: "assets/diamond_ring.png"
        },
        {
          id: 2,
          title: "Fine Necklaces",
          subtitle: "22k gold pendants and luxury chokers",
          category: "Necklaces",
          image: "assets/gold_necklace.png"
        },
        {
          id: 3,
          title: "Exquisite Earrings",
          subtitle: "Pearl drops, studs, and diamond hoops",
          category: "Earrings",
          image: "assets/pearl_earrings.png"
        },
        {
          id: 4,
          title: "Luxe Bracelets",
          subtitle: "Emerald cuffs and sparkling tennis chains",
          category: "Bracelets",
          image: "assets/emerald_bracelet.png"
        }
      ];
      for (const d of defaults) {
        await db.prepare('INSERT INTO collections').run(d);
      }
      rows = await db.prepare('SELECT * FROM collections').all();
    }
    res.json(rows);
  } catch (err) {
    console.error("Error fetching collections:", err);
    res.status(500).json({ message: "Failed to load collections: " + err.message });
  }
});

// Admin Only: Add or Update collection
app.post('/api/collections', requireAuth, async (req, res) => {
  try {
    const collectionData = req.body;
    const isEdit = !!collectionData.id;

    // Handle image saving
    if (collectionData.image && collectionData.image.startsWith('data:image/')) {
      collectionData.image = await saveBase64Image(collectionData.image, 'collection', 0);
    } else {
      collectionData.image = collectionData.image || 'assets/diamond_ring.png';
    }

    const formattedCollection = {
      title: collectionData.title,
      subtitle: collectionData.subtitle,
      category: collectionData.category,
      image: collectionData.image
    };

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    if (isEdit) {
      await db.prepare('UPDATE collections SET').run(collectionData.id, formattedCollection);
      
      await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
        .run(timeStr, `Administrator updated collection: ${formattedCollection.title}`, 'success');

      return res.json({ message: 'Collection updated successfully', id: collectionData.id });
    } else {
      await db.prepare('INSERT INTO collections').run(formattedCollection);

      await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
        .run(timeStr, `Administrator added new collection: ${formattedCollection.title}`, 'success');

      return res.json({ message: 'Collection added successfully' });
    }
  } catch (err) {
    console.error("Error saving collection:", err);
    res.status(500).json({ message: 'Failed to save collection: ' + err.message });
  }
});

// Admin Only: Delete collection
app.delete('/api/collections/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    // Get collection title first for logging
    const allCollections = await db.prepare('SELECT * FROM collections').all();
    const collection = allCollections.find(c => c.id === id);
    const title = collection ? collection.title : `#${id}`;

    await db.prepare('DELETE FROM collections WHERE id = ?').run(id);

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Administrator deleted collection: ${title}`, 'success');

    res.json({ message: 'Collection deleted successfully' });
  } catch (err) {
    console.error("Error deleting collection:", err);
    res.status(500).json({ message: 'Failed to delete collection: ' + err.message });
  }
});

// ---------- PRODUCTS API ROUTES ---------- //

// Public: Fetch all products (seeds defaults if DB is empty)
app.get('/api/products', async (req, res) => {
  try {
    let rows = await db.prepare('SELECT * FROM products').all();
    if (!rows || rows.length === 0) {
      const defaults = [
        {
          id: 1,
          name: "Solitaire Diamond Engagement Ring",
          category: "Rings",
          price: 700000,
          material: "Platinum",
          image: "assets/diamond_ring.png",
          rating: 4.9,
          reviews: 28,
          details: "A brilliant round-cut 2.0 carat solitaire diamond set on a polished platinum band of timeless beauty and exceptional purity. Excellent cut, color grade F, clarity VS1.",
          specs: {
            "Stone": "Round Brilliant Diamond",
            "Weight": "2.0 Carat",
            "Metal": "950 Platinum",
            "Setting": "4-Prong Classic"
          },
          purity: "950",
          weight: "2.0 Carat",
          stock: 5,
          status: "Active",
          isFeatured: true,
          isNewArrival: false,
          isBestSeller: true,
          isTrending: true,
          isInStock: true,
          images: ["assets/diamond_ring.png"]
        },
        {
          id: 2,
          name: "Yellow Gold Diamond Pendant",
          category: "Necklaces",
          price: 200000,
          material: "Yellow Gold",
          image: "assets/gold_necklace.png",
          rating: 4.7,
          reviews: 14,
          details: "A modern 18k yellow gold pendant featuring a delicate bar design with micro-pavé set diamonds suspended on a thin, elegant chain.",
          specs: {
            "Stone": "Pavé Diamonds (0.35 ctw)",
            "Metal": "18k Yellow Gold",
            "Length": "18 Inches (adjustable)",
            "Clasp": "Lobster Clasp"
          },
          purity: "18k",
          weight: "0.35 ctw",
          stock: 12,
          status: "Active",
          isFeatured: false,
          isNewArrival: true,
          isBestSeller: false,
          isTrending: false,
          isInStock: true,
          images: ["assets/gold_necklace.png"]
        },
        {
          id: 3,
          name: "Tahitian Pearl Drop Earrings",
          category: "Earrings",
          price: 150000,
          material: "White Gold",
          image: "assets/pearl_earrings.png",
          rating: 4.8,
          reviews: 19,
          details: "Exquisite dark Tahitian pearls (9mm) suspended from micro-pavé encrusted 18k white gold studs. Designed to sway gently with your movement.",
          specs: {
            "Stone": "Tahitian Black Pearls",
            "Accent": "Round Diamonds (0.15 ctw)",
            "Metal": "18k White Gold",
            "Backing": "Push Back"
          },
          purity: "18k",
          weight: "9mm",
          stock: 8,
          status: "Active",
          isFeatured: true,
          isNewArrival: true,
          isBestSeller: true,
          isTrending: false,
          isInStock: true,
          images: ["assets/pearl_earrings.png"]
        },
        {
          id: 4,
          name: "Emerald & Diamond Tennis Bracelet",
          category: "Bracelets",
          price: 1000000,
          material: "Yellow Gold",
          image: "assets/emerald_bracelet.png",
          rating: 5.0,
          reviews: 9,
          details: "An elite statement bracelet featuring alternating round-cut brilliant diamonds and premium vivid green Zambian emeralds in an 18k yellow gold setting.",
          specs: {
            "Stone": "Emeralds (4.0 ct), Diamonds (3.5 ctw)",
            "Metal": "18k Yellow Gold",
            "Length": "7 Inches",
            "Clasp": "Double-Safety Box Clasp"
          },
          purity: "18k",
          weight: "4.0 ct",
          stock: 3,
          status: "Active",
          isFeatured: true,
          isNewArrival: false,
          isBestSeller: false,
          isTrending: true,
          isInStock: true,
          images: ["assets/emerald_bracelet.png"]
        },
        {
          id: 5,
          name: "Gold Filigree Classic Bangle",
          category: "Bangles",
          price: 320000,
          material: "Yellow Gold",
          image: "assets/emerald_bracelet.png",
          rating: 4.8,
          reviews: 12,
          details: "A meticulously crafted 22k yellow gold bangle featuring detailed traditional filigree craftsmanship.",
          specs: {
            "Metal": "22k Yellow Gold",
            "Purity": "22k",
            "Weight": "15.5g",
            "Design": "Traditional Filigree"
          },
          purity: "22k",
          weight: "15.5g",
          stock: 6,
          status: "Active",
          isFeatured: false,
          isNewArrival: true,
          isBestSeller: true,
          isTrending: false,
          isInStock: true,
          images: ["assets/emerald_bracelet.png"]
        }
      ];
      for (const d of defaults) {
        await db.prepare('INSERT INTO products').run(d);
      }
      rows = await db.prepare('SELECT * FROM products').all();
    }
    res.json(rows);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Failed to load products: " + err.message });
  }
});

// Admin Only: Add or Update product (requires Auth cookie)
app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const productData = req.body;
    const isEdit = !!productData.id;

    // Handle image saving (uploading each to Supabase Storage if base64)
    if (productData.images && Array.isArray(productData.images)) {
      const savedPaths = [];
      for (let idx = 0; idx < productData.images.length; idx++) {
        const imgBase64 = productData.images[idx];
        if (!imgBase64 || !imgBase64.startsWith('data:image/')) {
          savedPaths.push(imgBase64); // already saved file path or URL
        } else {
          const savedPath = await saveBase64Image(imgBase64, 'product', idx);
          savedPaths.push(savedPath);
        }
      }
      productData.images = savedPaths;
      productData.image = savedPaths[0] || 'assets/diamond_ring.png';
    } else {
      productData.images = productData.images || [];
      productData.image = productData.image || 'assets/diamond_ring.png';
    }

    // Format specs object cleanly for the customer details tab
    const specs = productData.specs || {};
    specs["Metal"] = productData.material || specs["Metal"] || "";
    specs["Purity"] = productData.purity || specs["Purity"] || "";
    specs["Weight"] = productData.weight || specs["Weight"] || "";

    const formattedProduct = {
      name: productData.name,
      category: productData.category,
      price: 0,
      material: productData.material,
      image: productData.image,
      rating: parseFloat(productData.rating) || 5.0,
      reviews: parseInt(productData.reviews) || 0,
      details: productData.details || "",
      specs: specs,
      purity: productData.purity || "",
      weight: productData.weight || "",
      stock: parseInt(productData.stock) || 0,
      status: productData.status || "Active",
      isFeatured: !!productData.isFeatured,
      isNewArrival: !!productData.isNewArrival,
      isBestSeller: !!productData.isBestSeller,
      isTrending: !!productData.isTrending,
      isInStock: !!productData.isInStock,
      images: productData.images
    };

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    if (isEdit) {
      await db.prepare('UPDATE products SET').run(productData.id, formattedProduct);
      
      await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
        .run(timeStr, `Administrator updated product: ${formattedProduct.name}`, 'success');

      return res.json({ message: 'Product updated successfully', id: productData.id });
    } else {
      await db.prepare('INSERT INTO products').run(formattedProduct);

      await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
        .run(timeStr, `Administrator added new product: ${formattedProduct.name}`, 'success');

      return res.json({ message: 'Product added successfully' });
    }
  } catch (err) {
    console.error("Error saving product:", err);
    res.status(500).json({ message: 'Failed to save product: ' + err.message });
  }
});

// Admin Only: Delete product (requires Auth cookie)
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    // Get product name first for logging efficiently
    let name = `#${id}`;
    if (isConfigured) {
      try {
        const { data } = await supabase.from('products').select('name').eq('id', id).single();
        if (data) name = data.name;
      } catch (err) {
        console.error("Failed to query single product from Supabase:", err);
      }
    } else {
      const allProducts = await db.prepare('SELECT * FROM products').all();
      const product = allProducts.find(p => p.id === id);
      if (product) name = product.name;
    }

    await db.prepare('DELETE FROM products WHERE id = ?').run(id);

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Administrator deleted product: ${name}`, 'success')
      .catch(err => console.error("Log error:", err));

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: 'Failed to delete product: ' + err.message });
  }
});

// Endpoint to set auth cookie after owner login
app.post('/api/login', checkBlocked, async (req, res) => {
  const { username, password } = req.body;
  if (username === 'sbljewellery@gmail.com' && password === 'aura2026') {
    // Refresh the admin access gate cookie for 1 hour to prevent timeouts during OTP verification
    res.cookie('adminAccessAllowed', 'true', { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 1000 });

    // Check if device is trusted
    const deviceToken = req.cookies ? req.cookies.ownerDeviceToken : null;
    const isDeviceTrusted = verifyDeviceToken(deviceToken);
    
    if (isDeviceTrusted) {
      res.cookie('ownerAuth', 'true', { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 });
      return res.json({ status: 'success', message: 'Login successful' });
    }
    
    // Otherwise, generate and send OTP
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const recipient = process.env.SMTP_USER || 'sribhagyalaxmijewellery@gmail.com';
      console.log(`[AUTH] Generated OTP Code: ${code} for recipient: ${recipient}`);
      
      const stateToken = generateOtpStateToken(code, recipient);
      res.cookie('ownerOtpState', stateToken, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 5 * 60 * 1000 // 5 minutes
      });

      const htmlContent = `
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e5dfd5; border-radius: 8px; background-color: #ffffff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);">
          <div style="text-align: center; margin-bottom: 25px;">
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #c5a059; margin: 0; font-size: 24px; font-weight: 500; letter-spacing: 0.05em;">SRI BHAGYA LAXMI JEWELLERY</h2>
            <p style="color: #6e6b64; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 5px; margin-bottom: 0;">Owner Portal Security</p>
          </div>
          <div style="border-top: 1px solid #e5dfd5; padding-top: 25px;">
            <p style="color: #1c1b1a; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">A new device is requesting access to the Sri Bhagya Laxmi Jewellery House Owner Dashboard.</p>
            <p style="color: #6e6b64; font-size: 14px; margin-bottom: 10px;">Please enter the following verification code on the authorization page:</p>
            <div style="background-color: #faf8f5; border: 1px solid #e5dfd5; padding: 20px; border-radius: 4px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #1c1b1a; margin: 25px 0; font-family: monospace;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #6e6b64; line-height: 1.5; margin-top: 20px;">This code is valid for 5 minutes. If you did not initiate this request, you can safely ignore this email.</p>
          </div>
        </div>
      `;

      await sendEmail({
        to: recipient,
        subject: 'SBL Owner Portal - Device Authorization Code',
        text: `SBL Owner Dashboard Device Authorization Code: ${code} (Valid for 5 minutes)`,
        html: htmlContent
      });

      return res.json({ status: 'otp_required', message: 'Verification code sent to registered owner email.' });
    } catch (err) {
      console.error("Error sending device login verification code:", err);
      return res.status(500).json({ message: 'Failed to send verification code: ' + err.message });
    }
  }

  // Failed attempt: block the device for 1 day (24 hours)
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  blockedIPs.set(clientIP, Date.now() + 24 * 60 * 60 * 1000);
  res.cookie('adminBlocked', 'true', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

  res.status(403).json({ message: 'Access Denied: This device has been blocked for 24 hours due to incorrect login credentials.' });
});

// Check if owner is authenticated
app.get('/api/check-auth', requireAuth, (req, res) => {
  res.json({ authenticated: true });
});

// Logout endpoint for owner
app.post('/api/logout', (req, res) => {
  res.clearCookie('ownerAuth');
  res.clearCookie('adminAccessAllowed');
  res.json({ message: 'Logged out successfully' });
});

// Device Authorization - Verify OTP API (after credentials entry)
app.post('/api/login-verify-otp', requireGate, (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Verification code is required.' });
  }

  const otpState = req.cookies ? req.cookies.ownerOtpState : null;
  console.log(`[AUTH] Verifying code: ${code}. Cookie present: ${!!otpState}`);
  const isValid = verifyOtpStateToken(otpState, code);

  if (isValid) {
    // Generate and set device authorization token (1 year)
    const deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const deviceToken = generateDeviceToken(deviceId);
    res.cookie('ownerDeviceToken', deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
    });
    
    // Set owner session cookie (10 minutes)
    res.cookie('ownerAuth', 'true', { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      maxAge: 10 * 60 * 1000 
    });
    
    // Clear temporary OTP state cookie
    res.clearCookie('ownerOtpState');
    
    return res.json({ status: 'success', message: 'Login successful' });
  }

  res.status(400).json({ message: 'Invalid or expired verification code.' });
});

// Device Authorization - Resend OTP API
app.post('/api/login-resend-otp', requireGate, async (req, res) => {
  const otpState = req.cookies ? req.cookies.ownerOtpState : null;
  if (!otpState) {
    return res.status(400).json({ message: 'No active login session found. Please enter your credentials again.' });
  }

  try {
    const parts = otpState.split('.');
    if (parts.length === 2) {
      const payloadStr = Buffer.from(parts[0], 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const recipient = payload.email || 'sribhagyalaxmijewellery@gmail.com';
      console.log(`[AUTH] Resent OTP Code: ${code} for recipient: ${recipient}`);
      
      const newOtpToken = generateOtpStateToken(code, recipient);
      res.cookie('ownerOtpState', newOtpToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000
      });

      const htmlContent = `
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e5dfd5; border-radius: 8px; background-color: #ffffff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);">
          <div style="text-align: center; margin-bottom: 25px;">
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #c5a059; margin: 0; font-size: 24px; font-weight: 500; letter-spacing: 0.05em;">SRI BHAGYA LAXMI JEWELLERY</h2>
            <p style="color: #6e6b64; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 5px; margin-bottom: 0;">Owner Portal Security</p>
          </div>
          <div style="border-top: 1px solid #e5dfd5; padding-top: 25px;">
            <p style="color: #1c1b1a; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">A new device is requesting access to the Sri Bhagya Laxmi Jewellery House Owner Dashboard.</p>
            <p style="color: #6e6b64; font-size: 14px; margin-bottom: 10px;">Your new device verification code is:</p>
            <div style="background-color: #faf8f5; border: 1px solid #e5dfd5; padding: 20px; border-radius: 4px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #1c1b1a; margin: 25px 0; font-family: monospace;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #6e6b64; line-height: 1.5; margin-top: 20px;">This code is valid for 5 minutes.</p>
          </div>
        </div>
      `;

      await sendEmail({
        to: recipient,
        subject: 'SBL Owner Portal - New Device Authorization Code',
        text: `SBL Owner Dashboard Device Authorization Code: ${code} (Valid for 5 minutes)`,
        html: htmlContent
      });

      return res.json({ message: 'A new verification code has been sent to your Gmail.' });
    }
  } catch (err) {
    console.error("Error resending OTP:", err);
  }
  res.status(400).json({ message: 'Failed to resend code. Please try logging in again.' });
});

// Customer Registration API
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user exists
    const users = await db.prepare('SELECT id, name, email, phone, password FROM users').all();
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase() || (phone && u.phone === phone));
    if (exists) {
      return res.status(400).json({ message: 'An account with this email or phone already exists.' });
    }
    // Insert user (store plain-text password for owner dashboard viewing)
    await db.prepare('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)')
      .run(name || 'Guest User', email.toLowerCase(), phone || '', password);

    // Log registration
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `New user registered: ${name || 'Guest User'} (${email})`, 'success');

    res.json({ message: 'Registration successful' });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

// Customer Login API
app.post('/api/login/customer', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Retrieve all users with password hashes and elite status
    const users = await db.prepare('SELECT id, name, email, phone, password, cart, isElite, created_at FROM users').all();
    const user = users.find(u => {
      const matchesEmail = u.email.toLowerCase() === username.toLowerCase();
      const cleanDbPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      const cleanInputPhone = username.replace(/\D/g, '').slice(-10);
      const matchesPhone = cleanDbPhone && cleanInputPhone && cleanDbPhone === cleanInputPhone && cleanInputPhone.length === 10;
      return matchesEmail || matchesPhone;
    });

    if (!user) {
      return res.status(401).json({ message: 'Account not found' });
    }

    // Compare password (supports both plain text and pre-existing bcrypt hash)
    let match = false;
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      try {
        match = bcrypt.compareSync(password, user.password);
      } catch (err) {
        match = (password === user.password);
      }
    } else {
      match = (password === user.password);
    }

    if (!match) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Log login
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `${user.name} signed in successfully.`, 'success');

    // Return profile data (omit password)
    res.json({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      cart: user.cart ? (typeof user.cart === 'string' ? JSON.parse(user.cart) : user.cart) : [],
      isElite: !!user.isElite,
      created_at: user.created_at
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: 'Login failed: ' + err.message });
  }
});

// Check if Email or Phone Exists API
app.post('/api/check-exists', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ message: 'Email or mobile number is required.' });
    }

    const users = await db.prepare('SELECT email, phone FROM users').all();
    const exists = users.some(u => 
      (email && u.email.toLowerCase() === email.toLowerCase()) || 
      (phone && u.phone === phone)
    );

    res.json({ exists });
  } catch (err) {
    console.error("Check exists error:", err);
    res.status(500).json({ message: 'Verification failed: ' + err.message });
  }
});

// Customer Forgot Password (OTP Verification Request) API
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Email or mobile number is required.' });
    }

    // Check if user exists in database
    const users = await db.prepare('SELECT email, name, phone FROM users').all();
    const userRecord = users.find(u => {
      const matchesEmail = u.email.toLowerCase() === username.toLowerCase();
      const cleanDbPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      const cleanInputPhone = username.replace(/\D/g, '').slice(-10);
      const matchesPhone = cleanDbPhone && cleanInputPhone && cleanDbPhone === cleanInputPhone && cleanInputPhone.length === 10;
      return matchesEmail || matchesPhone;
    });

    if (!userRecord) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    // Generate 6‑digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Send actual reset email
    const subject = "Reset Your SBL Jewellery Password";
    const text = `Hello ${userRecord.name || 'User'},\n\nYour password reset verification code is: ${otp}\n\nIf you did not request this, please ignore this email.\n\nThank you,\nSBL Jewellery Team`;
    const html = `<h3>Reset Your Password</h3><p>Hello <strong>${userRecord.name || 'User'}</strong>,</p><p>We received a request to reset your password. Your password reset verification code is:</p><h2 style="color: #c5a059; letter-spacing: 0.1em;">${otp}</h2><p>Please enter this code in the password reset form to set a new password.</p><p>If you did not request this, please ignore this email.</p><br><p>Thank you,<br><strong>SBL Jewellery Team</strong></p>`;

    await sendEmail({ to: userRecord.email, subject, text, html });

    res.json({ message: 'Reset code sent successfully.', otp });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: 'Failed to request reset code: ' + err.message });
  }
});

// Customer Password Reset API
app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find the user record first
    const users = await db.prepare('SELECT email, name, phone FROM users').all();
    const userRecord = users.find(u => {
      const matchesEmail = u.email.toLowerCase() === username.toLowerCase();
      const cleanDbPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      const cleanInputPhone = username.replace(/\D/g, '').slice(-10);
      const matchesPhone = cleanDbPhone && cleanInputPhone && cleanDbPhone === cleanInputPhone && cleanInputPhone.length === 10;
      return matchesEmail || matchesPhone;
    });

    if (!userRecord) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    // Update password in database in plain text
    const stmt = db.prepare('UPDATE users SET password = ? WHERE email = ?');
    const result = await stmt.run(password, userRecord.email);

    // Log password reset
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    await db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)')
      .run(timeStr, `Password reset for user: ${username}`, 'success');

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ message: 'Password reset failed: ' + err.message });
  }
});

// Customer Cart Sync API
app.post('/api/cart/sync', async (req, res) => {
  try {
    const { email, cart } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required to sync cart' });
    }

    // Update user's cart in DB
    await db.prepare('UPDATE users SET cart WHERE email = ?').run(email, cart || []);

    res.json({ message: 'Cart synced successfully' });
  } catch (err) {
    console.error("Cart sync error:", err);
    res.status(500).json({ message: 'Cart sync failed: ' + err.message });
  }
});

// Conditionally listen on port (only if not running as serverless function on Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`AURA owner API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
