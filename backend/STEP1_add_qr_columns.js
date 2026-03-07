const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Adding qr_code_id columns...\n');

db.serialize(() => {
  db.run('ALTER TABLE outbound_transactions ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate')) {
      console.error('❌ outbound:', err.message);
    } else {
      console.log('✅ outbound_transactions.qr_code_id');
    }
  });

  db.run('ALTER TABLE inbound_transactions ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate')) {
      console.error('❌ inbound:', err.message);
    } else {
      console.log('✅ inbound_transactions.qr_code_id');
    }
  });

  db.run('ALTER TABLE quotes ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate')) {
      console.error('❌ quotes:', err.message);
    } else {
      console.log('✅ quotes.qr_code_id');
    }
    console.log('\n✅ STEP 1 COMPLETE!');
    db.close();
  });
});
