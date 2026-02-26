const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

console.log('Creating tables with proper synchronization...\n');

// Use serialize to ensure sequential execution
db.serialize(() => {
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
    if (err) console.error('❌ documents:', err);
    else console.log('✅ documents table created');
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
    if (err) console.error('❌ stock_alerts:', err);
    else console.log('✅ stock_alerts table created');
  });

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_documents_type_ref ON documents(type, reference_id)', (err) => {
    if (err) console.error('❌ idx_documents_type_ref:', err);
    else console.log('✅ idx_documents_type_ref created');
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_alerts_status ON stock_alerts(status)', (err) => {
    if (err) console.error('❌ idx_alerts_status:', err);
    else console.log('✅ idx_alerts_status created');
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_alerts_quote ON stock_alerts(quote_id)', (err) => {
    if (err) console.error('❌ idx_alerts_quote:', err);
    else console.log('✅ idx_alerts_quote created');
  });

  // Verify tables exist
  db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
    if (err) {
      console.error('❌ Error listing tables:', err);
    } else {
      console.log('\n📋 All tables in database:');
      tables.forEach(t => console.log('  - ' + t.name));
    }
    
    console.log('\n✅✅✅ Setup complete!');
    db.close();
  });
});
