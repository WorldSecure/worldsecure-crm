const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

db.all('SELECT * FROM qr_codes', [], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
  } else {
    console.log('QR Codes ב-DB:');
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
