const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const itemRoutes = require('./routes/itemRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const barcodeRoutes = require('./routes/barcodeRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// ================================================================
// Auto-redirect HTTP → HTTPS untuk akses dari HP (non-localhost)
// Kamera memerlukan secure context (HTTPS). Tanpa redirect ini,
// HP akan mendapat blank page atau kamera tidak berfungsi.
// ================================================================
app.use((req, res, next) => {
  const host = req.hostname || req.headers.host;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const isHTTPS = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const isTunnelHost = /trycloudflare\.com$|ngrok-free\.app$|loca\.lt$/i.test(host);

  if (!isLocalhost && !isHTTPS && !isTunnelHost) {
    const httpsPort = process.env.HTTPS_PORT || 3443;
    const httpsUrl = `https://${host}:${httpsPort}${req.originalUrl}`;
    return res.redirect(301, httpsUrl);
  }
  next();
});

// Browser debugging log endpoint
app.post('/api/log', (req, res) => {
  console.log('🖥️ [Browser Log]:', req.body.log);
  res.sendStatus(200);
});


// ================================================================
// Static Files (Frontend)
// ================================================================
// app.js berada di dalam /src, sehingga frontend ada di ../../frontend
app.use(express.static(path.join(__dirname, '../../frontend')));

// ================================================================
// API Routes
// ================================================================
app.use('/api', authRoutes); // Di dalam authRoutes sudah ada /login
app.use('/api/users', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barcode', barcodeRoutes);

// ================================================================
// Fallback: SPA (Single Page Application)
// Semua request selain API diarahkan ke index.html
// ================================================================
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// 404 Handler khusus API agar me-return JSON, bukan HTML bawaan Express
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
