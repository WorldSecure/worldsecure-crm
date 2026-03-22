const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'warehouse.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'worker',
    module_warehouse BOOLEAN DEFAULT 1,
    module_sales BOOLEAN DEFAULT 1,
    module_service BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add module permission columns to existing users table if they don't exist
  db.run(`ALTER TABLE users ADD COLUMN module_warehouse BOOLEAN DEFAULT 1`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN module_sales BOOLEAN DEFAULT 1`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN module_service BOOLEAN DEFAULT 1`, () => {});

  // Company settings table
  db.run(`CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    website TEXT,
    logo_path TEXT
  )`);

  // Insert default company settings if not exists
  db.run(`INSERT OR IGNORE INTO company_settings (id, company_name) VALUES (1, 'החברה שלי')`);

  // Categories table
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // הוסף עמודות תרגום לקטגוריות לפני ה-INSERT
  db.run(`ALTER TABLE categories ADD COLUMN name_he TEXT`, () => {});
  db.run(`ALTER TABLE categories ADD COLUMN name_pt TEXT`, () => {});
  db.run(`ALTER TABLE categories ADD COLUMN updated_at TEXT`, () => {});

  // Insert WorldSecure default categories (in order)
  const categories = [
    { en: 'Personal Protection',  he: 'הגנה אישית',         pt: 'Proteção Pessoal' },
    { en: 'Maritime Equipment',   he: 'ציוד ימי',            pt: 'Equipamento Marítimo' },
    { en: 'Special Vehicles',     he: 'כלי רכב מיוחדים',    pt: 'Veículos Especiais' },
    { en: 'Detection (XRAY)',     he: 'גילוי (צילום רנטגן)', pt: 'Detecção (Raio-X)' },
    { en: 'Training & Services',  he: 'הדרכה ושירותים',      pt: 'Treinamento e Serviços' },
    { en: 'Communication',        he: 'תקשורת',              pt: 'Comunicação' },
    { en: 'Surveillance',         he: 'מעקב',                pt: 'Vigilância' },
    { en: 'Access Control',       he: 'בקרת גישה',           pt: 'Controle de Acesso' },
    { en: 'Water Security',       he: 'אבטחת מים',           pt: 'Segurança Aquática' },
  ];

  // INSERT פשוט עם name בלבד - ה-UPDATE יטפל בתרגומים
  categories.forEach((category, index) => {
    db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`,
      [index + 1, category.en]);
    db.run(`UPDATE categories SET name_he = ?, name_pt = ? WHERE id = ?`,
      [category.he, category.pt, index + 1]);
  });

  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    price REAL,
    currency TEXT DEFAULT 'ILS',
    unit TEXT DEFAULT 'unit',
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);
  
  // Add currency column to existing products table if it doesn't exist
  db.run(`ALTER TABLE products ADD COLUMN currency TEXT DEFAULT 'ILS'`, () => {});
  // Add translation columns if they don't exist
  db.run(`ALTER TABLE products ADD COLUMN name_he TEXT`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN name_pt TEXT`, () => {});
  // meta_updated_at — timestamp לשדות SKU/name/unit/category (לוגיקת last-write-wins)
  db.run(`ALTER TABLE products ADD COLUMN meta_updated_at TEXT`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN subcategory_id INTEGER`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN supplier_id INTEGER`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN manufacturer_id INTEGER`, () => {});

  // Price history table
  db.run(`CREATE TABLE IF NOT EXISTS product_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    effective_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
  // Add status column to quotes if it doesn't exist
  db.run(`ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});
  db.run(`ALTER TABLE quotes ADD COLUMN parent_id INTEGER DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN proforma_quote_id INTEGER DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN smtp_host TEXT`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN smtp_port INTEGER DEFAULT 587`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN smtp_user TEXT`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN smtp_pass TEXT`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN smtp_from TEXT`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN phone2 TEXT`, () => {});
  db.run(`ALTER TABLE company_settings ADD COLUMN phone3 TEXT`, () => {});

  // Quote stages table
  db.run(`CREATE TABLE IF NOT EXISTS quote_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    approved_by TEXT,
    approved_at DATETIME,
    lc_number TEXT,
    doc_lang TEXT DEFAULT 'pt',
    bl_file TEXT,
    bl_approved INTEGER DEFAULT 0,
    delivery_approved INTEGER DEFAULT 0,
    outbound_id INTEGER,
    FOREIGN KEY (quote_id) REFERENCES quotes(id),
    UNIQUE(quote_id, stage_number)
  )`);
  db.run(`ALTER TABLE quote_stages ADD COLUMN lc_number TEXT`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN doc_lang TEXT DEFAULT 'pt'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN bl_file TEXT`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN bl_approved INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN delivery_approved INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN outbound_id INTEGER`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_customs REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_bank REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_shipping REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_other REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_base_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_customs_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_customs_rate REAL DEFAULT 1`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_bank_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_bank_rate REAL DEFAULT 1`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_shipping_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_shipping_rate REAL DEFAULT 1`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_other_currency TEXT DEFAULT 'USD'`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN cost_other_rate REAL DEFAULT 1`, () => {});
  db.run(`ALTER TABLE quote_stages ADD COLUMN delivery_lang TEXT DEFAULT 'he'`, () => {});

  // Suppliers table
  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    country TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Add country column to existing suppliers table if it doesn't exist
  db.run(`ALTER TABLE suppliers ADD COLUMN country TEXT`, () => {});
  
  // Add contact_person column to existing suppliers table if it doesn't exist
  db.run(`ALTER TABLE suppliers ADD COLUMN contact_person TEXT`, () => {});

  // Manufacturers table
  db.run(`CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    country TEXT,
    notes TEXT,
    contact_person TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Customers table
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    country TEXT,
    is_sensitive BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Add country column to existing customers table if it doesn't exist
  db.run(`ALTER TABLE customers ADD COLUMN country TEXT`, () => {});
  // Add is_sensitive column to existing customers table if it doesn't exist
  db.run(`ALTER TABLE customers ADD COLUMN is_sensitive BOOLEAN DEFAULT 0`, () => {});
  // Add contact_person column to existing customers table if it doesn't exist
  db.run(`ALTER TABLE customers ADD COLUMN contact_person TEXT`, () => {});

  // Inbound transactions (receiving from suppliers)
  db.run(`CREATE TABLE IF NOT EXISTS inbound_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    supplier_type TEXT DEFAULT 'registered',
    casual_supplier_name TEXT,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    user_id INTEGER,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Inbound transaction items
  db.run(`CREATE TABLE IF NOT EXISTS inbound_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (transaction_id) REFERENCES inbound_transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Outbound transactions (shipping to customers)
  db.run(`CREATE TABLE IF NOT EXISTS outbound_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_type TEXT DEFAULT 'registered',
    casual_customer_name TEXT,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    user_id INTEGER,
    delivery_note_sent BOOLEAN DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Outbound transaction items
  db.run(`CREATE TABLE IF NOT EXISTS outbound_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    use_packaging BOOLEAN DEFAULT 0,
    items_per_carton INTEGER,
    carton_weight REAL,
    num_cartons INTEGER,
    use_pallets BOOLEAN DEFAULT 0,
    cartons_per_pallet INTEGER,
    pallet_dimensions TEXT,
    pallet_weight REAL,
    num_pallets INTEGER,
    FOREIGN KEY (transaction_id) REFERENCES outbound_transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
  
  // Add packaging columns to existing outbound_items table if they don't exist
  db.run(`ALTER TABLE outbound_items ADD COLUMN use_packaging BOOLEAN DEFAULT 0`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN items_per_carton INTEGER`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN carton_weight REAL`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN num_cartons INTEGER`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN use_pallets BOOLEAN DEFAULT 0`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN cartons_per_pallet INTEGER`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN pallet_dimensions TEXT`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN pallet_weight REAL`, () => {});
  db.run(`ALTER TABLE outbound_items ADD COLUMN num_pallets INTEGER`, () => {});
  // Activity log
  db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Quotes table
  db.run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT,
    currency TEXT DEFAULT 'EUR',
    total REAL DEFAULT 0,
    notes TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Quote items table
  db.run(`CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    product_sku TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (quote_id) REFERENCES quotes(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  console.log('Database tables initialized successfully');
});

  // Table for stage-specific file uploads (stage 9, etc.)
  db.run(`CREATE TABLE IF NOT EXISTS quote_stage_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by TEXT,
    uploaded_at TEXT,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error('Error creating quote_stage_files table:', err);
  });

  // Add qr_code_id to transactions tables if not exists
  db.run(`ALTER TABLE outbound_transactions ADD COLUMN qr_code_id INTEGER`, () => {});
  db.run(`ALTER TABLE inbound_transactions ADD COLUMN qr_code_id INTEGER`, () => {});
  db.run(`ALTER TABLE quotes ADD COLUMN qr_code_id INTEGER`, () => {});

  // QR Codes table
  db.run(`CREATE TABLE IF NOT EXISTS qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    qr_data TEXT NOT NULL,
    image_url TEXT NOT NULL,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    created_by INTEGER
  )`, (err) => {
    if (err) console.error('Error creating qr_codes table:', err);
  });

module.exports = db;
