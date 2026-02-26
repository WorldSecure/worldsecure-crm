const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Creating missing tables...');

// Create documents table
db.run(`CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  language TEXT,
  file_size INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  created_by INTEGER
)`, (err) => {
  if (err) {
    console.error('❌ Error creating documents table:', err);
  } else {
    console.log('✅ documents table created');
  }
});

// Create stock_alerts table
db.run(`CREATE TABLE IF NOT EXISTS stock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  required_qty INTEGER NOT NULL,
  available_qty INTEGER NOT NULL,
  shortage_qty INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  status TEXT DEFAULT 'active'
)`, (err) => {
  if (err) {
    console.error('❌ Error creating stock_alerts table:', err);
  } else {
    console.log('✅ stock_alerts table created');
  }
});

// Create indexes
db.run('CREATE INDEX IF NOT EXISTS idx_documents_type_ref ON documents(type, reference_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_alerts_status ON stock_alerts(status)');
db.run('CREATE INDEX IF NOT EXISTS idx_alerts_quote ON stock_alerts(quote_id)', (err) => {
  if (err) {
    console.error('❌ Error creating indexes:', err);
  } else {
    console.log('✅ Indexes created');
  }
  
  console.log('\n✅✅✅ All tables created successfully!');
  console.log('You can now restart the server: node server.js');
  
  db.close();
  process.exit(0);
});
