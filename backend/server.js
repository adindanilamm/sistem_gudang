// ================================================================
// StockFlow - Server Entry Point (HTTP + HTTPS)
// ================================================================
const app = require('./src/app');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const os = require('os');

// Port lama:
// const PORT = process.env.PORT || 3000;
// const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
//
// HP/hotspot pada beberapa perangkat memblokir port 3443, sementara 3000
// sudah terbukti bisa diakses. Karena kamera browser HP butuh HTTPS, HTTPS
// dipindah ke 3000 dan HTTP disediakan di 3001 untuk akses biasa/debug.
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3000;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();

  // IP lama yang sempat terambil:
  // return '192.168.56.1'; // Adapter virtual/Ethernet, biasanya tidak bisa diakses HP lewat Wi-Fi.

  const preferredNames = ['wi-fi', 'wifi', 'wireless', 'wlan'];
  for (const name of Object.keys(interfaces)) {
    if (!preferredNames.some((label) => name.toLowerCase().includes(label))) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}

// Generate self-signed cert jika belum ada
function ensureCert() {
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');
  const localIP = getLocalIP();
  let shouldGenerate = !fs.existsSync(certPath) || !fs.existsSync(keyPath);

  if (!shouldGenerate) {
    try {
      const forge = require('node-forge');
      const cert = forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf8'));
      const san = cert.extensions.find((ext) => ext.name === 'subjectAltName');
      const hasCurrentIP = san && san.altNames && san.altNames.some((alt) => alt.ip === localIP);
      shouldGenerate = !hasCurrentIP;
    } catch (e) {
      shouldGenerate = true;
    }
  }

  if (shouldGenerate) {
    console.log('🔐 Generating self-signed SSL certificate...');
    const forge = require('node-forge');
    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [{ name: 'commonName', value: 'StockFlow Local' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: localIP },
        ]
      }
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    fs.writeFileSync(keyPath, pki.privateKeyToPem(keys.privateKey));
    fs.writeFileSync(certPath, pki.certificateToPem(cert));
    console.log('✅ SSL certificate generated!');
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

// Load or generate SSL cert
const ssl = ensureCert();

// Create servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(ssl, app);

// Socket.IO — attached ke KEDUA server agar scan barcode lintas device
const io = new Server({ cors: { origin: '*' } });
io.attach(httpServer);
io.attach(httpsServer);

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('scan-barcode', (data) => {
    console.log('📡 Barcode received:', data.code);
    socket.broadcast.emit('scanned-barcode', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Start both servers
const ip = getLocalIP();

httpServer.listen(PORT, () => {
  console.log('');
  console.log('✅ StockFlow Server berjalan!');
  console.log('═══════════════════════════════════════════════');
  console.log(`📦 Laptop (HTTP)  : http://localhost:${PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`📱 HP Scan (HTTPS): https://${ip}:${HTTPS_PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('💡 Di HP: Buka link HTTPS → "Lanjutkan/Advanced" → Proceed');
  console.log('');
});
