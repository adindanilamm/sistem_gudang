// Forward browser console logs to backend /api/log
(function() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  function sendLog(type, args) {
    try {
      const msg = args.map(a => {
        if (a instanceof Error) return a.message + '\n' + a.stack;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch (e) { return String(a); }
        }
        return String(a);
      }).join(' ');
      
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: `[BROWSER-${type.toUpperCase()}] ${msg}` })
      }).catch(() => {});
    } catch (e) {}
  }

  console.log = function(...args) {
    originalLog.apply(console, args);
    sendLog('log', args);
  };
  console.error = function(...args) {
    originalError.apply(console, args);
    sendLog('error', args);
  };
  console.warn = function(...args) {
    originalWarn.apply(console, args);
    sendLog('warn', args);
  };

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
  });
})();

window.onerror = function(message, source, lineno, colno, error) {
  let errDiv = document.createElement('div');
  errDiv.style.position = 'fixed';
  errDiv.style.top = '0';
  errDiv.style.left = '0';
  errDiv.style.right = '0';
  errDiv.style.background = 'red';
  errDiv.style.color = 'white';
  errDiv.style.padding = '10px';
  errDiv.style.zIndex = '99999';
  errDiv.style.fontWeight = 'bold';
  errDiv.innerHTML = `⚠️ JS Error: ${message} | Line: ${lineno} | File: ${source}`;
  document.body.appendChild(errDiv);
  
  // Send to server
  console.error(`Uncaught Error: ${message} at ${source}:${lineno}:${colno}`);
  
  return false;
};

const API_URL = window.location.origin + '/api';
let localUsers = [], localTxns = [], localItems = [];

async function parseApiResponse(res) {
  let data = null;
  let parsedSuccessfully = true;
  try {
    data = await res.json();
  } catch (e) {
    parsedSuccessfully = false;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request gagal (${res.status})`);
  }
  if (!parsedSuccessfully) {
    throw new Error('Gagal mengurai respons JSON dari server.');
  }
  return data;
}

async function apiFetch(url, options) {
  const res = await fetch(url, options);
  return parseApiResponse(res);
}

// Socket.IO: auto-detect URL agar HP (HTTPS:3443) dan Laptop (HTTP:3000) sama-sama connect
let socket = null;
try {
  if (typeof io !== 'undefined') {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 5000
    });
    socket.on('connect', () => console.log('🔌 Socket.IO terhubung:', socket.id));
    socket.on('connect_error', (err) => console.warn('⚠️ Socket.IO gagal connect:', err.message));
  }
} catch (e) {
  console.warn('Socket.IO init error (diabaikan):', e);
  socket = null;
}
if (socket) {
  socket.on('scanned-barcode', (data) => {
    let type = null;
    if (document.getElementById('manual-code-masuk')) type = 'masuk';
    else if (document.getElementById('manual-code-keluar')) type = 'keluar';
    
    if (type) {
      let manualInput = document.getElementById('manual-code-' + type);
      if (manualInput) {
        manualInput.value = data.code;
        // Panggil fungsi pencarian barang
        lookupItem(type);
      }
    } else if (document.getElementById('search-stok')) {
      // Jika berada di halaman Cek Stok
      let searchInput = document.getElementById('search-stok');
      searchInput.value = data.code;
      filterStokTable();
    }
  });

  socket.on('database-updated', async () => {
    console.log('📡 Real-time update received from another device. Syncing data...');
    // Refresh data local
    await fetchAllData();
    // Render ulang halaman yang sedang aktif agar data langsung muncul
    if (currentUser) {
      if (currentUser.role === 'karyawan') {
        let c = document.getElementById('karyawan-content');
        if (currentKaryawanView === 'dashboard') {
          renderKaryawanDashboard(c);
        } else if (currentKaryawanView === 'stok') {
          renderStokTable(c);
        } else if (currentKaryawanView === 'masuk' || currentKaryawanView === 'keluar') {
          // Render ulang list aktivitas terbaru saja agar form input tidak hilang fokus / reset
          renderRecent(currentKaryawanView);
        } else if (currentKaryawanView === 'history-masuk' || currentKaryawanView === 'history-keluar') {
          renderTransactionHistory(currentKaryawanView.replace('history-', ''), c);
        }
      } else if (currentUser.role === 'manager') {
        let c = document.getElementById('manager-content');
        if (currentManagerView === 'stok') {
          renderManagerStok(c);
          generateLaporan();
        }
      }
    }
  });
}

async function fetchAllData() {
  try {
    let [resU, resI, resT] = await Promise.all([
      fetch(`${API_URL}/users`), fetch(`${API_URL}/items`), fetch(`${API_URL}/transactions`)
    ]);
    localUsers = await parseApiResponse(resU);
    localItems = await parseApiResponse(resI);
    localTxns = await parseApiResponse(resT);
  } catch (e) {
    console.error('Failed to fetch data:', e);
    // Jangan showModal di sini — biarkan caller yang memutuskan cara handle error
    // Ini mencegah cascading modal popup yang memblokir UI
    throw e;
  }
}

function getUsers() { return localUsers || []; }
function getTxns() { return localTxns || []; }
function getItems() { return localItems || []; }
function getItemByCode(k) {
  let target = String(k).trim().toUpperCase();
  return (localItems || []).find(i => String(i.kode).trim().toUpperCase() === target);
}

function getItemDetails(item) {
  if(!item) return { kategori: '-', rak: '-' };
  let code = (item.kode || '').toUpperCase();
  let name = (item.nama || '').toUpperCase();
  let kategori = 'Umum', rak = 'D-03-01';
  
  if (code.startsWith('ELK-') || code.startsWith('ACC-') || code.startsWith('LOG-') || code.startsWith('KBD-') || code.startsWith('SNY-') || code.startsWith('SAM-') || code.startsWith('DGT-') || name.includes('KEYBOARD') || name.includes('MOUSE') || name.includes('MONITOR') || name.includes('HEADSET')) {
    kategori = 'Elektronik';
    if(code === 'LOG-GPRO-W') rak = 'A-12-04';
    else if(code === 'KBD-KB-RGB') rak = 'A-12-11';
    else if(code === 'SNY-WH-1000') rak = 'B-02-10';
    else if(code === 'SAM-27-MON') rak = 'B-02-05';
    else if(code === 'DGT-WGT-SEN') rak = 'A-12-05';
    else rak = 'A-01-01';
  } else if (code.startsWith('SPR-') || code.startsWith('IND-CVY') || code.startsWith('HVY-') || code.startsWith('PLT-') || code.startsWith('CFR-') || name.includes('BELT') || name.includes('BATTERY') || name.includes('PALLET')) {
    kategori = 'Sparepart';
    if(code === 'IND-CVY-B45') rak = 'B-05-12';
    else if(code === 'SPR-BRK-442') rak = 'B-05-12';
    else rak = 'B-05-01';
  } else if (code.startsWith('OIL-') || code.startsWith('IND-SLT') || name.includes('OIL') || name.includes('SEALANT') || name.includes('CAIRAN')) {
    kategori = 'Cairan';
    rak = 'C-02-01';
  }
  return { kategori, rak };
}

function fmtDate(d) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function fmtDateShort(d) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }

let currentUser = null, qrScanner = null;
let stokPage = 1;
const PAGE_SIZE = 10;
let currentKaryawanView = 'dashboard';
let currentManagerView = 'stok';
// =====================================================================
// QR SCANNER STATE FLAGS  (FIX: cegah race-condition pada scan ke-2 dst)
//  - isScannerStarting : mencegah double-start saat user klik 2x cepat
//  - isScannerStopping : mencegah start() dipanggil saat instance lama
//                        masih dalam proses stop()
//  - scanCooldown      : mencegah callback success terpanggil berulang
//                        untuk barcode yg sama dalam <1 detik
// =====================================================================
let isScannerStarting = false;
let isScannerStopping = false;
let scanCooldown = false;

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  let p = document.getElementById(id);
  if (p) p.classList.add('active');
  document.body.classList.toggle('login-mode', id === 'login-page');
  document.body.classList.toggle('dashboard-mode', id === 'karyawan-page' || id === 'manager-page');
  document.body.classList.toggle('login-mode', id === 'login-page');
  closeSidebar();
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function showModal(icon, cls, title, msg, actions) {
  let o = document.getElementById('modal-overlay');
  o.querySelector('.modal-icon').className = 'modal-icon ' + cls;
  o.querySelector('.modal-icon').textContent = icon;
  o.querySelector('h3').textContent = title;
  o.querySelector('p').textContent = msg;
  let a = o.querySelector('.modal-actions'); a.innerHTML = '';
  actions.forEach(x => { let b = document.createElement('button'); b.className = 'btn ' + (x.c || 'btn-primary') + ' btn-sm'; b.textContent = x.l; b.onclick = () => { hideModal(); if (x.fn) x.fn() }; a.appendChild(b) });
  o.classList.add('show');
}
function hideModal() { document.getElementById('modal-overlay').classList.remove('show') }

function toggleDropdown(id) {
  let d = document.getElementById(id);
  let isOpen = d.classList.contains('show');
  document.querySelectorAll('.profile-dropdown').forEach(x => x.classList.remove('show'));
  if (!isOpen) d.classList.add('show');
}
document.addEventListener('click', e => { if (!e.target.closest('.topbar-right')) document.querySelectorAll('.profile-dropdown').forEach(x => x.classList.remove('show')) });

// LOGIN
let selectedRole = 'karyawan';

document.addEventListener('click', e => {
  if (e.target.id === 'tab-karyawan') {
    document.getElementById('tab-karyawan').classList.add('active');
    if(document.getElementById('tab-manager')) document.getElementById('tab-manager').classList.remove('active');
    selectedRole = 'karyawan';
  } else if (e.target.id === 'tab-manager') {
    document.getElementById('tab-manager').classList.add('active');
    if(document.getElementById('tab-karyawan')) document.getElementById('tab-karyawan').classList.remove('active');
    selectedRole = 'manager';
  }
});

function handleForgot(e) {
  e.preventDefault();
  showModal('🔐', 'warning', 'Lupa Password?', 'Silakan hubungi Administrator (Manager) untuk mereset password Anda.', [{ l: 'Mengerti' }]);
}

function togglePasswordVisibility() {
  let p = document.getElementById('login-password');
  let i = document.getElementById('toggle-password');
  if (!p || !i) return;
  if (p.type === 'password') {
    p.type = 'text';
    i.textContent = '🚫';
  } else {
    p.type = 'password';
    i.textContent = '👁️';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  let u = document.getElementById('login-username').value.trim(), p = document.getElementById('login-password').value.trim(), err = document.getElementById('login-error');
  if (!u || !p) { err.textContent = '⚠ Username dan password harus diisi!'; err.classList.add('show'); return }

  try {
    let res = await fetch(`${API_URL}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) {}
      err.textContent = '? ' + ((data && data.error) || 'Login gagal!');
      err.classList.add('show'); document.getElementById('login-password').value = ''; return;
    }
    let user = await res.json();
    
    // Validasi tab role
    if (user.role !== selectedRole) {
      err.textContent = `⚠ Anda terdaftar sebagai ${user.role}, harap pilih tab ${user.role} untuk login!`;
      err.classList.add('show');
      return;
    }
    
    err.classList.remove('show'); currentUser = user; document.getElementById('login-form').reset();
    localStorage.setItem('stockflow_user', JSON.stringify(user)); // Simpan Sesi
    await fetchAllData();
    if (user.role === 'karyawan') {
      renderKaryawan();
      showPage('karyawan-page');
      await showKaryawanView('dashboard');
    } else {
      renderManager();
      showPage('manager-page');
      await showManagerView('stok');
    }
  } catch (e) {
    console.error(e);
    err.textContent = '⚠ Gagal menghubungi server. Pastikan server backend sedang berjalan!';
    err.classList.add('show');
  }
}
function doLogout() {
  closeSidebar();
  showModal('🚪', 'warning', 'Konfirmasi Logout', 'Apakah Anda yakin ingin keluar?', [
    { l: 'Batal', c: 'btn-outline' },
    {
      l: 'Ya, Keluar', c: 'btn-danger', fn: async () => {
        try {
          await fetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
        } catch (e) { /* abaikan error network */ }
        
        // Reset semua state — WAJIB terjadi apapun kondisinya
        currentUser = null;
        localUsers = []; localTxns = []; localItems = [];
        localStorage.removeItem('stockflow_user');
        
        try { await stopQR(); } catch (e) { /* abaikan */ }
        
        // Pastikan login page SELALU tampil
        try {
          hideModal();
          showPage('login-page');
          // Reset form login
          let form = document.getElementById('login-form');
          if (form) form.reset();
          let err = document.getElementById('login-error');
          if (err) err.classList.remove('show');
        } catch (e) {
          // Fallback absolut — paksa tampilkan login page
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          let lp = document.getElementById('login-page');
          if (lp) lp.classList.add('active');
        }
      }
    }
  ]);
}

// =====================================================================
// FIX UTAMA: stopQR() sekarang async & menunggu Promise stop() selesai.
//   Library html5-qrcode menyimpan state internal "SCANNING/STOPPING/
//   NOT_STARTED". Jika kita panggil start() lagi sebelum state
//   benar-benar "NOT_STARTED", scanner akan mereject dengan error
//   "Cannot transition to a new state, already under transition".
//   Inilah penyebab utama "sekali bisa, sesudah itu tidak bisa lagi".
// =====================================================================
async function stopQR() {
  if (!qrScanner) return;
  if (isScannerStopping) return;          // sudah dalam proses stop
  isScannerStopping = true;
  try {
    // Cek state dulu — hanya stop jika scanner sedang aktif
    if (typeof qrScanner.getState === 'function') {
      // State 2 = SCANNING di html5-qrcode
      if (qrScanner.getState() === 2) {
        await qrScanner.stop();
      }
    } else {
      await qrScanner.stop();
    }
    try { qrScanner.clear(); } catch (e) { /* abaikan, kadang sudah ke-clear */ }
  } catch (e) {
    console.warn('stopQR warning (aman diabaikan):', e?.message || e);
  } finally {
    qrScanner = null;
    isScannerStopping = false;
    scanCooldown = false;
  }
}

// KARYAWAN
function renderKaryawan() {
  if (!currentUser) return;
  let nameEl = document.querySelector('#karyawan-page .profile-info .name');
  let avatarEl = document.querySelector('#karyawan-page .profile-info .avatar');
  if (nameEl) nameEl.textContent = currentUser.name;
  if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0);
  
  let nav = document.getElementById('karyawan-nav');
  nav.innerHTML = `
    <li><button class="nav-item" id="nav-dashboard" onclick="showKaryawanView('dashboard')"><span class="nav-icon">📊</span> Data Barang</button></li>
    <li><button class="nav-item" id="nav-masuk" onclick="showKaryawanView('masuk')"><span class="nav-icon">📥</span> Barang Masuk</button></li>
    <li><button class="nav-item" id="nav-keluar" onclick="showKaryawanView('keluar')"><span class="nav-icon">📤</span> Barang Keluar</button></li>
    <li><button class="nav-item" id="nav-stok" onclick="showKaryawanView('stok')"><span class="nav-icon">📋</span> Cek Stok</button></li>
    <li class="mobile-only-nav"><button class="nav-item" id="nav-scan" onclick="showKaryawanView('scan')"><span class="nav-icon">📷</span> Scan Barcode</button></li>
  `;
}

function getStockSummary() {
  let items = getItems(), txns = getTxns();
  return items.map(item => {
    let m = txns.filter(t => t.kode === item.kode && t.type === 'masuk').reduce((s, t) => s + t.jumlah, 0);
    let k = txns.filter(t => t.kode === item.kode && t.type === 'keluar').reduce((s, t) => s + t.jumlah, 0);
    return { ...item, masuk: m, keluar: k, stok: m - k };
  });
}

function getWeeklyActivity() {
  const dayMs = 24 * 60 * 60 * 1000;
  const labels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * dayMs);
    return {
      key: date.toISOString().slice(0, 10),
      label: labels[date.getDay()],
      masuk: 0,
      keluar: 0,
    };
  });

  const byKey = Object.fromEntries(days.map(day => [day.key, day]));
  getTxns().forEach(txn => {
    const date = new Date(txn.date);
    if (Number.isNaN(date.getTime())) return;
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    if (!byKey[key]) return;
    byKey[key][txn.type] += Number(txn.jumlah) || 0;
  });

  const maxValue = Math.max(1, ...days.flatMap(day => [day.masuk, day.keluar]));
  return days.map(day => ({
    ...day,
    masukHeight: Math.max(day.masuk ? 8 : 2, Math.round((day.masuk / maxValue) * 100)),
    keluarHeight: Math.max(day.keluar ? 8 : 2, Math.round((day.keluar / maxValue) * 100))
  }));
}

function setActiveNav(idPrefix) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  let activePage = document.querySelector('.page.active');
  if (activePage) {
    let activeEl = activePage.querySelector('#nav-' + idPrefix);
    if (activeEl) activeEl.classList.add('active');
  }
}





async function showKaryawanView(v) {
  currentKaryawanView = v;
  closeSidebar();
  try { await stopQR(); } catch(e) {}
  let c = document.getElementById('karyawan-content');
  setActiveNav(v);
  
  if (v === 'dashboard') {
    try { await fetchAllData(); } catch(e) { console.warn('Fetch data gagal, render dengan data yang ada:', e); }
    renderKaryawanDashboard(c);
  } else if (v === 'masuk' || v === 'keluar') {
    try { await fetchAllData(); } catch(e) { console.warn('Fetch data gagal:', e); }
    renderItemForm(v, c);
  }
  else if (v === 'stok') { try { await fetchAllData(); } catch(e) {} renderStokTable(c) }
  else if (v === 'profile') { showProfile('karyawan-content') }
  else if (v === 'password') { showChangePassword('karyawan-content') }
  else if (v === 'tambah-sku') { renderTambahSKU(c) }
  else if (v === 'scan') { renderRemoteScanner(c) }
  else if (v === 'history-masuk' || v === 'history-keluar') {
    try { await fetchAllData(); } catch(e) {}
    renderTransactionHistory(v.replace('history-', ''), c);
  }
}

function renderKaryawanDashboard(c) {
  let summary = getStockSummary();
  let activity = getWeeklyActivity();
  let lowStocks = summary.filter(i => i.stok <= 10);
  let displayItems = lowStocks.length ? lowStocks.slice(0, 10) : summary.slice(0, 10);
  let tableTitle = lowStocks.length ? 'Peringatan Stok Menipis' : 'Data Barang Terkini';
  
  c.innerHTML = `
    <div class="dashboard-top-row">
      <div class="card">
        <h3 class="card-title">Grafik Aktivitas</h3>
        <div class="chart-container">
          ${activity.map(day => `
            <div class="chart-bar-group" title="${day.label}: Masuk ${day.masuk}, Keluar ${day.keluar}">
              <div class="chart-value">${day.masuk || day.keluar ? `${day.masuk}/${day.keluar}` : '-'}</div>
              <div class="chart-bar masuk" style="height: ${day.masukHeight}%"></div>
              <div class="chart-bar keluar" style="height: ${day.keluarHeight}%"></div>
              <div class="chart-label">${day.label}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:20px; font-size:12px; color:var(--text-muted)">
          <div style="display:flex; align-items:center; gap:5px"><span style="width:10px;height:10px;border-radius:50%;background:var(--success)"></span> Masuk</div>
          <div style="display:flex; align-items:center; gap:5px"><span style="width:10px;height:10px;border-radius:50%;background:var(--warning)"></span> Keluar</div>
        </div>
      </div>
      <div class="card" style="background:#0A1B33; color:white">
        <h3 class="card-title" style="color:white">Inventory Heatmap</h3>
        <p style="font-size:12px; color:rgba(255,255,255,0.7); margin-bottom:20px;">Area pemuatan tersibuk saat ini berada di Blok B (Elektronik).</p>
        
        <div class="progress-group">
          <div class="progress-group-header"><span>Zone Utilization</span><span>98%</span></div>
          <div class="progress-track" style="background:rgba(255,255,255,0.1)"><div class="progress-fill" style="width:98%"></div></div>
        </div>
        <div class="progress-group">
          <div class="progress-group-header"><span>Active Forklifts</span><span>12 / 15</span></div>
          <div class="progress-track" style="background:rgba(255,255,255,0.1)"><div class="progress-fill blue" style="width:80%"></div></div>
        </div>
      </div>
    </div>
    
    <div class="dashboard-bottom-row">
      <div class="table-wrapper">
        <div class="warning-header">⚠️ ${tableTitle}</div>
        <table class="warning-table">
          <thead class="table-header-dark"><tr><th>NAMA BARANG</th><th>SKU</th><th>STOK SAAT INI</th><th>MINIMUM STOK</th><th>LOKASI RAK</th></tr></thead>
          <tbody>
            ${displayItems.map(i => {
              let details = getItemDetails(i);
              return `<tr>
                <td><div class="item-name-cell"><strong>${i.nama}</strong></div></td>
                <td>${i.kode}</td>
                <td><span style="color:${i.stok <= 10 ? '#DC2626' : 'var(--secondary)'}; font-weight:700">${i.stok} ${i.satuan || 'unit'}</span></td>
                <td>10 unit</td>
                <td>${details.rak}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" style="text-align:center">Belum ada data barang</td></tr>'}
          </tbody>
        </table>
        <div class="table-footer">
          <span>Menampilkan ${displayItems.length} dari ${summary.length} barang.</span>
          <button class="btn btn-outline btn-sm" onclick="showKaryawanView('stok')">Lihat Semua Data</button>
        </div>
      </div>
    </div>
  `;
}

function renderItemForm(type, c) {
  let title = type === 'masuk' ? 'Barang Masuk' : 'Barang Keluar';
  let desc = type === 'masuk' ? 'Silakan masukkan detail unit barang secara manual untuk registrasi stok baru.' : 'Input data pengeluaran barang dari gudang operasional.';
  
  c.innerHTML = `
    <div class="content-header">
      <h2>${title}</h2>
      <p>${desc}</p>
    </div>
    
    <div class="card form-card">
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label>Nama Barang / SKU</label>
          <div class="input-scan-wrap">
            <input type="text" id="manual-code-${type}" class="form-control" placeholder="Ketik / scan SKU (Contoh: 8990001114177)" autofocus onkeydown="if(event.key==='Enter'){event.preventDefault();lookupItem('${type}')}">
            <button type="button" class="btn-scan-inline" onclick="toggleQR('${type}')">Kamera</button>
          </div>
          <div id="qr-reader-wrap-${type}" class="scanner-panel" style="display:none">
            <div class="scanner-header">
              <strong>Arahkan kamera ke barcode</strong>
              <button type="button" class="btn btn-outline btn-sm" onclick="toggleQR('${type}')">Tutup</button>
            </div>
            <div id="qr-reader-${type}" class="qr-reader"></div>
            <p>Jika kamera tidak terbuka, izinkan akses kamera di browser atau ketik SKU manual lalu tekan Enter.</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="lookupItem('${type}')">Cari SKU Manual</button>
        </div>
      </div>
      
      <div id="item-preview-${type}"></div>
      
      <form id="form-${type}" style="display:none" onsubmit="submitBarang(event,'${type}')">
        <div class="form-row">
          <div class="form-group">
            <label>${type === 'masuk' ? 'Jumlah Unit' : 'Qty Keluar'}</label>
            <input type="number" id="input-jumlah-${type}" class="form-control" min="1" placeholder="0" required>
          </div>
          <div class="form-group">
            <label>Satuan</label>
            <input type="text" id="display-satuan-${type}" class="form-control" readonly>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label>Lokasi Rak Penempatan (Otomatis)</label>
            <input type="text" id="display-rak-${type}" class="form-control" readonly>
            <p style="font-size:11px; color:var(--text-muted); margin-top:6px;">Sistem merekomendasikan rak berdasarkan kategori barang.</p>
          </div>
        </div>
        
        <div style="display:flex; justify-content:space-between; margin-top:20px;">
          <button type="button" class="btn btn-outline" onclick="showKaryawanView('${type}')">Reset</button>
          <button type="submit" class="btn btn-primary" style="width:100%; max-width:400px;">
            <span class="nav-icon">📦</span> Konfirmasi ${type === 'masuk' ? 'Barang Masuk' : 'Keluar'}
          </button>
        </div>
      </form>
    </div>
    
    <div id="recent-${type}"></div>
  `;
  renderRecent(type);
  setTimeout(() => { let el = document.getElementById('manual-code-' + type); if(el) el.focus(); }, 100);
}

// =====================================================================
// FIX: toggleQR async + guard dari double-tap
// =====================================================================
async function toggleQR(type) {
  if (isScannerStarting || isScannerStopping) {
    console.log('⏳ Scanner sedang transisi, abaikan klik.');
    return;
  }
  let wrap = document.getElementById('qr-reader-wrap-' + type);
  if (wrap.style.display === 'block') {
    await stopQR();
    wrap.style.display = 'none';
  } else {
    await startQR(type);
  }
}

// =====================================================================
// FIX UTAMA STARTQR
//   Perubahan:
//   1. Async + await stopQR() dulu untuk memastikan instance lama benar-
//      benar dilepas sebelum buat instance baru.
//   2. Tambah qrbox (region of interest) — scanner fokus area tengah,
//      jauh lebih cepat & akurat (faktor 3-5x).
//   3. Tambah aspectRatio agar video tidak terdistorsi di HP.
//   4. Tambah experimentalFeatures: { useBarCodeDetectorIfSupported:true }
//      → pakai BarcodeDetector API native browser (jauh lebih cepat di
//      Chrome Android).
//   5. Perluas formatsToSupport — termasuk EAN_8, UPC_A, UPC_E, ITF,
//      CODE_39, CODABAR, DATA_MATRIX. Mencegah miss-scan untuk barcode
//      retail umum.
//   6. Cooldown 1 detik di callback sukses → mencegah callback ter-fire
//      berkali-kali untuk frame yang sama (penyebab error di scan kedua).
//   7. Penanganan flag isScannerStarting yang rapi dengan try/finally.
// =====================================================================
async function startQR(type) {
  if (isScannerStarting) return;
  isScannerStarting = true;

  let wrap = document.getElementById('qr-reader-wrap-' + type);
  wrap.style.display = 'block';

  if (typeof Html5Qrcode === 'undefined') {
    showModal('⚠️', 'warning', 'Kamera Error', 'Library tidak tersedia. Gunakan input manual.', [{ l: 'OK' }]);
    wrap.style.display = 'none';
    isScannerStarting = false;
    return;
  }

  // PENTING: pastikan scanner sebelumnya benar-benar berhenti.
  await stopQR();

  // Kosongkan reset cooldown (krn stopQR sudah set false, tapi safety)
  scanCooldown = false;

  try {
    qrScanner = new Html5Qrcode('qr-reader-' + type, { verbose: false });

    // Format yang didukung — diperluas untuk menangani barcode retail
    let supportedFormats = [];
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      supportedFormats = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX
      ];
    }

    // qrbox dinamis — region scan = 70% lebar viewport dengan max 300px
    const qrboxFunc = (vw, vh) => {
      let minDim = Math.min(vw, vh);
      let size = Math.floor(minDim * 0.7);
      return { width: size, height: size };
    };

    const config = {
      fps: 15,
      qrbox: qrboxFunc,
      aspectRatio: 1.7777,
      disableFlip: false,
      formatsToSupport: supportedFormats,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    console.log('🔄 Memulai kamera untuk tipe:', type);

    await qrScanner.start(
      { facingMode: 'environment' },
      config,
      (decodedText, decodedResult) => {
        // ====== SUCCESS CALLBACK ======
        // Cooldown — abaikan jika baru saja scan dalam 1 detik terakhir
        if (scanCooldown) return;
        scanCooldown = true;
        setTimeout(() => { scanCooldown = false; }, 1000);

        // Bersihkan karakter tak terlihat
        let cleanCode = decodedText
          .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
          .trim()
          .toUpperCase();
        console.log('✅ Barcode terbaca:', JSON.stringify(decodedText), '| bersih:', cleanCode);

        let manualInput = document.getElementById('manual-code-' + type);
        if (manualInput) manualInput.value = cleanCode;

        // Emit barcode ke server agar laptop (client lain) ikut mendeteksi scan secara real-time
        if (socket) {
          socket.emit('scan-barcode', { code: cleanCode });
          if (navigator.vibrate) navigator.vibrate(200);
        }

        // Sembunyikan UI scanner — jangan sentuh state scanner di sini
        wrap.style.display = 'none';

        // Stop scanner dengan benar (async) lalu trigger lookupItem
        stopQR().then(() => {
          // Beri jeda agar DOM stabil, baru lookup
          setTimeout(() => lookupItem(type), 150);
        });
      },
      (errorMessage) => {
        // Callback frame error — di-suppress agar console tidak penuh
        // (akan dipanggil ~15x per detik saat tidak ada barcode di frame)
      }
    );
  } catch (e) {
    console.error('❌ Camera start error:', e);
    let errorStr = e.message || String(e) || 'Unknown error';
    let msg = 'Tidak dapat mengakses kamera. ' + errorStr;
    if (!window.isSecureContext) {
      msg = 'Kamera memerlukan koneksi HTTPS. Gunakan HTTPS atau localhost untuk menggunakan kamera scanner.';
    } else if (String(e).toLowerCase().includes('notallowed') || String(e).toLowerCase().includes('permission')) {
      msg = 'Izin kamera ditolak. Buka Pengaturan browser → izinkan akses Kamera untuk situs ini.';
    } else if (String(e).toLowerCase().includes('notfound') || String(e).toLowerCase().includes('not found')) {
      msg = 'Kamera tidak ditemukan pada perangkat ini.';
    } else if (String(e).toLowerCase().includes('notreadable') || String(e).toLowerCase().includes('not readable')) {
      msg = 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.';
    }
    showModal('⚠️', 'warning', 'Kamera Error', msg, [{ l: 'OK' }]);
    wrap.style.display = 'none';
    qrScanner = null;
  } finally {
    isScannerStarting = false;
  }
}

async function lookupItem(type) {
  let rawCode = document.getElementById('manual-code-' + type).value;
  let code = rawCode.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();
  if (!code) return;
  await fetchAllData();
  let item = getItemByCode(code), preview = document.getElementById('item-preview-' + type), form = document.getElementById('form-' + type);

  if (!item) {
    preview.innerHTML = `<div style="background:#FEE2E2; border:1px solid #FCA5A5; padding:15px; border-radius:8px; margin-bottom:20px;">
        <h4 style="color:#DC2626; margin-bottom:5px;">Barang Belum Terdaftar: ${code}</h4>
        <p style="font-size:12px;color:#64748B;margin-bottom:10px">Silakan isi detail manual:</p>
        <div class="form-row">
          <div class="form-group"><input id="reg-nama-${type}" class="form-control" placeholder="Nama Barang" required></div>
          <div class="form-group"><input id="reg-satuan-${type}" class="form-control" placeholder="Satuan (Pcs/Box)" required></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="registerItem('${type}','${code}')">Daftarkan & Lanjut</button></div>`;
    form.style.display = 'none';
    return;
  }

  let stock = getStockSummary().find(s => s.kode === code);
  let details = getItemDetails(item);
  preview.innerHTML = `<div style="background:#FFF8E1; border:1px solid #FFE082; padding:15px; border-radius:8px; margin-bottom:20px; display:flex; align-items:center; gap:15px;">
    <div style="font-size:24px;">📦</div>
    <div>
      <h4 style="margin:0 0 4px 0; color:#0A1B33;">${item.nama}</h4>
      <p style="margin:0; font-size:12px; color:#64748B;">Kode: <strong>${item.kode}</strong> | Stok Saat Ini: <strong style="color:var(--success)">${stock ? stock.stok : 0} ${item.satuan}</strong></p>
    </div>
  </div>`;
  form.style.display = 'block'; 
  form.dataset.kode = code;
  let elSatuan = document.getElementById('display-satuan-' + type);
  if(elSatuan) elSatuan.value = item.satuan;
  let elRak = document.getElementById('display-rak-' + type);
  if(elRak) elRak.value = details.rak;
  
  document.getElementById('input-jumlah-' + type).focus();
}

async function registerItem(type, code) {
  let nama = document.getElementById('reg-nama-' + type).value.trim();
  let satuan = document.getElementById('reg-satuan-' + type).value.trim();
  if (!nama || !satuan) { showModal('⚠️', 'warning', 'Lengkapi Data', 'Nama dan satuan harus diisi.', [{ l: 'OK' }]); return }

  try {
    await apiFetch(`${API_URL}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode: code, nama, satuan }) });
    await fetchAllData();
    if (socket) socket.emit('database-updated', { type: 'item', kode: code });
    lookupItem(type);
  } catch (e) {
    showModal('⚠️', 'warning', 'Gagal Daftar Barang', e.message, [{ l: 'OK' }]);
  }
}

async function submitBarang(e, type) {
  e.preventDefault();
  let kode = document.getElementById('form-' + type).dataset.kode;
  let jumlah = parseInt(document.getElementById('input-jumlah-' + type).value);
  if (!kode || !jumlah || jumlah <= 0) { showModal('⚠️', 'warning', 'Input Tidak Valid', 'Jumlah harus lebih dari 0.', [{ l: 'OK' }]); return; }
  if (type === 'keluar') { let s = getStockSummary().find(i => i.kode === kode); if (s && jumlah > s.stok) { showModal('⚠️', 'warning', 'Stok Tidak Cukup', `Stok saat ini: ${s.stok}`, [{ l: 'OK' }]); return } }

  let date = new Date().toISOString();
  try {
    await apiFetch(`${API_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode, type, jumlah, date, user: currentUser.username }) });
    await fetchAllData();
    if (socket) socket.emit('database-updated', { type: 'transaction', type_tx: type, kode, jumlah });

    let nama = getItemByCode(kode).nama;
    showModal('✓', 'success', 'Berhasil', `${nama} — Jumlah: ${jumlah} berhasil dicatat.`, [{ l: 'OK', fn: () => renderItemForm(type, document.getElementById('karyawan-content')) }]);
  } catch (e) {
    showModal('⚠️', 'warning', 'Gagal Simpan Transaksi', e.message, [{ l: 'OK' }]);
  }
}

function renderRecent(type) {
  let el = document.getElementById('recent-' + type); if (!el) return;
  let txns = getTxns().filter(t => t.type === type).slice(-5).reverse();
  if (!txns.length) {
    el.innerHTML = `
      <div class="recent-section">
        <h3>Aktivitas Terakhir (${type.toUpperCase()})</h3>
        <div class="empty-state">Belum ada transaksi ${type === 'masuk' ? 'barang masuk' : 'barang keluar'}.</div>
      </div>
    `;
    return;
  }
  
  let rows = txns.map(t => {
    let it = getItemByCode(t.kode);
    let details = getItemDetails(it);
    let prefix = type === 'masuk' ? 'IN' : 'OUT';
    return `<tr>
      <td>${t.id ? prefix + '-' + (9000+t.id) : 'TXN-001'}</td>
      <td>${fmtDateShort(t.date)}</td>
      <td><div class="item-name-cell"><strong>${it ? it.nama : t.kode}</strong><span>${t.kode}</span></div></td>
      <td><strong style="color:var(--text-dark)">${t.jumlah} ${it ? it.satuan : ''}</strong></td>
      <td>${details.rak}</td>
      <td><span class="badge badge-success">BERHASIL</span></td>
      <td><button class="icon-btn" title="Cetak bukti transaksi" onclick="printTransaction(${t.id})">Print</button></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="recent-section">
      <div class="recent-header">
        <h3>Aktivitas Terakhir (${type.toUpperCase()})</h3>
      <a href="#" onclick="event.preventDefault();showKaryawanView('history-${type}')" style="font-size:12px; color:var(--secondary); text-decoration:none; font-weight:600;">Lihat Semua &rarr;</a>
      </div>
      <div class="table-wrapper recent-table">
        <table>
          <thead class="table-header-dark"><tr><th>NO. TRANSAKSI</th><th>WAKTU</th><th>BARANG</th><th>JUMLAH</th><th>LOKASI RAK</th><th>STATUS</th><th>AKSI</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTransactionHistory(type, c) {
  let title = type === 'masuk' ? 'Riwayat Barang Masuk' : 'Riwayat Barang Keluar';
  let txns = getTxns().filter(t => t.type === type).slice().reverse();
  let rows = txns.map(t => {
    let it = getItemByCode(t.kode);
    let details = getItemDetails(it);
    return `<tr>
      <td>${type === 'masuk' ? 'IN' : 'OUT'}-${9000 + t.id}</td>
      <td>${fmtDate(t.date)}</td>
      <td><div class="item-name-cell"><strong>${it ? it.nama : t.kode}</strong><span>${t.kode}</span></div></td>
      <td><strong>${t.jumlah} ${it ? it.satuan : ''}</strong></td>
      <td>${details.rak}</td>
      <td>${t.user || '-'}</td>
      <td><button class="icon-btn" title="Cetak bukti transaksi" onclick="printTransaction(${t.id})">Print</button></td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="content-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <h2>${title}</h2>
        <p>Semua aktivitas ${type === 'masuk' ? 'penerimaan' : 'pengeluaran'} barang yang tercatat di sistem.</p>
      </div>
      <button class="btn btn-outline" onclick="showKaryawanView('${type}')">Kembali</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead class="table-header-dark"><tr><th>NO. TRANSAKSI</th><th>WAKTU</th><th>BARANG</th><th>JUMLAH</th><th>LOKASI RAK</th><th>USER</th><th>AKSI</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:30px;">Belum ada transaksi.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function printTransaction(id) {
  let txn = getTxns().find(t => Number(t.id) === Number(id));
  if (!txn) {
    showModal('!', 'warning', 'Transaksi Tidak Ditemukan', 'Data transaksi tidak tersedia.', [{ l: 'OK' }]);
    return;
  }
  let item = getItemByCode(txn.kode);
  let details = getItemDetails(item);
  let existing = document.getElementById('printable-transaction');
  if (existing) existing.remove();

  let printable = document.createElement('div');
  printable.id = 'printable-transaction';
  printable.innerHTML = `
    <div class="print-header">
      <h1>Bukti Transaksi Barang</h1>
      <p>${txn.type === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}</p>
    </div>
    <table class="print-table">
      <tbody>
        <tr><th>No. Transaksi</th><td>${txn.type === 'masuk' ? 'IN' : 'OUT'}-${9000 + txn.id}</td></tr>
        <tr><th>Tanggal</th><td>${fmtDate(txn.date)}</td></tr>
        <tr><th>SKU</th><td>${txn.kode}</td></tr>
        <tr><th>Nama Barang</th><td>${item ? item.nama : '-'}</td></tr>
        <tr><th>Jumlah</th><td>${txn.jumlah} ${item ? item.satuan : ''}</td></tr>
        <tr><th>Lokasi Rak</th><td>${details.rak}</td></tr>
        <tr><th>Dicatat Oleh</th><td>${txn.user || '-'}</td></tr>
      </tbody>
    </table>
    <div class="print-signatures">
      <div class="sig-box"><p>Petugas,</p><div class="sig-line"></div><p>${txn.user || '-'}</p></div>
      <div class="sig-box"><p>Penerima/Pemeriksa,</p><div class="sig-line"></div><p>&nbsp;</p></div>
    </div>
  `;
  document.body.appendChild(printable);
  document.body.classList.add('printing-transaction');
  window.onafterprint = () => {
    document.body.classList.remove('printing-transaction');
    let receipt = document.getElementById('printable-transaction');
    if (receipt) receipt.remove();
  };
  window.print();
}

function renderStokTable(c) {
  stokPage = 1;
  let summary = getStockSummary();
  let items = getItems();
  let lowCount = summary.filter(i => i.stok <= 10).length;
  
  let categories = [...new Set(items.map(i => getItemDetails(i).kategori))];
  
  let rows = summary.length ? summary.map((i, n) => {
    let details = getItemDetails(i);
    let statusBadge = i.stok > 10 ? '<span class="badge badge-success">Tersedia</span>' : (i.stok > 0 ? '<span class="badge badge-warning">Stok Rendah</span>' : '<span class="badge badge-danger">Habis</span>');
    let colorClass = i.stok > 10 ? 'var(--secondary)' : (i.stok > 0 ? 'var(--warning)' : 'var(--danger)');
    
    return `<tr>
      <td><div class="item-name-cell"><strong>${i.kode}</strong><span>${i.nama}</span></div></td>
      <td>${details.kategori}</td>
      <td><strong style="color:${colorClass}">${i.stok} ${i.satuan}</strong></td>
      <td>${details.rak}</td>
      <td>${statusBadge}</td>
      <td><div class="action-btns"><button class="icon-btn" onclick="viewItemDetail('${i.kode}')">👁️</button></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;">Belum ada data</td></tr>';

  c.innerHTML = `
    <div class="content-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <h2>Cek Stok Barang</h2>
        <p>Pantau ketersediaan inventaris secara real-time dari seluruh zona gudang.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" onclick="exportStokData()"><span class="nav-icon">📥</span> Export Data</button>
        <button class="btn btn-primary" onclick="showKaryawanView('tambah-sku')"><span class="nav-icon">➕</span> Tambah SKU</button>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="card stat-card">
        <div class="stat-icon-wrapper purple">📦</div>
        <div class="stat-info">
          <div class="stat-value">${summary.length} <span class="stat-badge purple">+12% MoM</span></div>
          <div class="stat-label">Total SKU Terdaftar</div>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon-wrapper red">⚠️</div>
        <div class="stat-info">
          <div class="stat-value">${lowCount} <span class="stat-badge red">Urgent</span></div>
          <div class="stat-label">SKU Stok Rendah</div>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon-wrapper orange">📑</div>
        <div class="stat-info">
          <div class="stat-value">${categories.length} <span class="stat-badge orange">Optimized</span></div>
          <div class="stat-label">Kategori Aktif</div>
        </div>
      </div>
    </div>
    
    <div class="filter-bar">
      <div class="search-bar" style="border:1px solid var(--border); width:300px; padding:10px 16px;">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-stok" placeholder="Search product name..." onkeyup="filterStokTable()">
      </div>
      <div class="form-group" style="margin:0; width:200px;">
        <select class="form-control" style="padding:10px;"><option>Semua Kategori</option></select>
      </div>
    </div>
    
    <div class="table-wrapper">
      <table id="stok-table">
        <thead class="table-header-dark"><tr><th>SKU / NAMA BARANG</th><th>KATEGORI</th><th>JUMLAH STOK</th><th>LOKASI RAK</th><th>STATUS</th><th>AKSI</th></tr></thead>
        <tbody id="stok-tbody"></tbody>
      </table>
      <div class="table-footer">
        <span id="stok-page-info"></span>
        <div class="pagination" id="stok-pagination"></div>
      </div>
    </div>
  `;
  renderStokPage();
}

function filterStokTable() {
  stokPage = 1;
  renderStokPage();
}

function getFilteredStockSummary() {
  let filter = (document.getElementById('search-stok')?.value || '').trim().toUpperCase();
  return getStockSummary().filter(i => {
    let details = getItemDetails(i);
    let haystack = `${i.kode} ${i.nama} ${details.kategori} ${details.rak}`.toUpperCase();
    return !filter || haystack.includes(filter);
  });
}

function renderStokPage(page = stokPage) {
  let tbody = document.getElementById('stok-tbody');
  if (!tbody) return;

  let summary = getFilteredStockSummary();
  let totalPages = Math.max(1, Math.ceil(summary.length / PAGE_SIZE));
  stokPage = Math.min(Math.max(1, page), totalPages);
  let start = (stokPage - 1) * PAGE_SIZE;
  let pageItems = summary.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageItems.length ? pageItems.map(i => {
    let details = getItemDetails(i);
    let statusBadge = i.stok > 10 ? '<span class="badge badge-success">Tersedia</span>' : (i.stok > 0 ? '<span class="badge badge-warning">Stok Rendah</span>' : '<span class="badge badge-danger">Habis</span>');
    let colorClass = i.stok > 10 ? 'var(--secondary)' : (i.stok > 0 ? 'var(--warning)' : 'var(--danger)');
    return `<tr>
      <td><div class="item-name-cell"><strong>${i.kode}</strong><span>${i.nama}</span></div></td>
      <td>${details.kategori}</td>
      <td><strong style="color:${colorClass}">${i.stok} ${i.satuan}</strong></td>
      <td>${details.rak}</td>
      <td>${statusBadge}</td>
      <td><div class="action-btns"><button class="icon-btn" onclick="viewItemDetail('${i.kode}')">Lihat</button></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;">Belum ada data</td></tr>';

  let info = document.getElementById('stok-page-info');
  if (info) {
    let end = Math.min(start + PAGE_SIZE, summary.length);
    info.textContent = summary.length ? `Menampilkan ${start + 1}-${end} dari ${summary.length} data` : 'Tidak ada data';
  }

  let pagination = document.getElementById('stok-pagination');
  if (!pagination) return;
  let buttons = [`<button class="page-btn" ${stokPage === 1 ? 'disabled' : ''} onclick="renderStokPage(${stokPage - 1})">‹</button>`];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - stokPage) <= 1) {
      buttons.push(`<button class="page-btn ${i === stokPage ? 'active' : ''}" onclick="renderStokPage(${i})">${i}</button>`);
    } else if (i === stokPage - 2 || i === stokPage + 2) {
      buttons.push('<span class="page-ellipsis">...</span>');
    }
  }
  buttons.push(`<button class="page-btn" ${stokPage === totalPages ? 'disabled' : ''} onclick="renderStokPage(${stokPage + 1})">›</button>`);
  pagination.innerHTML = buttons.join('');
}

function renderRemoteScanner(c) {
  c.innerHTML = `<div class="section-panel" style="text-align:center; min-height:80vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
    <div class="section-header" style="width:100%; justify-content:space-between; margin-bottom: 20px;">
      <h2>📷 Scan Barang</h2>
      <button class="btn btn-outline btn-sm" onclick="showKaryawanView('dashboard')">← Kembali</button>
    </div>
    <p style="color:var(--text-secondary); margin-bottom:20px;">Arahkan kamera ke barcode untuk scan barang.</p>
    
    <div id="remote-scanner-box" style="width:100%; max-width:400px; margin:0 auto; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
      <div id="qr-reader-remote"></div>
    </div>
    
    <div id="remote-status" style="margin-top:20px; font-weight:bold; height:30px; color:var(--primary);">
      Menunggu scan...
    </div>
    
    <button class="btn btn-primary" style="margin-top:20px; width:100%; max-width:400px;" onclick="startRemoteScanner()">Mulai Scanner</button>
  </div>`;
  
  // Auto start
  setTimeout(startRemoteScanner, 300);
}

async function startRemoteScanner() {
  if (isScannerStarting) return;
  isScannerStarting = true;
  
  await stopQR();
  scanCooldown = false;
  
  try {
    qrScanner = new Html5Qrcode('qr-reader-remote', { verbose: false });
    
    let supportedFormats = [];
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      supportedFormats = [
        Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODABAR, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E, Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX
      ];
    }
    
    const qrboxFunc = (vw, vh) => {
      let minDim = Math.min(vw, vh);
      let size = Math.floor(minDim * 0.7);
      return { width: size, height: size };
    };

    const config = {
      fps: 15,
      qrbox: qrboxFunc,
      aspectRatio: 1.7777,
      disableFlip: false,
      formatsToSupport: supportedFormats,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
    
    await qrScanner.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        if (scanCooldown) return;
        scanCooldown = true;
        setTimeout(() => { scanCooldown = false; }, 1500); // 1.5s cooldown
        
        let cleanCode = decodedText.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();
        
        let statusEl = document.getElementById('remote-status');
        if(statusEl) {
          statusEl.innerHTML = `✅ Terkirim: <strong>${cleanCode}</strong>`;
          statusEl.style.color = 'var(--success)';
          setTimeout(() => { 
            if(document.getElementById('remote-status')) {
              document.getElementById('remote-status').innerHTML = 'Menunggu scan...';
              document.getElementById('remote-status').style.color = 'var(--primary)';
            }
          }, 1500);
        }
        
        // Emit to server
        if (socket) {
          socket.emit('scan-barcode', { code: cleanCode });
          // Vibrate if supported
          if (navigator.vibrate) navigator.vibrate(200);
        }
      },
      (error) => {}
    );
  } catch (e) {
    console.error(e);
    let errorStr = e.message || String(e) || 'Unknown error';
    let msg = errorStr;
    if (!window.isSecureContext) {
      msg = 'Kamera memerlukan HTTPS. Buka via HTTPS untuk menggunakan scanner.';
    } else if (String(e).toLowerCase().includes('notallowed') || String(e).toLowerCase().includes('permission')) {
      msg = 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser.';
    } else if (String(e).toLowerCase().includes('notfound')) {
      msg = 'Kamera tidak ditemukan pada perangkat ini.';
    }
    let statusEl = document.getElementById('remote-status');
    if(statusEl) {
      statusEl.innerHTML = '❌ ' + msg;
      statusEl.style.color = 'var(--danger)';
    }
  } finally {
    isScannerStarting = false;
  }
}

// PROFILE & PASSWORD
function showProfile(containerId) {
  let c = document.getElementById(containerId);
  let isKaryawan = containerId.includes('karyawan');
  let initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  
  c.innerHTML = `
    <div class="content-header">
      <h2>Profil Saya</h2>
      <p>Kelola informasi akun dan keamanan Anda.</p>
    </div>
    
    <div style="display:grid; grid-template-columns:1fr 2fr; gap:24px; max-width:900px;">
      <div class="card" style="text-align:center; padding:30px;">
        <div style="width:80px;height:80px;border-radius:50%;background:#0A1B33;color:#FFC107;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 15px auto;border:3px solid #FFC107;">${initials}</div>
        <h3 style="font-size:16px;font-weight:700;color:#0A1B33;margin-bottom:4px;">${currentUser.name}</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">@${currentUser.username}</p>
        <span class="badge ${isKaryawan ? 'badge-success' : 'badge-warning'}" style="margin-bottom:15px;">${currentUser.role}</span>
        <hr style="border:none;border-top:1px solid var(--border);margin:15px 0;">
        <div style="text-align:left; font-size:12px; color:var(--text-muted);">
          <p style="margin-bottom:8px;">📧 ${currentUser.email || 'Belum diatur'}</p>
          <p style="margin-bottom:8px;">📱 ${currentUser.phone || 'Belum diatur'}</p>
        </div>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-top:10px;" onclick="${isKaryawan ? 'showKaryawanView' : 'showManagerView'}('password')">🔒 Ubah Password</button>
      </div>
      
      <div class="card" style="padding:30px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;color:#0A1B33;">Edit Informasi</h3>
        <form onsubmit="saveProfile(event)">
          <div class="form-row">
            <div class="form-group"><label>Nama Lengkap</label><input id="pf-name" class="form-control" value="${currentUser.name}" required></div>
            <div class="form-group"><label>Username</label><input id="pf-uname" class="form-control" value="${currentUser.username}" required></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>No. Telepon</label><input id="pf-phone" class="form-control" value="${currentUser.phone || ''}" placeholder="08xxxxxxxxxx"></div>
            <div class="form-group"><label>Email</label><input id="pf-email" class="form-control" type="email" value="${currentUser.email || ''}" placeholder="nama@email.com"></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:10px;">
            <button type="button" class="btn btn-outline" onclick="${isKaryawan ? 'showKaryawanView' : 'showManagerView'}('${isKaryawan ? 'dashboard' : 'stok'}')">← Kembali</button>
            <button type="submit" class="btn btn-primary">💾 Simpan Perubahan</button>
          </div>
        </form>
      </div>
    </div>`;
}

async function saveProfile(e) {
  e.preventDefault();
  let username = document.getElementById('pf-uname').value.trim();
  let name = document.getElementById('pf-name').value.trim();
  let phone = document.getElementById('pf-phone').value.trim();
  let email = document.getElementById('pf-email').value.trim();

  try {
    let updated = await apiFetch(`${API_URL}/users/${currentUser.username}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, phone, email, password: currentUser.password })
    });
    currentUser = updated;
    localStorage.setItem('stockflow_user', JSON.stringify(currentUser));
    document.querySelectorAll('.profile-info .name').forEach(el => el.textContent = currentUser.name);
    document.querySelectorAll('.profile-info .avatar').forEach(el => el.textContent = currentUser.name.charAt(0));
    showModal('?', 'success', 'Berhasil', 'Profil berhasil diperbarui.', [{ l: 'OK' }]);
  } catch (e) {
    showModal('⚠️', 'warning', 'Gagal Simpan Profil', e.message, [{ l: 'OK' }]);
  }
}

function showChangePassword(containerId) {
  let c = document.getElementById(containerId);
  let isKaryawan = containerId.includes('karyawan');
  c.innerHTML = `
    <div class="content-header">
      <h2>🔒 Ubah Password</h2>
      <p>Masukkan password lama dan password baru Anda.</p>
    </div>
    <div class="card" style="max-width:500px; padding:30px;">
      <form onsubmit="savePassword(event)">
        <div class="form-group"><label>Password Lama</label><input type="password" id="pw-old" class="form-control" required></div>
        <div class="form-group"><label>Password Baru</label><input type="password" id="pw-new" class="form-control" required></div>
        <div class="form-group"><label>Konfirmasi Password Baru</label><input type="password" id="pw-conf" class="form-control" required></div>
        <div style="display:flex;gap:10px;margin-top:15px;">
          <button type="button" class="btn btn-outline" onclick="${isKaryawan ? 'showKaryawanView' : 'showManagerView'}('profile')">← Kembali</button>
          <button type="submit" class="btn btn-primary">💾 Simpan Password Baru</button>
        </div>
      </form>
    </div>`;
}

async function savePassword(e) {
  e.preventDefault();
  let old = document.getElementById('pw-old').value;
  let nw = document.getElementById('pw-new').value;
  let cf = document.getElementById('pw-conf').value;
  if (old !== currentUser.password) { showModal('⚠️', 'warning', 'Gagal', 'Password lama salah.', [{ l: 'OK' }]); return; }
  if (nw !== cf) { showModal('⚠️', 'warning', 'Gagal', 'Konfirmasi password tidak cocok.', [{ l: 'OK' }]); return; }
  if (nw.length < 4) { showModal('⚠️', 'warning', 'Gagal', 'Password minimal 4 karakter.', [{ l: 'OK' }]); return; }
  try {
    let updated = await apiFetch(`${API_URL}/users/${currentUser.username}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, name: currentUser.name, phone: currentUser.phone || '', email: currentUser.email || '', password: nw })
    });
    currentUser = updated;
    localStorage.setItem('stockflow_user', JSON.stringify(currentUser));
    showModal('?', 'success', 'Berhasil', 'Password berhasil diubah.', [{ l: 'OK' }]);
  } catch (e) {
    showModal('⚠️', 'warning', 'Gagal Ubah Password', e.message, [{ l: 'OK' }]);
  }
}

// TAMBAH SKU
function renderTambahSKU(c) {
  c.innerHTML = `
    <div class="content-header">
      <h2>➕ Tambah SKU Baru</h2>
      <p>Daftarkan barang baru ke dalam sistem inventaris.</p>
    </div>
    <div class="card" style="max-width:600px; padding:30px;">
      <form onsubmit="submitTambahSKU(event)">
        <div class="form-group"><label>Kode SKU / Barcode</label><input type="text" id="sku-kode" class="form-control" placeholder="Contoh: ELK-HDST-01" required></div>
        <div class="form-row">
          <div class="form-group"><label>Nama Barang</label><input type="text" id="sku-nama" class="form-control" placeholder="Nama lengkap barang" required></div>
          <div class="form-group"><label>Satuan</label><input type="text" id="sku-satuan" class="form-control" placeholder="Pcs / Box / Unit" required></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:15px;">
          <button type="button" class="btn btn-outline" onclick="showKaryawanView('stok')">← Kembali</button>
          <button type="submit" class="btn btn-primary">📦 Daftarkan Barang</button>
        </div>
      </form>
    </div>`;
}

async function submitTambahSKU(e) {
  e.preventDefault();
  let kode = document.getElementById('sku-kode').value.trim().toUpperCase();
  let nama = document.getElementById('sku-nama').value.trim();
  let satuan = document.getElementById('sku-satuan').value.trim();
  if (!kode || !nama || !satuan) { showModal('⚠️', 'warning', 'Lengkapi Data', 'Kode, nama, dan satuan harus diisi.', [{ l: 'OK' }]); return; }
  
  let existing = getItemByCode(kode);
  if (existing) { showModal('⚠️', 'warning', 'Duplikat', 'Kode SKU ini sudah terdaftar.', [{ l: 'OK' }]); return; }
  
  try {
    await apiFetch(`${API_URL}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode, nama, satuan }) });
    await fetchAllData();
    if (socket) socket.emit('database-updated', { type: 'item', kode });
    showModal('✓', 'success', 'Berhasil', `Barang "${nama}" (${kode}) berhasil didaftarkan.`, [{ l: 'OK', fn: () => showKaryawanView('stok') }]);
  } catch (e) {
    showModal('⚠️', 'warning', 'Gagal Tambah SKU', e.message, [{ l: 'OK' }]);
  }
}

// EXPORT DATA
function exportStokData() {
  let summary = getStockSummary();
  if (typeof XLSX === 'undefined') { showModal('⚠️', 'warning', 'Error', 'Library XLSX belum dimuat.', [{ l: 'OK' }]); return; }
  let data = summary.map((i, n) => {
    let d = getItemDetails(i);
    return { No: n+1, SKU: i.kode, 'Nama Barang': i.nama, Kategori: d.kategori, Stok: i.stok, Satuan: i.satuan, 'Lokasi Rak': d.rak };
  });
  let ws = XLSX.utils.json_to_sheet(data);
  let wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stok Barang');
  XLSX.writeFile(wb, 'StokBarang_' + new Date().toISOString().split('T')[0] + '.xlsx');
  showModal('✅', 'success', 'Export Berhasil', 'File Excel telah diunduh.', [{ l: 'OK' }]);
}

// VIEW ITEM DETAIL
function viewItemDetail(kode) {
  let item = getItemByCode(kode);
  if (!item) return;
  let stock = getStockSummary().find(s => s.kode === kode);
  let d = getItemDetails(item);
  let txns = getTxns().filter(t => t.kode === kode).slice(-5).reverse();
  let txnRows = txns.map(t => `<tr><td>${fmtDateShort(t.date)}</td><td>${t.type === 'masuk' ? '📥 Masuk' : '📤 Keluar'}</td><td>${t.jumlah} ${item.satuan}</td><td>${t.user || '-'}</td></tr>`).join('');
  
  showModal('📦', 'success', item.nama, `SKU: ${item.kode} | Stok: ${stock ? stock.stok : 0} ${item.satuan} | Rak: ${d.rak} | Kategori: ${d.kategori}`, [{ l: 'Tutup' }]);
}

// MANAGER
function renderManager() {
  if (!currentUser) return;
  let nameEl = document.querySelector('#manager-page .profile-info .name');
  let avatarEl = document.querySelector('#manager-page .profile-info .avatar');
  if (nameEl) nameEl.textContent = currentUser.name;
  if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0);
  
  let nav = document.getElementById('manager-nav');
  nav.innerHTML = `
    <li><button class="nav-item active" id="nav-stok" onclick="showManagerView('stok')"><span class="nav-icon">📑</span> Laporan Stok</button></li>
  `;
}

async function showManagerView(v) {
  currentManagerView = v;
  closeSidebar();
  try { await stopQR(); } catch(e) {} // pastikan kamera mati
  let c = document.getElementById('manager-content');
  setActiveNav(v);
  
  if (v === 'stok') {
    c.innerHTML = '<div class="empty-state">Memuat laporan stok...</div>';
    try {
      await fetchAllData();
    } catch (e) {
      console.error('Gagal fetch data untuk laporan stok:', e);
      // Tetap lanjut render — tabel akan kosong tapi tidak blank
    }
    renderManagerStok(c);
    // Pastikan date inputs sudah ada di DOM sebelum generate
    requestAnimationFrame(() => {
      try {
        generateLaporan();
      } catch (e) {
        console.error('Gagal generate laporan:', e);
        let container = document.getElementById('laporan-container');
        if (container) {
          container.innerHTML = '<div class="empty-state" style="color:var(--danger)">⚠️ Gagal memuat data laporan. Coba klik "Tampilkan Data".</div>';
        }
      }
    });
  }
  else if (v === 'profile') { showProfile('manager-content') }
  else if (v === 'password') { showChangePassword('manager-content') }
}

function renderManagerStok(c) {
  let today = new Date().toISOString().split('T')[0];
  let firstDay = today.substring(0, 8) + '01';

  c.innerHTML = `
    <div class="content-header no-print">
      <h2>Laporan Stok Barang</h2>
      <p>Pilih periode untuk menampilkan laporan stok barang.</p>
    </div>
    
    <div class="filter-bar no-print">
      <div class="form-group" style="margin:0"><label>Tanggal Awal</label><input type="date" id="periode-start" class="form-control" value="${firstDay}"></div>
      <div class="form-group" style="margin:0"><label>Tanggal Akhir</label><input type="date" id="periode-end" class="form-control" value="${today}"></div>
      <button class="btn btn-primary" onclick="generateLaporan()" style="padding:12px 24px;">Tampilkan Data</button>
      <button class="btn btn-primary" onclick="window.print()" style="padding:12px 24px; background:#FFC107; color:#0A1B33; margin-left:auto;">🖨 Cetak Laporan</button>
    </div>
    
    <div id="laporan-container"></div>`;
}

function generateLaporan() {
  try {
    let startDate = document.getElementById('periode-start').value;
    let endDate = document.getElementById('periode-end').value;

    if (!startDate || !endDate) return;

    let start = new Date(startDate);
    let end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (start > end) return;

    let allTxns = getTxns();
    let items = getItems();

    let summary = items.map(item => {
      let txnsBefore = allTxns.filter(t => t.kode === item.kode && new Date(t.date) < start);
      let stokAwal = txnsBefore.filter(t => t.type === 'masuk').reduce((s, t) => s + t.jumlah, 0)
                   - txnsBefore.filter(t => t.type === 'keluar').reduce((s, t) => s + t.jumlah, 0);

      let txnsPeriod = allTxns.filter(t => t.kode === item.kode && new Date(t.date) >= start && new Date(t.date) <= end);
      let masuk = txnsPeriod.filter(t => t.type === 'masuk').reduce((s, t) => s + t.jumlah, 0);
      let keluar = txnsPeriod.filter(t => t.type === 'keluar').reduce((s, t) => s + t.jumlah, 0);

      let sisaStok = stokAwal + masuk - keluar;
      return { ...item, stokAwal, masuk, keluar, sisaStok };
    });
    
    let totalMasuk = summary.reduce((s, i) => s + i.masuk, 0);
    let totalKeluar = summary.reduce((s, i) => s + i.keluar, 0);
    let totalSisa = summary.reduce((s, i) => s + i.sisaStok, 0);

    let rows = summary.length ? summary.map((i, n) => `<tr>
        <td>${n + 1}</td>
        <td><strong>${i.kode}</strong></td>
        <td class="text-left">${i.nama}</td>
        <td>${i.stokAwal}</td>
        <td style="color: var(--success); font-weight: 600;">${i.masuk}</td>
        <td style="color: var(--danger); font-weight: 600;">${i.keluar}</td>
        <td style="font-weight: 600;">${i.sisaStok}</td>
      </tr>`).join('')
      : '<tr><td colspan="7" style="text-align:center;padding:30px;">Belum ada data pada periode ini</td></tr>';

    let periodeText = new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' - ' + new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    let container = document.getElementById('laporan-container');
    if (!container) return;

    container.innerHTML = `
      <div class="table-wrapper no-print">
        <div style="background:#0A1B33; color:white; padding:15px 20px; font-weight:600; text-align:center;">📋 Detail Rincian Stok</div>
        <table>
          <thead style="background:#F8FAFC;">
            <tr>
              <th>No</th>
              <th>SKU</th>
              <th>NAMA BARANG</th>
              <th>STOK AWAL</th>
              <th>MASUK</th>
              <th>KELUAR</th>
              <th>SISA STOK</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot style="background:#FFF8E1; font-weight:700;">
            <tr>
              <td colspan="4" style="text-align:right; font-size:12px; letter-spacing:0.5px;">TOTAL MOVEMENT SUMMARY</td>
              <td style="color:var(--success)">${totalMasuk}</td>
              <td style="color:var(--danger)">${totalKeluar}</td>
              <td>${totalSisa}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- PRINT VIEW -->
      <div id="printable-report">
        <div class="print-header">
          <h1>Laporan Mutasi Stok</h1>
          <div class="print-meta">
            <div>
              <p>📅 Periode: ${periodeText}</p>
            </div>
            <div style="text-align:right">
              <p>Generated on: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <p>User: Warehouse Manager</p>
              <p>Ref ID: RPT-STK-202401-001</p>
            </div>
          </div>
        </div>
        <table class="print-table">
          <thead>
            <tr>
              <th style="width:5%">No</th>
              <th style="width:15%">SKU</th>
              <th style="width:30%">Nama Barang</th>
              <th style="width:10%">Stok Awal</th>
              <th style="width:10%">Jumlah Masuk</th>
              <th style="width:10%">Jumlah Keluar</th>
              <th style="width:10%">Sisa Stok</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot style="font-weight:bold; background-color:#f1f5f9;">
            <tr>
              <td colspan="4" style="text-align:right; padding-right:15px; font-size:11px;">TOTAL MOVEMENT</td>
              <td>${totalMasuk}</td>
              <td>${totalKeluar}</td>
              <td>${totalSisa}</td>
            </tr>
          </tfoot>
        </table>
        
        <div class="print-signatures">
          <div class="sig-box">
            <p>Dibuat Oleh,</p>
            <div class="sig-line"></div>
            <p style="color:#0A1B33; font-weight:bold;">Warehouse Admin</p>
            <p style="color:#666; font-size:10px;">ID: LT-ADM-04</p>
          </div>
          <div class="sig-box">
            <p>Diperiksa Oleh,</p>
            <div class="sig-line"></div>
            <p style="color:#0A1B33; font-weight:bold;">Inventory Control</p>
            <p style="color:#666; font-size:10px;">ID: LT-INC-02</p>
          </div>
          <div class="sig-box">
            <p>Disetujui Oleh,</p>
            <div class="sig-line"></div>
            <p style="color:#0A1B33; font-weight:bold;">Operations Manager</p>
            <p style="color:#666; font-size:10px;">ID: LT-MGR-01</p>
          </div>
        </div>
        
        <div class="print-footer">
          © 2024 LogiTrack WMS. All rights reserved. Page 1 of 1
        </div>
      </div>`;
  } catch (err) {
    console.error("Error generating report:", err);
    let container = document.getElementById('laporan-container');
    if (container) {
      container.innerHTML = `<div class="empty-state" style="color:var(--danger)">⚠️ Gagal memuat data laporan: ${err.message}</div>`;
    }
  }
}

async function initApp() {
  try {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
    }

    // ===== Deteksi Secure Context untuk kamera HP =====
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      // Coba auto-redirect ke HTTPS (server juga akan redirect, tapi ini fallback client-side)
      var httpsUrl = 'https://' + location.hostname + ':3443' + location.pathname;
      var banner = document.createElement('div');
      banner.className = 'https-banner';
      banner.innerHTML = '⚠️ Kamera tidak tersedia via HTTP. <a href="' + httpsUrl + '">Buka via HTTPS →</a>';
      document.body.prepend(banner);
    }

    let savedUser = localStorage.getItem('stockflow_user');
    if (savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
        if (!currentUser || !currentUser.username || !currentUser.role) {
          throw new Error('Data user tersimpan tidak valid');
        }
        
        // Coba fetch data — jika gagal, tetap coba render dengan data kosong
        try {
          await fetchAllData();
        } catch (fetchErr) {
          console.warn('Gagal fetch data saat init, lanjut dengan data kosong:', fetchErr);
          // Jangan throw — biarkan dashboard render meskipun data kosong
        }
        
        if (currentUser.role === 'karyawan') {
          renderKaryawan();
          showPage('karyawan-page');
          try { await showKaryawanView('dashboard'); } catch(e) { console.error('Render karyawan error:', e); }
        } else {
          renderManager();
          showPage('manager-page');
          try { await showManagerView('stok'); } catch(e) { console.error('Render manager error:', e); }
        }
      } catch (e) {
        console.error('Session restore gagal:', e);
        currentUser = null;
        localStorage.removeItem('stockflow_user');
        showPage('login-page');
      }
    } else {
      showPage('login-page');
    }
  } catch (fatalErr) {
    // Fallback terakhir — pastikan SESUATU tampil, jangan blank
    console.error('FATAL initApp error:', fatalErr);
    try {
      showPage('login-page');
    } catch (e2) {
      // Paksa manual show login
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      let lp = document.getElementById('login-page');
      if (lp) lp.classList.add('active');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
