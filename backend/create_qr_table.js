const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Creating qr_codes table...\n');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_data TEXT,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating qr_codes table:', err.message);
    } else {
      console.log('✅ qr_codes table created/verified');
    }
  });

  // הוסף כמה QR לדמה
  const sampleQRs = [
    ['QR חנות ראשית', null, 'qr_shop_main.png', 1],
    ['QR מחסן A', null, 'qr_warehouse_a.png', 1],
    ['QR משלוחים', null, 'qr_delivery.png', 1]
  ];

  sampleQRs.forEach(([title, image_data, image_path, created_by]) => {
    db.run(
      `INSERT OR IGNORE INTO qr_codes (title, image_data, image_path, created_by) 
       VALUES (?, ?, ?, ?)`,
      [title, image_data, image_path, created_by],
      (err) => {
        if (err) {
          console.error('❌ Error inserting sample QR:', err.message);
        } else {
          console.log(`✅ Sample QR added: ${title}`);
        }
      }
    );
  });

  console.log('\n✅✅✅ qr_codes table ready with sample data!');
  db.close();
});
