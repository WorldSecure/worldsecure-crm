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
    await syncEntityToCloud('categories',    'SELECT id, name, name_he, name_pt, description, code, updated_at FROM categories WHERE is_deleted IS NULL OR is_deleted=0', 'updated_at');
    await syncDeletedCategoriesToCloud();
    await syncEntityToCloud('subcategories', 'SELECT id, category_id, name, name_he, name_pt, code, updated_at FROM subcategories WHERE is_deleted IS NULL OR is_deleted=0', 'updated_at');
    await syncDeletedSubcategoriesToCloud();
    await syncEntityToCloud('customers',  'SELECT id, name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes, created_at, updated_at FROM customers', 'updated_at');
    await syncEntityToCloud('variant_attribute_types', 'SELECT id, name, name_he, name_pt, created_at FROM variant_attribute_types WHERE is_deleted IS NULL OR is_deleted=0', 'created_at');
    await syncDeletedVariantAttrTypesToCloud();
    await syncEntityToCloud('product_type_codes', 'SELECT id, code, name, name_he, name_pt, created_at FROM product_type_codes WHERE is_deleted IS NULL OR is_deleted=0', 'created_at');
    await syncDeletedProductTypeCodesToCloud();
    await syncEmailSignaturesToCloud();
    await syncOutboundSignaturesToCloud();
    await syncProformaSignaturesToCloud();
    // ⚡ inbound/outbound BEFORE products — כך כל מחיקות עדכנות ה-timestamp לפני שנשלח כמות
    await syncInboundToCloud();
    await syncOutboundToCloud();
    await syncDeletedProductsToCloud();
    await syncEntityToCloud('products',   'SELECT id, sku, name, name_he, name_pt, description, category_id, subcategory_id, supplier_id, manufacturer_id, price, currency, unit, quantity, min_quantity, quantity_updated_at, meta_updated_at, is_parent, variant_attrs, parent_id, is_active, product_type_code FROM products', 'meta_updated_at');
    await syncEntityToCloud('suppliers',  'SELECT id, name, address, phone, email, tax_id, country, contact_person, notes, created_at, updated_at FROM suppliers', 'updated_at');
    await syncEntityToCloud('manufacturers', 'SELECT id, name, address, phone, email, tax_id, country, contact_person, notes, created_at, updated_at FROM manufacturers', 'updated_at');
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

// ── sync_state table: שומר last_sync_at לכל ישות ──────────────────────────
async function getLastSyncAt(entityName) {
  await sqliteRun(`CREATE TABLE IF NOT EXISTS sync_state (entity TEXT PRIMARY KEY, last_sync_at TEXT)`).catch(() => {});
  const row = await sqliteGet('SELECT last_sync_at FROM sync_state WHERE entity=?', [entityName]).catch(() => null);
  return row ? row.last_sync_at : null;
}

async function setLastSyncAt(entityName, ts) {
  // שמור בפורמט SQLite: "YYYY-MM-DD HH:MM:SS" (ללא T וללא Z)
  // כדי שהשוואה עם updated_at ב-SQLite תעבוד נכון
  const sqliteTs = new Date(ts).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
  await sqliteRun(
    `INSERT INTO sync_state (entity, last_sync_at) VALUES (?,?) ON CONFLICT(entity) DO UPDATE SET last_sync_at=excluded.last_sync_at`,
    [entityName, sqliteTs]
  ).catch(() => {});
}

// updatedAtField — שם העמודה שמייצגת מתי הרשומה עודכנה לאחרונה
// אם null — שולח הכל תמיד (לישויות קטנות/ללא timestamp)
async function syncEntityToCloud(entityName, sql, updatedAtField = null) {
  let rows;

  if (updatedAtField) {
    const lastSync = await getLastSyncAt(entityName);
    if (lastSync) {
      // שלח רק רשומות שהשתנו מאז הסינק האחרון
      const haswhere = sql.toLowerCase().includes(' where ');
      // השתמש ב-datetime() כדי לנרמל formats שונים (ISO עם T/Z, ו-SQLite עם space)
      const deltaSql = haswhere
        ? sql + ` AND datetime(${updatedAtField}) > datetime(?)`
        : sql + ` WHERE datetime(${updatedAtField}) > datetime(?)`;
      rows = await sqliteAll(deltaSql, [lastSync]);
    } else {
      // סינק ראשון — שלח הכל
      rows = await sqliteAll(sql);
    }
  } else {
    rows = await sqliteAll(sql);
  }

  if (rows.length === 0) {
    log(`  ↳ ${entityName}: no changes since last sync — skipped`);
    if (updatedAtField) await setLastSyncAt(entityName, new Date().toISOString());
    return;
  }

  const result = await apiRequest('POST', `/api/sync/${entityName}`, { rows });
  if (result.status === 200) {
    log(`  ↳ ${entityName}: ${rows.length} synced`);
    if (updatedAtField) await setLastSyncAt(entityName, new Date().toISOString());
  } else {
    log(`  ⚠ ${entityName}: ${JSON.stringify(result.body)}`);
  }
}

async function syncDeletedProductsToCloud() {
  await sqliteRun('CREATE TABLE IF NOT EXISTS deleted_products (id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});
  const deleted = await sqliteAll('SELECT id FROM deleted_products').catch(() => []);
  if (deleted.length === 0) return;
  let successCount = 0;
  for (const d of deleted) {
    const result = await apiRequest('DELETE', `/api/products/${d.id}`).catch(() => ({ status: 500 }));
    if (result.status === 200 || result.status === 404) {
      await sqliteRun('DELETE FROM deleted_products WHERE id=?', [d.id]).catch(() => {});
      successCount++;
    }
  }
  if (successCount > 0) log(`  ↳ product deletions pushed to cloud: ${successCount}`);
}

async function syncDeletedCategoriesToCloud() {
  // is_deleted — קרא קטגוריות שסומנו כמחוקות ושלח לענן
  const deleted = await sqliteAll('SELECT id FROM categories WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  if (deleted.length === 0) return;
  let successCount = 0;
  for (const d of deleted) {
    const result = await apiRequest('DELETE', `/api/categories/${d.id}`).catch(() => ({ status: 500 }));
    if (result.status === 200 || result.status === 404) {
      await sqliteRun('UPDATE categories SET deleted_synced=1 WHERE id=?', [d.id]).catch(() => {});
      successCount++;
    }
  }
  if (successCount > 0) log(`  ↳ category deletions pushed to cloud: ${successCount}`);
}

async function syncDeletedSubcategoriesToCloud() {
  const deleted = await sqliteAll('SELECT id FROM subcategories WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  if (deleted.length === 0) return;
  let successCount = 0;
  for (const d of deleted) {
    const result = await apiRequest('DELETE', `/api/subcategories/${d.id}`).catch(() => ({ status: 500 }));
    if (result.status === 200 || result.status === 404) {
      await sqliteRun('UPDATE subcategories SET deleted_synced=1 WHERE id=?', [d.id]).catch(() => {});
      successCount++;
    }
  }
  if (successCount > 0) log(`  ↳ subcategory deletions pushed to cloud: ${successCount}`);
}

async function syncDeletedVariantAttrTypesToCloud() {
  const deleted = await sqliteAll('SELECT id FROM variant_attribute_types WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  if (deleted.length === 0) return;
  let successCount = 0;
  for (const d of deleted) {
    const result = await apiRequest('DELETE', `/api/variant-attribute-types/${d.id}`).catch(() => ({ status: 500 }));
    if (result.status === 200 || result.status === 404) {
      await sqliteRun('UPDATE variant_attribute_types SET deleted_synced=1 WHERE id=?', [d.id]).catch(() => {});
      successCount++;
    }
  }
  if (successCount > 0) log(`  ↳ variant_attribute_type deletions pushed to cloud: ${successCount}`);
}

async function syncDeletedProductTypeCodesToCloud() {
  const deleted = await sqliteAll('SELECT id FROM product_type_codes WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  if (deleted.length === 0) return;
  let successCount = 0;
  for (const d of deleted) {
    const result = await apiRequest('DELETE', `/api/product-type-codes/${d.id}`).catch(() => ({ status: 500 }));
    if (result.status === 200 || result.status === 404) {
      await sqliteRun('UPDATE product_type_codes SET deleted_synced=1 WHERE id=?', [d.id]).catch(() => {});
      successCount++;
    }
  }
  if (successCount > 0) log(`  ↳ product_type_code deletions pushed to cloud: ${successCount}`);
}

async function syncInboundToCloud() {
  // שלח מחיקות מקומיות לענן
  await sqliteRun('CREATE TABLE IF NOT EXISTS deleted_inbound (id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});
  const deletedInbound = await sqliteAll('SELECT id FROM deleted_inbound').catch(() => []);
  for (const d of deletedInbound) {
    await apiRequest('DELETE', `/api/inbound/${d.id}`).catch(() => {});
    // אחרי מחיקת inbound מהענן — הענן מעדכן כמות עם NOW()
    // נעדכן quantity_updated_at מקומית ל-NOW()+1sec כדי שה-timestamp המקומי ינצח
    const affectedItems = await sqliteAll('SELECT product_id FROM inbound_items WHERE transaction_id=?', [d.id]).catch(() => []);
    for (const item of affectedItems) {
      await sqliteRun(
        "UPDATE products SET quantity_updated_at = datetime('now', '+3 seconds') WHERE id=?",
        [item.product_id]
      ).catch(() => {});
    }
  }
  if (deletedInbound.length > 0) {
    await sqliteRun('DELETE FROM deleted_inbound').catch(() => {});
    log(`  ↳ inbound deletions pushed to cloud: ${deletedInbound.length}`);
  }
  const transactions = await sqliteAll('SELECT it.*, u.username FROM inbound_transactions it LEFT JOIN users u ON it.user_id = u.id ORDER BY it.id');
  const items = await sqliteAll('SELECT * FROM inbound_items ORDER BY id');
  const localIds = transactions.map(t => t.id);
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
    // אחרי מחיקת outbound מהענן — הענן מעדכן כמות עם NOW()
    // נעדכן quantity_updated_at מקומית ל-NOW()+1sec כדי שה-timestamp המקומי ינצח
    const affectedItems = await sqliteAll('SELECT product_id FROM outbound_items WHERE transaction_id=?', [d.id]).catch(() => []);
    for (const item of affectedItems) {
      await sqliteRun(
        "UPDATE products SET quantity_updated_at = datetime('now', '+3 seconds') WHERE id=?",
        [item.product_id]
      ).catch(() => {});
    }
  }
  if (deletedOutbound.length > 0) {
    await sqliteRun('DELETE FROM deleted_outbound').catch(() => {});
    log(`  ↳ outbound deletions pushed to cloud: ${deletedOutbound.length}`);
  }
  const transactions = await sqliteAll('SELECT ot.*, u.username FROM outbound_transactions ot LEFT JOIN users u ON ot.user_id = u.id ORDER BY ot.id');
  const items = await sqliteAll('SELECT * FROM outbound_items ORDER BY id');
  const localIds = transactions.map(t => t.id);
  const result = await apiRequest('POST', '/api/sync/outbound', { transactions, items, localIds });
  if (result.status === 200) log(`  ↳ outbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ outbound: ${JSON.stringify(result.body)}`);
}

async function syncSupportToCloud() {
  const lastSyncSupport = await getLastSyncAt('support');
  const tickets  = await sqliteAll(
    lastSyncSupport
      ? `SELECT t.*, u1.username as owner_name_resolved, u2.username as created_by_name
         FROM support_tickets t
         LEFT JOIN users u1 ON t.owner_id = u1.id
         LEFT JOIN users u2 ON t.created_by = u2.id
         WHERE datetime(t.updated_at) >= datetime(?) ORDER BY t.id`
      : `SELECT t.*, u1.username as owner_name_resolved, u2.username as created_by_name
         FROM support_tickets t
         LEFT JOIN users u1 ON t.owner_id = u1.id
         LEFT JOIN users u2 ON t.created_by = u2.id
         ORDER BY t.id`,
    lastSyncSupport ? [lastSyncSupport] : []
  );
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
  if (tickets.length === 0 && deletedIds.length === 0) {
    log(`  ↳ support: no changes since last sync — skipped`);
    return;
  }
  const result = await apiRequest('POST', '/api/sync/support', {
    tickets,
    history,
    deletedIds: deletedIds.map(r => r.ticket_id)
  });
  if (result.status === 200) {
    // נקה את טבלת המחיקות המקומית לאחר סינק מוצלח
    await sqliteRun('DELETE FROM deleted_support_tickets').catch(() => {});
    log(`  ↳ support: ${tickets.length} tickets synced`);
    await setLastSyncAt('support', new Date().toISOString());
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

  // migration
  await sqliteRun('ALTER TABLE products ADD COLUMN subcategory_id INTEGER').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN name_he TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN name_pt TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN quantity_updated_at TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN meta_updated_at TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN supplier_id INTEGER').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN manufacturer_id INTEGER').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN is_parent INTEGER DEFAULT 0').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN variant_attrs TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE products ADD COLUMN parent_id INTEGER').catch(() => {});

  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;

  // טען רשימת מוצרים שנמחקו מקומית — לא להחזירם
  await sqliteRun('CREATE TABLE IF NOT EXISTS deleted_products (id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});
  const locallyDeleted = await sqliteAll('SELECT id FROM deleted_products').catch(() => []);
  const deletedIds = new Set(locallyDeleted.map(r => r.id));

  let count = 0;
  for (const p of products) {
    // דלג על מוצרים שנמחקו מקומית
    if (deletedIds.has(p.id)) continue;
    const existing = await sqliteGet(
      'SELECT quantity, quantity_updated_at, meta_updated_at, subcategory_id, supplier_id, manufacturer_id, name_he, name_pt FROM products WHERE id=?', [p.id]
    ).catch(() => null);

    // לוגיקת כמות — מי עדכן אחרון
    const cloudQtyTs = normalizeTs(p.quantity_updated_at);
    const localQtyTs = normalizeTs(existing?.quantity_updated_at);
    const useCloudQty = !existing || cloudQtyTs > localQtyTs;
    const finalQty   = useCloudQty ? (p.quantity || 0) : existing.quantity;
    const finalQtyTs = useCloudQty ? (p.quantity_updated_at || null) : existing.quantity_updated_at;

    // לוגיקת meta (SKU/name/unit/category) — מי עדכן אחרון
    const cloudMetaTs = normalizeTs(p.meta_updated_at);
    const localMetaTs = normalizeTs(existing?.meta_updated_at);
    const useCloudMeta = !existing || cloudMetaTs > localMetaTs;

    if (!existing) {
      await sqliteRun(`
        INSERT OR IGNORE INTO products
          (id, sku, name, name_he, name_pt, description, category_id, subcategory_id,
           price, currency, unit, quantity, min_quantity, quantity_updated_at, meta_updated_at,
           supplier_id, manufacturer_id, is_parent, variant_attrs, parent_id, is_active, product_type_code)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.sku, p.name, p.name_he||null, p.name_pt||null, p.description||null,
         p.category_id||null, p.subcategory_id||null,
         p.price||null, p.currency||'ILS', p.unit||'unit',
         finalQty, p.min_quantity||0, finalQtyTs, p.meta_updated_at||null,
         p.supplier_id||null, p.manufacturer_id||null, p.is_parent ? 1 : 0,
         p.variant_attrs||null, p.parent_id||null, p.is_active != null ? (p.is_active ? 1 : 0) : 1,
         p.product_type_code||null]
      ).catch(() => {});
    } else if (useCloudMeta) {
      await sqliteRun(`
        UPDATE products SET
          sku=?, name=?, name_he=?, name_pt=?, description=?,
          category_id=?, subcategory_id=?, price=?, currency=?, unit=?,
          min_quantity=?, meta_updated_at=?, supplier_id=?, manufacturer_id=?, is_parent=?,
          variant_attrs=?, parent_id=?, is_active=?, product_type_code=?,
          quantity=?, quantity_updated_at=?
        WHERE id=?`,
        [p.sku, p.name,
         p.name_he || existing?.name_he || null,
         p.name_pt || existing?.name_pt || null,
         p.description||null,
         p.category_id||null,
         (p.subcategory_id != null ? p.subcategory_id : (existing?.subcategory_id ?? null)),
         p.price||null, p.currency||'ILS', p.unit||'unit',
         p.min_quantity||0, p.meta_updated_at||null,
         (p.supplier_id != null ? p.supplier_id : (existing?.supplier_id ?? null)),
         (p.manufacturer_id != null ? p.manufacturer_id : (existing?.manufacturer_id ?? null)),
         p.is_parent ? 1 : 0,
         p.variant_attrs||null, p.parent_id||null,
         p.is_active != null ? (p.is_active ? 1 : 0) : 1,
         p.product_type_code||null,
         finalQty, finalQtyTs, p.id]
      ).catch(() => {});
      count++;
    } else if (useCloudQty) {
      // מקומי עדכן meta אחרון — עדכן רק כמות אם השתנתה
      await sqliteRun(
        'UPDATE products SET quantity=?, quantity_updated_at=? WHERE id=?',
        [finalQty, finalQtyTs, p.id]
      ).catch(() => {});
      count++;
    }
    // אם לא useCloudMeta ולא useCloudQty — לא השתנה כלום, דלג
  }
  if (count > 0) log(`  ↳ products from cloud: ${count} updated`);
  else log(`  ↳ products from cloud: no changes`);
}

async function syncCustomersFromCloud() {
  const result = await apiRequest('GET', '/api/customers');
  if (result.status !== 200) { log(`  ⚠ pull customers: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  await sqliteRun('ALTER TABLE customers ADD COLUMN updated_at TEXT').catch(() => {});
  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;
  let count = 0;
  for (const r of rows) {
    const existing = await sqliteGet('SELECT id, updated_at FROM customers WHERE id=?', [r.id]).catch(() => null);
    const cloudTs = normalizeTs(r.updated_at);
    const localTs = normalizeTs(existing?.updated_at);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO customers (id,name,contact_person,address,phone,email,tax_id,country,is_sensitive,notes,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.is_sensitive?1:0,r.notes||null,r.updated_at||null]
      ).catch(() => {});
      count++;
    } else if (cloudTs && cloudTs > localTs) {
      await sqliteRun(
        'UPDATE customers SET name=?,contact_person=?,address=?,phone=?,email=?,tax_id=?,country=?,is_sensitive=?,notes=?,updated_at=? WHERE id=?',
        [r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.is_sensitive?1:0,r.notes||null,r.updated_at||null,r.id]
      ).catch(() => {});
      count++;
    }
  }
  if (count > 0) log(`  ↳ customers from cloud: ${count} updated`);
  else log(`  ↳ customers from cloud: no changes`);
}

async function syncSuppliersFromCloud() {
  const result = await apiRequest('GET', '/api/suppliers');
  if (result.status !== 200) { log(`  ⚠ pull suppliers: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  await sqliteRun('ALTER TABLE suppliers ADD COLUMN updated_at TEXT').catch(() => {});
  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;
  let count = 0;
  for (const r of rows) {
    const existing = await sqliteGet('SELECT id, updated_at FROM suppliers WHERE id=?', [r.id]).catch(() => null);
    const cloudTs = normalizeTs(r.updated_at);
    const localTs = normalizeTs(existing?.updated_at);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO suppliers (id,name,contact_person,address,phone,email,tax_id,country,notes,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.notes||null,r.updated_at||null]
      ).catch(() => {});
      count++;
    } else if (cloudTs && cloudTs > localTs) {
      await sqliteRun(
        'UPDATE suppliers SET name=?,contact_person=?,address=?,phone=?,email=?,tax_id=?,country=?,notes=?,updated_at=? WHERE id=?',
        [r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.notes||null,r.updated_at||null,r.id]
      ).catch(() => {});
      count++;
    }
  }
  if (count > 0) log(`  ↳ suppliers from cloud: ${count} updated`);
  else log(`  ↳ suppliers from cloud: no changes`);
}

async function syncManufacturersFromCloud() {
  const result = await apiRequest('GET', '/api/manufacturers');
  if (result.status !== 200) { log(`  ⚠ pull manufacturers: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  await sqliteRun(`CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT,
    email TEXT, tax_id TEXT, country TEXT, notes TEXT, contact_person TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
  )`).catch(() => {});
  await sqliteRun('ALTER TABLE manufacturers ADD COLUMN updated_at TEXT').catch(() => {});
  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;
  let count = 0;
  for (const r of rows) {
    const existing = await sqliteGet('SELECT id, updated_at FROM manufacturers WHERE id=?', [r.id]).catch(() => null);
    const cloudTs = normalizeTs(r.updated_at);
    const localTs = normalizeTs(existing?.updated_at);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO manufacturers (id,name,contact_person,address,phone,email,tax_id,country,notes,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.notes||null,r.updated_at||null]
      ).catch(() => {});
      count++;
    } else if (cloudTs && cloudTs > localTs) {
      await sqliteRun(
        'UPDATE manufacturers SET name=?,contact_person=?,address=?,phone=?,email=?,tax_id=?,country=?,notes=?,updated_at=? WHERE id=?',
        [r.name,r.contact_person||null,r.address||null,r.phone||null,r.email||null,r.tax_id||null,r.country||null,r.notes||null,r.updated_at||null,r.id]
      ).catch(() => {});
      count++;
    }
  }
  if (count > 0) log(`  ↳ manufacturers from cloud: ${count} updated`);
  else log(`  ↳ manufacturers from cloud: no changes`);
}

async function syncVariantAttrTypesFromCloud() {
  const result = await apiRequest('GET', '/api/variant-attribute-types');
  if (result.status !== 200) { log(`  ⚠ pull variant-attribute-types: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  await sqliteRun(`CREATE TABLE IF NOT EXISTS variant_attribute_types (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_he TEXT, name_pt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});
  const deletedLocalVat = await sqliteAll('SELECT id FROM variant_attribute_types WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  const deletedVatIds = new Set(deletedLocalVat.map(r => r.id));
  let count = 0;
  for (const r of rows) {
    if (deletedVatIds.has(r.id)) continue;
    const existing = await sqliteGet('SELECT id, name, name_he, name_pt FROM variant_attribute_types WHERE id=?', [r.id]).catch(() => null);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO variant_attribute_types (id, name, name_he, name_pt) VALUES (?,?,?,?)',
        [r.id, r.name, r.name_he||null, r.name_pt||null]
      ).catch(() => {});
      count++;
    } else if (existing.name !== r.name || existing.name_he !== (r.name_he||null) || existing.name_pt !== (r.name_pt||null)) {
      await sqliteRun(
        'UPDATE variant_attribute_types SET name=?, name_he=?, name_pt=? WHERE id=?',
        [r.name, r.name_he||null, r.name_pt||null, r.id]
      ).catch(() => {});
      count++;
    }
  }
  // מחק מקומית רשומות שנמחקו בענן (ולא נמחקו מקומית כבר)
  const cloudIds = rows.map(r => r.id);
  const localVatRows = await sqliteAll('SELECT id, created_at FROM variant_attribute_types WHERE is_deleted IS NULL OR is_deleted=0').catch(() => []);
  const lastSyncVat = await getLastSyncAt('variant_attribute_types');
  for (const local of localVatRows) {
    if (!cloudIds.includes(local.id)) {
      if (lastSyncVat && local.created_at && new Date(local.created_at).getTime() > new Date(lastSyncVat).getTime()) {
        continue;
      }
      await sqliteRun(`UPDATE variant_attribute_types SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [local.id]).catch(() => {});
      log(`  ↳ variant_attribute_type #${local.id} marked deleted (removed from cloud)`);
    }
  }
  if (count > 0) log(`  ↳ variant_attribute_types from cloud: ${count} updated`);
  else log(`  ↳ variant_attribute_types from cloud: no changes`);
}

async function syncProductTypeCodesFromCloud() {
  const result = await apiRequest('GET', '/api/product-type-codes');
  if (result.status !== 200) { log(`  ⚠ pull product-type-codes: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  await sqliteRun(`CREATE TABLE IF NOT EXISTS product_type_codes (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    name_he TEXT, name_pt TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});
  const deletedLocalPtc = await sqliteAll('SELECT id FROM product_type_codes WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  const deletedPtcIds = new Set(deletedLocalPtc.map(r => r.id));
  let count = 0;
  for (const r of rows) {
    if (deletedPtcIds.has(r.id)) continue;
    const existing = await sqliteGet('SELECT id, code, name, name_he, name_pt FROM product_type_codes WHERE id=?', [r.id]).catch(() => null);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO product_type_codes (id, code, name, name_he, name_pt) VALUES (?,?,?,?,?)',
        [r.id, r.code, r.name, r.name_he||null, r.name_pt||null]
      ).catch(() => {});
      count++;
    } else if (existing.code !== r.code || existing.name !== r.name || existing.name_he !== (r.name_he||null) || existing.name_pt !== (r.name_pt||null)) {
      await sqliteRun(
        'UPDATE product_type_codes SET code=?, name=?, name_he=?, name_pt=? WHERE id=?',
        [r.code, r.name, r.name_he||null, r.name_pt||null, r.id]
      ).catch(() => {});
      count++;
    }
  }
  // מחק מקומית רשומות שנמחקו בענן (ולא נמחקו מקומית כבר)
  const cloudIds = rows.map(r => r.id);
  const localPtcRows = await sqliteAll('SELECT id, created_at FROM product_type_codes WHERE is_deleted IS NULL OR is_deleted=0').catch(() => []);
  const lastSyncPtc = await getLastSyncAt('product_type_codes');
  for (const local of localPtcRows) {
    if (!cloudIds.includes(local.id)) {
      if (lastSyncPtc && local.created_at && new Date(local.created_at).getTime() > new Date(lastSyncPtc).getTime()) {
        continue;
      }
      await sqliteRun(`UPDATE product_type_codes SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [local.id]).catch(() => {});
      log(`  ↳ product_type_code #${local.id} marked deleted (removed from cloud)`);
    }
  }
  if (count > 0) log(`  ↳ product_type_codes from cloud: ${count} updated`);
  else log(`  ↳ product_type_codes from cloud: no changes`);
}

async function syncCloudToLocal() {
  log('▶ CLOUD → LOCAL sync...');
  try {
    await syncSettingsFromCloud();
    await syncUsersFromCloud();
    await syncQrFromCloud();
    await syncCategoriesFromCloud();
    await syncSubcategoriesFromCloud();
    await syncVariantAttrTypesFromCloud();
    await syncProductTypeCodesFromCloud();
    await syncProductsFromCloud();
    await syncCustomersFromCloud();
    await syncSuppliersFromCloud();
    await syncManufacturersFromCloud();
    await syncInboundFromCloud();
    await syncOutboundFromCloud();
    await syncSupportFromCloud();
    await syncWarehouseAlertsFromCloud();
    await syncNotificationsFromCloud();
    await syncDocumentsFromCloud();
    await syncOutboundSignaturesFromCloud();
    await syncProformaSignaturesFromCloud();
    log('✅ CLOUD → LOCAL complete');
  } catch (err) {
    log(`❌ CLOUD → LOCAL error: ${err.message}`);
  }
}

// ── Categories + Subcategories מהענן ──────────────────────────────────────────
async function syncCategoriesFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/categories');
  if (result.status !== 200) { log(`  ⚠ pull categories: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  // migration
  await sqliteRun('ALTER TABLE categories ADD COLUMN updated_at TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE categories ADD COLUMN code TEXT').catch(() => {});
  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;
  let count = 0;

  // בנה Set של IDs בענן
  const cloudIds = new Set(rows.map(r => r.id));

  // טען קטגוריות שסומנו כמחוקות (is_deleted=1) — לעולם לא להחזיר אותן
  const deletedLocally = await sqliteAll('SELECT id FROM categories WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  const deletedLocalIds = new Set(deletedLocally.map(r => r.id));

  for (const r of rows) {
    // דלג על קטגוריות שנמחקו מקומית
    if (deletedLocalIds.has(r.id)) continue;
    const existing = await sqliteGet('SELECT id, updated_at FROM categories WHERE id=?', [r.id]).catch(() => null);
    const cloudTs = normalizeTs(r.updated_at);
    const localTs = normalizeTs(existing?.updated_at);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO categories (id, name, name_he, name_pt, description, code, updated_at) VALUES (?,?,?,?,?,?,?)',
        [r.id, r.name, r.name_he||null, r.name_pt||null, r.description||null, r.code||null, r.updated_at||null]
      ).catch(() => {});
      count++;
    } else {
      if (r.name_he || r.name_pt) {
        await sqliteRun(
          'UPDATE categories SET name_he=COALESCE(?,name_he), name_pt=COALESCE(?,name_pt) WHERE id=? AND (name_he IS NULL OR name_he=\'\'  OR name_pt IS NULL OR name_pt=\'\')',
          [r.name_he||null, r.name_pt||null, r.id]
        ).catch(() => {});
      }
      if (cloudTs && cloudTs > localTs) {
        await sqliteRun(
          'UPDATE categories SET name=?, name_he=?, name_pt=?, description=?, code=?, updated_at=? WHERE id=?',
          [r.name, r.name_he||null, r.name_pt||null, r.description||null, r.code||null, r.updated_at||null, r.id]
        ).catch(() => {});
        count++;
      }
    }
  }

  // מחק מקומית קטגוריות שכבר לא קיימות בענן
  // אבל לא אם נוצרו מקומית לאחרונה ועדיין לא הספיקו לעלות לענן
  const localRows = await sqliteAll('SELECT id, created_at FROM categories WHERE is_deleted IS NULL OR is_deleted=0').catch(() => []);
  const lastSyncCat = await getLastSyncAt('categories');
  for (const local of localRows) {
    if (!cloudIds.has(local.id) && !deletedLocalIds.has(local.id)) {
      // אם נוצר לאחר הסינק האחרון — עדיין לא הספיק לעלות לענן, לא למחוק
      if (lastSyncCat && local.created_at && new Date(local.created_at).getTime() > new Date(lastSyncCat).getTime()) {
        continue; // מקומי חדש שעוד לא עלה — דלג
      }
      await sqliteRun(`UPDATE subcategories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE category_id=?`, [local.id]).catch(() => {});
      await sqliteRun(`UPDATE categories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [local.id]).catch(() => {});
      log(`  ↳ category #${local.id} marked deleted (removed from cloud)`);
    }
  }

  if (count > 0) log(`  ↳ categories from cloud: ${count} updated`);
  else log(`  ↳ categories from cloud: no changes`);
}

async function syncSubcategoriesFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/subcategories');
  if (result.status !== 200) { log(`  ⚠ pull subcategories: ${JSON.stringify(result.body)}`); return; }
  const rows = result.body || [];
  // ודא שטבלת subcategories קיימת מקומית
  await sqliteRun(`CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_he TEXT,
    name_pt TEXT,
    code TEXT,
    updated_at TEXT
  )`).catch(() => {});
  await sqliteRun('ALTER TABLE subcategories ADD COLUMN updated_at TEXT').catch(() => {});
  await sqliteRun('ALTER TABLE subcategories ADD COLUMN code TEXT').catch(() => {});
  const normalizeTs = (v) => v ? new Date(String(v).replace(' ', 'T')).getTime() : 0;
  let count = 0;

  // בנה Set של IDs בענן
  const cloudIds = new Set(rows.map(r => r.id));

  // טען רשימת סאב-קטגוריות שנמחקו לצמיתות — לעולם לא להחזיר אותן
  const deletedLocalSubs = await sqliteAll('SELECT id FROM subcategories WHERE is_deleted=1 AND (deleted_synced IS NULL OR deleted_synced=0)').catch(() => []);
  const deletedLocalSubIds = new Set(deletedLocalSubs.map(r => r.id));

  for (const r of rows) {
    if (deletedLocalSubIds.has(r.id)) continue;
    const existing = await sqliteGet('SELECT id, updated_at FROM subcategories WHERE id=?', [r.id]).catch(() => null);
    const cloudTs = normalizeTs(r.updated_at);
    const localTs = normalizeTs(existing?.updated_at);
    if (!existing) {
      await sqliteRun(
        'INSERT OR IGNORE INTO subcategories (id, category_id, name, name_he, name_pt, code, updated_at) VALUES (?,?,?,?,?,?,?)',
        [r.id, r.category_id, r.name, r.name_he||null, r.name_pt||null, r.code||null, r.updated_at||null]
      ).catch(() => {});
      count++;
    } else {
      if (r.name_he || r.name_pt) {
        await sqliteRun(
          'UPDATE subcategories SET name_he=COALESCE(?,name_he), name_pt=COALESCE(?,name_pt) WHERE id=? AND (name_he IS NULL OR name_he=\'\'  OR name_pt IS NULL OR name_pt=\'\')',
          [r.name_he||null, r.name_pt||null, r.id]
        ).catch(() => {});
      }
      if (cloudTs && cloudTs > localTs) {
        await sqliteRun(
          'UPDATE subcategories SET category_id=?, name=?, name_he=?, name_pt=?, code=?, updated_at=? WHERE id=?',
          [r.category_id, r.name, r.name_he||null, r.name_pt||null, r.code||null, r.updated_at||null, r.id]
        ).catch(() => {});
        count++;
      }
    }
  }

  // מחק מקומית סאב-קטגוריות שכבר לא קיימות בענן
  const localSubRows = await sqliteAll('SELECT id, created_at FROM subcategories WHERE is_deleted IS NULL OR is_deleted=0').catch(() => []);
  const lastSyncSub = await getLastSyncAt('subcategories');
  for (const local of localSubRows) {
    if (!cloudIds.has(local.id) && !deletedLocalSubIds.has(local.id)) {
      if (lastSyncSub && local.created_at && new Date(local.created_at).getTime() > new Date(lastSyncSub).getTime()) {
        continue;
      }
      await sqliteRun(`UPDATE subcategories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [local.id]).catch(() => {});
      log(`  ↳ subcategory #${local.id} marked deleted (removed from cloud)`);
    }
  }

  if (count > 0) log(`  ↳ subcategories from cloud: ${count} updated`);
  else log(`  ↳ subcategories from cloud: no changes`);
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
        (id, supplier_id, supplier_type, casual_supplier_name, transaction_date, notes, user_id, username, qr_code_id)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [t.id, t.supplier_id||null, t.supplier_type||'registered',
       t.casual_supplier_name||null, t.transaction_date, t.notes||null, t.user_id||null, t.username||null,
       t.qr_code_id||null]
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
  else log(`  ↳ inbound from cloud: no changes`);
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
        (id, customer_id, customer_type, casual_customer_name, transaction_date, status, notes, user_id, delivery_note_sent, username, qr_code_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.customer_id||null, t.customer_type||'registered',
       t.casual_customer_name||null, t.transaction_date, t.status||'pending',
       t.notes||null, t.user_id||null, t.delivery_note_sent ? 1 : 0, t.username||null,
       t.qr_code_id||null]
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
  else log(`  ↳ support from cloud: no changes`);
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
        // החזר כמויות למלאי לפני מחיקה
        const inboundItems = await sqliteAll('SELECT product_id, quantity FROM inbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => []);
        for (const item of inboundItems) {
          await sqliteRun("UPDATE products SET quantity = quantity - ?, quantity_updated_at = datetime('now') WHERE id = ?", [item.quantity, item.product_id]).catch(() => {});
        }
        await sqliteRun('DELETE FROM inbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM inbound_transactions WHERE id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM deleted_inbound WHERE id = ?', [d.entity_id]).catch(() => {});
        // מחק קובץ PDF של תעודת קבלה
        try {
          const path = require('path');
          const fs = require('fs');
          const docsDir = path.join(__dirname, 'documents', 'receipt');
          if (fs.existsSync(docsDir)) {
            const files = fs.readdirSync(docsDir).filter(f => f.includes(`_ID${d.entity_id}_`) || f.includes(`_${d.entity_id}_`));
            files.forEach(f => { try { fs.unlinkSync(path.join(docsDir, f)); } catch(e) {} });
          }
        } catch(e) {}
        await sqliteRun('DELETE FROM documents WHERE type=? AND reference_id=?', ['receipt', d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: inbound #${d.entity_id}`);
      } else if (d.entity_type === 'outbound') {
        // החזר כמויות למלאי לפני מחיקה
        const outboundItems = await sqliteAll('SELECT product_id, quantity FROM outbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => []);
        for (const item of outboundItems) {
          await sqliteRun("UPDATE products SET quantity = quantity + ?, quantity_updated_at = datetime('now') WHERE id = ?", [item.quantity, item.product_id]).catch(() => {});
        }
        await sqliteRun('DELETE FROM outbound_items WHERE transaction_id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM outbound_transactions WHERE id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM deleted_outbound WHERE id = ?', [d.entity_id]).catch(() => {});
        // מחק קובץ PDF של תעודת משלוח
        try {
          const path = require('path');
          const fs = require('fs');
          const docsDir = path.join(__dirname, 'documents', 'delivery');
          if (fs.existsSync(docsDir)) {
            const files = fs.readdirSync(docsDir).filter(f => f.includes(`_ID${d.entity_id}_`) || f.includes(`_${d.entity_id}_`));
            files.forEach(f => { try { fs.unlinkSync(path.join(docsDir, f)); } catch(e) {} });
          }
        } catch(e) {}
        await sqliteRun('DELETE FROM documents WHERE type=? AND reference_id=?', ['delivery', d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: outbound #${d.entity_id}`);
      } else if (d.entity_type === 'product') {
        // מחק קודם דגמים (variants) שתלויים באב, ואז את האב עצמו
        await sqliteRun('DELETE FROM products WHERE parent_id = ?', [d.entity_id]).catch(() => {});
        await sqliteRun('DELETE FROM products WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: product #${d.entity_id}`);
      } else if (d.entity_type === 'customer') {
        await sqliteRun('DELETE FROM customers WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: customer #${d.entity_id}`);
      } else if (d.entity_type === 'supplier') {
        await sqliteRun('DELETE FROM suppliers WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: supplier #${d.entity_id}`);
      } else if (d.entity_type === 'manufacturer') {
        await sqliteRun('DELETE FROM manufacturers WHERE id = ?', [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: manufacturer #${d.entity_id}`);
      } else if (d.entity_type === 'category') {
        await sqliteRun(`UPDATE subcategories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE category_id=?`, [d.entity_id]).catch(() => {});
        await sqliteRun(`UPDATE categories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: category #${d.entity_id}`);
      } else if (d.entity_type === 'subcategory') {
        await sqliteRun(`UPDATE subcategories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: subcategory #${d.entity_id}`);
      } else if (d.entity_type === 'variant_attribute_type') {
        await sqliteRun(`UPDATE variant_attribute_types SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: variant_attribute_type #${d.entity_id}`);
      } else if (d.entity_type === 'product_type_code') {
        await sqliteRun(`UPDATE product_type_codes SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.entity_id]).catch(() => {});
        handled.push(d);
        log(`  ↳ pulled deletion: product_type_code #${d.entity_id}`);
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
  } else if (s.logo_base64) {
    // הענן שומר לוגו כ-base64 — שמור אותו כקובץ מקומית
    try {
      const matches = s.logo_base64.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('svg') ? 'svg' : 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const localUploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(localUploadsDir)) fs.mkdirSync(localUploadsDir, { recursive: true });
        const localPath = path.join(localUploadsDir, `logo_company.${ext}`);
        fs.writeFileSync(localPath, buffer);
        localLogoPath = `/uploads/logo_company.${ext}`;
        log('  ↳ logo from base64 saved locally');
      }
    } catch (e) {
      log('  ⚠ logo base64 save failed: ' + e.message);
    }
  }

  // אם אין לוגו מהענן — שמור את הלוגו המקומי הקיים
  if (!localLogoPath) {
    const existing = await sqliteAll('SELECT logo_path FROM company_settings WHERE id=1').catch(() => []);
    if (existing[0]?.logo_path) {
      localLogoPath = existing[0].logo_path;
    }
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

// ── Outbound Signatures סינק דו-כיווני ───────────────────────────────────────
async function syncOutboundSignaturesToCloud() {
  const rows = await sqliteAll('SELECT * FROM outbound_signatures ORDER BY id').catch(() => []);
  if (!rows.length) return;
  const result = await apiRequest('POST', '/api/sync/outbound-signatures', { rows });
  if (result.status === 200) log('  ↳ outbound-signatures to cloud: ' + rows.length + ' synced');
  else log('  ⚠ outbound-signatures to cloud: ' + JSON.stringify(result.body));
}

async function syncOutboundSignaturesFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/outbound-signatures');
  if (result.status !== 200) { log('  ⚠ pull outbound-signatures: ' + JSON.stringify(result.body)); return; }
  const rows = result.body || [];
  await sqliteRun(`CREATE TABLE IF NOT EXISTS outbound_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    lang TEXT DEFAULT 'he',
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});
  await sqliteRun(`ALTER TABLE outbound_signatures ADD COLUMN lang TEXT DEFAULT 'he'`).catch(() => {});
  // last-write-wins: replace all from cloud (cloud is authority for signatures)
  await sqliteRun('DELETE FROM outbound_signatures').catch(() => {});
  for (const r of rows) {
    await sqliteRun(
      'INSERT OR REPLACE INTO outbound_signatures (id, name, content, lang, is_active, created_at) VALUES (?,?,?,?,?,?)',
      [r.id, r.name, r.content, r.lang || 'he', r.is_active ? 1 : 0, r.created_at || null]
    ).catch(() => {});
  }
  if (rows.length > 0) log('  ↳ outbound-signatures from cloud: ' + rows.length + ' synced');
}

// ── Proforma Signatures סינק דו-כיווני ───────────────────────────────────────
async function syncProformaSignaturesToCloud() {
  const rows = await sqliteAll('SELECT * FROM proforma_signatures ORDER BY id').catch(() => []);
  if (!rows.length) return;
  const result = await apiRequest('POST', '/api/sync/proforma-signatures', { rows });
  if (result.status === 200) log('  ↳ proforma-signatures to cloud: ' + rows.length + ' synced');
  else log('  ⚠ proforma-signatures to cloud: ' + JSON.stringify(result.body));
}

async function syncProformaSignaturesFromCloud() {
  const result = await apiRequest('GET', '/api/sync/pull/proforma-signatures');
  if (result.status !== 200) { log('  ⚠ pull proforma-signatures: ' + JSON.stringify(result.body)); return; }
  const rows = result.body || [];
  await sqliteRun(`CREATE TABLE IF NOT EXISTS proforma_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    lang TEXT DEFAULT 'he',
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});
  await sqliteRun(`ALTER TABLE proforma_signatures ADD COLUMN lang TEXT DEFAULT 'he'`).catch(() => {});
  await sqliteRun('DELETE FROM proforma_signatures').catch(() => {});
  for (const r of rows) {
    await sqliteRun(
      'INSERT OR REPLACE INTO proforma_signatures (id, name, content, lang, is_active, created_at) VALUES (?,?,?,?,?,?)',
      [r.id, r.name, r.content, r.lang || 'he', r.is_active ? 1 : 0, r.created_at || null]
    ).catch(() => {});
  }
  if (rows.length > 0) log('  ↳ proforma-signatures from cloud: ' + rows.length + ' synced');
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
  // שלב 1: משוך מחיקות מהענן תחילה — כך קטגוריות שנמחקו בענן יוסרו מקומית
  //         לפני ששולחים את הנתונים המקומיים חזרה לענן (מניעת "החייאה")
  await pullDeletionsFromCloud();
  // שלב 2: שלח נתונים מקומיים לענן — כולל מחיקות מקומיות.
  //         הענן מוגן: קטגוריות ב-pending_deletions לא יקבלו UPSERT (תוקן ב-server-cloud.js)
  await syncLocalToCloud();
  // שלב 3: משוך נתונים מהענן — קטגוריות שנמחקו כבר הוסרו בשני הכיוונים
  await syncCloudToLocal();
}

const SYNC_VERSION = '5'; // העלה מספר זה בכל פעם שרוצים לאפס את sync_state

async function main() {
  log('🚀 WorldSecure Sync Service v4 starting...');
  log(`   SQLite: ${SQLITE_PATH}`);
  log(`   Cloud:  ${CLOUD_API_URL}`);

  if (!CLOUD_SYNC_TOKEN) {
    log('❌ CLOUD_SYNC_TOKEN is missing in .env!');
    process.exit(1);
  }

  // אם גרסת הסינק השתנתה — אפס את sync_state כדי לשלוח הכל מחדש
  await sqliteRun('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT)').catch(() => {});
  const versionRow = await sqliteGet('SELECT value FROM sync_meta WHERE key=?', ['sync_version']).catch(() => null);
  if (!versionRow || versionRow.value !== SYNC_VERSION) {
    await sqliteRun('DELETE FROM sync_state').catch(() => {});
    await sqliteRun('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?,?)', ['sync_version', SYNC_VERSION]).catch(() => {});
    log(`🔄 sync_state reset — full sync will run (version ${SYNC_VERSION})`);
  }

  // migration: סמן רשומות ב-deleted_* הישנות כ-is_deleted=1
  const oldDelCats = await sqliteAll('SELECT id FROM deleted_categories').catch(() => []);
  for (const d of oldDelCats) {
    await sqliteRun(`UPDATE categories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.id]).catch(() => {});
  }
  const oldDelSubs = await sqliteAll('SELECT id FROM deleted_subcategories').catch(() => []);
  for (const d of oldDelSubs) {
    await sqliteRun(`UPDATE subcategories SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.id]).catch(() => {});
  }
  const oldDelVat = await sqliteAll('SELECT id FROM deleted_variant_attribute_types').catch(() => []);
  for (const d of oldDelVat) {
    await sqliteRun(`UPDATE variant_attribute_types SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.id]).catch(() => {});
  }
  const oldDelPtc = await sqliteAll('SELECT id FROM deleted_product_type_codes').catch(() => []);
  for (const d of oldDelPtc) {
    await sqliteRun(`UPDATE product_type_codes SET is_deleted=1, deleted_synced=1, updated_at=datetime('now') WHERE id=?`, [d.id]).catch(() => {});
  }
  await sqliteRun('ALTER TABLE categories ADD COLUMN deleted_synced INTEGER DEFAULT 0').catch(() => {});
  await sqliteRun('ALTER TABLE subcategories ADD COLUMN deleted_synced INTEGER DEFAULT 0').catch(() => {});
  await sqliteRun('ALTER TABLE variant_attribute_types ADD COLUMN deleted_synced INTEGER DEFAULT 0').catch(() => {});
  await sqliteRun('ALTER TABLE product_type_codes ADD COLUMN deleted_synced INTEGER DEFAULT 0').catch(() => {});
  log('✅ is_deleted migration complete');

  await syncAll();
  setInterval(syncAll, SYNC_INTERVAL_MS);

  log(`⏱  Scheduled: full sync every ${SYNC_INTERVAL_MS/60000} min`);
  log('   (keeping process alive...)');

  // ── זיהוי חזרת אינטרנט → סינק מיידי ─────────────────────────────────────
  let wasOffline = false;
  const CHECK_INTERVAL_MS = 15 * 1000; // בדוק כל 15 שניות

  setInterval(async () => {
    try {
      await apiRequest('GET', '/api/ping').catch(() => { throw new Error('offline'); });
      if (wasOffline) {
        log('🌐 Internet restored — running immediate sync...');
        wasOffline = false;
        await syncAll();
        log('✅ Post-reconnect sync complete');
      }
    } catch (e) {
      if (!wasOffline) {
        log('📴 Internet lost — sync paused until reconnection');
        wasOffline = true;
      }
    }
  }, CHECK_INTERVAL_MS);
}

main().catch(err => {
  log(`💥 Fatal: ${err.message}`);
  process.exit(1);
});
