/**
 * sync-to-cloud.js  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL → CLOUD (כל 5 דקות):
 *   - company_settings
 *   - customers / products / suppliers
 *   - inbound_transactions + inbound_items
 *   - outbound_transactions + outbound_items
 *
 * CLOUD → LOCAL (מיד + כל שעה):
 *   - תעודות משלוח/קבלה PDF
 *   - support_tickets + history
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
  delivery: 'C:\\Users\\amit\\crm-project\\backend\\documents\\delivery',
  receipt:  'C:\\Users\\amit\\crm-project\\backend\\documents\\receipt',
};

const SYNC_INTERVAL_MS     = 5  * 60 * 1000;  // 5 דקות
const DOC_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // שעה

// ── SQLite ────────────────────────────────────────────────────────────────────
const sqlite    = new sqlite3.Database(SQLITE_PATH);
const sqliteAll = (sql, params = []) =>
  new Promise((res, rej) =>
    sqlite.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
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
  log('▶ Starting local → cloud sync...');
  try {
    await syncSettings();
    await syncEntity('customers', 'SELECT * FROM customers');
    await syncEntity('products',  'SELECT * FROM products');
    await syncEntity('suppliers', 'SELECT * FROM suppliers');
    await syncInbound();
    await syncOutbound();
    log('✅ local → cloud sync complete');
  } catch (err) {
    log(`❌ local → cloud sync error: ${err.message}`);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function syncSettings() {
  const rows = await sqliteAll('SELECT * FROM company_settings WHERE id=1');
  if (rows.length === 0) return;
  const result = await apiRequest('POST', '/api/sync/settings', { row: rows[0] });
  if (result.status === 200) log('  ↳ settings: synced');
  else log(`  ⚠ settings: ${JSON.stringify(result.body)}`);
}

// ── Generic entity sync ───────────────────────────────────────────────────────
async function syncEntity(entityName, sql) {
  const rows = await sqliteAll(sql);
  const result = await apiRequest('POST', `/api/sync/${entityName}`, { rows });
  if (result.status === 200) log(`  ↳ ${entityName}: ${rows.length} synced`);
  else log(`  ⚠ ${entityName}: status ${result.status} – ${JSON.stringify(result.body)}`);
}

// ── Inbound ───────────────────────────────────────────────────────────────────
async function syncInbound() {
  const transactions = await sqliteAll('SELECT * FROM inbound_transactions ORDER BY id');
  const items        = await sqliteAll('SELECT * FROM inbound_items ORDER BY transaction_id');

  const result = await apiRequest('POST', '/api/sync/inbound', { transactions, items });
  if (result.status === 200) log(`  ↳ inbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ inbound: ${JSON.stringify(result.body)}`);
}

// ── Outbound ──────────────────────────────────────────────────────────────────
async function syncOutbound() {
  const transactions = await sqliteAll('SELECT * FROM outbound_transactions ORDER BY id');
  const items        = await sqliteAll('SELECT * FROM outbound_items ORDER BY transaction_id');

  const result = await apiRequest('POST', '/api/sync/outbound', { transactions, items });
  if (result.status === 200) log(`  ↳ outbound: ${transactions.length} transactions synced`);
  else log(`  ⚠ outbound: ${JSON.stringify(result.body)}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  2. CLOUD → LOCAL (מסמכים + support tickets)
// ════════════════════════════════════════════════════════════════════════════

async function syncDocumentsToLocal() {
  log('▶ Starting cloud → local sync...');

  for (const dir of Object.values(LOCAL_DOCS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`  Created: ${dir}`);
    }
  }

  // תעודות PDF
  for (const docType of ['delivery', 'receipt']) {
    try {
      const result = await apiRequest('GET', `/api/documents/list/${docType}`);
      if (result.status !== 200 || !Array.isArray(result.body)) {
        log(`  ⚠ ${docType}: could not get list`);
        continue;
      }

      const cloudDocs     = result.body;
      const localDir      = LOCAL_DOCS[docType];
      const existingFiles = fs.existsSync(localDir) ? fs.readdirSync(localDir) : [];
      let downloaded = 0;

      for (const doc of cloudDocs) {
        if (existingFiles.includes(doc.filename)) continue;
        const localPath = path.join(localDir, doc.filename);
        try {
          await downloadFile(doc.url, localPath);
          await apiRequest('PUT', `/api/documents/mark-synced/${doc.id}`);
          downloaded++;
          log(`  ↳ Downloaded: ${doc.filename}`);
        } catch (err) {
          log(`  ⚠ Failed to download ${doc.filename}: ${err.message}`);
        }
      }
      log(`  ↳ ${docType}: ${downloaded} new documents downloaded`);
    } catch (err) {
      log(`  ❌ ${docType} sync error: ${err.message}`);
    }
  }

  log('✅ cloud → local sync complete');
}

// ════════════════════════════════════════════════════════════════════════════
//  הפעלה
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  log('🚀 WorldSecure Sync Service v3 starting...');
  log(`   SQLite: ${SQLITE_PATH}`);
  log(`   Cloud:  ${CLOUD_API_URL}`);

  if (!CLOUD_SYNC_TOKEN) {
    log('❌ CLOUD_SYNC_TOKEN is missing in .env!');
    process.exit(1);
  }

  // הרץ מיד
  await syncLocalToCloud();
  await syncDocumentsToLocal();

  // תזמון
  setInterval(syncLocalToCloud,     SYNC_INTERVAL_MS);
  setInterval(syncDocumentsToLocal, DOC_SYNC_INTERVAL_MS);

  log(`⏱  Scheduled: local→cloud every ${SYNC_INTERVAL_MS/60000} min, docs every ${DOC_SYNC_INTERVAL_MS/60000} min`);
  log('   (keeping process alive...)');
}

main().catch(err => {
  log(`💥 Fatal error: ${err.message || err}`);
  console.error(err);
  process.exit(1);
});
