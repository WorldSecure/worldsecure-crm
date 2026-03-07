const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Creating qr_codes table...\n');

const createTableSQL = `
CREATE TABLE IF NOT EXISTS qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  qr_data TEXT NOT NULL,
  image_url TEXT NOT NULL,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by INTEGER
)`;

db.run(createTableSQL, (err) => {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log('✅ qr_codes table created!');
  }
  db.close();
});
