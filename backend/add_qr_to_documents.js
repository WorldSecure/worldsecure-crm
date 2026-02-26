const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Adding qr_code_id columns to tables...\n');

db.serialize(() => {
  // Add to outbound_transactions (delivery notes)
  db.run('ALTER TABLE outbound_transactions ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ outbound_transactions:', err.message);
    } else {
      console.log('✅ outbound_transactions.qr_code_id added');
    }
  });

  // Add to inbound_transactions (receipt notes)
  db.run('ALTER TABLE inbound_transactions ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ inbound_transactions:', err.message);
    } else {
      console.log('✅ inbound_transactions.qr_code_id added');
    }
  });

  // Add to quotes (for proforma)
  db.run('ALTER TABLE quotes ADD COLUMN qr_code_id INTEGER', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ quotes:', err.message);
    } else {
      console.log('✅ quotes.qr_code_id added');
    }
    
    console.log('\n✅✅✅ QR code columns ready!');
    db.close();
  });
});
