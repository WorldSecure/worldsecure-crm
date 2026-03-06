const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper: run a query
const query = (text, params) => pool.query(text, params);

// Initialize all tables for cloud (warehouse + support only, no sales)
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── USERS ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'worker',
        module_warehouse BOOLEAN DEFAULT TRUE,
        module_sales BOOLEAN DEFAULT FALSE,
        module_service BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── COMPANY SETTINGS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        company_name TEXT,
        address TEXT,
        phone TEXT,
        phone2 TEXT,
        phone3 TEXT,
        email TEXT,
        tax_id TEXT,
        website TEXT,
        logo_path TEXT,
        smtp_host TEXT,
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT,
        smtp_pass TEXT,
        smtp_from TEXT
      )
    `);
    await client.query(`INSERT INTO company_settings (id, company_name) VALUES (1, 'WorldSecure LTD') ON CONFLICT DO NOTHING`);

    // ── CATEGORIES ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        name_he TEXT,
        name_pt TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Insert WorldSecure default categories
    const categories = [
      { id: 1, en: 'Personal Protection',  he: 'הגנה אישית',         pt: 'Proteção Pessoal' },
      { id: 2, en: 'Maritime Equipment',   he: 'ציוד ימי',            pt: 'Equipamento Marítimo' },
      { id: 3, en: 'Special Vehicles',     he: 'כלי רכב מיוחדים',    pt: 'Veículos Especiais' },
      { id: 4, en: 'Detection (XRAY)',     he: 'גילוי (צילום רנטגן)', pt: 'Detecção (Raio-X)' },
      { id: 5, en: 'Training & Services',  he: 'הדרכה ושירותים',      pt: 'Treinamento e Serviços' },
      { id: 6, en: 'Communication',        he: 'תקשורת',              pt: 'Comunicação' },
      { id: 7, en: 'Surveillance',         he: 'מעקב',                pt: 'Vigilância' },
      { id: 8, en: 'Access Control',       he: 'בקרת גישה',           pt: 'Controle de Acesso' },
      { id: 9, en: 'Water Security',       he: 'אבטחת מים',           pt: 'Segurança Aquática' },
    ];
    for (const cat of categories) {
      await client.query(`
        INSERT INTO categories (id, name, name_he, name_pt) VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET name=$2, name_he=$3, name_pt=$4
      `, [cat.id, cat.en, cat.he, cat.pt]);
    }

    // ── PRODUCTS ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        name_he TEXT,
        name_pt TEXT,
        description TEXT,
        category_id INTEGER REFERENCES categories(id),
        price REAL,
        currency TEXT DEFAULT 'ILS',
        unit TEXT DEFAULT 'unit',
        quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── SUPPLIERS ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        tax_id TEXT,
        country TEXT,
        contact_person TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── CUSTOMERS ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        tax_id TEXT,
        country TEXT,
        is_sensitive BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── INBOUND TRANSACTIONS ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS inbound_transactions (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id),
        supplier_type TEXT DEFAULT 'registered',
        casual_supplier_name TEXT,
        transaction_date TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        qr_code_id INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inbound_items (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES inbound_transactions(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        notes TEXT
      )
    `);

    // ── OUTBOUND TRANSACTIONS ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbound_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        customer_type TEXT DEFAULT 'registered',
        casual_customer_name TEXT,
        transaction_date TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'pending',
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        delivery_note_sent BOOLEAN DEFAULT FALSE,
        qr_code_id INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outbound_items (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES outbound_transactions(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        use_packaging BOOLEAN DEFAULT FALSE,
        items_per_carton INTEGER,
        carton_weight REAL,
        num_cartons INTEGER,
        use_pallets BOOLEAN DEFAULT FALSE,
        cartons_per_pallet INTEGER,
        pallet_dimensions TEXT,
        pallet_weight REAL,
        num_pallets INTEGER
      )
    `);

    // ── ACTIVITY LOG ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        details TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── QR CODES ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        qr_data TEXT NOT NULL,
        image_url TEXT NOT NULL,
        title TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER
      )
    `);

    // ── SUPPORT TICKETS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        ticket_number TEXT,
        customer_id INTEGER,
        customer_name TEXT,
        product_id INTEGER,
        product_name TEXT,
        subject TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        owner_id INTEGER,
        owner_name TEXT,
        created_by INTEGER,
        awaiting_channel TEXT,
        awaiting_note TEXT,
        awaiting_deadline TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_history (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        awaiting_channel TEXT,
        awaiting_note TEXT,
        awaiting_deadline TEXT,
        owner_id INTEGER,
        owner_name TEXT,
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_attachments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER,
        filename TEXT,
        file_path TEXT,
        file_size INTEGER,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── WAREHOUSE ALERTS ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouse_alerts (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
        ticket_number TEXT,
        customer_name TEXT,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER DEFAULT 1,
        requested_by INTEGER,
        requested_by_name TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        message TEXT,
        data TEXT,
        is_read INTEGER DEFAULT 0,
        needs_ack INTEGER DEFAULT 0,
        acked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── STOCK ALERTS ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_alerts (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER,
        product_id INTEGER,
        product_name TEXT,
        required_qty INTEGER,
        available_qty INTEGER,
        shortage_qty INTEGER,
        status TEXT DEFAULT 'active',
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── DOCUMENTS ─────────────────────────────────────────────────────────
    // מסמכים שנוצרו בענן (תעודות משלוח / קבלה)
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        reference_id INTEGER,
        filename TEXT,
        filepath TEXT,
        language TEXT DEFAULT 'he',
        file_size INTEGER,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        synced_to_local BOOLEAN DEFAULT FALSE
      )
    `);

    // ── SYNC TRACKING ─────────────────────────────────────────────────────
    // עוקב אחר מה כבר סונכרן מהענן למחשב
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        direction TEXT NOT NULL,     -- 'local_to_cloud' | 'cloud_to_local'
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        synced_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'ok',
        notes TEXT
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Cloud PostgreSQL database initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, initDatabase };
