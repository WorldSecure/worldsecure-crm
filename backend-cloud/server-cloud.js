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
  const token = req.headers['authorization']?.split(' ')[1];
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
    const result = await query('SELECT id, username, email, role, created_at FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { role, module_warehouse, module_service } = req.body;
  try {
    await query('UPDATE users SET role=$1, module_warehouse=$2, module_service=$3 WHERE id=$4',
      [role, module_warehouse, module_service, req.params.id]);
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

// ════════════════════════════════════════════════════════════════════════════
//  INBOUND TRANSACTIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/inbound', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT it.*, s.name as supplier_name, u.username
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
      SELECT it.*, s.name as supplier_name, u.username
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
      SELECT ot.*, c.name as customer_name, u.username
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
  const { lang = 'he', token = '' } = req.query;

  try {
    const txRes = await query(`
      SELECT ot.*, c.name as customer_name, c.address as customer_address,
             c.phone as customer_phone, c.email as customer_email, u.username
      FROM outbound_transactions ot
      LEFT JOIN customers c ON ot.customer_id = c.id
      LEFT JOIN users u ON ot.user_id = u.id
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

    const t = {
      he: { title:'תעודת משלוח', dir:'rtl', sku:'מק"ט', qty:'כמות', product:'שם מוצר', date:'תאריך', num:'מספר' },
      en: { title:'Delivery Note',  dir:'ltr', sku:'SKU', qty:'Quantity', product:'Product Name', date:'Date', num:'Number' },
      pt: { title:'Nota de Entrega',dir:'ltr', sku:'SKU', qty:'Quantidade', product:'Nome do Produto', date:'Data', num:'Número' }
    }[lang] || { title:'Delivery Note', dir:'ltr', sku:'SKU', qty:'Qty', product:'Product', date:'Date', num:'No' };

    const formatDate = (d) => {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
    };

    const html = `<!DOCTYPE html><html dir="${t.dir}"><head><meta charset="UTF-8">
<title>${t.title} #${id}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;padding:20px}
  @media print{.no-print{display:none}@page{margin:1.5cm 2cm;size:A4}}
  .btn-bar{text-align:center;padding:15px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}
  .btn-bar button{padding:10px 20px;margin:0 6px;border:none;border-radius:5px;cursor:pointer;font-weight:600}
  .btn-print{background:#3498db;color:#fff}.btn-close{background:#95a5a6;color:#fff}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th{background:#3498db;color:#fff;padding:10px;text-align:${t.dir==='rtl'?'right':'left'}}
  td{padding:10px;border:1px solid #ddd}
  .info-box{flex:1;padding:15px;border:1px solid #ddd;border-radius:5px;margin:0 8px}
  .info-box h3{margin-top:0;border-bottom:2px solid #3498db;padding-bottom:5px}
  .info-row{display:flex;margin-bottom:20px}
  .footer{margin-top:30px;padding-top:15px;border-top:2px solid #ddd;text-align:center;color:#777}
  .doc-footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding:5px;text-align:center;font-size:8pt;color:#888;background:#fff}
</style></head><body>
<div class="btn-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ ${lang==='he'?'הדפס':lang==='pt'?'Imprimir':'Print'}</button>
  <button class="btn-close" onclick="window.close()">❌ ${lang==='he'?'סגור':lang==='pt'?'Fechar':'Close'}</button>
</div>
<h1>${t.title}</h1>
<p><strong>${t.num}:</strong> ${id} &nbsp;|&nbsp; <strong>${t.date}:</strong> ${formatDate(transaction.transaction_date)}</p>
<div class="info-row">
  <div class="info-box"><h3>${lang==='he'?'פרטי החברה':lang==='pt'?'Detalhes da Empresa':'Company Details'}</h3>
    <p><strong>${lang==='he'?'שם':'Name'}:</strong> ${company.company_name||'WorldSecure LTD'}</p>
    <p><strong>${lang==='he'?'טלפון':'Phone'}:</strong> ${company.phone||'-'}</p>
    <p><strong>${lang==='he'?'אימייל':'Email'}:</strong> ${company.email||'-'}</p>
  </div>
  <div class="info-box"><h3>${lang==='he'?'פרטי הלקוח':lang==='pt'?'Detalhes do Cliente':'Customer Details'}</h3>
    <p><strong>${lang==='he'?'שם':'Name'}:</strong> ${transaction.customer_type==='casual'?transaction.casual_customer_name:transaction.customer_name||'-'}</p>
    ${transaction.customer_address?`<p><strong>${lang==='he'?'כתובת':'Address'}:</strong> ${transaction.customer_address}</p>`:''}
  </div>
</div>
<table><thead><tr><th>#</th><th>${t.sku}</th><th>${t.product}</th><th>${t.qty}</th></tr></thead>
<tbody>${items.map((item,i)=>`<tr><td>${i+1}</td><td>${item.sku}</td>
  <td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td>
  <td>${item.quantity}</td></tr>`).join('')}</tbody></table>
${transaction.notes?`<p><strong>${lang==='he'?'הערות':'Notes'}:</strong> ${transaction.notes}</p>`:''}
<div class="footer"><p>${lang==='he'?'נערך ע"י':'Prepared by'}: ${transaction.username||'-'}</p></div>
<div class="doc-footer">${company.company_name||'WorldSecure LTD'} &bull; ${company.email||'info@world-secure.com'}</div>
</body></html>`;

    await saveDocument('delivery', id, html, lang, req.user?.id||null,
      transaction.customer_type==='casual' ? transaction.casual_customer_name : transaction.customer_name);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Receipt Note ──────────────────────────────────────────────────────────────
app.get('/api/inbound/:id/receipt-note', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { lang = 'he' } = req.query;

  try {
    const txRes = await query(`
      SELECT it.*, s.name as supplier_name, s.address as supplier_address,
             s.phone as supplier_phone, u.username
      FROM inbound_transactions it
      LEFT JOIN suppliers s ON it.supplier_id = s.id
      LEFT JOIN users u ON it.user_id = u.id
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

    const t = {
      he: { title:'תעודת קליטה', dir:'rtl' },
      en: { title:'Receipt Note', dir:'ltr' },
      pt: { title:'Nota de Recebimento', dir:'ltr' }
    }[lang] || { title:'Receipt Note', dir:'ltr' };

    const formatDate = (d) => {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
    };

    const html = `<!DOCTYPE html><html dir="${t.dir}"><head><meta charset="UTF-8">
<title>${t.title} #${id}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;padding:20px}
  @media print{.no-print{display:none}@page{margin:1.5cm 2cm;size:A4}}
  .btn-bar{text-align:center;padding:15px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}
  .btn-bar button{padding:10px 20px;margin:0 6px;border:none;border-radius:5px;cursor:pointer;font-weight:600}
  .btn-print{background:#3498db;color:#fff}.btn-close{background:#95a5a6;color:#fff}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th{background:#3498db;color:#fff;padding:10px;text-align:${t.dir==='rtl'?'right':'left'}}
  td{padding:10px;border:1px solid #ddd}
  .doc-footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding:5px;text-align:center;font-size:8pt;color:#888;background:#fff}
</style></head><body>
<div class="btn-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ ${lang==='he'?'הדפס':'Print'}</button>
  <button class="btn-close" onclick="window.close()">❌ ${lang==='he'?'סגור':'Close'}</button>
</div>
<h1>${t.title} #${id}</h1>
<p>${lang==='he'?'תאריך':'Date'}: ${formatDate(transaction.transaction_date)}</p>
<p><strong>${lang==='he'?'ספק':'Supplier'}:</strong> ${transaction.supplier_name||transaction.casual_supplier_name||'-'}</p>
<table>
  <thead><tr><th>SKU</th><th>${lang==='he'?'שם מוצר':'Product'}</th><th>${lang==='he'?'כמות':'Qty'}</th></tr></thead>
  <tbody>${items.map(item=>`<tr>
    <td>${item.sku}</td>
    <td>${lang==='he'&&item.name_he?item.name_he:lang==='pt'&&item.name_pt?item.name_pt:item.name}</td>
    <td>${item.quantity}</td>
  </tr>`).join('')}</tbody>
</table>
${transaction.notes?`<p><strong>${lang==='he'?'הערות':'Notes'}:</strong> ${transaction.notes}</p>`:''}
<p><strong>${lang==='he'?'התקבל ע"י':'Received by'}:</strong> ${transaction.username||'-'}</p>
<div class="doc-footer">${company.company_name||'WorldSecure LTD'} &bull; ${company.email||'info@world-secure.com'}</div>
</body></html>`;

    await saveDocument('receipt', id, html, lang, req.user?.id||null, transaction.supplier_name);
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
// ── SYNC ENDPOINT (מקבל נתונים מהמחשב המקומי) ────────────────────────────────
app.post('/api/sync/:entity', authenticateToken, async (req, res) => {
  const { entity } = req.params;
  const { rows } = req.body;
  const allowed = ['customers', 'products', 'suppliers'];
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
//  SYNC ENDPOINTS - הוסף את הקוד הזה לתוך server-cloud.js
//  מעל השורה: // ── Health Check ──
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
       row.smtp_host, row.smtp_port||587, row.smtp_user, row.smtp_pass, row.smtp_from]
    );
    res.json({ message: 'settings synced' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sync: Inbound ─────────────────────────────────────────────────────────────
app.post('/api/sync/inbound', authenticateToken, async (req, res) => {
  const { transactions, items } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of transactions) {
      await client.query(`
        INSERT INTO inbound_transactions
          (id, supplier_id, supplier_type, casual_supplier_name, transaction_date, notes, user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          supplier_id=$2, supplier_type=$3, casual_supplier_name=$4,
          transaction_date=$5, notes=$6, user_id=$7`,
        [t.id, t.supplier_id||null, t.supplier_type||'registered',
         t.casual_supplier_name||null, t.transaction_date, t.notes||null, t.user_id||null]
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
  const { transactions, items } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of transactions) {
      await client.query(`
        INSERT INTO outbound_transactions
          (id, customer_id, customer_type, casual_customer_name, transaction_date, status, notes, user_id, delivery_note_sent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET
          customer_id=$2, customer_type=$3, casual_customer_name=$4,
          transaction_date=$5, status=$6, notes=$7, user_id=$8, delivery_note_sent=$9`,
        [t.id, t.customer_id||null, t.customer_type||'registered',
         t.casual_customer_name||null, t.transaction_date, t.status||'pending',
         t.notes||null, t.user_id||null, t.delivery_note_sent||false]
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

    await client.query('COMMIT');
    res.json({ message: 'outbound synced', count: transactions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ════════════════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════════════════

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ WorldSecure Cloud server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to init database:', err);
  process.exit(1);
});
