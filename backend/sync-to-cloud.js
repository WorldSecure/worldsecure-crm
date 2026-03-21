/**
 * sync-to-cloud.js  v4
 * ─────────────────────────────────────────────────────────────────────────────
 * סנכרון דו-כיווני מלא בין המחשב המקומי לענן
 *
 * LOCAL → CLOUD (כל 5 דקות):
 *   settings, customers, products, suppliers
 *   inbound_transactions + items
 *   outbound_transactions + items
 *   support_tickets + history
 *
 * CLOUD → LOCAL (כל 5 דקות):
 *   inbound_transactions + items
 *   outbound_transactions + items
 *   support_tickets + history
 *   PDF documents → שמירה לתיקיות מקומיות
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');

// ── הגדרות ───────────────────────────────────────────────────────────────────
const SQLITE_PATH      = path.join(__dirname, 'warehouse.db');
const CLOUD_API_URL    = process.env.CLOUD_API_URL || 'https://worldsecure-backend.onrender.com';
const CLOUD_SYNC_TOKEN = process.env.CLOUD_SYNC_TOKEN || '';

const LOCAL_DOCS = {
  delivery: path.join('C:\\Users\\amit\\crm-project\\backend\\documents\\delivery'),
  receipt:  path.join('C:\\Users\\amit\\crm-project\\backend\\documents\\receipt'),
};

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 דקות

// ── SQLite ────────────────────────────────────────────────────────────────────
const sqlite    = new sqlite3.Database(SQLITE_PATH);
const sqliteAll = (sql, params = []) =>
  new Promise((res, rej) =>
    sqlite.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
  );
const sqliteGet = (sql, params = []) =>
  new Promise((res, rej) =>
    sqlite.get(sql, params, (err, row) => err ? rej(err) : res(row))
  );
const sqliteRun = (sql, params = []) =>
  new Promise((res, rej) =>
    sqlite.run(sql, params, function(err) { err ? rej(err) : res(this); })
  );

// ── Log ───────────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ── HTTP helper ───────────────────────────────────────────────────────────────
function apiRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(CLOUD_API_URL + endpoint);
    const isHttps = url.protocol === 'https:';
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CLOUD_SYNC_TOKEN}`,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const reqFn = isHttps ? https.request : http.request;
    const req   = reqFn(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── הורדת קובץ ────────────────────────────────────────────────────────────────
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const url     = new URL(fileUrl);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${CLOUD_SYNC_TOKEN}` }
    };

    const reqFn = isHttps ? https.request : http.request;
    const req   = reqFn(options, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.end();
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  1. LOCAL → CLOUD
// ════════════════════════════════════════════════════════════════════════════

async function syncLocalToCloud() {
  log('▶ LOCAL → CLOUD sync...');
  try {
    await syncUsersToCloud();
    await syncQrToCloud();
    await syncEntityToCloud('customers',  'SELECT * FROM customers');
    await syncEntityToCloud('products',   'SELECT id, sku, name, name_he, name_pt, description, category_id, subcategory_id, price, currency, unit, min_quantity FROM products');
    await syncEntityToCloud('suppliers',  'SELECT * FROM suppliers');
    await syncEmailSignaturesToCloud();
    await syncInboundToCloud();
    await syncOutboundToCloud();
    await syncSupportToCloud();
    await syncWarehouseAlertsToCloud();
    await syncNotificationAcksToCloud();
    log('✅ LOCAL → CLOUD complete');
  } catch (err) {
    log(`❌ LOCAL → CLOUD error: ${err.message}`);
  }
}

async function syncSettings() {
  const rows = await sqliteAll('SELECT * FROM company_settings WHERE id=1');
  if (!rows.length) return;
  const result = await apiRequest('POST', '/api/sync/settings', { row: rows[0] });
  if (result.status === 200) log('  ↳ settings: synced');
  else log(`  ⚠ settings: ${JSON.stringify(result.body)}`);
}

async function syncEntityToCloud(entityName, sql) {
  const rows = await sqliteAll(sql);
  const result = await apiRequest('POST', `/api/sync/${entityName}`, { rows });
  if (result.status === 200) log(`  ↳ ${entityName}: ${rows.length} synced`);
  else log(`  ⚠ ${entityName}: ${JSON.stringify(result.body)}`);
}

async function syncInboundToCloud() {
  // שלח מחיקות מקומיות לענן
  await sqliteRun('CREATE TABLE IF NOT EXISTS deleted_inbound (id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});
  const deletedInbound = await sqliteAll('SELECT id FROM deleted_inbound').catch(() => []);
  for (const d of deletedInbound) {
    await apiRequest('DELETE', `/api/inbound/${d.id}`).catch(() => {});
  }
  if (deletedInbound.length > 0) {
    await sqliteRun('DELETE FROM deleted_inbound').catch(() => {});
    log(`  ↳ inbound deletions pushed to cloud: ${deletedInbound.length}`);
  }
  const transactions = await sqliteAll('SELECT it.*, u.username FROM inbound_transactions it LEFT JOIN users u ON it.user_id = u.id ORDER BY it.id');
  const items        = await sqliteAll('SELECT * FROM inbound_items ORDER BY id');
  const localIds     = transactions.map(t => t.id);
  const result = await apiRequest('POST', '/api/sync/inbound', { transactions, items, localIds });
  if (result.status === 200) log(`  ↳ inbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ inbound: ${JSON.stringify(result.body)}`);
}

async function syncOutboundToCloud() {
  // שלח מחיקות מקומיות לענן
  await sqliteRun('CREATE TABLE IF NOT EXISTS deleted_outbound (id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});
  const deletedOutbound = await sqliteAll('SELECT id FROM deleted_outbound').catch(() => []);
  for (const d of deletedOutbound) {
    await apiRequest('DELETE', `/api/outbound/${d.id}`).catch(() => {});
  }
  if (deletedOutbound.length > 0) {
    await sqliteRun('DELETE FROM deleted_outbound').catch(() => {});
    log(`  ↳ outbound deletions pushed to cloud: ${deletedOutbound.length}`);
  }
  const transactions = await sqliteAll('SELECT ot.*, u.username FROM outbound_transactions ot LEFT JOIN users u ON ot.user_id = u.id ORDER BY ot.id');
  const items        = await sqliteAll('SELECT * FROM outbound_items ORDER BY id');
  const localIds     = transactions.map(t => t.id);
  const result = await apiRequest('POST', '/api/sync/outbound', { transactions, items, localIds });
  if (result.status === 200) log(`  ↳ outbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ outbound: ${JSON.stringify(result.body)}`);
}

async function syncSupportToCloud() {
  const tickets  = await sqliteAll(`
    SELECT t.*,
      u1.username as owner_name_resolved,
      u2.username as created_by_name
    FROM support_tickets t
    LEFT JOIN users u1 ON t.owner_id = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    ORDER BY t.id`);
  // החלף owner_name בשם המעודכן מה-JOIN
  tickets.forEach(t => {
    if (t.owner_name_resolved) t.owner_name = t.owner_name_resolved;
    delete t.owner_name_resolved;
  });
  // שלח username במקום user_id — user_id שונה בין מקומי לענן!
  const historyRaw = await sqliteAll(`
    SELECT h.id, h.ticket_id, NULL as user_id, h.username, h.action,
           h.old_status, h.new_status, h.comment, h.owner_name,
           h.awaiting_channel, h.awaiting_note, h.created_at
    FROM support_ticket_history h
    ORDER BY h.id`);
  const history = historyRaw;
  // שלח רשימת IDs שנמחקו מקומית (לא את כל ה-IDs הקיימים!)
  const deletedIds = await sqliteAll('SELECT ticket_id FROM deleted_support_tickets').catch(() => []);
  const result = await apiRequest('POST', '/api/sync/support', {
    tickets,
    history,
    deletedIds: deletedIds.map(r => r.ticket_id)
  });
  if (result.status === 200) {
    // נקה את טבלת המחיקות המקומית לאחר סינק מוצלח
    await sqliteRun('DELETE FROM deleted_support_tickets').catch(() => {});
    log(`  ↳ support: ${tickets.length} tickets synced`);
  } else {
    log(`  ⚠ support: ${JSON.stringify(result.body)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  2. CLOUD → LOCAL
// ════════════════════════════════════════════════════════════════════════════

async function syncProductsFromCloud() {
  const result = await apiRequest('GET', '/api/products');
  if (result.status !== 200) { log(`  ⚠ pull products: ${JSON.stringify(result.body)}`); return; }
  const products = result.body || [];

  // migration — הוסף עמודות חדשות אם לא קיימות
  await sqliteRun('ALTER TABLE products ADD COLUMN subcategory_id INTEGER').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN name_he TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN name_pt TEXT').catch(() => {});

  let count = 0;
  for (const p of products) {
    await sqliteRun(`
      INSERT OR REPLACE INTO products
        (id, sku, name, name_he, name_pt, description, category_id, subcategory_id,
         price, currency, unit, quantity, min_quantity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.sku, p.name, p.name_he||null, p.name_pt||null, p.description||null,
       p.category_id||null, p.subcategory_id||null,
       p.price||null, p.currency||'ILS', p.unit||'unit',
       p.quantity||0, p.min_quantity||0]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log(`  ↳ products from cloud: ${count} synced`);
}

async function syncCustomersFromCloud() {
  const result = await apiRequest('GET', '/api/customers');
  if (result.status !== 200) { log(`  ⚠ pull customers: ${JSON.stringify(result.body)}`); return; }
  const customers = result.body || [];
  let count = 0;
  for (const c of customers) {
    await sqliteRun(`
      INSERT OR REPLACE INTO customers
        (id, name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.name, c.contact_person||null, c.address||null, c.phone||null,
       c.email||null, c.tax_id||null, c.country||null, c.is_sensitive ? 1 : 0, c.notes||null]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log(`  ↳ customers from cloud: ${count} synced`);
}

async function syncSuppliersFromCloud() {
  const result = await apiRequest('GET', '/api/suppliers');
  if (result.status !== 200) { log(`  ⚠ pull suppliers: ${JSON.stringify(result.body)}`); return; }
  const suppliers = result.body || [];
  let count = 0;
  for (const s of suppliers) {
    await sqliteRun(`
      INSERT OR REPLACE INTO suppliers
        (id, name, contact_person, address, phone, email, tax_id, country, notes)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [s.id, s.name, s.contact_person||null, s.address||null, s.phone||null,
       s.email||null, s.tax_id||null, s.country||null, s.notes||null]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log(`  ↳ suppliers from cloud: ${count} synced`);
}

async function syncCloudToLocal() {
  log('▶ CLOUD → LOCAL sync...');
  try {
    await syncSettingsFromCloud();
    await syncUsersFromCloud();
    await syncQrFromCloud();
    await syncProductsFromCloud();
    await syncCustomersFromCloud();
    await syncSuppliersFromCloud();
    await syncInboundFromCloud();
    await syncOutboundFromCloud();
    await syncSupportFromCloud();
    await syncWarehouseAlertsFromCloud();
    await syncNotificationsFromCloud();
    await syncDocumentsFromCloud();
    log('✅ CLOUD → LOCAL complete');
  } catch (err) {
    log(`❌ CLOUD → LOCAL error: ${err.message}`);
  }
}

// ── Inbound מהענן ─────────────────────────────────────────────────────────────
async function syncInboundFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/inbound');
  if (result.status !== 200) { log(`  ⚠ pull inbound: ${JSON.stringify(result.body)}`); return; }

  const { transactions, items } = result.body;
  let count = 0;

  for (const t of (transactions || [])) {
    await sqliteRun(`
      INSERT OR REPLACE INTO inbound_transactions
        (id, supplier_id, supplier_type, casual_supplier_name, transaction_date, notes, user_id, username)
      VALUES (?,?,?,?,?,?,?,?)`,
      [t.id, t.supplier_id||null, t.supplier_type||'registered',
       t.casual_supplier_name||null, t.transaction_date, t.notes||null, t.user_id||null, t.username||null]
    );
    count++;
  }

  for (const item of (items || [])) {
    await sqliteRun(`
      INSERT OR REPLACE INTO inbound_items (id, transaction_id, product_id, quantity, notes)
      VALUES (?,?,?,?,?)`,
      [item.id, item.transaction_id, item.product_id, item.quantity, item.notes||null]
    );
  }

  if (count > 0) log(`  ↳ inbound from cloud: ${count} transactions`);
}

// ── Outbound מהענן ────────────────────────────────────────────────────────────
async function syncOutboundFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/outbound');
  if (result.status !== 200) { log(`  ⚠ pull outbound: ${JSON.stringify(result.body)}`); return; }

  const { transactions, items } = result.body;
  let count = 0;

  for (const t of (transactions || [])) {
    await sqliteRun(`
      INSERT OR REPLACE INTO outbound_transactions
        (id, customer_id, customer_type, casual_customer_name, transaction_date, status, notes, user_id, delivery_note_sent, username)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.customer_id||null, t.customer_type||'registered',
       t.casual_customer_name||null, t.transaction_date, t.status||'pending',
       t.notes||null, t.user_id||null, t.delivery_note_sent ? 1 : 0, t.username||null]
    );
    count++;
  }

  for (const item of (items || [])) {
    await sqliteRun(`
      INSERT OR REPLACE INTO outbound_items
        (id, transaction_id, product_id, quantity, use_packaging, items_per_carton,
         carton_weight, num_cartons, use_pallets, cartons_per_pallet,
         pallet_dimensions, pallet_weight, num_pallets)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [item.id, item.transaction_id, item.product_id, item.quantity,
       item.use_packaging ? 1 : 0, item.items_per_carton||null, item.carton_weight||null,
       item.num_cartons||null, item.use_pallets ? 1 : 0, item.cartons_per_pallet||null,
       item.pallet_dimensions||null, item.pallet_weight||null, item.num_pallets||null]
    );
  }

  if (count > 0) log(`  ↳ outbound from cloud: ${count} transactions`);
}

// ── Support מהענן ─────────────────────────────────────────────────────────────
async function syncSupportFromCloud() {
  // וודא שהטבלאות קיימות במקומי
  // טבלת מחיקות מקומית - שומרת IDs של tickets שנמחקו מקומית
  await sqliteRun(`CREATE TABLE IF NOT EXISTS deleted_support_tickets (
    ticket_id INTEGER PRIMARY KEY,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});

  await sqliteRun(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY,
    ticket_number TEXT,
    customer_id INTEGER,
    customer_name TEXT,
    product_id INTEGER,
    product_name TEXT,
    subject TEXT,
    description TEXT,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    owner_id INTEGER,
    owner_name TEXT,
    created_by INTEGER,
    awaiting_channel TEXT,
    awaiting_note TEXT,
    awaiting_deadline TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    closed_at DATETIME,
    cancelled_at DATETIME,
    owner_updated_at DATETIME
  )`).catch(() => {});
  // migration - הוסף owner_updated_at אם לא קיים
  await sqliteRun(`ALTER TABLE support_tickets ADD COLUMN owner_updated_at DATETIME`).catch(() => {});

  await sqliteRun(`CREATE TABLE IF NOT EXISTS support_ticket_history (
    id INTEGER PRIMARY KEY,
    ticket_id INTEGER,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    old_status TEXT,
    new_status TEXT,
    comment TEXT,
    created_at DATETIME
  )`).catch(() => {});

  const result = await apiRequest('GET', '/api/sync/pull/support');
  if (result.status !== 200) { log(`  ⚠ pull support: ${JSON.stringify(result.body)}`); return; }

  const { tickets, history } = result.body;
  let count = 0;

  for (const t of (tickets || [])) {
    // תרגם owner ו-created_by לפי username (IDs שונים בין ענן למקומי)
    let localOwnerId = null;
    if (t.owner_name) {
      const row = await sqliteGet('SELECT id FROM users WHERE username=?', [t.owner_name]).catch(() => null);
      localOwnerId = row?.id || null;
    }
    let localCreatedBy = null;
    if (t.created_by_name) {
      const row = await sqliteGet('SELECT id FROM users WHERE username=?', [t.created_by_name]).catch(() => null);
      localCreatedBy = row?.id || null;
    }

    // עדכן owner: אם הענן מחזיר owner_name שונה ממה שיש מקומית — עדכן תמיד
    const existing = await sqliteGet('SELECT owner_id, owner_name, owner_updated_at FROM support_tickets WHERE id=?', [t.id]).catch(() => null);
    const normalizeTs = (v) => {
      if (!v) return '';
      // השוואה לפי string בלי המרת timezone
      // "2026-03-13T16:29:46.000Z" → "2026-03-13T16:29:46"
      // "2026-03-13 16:29:46"      → "2026-03-13T16:29:46"
      return String(v).replace(' ', 'T').slice(0, 19);
    };
    const cloudOwnerUpdated = normalizeTs(t.owner_updated_at);
    const localOwnerUpdated = normalizeTs(existing?.owner_updated_at);
    // עדכן אם: ticket חדש, timestamp ענן חדש יותר, או owner_name שונה
    const cloudOwnerName = t.owner_name || null;
    const localOwnerName = existing?.owner_name || null;
    const shouldUpdateOwner = !existing || cloudOwnerUpdated > localOwnerUpdated || cloudOwnerName !== localOwnerName;

    const finalOwnerId = shouldUpdateOwner ? localOwnerId : existing.owner_id;
    const finalOwnerName = shouldUpdateOwner ? (t.owner_name||null) : existing.owner_name;

    await sqliteRun(`
      INSERT OR REPLACE INTO support_tickets
        (id, ticket_number, customer_id, customer_name, product_id, product_name,
         subject, description, status, priority, owner_id, owner_name, created_by,
         awaiting_channel, awaiting_note, awaiting_deadline,
         created_at, updated_at, closed_at, cancelled_at, owner_updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.ticket_number, t.customer_id||null, t.customer_name||null,
       t.product_id||null, t.product_name||null, t.subject, t.description||null,
       t.status||'open', t.priority||'medium', finalOwnerId, finalOwnerName,
       localCreatedBy, t.awaiting_channel||null, t.awaiting_note||null,
       t.awaiting_deadline||null, t.created_at, t.updated_at||null,
       t.closed_at||null, t.cancelled_at||null, t.owner_updated_at||null]
    );
    count++;
  }

  // משוך history מהענן — רק רשומות שלא קיימות מקומית
  for (const h of (history || [])) {
    let displayName = h.username || null;
    if (displayName && displayName.includes('@')) {
      const userRow = await sqliteGet('SELECT username FROM users WHERE email=?', [displayName]).catch(() => null);
      if (userRow?.username) displayName = userRow.username;
    }
    const normalizeTs = (v) => {
      if (!v) return '';
      // השוואה לפי תווים בלבד — ללא המרת timezone
      // "2026-03-13T16:16:07.000Z" → "2026-03-13T16:16:07"
      // "2026-03-13 16:16:07"      → "2026-03-13T16:16:07"
      return String(v).replace(' ', 'T').slice(0, 19);
    };
    const hNorm = normalizeTs(h.created_at);
    const allLocal = await sqliteAll(
      'SELECT id, username, owner_name, created_at FROM support_ticket_history WHERE ticket_id=? AND action=?',
      [h.ticket_id, h.action]
    ).catch(() => []);
    const exists = allLocal.find(r => normalizeTs(r.created_at) === hNorm) || null;
    if (!exists) {
      await sqliteRun(`
        INSERT INTO support_ticket_history
          (ticket_id, user_id, username, action, old_status, new_status, comment, owner_name, awaiting_channel, awaiting_note, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [h.ticket_id, null, displayName, h.action,
         h.old_status||null, h.new_status||null, h.comment||null, h.owner_name||null,
         h.awaiting_channel||null, h.awaiting_note||null, h.created_at]
      ).catch(() => {});
    } else {
      await sqliteRun(
        'UPDATE support_ticket_history SET username=?, owner_name=?, awaiting_channel=?, awaiting_note=? WHERE id=?',
        [displayName || exists.username, h.owner_name||null, h.awaiting_channel||null, h.awaiting_note||null, exists.id]
      ).catch(() => {});
    }
  }

  if (count > 0) log(`  ↳ support from cloud: ${count} tickets`);
}

// ── PDF documents מהענן ───────────────────────────────────────────────────────
async function syncDocumentsFromCloud() {
  for (const dir of Object.values(LOCAL_DOCS)) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  for (const docType of ['delivery', 'receipt']) {
    try {
      const result = await apiRequest('GET', `/api/documents/list/${docType}`);
      if (result.status !== 200 || !Array.isArray(result.body)) continue;

      const localDir      = LOCAL_DOCS[docType];
      const existingFiles = fs.readdirSync(localDir);
      let downloaded = 0;

      for (const doc of result.body) {
        if (existingFiles.includes(doc.filename)) continue;
        const localPath = path.join(localDir, doc.filename);
        try {
          await downloadFile(doc.url, localPath);
          await apiRequest('PUT', `/api/documents/mark-synced/${doc.id}`);
          downloaded++;
          log(`  ↳ Downloaded: ${doc.filename}`);
        } catch (err) {
          log(`  ⚠ Failed: ${doc.filename}: ${err.message}`);
        }
      }
      if (downloaded > 0) log(`  ↳ ${docType}: ${downloaded} PDFs downloaded`);
    } catch (err) {
      log(`  ❌ ${docType} error: ${err.message}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  הפעלה
// ════════════════════════════════════════════════════════════════════════════

// ── Pull deletions from cloud and apply locally ───────────────────────────────
async function pullDeletionsFromCloud() {
  try {
    const result = await apiRequest('GET', '/api/sync/pending-deletions');
    if (result.status !== 200) return;
    const deletions = result.body;
    if (!deletions || deletions.length === 0) return;

    const handled = [];
    for (const d of deletions) {
      if (d.entity_type === 'support_ticket') {
        await sqliteRun('DELETE FROM support_ticket_history WHERE ticket_id = ?', [d.entity_id]);
        await sqliteRun('DELETE FROM support_tickets WHERE id = ?', [d.entity_id]);
        await sqliteRun('DELETE FROM deleted_support_tickets WHERE ticket_id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: support_ticket #${d.entity_id}`);
      } else if (d.entity_type === 'inbound') {
        await sqliteRun('DELETE FROM inbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM inbound_transactions WHERE id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM deleted_inbound WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: inbound #${d.entity_id}`);
      } else if (d.entity_type === 'outbound') {
        await sqliteRun('DELETE FROM outbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM outbound_transactions WHERE id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM deleted_outbound WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: outbound #${d.entity_id}`);
      }
    }

    if (handled.length > 0) {
      await apiRequest('DELETE', '/api/sync/pending-deletions', { ids: handled });
      log(`  ↳ cleared ${handled.length} pending deletions from cloud`);
    }
  } catch (err) {
    log(`  ⚠ pullDeletions error: ${err.message}`);
  }
}


// ════════════════════════════════════════════════════════════════════════════
//  USERS sync (דו-כיווני, ללא סיסמאות)
// ════════════════════════════════════════════════════════════════════════════

async function syncUsersToCloud() {
  const rows = await sqliteAll('SELECT id, username, email, role FROM users ORDER BY id');
  // סנן משתמש sync — הוא משתמש מערכת ולא צריך להגיע לענן
  const filtered = rows.filter(r => r.email !== 'sync@worldsecure.com' && r.username !== 'sync');
  const rowsWithPass = filtered.map(r => ({ ...r, password: r.password || 'SYNC_PLACEHOLDER' }));
  const result = await apiRequest('POST', '/api/sync/users', { rows: rowsWithPass });
  if (result.status === 200) log('  ↳ users to cloud: ' + filtered.length + ' synced');
  else log('  ⚠ users to cloud: ' + JSON.stringify(result.body));
}

async function syncUsersFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/users');
  if (result.status !== 200) { log('  ⚠ pull users: ' + JSON.stringify(result.body)); return; }
  const users = result.body;
  let count = 0;
  for (const u of (users || [])) {
    // דלג על משתמש sync
    if (u.email === 'sync@worldsecure.com' || u.username === 'sync') continue;
    // בדוק אם המשתמש קיים מקומית לפי EMAIL (לא לפי ID — IDs שונים בין ענן למקומי)
    const existing = await sqliteGet('SELECT id FROM users WHERE email=?', [u.email]).catch(() => null);
    if (existing) {
      // עדכן username ו-role בלבד — לא סיסמה, לא ID
      await sqliteRun(
        'UPDATE users SET username=?, role=? WHERE email=?',
        [u.username, u.role, u.email]
      ).catch(() => {});
    } else {
      // משתמש חדש שלא קיים מקומית — הוסף עם סיסמה זמנית
      await sqliteRun(
        'INSERT OR IGNORE INTO users (username, email, role, password) VALUES (?,?,?,?)',
        [u.username, u.email, u.role, 'TEMP_NEEDS_RESET']
      ).catch(() => {});
    }
    count++;
  }
  if (count > 0) log('  ↳ users from cloud: ' + count + ' synced');
}


// ── Settings מהענן ────────────────────────────────────────────────────────────
async function syncSettingsFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/settings');
  if (result.status !== 200 || !result.body) { log('  ⚠ pull settings: ' + JSON.stringify(result.body)); return; }
  const s = result.body;

  // הורד קובץ לוגו מהענן אם קיים ולא קיים מקומית
  let localLogoPath = null;
  if (s.logo_path) {
    const logoFilename = path.basename(s.logo_path);
    const localUploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(localUploadsDir)) fs.mkdirSync(localUploadsDir, { recursive: true });
    const localPath = path.join(localUploadsDir, logoFilename);
    if (!fs.existsSync(localPath)) {
      try {
        await downloadFile(CLOUD_API_URL + s.logo_path, localPath);
        log('  ↳ logo downloaded: ' + logoFilename);
      } catch (e) {
        log('  ⚠ logo download failed: ' + e.message);
      }
    }
    localLogoPath = '/uploads/' + logoFilename;
  }

  await sqliteRun(`
    INSERT OR REPLACE INTO company_settings
      (id, company_name, address, phone, phone2, phone3, email, tax_id, website,
       smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, logo_path,
       phone1_primary, phone2_primary, phone3_primary)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.company_name||null, s.address||null, s.phone||null, s.phone2||null, s.phone3||null,
     s.email||null, s.tax_id||null, s.website||null,
     s.smtp_host||null, 587, s.smtp_user||null, s.smtp_pass||null, s.smtp_from||null,
     localLogoPath||null,
     s.phone1_primary ? 1 : 0, s.phone2_primary ? 1 : 0, s.phone3_primary ? 1 : 0]
  ).catch(() => {});
  log('  ↳ settings from cloud: synced');
}

// ── QR Codes סינק ─────────────────────────────────────────────────────────────
async function syncQrToCloud() {
  const rows = await sqliteAll('SELECT * FROM qr_codes ORDER BY id').catch(() => []);
  if (!rows.length) return;
  const result = await apiRequest('POST', '/api/sync/qr-codes', { rows });
  if (result.status === 200) log('  ↳ qr-codes to cloud: ' + rows.length + ' synced');
  else log('  ⚠ qr-codes to cloud: ' + JSON.stringify(result.body));
}

async function syncQrFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/qr-codes');
  if (result.status !== 200) { log('  ⚠ pull qr-codes: ' + JSON.stringify(result.body)); return; }
  const rows = result.body || [];
  await sqliteRun('CREATE TABLE IF NOT EXISTS qr_codes (id INTEGER PRIMARY KEY, type TEXT, qr_data TEXT, image_url TEXT, title TEXT, created_by INTEGER, created_at DATETIME)').catch(() => {});
  let count = 0;
  for (const r of rows) {
    // הענן הוא מקור הסמכות לtitle — תמיד הורד מהענן
    await sqliteRun(
      'INSERT OR REPLACE INTO qr_codes (id, type, qr_data, image_url, title, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      [r.id, r.type, r.qr_data, r.image_url||null, r.title||null, r.created_by||null, r.created_at||null]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log('  ↳ qr-codes from cloud: ' + count + ' synced');
}

// ── Email Signatures סינק ─────────────────────────────────────────────────────
async function syncEmailSignaturesToCloud() {
  const rows = await sqliteAll('SELECT * FROM email_signatures ORDER BY id').catch(() => []);
  if (!rows.length) return;
  const result = await apiRequest('POST', '/api/sync/email-signatures', { rows });
  if (result.status === 200) log('  ↳ email-signatures to cloud: ' + rows.length + ' synced');
  else log('  ⚠ email-signatures to cloud: ' + JSON.stringify(result.body));
}

// ── Warehouse Alerts — דו-כיווני ─────────────────────────────────────────────

async function ensureWarehouseAlertsTable() {
  await sqliteRun(`CREATE TABLE IF NOT EXISTS warehouse_alerts (
    id INTEGER PRIMARY KEY,
    ticket_id INTEGER,
    ticket_number TEXT,
    customer_name TEXT,
    customer_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER DEFAULT 1,
    requested_by INTEGER,
    requested_by_name TEXT,
    status TEXT DEFAULT 'pending',
    outbound_id INTEGER,
    outbound_ref TEXT,
    created_at TEXT,
    completed_at TEXT,
    synced_from TEXT
  )`).catch(() => {});
  // migration — הוסף עמודות חסרות בטבלאות ישנות
  for (const col of [
    'ALTER TABLE warehouse_alerts ADD COLUMN outbound_id INTEGER',
    'ALTER TABLE warehouse_alerts ADD COLUMN outbound_ref TEXT',
    'ALTER TABLE warehouse_alerts ADD COLUMN customer_id INTEGER',
    'ALTER TABLE warehouse_alerts ADD COLUMN completed_at TEXT',
    'ALTER TABLE warehouse_alerts ADD COLUMN synced_from TEXT',
    'ALTER TABLE warehouse_alerts ADD COLUMN completion_synced INTEGER DEFAULT 0',
  ]) { await sqliteRun(col).catch(() => {}); }
}

// LOCAL → CLOUD: שלח alerts שנוצרו מקומית לענן
async function syncWarehouseAlertsToCloud() {
  await ensureWarehouseAlertsTable();

  // 1. שלח alerts חדשים שנוצרו מקומית (synced_from IS NULL)
  const localAlerts = await sqliteAll(
    `SELECT * FROM warehouse_alerts WHERE synced_from IS NULL ORDER BY created_at`
  ).catch(() => []);

  if (localAlerts.length) {
    const result = await apiRequest('POST', '/api/sync/warehouse-alerts', { alerts: localAlerts });
    if (result.status === 200) {
      const { upserted = [] } = result.body;
      for (const u of upserted) {
        if (u.local_id && u.cloud_id && u.local_id !== u.cloud_id) {
          await sqliteRun(
            `UPDATE warehouse_alerts SET synced_from='cloud', id=? WHERE id=? AND synced_from IS NULL`,
            [u.cloud_id, u.local_id]
          ).catch(() => {});
        } else {
          await sqliteRun(
            `UPDATE warehouse_alerts SET synced_from='cloud' WHERE id=? AND synced_from IS NULL`,
            [u.local_id]
          ).catch(() => {});
        }
      }
      log(`  ↳ warehouse-alerts to cloud: ${localAlerts.length} sent, ${upserted.length} confirmed`);
    } else {
      log(`  ⚠ warehouse-alerts to cloud: ${JSON.stringify(result.body)}`);
    }
  }

  // 2. דווח לענן על alerts שהושלמו מקומית (synced_from='cloud' + status='completed')
  const completedAlerts = await sqliteAll(
    `SELECT * FROM warehouse_alerts WHERE synced_from='cloud' AND status='completed' AND (completion_synced = 0 OR completion_synced IS NULL) ORDER BY completed_at`
  ).catch(() => []);

  // הוסף עמודת completion_synced אם לא קיימת
  await sqliteRun('ALTER TABLE warehouse_alerts ADD COLUMN completion_synced INTEGER DEFAULT 0').catch(() => {});

  for (const a of completedAlerts) {
    // מצא את שם המחסנאי שעשה complete מתוך היסטוריית הקריאה
    const historyRow = await sqliteGet(
      `SELECT username FROM support_ticket_history WHERE ticket_id=? AND action='product_dispatched' ORDER BY created_at DESC LIMIT 1`,
      [a.ticket_id]
    ).catch(() => null);

    const result = await apiRequest('PUT', `/api/warehouse-alerts/${a.id}/complete`, {
      outbound_id:   a.outbound_id  || null,
      outbound_ref:  a.outbound_ref || null,
      _from_sync:    true,
      sync_username: historyRow?.username || null
    });
    if (result.status === 200 || result.status === 404) {
      // 404 = כבר הושלם בענן — סמן בכל מקרה
      await sqliteRun(
        `UPDATE warehouse_alerts SET completion_synced=1 WHERE id=?`, [a.id]
      ).catch(() => {});
      log(`  ↳ warehouse-alert #${a.id} completion synced to cloud`);
    } else {
      log(`  ⚠ warehouse-alert #${a.id} completion failed: ${JSON.stringify(result.body)}`);
    }
  }
}

// CLOUD → LOCAL: משוך alerts מהענן (כולל completed)
async function syncWarehouseAlertsFromCloud() {
  await ensureWarehouseAlertsTable();

  const result = await apiRequest('GET', '/api/sync/pull/warehouse-alerts');
  if (result.status !== 200) { log(`  ⚠ pull warehouse-alerts: ${JSON.stringify(result.body)}`); return; }
  const alerts = result.body || [];

  let count = 0;
  for (const a of alerts) {
    const existing = await sqliteGet(
      'SELECT id, synced_from, status, completion_synced FROM warehouse_alerts WHERE id=?', [a.id]
    ).catch(() => null);

    // אל תדרוס alert שנוצר מקומית ועוד לא נשלח לענן
    if (existing && existing.synced_from === null) continue;

    // אם הושלם מקומית ועוד לא דווח לענן (completion_synced=0) — אל תדרוס בשום אופן!
    // הסטאטוס המקומי הוא הנכון, הענן עוד לא יודע על השלמתה
    if (existing && existing.status === 'completed' && existing.completion_synced === 0) continue;

    // לוגיקת completion_synced:
    // alert יורד מהענן כ-completed — סמן 1 (הענן יודע, לא צריך לדווח חזרה)
    // alert יורד כ-pending — סמן 0 (בעתיד אם יושלם מקומית, יעלה לענן)
    const completionSynced = a.status === 'completed' ? 1 : (existing?.completion_synced || 0);

    await sqliteRun(`
      INSERT OR REPLACE INTO warehouse_alerts
        (id, ticket_id, ticket_number, customer_name, customer_id,
         product_id, product_name, quantity, requested_by, requested_by_name,
         status, outbound_id, outbound_ref, created_at, completed_at,
         synced_from, completion_synced)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.id, a.ticket_id, a.ticket_number, a.customer_name, a.customer_id||null,
       a.product_id, a.product_name, a.quantity||1, a.requested_by, a.requested_by_name,
       a.status||'pending', a.outbound_id||null, a.outbound_ref||null,
       a.created_at, a.completed_at||null, 'cloud', completionSynced]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log(`  ↳ warehouse-alerts from cloud: ${count} synced`);
}
// ── Notifications דו-כיווני ────────────────────────────────────────────────────

async function ensureNotificationsTable() {
  await sqliteRun(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    cloud_id INTEGER,
    user_id INTEGER,
    user_email TEXT,
    type TEXT,
    title TEXT,
    message TEXT,
    data TEXT,
    is_read INTEGER DEFAULT 0,
    needs_ack INTEGER DEFAULT 0,
    acked_at TEXT,
    created_at TEXT
  )`).catch(() => {});
  await sqliteRun('ALTER TABLE notifications ADD COLUMN cloud_id INTEGER').catch(() => {});
  await sqliteRun('ALTER TABLE notifications ADD COLUMN user_email TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE notifications ADD COLUMN needs_ack INTEGER DEFAULT 0').catch(() => {});
  await sqliteRun('ALTER TABLE notifications ADD COLUMN acked_at TEXT').catch(() => {});
}

// CLOUD → LOCAL: משוך notifications מהענן למקומי
async function syncNotificationsFromCloud() {
  await ensureNotificationsTable();

  const result = await apiRequest('GET', '/api/sync/pull/notifications');
  if (result.status !== 200) { log('  ⚠ pull notifications: ' + JSON.stringify(result.body)); return; }
  const notifications = result.body || [];

  let count = 0;
  for (const n of notifications) {
    // מצא user_id מקומי לפי email
    let localUserId = null;
    if (n.user_email) {
      const userRow = await sqliteGet('SELECT id FROM users WHERE email=?', [n.user_email]).catch(() => null);
      localUserId = userRow?.id || null;
    }
    if (!localUserId) continue; // אם המשתמש לא קיים מקומית — דלג

    // בדוק אם כבר קיים לפי cloud_id
    const existing = await sqliteGet('SELECT id, is_read, needs_ack FROM notifications WHERE cloud_id=?', [n.id]).catch(() => null);

    if (existing) {
      // עדכן סטאטוס אם שונה בענן
      if (n.is_read !== existing.is_read || n.needs_ack !== existing.needs_ack) {
        await sqliteRun(
          'UPDATE notifications SET is_read=?, needs_ack=?, acked_at=? WHERE cloud_id=?',
          [n.is_read ? 1 : 0, n.needs_ack ? 1 : 0, n.acked_at||null, n.id]
        ).catch(() => {});
      }
      continue;
    }

    // notification חדש — הוסף
    await sqliteRun(`
      INSERT INTO notifications (cloud_id, user_id, user_email, type, title, message, data, is_read, needs_ack, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [n.id, localUserId, n.user_email||null, n.type, n.title||null, n.message||null,
       n.data||null, n.is_read ? 1 : 0, n.needs_ack ? 1 : 0, n.created_at]
    ).catch(() => {});
    count++;
  }
  if (count > 0) log('  ↳ notifications from cloud: ' + count + ' synced');
}

// LOCAL → CLOUD: שלח acks שנעשו מקומית חזרה לענן
async function syncNotificationAcksToCloud() {
  await ensureNotificationsTable();

  // מצא notifications שאושרו מקומית (needs_ack=0, is_read=1, acked_at קיים) אבל עוד לא נדווח לענן
  const ackedLocally = await sqliteAll(
    `SELECT cloud_id FROM notifications WHERE cloud_id IS NOT NULL AND is_read=1 AND needs_ack=0 AND acked_at IS NOT NULL`
  ).catch(() => []);

  if (!ackedLocally.length) return;

  const acked_ids = ackedLocally.map(r => r.cloud_id).filter(Boolean);
  const result = await apiRequest('POST', '/api/sync/notifications/ack', { acked_ids });
  if (result.status === 200) {
    log('  ↳ notification acks to cloud: ' + acked_ids.length + ' synced');
  } else {
    log('  ⚠ notification acks to cloud: ' + JSON.stringify(result.body));
  }
}


async function syncAll() {
  await pullDeletionsFromCloud();
  await syncLocalToCloud();
  await syncCloudToLocal();
}

async function main() {
  log('🚀 WorldSecure Sync Service v4 starting...');
  log(`   SQLite: ${SQLITE_PATH}`);
  log(`   Cloud:  ${CLOUD_API_URL}`);

  if (!CLOUD_SYNC_TOKEN) {
    log('❌ CLOUD_SYNC_TOKEN is missing in .env!');
    process.exit(1);
  }

  await syncAll();
  setInterval(syncAll, SYNC_INTERVAL_MS);

  log(`⏱  Scheduled: full sync every ${SYNC_INTERVAL_MS/60000} min`);
  log('   (keeping process alive...)');
}

main().catch(err => {
  log(`💥 Fatal: ${err.message}`);
  process.exit(1);
});
