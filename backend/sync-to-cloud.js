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
    await syncSettings();
    await syncEntityToCloud('customers',  'SELECT * FROM customers');
    await syncEntityToCloud('products',   'SELECT * FROM products');
    await syncEntityToCloud('suppliers',  'SELECT * FROM suppliers');
    await syncInboundToCloud();
    await syncOutboundToCloud();
    await syncSupportToCloud();
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
  const transactions = await sqliteAll('SELECT it.*, u.username FROM inbound_transactions it LEFT JOIN users u ON it.user_id = u.id ORDER BY it.id');
  const items        = await sqliteAll('SELECT * FROM inbound_items ORDER BY id');
  const localIds     = transactions.map(t => t.id);
  const result = await apiRequest('POST', '/api/sync/inbound', { transactions, items, localIds });
  if (result.status === 200) log(`  ↳ inbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ inbound: ${JSON.stringify(result.body)}`);
}

async function syncOutboundToCloud() {
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
           h.old_status, h.new_status, h.comment, h.owner_name, h.created_at
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

async function syncCloudToLocal() {
  log('▶ CLOUD → LOCAL sync...');
  try {
    await syncInboundFromCloud();
    await syncOutboundFromCloud();
    await syncSupportFromCloud();
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
        (id, supplier_id, supplier_type, casual_supplier_name, transaction_date, notes, user_id)
      VALUES (?,?,?,?,?,?,?)`,
      [t.id, t.supplier_id||null, t.supplier_type||'registered',
       t.casual_supplier_name||null, t.transaction_date, t.notes||null, t.user_id||null]
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
        (id, customer_id, customer_type, casual_customer_name, transaction_date, status, notes, user_id, delivery_note_sent)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [t.id, t.customer_id||null, t.customer_type||'registered',
       t.casual_customer_name||null, t.transaction_date, t.status||'pending',
       t.notes||null, t.user_id||null, t.delivery_note_sent ? 1 : 0]
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

  const { tickets } = result.body; // history לא נמשך — המקומי הוא מקור האמת
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
      if (!v) return 0;
      const ts = new Date(String(v).replace(' ', 'T')).getTime();
      return isNaN(ts) ? 0 : ts;
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

  // history לא נמשך מהענן — המקומי הוא מקור האמת ל-history
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
        // הסר מ-deleted_support_tickets אם קיים שם (למנוע לולאה)
        await sqliteRun('DELETE FROM deleted_support_tickets WHERE ticket_id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: support_ticket #${d.entity_id}`);
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
