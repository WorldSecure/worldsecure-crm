const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Adding phone primary columns...\n');

db.serialize(() => {
  db.run('ALTER TABLE company_settings ADD COLUMN phone1_primary INTEGER DEFAULT 1', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ phone1_primary:', err.message);
    } else {
      console.log('✅ phone1_primary added');
    }
  });

  db.run('ALTER TABLE company_settings ADD COLUMN phone2_primary INTEGER DEFAULT 0', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ phone2_primary:', err.message);
    } else {
      console.log('✅ phone2_primary added');
    }
  });

  db.run('ALTER TABLE company_settings ADD COLUMN phone3_primary INTEGER DEFAULT 0', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ phone3_primary:', err.message);
    } else {
      console.log('✅ phone3_primary added');
    }
    
    console.log('\n✅✅✅ Phone primary columns ready!');
    db.close();
  });
});
