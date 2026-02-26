const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crm.db');

// Update all outbound transactions that are linked to quotes
db.all(`
  SELECT DISTINCT outbound_id 
  FROM quote_stages 
  WHERE outbound_id IS NOT NULL AND delivery_approved = 1
`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log(`Found ${rows.length} linked delivery notes`);
  
  const updates = rows.map(row => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE outbound_transactions SET status = ? WHERE id = ?',
        ['completed', row.outbound_id],
        function(err) {
          if (err) reject(err);
          else {
            console.log(`✅ Updated outbound #${row.outbound_id} to 'completed' (${this.changes} rows)`);
            resolve();
          }
        }
      );
    });
  });

  Promise.all(updates)
    .then(() => {
      console.log('✅ All linked deliveries updated!');
      db.close();
    })
    .catch(err => {
      console.error('❌ Error updating:', err);
      db.close();
    });
});
