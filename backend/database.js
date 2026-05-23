const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'stockflow.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      satuan TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT NOT NULL,
      type TEXT NOT NULL,
      jumlah INTEGER NOT NULL,
      date TEXT NOT NULL,
      user TEXT NOT NULL,
      FOREIGN KEY(kode) REFERENCES items(kode)
    )`);

    db.get(`SELECT * FROM users WHERE username = ?`, ['admin'], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO users (username, password, role, name) VALUES ('admin', 'admin123', 'manager', 'Administrator')`);
      }
    });
  });
}

module.exports = db;
