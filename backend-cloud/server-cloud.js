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
app.use(express.json());

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
    const result = await query('SELECT id, username, email, role, module_warehouse, module_sales, module_service, created_at FROM users ORDER BY id');
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
    const r = await query(`
      SELECT p.*, c.name as category_name, c.name_he as category_name_he, c.name_pt as category_name_pt
      FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.name
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

// ── חסימת עריכה ───────────────────────────────────────────────────────────────
const readOnly = (req, res) =>
  res.status(403).json({ error: 'This data is managed locally. Connect to local system to edit.' });

app.post('/api/customers',   authenticateToken, readOnly);
app.put('/api/customers/:id', authenticateToken, readOnly);
app.delete('/api/customers/:id', authenticateToken, readOnly);
app.post('/api/products',    authenticateToken, readOnly);
app.put('/api/products/:id', authenticateToken, readOnly);
app.delete('/api/products/:id', authenticateToken, readOnly);
app.post('/api/suppliers',   authenticateToken, readOnly);
app.put('/api/suppliers/:id', authenticateToken, readOnly);
app.delete('/api/suppliers/:id', authenticateToken, readOnly);

// ════════════════════════════════════════════════════════════════════════════
//  COMPANY SETTINGS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/company', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM company_settings WHERE id=1');
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT: Company Settings ─────────────────────────────────────────────────────
app.put('/api/company', authenticateToken, async (req, res) => {
  const { company_name, address, phone, phone2, phone3, email, tax_id, website } = req.body;
  try {
    await query(`
      UPDATE company_settings SET
        company_name=$1, address=$2, phone=$3, phone2=$4, phone3=$5,
        email=$6, tax_id=$7, website=$8
      WHERE id=1`,
      [company_name, address, phone, phone2, phone3, email, tax_id, website]
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
      [smtp_host, smtp_port||587, smtp_user, smtp_pass, smtp_from]
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
  const { supplier_id, supplier_type, casual_supplier_name, items, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txResult = await client.query(
      'INSERT INTO inbound_transactions (supplier_id, supplier_type, casual_supplier_name, notes, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [supplier_id, supplier_type, casual_supplier_name, notes, req.user.id]
    );
    const transactionId = txResult.rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO inbound_items (transaction_id, product_id, quantity, notes) VALUES ($1,$2,$3,$4)',
        [transactionId, item.product_id, item.quantity, item.notes]
      );
      await client.query(
        'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
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
    const r = await query(`
      SELECT ot.*, c.name as customer_name, COALESCE(ot.username, u.username) as username
      FROM outbound_transactions ot
      LEFT JOIN customers c ON ot.customer_id = c.id
      LEFT JOIN users u ON ot.user_id = u.id
      ORDER BY ot.transaction_date DESC
    `);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/outbound', authenticateToken, async (req, res) => {
  const { customer_id, customer_type, casual_customer_name, items, notes, status } = req.body;
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
      'INSERT INTO outbound_transactions (customer_id, customer_type, casual_customer_name, notes, status, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [customer_id, customer_type, casual_customer_name, notes, status||'pending', req.user.id]
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
      await client.query('UPDATE products SET quantity = quantity - $1 WHERE id = $2', [item.quantity, item.product_id]);
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
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    await page.pdf({ path: filepath, format: 'A4', printBackground: true,
      margin: { top:'15mm', bottom:'15mm', left:'15mm', right:'15mm' } });
    await browser.close();
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
    const logoHtml = company.logo_path
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
    const logoHtml = company.logo_path
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
    const stats = { open:0, in_progress:0, closed:0, pending:0, total:0 };
    r.rows.forEach(row => { stats[row.status] = parseInt(row.count); stats.total += parseInt(row.count); });
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
    await logTicketHistory(ticketId, req.user.id, req.user.email, 'created', { new_status: status||'open', owner_id: resolvedOwnerId, owner_name });
    res.json({ id: ticketId, ticket_number });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/support-tickets/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_name, product_id, product_name, subject, description, status, priority, owner_id, awaiting_channel, awaiting_note, awaiting_deadline } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject required' });
  try {
    const oldRes = await query('SELECT status, owner_id, owner_name FROM support_tickets WHERE id=$1', [id]);
    const old = oldRes.rows[0] || {};
    let ownerId = old.owner_id, ownerName = old.owner_name;
    if (owner_id && req.user.role === 'admin') {
      const ownerRes = await query('SELECT username FROM users WHERE id=$1', [owner_id]);
      ownerId = owner_id;
      ownerName = ownerRes.rows[0]?.username || null;
    }
    const closedAt = status === 'closed' ? 'NOW()' : 'NULL';
    await query(`
      UPDATE support_tickets SET
        customer_id=$1, customer_name=$2, product_id=$3, product_name=$4,
        subject=$5, description=$6, status=$7, priority=$8,
        owner_id=$9, owner_name=$10, awaiting_channel=$11,
        awaiting_note=$12, awaiting_deadline=$13,
        updated_at=NOW() ${status==='closed'?', closed_at=NOW()':''}
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
    await logTicketHistory(id, req.user.id, req.user.email, action, {
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
  try {
    const r = await query('DELETE FROM support_tickets WHERE id=$1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  WAREHOUSE ALERTS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/warehouse-alerts', authenticateToken, async (req, res) => {
  const { ticket_id, product_id, product_name, quantity } = req.body;
  if (!ticket_id || !product_id) return res.status(400).json({ error: 'ticket_id and product_id required' });
  try {
    const tkRes = await query('SELECT ticket_number, customer_name FROM support_tickets WHERE id=$1', [ticket_id]);
    const ticket = tkRes.rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const r = await query(`
      INSERT INTO warehouse_alerts (ticket_id, ticket_number, customer_name, product_id, product_name, quantity, requested_by, requested_by_name, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [ticket_id, ticket.ticket_number, ticket.customer_name, product_id, product_name, quantity||1, req.user.id, req.user.username||req.user.email]
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

app.put('/api/warehouse-alerts/:id/complete', authenticateToken, async (req, res) => {
  try {
    const alertRes = await query('SELECT * FROM warehouse_alerts WHERE id=$1', [req.params.id]);
    const alert = alertRes.rows[0];
    if (!alert) return res.status(404).json({ error: 'Not found' });
    await query(`UPDATE warehouse_alerts SET status='completed', completed_at=NOW() WHERE id=$1`, [req.params.id]);
    await logTicketHistory(alert.ticket_id, req.user.id, req.user.username||req.user.email, 'product_dispatched',
      { awaiting_note: `${alert.product_name} x${alert.quantity}` });
    await query(`INSERT INTO notifications (user_id, type, title, message, data, needs_ack, created_at)
      VALUES ($1,'warehouse_dispatched','warehouse_dispatched',$2,$3,1,NOW())`,
      [alert.requested_by,
       JSON.stringify({ product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number }),
       JSON.stringify({ ticket_id: alert.ticket_id, alert_id: req.params.id, product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number })]
    );
    res.json({ message: 'Completed' });
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
    const [prod, lowStock, cust, supp, todayTx] = await Promise.all([
      query('SELECT COUNT(*) as count FROM products'),
      query('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity'),
      query('SELECT COUNT(*) as count FROM customers'),
      query('SELECT COUNT(*) as count FROM suppliers'),
      query(`SELECT COUNT(*) as count FROM outbound_transactions WHERE transaction_date::date = CURRENT_DATE`)
    ]);
    res.json({
      totalProducts: parseInt(prod.rows[0].count),
      lowStockProducts: parseInt(lowStock.rows[0].count),
      totalCustomers: parseInt(cust.rows[0].count),
      totalSuppliers: parseInt(supp.rows[0].count),
      todayTransactions: parseInt(todayTx.rows[0].count)
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
app.post('/api/sync/settings', authenticateToken, async (req, res) => {
  const { row } = req.body;
  if (!row) return res.status(400).json({ error: 'row required' });
  try {
    await query(`
      INSERT INTO company_settings
        (id, company_name, address, phone, phone2, phone3, email, tax_id, website,
         smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        company_name=$1, address=$2, phone=$3, phone2=$4, phone3=$5,
        email=$6, tax_id=$7, website=$8,
        smtp_host=$9, smtp_port=$10, smtp_user=$11, smtp_pass=$12, smtp_from=$13`,
      [row.company_name, row.address, row.phone, row.phone2, row.phone3,
       row.email, row.tax_id, row.website,
       row.smtp_host, 465, row.smtp_user, row.smtp_pass, row.smtp_from]
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

    // סנכרן מלאי מוצרים לפי הנתונים המקומיים
    const productRows = await client.query('SELECT id FROM products');
    for (const p of productRows.rows) {
      const inRes  = await client.query(`SELECT COALESCE(SUM(quantity),0) as total FROM inbound_items ii JOIN inbound_transactions it ON ii.transaction_id=it.id WHERE ii.product_id=$1`, [p.id]);
      const outRes = await client.query(`SELECT COALESCE(SUM(quantity),0) as total FROM outbound_items oi JOIN outbound_transactions ot ON oi.transaction_id=ot.id WHERE oi.product_id=$1`, [p.id]);
      const qty = parseInt(inRes.rows[0].total) - parseInt(outRes.rows[0].total);
      await client.query('UPDATE products SET quantity=$1 WHERE id=$2', [Math.max(0,qty), p.id]);
    }

    // מחק תעודות שנמחקו במקומי (רק אם נוצרו לפני יותר מ-10 דקות)
    if (Array.isArray(localIds) && localIds.length >= 0) {
      const cloudRows = await client.query(
        `SELECT id FROM inbound_transactions WHERE transaction_date < NOW() - INTERVAL '10 minutes'`
      );
      for (const row of cloudRows.rows) {
        if (!localIds.includes(row.id)) {
          await client.query('DELETE FROM inbound_items WHERE transaction_id=$1', [row.id]);
          await client.query('DELETE FROM inbound_transactions WHERE id=$1', [row.id]);
        }
      }
    }

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

    // מחק תעודות שנמחקו במקומי (רק אם נוצרו לפני יותר מ-10 דקות)
    if (Array.isArray(localIds) && localIds.length >= 0) {
      const cloudRows = await client.query(
        `SELECT id FROM outbound_transactions WHERE transaction_date < NOW() - INTERVAL '10 minutes'`
      );
      for (const row of cloudRows.rows) {
        if (!localIds.includes(row.id)) {
          await client.query('DELETE FROM outbound_items WHERE transaction_id=$1', [row.id]);
          await client.query('DELETE FROM outbound_transactions WHERE id=$1', [row.id]);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'outbound synced', count: transactions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/sync/support', authenticateToken, async (req, res) => {
  const { tickets, history, localIds } = req.body;
  if (!Array.isArray(tickets)) return res.status(400).json({ error: 'tickets array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of tickets) {
      await client.query(`
        INSERT INTO support_tickets
          (id, ticket_number, customer_id, customer_name, product_id, product_name,
           subject, description, status, priority, owner_id, owner_name, created_by,
           awaiting_channel, awaiting_note, awaiting_deadline,
           created_at, updated_at, closed_at, cancelled_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (id) DO UPDATE SET
          ticket_number=$2, customer_id=$3, customer_name=$4, product_id=$5,
          product_name=$6, subject=$7, description=$8, status=$9, priority=$10,
          owner_id=$11, owner_name=$12, created_by=$13, awaiting_channel=$14,
          awaiting_note=$15, awaiting_deadline=$16, updated_at=$18,
          closed_at=$19, cancelled_at=$20`,
        [t.id, t.ticket_number, t.customer_id||null, t.customer_name||null,
         t.product_id||null, t.product_name||null, t.subject, t.description||null,
         t.status||'open', t.priority||'medium', t.owner_id||null, t.owner_name||null,
         t.created_by||null, t.awaiting_channel||null, t.awaiting_note||null,
         t.awaiting_deadline||null, t.created_at, t.updated_at||null,
         t.closed_at||null, t.cancelled_at||null]
      );
    }

    // Get valid ticket IDs in cloud to avoid FK violation
    const validTicketIds = new Set(tickets.map(t => t.id));
    for (const h of (history || [])) {
      if (!validTicketIds.has(h.ticket_id)) continue; // skip orphan history
      await client.query(`
        INSERT INTO support_ticket_history
          (id, ticket_id, user_id, username, action, old_status, new_status, comment, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING`,
        [h.id, h.ticket_id, h.user_id||null, h.username||null, h.action,
         h.old_status||null, h.new_status||null, h.comment||null, h.created_at]
      );
    }

    // מחק tickets שנמחקו במקומי (רק אם נוצרו לפני יותר מ-10 דקות)
    if (Array.isArray(localIds) && localIds.length >= 0) {
      const cloudRows = await client.query(
        `SELECT id FROM support_tickets WHERE created_at < NOW() - INTERVAL '10 minutes'`
      );
      for (const row of cloudRows.rows) {
        if (!localIds.includes(row.id)) {
          await client.query('DELETE FROM support_ticket_history WHERE ticket_id=$1', [row.id]);
          await client.query('DELETE FROM support_tickets WHERE id=$1', [row.id]);
        }
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
app.post('/api/sync/:entity', authenticateToken, async (req, res) => {
  const { entity } = req.params;
  const { rows } = req.body;
  const allowed = ['customers', 'products', 'suppliers', 'settings', 'inbound', 'outbound', 'support'];
  if (!allowed.includes(entity)) return res.status(400).json({ error: 'Invalid entity' });
  if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
      for (const r of rows) {
        await client.query(`
          INSERT INTO products (id, sku, name, name_he, name_pt, description, category_id, price, currency, unit, quantity, min_quantity, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (id) DO UPDATE SET
            sku=$2, name=$3, name_he=$4, name_pt=$5, description=$6,
            category_id=$7, price=$8, currency=$9, unit=$10, quantity=$11, min_quantity=$12`,
          [r.id, r.sku, r.name, r.name_he||null, r.name_pt||null, r.description||null,
 r.category_id||null, r.price||null, r.currency||'ILS', r.unit||'unit',
 parseInt(r.quantity)||0, parseInt(r.min_quantity)||0, r.created_at]);
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
    const transactions = await query('SELECT * FROM inbound_transactions ORDER BY id');
    const items        = await query('SELECT * FROM inbound_items ORDER BY id');
    res.json({ transactions: transactions.rows, items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pull: Outbound ────────────────────────────────────────────────────────────
app.get('/api/sync/pull/outbound', authenticateToken, async (req, res) => {
  try {
    const transactions = await query('SELECT * FROM outbound_transactions ORDER BY id');
    const items        = await query('SELECT * FROM outbound_items ORDER BY id');
    res.json({ transactions: transactions.rows, items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pull: Support ─────────────────────────────────────────────────────────────
app.get('/api/sync/pull/support', authenticateToken, async (req, res) => {
  try {
    const tickets = await query('SELECT * FROM support_tickets ORDER BY id');
    const history = await query('SELECT * FROM support_ticket_history ORDER BY id');
    res.json({ tickets: tickets.rows, history: history.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Support (push from local) ──────────────────────────────────────────


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

    // Build email payload for Brevo API
    const emailPayload = {
      sender: { name: company.company_name || 'WorldSecure', email: company.smtp_from || company.smtp_user },
      to: [{ email: to }],
      subject: subject || `Document from ${company.company_name || 'WorldSecure'}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;">
        <p>${body || 'Please find the attached document.'}</p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0">
        <p style="color:#555;font-size:13px;">${company.company_name || 'WorldSecure LTD'}<br>
        ${company.email || ''} | ${company.phone || ''}<br>
        <a href="https://www.world-secure.com">www.world-secure.com</a></p>
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
app.post('/api/run-migrations', authenticateToken, async (req, res) => {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE inbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
    `ALTER TABLE outbound_transactions ADD COLUMN IF NOT EXISTS username TEXT`,
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
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_warehouse BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_sales BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS module_service BOOLEAN DEFAULT TRUE`,
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
