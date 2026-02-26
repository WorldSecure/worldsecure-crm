const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

db.get('SELECT phone, phone2, phone3, phone1_primary, phone2_primary, phone3_primary FROM company_settings WHERE id = 1', (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Current DB values:');
    console.log('phone1:', row.phone, '  primary:', row.phone1_primary);
    console.log('phone2:', row.phone2, '  primary:', row.phone2_primary);
    console.log('phone3:', row.phone3, '  primary:', row.phone3_primary);
  }
  db.close();
});
