/**
 * server-cloud.js  –  WorldSecure Cloud Backend
 * ─────────────────────────────────────────────
 * מריץ בענן (Render.com) – מחסן + תמיכה בלבד.
 * אין מכירות, אין עריכת לקוחות/מוצרים/ספקים.
 * מגיש גם endpoint לרשימת מסמכים לגיבוי.
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const nodemailer = require('nodemailer');
const https     = require('https');

const { pool, query, initDatabase } = require('./database-cloud');

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'worldsecure-cloud-secret';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8')
      .replace(/[<>:"/\\|?*]/g, '_');
    cb(null, Date.now() + '_' + safeName);
  }
});
const upload = multer({ storage });

// ── Auth ──────────────────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const logActivity = async (userId, action, entityType, entityId, details) => {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (e) {}
};

const logTicketHistory = async (ticketId, userId, username, action, details = {}) => {
  try {
    await query(`
      INSERT INTO support_ticket_history
        (ticket_id, user_id, username, action, old_status, new_status, awaiting_channel,
         awaiting_note, awaiting_deadline, owner_id, owner_name, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [ticketId, userId, username, action,
       details.old_status||null, details.new_status||null,
       details.awaiting_channel||null, details.awaiting_note||null, details.awaiting_deadline||null,
       details.owner_id||null, details.owner_name||null]
    );
  } catch (e) {}
};

// ════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, role } = req.body;
  try {
    const existing = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'User already exists' });

    const countRes = await query('SELECT COUNT(*) as count FROM users');
    const isFirst  = parseInt(countRes.rows[0].count) === 0;
    const userRole = isFirst ? 'admin' : (role || 'worker');
    const hashed   = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (username, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [username, email, hashed, userRole]
    );
    res.json({ message: 'User created', userId: result.rows[0].id, role: userRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id, username: user.username, email: user.email, role: user.role,
        module_warehouse: true, module_sales: false, module_service: true
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, username, email, role, created_at FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await query("SELECT id, username, email, role, module_warehouse, module_sales, module_service, created_at FROM users WHERE username != 'sync' ORDER BY id");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { role, module_warehouse, module_sales, module_service } = req.body;
  try {
    await query('UPDATE users SET role=$1, module_warehouse=$2, module_sales=$3, module_service=$4 WHERE id=$5',
      [role, module_warehouse, module_sales, module_service, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: 'Cannot delete self' });
  try {
    await query('DELETE FROM activity_log WHERE user_id=$1', [req.params.id]);
    await query('DELETE FROM support_ticket_history WHERE user_id=$1', [req.params.id]);
    await query('UPDATE support_tickets SET owner_id=NULL, owner_name=NULL WHERE owner_id=$1', [req.params.id]);
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id/username', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' });
  try {
    await query('UPDATE users SET username=$1 WHERE id=$2', [username.trim(), req.params.id]);
    res.json({ message: 'Username updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.params.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  READ-ONLY: לקוחות / מוצרים / ספקים (מסונכרנים מהמחשב)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM customers ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id INTEGER').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_updated_at TIMESTAMPTZ').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id INTEGER').catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS manufacturers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT,
      email TEXT, tax_id TEXT, country TEXT, notes TEXT, contact_person TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    const r = await query(`
      SELECT p.*, c.name as category_name, c.name_he as category_name_he, c.name_pt as category_name_pt,
             s.name as subcategory_name, s.name_he as subcategory_name_he, s.name_pt as subcategory_name_pt,
             sup.name as supplier_name, man.name as manufacturer_name
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories s ON p.subcategory_id = s.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      LEFT JOIN manufacturers man ON p.manufacturer_id = man.id
      ORDER BY p.name
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/low-stock', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM products WHERE quantity <= min_quantity ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM suppliers ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM categories ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  const { name, name_he, name_pt, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_he TEXT').catch(() => {});
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_pt TEXT').catch(() => {});
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()').catch(() => {});
    const r = await query(
      'INSERT INTO categories (name, name_he, name_pt, description, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *',
      [name, name_he||null, name_pt||null, description||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  const { name, name_he, name_pt, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_he TEXT').catch(() => {});
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_pt TEXT').catch(() => {});
    await query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()').catch(() => {});
    await query(
      'UPDATE categories SET name=$1, name_he=$2, name_pt=$3, description=$4, updated_at=NOW() WHERE id=$5',
      [name, name_he||null, name_pt||null, description||null, req.params.id]
    );
    res.json({ message: 'updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const used = await query('SELECT COUNT(*) as count FROM products WHERE category_id=$1', [req.params.id]);
    if (parseInt(used.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete category with products' });
    await query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ message: 'deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ SUBCATEGORIES ROUTES ============

app.get('/api/subcategories', authenticateToken, async (req, res) => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS subcategories (
      id SERIAL PRIMARY KEY, category_id INTEGER NOT NULL,
      name TEXT NOT NULL, name_he TEXT, name_pt TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`).catch(() => {});
    const { category_id } = req.query;
    const r = category_id
      ? await query('SELECT * FROM subcategories WHERE category_id=$1 ORDER BY name', [category_id])
      : await query('SELECT * FROM subcategories ORDER BY category_id, name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subcategories', authenticateToken, async (req, res) => {
  const { category_id, name, name_he, name_pt } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: 'category_id and name required' });
  try {
    await query('ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()').catch(() => {});
    const r = await query(
      'INSERT INTO subcategories (category_id, name, name_he, name_pt, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *',
      [category_id, name, name_he||null, name_pt||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/subcategories/:id', authenticateToken, async (req, res) => {
  const { name, name_he, name_pt } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await query('ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()').catch(() => {});
    await query('UPDATE subcategories SET name=$1, name_he=$2, name_pt=$3, updated_at=NOW() WHERE id=$4',
      [name, name_he||null, name_pt||null, req.params.id]);
    res.json({ message: 'updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subcategories/:id', authenticateToken, async (req, res) => {
  try {
    const used = await query('SELECT COUNT(*) as count FROM products WHERE subcategory_id=$1', [req.params.id]);
    if (parseInt(used.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete subcategory with products' });
    await query('DELETE FROM subcategories WHERE id=$1', [req.params.id]);
    res.json({ message: 'deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ── Customers write ───────────────────────────────────────────────────────────
app.post('/api/customers', authenticateToken, adminOnly, async (req, res) => {
  const { name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes } = req.body;
  try {
    const r = await query(
      'INSERT INTO customers (name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [name, contact_person||null, address||null, phone||null, email||null, tax_id||null, country||null, is_sensitive ? true : false, notes||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/customers/:id', authenticateToken, adminOnly, async (req, res) => {
  const { name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes } = req.body;
  try {
    await query(
      'UPDATE customers SET name=$1, contact_person=$2, address=$3, phone=$4, email=$5, tax_id=$6, country=$7, is_sensitive=$8, notes=$9 WHERE id=$10',
      [name, contact_person||null, address||null, phone||null, email||null, tax_id||null, country||null, is_sensitive ? true : false, notes||null, req.params.id]
    );
    res.json({ message: 'Customer updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/customers/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Products write ────────────────────────────────────────────────────────────
app.post('/api/products', authenticateToken, adminOnly, async (req, res) => {
  const { sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id } = req.body;
  try {
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_updated_at TIMESTAMPTZ').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id INTEGER').catch(() => {});
    const r = await query(
      'INSERT INTO products (sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id, meta_updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()) RETURNING *',
      [sku, name, description||null, category_id||null, subcategory_id||null, price||null, currency||'ILS', unit||null, quantity||0, min_quantity||0, name_he||null, name_pt||null, supplier_id||null, manufacturer_id||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', authenticateToken, adminOnly, async (req, res) => {
  const { sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id, _skip_quantity } = req.body;
  try {
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_updated_at TIMESTAMPTZ').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER').catch(() => {});
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id INTEGER').catch(() => {});
    if (_skip_quantity) {
      await query(
        'UPDATE products SET sku=$1, name=$2, description=$3, category_id=$4, subcategory_id=$5, price=$6, currency=$7, unit=$8, min_quantity=$9, name_he=$10, name_pt=$11, supplier_id=$12, manufacturer_id=$13, meta_updated_at=$14 WHERE id=$15',
        [sku, name, description||null, category_id||null, subcategory_id||null, price||null, currency||'ILS', unit||null, min_quantity||0, name_he||null, name_pt||null, supplier_id||null, manufacturer_id||null, req.body.meta_updated_at||null, req.params.id]
      );
    } else {
      await query(
        'UPDATE products SET sku=$1, name=$2, description=$3, category_id=$4, subcategory_id=$5, price=$6, currency=$7, unit=$8, quantity=$9, min_quantity=$10, name_he=$11, name_pt=$12, supplier_id=$13, manufacturer_id=$14, quantity_updated_at=NOW(), meta_updated_at=NOW() WHERE id=$15',
        [sku, name, description||null, category_id||null, subcategory_id||null, price||null, currency||'ILS', unit||null, quantity||0, min_quantity||0, name_he||null, name_pt||null, supplier_id||null, manufacturer_id||null, req.params.id]
      );
    }
    res.json({ message: 'Product updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Suppliers write ───────────────────────────────────────────────────────────
app.post('/api/suppliers', authenticateToken, adminOnly, async (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  try {
    const r = await query(
      'INSERT INTO suppliers (name, address, phone, email, tax_id, notes, country, contact_person) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, address||null, phone||null, email||null, tax_id||null, notes||null, country||null, contact_person||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/suppliers/:id', authenticateToken, adminOnly, async (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  try {
    await query(
      'UPDATE suppliers SET name=$1, address=$2, phone=$3, email=$4, tax_id=$5, notes=$6, country=$7, contact_person=$8 WHERE id=$9',
      [name, address||null, phone||null, email||null, tax_id||null, notes||null, country||null, contact_person||null, req.params.id]
    );
    res.json({ message: 'Supplier updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/suppliers/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Supplier deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Manufacturers CRUD ────────────────────────────────────────────────────────
app.get('/api/manufacturers', authenticateToken, async (req, res) => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS manufacturers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT,
      email TEXT, tax_id TEXT, country TEXT, notes TEXT, contact_person TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    const r = await query('SELECT * FROM manufacturers ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/manufacturers', authenticateToken, adminOnly, async (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  try {
    const r = await query(
      'INSERT INTO manufacturers (name, address, phone, email, tax_id, notes, country, contact_person) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, address||null, phone||null, email||null, tax_id||null, notes||null, country||null, contact_person||null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/manufacturers/:id', authenticateToken, adminOnly, async (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  try {
    await query(
      'UPDATE manufacturers SET name=$1, address=$2, phone=$3, email=$4, tax_id=$5, notes=$6, country=$7, contact_person=$8 WHERE id=$9',
      [name, address||null, phone||null, email||null, tax_id||null, notes||null, country||null, contact_person||null, req.params.id]
    );
    res.json({ message: 'Manufacturer updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/manufacturers/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await query('DELETE FROM manufacturers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Manufacturer deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  COMPANY SETTINGS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/company', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM company_settings WHERE id=1');
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST: Upload Company Logo as Base64 (persistent across deploys) ───────────
app.post('/api/company/logo-base64', authenticateToken, async (req, res) => {
  const { logo_base64 } = req.body;
  if (!logo_base64) return res.status(400).json({ error: 'No logo data' });
  try {
    await query('UPDATE company_settings SET logo_base64=$1, logo_path=NULL WHERE id=1', [logo_base64]);
    res.json({ message: 'Logo saved successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Email Signatures (multi-signature system) ─────────────────────────────────
app.get('/api/email-signatures', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM email_signatures ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/email-signatures', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, content, is_active } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content required' });
  try {
    if (is_active) await query('UPDATE email_signatures SET is_active=FALSE');
    const r = await query(
      'INSERT INTO email_signatures (name, content, is_active) VALUES ($1,$2,$3) RETURNING *',
      [name, content, is_active ? true : false]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/email-signatures/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, content, is_active } = req.body;
  try {
    if (is_active) await query('UPDATE email_signatures SET is_active=FALSE');
    await query(
      'UPDATE email_signatures SET name=$1, content=$2, is_active=$3 WHERE id=$4',
      [name, content, is_active ? true : false, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/email-signatures/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await query('DELETE FROM email_signatures WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET/PUT: Email Signature (legacy) ────────────────────────────────────────
app.get('/api/company/email-signature', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT email_signature FROM company_settings WHERE id=1');
    res.json({ email_signature: r.rows[0]?.email_signature || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/company/email-signature', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email_signature } = req.body;
  try {
    await query('UPDATE company_settings SET email_signature=$1 WHERE id=1', [email_signature || null]);
    res.json({ message: 'Email signature saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT: Company Settings ─────────────────────────────────────────────────────
app.put('/api/company', authenticateToken, async (req, res) => {
  const { company_name, address, phone, phone2, phone3, email, tax_id, website,
          phone1_primary, phone2_primary, phone3_primary } = req.body;
  try {
    await query(`
      UPDATE company_settings SET
        company_name=$1, address=$2, phone=$3, phone2=$4, phone3=$5,
        email=$6, tax_id=$7, website=$8,
        phone1_primary=$9, phone2_primary=$10, phone3_primary=$11
      WHERE id=1`,
      [company_name, address, phone, phone2, phone3, email, tax_id, website,
       phone1_primary ? true : false, phone2_primary ? true : false, phone3_primary ? true : false]
    );
    const r = await query('SELECT * FROM company_settings WHERE id=1');
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST: Upload Company Logo ─────────────────────────────────────────────────
app.post(['/api/company/logo', '/api/settings/logo'], authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoPath = '/uploads/' + req.file.filename;
    await query('UPDATE company_settings SET logo_path=$1 WHERE id=1', [logoPath]);
    res.json({ logo_path: logoPath, url: logoPath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET/PUT: SMTP Settings ────────────────────────────────────────────────────
app.get('/api/settings/smtp', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT smtp_host, smtp_port, smtp_user, smtp_from FROM company_settings WHERE id=1');
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings/smtp', authenticateToken, async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } = req.body;
  try {
    await query(`
      UPDATE company_settings SET
        smtp_host=$1, smtp_port=$2, smtp_user=$3, smtp_pass=$4, smtp_from=$5
      WHERE id=1`,
      [smtp_host, 465, smtp_user, smtp_pass, smtp_from]
    );
    res.json({ message: 'SMTP settings saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET/POST/DELETE: QR Codes ─────────────────────────────────────────────────
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM qr_codes ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  const { type, qr_data, image_url, title } = req.body;
  try {
    const r = await query(
      'INSERT INTO qr_codes (type, qr_data, image_url, title, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [type, qr_data, image_url, title, req.user?.userId || null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    await query('DELETE FROM qr_codes WHERE id=$1', [req.params.id]);
    res.json({ message: 'deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    await query('UPDATE qr_codes SET title=$1 WHERE id=$2', [title, req.params.id]);
    res.json({ message: 'QR title updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET: Backups list (cloud has no local backups - return empty) ──────────────
app.get('/api/backups', authenticateToken, async (req, res) => {
  res.json([]);
});

// ════════════════════════════════════════════════════════════════════════════
//  INBOUND TRANSACTIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/inbound', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT it.*, s.name as supplier_name, COALESCE(it.username, u.username) as username
      FROM inbound_transactions it
      LEFT JOIN suppliers s ON it.supplier_id = s.id
      LEFT JOIN users u ON it.user_id = u.id
      ORDER BY it.transaction_date DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/inbound', authenticateToken, async (req, res) => {
  const { supplier_id, supplier_type, casual_supplier_name, items, notes, qr_code_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txResult = await client.query(
      'INSERT INTO inbound_transactions (supplier_id, supplier_type, casual_supplier_name, notes, user_id, qr_code_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [supplier_id, supplier_type, casual_supplier_name, notes, req.user.id, qr_code_id||null]
    );
    const transactionId = txResult.rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO inbound_items (transaction_id, product_id, quantity, notes) VALUES ($1,$2,$3,$4)',
        [transactionId, item.product_id, item.quantity, item.notes]
      );
      await client.query(
        'UPDATE products SET quantity = quantity + $1, quantity_updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }
    await client.query('COMMIT');
    await logActivity(req.user.id, 'CREATE_INBOUND', 'inbound', transactionId, { items: items.length });
    res.json({ id: transactionId, message: 'Inbound transaction created' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/inbound/:id/details', authenticateToken, async (req, res) => {
  try {
    const tx = await query(`
      SELECT it.*, s.name as supplier_name, COALESCE(it.username, u.username) as username
      FROM inbound_transactions it
      LEFT JOIN suppliers s ON it.supplier_id = s.id
      LEFT JOIN users u ON it.user_id = u.id
      WHERE it.id=$1`, [req.params.id]);
    if (!tx.rows[0]) return res.status(404).json({ error: 'Not found' });
    const items = await query(`
      SELECT ii.*, p.sku, p.name, p.unit, p.quantity as available
      FROM inbound_items ii JOIN products p ON ii.product_id = p.id
      WHERE ii.transaction_id=$1`, [req.params.id]);
    res.json({ ...tx.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  OUTBOUND TRANSACTIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/outbound', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const sensitiveFilter = isAdmin ? '' : 'AND (c.is_sensitive IS NULL OR c.is_sensitive = false)';
    const r = await query(`
      SELECT ot.*, c.name as customer_name, COALESCE(ot.username, u.username) as username
      FROM outbound_transactions ot
      LEFT JOIN customers c ON ot.customer_id = c.id
      LEFT JOIN users u ON ot.user_id = u.id
      WHERE 1=1 ${sensitiveFilter}
      ORDER BY ot.transaction_date DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/outbound', authenticateToken, async (req, res) => {
  const { customer_id, customer_type, casual_customer_name, items, notes, status, qr_code_id } = req.body;
  const client = await pool.connect();
  try {
    // בדוק מלאי
    for (const item of items) {
      const p = await client.query('SELECT quantity FROM products WHERE id=$1', [item.product_id]);
      if (!p.rows[0] || p.rows[0].quantity < item.quantity) {
        client.release();
        return res.status(400).json({ error: `Insufficient inventory for product ${item.product_id}` });
      }
    }

    await client.query('BEGIN');
    const txResult = await client.query(
      'INSERT INTO outbound_transactions (customer_id, customer_type, casual_customer_name, notes, status, user_id, qr_code_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [customer_id, customer_type, casual_customer_name, notes, status||'pending', req.user.id, qr_code_id||null]
    );
    const transactionId = txResult.rows[0].id;

    for (const item of items) {
      await client.query(`
        INSERT INTO outbound_items
          (transaction_id, product_id, quantity, use_packaging, items_per_carton, carton_weight,
           num_cartons, use_pallets, cartons_per_pallet, pallet_dimensions, pallet_weight, num_pallets)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [transactionId, item.product_id, item.quantity,
         item.use_packaging||false, item.items_per_carton||null, item.carton_weight||null,
         item.num_cartons||null, item.use_pallets||false, item.cartons_per_pallet||null,
         item.pallet_dimensions||null, item.pallet_weight||null, item.num_pallets||null]
      );
      await client.query('UPDATE products SET quantity = quantity - $1, quantity_updated_at = NOW() WHERE id = $2', [item.quantity, item.product_id]);
    }
    await client.query('COMMIT');
    await logActivity(req.user.id, 'CREATE_OUTBOUND', 'outbound', transactionId, { items: items.length });
    res.json({ id: transactionId, message: 'Outbound transaction created' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/outbound/:id/details', authenticateToken, async (req, res) => {
  try {
    const tx = await query(`
      SELECT ot.*, c.name as customer_name, c.address as customer_address,
             c.phone as customer_phone, c.email as customer_email, u.username
      FROM outbound_transactions ot
      LEFT JOIN customers c ON ot.customer_id = c.id
      LEFT JOIN users u ON ot.user_id = u.id
      WHERE ot.id=$1`, [req.params.id]);
    if (!tx.rows[0]) return res.status(404).json({ error: 'Not found' });
    const items = await query(`
      SELECT oi.*, p.sku, p.name, p.unit
      FROM outbound_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.transaction_id=$1`, [req.params.id]);
    res.json({ ...tx.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── DELETE: Inbound Transaction ───────────────────────────────────────────────
app.delete('/api/inbound/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // החזר כמויות למלאי
    const items = await client.query('SELECT product_id, quantity FROM inbound_items WHERE transaction_id=$1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE products SET quantity = quantity - $1, quantity_updated_at = NOW() WHERE id=$2', [item.quantity, item.product_id]);
    }
    await client.query('DELETE FROM inbound_items WHERE transaction_id=$1', [req.params.id]);
    await client.query('DELETE FROM inbound_transactions WHERE id=$1', [req.params.id]);
    await client.query(`INSERT INTO pending_deletions (entity_type, entity_id, deleted_at) VALUES ('inbound', $1, NOW()) ON CONFLICT DO NOTHING`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Inbound transaction deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── DELETE: Outbound Transaction ──────────────────────────────────────────────
app.delete('/api/outbound/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // החזר כמויות למלאי
    const items = await client.query('SELECT product_id, quantity FROM outbound_items WHERE transaction_id=$1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE products SET quantity = quantity + $1, quantity_updated_at = NOW() WHERE id=$2', [item.quantity, item.product_id]);
    }
    await client.query('DELETE FROM outbound_items WHERE transaction_id=$1', [req.params.id]);
    await client.query('DELETE FROM outbound_transactions WHERE id=$1', [req.params.id]);
    await client.query(`INSERT INTO pending_deletions (entity_type, entity_id, deleted_at) VALUES ('outbound', $1, NOW()) ON CONFLICT DO NOTHING`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Outbound transaction deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════════════════
//  DOCUMENTS – שמירה + רשימה לגיבוי
// ════════════════════════════════════════════════════════════════════════════

async function saveDocument(type, referenceId, htmlContent, language, userId, entityName) {
  const docsDir = path.join(__dirname, 'documents', type);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const dateStr   = new Date().toISOString().slice(0, 10);
  const langLabel = language === 'he' ? 'HE' : language === 'pt' ? 'PT' : 'EN';
  const safeName  = entityName ? '_' + entityName.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, '').slice(0, 30).replace(/\s+/g,'_') : '';
  const filename  = `${type}${safeName}_${dateStr}_${langLabel}.pdf`;
  const filepath  = path.join(docsDir, filename);
  const relPath   = `/documents/${type}/${filename}`;

  try {
    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
    if (!pdfshiftKey) throw new Error('PDFSHIFT_API_KEY not set');
    const pdfRes = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('api:' + pdfshiftKey).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: htmlContent,
        format: 'A4',
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
        print_background: true
      })
    });
    if (!pdfRes.ok) throw new Error('PDFShift error: ' + await pdfRes.text());
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    fs.writeFileSync(filepath, pdfBuffer);
    console.log(`PDF generated via PDFShift: ${filename}`);
  } catch (err) {
    console.error('PDF generation failed, saving HTML:', err.message);
    const htmlFile = filepath.replace('.pdf', '.html');
    fs.writeFileSync(htmlFile, htmlContent, 'utf8');
  }

  try {
    const stat = fs.statSync(filepath);
    await query(
      `INSERT INTO documents (type, reference_id, filename, filepath, language, file_size, created_by, synced_to_local)
       VALUES ($1,$2,$3,$4,$5,$6,$7, FALSE)`,
      [type, referenceId, filename, relPath, language, stat.size, userId]
    );
  } catch (e) {}

  return relPath;
}

// רשימת מסמכים לא מסונכרנים (endpoint לשימוש sync-to-cloud.js)
app.get('/api/documents/list/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const r = await query(
      `SELECT id, filename, filepath, type, language, created_at
       FROM documents WHERE type=$1 AND synced_to_local=FALSE ORDER BY created_at DESC`,
      [type]
    );
    const docs = r.rows.map(doc => ({
      ...doc,
      url: `${process.env.CLOUD_API_URL || ''}${doc.filepath}`
    }));
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// סמן מסמך כסונכרן
app.put('/api/documents/mark-synced/:id', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE documents SET synced_to_local=TRUE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Marked as synced' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// הגש קבצי מסמכים
app.get('/documents/:type/:filename', authenticateToken, (req, res) => {
  const filepath = path.join(__dirname, 'documents', req.params.type, req.params.filename);
  if (fs.existsSync(filepath)) res.sendFile(filepath);
  else res.status(404).json({ error: 'Document not found' });
});

// ── Delivery Note ─────────────────────────────────────────────────────────────
app.get('/api/outbound/:id/delivery-note', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { lang = 'he', contact = '', token = '' } = req.query;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  const buildPhoneString = (company) => {
    const phones = [];
    if (company.phone && company.phone1_primary) phones.push(company.phone);
    if (company.phone2 && company.phone2_primary) phones.push(company.phone2);
    if (company.phone3 && company.phone3_primary) phones.push(company.phone3);
    return phones.length > 0 ? phones.join(', ') : (company.phone || 'N/A');
  };

  const translations = {
    he: { title:'תעודת משלוח', documentNumber:'מספר', date:'תאריך', companyDetails:'פרטי החברה', customerDetails:'פרטי הלקוח', name:'שם', address:'כתובת', phone:'טלפון', email:'אימייל', contactPerson:'איש קשר', taxId:'ע.מ / ח.פ', status:'סטטוס', items:'פריטים', sku:'מק"ט', productName:'שם מוצר', quantity:'כמות', notes:'הערות', preparedBy:'נערך על ידי', print:'הדפס / שמור כ-PDF', close:'סגור', sendEmail:'שלח במייל', emailTo:'כתובת מייל', emailSubject:'נושא', emailBody:'הודעה', emailSend:'שלח', emailCancel:'ביטול', emailSuccess:'המייל נשלח בהצלחה!', emailError:'שגיאה בשליחת המייל', emailSmtpMissing:'יש להגדיר SMTP בהגדרות החברה', dir:'rtl' },
    en: { title:'Delivery Note', documentNumber:'Number', date:'Date', companyDetails:'Company Details', customerDetails:'Customer Details', name:'Name', address:'Address', phone:'Phone', email:'Email', contactPerson:'Contact Person', taxId:'Tax ID', status:'Status', items:'Items', sku:'SKU', productName:'Product Name', quantity:'Quantity', notes:'Notes', preparedBy:'Prepared by', print:'Print / Save as PDF', close:'Close', sendEmail:'Send by Email', emailTo:'Email Address', emailSubject:'Subject', emailBody:'Message', emailSend:'Send', emailCancel:'Cancel', emailSuccess:'Email sent successfully!', emailError:'Error sending email', emailSmtpMissing:'Please configure SMTP in company settings', dir:'ltr' },
    pt: { title:'Nota de Entrega', documentNumber:'Número', date:'Data', companyDetails:'Detalhes da Empresa', customerDetails:'Detalhes do Cliente', name:'Nome', address:'Endereço', phone:'Telefone', email:'E-mail', contactPerson:'Pessoa de Contacto', taxId:'NIF', status:'Status', items:'Itens', sku:'SKU', productName:'Nome do Produto', quantity:'Quantidade', notes:'Notas', preparedBy:'Preparado por', print:'Imprimir / Salvar como PDF', close:'Fechar', sendEmail:'Enviar por Email', emailTo:'Endereço de Email', emailSubject:'Assunto', emailBody:'Mensagem', emailSend:'Enviar', emailCancel:'Cancelar', emailSuccess:'Email enviado com sucesso!', emailError:'Erro ao enviar email', emailSmtpMissing:'Configure o SMTP nas configurações da empresa', dir:'ltr' }
  };
  const t = translations[lang] || translations.he;

  try {
    const txRes = await query(`
      SELECT ot.*, c.name as customer_name, c.address as customer_address,
             c.phone as customer_phone, c.email as customer_email,
             c.contact_person as customer_contact,
             u.username,
             qr.image_url as qr_image_url
      FROM outbound_transactions ot
      LEFT JOIN customers c ON ot.customer_id = c.id
      LEFT JOIN users u ON ot.user_id = u.id
      LEFT JOIN qr_codes qr ON ot.qr_code_id = qr.id
      WHERE ot.id=$1`, [id]);
    const transaction = txRes.rows[0];
    if (!transaction) return res.status(404).json({ error: 'Not found' });

    const itemsRes = await query(`
      SELECT oi.*, p.name, p.name_he, p.name_pt, p.sku
      FROM outbound_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.transaction_id=$1`, [id]);
    const items = itemsRes.rows;

    const compRes = await query('SELECT * FROM company_settings WHERE id=1');
    const company = compRes.rows[0] || {};

    const baseUrl = 'https://worldsecure-backend.onrender.com';
    const logoHtml = company.logo_base64
      ? `<div style="text-align:left;margin-bottom:20px;position:relative;z-index:1;"><img src="${company.logo_base64}" alt="Company Logo" style="max-height:120px;max-width:300px;object-fit:contain;"></div>`
      : company.logo_path
      ? `<div style="text-align:left;margin-bottom:20px;position:relative;z-index:1;"><img src="${baseUrl}${company.logo_path}" alt="Company Logo" style="max-height:120px;max-width:300px;object-fit:contain;"></div>`
      : '';

    const qrImgHtml = transaction.qr_image_url
      ? `<img src="${transaction.qr_image_url}" alt="QR Code" style="width:55px;height:55px;display:block;${t.dir==='rtl'?'margin-right:auto;':'margin-left:auto;'}">`
      : '';

    const authToken = req.headers['authorization']?.split(' ')[1] || token;

    const html = `<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} #${id}</title>
  <style>
    * { box-sizing: border-box; }
    body > *:first-child { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
    @media print { .no-print { display: none; } .doc-footer { display: block !important; } @page { margin: 1.5cm 2cm; size: A4; } th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .button-container { text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
    .btn-print, .btn-email, .btn-close { padding: 12px 24px; margin: 0 8px; font-size: 16px; cursor: pointer; border: none; border-radius: 5px; font-weight: 600; }
    .btn-print { background: #3498db; color: white; } .btn-print:hover { background: #2980b9; }
    .btn-email { background: #27ae60; color: white; } .btn-email:hover { background: #229954; }
    .btn-close { background: #95a5a6; color: white; } .btn-close:hover { background: #7f8c8d; }
    .doc-footer { display:block; position:fixed; bottom:0; left:0; right:0; border-top:1px solid #ddd; padding:6px 0; text-align:center; font-size:8pt; color:#888; background:white; }
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; background: white; }
    .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-box { flex: 1; margin: 0 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .info-box h3 { margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: ${t.dir === 'rtl' ? 'right' : 'left'}; }
    th { background-color: #3498db; color: white; text-align: center; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #7f8c8d; }
    .email-modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:99999; justify-content:center; align-items:center; }
    .email-modal-overlay.open { display:flex !important; }
    .email-modal-box { background:white; border-radius:10px; padding:2rem; width:420px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); direction:${t.dir}; }
    .email-modal-box h3 { margin:0 0 1.2rem; font-size:1.2rem; }
    .ac-wrap { position:relative !important; margin-bottom:1rem; overflow:visible !important; }
    .ac-wrap input { width:100%; padding:0.6rem; border:1px solid #ddd; border-radius:5px; box-sizing:border-box; font-size:0.95rem; font-family:inherit; }
    .ac-list { position:fixed !important; background:white !important; border:1px solid #ccc; border-radius:8px; max-height:220px; overflow-y:auto; z-index:999999 !important; box-shadow:0 6px 16px rgba(0,0,0,0.2); display:none; min-width:300px; }
    .ac-item { padding:0.5rem 0.85rem; cursor:pointer; border-bottom:1px solid #f0f0f0; display:block; }
    .ac-item:hover { background:#e8f4fd; }
    .ac-name { display:block; font-weight:600; color:#222; font-size:0.88rem; }
    .ac-email { display:block; color:#777; font-size:0.8rem; }
    .email-modal-box label { display:block; font-weight:600; margin-bottom:0.3rem; font-size:0.9rem; }
    .email-modal-box input, .email-modal-box textarea { width:100%; padding:0.6rem; border:1px solid #ddd; border-radius:5px; font-size:0.95rem; margin-bottom:1rem; box-sizing:border-box; font-family:inherit; }
    .email-modal-box textarea { height:80px; resize:vertical; }
    .email-modal-footer { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:0.5rem; }
    .email-modal-footer button { padding:0.6rem 1.4rem; border:none; border-radius:5px; cursor:pointer; font-size:0.95rem; }
    .btn-modal-send { background:#27ae60; color:white; } .btn-modal-cancel { background:#95a5a6; color:white; }
    #email-status { margin-top:0.5rem; font-size:0.9rem; min-height:1.2rem; }
  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${t.print}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${t.sendEmail}</button>
    <button class="btn-close" onclick="window.close()">❌ ${t.close}</button>
  </div>
  <script>
  window._authToken = '${authToken}';
  var _ac = [], _acIdx = -1;
  (function loadContacts() {
    var tok = window._authToken || sessionStorage.getItem('token') || '';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() { if (xhr.status === 200) { try { _ac = JSON.parse(xhr.responseText); } catch(e) {} } };
    xhr.send();
  })();
  function acFilter(val) {
    var box = document.getElementById('acList'); _acIdx = -1;
    if (!val) { box.style.display='none'; return; }
    var q = val.toLowerCase(), expanded = [];
    for (var j=0; j<_ac.length; j++) { var c=_ac[j]; if (!c.email) continue; var emails=c.email.split(/[;,]/).map(function(e){return e.trim();}).filter(Boolean); for (var k=0;k<emails.length;k++) expanded.push({name:c.name,email:emails[k]}); }
    var matches = expanded.filter(function(c){ return c.name.toLowerCase().indexOf(q)>=0||c.email.toLowerCase().indexOf(q)>=0; }).slice(0,10);
    if (!matches.length) { box.style.display='none'; return; }
    var html='';
    for (var i=0;i<matches.length;i++) { var c=matches[i]; html+='<div class="ac-item" data-email="'+c.email.replace(/"/g,'&quot;')+'" onmousedown="acSelect(this.dataset.email)"><span class="ac-name">'+c.name+'</span><span class="ac-email">'+c.email+'</span></div>'; }
    box.innerHTML=html;
    var inp=document.getElementById('emailTo'), rect=inp.getBoundingClientRect();
    box.style.top=(rect.bottom+2)+'px'; box.style.left=rect.left+'px'; box.style.width=rect.width+'px'; box.style.display='block';
  }
  function acSelect(email) { document.getElementById('emailTo').value=email; document.getElementById('acList').style.display='none'; }
  function acKey(e) {
    var box=document.getElementById('acList'), items=box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key==='ArrowDown') _acIdx=Math.min(_acIdx+1,items.length-1);
    else if (e.key==='ArrowUp') _acIdx=Math.max(_acIdx-1,0);
    else if (e.key==='Enter'&&_acIdx>=0) { e.preventDefault(); acSelect(items[_acIdx].getAttribute('data-email')); return; }
    else return;
    for (var i=0;i<items.length;i++) items[i].style.background=i===_acIdx?'#e8f4fd':'';
    items[_acIdx].scrollIntoView({block:'nearest'});
  }
  window._docLang = '${lang}';
  window._docContact = decodeURIComponent('${encodeURIComponent(contact)}');
  async function sendDocumentEmail(docId, docType) {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;
    const status = document.getElementById('email-status');
    if (!to) { status.style.color='red'; status.textContent='${t.emailTo}...'; return; }
    status.style.color='#555'; status.textContent='⏳ ...';
    const token = window._authToken || sessionStorage.getItem('token') || '';
    try {
      const res = await fetch('https://worldsecure-backend.onrender.com/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ to, subject, body, docType, docId, docLang: window._docLang, docContact: window._docContact })
      });
      const data = await res.json();
      if (res.ok) {
        status.style.color='green'; status.textContent='✅ ${t.emailSuccess}';
        setTimeout(() => document.getElementById('emailModal').classList.remove('open'), 2000);
      } else {
        status.style.color='red';
        status.textContent = data.error?.includes('SMTP') ? '⚠️ ${t.emailSmtpMissing}' : '❌ ' + data.error;
      }
    } catch(e) { status.style.color='red'; status.textContent='❌ ${t.emailError}'; }
  }
  </script>

  <table style="width:100%;border:none;margin-bottom:20px;">
    <tr>
      <td style="vertical-align:middle;border:none;padding:0;">
        ${logoHtml ? logoHtml.replace('<div style="text-align:left;margin-bottom:20px;position:relative;z-index:1;">', '<div>') : ''}
        <div>
          <h1 style="margin:4px 0;font-size:28px;font-weight:bold;">${t.title}</h1>
          <p style="margin:0;font-size:16px;color:#555;">${t.documentNumber}: ${id} | ${t.date}: ${formatDate(transaction.transaction_date)}</p>
        </div>
      </td>
      <td style="vertical-align:top;text-align:${t.dir==='rtl'?'left':'right'};border:none;padding:0;width:70px;">
        ${qrImgHtml}
      </td>
    </tr>
  </table>

  <div class="info-section">
    <div class="info-box">
      <h3>${t.companyDetails}</h3>
      <p><strong>${t.name}:</strong> ${company.company_name || 'N/A'}</p>
      <p><strong>${t.address}:</strong> ${company.address || 'N/A'}</p>
      <p><strong>${t.phone}:</strong> ${buildPhoneString(company)}</p>
      <p><strong>${t.email}:</strong> ${company.email || 'N/A'}</p>
      <p><strong>${t.taxId}:</strong> ${company.tax_id || 'N/A'}</p>
    </div>
    <div class="info-box">
      <h3>${t.customerDetails}</h3>
      <p><strong>${t.name}:</strong> ${transaction.customer_type === 'casual' ? transaction.casual_customer_name : transaction.customer_name || 'N/A'}</p>
      ${transaction.customer_address ? `<p><strong>${t.address}:</strong> ${transaction.customer_address}</p>` : ''}
      ${!contact && transaction.customer_phone ? `<p><strong>${t.phone}:</strong> ${transaction.customer_phone}</p>` : ''}
      ${!contact && transaction.customer_email ? `<p><strong>${t.email}:</strong> ${transaction.customer_email}</p>` : ''}
      ${(() => {
        if (contact) return `<p><strong>${t.contactPerson}:</strong> ${contact.split(' | ').join(', ')}</p>`;
        if (!transaction.customer_contact) return '';
        try {
          const parsed = JSON.parse(transaction.customer_contact);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const c = parsed[0];
            return `<p><strong>${t.contactPerson}:</strong> ${[c.name, c.phone, c.email].filter(Boolean).join(', ')}</p>`;
          }
        } catch(e) {}
        return `<p><strong>${t.contactPerson}:</strong> ${transaction.customer_contact.split(';')[0].trim()}</p>`;
      })()}
      <p><strong>${t.status}:</strong> ${transaction.status}</p>
    </div>
  </div>

  <h3>${t.items}</h3>
  <table>
    <thead>
      <tr><th>#</th><th>${t.sku}</th><th>${t.productName}</th><th>${t.quantity}</th><th>${lang==='he'?'אריזה':'Packaging'}</th></tr>
    </thead>
    <tbody>
      ${items.map((item, index) => {
        let packagingInfo = '-';
        if (item.use_packaging && item.items_per_carton) {
          const cartonsText = lang==='he'?'קרטונים':'cartons';
          const perCartonText = lang==='he'?'יח\' לקרטון':'items/carton';
          const kgText = lang==='he'?'ק"ג':'kg';
          packagingInfo = `${item.num_cartons} ${cartonsText} (${item.items_per_carton} ${perCartonText})`;
          if (item.carton_weight) packagingInfo += `<br><small>${item.carton_weight} ${kgText}/${lang==='he'?'קרטון':'carton'}</small>`;
          if (item.use_pallets && item.num_pallets) {
            const palletsText = lang==='he'?'משטחים':'pallets';
            packagingInfo += `<br><strong>${item.num_pallets} ${palletsText}</strong>`;
            if (item.pallet_dimensions) packagingInfo += `<br><small>${item.pallet_dimensions} cm</small>`;
          }
        }
        return `<tr><td>${index+1}</td><td>${item.sku}</td><td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td><td><strong>${item.quantity}</strong></td><td>${packagingInfo}</td></tr>`;
      }).join('')}
    </tbody>
    ${(() => {
      const totalWeight = items.reduce((sum, item) => {
        if (item.use_packaging && item.num_cartons && item.carton_weight) return sum + (item.num_cartons * item.carton_weight);
        return sum;
      }, 0);
      if (totalWeight > 0) {
        const kgText = lang==='he'?'ק"ג':'kg';
        const totalWeightText = lang==='he'?'משקל כולל':'Total Weight';
        return `<tfoot><tr style="background-color:#ecf0f1;font-weight:bold;"><td colspan="4" style="text-align:${lang==='he'?'right':'left'};">${totalWeightText}:</td><td><strong>${totalWeight.toFixed(2)} ${kgText}</strong></td></tr></tfoot>`;
      }
      return '';
    })()}
  </table>

  ${transaction.notes ? `<div class="info-box"><h3>${t.notes}</h3><p>${transaction.notes}</p></div>` : ''}

  <div class="footer">
    <p>${t.preparedBy}: ${transaction.username}</p>
    <p>${company.company_name || ''} © ${new Date().getFullYear()}</p>
  </div>

  <div class="email-modal-overlay no-print" id="emailModal">
    <div class="email-modal-box">
      <h3>✉️ ${t.sendEmail}</h3>
      <label>${t.emailTo}</label>
      <div class="ac-wrap">
        <input type="text" id="emailTo" placeholder="example@domain.com" autocomplete="off"
          oninput="acFilter(this.value)" onfocus="acFilter(this.value)"
          onblur="setTimeout(function(){var b=document.getElementById('acList');if(b)b.style.display='none'},200)"
          onkeydown="acKey(event)">
        <div id="acList" class="ac-list"></div>
      </div>
      <label>${t.emailSubject}</label>
      <input type="text" id="emailSubject" value="${t.title} #${id}">
      <label>${t.emailBody}</label>
      <textarea id="emailBody">${t.title} #${id}</textarea>
      <div id="email-status"></div>
      <div class="email-modal-footer">
        <button class="btn-modal-cancel" onclick="document.getElementById('emailModal').classList.remove('open')">${t.emailCancel}</button>
        <button class="btn-modal-send" onclick="sendDocumentEmail('${id}', 'outbound')">📤 ${t.emailSend}</button>
      </div>
    </div>
  </div>

  <div class="doc-footer">${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}</div>
</body>
</html>`;

    await saveDocument('delivery', id, html, lang, req.user?.id||null,
      transaction.customer_type==='casual' ? transaction.casual_customer_name : transaction.customer_name);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Receipt Note ──────────────────────────────────────────────────────────────
app.get('/api/inbound/:id/receipt-note', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { lang = 'he', contact = '', token = '' } = req.query;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  const translations = {
    he: { title:'תעודת קליטה', documentNumber:'מספר', date:'תאריך', companyDetails:'פרטי החברה', supplierDetails:'פרטי הספק', name:'שם', address:'כתובת', phone:'טלפון', email:'אימייל', contactPerson:'איש קשר', taxId:'ע.מ / ח.פ', items:'פריטים', sku:'מק"ט', productName:'שם מוצר', quantity:'כמות', notes:'הערות', receivedBy:'התקבל ע"י', print:'הדפס / שמור כ-PDF', close:'סגור', sendEmail:'שלח במייל', dir:'rtl' },
    en: { title:'Receipt Note', documentNumber:'Number', date:'Date', companyDetails:'Company Details', supplierDetails:'Supplier Details', name:'Name', address:'Address', phone:'Phone', email:'Email', contactPerson:'Contact Person', taxId:'Tax ID', items:'Items', sku:'SKU', productName:'Product Name', quantity:'Quantity', notes:'Notes', receivedBy:'Received by', print:'Print / Save as PDF', close:'Close', sendEmail:'Send by Email', dir:'ltr' },
    pt: { title:'Nota de Recebimento', documentNumber:'Número', date:'Data', companyDetails:'Detalhes da Empresa', supplierDetails:'Detalhes do Fornecedor', name:'Nome', address:'Endereço', phone:'Telefone', email:'E-mail', contactPerson:'Pessoa de Contacto', taxId:'NIF', items:'Itens', sku:'SKU', productName:'Nome do Produto', quantity:'Quantidade', notes:'Notas', receivedBy:'Recebido por', print:'Imprimir / Salvar como PDF', close:'Fechar', sendEmail:'Enviar por Email', dir:'ltr' }
  };
  const t = translations[lang] || translations.he;

  try {
    const txRes = await query(`
      SELECT it.*, s.name as supplier_name, s.address as supplier_address,
             s.phone as supplier_phone, s.email as supplier_email,
             s.contact_person as supplier_contact,
             u.username,
             qr.image_url as qr_image_url
      FROM inbound_transactions it
      LEFT JOIN suppliers s ON it.supplier_id = s.id
      LEFT JOIN users u ON it.user_id = u.id
      LEFT JOIN qr_codes qr ON it.qr_code_id = qr.id
      WHERE it.id=$1`, [id]);
    const transaction = txRes.rows[0];
    if (!transaction) return res.status(404).json({ error: 'Not found' });

    const itemsRes = await query(`
      SELECT ii.*, p.name, p.name_he, p.name_pt, p.sku
      FROM inbound_items ii JOIN products p ON ii.product_id = p.id
      WHERE ii.transaction_id=$1`, [id]);
    const items = itemsRes.rows;

    const compRes = await query('SELECT * FROM company_settings WHERE id=1');
    const company = compRes.rows[0] || {};

    const baseUrl = 'https://worldsecure-backend.onrender.com';
    const logoHtml = company.logo_base64
      ? `<img src="${company.logo_base64}" alt="Logo" style="max-height:120px;max-width:300px;object-fit:contain;">`
      : company.logo_path
      ? `<img src="${baseUrl}${company.logo_path}" alt="Logo" style="max-height:120px;max-width:300px;object-fit:contain;">`
      : '';

    const qrImgHtml = transaction.qr_image_url
      ? `<img src="${transaction.qr_image_url}" alt="QR Code" style="width:55px;height:55px;display:block;${t.dir==='rtl'?'margin-right:auto;':'margin-left:auto;'}">`
      : '';

    const authToken = req.headers['authorization']?.split(' ')[1] || token;

    const html = `<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} #${id}</title>
  <style>
    * { box-sizing: border-box; }
    @media print { .no-print { display:none; } .doc-footer { display:block !important; } @page { margin:1.5cm 2cm; size:A4; } th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    .button-container { text-align:center; margin-bottom:20px; padding:15px; background:#f8f9fa; border-radius:8px; }
    .btn-print, .btn-email, .btn-close { padding:12px 24px; margin:0 8px; font-size:16px; cursor:pointer; border:none; border-radius:5px; font-weight:600; }
    .btn-print { background:#3498db; color:white; } .btn-email { background:#27ae60; color:white; } .btn-close { background:#95a5a6; color:white; }
    .doc-footer { display:block; position:fixed; bottom:0; left:0; right:0; border-top:1px solid #ddd; padding:6px 0; text-align:center; font-size:8pt; color:#888; background:white; }
    body { font-family:Arial,sans-serif; max-width:800px; margin:20px auto; padding:20px; }
    .info-section { margin:20px 0; padding:15px; background:#f8f9fa; border-radius:5px; }
    h1 { color:#2c3e50; margin:0 0 10px 0; font-size:24px; }
    table { width:100%; border-collapse:collapse; margin:20px 0; }
    th { background:#3498db; color:white; padding:12px; text-align:${t.dir==='rtl'?'right':'left'}; }
    td { padding:10px; border-bottom:1px solid #ddd; text-align:${t.dir==='rtl'?'right':'left'}; }
    .total { font-weight:bold; background:#f0f0f0; }
    .email-modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:99999; justify-content:center; align-items:center; }
    .email-modal-overlay.open { display:flex !important; }
    .email-modal-box { background:white; border-radius:10px; padding:2rem; width:420px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); direction:${t.dir}; }
    .email-modal-box h3 { margin:0 0 1.2rem; font-size:1.2rem; }
    .ac-wrap { position:relative !important; margin-bottom:1rem; overflow:visible !important; }
    .ac-wrap input { width:100%; padding:0.6rem; border:1px solid #ddd; border-radius:5px; box-sizing:border-box; font-size:0.95rem; font-family:inherit; }
    .ac-list { position:fixed !important; background:white !important; border:1px solid #ccc; border-radius:8px; max-height:220px; overflow-y:auto; z-index:999999 !important; box-shadow:0 6px 16px rgba(0,0,0,0.2); display:none; min-width:300px; }
    .ac-item { padding:0.5rem 0.85rem; cursor:pointer; border-bottom:1px solid #f0f0f0; display:block; }
    .ac-item:hover { background:#e8f4fd; }
    .ac-name { display:block; font-weight:600; color:#222; font-size:0.88rem; }
    .ac-email { display:block; color:#777; font-size:0.8rem; }
    .email-modal-box label { display:block; font-weight:600; margin-bottom:0.3rem; font-size:0.9rem; }
    .email-modal-box input, .email-modal-box textarea { width:100%; padding:0.6rem; border:1px solid #ddd; border-radius:5px; font-size:0.95rem; margin-bottom:1rem; box-sizing:border-box; font-family:inherit; }
    .email-modal-box textarea { height:80px; resize:vertical; }
    .email-modal-footer { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:0.5rem; }
    .email-modal-footer button { padding:0.6rem 1.4rem; border:none; border-radius:5px; cursor:pointer; font-size:0.95rem; }
    .btn-modal-send { background:#27ae60; color:white; } .btn-modal-cancel { background:#95a5a6; color:white; }
    #email-status { margin-top:0.5rem; font-size:0.9rem; min-height:1.2rem; }
  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${t.print}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${t.sendEmail}</button>
    <button class="btn-close" onclick="window.close()">❌ ${t.close}</button>
  </div>
  <script>
  window._authToken = '${authToken}';
  var _ac = [], _acIdx = -1;
  (function loadContacts() {
    var tok = window._authToken || sessionStorage.getItem('token') || '';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() { if (xhr.status===200) { try { _ac=JSON.parse(xhr.responseText); } catch(e){} } };
    xhr.send();
  })();
  function acFilter(val) {
    var box=document.getElementById('acList'); _acIdx=-1;
    if (!val) { box.style.display='none'; return; }
    var q=val.toLowerCase(), expanded=[];
    for (var j=0;j<_ac.length;j++) { var c=_ac[j]; if(!c.email) continue; var emails=c.email.split(/[;,]/).map(function(e){return e.trim();}).filter(Boolean); for(var k=0;k<emails.length;k++) expanded.push({name:c.name,email:emails[k]}); }
    var matches=expanded.filter(function(c){return c.name.toLowerCase().indexOf(q)>=0||c.email.toLowerCase().indexOf(q)>=0;}).slice(0,10);
    if (!matches.length) { box.style.display='none'; return; }
    var html='';
    for (var i=0;i<matches.length;i++) { var c=matches[i]; html+='<div class="ac-item" data-email="'+c.email.replace(/"/g,'&quot;')+'" onmousedown="acSelect(this.dataset.email)"><span class="ac-name">'+c.name+'</span><span class="ac-email">'+c.email+'</span></div>'; }
    box.innerHTML=html;
    var inp=document.getElementById('emailTo'), rect=inp.getBoundingClientRect();
    box.style.top=(rect.bottom+2)+'px'; box.style.left=rect.left+'px'; box.style.width=rect.width+'px'; box.style.display='block';
  }
  function acSelect(email) { document.getElementById('emailTo').value=email; document.getElementById('acList').style.display='none'; }
  function acKey(e) {
    var box=document.getElementById('acList'), items=box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key==='ArrowDown') _acIdx=Math.min(_acIdx+1,items.length-1);
    else if (e.key==='ArrowUp') _acIdx=Math.max(_acIdx-1,0);
    else if (e.key==='Enter'&&_acIdx>=0) { e.preventDefault(); acSelect(items[_acIdx].getAttribute('data-email')); return; }
    else return;
    for (var i=0;i<items.length;i++) items[i].style.background=i===_acIdx?'#e8f4fd':'';
    items[_acIdx].scrollIntoView({block:'nearest'});
  }
  window._docLang = '${lang}';
  window._docContact = '${contact}';
  async function sendDocumentEmail() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;
    const status = document.getElementById('email-status');
    if (!to) { status.style.color='red'; status.textContent='${lang==="he"?"נא הכנס כתובת מייל":"Please enter email address"}'; return; }
    status.style.color='#555'; status.textContent='⏳ ...';
    const token = window._authToken || sessionStorage.getItem('token') || '';
    try {
      const res = await fetch('https://worldsecure-backend.onrender.com/api/send-email', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({ to, subject, body, docType:'inbound', docId:'${id}', docLang:window._docLang, docContact:window._docContact })
      });
      const data = await res.json();
      if (res.ok) {
        status.style.color='green'; status.textContent='✅ ${lang==="he"?"המייל נשלח בהצלחה!":lang==="pt"?"Email enviado com sucesso!":"Email sent successfully!"}';
        setTimeout(()=>document.getElementById('emailModal').classList.remove('open'),2000);
      } else {
        status.style.color='red'; status.textContent=data.error?.includes('SMTP')?'⚠️ ${lang==="he"?"יש להגדיר SMTP":"Configure SMTP"}':'❌ '+data.error;
      }
    } catch(e) { status.style.color='red'; status.textContent='❌ ${lang==="he"?"שגיאה בשליחה":"Send error"}'; }
  }
  </script>

  <table style="width:100%;border:none;margin-bottom:20px;">
    <tr>
      <td style="vertical-align:middle;border:none;padding:0;">
        ${logoHtml}
        <div>
          <h1 style="margin:4px 0;">${t.title}</h1>
          <p style="margin:0;">${t.documentNumber}: ${id} | ${t.date}: ${formatDate(transaction.transaction_date)}</p>
        </div>
      </td>
      <td style="vertical-align:top;text-align:${t.dir==='rtl'?'left':'right'};border:none;padding:0;width:70px;">
        ${qrImgHtml}
      </td>
    </tr>
  </table>

  <div class="info-section">
    <h3>${t.supplierDetails}</h3>
    <p><strong>${t.name}:</strong> ${transaction.supplier_name || '-'}</p>
    ${!contact && transaction.supplier_phone ? `<p><strong>${t.phone}:</strong> ${transaction.supplier_phone}</p>` : ''}
    ${!contact && transaction.supplier_email ? `<p><strong>${t.email}:</strong> ${transaction.supplier_email}</p>` : ''}
    ${(() => {
      if (contact) return `<p><strong>${t.contactPerson}:</strong> ${contact.split(' | ').join(', ')}</p>`;
      if (!transaction.supplier_contact) return '';
      try {
        const parsed = JSON.parse(transaction.supplier_contact);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const c = parsed[0];
          return `<p><strong>${t.contactPerson}:</strong> ${[c.name, c.phone, c.email].filter(Boolean).join(', ')}</p>`;
        }
      } catch(e) {}
      return `<p><strong>${t.contactPerson}:</strong> ${transaction.supplier_contact.split(';')[0].trim()}</p>`;
    })()}
  </div>

  <h3>${t.items}</h3>
  <table>
    <thead>
      <tr><th>${t.sku}</th><th>${t.productName}</th><th>${t.quantity}</th></tr>
    </thead>
    <tbody>
      ${items.map(item => `
        <tr>
          <td>${item.sku}</td>
          <td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td>
          <td>${item.quantity}</td>
        </tr>
      `).join('')}
      <tr class="total">
        <td colspan="2">${t.dir==='rtl'?'סה"כ פריטים':'Total Items'}</td>
        <td>${items.reduce((sum, item) => sum + item.quantity, 0)}</td>
      </tr>
    </tbody>
  </table>

  ${transaction.notes ? `<div class="info-section"><strong>${t.notes}:</strong> ${transaction.notes}</div>` : ''}
  <p style="margin-top:30px;"><strong>${t.receivedBy}:</strong> ${transaction.username}</p>

  <div class="email-modal-overlay no-print" id="emailModal">
    <div class="email-modal-box">
      <h3>✉️ ${t.sendEmail}</h3>
      <label>${lang==='he'?'כתובת מייל':lang==='pt'?'Endereço de Email':'Email Address'}</label>
      <div class="ac-wrap">
        <input type="text" id="emailTo" placeholder="example@domain.com" autocomplete="off"
          oninput="acFilter(this.value)" onfocus="acFilter(this.value)"
          onblur="setTimeout(function(){var b=document.getElementById('acList');if(b)b.style.display='none'},200)"
          onkeydown="acKey(event)">
        <div id="acList" class="ac-list"></div>
      </div>
      <label>${lang==='he'?'נושא':lang==='pt'?'Assunto':'Subject'}</label>
      <input type="text" id="emailSubject" value="${t.title} #${id}">
      <label>${lang==='he'?'הודעה':lang==='pt'?'Mensagem':'Message'}</label>
      <textarea id="emailBody">${t.title} #${id}</textarea>
      <div id="email-status"></div>
      <div class="email-modal-footer">
        <button class="btn-modal-cancel" onclick="document.getElementById('emailModal').classList.remove('open')">${lang==='he'?'ביטול':lang==='pt'?'Cancelar':'Cancel'}</button>
        <button class="btn-modal-send" onclick="sendDocumentEmail()">📤 ${lang==='he'?'שלח':lang==='pt'?'Enviar':'Send'}</button>
      </div>
    </div>
  </div>

  <div class="doc-footer">${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}</div>
</body>
</html>`;

    await saveDocument('receipt', id, html, lang, req.user?.id||null, transaction.supplier_name || transaction.casual_supplier_name);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ════════════════════════════════════════════════════════════════════════════
//  SUPPORT TICKETS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/support-tickets', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const r = isAdmin
      ? await query(`SELECT t.*, u1.username as created_by_name, u2.username as owner_name
          FROM support_tickets t
          LEFT JOIN users u1 ON t.created_by = u1.id
          LEFT JOIN users u2 ON t.owner_id = u2.id
          ORDER BY t.id DESC`)
      : await query(`SELECT t.*, u1.username as created_by_name, u2.username as owner_name
          FROM support_tickets t
          LEFT JOIN users u1 ON t.created_by = u1.id
          LEFT JOIN users u2 ON t.owner_id = u2.id
          WHERE t.owner_id=$1 ORDER BY t.id DESC`, [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/support-tickets/stats', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const where = isAdmin ? '' : `WHERE t.owner_id=${req.user.id}`;
    const r = await query(`SELECT t.status, COUNT(*) as count FROM support_tickets t ${where} GROUP BY t.status`);
    const stats = { open:0, in_progress:0, closed:0, pending:0, awaiting_customer:0, cancelled:0, total:0, agents:[] };
    r.rows.forEach(row => { stats[row.status] = parseInt(row.count); stats.total += parseInt(row.count); });
    if (isAdmin) {
      const agentsRes = await query(`
        SELECT u.id, u.username,
          COUNT(t.id) as total,
          SUM(CASE WHEN t.status='open' THEN 1 ELSE 0 END) as open_count
        FROM users u
        LEFT JOIN support_tickets t ON t.owner_id = u.id
        WHERE u.role != 'admin' OR EXISTS (SELECT 1 FROM support_tickets t2 WHERE t2.owner_id = u.id)
        GROUP BY u.id, u.username
        HAVING COUNT(t.id) > 0
        ORDER BY u.username`);
      stats.agents = agentsRes.rows.map(a => ({ id: a.id, username: a.username, total: parseInt(a.total), open_count: parseInt(a.open_count) }));
    }
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/support-tickets', authenticateToken, upload.array('images', 5), async (req, res) => {
  const { customer_id, customer_name, product_id, product_name, subject, description, status, priority, owner_id } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject required' });
  const ticket_number = 'TKT-' + String(Date.now()).slice(-6);
  const resolvedOwnerId = owner_id || req.user.id;
  try {
    const ownerRes = await query('SELECT username FROM users WHERE id=$1', [resolvedOwnerId]);
    const owner_name = ownerRes.rows[0]?.username || null;
    const result = await query(`
      INSERT INTO support_tickets
        (ticket_number, customer_id, customer_name, product_id, product_name,
         subject, description, status, priority, created_by, owner_id, owner_name, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id`,
      [ticket_number, customer_id||null, customer_name||null, product_id||null, product_name||null,
       subject, description||'', status||'open', priority||'medium', req.user.id, resolvedOwnerId, owner_name]
    );
    const ticketId = result.rows[0].id;
    for (const file of (req.files||[])) {
      await query('INSERT INTO support_attachments (ticket_id, filename, file_path, file_size) VALUES ($1,$2,$3,$4)',
        [ticketId, file.originalname, '/uploads/'+file.filename, file.size]);
    }
    await logActivity(req.user.id, 'CREATE_TICKET', 'support_ticket', ticketId, { subject });
    await logTicketHistory(ticketId, req.user.id, req.user.username||req.user.email, 'created', { new_status: status||'open', owner_id: resolvedOwnerId, owner_name });
    res.json({ id: ticketId, ticket_number });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/support-tickets/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_name, product_id, product_name, subject, description, status, priority, owner_id, awaiting_channel, awaiting_note, awaiting_deadline } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject required' });
  try {
    // בדוק אם לקוח רגיש ומנסים להעביר למשתמש שאינו admin
    if (owner_id) {
      const customerRes = customer_id ? await query('SELECT is_sensitive FROM customers WHERE id=$1', [customer_id]) : null;
      const newOwnerRes = await query('SELECT role FROM users WHERE id=$1', [owner_id]);
      if (customerRes?.rows[0]?.is_sensitive && newOwnerRes.rows[0]?.role !== 'admin') {
        return res.status(400).json({ error: 'לקוח זה מסומן כרגיש — לא ניתן להעביר ownership למשתמש שאינו admin' });
      }
    }
    const oldRes = await query('SELECT status, owner_id, owner_name FROM support_tickets WHERE id=$1', [id]);
    const old = oldRes.rows[0] || {};
    let ownerId = old.owner_id, ownerName = old.owner_name;
    let ownerChanged = false;
    if (owner_id && req.user.role === 'admin') {
      const ownerRes = await query('SELECT username FROM users WHERE id=$1', [owner_id]);
      ownerId = owner_id;
      ownerName = ownerRes.rows[0]?.username || null;
      ownerChanged = true;
    }
    const closedAt = status === 'closed' ? 'NOW()' : 'NULL';
    const ownerUpdatedSql = ownerChanged ? ', owner_updated_at=NOW()' : '';
    await query(`
      UPDATE support_tickets SET
        customer_id=$1, customer_name=$2, product_id=$3, product_name=$4,
        subject=$5, description=$6, status=$7, priority=$8,
        owner_id=$9, owner_name=$10, awaiting_channel=$11,
        awaiting_note=$12, awaiting_deadline=$13,
        updated_at=NOW() ${status==='closed'?', closed_at=NOW()':''} ${ownerChanged?', owner_updated_at=NOW()':''}
      WHERE id=$14`,
      [customer_id||null, customer_name||null, product_id||null, product_name||null,
       subject, description||'', status||'open', priority||'medium',
       ownerId, ownerName, awaiting_channel||null, awaiting_note||null, awaiting_deadline||null, id]
    );
    for (const file of (req.files||[])) {
      await query('INSERT INTO support_attachments (ticket_id, filename, file_path, file_size) VALUES ($1,$2,$3,$4)',
        [id, file.originalname, '/uploads/'+file.filename, file.size]);
    }
    const action = old.status !== status ? 'status_changed' : old.owner_id !== parseInt(ownerId) ? 'owner_changed' : 'updated';
    await logTicketHistory(id, req.user.id, req.user.username||req.user.email, action, {
      old_status: old.status, new_status: status||'open',
      owner_id: ownerId, owner_name: ownerName,
      awaiting_channel: awaiting_channel||null, awaiting_note: awaiting_note||null, awaiting_deadline: awaiting_deadline||null
    });
    res.json({ message: 'Ticket updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/support-tickets/:id/history', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT h.*, u.username as actor_name FROM support_ticket_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.ticket_id=$1 ORDER BY h.created_at ASC`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/support-tickets/:id/comments', authenticateToken, async (req, res) => {
  const { comment } = req.body;
  if (!comment?.trim()) return res.status(400).json({ error: 'Comment required' });
  try {
    const userRes = await query('SELECT username FROM users WHERE id=$1', [req.user.id]);
    const r = await query(`
      INSERT INTO support_ticket_history (ticket_id, user_id, username, action, comment, created_at)
      VALUES ($1,$2,$3,'comment',$4,NOW()) RETURNING id`,
      [req.params.id, req.user.id, userRes.rows[0]?.username||req.user.email, comment.trim()]
    );
    res.json({ id: r.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/support-tickets/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT id FROM support_tickets WHERE id=$1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    // שמור את ה-ID ב-pending_deletions לפני המחיקה
    await client.query(`
      INSERT INTO pending_deletions (entity_type, entity_id, deleted_at)
      VALUES ('support_ticket', $1, NOW())
      ON CONFLICT DO NOTHING`, [req.params.id]);
    await client.query('DELETE FROM support_ticket_history WHERE ticket_id=$1', [req.params.id]);
    await client.query('DELETE FROM support_tickets WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════════════════
//  WAREHOUSE ALERTS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/warehouse-alerts', authenticateToken, async (req, res) => {
  const { ticket_id, product_id, product_name, quantity } = req.body;
  if (!ticket_id || !product_id) return res.status(400).json({ error: 'ticket_id and product_id required' });
  try {
    const tkRes = await query('SELECT ticket_number, customer_name, customer_id FROM support_tickets WHERE id=$1', [ticket_id]);
    const ticket = tkRes.rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS customer_id INTEGER').catch(() => {});
    const r = await query(`
      INSERT INTO warehouse_alerts (ticket_id, ticket_number, customer_name, customer_id, product_id, product_name, quantity, requested_by, requested_by_name, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
      [ticket_id, ticket.ticket_number, ticket.customer_name, ticket.customer_id||null, product_id, product_name, quantity||1, req.user.id, req.user.username||req.user.email]
    );
    res.json({ id: r.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/warehouse-alerts', authenticateToken, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM warehouse_alerts WHERE status='pending' ORDER BY created_at DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/outbound/by-customer/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const name = req.query.name || '';
    const r = await query(`
      SELECT ot.id, ot.transaction_date, ot.status, ot.customer_type,
        CASE WHEN ot.customer_type='casual' THEN ot.casual_customer_name ELSE c.name END as customer_name,
        STRING_AGG(p.name || ' x' || oi.quantity::text, ', ') as items_summary
      FROM outbound_transactions ot
      LEFT JOIN outbound_items oi ON oi.transaction_id = ot.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers c ON c.id = ot.customer_id
      WHERE ot.customer_id = $1
         OR c.name ILIKE $2
         OR ot.casual_customer_name ILIKE $2
      GROUP BY ot.id, c.name
      ORDER BY ot.transaction_date DESC LIMIT 20`,
      [customerId, '%' + name + '%']
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/warehouse-alerts/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { outbound_id, outbound_ref, _from_sync, sync_username } = req.body;
    const alertRes = await query('SELECT * FROM warehouse_alerts WHERE id=$1', [req.params.id]);
    const alert = alertRes.rows[0];
    if (!alert) return res.status(404).json({ error: 'Not found' });

    // אם כבר הושלם — החזר 200 בלי לעשות כלום (idempotent)
    if (alert.status === 'completed' && _from_sync) return res.json({ message: 'Already completed' });

    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS outbound_id INTEGER').catch(() => {});
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS outbound_ref TEXT').catch(() => {});
    await query(`UPDATE warehouse_alerts SET status='completed', completed_at=NOW(), outbound_id=$2, outbound_ref=$3 WHERE id=$1`,
      [req.params.id, outbound_id || null, outbound_ref || null]);

    // כשהסינק קורא — השתמש ב-sync_username (המחסנאי האמיתי), לא במשתמש הסינק
    const actorUsername = (_from_sync && sync_username) ? sync_username : (req.user.username || req.user.email);
    await logTicketHistory(alert.ticket_id, req.user.id, actorUsername, 'product_dispatched',
      { awaiting_note: alert.product_name + ' x' + alert.quantity + (outbound_ref ? ' | Ref: ' + outbound_ref : '') });

    await query(`INSERT INTO notifications (user_id, type, title, message, data, needs_ack, created_at)
      VALUES ($1,'warehouse_dispatched','warehouse_dispatched',$2,$3,1,NOW())`,
      [alert.requested_by,
       JSON.stringify({ product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: outbound_ref || null }),
       JSON.stringify({ ticket_id: alert.ticket_id, alert_id: req.params.id, product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: outbound_ref || null })]
    );
    res.json({ message: 'Completed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  STOCK ALERTS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/stock-alerts', authenticateToken, async (req, res) => {
  try {
    const r = await query(
      `SELECT a.*, a.quote_id as quote_number
       FROM stock_alerts a
       WHERE a.status = 'active'
       ORDER BY a.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock-alerts/:id/resolve', authenticateToken, async (req, res) => {
  try {
    await query(
      `UPDATE stock_alerts SET status='resolved', resolved_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ message: 'Alert resolved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notifications/pending-ack', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM notifications WHERE user_id=$1 AND needs_ack=1 AND is_read=0 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT COUNT(*) as count FROM notifications WHERE user_id=$1 AND is_read=0', [req.user.id]);
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=1 WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=1 WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const nRes = await query('SELECT * FROM notifications WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const n = nRes.rows[0];
    if (!n) return res.status(404).json({ error: 'Not found' });
    await query('UPDATE notifications SET is_read=1, needs_ack=0, acked_at=NOW() WHERE id=$1', [req.params.id]);
    try {
      const data = JSON.parse(n.data||'{}');
      if (data.ticket_id) {
        await logTicketHistory(data.ticket_id, req.user.id, req.user.username||req.user.email, 'dispatch_acknowledged',
          { awaiting_note: `${data.product_name} x${data.quantity}` });
      }
    } catch(e) {}
    res.json({ message: 'Acknowledged' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [prod, lowStock, cust, supp, inbound, outbound] = await Promise.all([
      query('SELECT COUNT(*) as count FROM products'),
      query('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity'),
      query('SELECT COUNT(*) as count FROM customers'),
      query('SELECT COUNT(*) as count FROM suppliers'),
      query('SELECT COUNT(*) as count FROM inbound_transactions'),
      query('SELECT COUNT(*) as count FROM outbound_transactions')
    ]);
    res.json({
      totalProducts: parseInt(prod.rows[0].count),
      lowStockProducts: parseInt(lowStock.rows[0].count),
      totalCustomers: parseInt(cust.rows[0].count),
      totalSuppliers: parseInt(supp.rows[0].count),
      totalInbound: parseInt(inbound.rows[0].count),
      totalOutbound: parseInt(outbound.rows[0].count)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Activity Log ──────────────────────────────────────────────────────────────
app.get('/api/activity-log', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const r = await query(`
      SELECT al.*, u.username FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC LIMIT $1`, [limit]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Email Contacts ────────────────────────────────────────────────────────────
app.get('/api/email-contacts', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT name, email, 'customer' as type FROM customers WHERE email IS NOT NULL AND email != ''
      UNION ALL
      SELECT name, email, 'supplier' as type FROM suppliers WHERE email IS NOT NULL AND email != ''
      ORDER BY name`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});





// ════════════════════════════════════════════════════════════════════════════
//  SYNC ENDPOINTS - הוסף את הקוד הזה לתוך server-cloud.js
//  מעל השורה: 
// ── Backup endpoints (cloud stubs) ───────────────────────────────────────────
app.get('/api/backup/list', authenticateToken, async (req, res) => {
  res.json([]);
});
app.get('/api/backup/download', authenticateToken, async (req, res) => {
  res.status(501).json({ error: 'Backup not available in cloud' });
});
app.post('/api/backup/upload', authenticateToken, upload.single('backup'), async (req, res) => {
  res.status(501).json({ error: 'Backup restore not available in cloud' });
});
app.post('/api/backup/restore/:filename', authenticateToken, async (req, res) => {
  res.status(501).json({ error: 'Backup restore not available in cloud' });
});
app.post('/api/test-smtp', authenticateToken, async (req, res) => {
  res.json({ message: 'SMTP test not configured' });
});

// ── Health Check ──
// ════════════════════════════════════════════════════════════════════════════

// ── Sync: Settings ───────────────────────────────────────────────────────────

// ── Pull settings to local ────────────────────────────────────────────────────
app.get('/api/sync/pull/settings', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM company_settings WHERE id=1');
    res.json(r.rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── QR Codes sync ─────────────────────────────────────────────────────────────
app.post('/api/sync/qr-codes', authenticateToken, async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows required' });
  try {
    for (const r of rows) {
      await query(
        `INSERT INTO qr_codes (id, type, qr_data, image_url, title, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET type=$2, qr_data=$3, image_url=$4`,
        [r.id, r.type, r.qr_data, r.image_url||null, r.title||null, r.created_by||null, r.created_at||null]
      );
    }
    res.json({ message: 'qr-codes synced', count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sync/pull/qr-codes', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM qr_codes ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// מחיקות QR מסונכרנות
app.post('/api/sync/qr-codes/deletions', authenticateToken, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids required' });
  try {
    for (const id of ids) {
      await query('DELETE FROM qr_codes WHERE id=$1', [id]);
    }
    res.json({ message: 'deleted', count: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync/settings', authenticateToken, async (req, res) => {
  const { row } = req.body;
  if (!row) return res.status(400).json({ error: 'row required' });
  try {
    // logo_path — עדכן רק אם הענן לא כבר מכיל לוגו (הענן הוא מקור הסמכות ללוגו)
    const existingLogo = await query('SELECT logo_path FROM company_settings WHERE id=1');
    const cloudLogo = existingLogo.rows[0]?.logo_path || null;
    await query(`
      INSERT INTO company_settings
        (id, company_name, address, phone, phone2, phone3, email, tax_id, website,
         smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
         phone1_primary, phone2_primary, phone3_primary)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (id) DO UPDATE SET
        company_name=$1, address=$2, phone=$3, phone2=$4, phone3=$5,
        email=$6, tax_id=$7, website=$8,
        smtp_host=$9, smtp_port=$10, smtp_user=$11, smtp_pass=$12, smtp_from=$13,
        phone1_primary=$14, phone2_primary=$15, phone3_primary=$16`,
      [row.company_name, row.address, row.phone, row.phone2, row.phone3,
       row.email, row.tax_id, row.website,
       row.smtp_host, 465, row.smtp_user, row.smtp_pass, row.smtp_from,
       row.phone1_primary ? true : false, row.phone2_primary ? true : false, row.phone3_primary ? true : false]
    );
    res.json({ message: 'settings synced' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Inbound ─────────────────────────────────────────────────────────────
app.post('/api/sync/inbound', authenticateToken, async (req, res) => {
  const { transactions, items, localIds } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of transactions) {
      await client.query(`
        INSERT INTO inbound_transactions
          (id, supplier_id, supplier_type, casual_supplier_name, transaction_date, notes, user_id, username)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          supplier_id=$2, supplier_type=$3, casual_supplier_name=$4,
          transaction_date=$5, notes=$6, user_id=$7, username=$8`,
        [t.id, t.supplier_id||null, t.supplier_type||'registered',
         t.casual_supplier_name||null, t.transaction_date, t.notes||null, t.user_id||null, t.username||null]
      );
    }

    for (const item of (items||[])) {
      await client.query(`
        INSERT INTO inbound_items (id, transaction_id, product_id, quantity, notes)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET
          transaction_id=$2, product_id=$3, quantity=$4, notes=$5`,
        [item.id, item.transaction_id, item.product_id, item.quantity, item.notes||null]
      );
    }

    // הכמות מתעדכנת ע"י sync/products בלבד

    // מחיקות מטופלות דרך pending_deletions - לא מוחקים עסקאות שנוצרו בענן

    await client.query('COMMIT');
    res.json({ message: 'inbound synced', count: transactions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Sync: Outbound ────────────────────────────────────────────────────────────
app.post('/api/sync/outbound', authenticateToken, async (req, res) => {
  const { transactions, items, localIds } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of transactions) {
      await client.query(`
        INSERT INTO outbound_transactions
          (id, customer_id, customer_type, casual_customer_name, transaction_date, status, notes, user_id, delivery_note_sent, username)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          customer_id=$2, customer_type=$3, casual_customer_name=$4,
          transaction_date=$5, status=$6, notes=$7, user_id=$8, delivery_note_sent=$9, username=$10`,
        [t.id, t.customer_id||null, t.customer_type||'registered',
         t.casual_customer_name||null, t.transaction_date, t.status||'pending',
         t.notes||null, t.user_id||null, t.delivery_note_sent||false, t.username||null]
      );
    }

    for (const item of (items||[])) {
      await client.query(`
        INSERT INTO outbound_items
          (id, transaction_id, product_id, quantity, use_packaging, items_per_carton,
           carton_weight, num_cartons, use_pallets, cartons_per_pallet,
           pallet_dimensions, pallet_weight, num_pallets)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO UPDATE SET
          transaction_id=$2, product_id=$3, quantity=$4`,
        [item.id, item.transaction_id, item.product_id, item.quantity,
         item.use_packaging||false, item.items_per_carton||null, item.carton_weight||null,
         item.num_cartons||null, item.use_pallets||false, item.cartons_per_pallet||null,
         item.pallet_dimensions||null, item.pallet_weight||null, item.num_pallets||null]
      );
    }

    // מחיקות מטופלות דרך pending_deletions - לא מוחקים עסקאות שנוצרו בענן

    await client.query('COMMIT');
    res.json({ message: 'outbound synced', count: transactions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// ── Users sync ────────────────────────────────────────────────────────────────
app.post('/api/sync/users', authenticateToken, async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });
  try {
    for (const u of rows) {
      // בדוק לפי email — IDs שונים בין מקומי לענן
      const existing = await query('SELECT id FROM users WHERE email=$1', [u.email]);
      if (existing.rows.length > 0) {
        // עדכן username ו-role בלבד — לא סיסמה
        await query('UPDATE users SET username=$1, role=$2 WHERE email=$3',
          [u.username, u.role, u.email]);
      }
      // אם לא קיים — לא מוסיפים מהמקומי לענן (משתמשים חדשים נרשמים ישירות בענן)
    }
    res.json({ message: 'users synced', count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sync/pull/users', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT id, username, email, role FROM users ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync/support', authenticateToken, async (req, res) => {
  const { tickets, history, deletedIds } = req.body;
  if (!Array.isArray(tickets)) return res.status(400).json({ error: 'tickets array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of tickets) {
      // תרגם owner ו-created_by לפי username בלבד
      let resolvedOwnerId = null;
      if (t.owner_name) {
        const r = await client.query('SELECT id FROM users WHERE username=$1', [t.owner_name]);
        resolvedOwnerId = r.rows[0]?.id || null;
      }
      let resolvedCreatedBy = null;
      if (t.created_by_name) {
        const r = await client.query('SELECT id FROM users WHERE username=$1', [t.created_by_name]);
        resolvedCreatedBy = r.rows[0]?.id || null;
      }

      // בדוק אם צריך לעדכן owner - השווה owner_updated_at ב-JavaScript
      const existingRes = await client.query(
        'SELECT owner_id, owner_name, owner_updated_at FROM support_tickets WHERE id=$1', [t.id]
      );
      const existing = existingRes.rows[0];
      // נרמל זמן — SQLite שולח "2026-03-08 10:45:55" בלי T, צריך להחליף לISO
      const normalizeTs = (v) => {
        if (!v) return '';
        return String(v).replace(' ', 'T').slice(0, 19);
      };
      const incomingOwnerTs = normalizeTs(t.owner_updated_at);
      const existingOwnerTs = normalizeTs(existing?.owner_updated_at);
      const shouldUpdateOwner = !existing || incomingOwnerTs > existingOwnerTs;

      const finalOwnerId = shouldUpdateOwner ? resolvedOwnerId : existing?.owner_id;
      const finalOwnerName = shouldUpdateOwner ? t.owner_name||null : existing?.owner_name;
      const finalOwnerUpdatedAt = shouldUpdateOwner ? (t.owner_updated_at||null) : existing?.owner_updated_at;

      // INSERT: קבע owner ו-created_by לפי username
      // ON CONFLICT: עדכן owner רק אם חדש יותר (נבדק למעלה)
      await client.query(`
        INSERT INTO support_tickets
          (id, ticket_number, customer_id, customer_name, product_id, product_name,
           subject, description, status, priority, owner_id, owner_name, created_by,
           awaiting_channel, awaiting_note, awaiting_deadline,
           created_at, updated_at, closed_at, cancelled_at, owner_updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (id) DO UPDATE SET
          ticket_number=$2, customer_id=$3, customer_name=$4, product_id=$5,
          product_name=$6, subject=$7, description=$8, status=$9, priority=$10,
          awaiting_channel=$14, awaiting_note=$15, awaiting_deadline=$16,
          updated_at=$18, closed_at=$19, cancelled_at=$20,
          owner_id=$11, owner_name=$12, owner_updated_at=$21`,
        [t.id, t.ticket_number, t.customer_id||null, t.customer_name||null,
         t.product_id||null, t.product_name||null, t.subject, t.description||null,
         t.status||'open', t.priority||'medium', finalOwnerId, finalOwnerName,
         resolvedCreatedBy, t.awaiting_channel||null, t.awaiting_note||null,
         t.awaiting_deadline||null, t.created_at, t.updated_at||null,
         t.closed_at||null, t.cancelled_at||null, finalOwnerUpdatedAt]
      );
    }

    // history
    const validTicketIds = new Set(tickets.map(t => t.id));
    for (const h of (history || [])) {
      if (!validTicketIds.has(h.ticket_id)) continue;
      // בדוק כפילות לפי ticket_id + action + זמן מנורמל לשנייה
      const normalizedTime = new Date(h.created_at).toISOString();
      const exists = await client.query(
        `SELECT id FROM support_ticket_history
         WHERE ticket_id=$1 AND action=$2
         AND date_trunc('second', created_at) = date_trunc('second', $3::timestamptz)`,
        [h.ticket_id, h.action, normalizedTime]
      );
      if (exists.rows.length > 0) continue;
      // תרגם user_id לפי username בענן
      let cloudUserId = null;
      if (h.username) {
        const uRes = await client.query('SELECT id FROM users WHERE username=$1 OR email=$1', [h.username]);
        cloudUserId = uRes.rows[0]?.id || null;
      }
      await client.query(`
        INSERT INTO support_ticket_history
          (ticket_id, user_id, username, action, old_status, new_status, comment, owner_name, awaiting_channel, awaiting_note, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [h.ticket_id, cloudUserId, h.username||null, h.action,
         h.old_status||null, h.new_status||null, h.comment||null, h.owner_name||null,
         h.awaiting_channel||null, h.awaiting_note||null, normalizedTime]
      );
    }

    // מחק מהענן רק tickets שנמחקו מקומית באופן מפורש
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      for (const id of deletedIds) {
        await client.query('DELETE FROM support_ticket_history WHERE ticket_id=$1', [id]);
        await client.query('DELETE FROM support_tickets WHERE id=$1', [id]);
        await client.query(
          `DELETE FROM pending_deletions WHERE entity_type='support_ticket' AND entity_id=$1`, [id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'support synced', count: tickets.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── SYNC ENDPOINT (מקבל נתונים מהמחשב המקומי) ────────────────────────────────
app.post('/api/sync/email-signatures', authenticateToken, async (req, res) => {
  const { rows } = req.body;
  if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: 'rows required' });
  try {
    for (const r of rows) {
      await query(`
        INSERT INTO email_signatures (id, name, content, is_active, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET name=$2, content=$3, is_active=$4`,
        [r.id, r.name, r.content, r.is_active ? true : false, r.created_at || new Date().toISOString()]
      );
    }
    // מחק חתימות שנמחקו מקומית
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      await query(`DELETE FROM email_signatures WHERE id NOT IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`, ids);
    } else {
      await query('DELETE FROM email_signatures');
    }
    res.json({ message: 'email-signatures synced', count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Push warehouse_alerts from local → cloud ────────────────────────────
app.post('/api/sync/warehouse-alerts', authenticateToken, async (req, res) => {
  const { alerts } = req.body;
  if (!Array.isArray(alerts) || alerts.length === 0) return res.json({ upserted: [] });

  try {
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS outbound_id INTEGER').catch(() => {});
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS outbound_ref TEXT').catch(() => {});
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS customer_id INTEGER').catch(() => {});
    await query('ALTER TABLE warehouse_alerts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ').catch(() => {});

    const upserted = [];

    for (const a of alerts) {
      const existing = await query(
        `SELECT id FROM warehouse_alerts
         WHERE ticket_id=$1 AND product_id=$2 AND created_at::text LIKE $3`,
        [a.ticket_id, a.product_id, (a.created_at || '').slice(0, 19) + '%']
      );

      if (existing.rows.length > 0) {
        const cloudId = existing.rows[0].id;
        upserted.push({ local_id: a.id, cloud_id: cloudId });
        if (a.status && a.status !== 'pending') {
          // בדוק אם כבר completed בענן — אל תכפיל notification
          const currentCloud = await query('SELECT status FROM warehouse_alerts WHERE id=$1', [cloudId]);
          const alreadyCompleted = currentCloud.rows[0]?.status === 'completed';

          await query(
            `UPDATE warehouse_alerts SET status=$2, outbound_id=$3, outbound_ref=$4, completed_at=$5 WHERE id=$1`,
            [cloudId, a.status, a.outbound_id||null, a.outbound_ref||null, a.completed_at||null]
          ).catch(() => {});

          // צור notification + היסטוריה רק אם לא היה completed קודם
          if (!alreadyCompleted) {
            const alertRow = await query('SELECT * FROM warehouse_alerts WHERE id=$1', [cloudId]);
            const alert = alertRow.rows[0];
            if (alert) {
              await logTicketHistory(alert.ticket_id, null, a.sync_username || a.requested_by_name || 'warehouse', 'product_dispatched',
                { awaiting_note: alert.product_name + ' x' + alert.quantity + (a.outbound_ref ? ' | Ref: ' + a.outbound_ref : '') }
              ).catch(() => {});
              await query(`INSERT INTO notifications (user_id, type, title, message, data, needs_ack, created_at)
                VALUES ($1,'warehouse_dispatched','warehouse_dispatched',$2,$3,1,NOW())`,
                [alert.requested_by,
                 JSON.stringify({ product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: a.outbound_ref||null }),
                 JSON.stringify({ ticket_id: alert.ticket_id, alert_id: cloudId, product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: a.outbound_ref||null })]
              ).catch(() => {});
            }
          }
        }
      } else {
        // אם ticket_id לא קיים בענן עדיין — דלג (יסונכרן בסינק הבא)
        const ticketExists = await query('SELECT id FROM support_tickets WHERE id=$1', [a.ticket_id]);
        if (!ticketExists.rows.length) continue;

        const r = await query(
          `INSERT INTO warehouse_alerts
            (ticket_id, ticket_number, customer_name, customer_id, product_id, product_name,
             quantity, requested_by, requested_by_name, status,
             outbound_id, outbound_ref, created_at, completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id`,
          [a.ticket_id, a.ticket_number||null, a.customer_name||null, a.customer_id||null,
           a.product_id, a.product_name||null, a.quantity||1,
           a.requested_by||null, a.requested_by_name||null,
           a.status||'pending', a.outbound_id||null, a.outbound_ref||null,
           a.created_at||null, a.completed_at||null]
        );
        upserted.push({ local_id: a.id, cloud_id: r.rows[0].id });
      }
    }

    res.json({ upserted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync/:entity', authenticateToken, async (req, res) => {
  const { entity } = req.params;
  const { rows } = req.body;
  const allowed = ['customers', 'products', 'suppliers', 'manufacturers', 'settings', 'inbound', 'outbound', 'support', 'categories', 'subcategories'];
  if (!allowed.includes(entity)) return res.status(400).json({ error: 'Invalid entity' });
  if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (entity === 'categories') {
      await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_he TEXT').catch(() => {});
      await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_pt TEXT').catch(() => {});
      await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ').catch(() => {});
      for (const r of rows) {
        await client.query(`
          INSERT INTO categories (id, name, name_he, name_pt, description, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET
            name        = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(categories.updated_at,'1970-01-01')) THEN $2 ELSE categories.name END,
            name_he     = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(categories.updated_at,'1970-01-01')) THEN $3 ELSE categories.name_he END,
            name_pt     = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(categories.updated_at,'1970-01-01')) THEN $4 ELSE categories.name_pt END,
            description = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(categories.updated_at,'1970-01-01')) THEN $5 ELSE categories.description END,
            updated_at  = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(categories.updated_at,'1970-01-01')) THEN $6::timestamptz ELSE categories.updated_at END`,
          [r.id, r.name, r.name_he||null, r.name_pt||null, r.description||null, r.updated_at||null]);
      }
      // אפס את ה-sequence
      await client.query(`SELECT setval('categories_id_seq', COALESCE((SELECT MAX(id) FROM categories), 0) + 1, false)`).catch(() => {});
    }

    if (entity === 'subcategories') {
      await client.query(`CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY, category_id INTEGER NOT NULL,
        name TEXT NOT NULL, name_he TEXT, name_pt TEXT,
        updated_at TIMESTAMPTZ,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )`).catch(() => {});
      await client.query('ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS name_he TEXT').catch(() => {});
      await client.query('ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS name_pt TEXT').catch(() => {});
      await client.query('ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ').catch(() => {});
      for (const r of rows) {
        await client.query(`
          INSERT INTO subcategories (id, category_id, name, name_he, name_pt, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET
            category_id = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(subcategories.updated_at,'1970-01-01')) THEN $2 ELSE subcategories.category_id END,
            name        = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(subcategories.updated_at,'1970-01-01')) THEN $3 ELSE subcategories.name END,
            name_he     = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(subcategories.updated_at,'1970-01-01')) THEN $4 ELSE subcategories.name_he END,
            name_pt     = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(subcategories.updated_at,'1970-01-01')) THEN $5 ELSE subcategories.name_pt END,
            updated_at  = CASE WHEN $6::text IS NOT NULL AND ($6::timestamptz >= COALESCE(subcategories.updated_at,'1970-01-01')) THEN $6::timestamptz ELSE subcategories.updated_at END`,
          [r.id, r.category_id, r.name, r.name_he||null, r.name_pt||null, r.updated_at||null]);
      }
      // אפס את ה-sequence
      await client.query(`SELECT setval('subcategories_id_seq', COALESCE((SELECT MAX(id) FROM subcategories), 0) + 1, false)`).catch(() => {});
    }

    if (entity === 'customers') {
      for (const r of rows) {
        await client.query(`
          INSERT INTO customers (id, name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (id) DO UPDATE SET
            name=$2, contact_person=$3, address=$4, phone=$5, email=$6,
            tax_id=$7, country=$8, is_sensitive=$9, notes=$10`,
          [r.id, r.name, r.contact_person, r.address, r.phone, r.email,
           r.tax_id, r.country, r.is_sensitive ? true : false, r.notes, r.created_at]);
      }
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        await client.query(`DELETE FROM customers WHERE id NOT IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`, ids);
      }
    }

    if (entity === 'products') {
      await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_updated_at TIMESTAMPTZ').catch(() => {});
      for (const r of rows) {
        const qty    = (r.quantity    != null) ? parseInt(r.quantity)    : 0;
        const minQty = (r.min_quantity != null) ? parseInt(r.min_quantity) : 0;
        // מחק כפילות sku עם id שונה
        await client.query(`DELETE FROM products WHERE sku=$1 AND id<>$2`, [r.sku, r.id]);
        // בדוק timestamps לכמות ול-meta (SKU/name/unit/category)
        const existing = await client.query('SELECT quantity_updated_at, meta_updated_at FROM products WHERE id=$1', [r.id]);
        const cloudQtyTs  = existing.rows[0]?.quantity_updated_at;
        const cloudMetaTs = existing.rows[0]?.meta_updated_at;
        const localQtyTs  = r.quantity_updated_at;
        const localMetaTs = r.meta_updated_at;
        const useLocalQty  = !cloudQtyTs  || (localQtyTs  && localQtyTs  > cloudQtyTs.toISOString().slice(0,19));
        const useLocalMeta = !cloudMetaTs || (localMetaTs && localMetaTs > cloudMetaTs.toISOString().slice(0,19));
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_updated_at TIMESTAMPTZ`).catch(() => {});
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id INTEGER`).catch(() => {});
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER`).catch(() => {});
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id INTEGER`).catch(() => {});
        await client.query(`
          INSERT INTO products (id, sku, name, name_he, name_pt, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, quantity_updated_at, meta_updated_at, supplier_id, manufacturer_id, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (id) DO UPDATE SET
            sku            = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $2  ELSE products.sku END,
            name           = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $3  ELSE products.name END,
            name_he        = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $4  ELSE products.name_he END,
            name_pt        = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $5  ELSE products.name_pt END,
            description    = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $6  ELSE products.description END,
            category_id    = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $7  ELSE products.category_id END,
            subcategory_id = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $8  ELSE products.subcategory_id END,
            price          = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $9  ELSE products.price END,
            currency       = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $10 ELSE products.currency END,
            unit           = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $11 ELSE products.unit END,
            min_quantity   = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $13 ELSE products.min_quantity END,
            supplier_id    = CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $16 ELSE products.supplier_id END,
            manufacturer_id= CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $17 ELSE products.manufacturer_id END,
            meta_updated_at= CASE WHEN $15::text IS NOT NULL AND ($15::timestamptz >= COALESCE(products.meta_updated_at,'1970-01-01')) THEN $15::timestamptz ELSE products.meta_updated_at END,
            quantity       = CASE WHEN $14::text IS NOT NULL AND ($14::timestamptz > COALESCE(products.quantity_updated_at,'1970-01-01')) THEN $12 ELSE products.quantity END,
            quantity_updated_at = CASE WHEN $14::text IS NOT NULL AND ($14::timestamptz > COALESCE(products.quantity_updated_at,'1970-01-01')) THEN $14::timestamptz ELSE products.quantity_updated_at END`,
          [r.id, r.sku, r.name, r.name_he||null, r.name_pt||null, r.description||null,
           r.category_id||null, r.subcategory_id||null, r.price||null, r.currency||'ILS', r.unit||'unit',
           qty, minQty, localQtyTs||null, localMetaTs||null, r.supplier_id||null, r.manufacturer_id||null, r.created_at]);
      }
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        await client.query(`DELETE FROM products WHERE id NOT IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`, ids);
      }
    }

    if (entity === 'suppliers') {
      for (const r of rows) {
        await client.query(`
          INSERT INTO suppliers (id, name, address, phone, email, tax_id, country, contact_person, notes, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (id) DO UPDATE SET
            name=$2, address=$3, phone=$4, email=$5,
            tax_id=$6, country=$7, contact_person=$8, notes=$9`,
          [r.id, r.name, r.address, r.phone, r.email,
           r.tax_id, r.country, r.contact_person, r.notes, r.created_at]);
      }
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        await client.query(`DELETE FROM suppliers WHERE id NOT IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`, ids);
      }
    }

    if (entity === 'manufacturers') {
      await client.query(`CREATE TABLE IF NOT EXISTS manufacturers (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT,
        email TEXT, tax_id TEXT, country TEXT, notes TEXT, contact_person TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`).catch(() => {});
      for (const r of rows) {
        await client.query(`
          INSERT INTO manufacturers (id, name, address, phone, email, tax_id, country, contact_person, notes, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (id) DO UPDATE SET
            name=$2, address=$3, phone=$4, email=$5,
            tax_id=$6, country=$7, contact_person=$8, notes=$9`,
          [r.id, r.name, r.address||null, r.phone||null, r.email||null,
           r.tax_id||null, r.country||null, r.contact_person||null, r.notes||null, r.created_at]);
      }
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        await client.query(`DELETE FROM manufacturers WHERE id NOT IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`, ids);
      }
      // אפס sequence
      await client.query(`SELECT setval('manufacturers_id_seq', COALESCE((SELECT MAX(id) FROM manufacturers), 0) + 1, false)`).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({ message: `${entity} synced`, count: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// ════════════════════════════════════════════════════════════════════════════
//  PULL ENDPOINTS - מאפשרים למחשב המקומי למשוך נתונים מהענן
// ════════════════════════════════════════════════════════════════════════════

// ── Pull: Inbound ─────────────────────────────────────────────────────────────
app.get('/api/sync/pull/inbound', authenticateToken, async (req, res) => {
  try {
    const transactions = await query(`
      SELECT it.*, COALESCE(it.username, u.username) as username
      FROM inbound_transactions it
      LEFT JOIN users u ON it.user_id = u.id
      ORDER BY it.id`);
    const items = await query('SELECT * FROM inbound_items ORDER BY id');
    res.json({ transactions: transactions.rows, items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pull: Outbound ────────────────────────────────────────────────────────────
app.get('/api/sync/pull/outbound', authenticateToken, async (req, res) => {
  try {
    const transactions = await query(`
      SELECT ot.*, COALESCE(ot.username, u.username) as username
      FROM outbound_transactions ot
      LEFT JOIN users u ON ot.user_id = u.id
      ORDER BY ot.id`);
    const items = await query('SELECT * FROM outbound_items ORDER BY id');
    res.json({ transactions: transactions.rows, items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pull: Support ─────────────────────────────────────────────────────────────
app.get('/api/sync/pending-deletions', authenticateToken, async (req, res) => {
  try {
    const r = await query(`SELECT entity_type, entity_id FROM pending_deletions ORDER BY deleted_at`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sync/pending-deletions', authenticateToken, async (req, res) => {
  // מחק את כל הרשומות שהסינק טיפל בהן
  const { ids } = req.body; // [{ entity_type, entity_id }]
  try {
    for (const d of (ids || [])) {
      await query('DELETE FROM pending_deletions WHERE entity_type=$1 AND entity_id=$2',
        [d.entity_type, d.entity_id]);
    }
    res.json({ message: 'cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sync/pull/support', authenticateToken, async (req, res) => {
  try {
    const tickets = await query(`
      SELECT t.id, t.ticket_number, t.customer_id, t.customer_name,
        t.product_id, t.product_name, t.subject, t.description,
        t.status, t.priority, t.owner_id, t.created_by,
        t.awaiting_channel, t.awaiting_note, t.awaiting_deadline,
        t.created_at, t.updated_at, t.closed_at, t.cancelled_at, t.owner_updated_at,
        u1.username as created_by_name,
        u2.username as owner_name
      FROM support_tickets t
      LEFT JOIN users u1 ON t.created_by = u1.id
      LEFT JOIN users u2 ON t.owner_id = u2.id
      ORDER BY t.id`);
    const history = await query(`
      SELECT h.*, COALESCE(u.username, h.username) as username
      FROM support_ticket_history h
      LEFT JOIN users u ON h.user_id = u.id
      ORDER BY h.id`);
    res.json({ tickets: tickets.rows, history: history.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Support (push from local) ──────────────────────────────────────────

// ── Sync: Pull notifications from cloud → local ───────────────────────────────
app.get('/api/sync/pull/notifications', authenticateToken, async (req, res) => {
  try {
    // החזר notifications מסוג warehouse_dispatched מ-7 ימים אחרונים —
    // גם pending וגם שאושרו לאחרונה, כדי שהמקומי יוכל לעדכן סטטוס
    const r = await query(`
      SELECT n.*, u.email as user_email
      FROM notifications n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE n.type = 'warehouse_dispatched'
        AND n.created_at > NOW() - INTERVAL '7 days'
      ORDER BY n.created_at DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Push notification acks from local → cloud ──────────────────────────
app.post('/api/sync/notifications/ack', authenticateToken, async (req, res) => {
  try {
    const { acked_ids } = req.body; // מערך של cloud notification IDs שאושרו מקומית
    if (!Array.isArray(acked_ids) || !acked_ids.length) return res.json({ ok: true });

    for (const id of acked_ids) {
      const nRes = await query('SELECT * FROM notifications WHERE id=$1', [id]);
      const n = nRes.rows[0];
      if (!n) continue;
      await query('UPDATE notifications SET is_read=1, needs_ack=0, acked_at=NOW() WHERE id=$1', [id]);
      // כתוב היסטוריה לקריאה
      try {
        const data = JSON.parse(n.data || '{}');
        if (data.ticket_id) {
          await logTicketHistory(data.ticket_id, n.user_id, null, 'dispatch_acknowledged',
            { awaiting_note: `${data.product_name} x${data.quantity}` }
          );
        }
      } catch(e) {}
    }
    res.json({ ok: true, count: acked_ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Pull warehouse_alerts from cloud ────────────────────────────────────
app.get('/api/sync/pull/warehouse-alerts', authenticateToken, async (req, res) => {
  try {
    // החזר הכל (pending + completed) כדי שהמקומי יידע על שינויי סטטוס
    const r = await query(`SELECT * FROM warehouse_alerts ORDER BY created_at DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Pull categories + subcategories from cloud → local ─────────────────
app.get('/api/sync/pull/categories', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM categories ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sync/pull/subcategories', authenticateToken, async (req, res) => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS subcategories (
      id SERIAL PRIMARY KEY, category_id INTEGER NOT NULL,
      name TEXT NOT NULL, name_he TEXT, name_pt TEXT
    )`).catch(() => {});
    const r = await query('SELECT * FROM subcategories ORDER BY id');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Backup endpoints (cloud stubs) ───────────────────────────────────────────
app.get('/api/backup/list', authenticateToken, async (req, res) => {
  res.json([]);
});
app.get('/api/backup/download', authenticateToken, async (req, res) => {
  res.status(501).json({ error: 'Backup not available in cloud' });
});
app.post('/api/backup/upload', authenticateToken, upload.single('backup'), async (req, res) => {
  res.status(501).json({ error: 'Backup restore not available in cloud' });
});
app.post('/api/backup/restore/:filename', authenticateToken, async (req, res) => {
  res.status(501).json({ error: 'Backup restore not available in cloud' });
});
app.post('/api/test-smtp', authenticateToken, async (req, res) => {
  res.json({ message: 'SMTP test not configured' });
});

// ── One-time migration endpoint ───────────────────────────────────────────────
app.post('/api/admin/run-migrations', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`);
    await pool.query(`UPDATE users SET module_warehouse=TRUE, module_sales=FALSE, module_service=TRUE WHERE module_warehouse IS NULL`);
    res.json({ message: 'Migrations complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Send Email ─────────────────────────────────────────────────────────────────
app.post('/api/send-email', authenticateToken, async (req, res) => {
  const { to, subject, body, docType, docId, docLang, docContact } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing recipient email' });

  try {
    const compRes = await query('SELECT * FROM company_settings WHERE id=1');
    const company = compRes.rows[0];

    if (!company?.smtp_host || !company?.smtp_user || !company?.smtp_pass) {
      return res.status(400).json({ error: 'SMTP not configured. Please set up email settings in company settings.' });
    }

    // Use Brevo API (Render blocks SMTP ports)
    // smtp_pass for Brevo is the API key (xsmtpsib-...)

    // Build document HTML directly (no self-request)
    let attachments = [];
    if (docType && docId) {
      try {
        const lang = docLang || 'he';
        const contact = docContact || '';

        const formatDate = (dateString) => {
          const date = new Date(dateString);
          return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
        };

        let docHtml = '';
        const nameMap = { 'outbound': `delivery_note_${docId}.html`, 'inbound': `receipt_note_${docId}.html` };

        if (docType === 'outbound') {
          const txRes = await query(`
            SELECT ot.*, c.name as customer_name, c.address as customer_address,
                   c.phone as customer_phone, c.email as customer_email,
                   c.contact_person as customer_contact, u.username
            FROM outbound_transactions ot
            LEFT JOIN customers c ON ot.customer_id = c.id
            LEFT JOIN users u ON ot.user_id = u.id
            WHERE ot.id=$1`, [docId]);
          const tx = txRes.rows[0];
          const itemsRes = await query(`SELECT oi.*, p.name, p.name_he, p.name_pt, p.sku FROM outbound_items oi JOIN products p ON oi.product_id = p.id WHERE oi.transaction_id=$1`, [docId]);
          const items = itemsRes.rows;
          const title = lang==='he'?'תעודת משלוח':lang==='pt'?'Nota de Entrega':'Delivery Note';
          const dir = lang==='he'?'rtl':'ltr';
          const baseUrl = 'https://worldsecure-backend.onrender.com';
          const logoHtml = company.logo_path ? `<img src="${baseUrl}${company.logo_path}" style="max-height:80px;max-width:200px;">` : '';
          docHtml = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8"><title>${title} #${docId}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;padding:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#3498db;color:white;padding:10px}td{padding:10px;border:1px solid #ddd}.info-row{display:flex;gap:20px;margin-bottom:20px}.info-box{flex:1;padding:15px;border:1px solid #ddd;border-radius:5px}.info-box h3{margin-top:0;border-bottom:2px solid #3498db;padding-bottom:5px}</style>
</head><body>
${logoHtml ? `<div style="margin-bottom:15px">${logoHtml}</div>` : ''}
<h1>${title}</h1>
<p>${lang==='he'?'מספר':'Number'}: ${docId} | ${lang==='he'?'תאריך':'Date'}: ${formatDate(tx?.transaction_date)}</p>
<div class="info-row">
  <div class="info-box"><h3>${lang==='he'?'פרטי החברה':'Company Details'}</h3>
    <p><strong>${lang==='he'?'שם':'Name'}:</strong> ${company.company_name||''}</p>
    <p><strong>${lang==='he'?'טלפון':'Phone'}:</strong> ${company.phone||''}</p>
    <p><strong>${lang==='he'?'אימייל':'Email'}:</strong> ${company.email||''}</p>
  </div>
  <div class="info-box"><h3>${lang==='he'?'פרטי הלקוח':'Customer Details'}</h3>
    <p><strong>${lang==='he'?'שם':'Name'}:</strong> ${tx?.customer_type==='casual'?tx?.casual_customer_name:tx?.customer_name||''}</p>
    ${tx?.customer_address?`<p><strong>${lang==='he'?'כתובת':'Address'}:</strong> ${tx.customer_address}</p>`:''}
  </div>
</div>
<table><thead><tr><th>#</th><th>${lang==='he'?'מק"ט':'SKU'}</th><th>${lang==='he'?'שם מוצר':'Product'}</th><th>${lang==='he'?'כמות':'Qty'}</th></tr></thead>
<tbody>${items.map((item,i)=>`<tr><td>${i+1}</td><td>${item.sku}</td><td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td><td>${item.quantity}</td></tr>`).join('')}</tbody></table>
${tx?.notes?`<p><strong>${lang==='he'?'הערות':'Notes'}:</strong> ${tx.notes}</p>`:''}
<p style="margin-top:30px;color:#777">${lang==='he'?'נערך ע"י':'Prepared by'}: ${tx?.username||''}</p>
<div style="margin-top:20px;padding-top:15px;border-top:1px solid #ddd;text-align:center;font-size:9pt;color:#888">${company.company_name||'WorldSecure LTD'} &bull; ${company.email||''}</div>
</body></html>`;

        } else if (docType === 'inbound') {
          const txRes = await query(`
            SELECT it.*, s.name as supplier_name, s.address as supplier_address,
                   s.phone as supplier_phone, s.email as supplier_email, u.username
            FROM inbound_transactions it
            LEFT JOIN suppliers s ON it.supplier_id = s.id
            LEFT JOIN users u ON it.user_id = u.id
            WHERE it.id=$1`, [docId]);
          const tx = txRes.rows[0];
          const itemsRes = await query(`SELECT ii.*, p.name, p.name_he, p.name_pt, p.sku FROM inbound_items ii JOIN products p ON ii.product_id = p.id WHERE ii.transaction_id=$1`, [docId]);
          const items = itemsRes.rows;
          const title = lang==='he'?'תעודת קליטה':lang==='pt'?'Nota de Recebimento':'Receipt Note';
          const dir = lang==='he'?'rtl':'ltr';
          const baseUrl = 'https://worldsecure-backend.onrender.com';
          const logoHtml = company.logo_path ? `<img src="${baseUrl}${company.logo_path}" style="max-height:80px;max-width:200px;">` : '';
          docHtml = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8"><title>${title} #${docId}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;padding:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#3498db;color:white;padding:10px}td{padding:10px;border:1px solid #ddd}.info-section{padding:15px;background:#f8f9fa;border-radius:5px;margin-bottom:20px}</style>
</head><body>
${logoHtml ? `<div style="margin-bottom:15px">${logoHtml}</div>` : ''}
<h1>${title}</h1>
<p>${lang==='he'?'מספר':'Number'}: ${docId} | ${lang==='he'?'תאריך':'Date'}: ${formatDate(tx?.transaction_date)}</p>
<div class="info-section">
  <h3>${lang==='he'?'פרטי הספק':'Supplier Details'}</h3>
  <p><strong>${lang==='he'?'שם':'Name'}:</strong> ${tx?.supplier_name||''}</p>
  ${tx?.supplier_phone?`<p><strong>${lang==='he'?'טלפון':'Phone'}:</strong> ${tx.supplier_phone}</p>`:''}
  ${tx?.supplier_email?`<p><strong>${lang==='he'?'אימייל':'Email'}:</strong> ${tx.supplier_email}</p>`:''}
</div>
<table><thead><tr><th>${lang==='he'?'מק"ט':'SKU'}</th><th>${lang==='he'?'שם מוצר':'Product'}</th><th>${lang==='he'?'כמות':'Qty'}</th></tr></thead>
<tbody>${items.map(item=>`<tr><td>${item.sku}</td><td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td><td>${item.quantity}</td></tr>`).join('')}
<tr style="font-weight:bold;background:#f0f0f0"><td colspan="2">${lang==='he'?'סה"כ':'Total'}</td><td>${items.reduce((s,i)=>s+i.quantity,0)}</td></tr></tbody></table>
${tx?.notes?`<p><strong>${lang==='he'?'הערות':'Notes'}:</strong> ${tx.notes}</p>`:''}
<p style="margin-top:30px;color:#777">${lang==='he'?'התקבל ע"י':'Received by'}: ${tx?.username||''}</p>
<div style="margin-top:20px;padding-top:15px;border-top:1px solid #ddd;text-align:center;font-size:9pt;color:#888">${company.company_name||'WorldSecure LTD'} &bull; ${company.email||''}</div>
</body></html>`;
        }

        if (docHtml) {
          let attachBuffer = Buffer.from(docHtml, 'utf-8');
          let attachFilename = nameMap[docType];
          let attachContentType = 'text/html; charset=utf-8';

          // Convert to PDF using PDFShift if API key available
          if (process.env.PDFSHIFT_API_KEY) {
            try {
              const pdfRes = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Basic ' + Buffer.from('api:' + process.env.PDFSHIFT_API_KEY).toString('base64')
                },
                body: JSON.stringify({ source: docHtml, landscape: false, use_print: true })
              });
              if (pdfRes.ok) {
                const pdfBuffer = await pdfRes.arrayBuffer();
                attachBuffer = Buffer.from(pdfBuffer);
                attachFilename = attachFilename.replace('.html', '.pdf');
                attachContentType = 'application/pdf';
                console.log(`PDF generated via PDFShift: ${attachFilename}`);
              } else {
                console.error('PDFShift error:', await pdfRes.text());
              }
            } catch (pdfErr) {
              console.error('PDFShift failed, sending HTML:', pdfErr.message);
            }
          }

          attachments.push({
            filename: attachFilename,
            content: attachBuffer,
            contentType: attachContentType
          });
        }
      } catch (attachErr) {
        console.error('Attachment error:', attachErr.message);
      }
    }

    // טען חתימה מה-DB או בנה ברירת מחדל
    let signatureHtml = '';
    const sigR = await query('SELECT content FROM email_signatures WHERE is_active=TRUE LIMIT 1');
    if (sigR.rows[0]?.content) {
      signatureHtml = sigR.rows[0].content;
    } else {
      const baseUrl = 'https://worldsecure-backend.onrender.com';
      const logoSrc = company.logo_base64 ? company.logo_base64 : (company.logo_path ? `${baseUrl}${company.logo_path}` : null);
      const logoHtmlSignature = logoSrc ? `<tr><td colspan="2" style="padding-top:8px;text-align:left;"><img src="${logoSrc}" alt="${company.company_name||''}" style="max-height:60px;max-width:200px;object-fit:contain;"></td></tr>` : '';
      signatureHtml = `<table style="font-size:13px;color:#333;line-height:1.6;">
        <tr><td colspan="2" style="font-weight:700;font-size:16px;padding-bottom:12px;color:#1a1a1a;">${company.company_name || 'WorldSecure'}</td></tr>
        ${company.phone ? `<tr><td style="padding-right:8px;color:#666;">📞</td><td>${company.phone}</td></tr>` : ''}
        ${company.email ? `<tr><td style="padding-right:8px;color:#666;">✉️</td><td>${company.email}</td></tr>` : ''}
        ${company.website ? `<tr><td colspan="2"><a href="${company.website}" target="_blank" style="color:#1a73e8;text-decoration:none;font-weight:600;">${company.website}</a></td></tr>` : ''}
        ${logoHtmlSignature}
      </table>`;
    }

    // Build email payload for Brevo API
    const emailPayload = {
      sender: { name: company.company_name || 'WorldSecure', email: company.smtp_from || company.smtp_user },
      to: [{ email: to }],
      subject: subject || `Document from ${company.company_name || 'WorldSecure'}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;">
        <p style="margin-bottom:20px;">${body || 'Please find the attached document.'}</p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        ${signatureHtml}
      </div>`
    };

    // Add attachments if any
    if (attachments.length > 0) {
      emailPayload.attachment = attachments.map(a => ({
        name: a.filename,
        content: a.content.toString('base64')
      }));
    }

    // Send via Brevo API
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY || company.smtp_pass
      },
      body: JSON.stringify(emailPayload)
    });

    if (!brevoRes.ok) {
      const errData = await brevoRes.json();
      throw new Error(errData.message || 'Brevo API error');
    }

    res.json({ success: true, message: '✅ Email sent successfully' });
  } catch (err) {
    console.error('Send email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Run Migrations ────────────────────────────────────────────────────────────
app.get('/api/run-migrations', async (req, res) => {
  // GET version for easy browser access
  try {
    const migrations = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS owner_updated_at TIMESTAMPTZ`,
      `ALTER TABLE inbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
      `ALTER TABLE outbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
      `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_channel TEXT`,
      `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_note TEXT`,
      `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_deadline TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS logo_base64 TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_signature TEXT`,
      `CREATE TABLE IF NOT EXISTS email_signatures (id SERIAL PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, is_active BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
    ];
    const results = [];
    for (const sql of migrations) {
      try { await query(sql); results.push({ sql: sql.substring(0,60), ok: true }); }
      catch(e) { results.push({ sql: sql.substring(0,60), error: e.message }); }
    }
    res.json({ done: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/run-migrations', authenticateToken, async (req, res) => {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS owner_updated_at TIMESTAMPTZ`,
    `ALTER TABLE inbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
    `ALTER TABLE outbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
    `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_channel TEXT`,
    `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_note TEXT`,
    `ALTER TABLE support_ticket_history ADD COLUMN IF NOT EXISTS awaiting_deadline TEXT`,
    `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS logo_base64 TEXT`,
    `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_signature TEXT`,
    `CREATE TABLE IF NOT EXISTS email_signatures (id SERIAL PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, is_active BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  ];
  const results = [];
  for (const sql of migrations) {
    try { await query(sql); results.push({ sql: sql.substring(0,60), ok: true }); }
    catch(e) { results.push({ sql: sql.substring(0,60), error: e.message }); }
  }
  res.json({ done: true, results });
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ════════════════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════════════════

async function runMigrations() {
  // טבלת מחיקות ממתינות לסינק
  await query(`
    CREATE TABLE IF NOT EXISTS pending_deletions (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      deleted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entity_type, entity_id)
    )
  `);
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS owner_updated_at TIMESTAMPTZ`,
    `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS logo_base64 TEXT`,
    `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_signature TEXT`,
    `CREATE TABLE IF NOT EXISTS email_signatures (id SERIAL PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, is_active BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS stock_alerts (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER,
      product_id INTEGER,
      product_name TEXT,
      required_qty INTEGER,
      available_qty INTEGER,
      shortage_qty INTEGER,
      status TEXT DEFAULT 'active',
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];
  for (const sql of migrations) {
    try { await query(sql); } catch(e) { /* column may already exist */ }
  }
  console.log('✅ Migrations complete');
}

initDatabase().then(runMigrations).then(() => {
  app.listen(PORT, () => {
    console.log(`✅ WorldSecure Cloud server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to init database:', err);
  process.exit(1);
});
