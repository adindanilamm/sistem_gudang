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
