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

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }

  return addresses;
}

// Pilih IP yang paling mungkin bisa diakses device lain.
// Adapter virtual seperti VirtualBox biasanya tidak bisa dipakai untuk teman beda jaringan.
function getLocalIP() {
  const addresses = getLocalIPs();
  const wifi = addresses.find((iface) => /wi-?fi|wireless/i.test(iface.name));
  return (wifi || addresses[0] || { address: '127.0.0.1' }).address;
}

function ensureCert() {
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');
  const localIP = getLocalIP();
  const localIPs = getLocalIPs().map((iface) => iface.address);
  let shouldGenerate = !fs.existsSync(certPath) || !fs.existsSync(keyPath);

  if (!shouldGenerate) {
    try {
      const forge = require('node-forge');
      const cert = forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf8'));
      const san = cert.extensions.find((ext) => ext.name === 'subjectAltName');
      const certIPs = san && san.altNames ? san.altNames.map((alt) => alt.ip).filter(Boolean) : [];
      shouldGenerate = !localIPs.every((ip) => certIPs.includes(ip));
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
          ...localIPs.map((ip) => ({ type: 7, ip })),
          { type: 7, ip: localIP },
        ],
      },
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

const ssl = ensureCert();
const httpServer = http.createServer(app);
const httpsServer = https.createServer(ssl, app);

// Socket.IO attached ke kedua server agar scan barcode lintas device tetap jalan.
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

const ip = getLocalIP();

httpServer.listen(PORT, HOST, () => {
  console.log('');
  console.log('✅ StockFlow Server berjalan!');
  console.log('═══════════════════════════════════════════════');
  console.log(`📦 Laptop (HTTP)        : http://localhost:${PORT}`);
  console.log(`🌐 Jaringan lokal HTTP  : http://${ip}:${PORT}`);
  if (PUBLIC_URL) console.log(`🔗 Public Tunnel        : ${PUBLIC_URL}`);
});

httpsServer.listen(HTTPS_PORT, HOST, () => {
  console.log(`📱 HP satu Wi-Fi HTTPS  : https://${ip}:${HTTPS_PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('💡 Beda jaringan: gunakan tunnel publik, contoh: ngrok http 3000');
  console.log('💡 Kamera HP aman lewat HTTPS tunnel publik atau HTTPS lokal.');
  console.log('');
});
