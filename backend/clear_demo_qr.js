const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('ניקוי QR דמה...\n');

// מחק דמה (שמות בעברית)
db.run(`DELETE FROM qr_codes WHERE title IN (
  'QR חנות ראשית', 
  'QR מחסן A', 
  'QR משלוחים'
)`, function(err) {
  if (err) {
    console.error('❌ שגיאה:', err.message);
  } else {
    console.log(`✅ נמחקו ${this.changes} QR דמה`);
  }
  
  // בדוק מה נשאר
  db.all('SELECT id, title FROM qr_codes ORDER BY id', [], (err, rows) => {
    if (err) {
      console.error('❌ שגיאה בבדיקה:', err.message);
    } else {
      console.log('\nQR קיימים עכשיו:');
      if (rows.length === 0) {
        console.log('✅ טבלה ריקה - dropdown יראה "אין QR זמינים"');
      } else {
        console.log(rows.map(r => `  ${r.id}: ${r.title}`).join('\n'));
      }
    }
    db.close();
  });
});
