import React, { useState, useCallback, useEffect } from 'react';

function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.innerWidth < breakpoint; } catch { return false; }
  });
  const handler = useCallback(() => setIsMobile(window.innerWidth < breakpoint), [breakpoint]);
  useEffect(() => {
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [handler]);
  return isMobile;
}

// ─── Responsive Table ─────────────────────────────────────────────────────────
function ResponsiveTable({ headers, rows, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rows.map((row, j) => (
          <div key={j} style={{
            border: '1px solid #BBBBBB', borderRadius: '8px', overflow: 'hidden',
            background: j % 2 === 0 ? '#fff' : '#F7F7F7',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {headers.map((header, k) => (
              <div key={k} style={{
                display: 'flex',
                borderBottom: k < headers.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div style={{
                  background: '#D5E8F0', color: '#1B3A6B', fontWeight: 700,
                  fontSize: '0.78rem', padding: '0.45rem 0.7rem', width: '38%',
                  flexShrink: 0, borderRight: '1px solid #BBBBBB', lineHeight: 1.35,
                  display: 'flex', alignItems: 'center',
                }}>
                  {header}
                </div>
                <div style={{ padding: '0.45rem 0.7rem', fontSize: '0.85rem', color: '#444', flex: 1, lineHeight: 1.4 }}>
                  {row[k]}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.9rem' }}>
      <thead>
        <tr>{headers.map((h, j) => (
          <th key={j} style={{ background: '#D5E8F0', color: '#1B3A6B', fontWeight: 700, padding: '0.6rem 0.8rem', textAlign: 'left', border: '1px solid #BBBBBB' }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((row, j) => (
          <tr key={j}>{row.map((cell, k) => (
            <td key={k} style={{ padding: '0.6rem 0.8rem', border: '1px solid #BBBBBB', background: j % 2 === 1 ? '#F7F7F7' : '#fff', color: '#555', verticalAlign: 'top' }}>{cell}</td>
          ))}</tr>
        ))}
      </tbody>
    </table>
  );
}

const sections = [
  // ── PART I: IT / System Reference ──────────────────────────────────────────
  {
    title: '1. System Overview',
    content: 'WorldSecure CRM is a custom-built Customer Relationship & Warehouse Management System (CRM/WMS). The system operates in a hybrid model: a local machine (offline-capable) synchronized with a cloud environment at app.world-secure.com.',
    subsections: [
      {
        title: '1.1 Architecture',
        content: 'The system has three layers: Frontend (React, installable as PWA), Backend (Node.js/Express), and Database (SQLite locally; PostgreSQL on Supabase in the cloud).',
        table: {
          headers: ['Aspect', 'Local Machine', 'Cloud'],
          rows: [
            ['URL', 'http://localhost:3000', 'https://app.world-secure.com'],
            ['Frontend', 'React Dev Server (port 3000)', 'Render Static Site'],
            ['Backend', 'server.js (port 3001)', 'server-cloud.js on Render'],
            ['Database', 'SQLite — warehouse.db', 'PostgreSQL on Supabase'],
            ['Offline capable', 'Yes — fully functional', 'No — requires internet'],
            ['Users', 'Amit (Admin)', 'Amit, Silvio, Duli'],
          ]
        }
      },
      {
        title: '1.2 Sync Engine',
        content: 'Synchronization runs automatically every 5 minutes via sync-to-cloud.js using Last-Write-Wins (based on updated_at timestamp). Local change → pushed to cloud. Cloud change → pulled to local. The record with the latest timestamp wins.',
        table: {
          headers: ['Sync Direction', 'Entities', 'Trigger'],
          rows: [
            ['LOCAL → CLOUD', 'users, qr-codes, categories, subcategories, customers, products, suppliers, manufacturers, signatures, transactions, support, notifications', 'updated_at timestamp newer than last sync'],
            ['CLOUD → LOCAL', 'settings, logo, users, qr-codes, products, transactions, support, signatures', 'updated_at timestamp newer than last sync'],
            ['Deletions', 'All entities — tracked in deleted_entities table', 'Record added to deleted_entities → propagated in next sync cycle'],
          ]
        }
      },
      {
        title: '1.3 System Connectivity Diagram',
        content: 'How all components connect:',
        table: {
          headers: ['From', '→', 'To', 'Protocol / Method'],
          rows: [
            ['Browser / PWA (mobile)', '→', 'app.world-secure.com', 'HTTPS'],
            ['app.world-secure.com (Cloudflare DNS)', '→', 'Render Frontend (Static Site)', 'CNAME → worldsecure-frontend.onrender.com'],
            ['Render Frontend', '→', 'Render Backend (/api/*)', 'HTTPS REST API'],
            ['Render Backend', '→', 'Supabase PostgreSQL', 'PostgreSQL over SSL (DATABASE_URL)'],
            ['Render Backend', '→', 'Brevo', 'HTTPS REST API (BREVO_API_KEY)'],
            ['Render Backend', '→', 'PDFShift', 'HTTPS REST API (PDFSHIFT_API_KEY)'],
            ['Local Frontend (port 3000)', '→', 'Local Backend (port 3001)', 'HTTP via setupProxy.js'],
            ['Local Backend', '→', 'SQLite warehouse.db', 'Direct file access'],
            ['sync-to-cloud.js (local)', '→', 'Render Backend (/api/sync/*)', 'HTTPS REST — every 5 minutes'],
            ['GitHub push (vercel-fix)', '→', 'Render auto-deploy', 'GitHub Webhook → Render build'],
            ['cron-job.org', '→', 'Render Backend (/api/ping)', 'HTTPS GET — every 5 minutes'],
          ]
        }
      }
    ]
  },
    {
    title: '2. External Services & Configuration',
    content: 'The system depends on 6 external services. This section is a full step-by-step configuration reference — where to log in, where to find each setting, and exactly what to enter.',
    subsections: [
      {
        title: '2.1 Services Overview',
        table: {
          headers: ['Service', 'Login URL', 'Role in system'],
          rows: [
            ['Render', 'dashboard.render.com', 'Hosts the Frontend (React app) and Backend (Node.js API)'],
            ['Supabase', 'app.supabase.com', 'Cloud PostgreSQL database — stores all data'],
            ['GitHub', 'github.com', 'Source code storage + triggers auto-deploy on Render on every push'],
            ['Brevo', 'app.brevo.com', 'Sends all outbound emails from the system'],
            ['PDFShift', 'pdfshift.io/dashboard', 'Generates PDF documents (delivery notes, invoices)'],
            ['cron-job.org', 'console.cron-job.org', 'Sends a ping every 5 min to keep Render awake'],
          ]
        }
      },

      {
        title: '2.2 Render — Full Configuration Guide',
        content: 'Render hosts the entire cloud system. There are two services: worldsecure-frontend (Static Site) and worldsecure-backend (Web Service).',
        steps: [
          { step: 'Login', title: 'Open dashboard.render.com', desc: 'Sign in with your Render account. You will see a list of your services on the Dashboard.' },
        ]
      },
      {
        title: '2.2.1 How to Create the Frontend Static Site',
        content: 'Do this only when setting up from scratch. If the service already exists, skip to 2.2.3.',
        steps: [
          { step: 'Step 1', title: 'Click "New +"', desc: 'Top-right button on the Render Dashboard → select "Static Site" from the dropdown' },
          { step: 'Step 2', title: 'Connect GitHub', desc: 'Click "Connect account" → authorize Render to access your GitHub → select the repository: crm-project' },
          { step: 'Step 3', title: 'Fill in the settings:', desc: 'Name: worldsecure-frontend | Branch: vercel-fix | Root Directory: frontend | Build Command: npm run build | Publish Directory: frontend/build' },
          { step: 'Step 4', title: 'Click "Create Static Site"', desc: 'Render will run the first build. Watch the Logs tab — build takes ~2-3 minutes.' },
          { step: 'Step 5', title: 'Add Custom Domain', desc: 'After build succeeds: Settings tab → Custom Domains → Add: app.world-secure.com → follow Render\'s DNS instructions' },
        ]
      },
      {
        title: '2.2.2 How to Create the Backend Web Service',
        content: 'Do this only when setting up from scratch. If the service already exists, skip to 2.2.3.',
        steps: [
          { step: 'Step 1', title: 'Click "New +"', desc: 'Render Dashboard → select "Web Service"' },
          { step: 'Step 2', title: 'Select repository: crm-project' },
          { step: 'Step 3', title: 'Fill in the settings:', desc: 'Name: worldsecure-backend | Branch: vercel-fix | Root Directory: backend-cloud | Build Command: npm install | Start Command: node server-cloud.js' },
          { step: 'Step 4', title: 'Select Instance Type: Free', desc: 'Scroll down to "Instance Type" → select "Free". Note: free tier sleeps after 15 min inactivity — cron-job.org prevents this.' },
          { step: 'Step 5', title: 'Add Environment Variables', desc: 'Before clicking Create — scroll to "Environment Variables" and add all 5 variables from section 2.2.3 below' },
          { step: 'Step 6', title: 'Click "Create Web Service"' },
        ]
      },
      {
        title: '2.2.3 Environment Variables — Where to Set Them',
        content: 'Path: dashboard.render.com → click "worldsecure-backend" → left sidebar → "Environment" → "Environment Variables" → click "Add Environment Variable" for each:',
        table: {
          headers: ['Variable Name', 'Where to get the value', 'What to enter'],
          rows: [
            ['DATABASE_URL', 'app.supabase.com → click your project → left sidebar → Settings (⚙️) → Database → scroll to "Connection String" → select "URI" tab → click Copy', 'Paste the full URI string. Format: postgresql://postgres:[password]@[host]:5432/postgres'],
            ['BREVO_API_KEY', 'app.brevo.com → click your profile icon (top-right) → SMTP & API → API Keys tab → copy the key (or click "Create a new API key")', 'Paste the key. Format: xkeysib-...'],
            ['PDFSHIFT_API_KEY', 'pdfshift.io → login → Dashboard → top of page shows "Your API Key" → click Copy', 'Paste the key'],
            ['JWT_SECRET', 'Generate yourself — any random string of 32+ characters. Example: use a password generator.', 'IMPORTANT: once set, never change this value — it will log out all users'],
            ['NODE_ENV', 'Type manually', 'production (lowercase exactly)'],
          ]
        },
        warning: 'After adding or changing any environment variable: Render automatically redeploys the backend. Watch the Logs tab and verify: "Server running on port..." appears — this means the backend started successfully.'
      },
      {
        title: '2.2.4 How to View Logs on Render',
        steps: [
          { step: 'Step 1', title: 'Open dashboard.render.com → click the service name (e.g. worldsecure-backend)' },
          { step: 'Step 2', title: 'Click "Logs" in the left sidebar', desc: 'Shows real-time output from server-cloud.js — errors, startup messages, API calls' },
          { step: 'Step 3', title: 'Look for these key messages:', desc: '"Server running on port 10000" = backend started OK | "Database connected" = Supabase connection OK | Any red text = error to investigate' },
        ]
      },
      {
        title: '2.2.5 How to Manually Deploy or Restart',
        steps: [
          { step: 'Manual Deploy', title: 'dashboard.render.com → click service → top-right "Manual Deploy" button → "Deploy latest commit"', desc: 'Use this if a push to GitHub did not trigger auto-deploy' },
          { step: 'Restart', title: 'dashboard.render.com → click service → top-right 3-dot menu (⋮) → "Restart service"', desc: 'Use this after fixing a database sequence issue — restart runs fixSequences() automatically on startup' },
        ]
      },

      {
        title: '2.3 GitHub — Full Configuration Guide',
        content: 'GitHub stores all the source code. Every push to the vercel-fix branch automatically triggers a new deploy on Render.',
        steps: [
          { step: 'Login', title: 'Open github.com', desc: 'Sign in with your GitHub account. The repository is: crm-project (private).' },
        ]
      },
      {
        title: '2.3.1 Daily Git Workflow — Step by Step',
        content: 'Open PowerShell or Command Prompt on the local machine:',
        steps: [
          { step: 'Step 1', title: 'Navigate to project folder', desc: 'Type: cd C:\\Users\\amit\\crm-project → press Enter' },
          { step: 'Step 2', title: 'Check what changed', desc: 'Type: git status → press Enter. Shows files in red (changed but not staged) and green (staged and ready to commit)' },
          { step: 'Step 3', title: 'Stage the files you want to deploy', desc: 'For specific files: git add frontend/src/pages/Products.js — For ALL changed files: git add .' },
          { step: 'Step 4', title: 'Write a commit message', desc: 'Type: git commit -m "fix: description of what you changed" → press Enter. Prefix rules: fix: = bug fix, feat: = new feature, chore: = maintenance' },
          { step: 'Step 5', title: 'Push to GitHub', desc: 'Type: git push origin vercel-fix → press Enter. GitHub receives the code → sends webhook to Render → Render starts auto-deploy' },
          { step: 'Step 6', title: 'Verify deploy on Render', desc: 'Open dashboard.render.com → click the service → Logs tab → wait for "Build successful" and "Your service is live"' },
        ],
        warning: 'ALWAYS push to vercel-fix — never to main. The main branch is not connected to any deployment.'
      },
      {
        title: '2.3.2 Useful Git Commands',
        table: {
          headers: ['Command', 'When to use it', 'What it does'],
          rows: [
            ['git status', 'Before staging files', 'Shows which files changed since last commit'],
            ['git log --oneline -10', 'To review history', 'Shows last 10 commits — useful to verify a push went through'],
            ['git diff frontend/src/pages/Products.js', 'Before committing', 'Shows exact line-by-line changes in a specific file'],
            ['git checkout -- frontend/src/pages/Products.js', 'To undo changes', 'Discards ALL unsaved changes to a file — CANNOT be undone'],
            ['git pull origin vercel-fix', 'If someone else made changes', 'Downloads latest code from GitHub to local machine'],
            ['git commit --allow-empty -m "trigger redeploy"', 'To force a redeploy', 'Creates an empty commit — triggers Render deploy without any code change'],
          ]
        }
      },
      {
        title: '2.3.3 How to Re-Connect Render to GitHub (if needed)',
        content: 'The connection is already configured. Only follow these steps if setting up a new Render account or new repository:',
        steps: [
          { step: 'Step 1', title: 'dashboard.render.com → New + → Web Service (or Static Site)' },
          { step: 'Step 2', title: 'Click "Connect GitHub"', desc: 'Authorize Render to access your GitHub account → select repository: crm-project' },
          { step: 'Step 3', title: 'Set Branch to: vercel-fix', desc: 'This is critical — do not use main' },
          { step: 'Step 4', title: 'Fill in Root Directory, Build Command, Start Command', desc: 'As per sections 2.2.1 and 2.2.2 above' },
          { step: 'Step 5', title: 'Add all Environment Variables', desc: 'As per section 2.2.3 above — do this BEFORE clicking Create' },
        ]
      },

      {
        title: '2.4 Supabase — Full Configuration Guide',
        content: 'Supabase is the cloud PostgreSQL database. All cloud data is stored here.',
        steps: [
          { step: 'Login', title: 'Open app.supabase.com', desc: 'Sign in → on the dashboard you will see the project: WorldSecure. Click on it to open.' },
        ]
      },
      {
        title: '2.4.1 How to Find the Database Connection String',
        content: 'The connection string (DATABASE_URL) is needed in Render Environment Variables:',
        steps: [
          { step: 'Step 1', title: 'Open app.supabase.com → click the WorldSecure project' },
          { step: 'Step 2', title: 'Click the ⚙️ Settings icon', desc: 'In the left sidebar, near the bottom → click "Settings"' },
          { step: 'Step 3', title: 'Click "Database"', desc: 'In the Settings submenu on the left' },
          { step: 'Step 4', title: 'Scroll down to "Connection String"', desc: 'You will see tabs: URI | PSQL | JDBC | Dotenv — select "URI"' },
          { step: 'Step 5', title: 'Click the Copy button', desc: 'The string starts with: postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres' },
          { step: 'Step 6', title: 'Paste this value as DATABASE_URL in Render Environment Variables', desc: 'See section 2.2.3 for how to set it in Render' },
        ],
        warning: 'The connection string contains the database password. Never share it or commit it to GitHub.'
      },
      {
        title: '2.4.2 How to View and Query Tables',
        steps: [
          { step: 'Step 1', title: 'app.supabase.com → WorldSecure project → left sidebar → "Table Editor"', desc: 'Shows all tables. Click any table to view its data.' },
          { step: 'Step 2', title: 'For advanced queries: left sidebar → "SQL Editor"', desc: 'Type any SQL and click Run. Examples:' },
          { step: 'Query 1', title: 'View all users:', desc: 'SELECT * FROM users;' },
          { step: 'Query 2', title: 'Reset a sequence after sync error:', desc: "SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));" },
          { step: 'Query 3', title: 'Check all sequences:', desc: "SELECT sequence_name, last_value FROM information_schema.sequences JOIN pg_sequences ON sequencename = sequence_name;" },
        ]
      },
      {
        title: '2.4.3 Supabase — Critical Rules',
        steps: [
          { step: '⚠️', title: 'NEVER enable Row Level Security (RLS)', desc: 'Path: Table Editor → click a table → "RLS disabled" badge — leave it disabled. Enabling RLS without correct policies will block server-cloud.js from reading any data.' },
          { step: '⚠️', title: 'If you get "duplicate key" errors', desc: 'Go to Render → restart the worldsecure-backend service. On startup, fixSequences() runs automatically and resets all sequences to MAX(id).' },
          { step: '✅', title: 'Check database logs for errors', desc: 'app.supabase.com → WorldSecure project → left sidebar → Logs → Postgres. Shows slow queries and SQL errors.' },
          { step: '✅', title: 'Free tier warning', desc: 'Supabase free tier pauses the project after 7 days of no activity. Normal system use prevents this. If the project is paused: app.supabase.com → click the project → click "Restore project".' },
        ]
      },

      {
        title: '2.5 Brevo — Full Configuration Guide',
        content: 'Brevo sends all outbound emails from the system (delivery notes, proforma invoices, support notifications).',
        steps: [
          { step: 'Login', title: 'Open app.brevo.com', desc: 'Sign in with the WorldSecure account.' },
        ]
      },
      {
        title: '2.5.1 How to Find or Create the API Key',
        steps: [
          { step: 'Step 1', title: 'Click your profile icon (top-right corner of app.brevo.com)' },
          { step: 'Step 2', title: 'Click "SMTP & API" in the dropdown menu' },
          { step: 'Step 3', title: 'Click the "API Keys" tab', desc: 'You will see existing API keys. The active key for this system is listed here.' },
          { step: 'Step 4', title: 'To copy an existing key:', desc: 'Click the eye icon (👁) next to the key → copy the value' },
          { step: 'Step 5', title: 'To create a new key:', desc: 'Click "Create a new API key" → enter a name (e.g. "WorldSecure CRM") → click Generate → COPY THE KEY IMMEDIATELY — it is shown only once' },
          { step: 'Step 6', title: 'Paste the key in Render', desc: 'dashboard.render.com → worldsecure-backend → Environment → BREVO_API_KEY → Edit → paste → Save' },
        ]
      },
      {
        title: '2.5.2 How to Verify Domain Authentication (DKIM)',
        content: 'DKIM ensures emails from info@world-secure.com are not marked as spam. Status should always be "Authenticated ✓":',
        steps: [
          { step: 'Step 1', title: 'app.brevo.com → left sidebar → "Senders & IPs"' },
          { step: 'Step 2', title: 'Click the "Domains" tab' },
          { step: 'Step 3', title: 'Check world-secure.com shows: ● Authenticated', desc: 'If it shows "Not authenticated" → the DKIM DNS records in Cloudflare are wrong or set to Proxied. See section 2.5.3.' },
          { step: 'Step 4', title: 'To verify the sender:', desc: 'Click the "Senders" tab → WorldSecure LTD <info@world-secure.com> should show: ● Verified | DKIM: world-secure.com ✓ | DMARC: configured ✓' },
        ]
      },
      {
        title: '2.5.3 DKIM DNS Records in Cloudflare',
        content: 'These 4 records must exist in Cloudflare DNS for world-secure.com and must be DNS only (grey cloud — NOT proxied):',
        table: {
          headers: ['Type', 'Name', 'Content', 'Proxy status'],
          rows: [
            ['CNAME', 'brevo1._domainkey', 'b1.world-secure-com.dkim.brevo.com', '🔘 DNS only (grey)'],
            ['CNAME', 'brevo2._domainkey', 'b2.world-secure-com.dkim.brevo.com', '🔘 DNS only (grey)'],
            ['TXT', '@', 'brevo-code:2190f025e2fe0ebad2f73b58952c908a', '🔘 DNS only (grey)'],
            ['TXT', '_dmarc', 'v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com', '🔘 DNS only (grey)'],
          ]
        },
        warning: 'If brevo1._domainkey or brevo2._domainkey are set to Proxied (orange cloud), DKIM will fail and emails will be rejected or marked as spam. Always keep these DNS only.'
      },
      {
        title: '2.5.4 How to Check Sent Emails',
        steps: [
          { step: 'Step 1', title: 'app.brevo.com → left sidebar → "Transactional"' },
          { step: 'Step 2', title: 'Click "Email Logs"', desc: 'Shows every email sent — with recipient, subject, status (Sent/Delivered/Bounced), and timestamp' },
          { step: 'Step 3', title: 'If an email shows "Bounced":', desc: 'The recipient email address is invalid or their server rejected it. Check the email address in the system.' },
        ]
      },

      {
        title: '2.6 PDFShift — Configuration Guide',
        content: 'PDFShift converts HTML to PDF. Used for: Delivery Notes, Receipt Notes, Proforma Invoices.',
        steps: [
          { step: 'Login', title: 'Open pdfshift.io/dashboard', desc: 'Sign in with the WorldSecure account.' },
          { step: 'API Key', title: 'Find your API key', desc: 'It is displayed at the top of the Dashboard page. Click Copy → paste in Render as PDFSHIFT_API_KEY (see section 2.2.3).' },
          { step: 'Usage', title: 'Monitor usage', desc: 'Dashboard → Usage tab. Free tier allows 50 PDF conversions/month. If limit is reached, PDFs will fail to generate — upgrade the plan or wait until next month.' },
        ]
      },

      {
        title: '2.7 cron-job.org — Configuration Guide',
        content: 'cron-job.org sends a GET request to the Render backend every 5 minutes to prevent it from sleeping (Render free tier sleeps after 15 min inactivity).',
        steps: [
          { step: 'Login', title: 'Open console.cron-job.org', desc: 'Sign in with the WorldSecure account.' },
          { step: 'Step 1', title: 'View the existing job', desc: 'Dashboard shows the job: WorldSecure Keep-Alive. Check that Status is "Enabled" (green).' },
          { step: 'Step 2', title: 'Click the job name to view settings:', desc: 'URL: https://worldsecure-backend.onrender.com/api/ping | Schedule: Every 5 minutes | Method: GET | Expected: 200 OK' },
          { step: 'Step 3', title: 'Check execution history', desc: 'Click "Execution Log" tab — every line should show HTTP 200. If you see errors, the backend may be down.' },
        ],
        tip: 'To create a new keep-alive job (if setting up from scratch): console.cron-job.org → New cronjob → Enter URL → set schedule to: */5 * * * * (every 5 minutes) → Save and Enable.'
      },
    ]
  },
  {
    title: '3. Project File Structure',
    content: 'Project root: C:\\Users\\amit\\crm-project\\',
    table: {
      headers: ['Path', 'Description'],
      rows: [
        ['frontend/', 'React application — user interface'],
        ['frontend/src/pages/', 'Application pages (Products, Customers, Sales...)'],
        ['frontend/src/components/', 'Shared components (Layout, AdminLayout...)'],
        ['frontend/src/translations/', 'Translation files (en.js, he.js, pt.js)'],
        ['frontend/public/', 'Static files, service-worker.js, manifest.json'],
        ['backend/server.js', 'Local server — REST API + SQLite'],
        ['backend/sync-to-cloud.js', 'Sync engine — bidirectional local ↔ cloud every 5 min'],
        ['backend/warehouse.db', 'Local SQLite database'],
        ['backend-cloud/server-cloud.js', 'Cloud server — REST API + PostgreSQL (Supabase)'],
      ]
    }
  },
  {
    title: '4. System Modules',
    subsections: [
      {
        title: '4.1 Admin Module',
        content: 'Access: Admin only | Route: /admin/*',
        table: {
          headers: ['Module', 'Description'],
          rows: [
            ['Products', 'Product management, auto SKU, variants, categories, subcategories, product types'],
            ['Suppliers', 'Supplier management, contacts, multiple phone numbers'],
            ['Manufacturers', 'Manufacturer management, contacts, multiple phone numbers'],
            ['Customers', 'Customer management, countries, currencies'],
            ['Warehouse Reports', 'Inventory value, movements, low stock, inventory turnover (Admin only)'],
            ['Sales Reports', 'Sales analytics by country, product, customer (local only)'],
            ['Support Reports', 'Open/closed support case reports'],
            ['Settings', 'Company logo, SMTP, QR codes, email signatures, proforma signatures'],
            ['Users', 'User management and role assignment'],
            ['Activity Log', 'Full audit log of all user actions'],
          ]
        }
      },
      {
        title: '4.2 Other Modules',
        table: {
          headers: ['Module', 'Access', 'Route', 'Description'],
          rows: [
            ['Sales', 'Admin + Sales', '/sales/*', 'Quote creation, 9-stage deal workflow, proforma invoices'],
            ['Support', 'Admin + Support', '/support/*', 'Support ticket management and dashboard'],
            ['Warehouse', 'Admin + Worker', '/warehouse/*', 'Inbound/Outbound transactions, stock management'],
          ]
        }
      }
    ]
  },
  {
    title: '5. Users & Roles',
    table: {
      headers: ['Name', 'Role', 'Access', 'Notes'],
      rows: [
        ['Amit', 'Admin', 'All modules', 'System owner'],
        ['Silvio', 'Worker / Sales', 'Sales + Support', 'Cloud user'],
        ['Duli', 'Worker', 'Support', 'Cloud user'],
      ]
    }
  },
  {
    title: '6. Deployment',
    subsections: [
      {
        title: '6.1 Auto-Deploy to Cloud',
        content: 'Every push to vercel-fix on GitHub triggers an automatic deploy on Render. The full flow:',
        steps: [
          { step: 'Step 1', title: 'Edit code locally', desc: 'Make changes in C:\\Users\\amit\\crm-project' },
          { step: 'Step 2', title: 'git add [files]', desc: 'Stage specific files — or use git add . for all changes' },
          { step: 'Step 3', title: 'git commit -m "description"', desc: 'Use clear prefixes: feat: (new feature), fix: (bug fix), chore: (maintenance)' },
          { step: 'Step 4', title: 'git push origin vercel-fix', desc: 'Pushes code to GitHub → GitHub triggers a webhook to Render' },
          { step: 'Step 5', title: 'Render detects the push', desc: 'Both Frontend and Backend services redeploy automatically (~2-3 min each)' },
          { step: 'Step 6', title: 'Monitor deploy', desc: 'Render Dashboard → select service → Logs tab — watch for: "Build successful" and "Your service is live"' },
          { step: 'Step 7', title: 'Verify on app.world-secure.com', desc: 'Open the app and confirm changes are visible' },
        ],
        tip: 'If auto-deploy did not trigger: Render Dashboard → Manual Deploy → Deploy latest commit.',
        warning: 'Frontend and Backend deploy independently. If you changed both server-cloud.js and a React page, watch both service logs.'
      },
      {
        title: '6.2 Running Locally',
        content: 'Three terminals must run simultaneously:',
        table: {
          headers: ['Terminal', 'Directory', 'Command'],
          rows: [
            ['#1 — Frontend', 'crm-project\\frontend', 'npm start'],
            ['#2 — Backend', 'crm-project\\backend', 'node server.js'],
            ['#3 — Sync', 'crm-project\\backend', 'node sync-to-cloud.js'],
          ]
        }
      },
      {
        title: '6.3 Updating PWA on Mobile',
        content: 'After deploying significant changes, update the cache version in frontend/public/service-worker.js:',
        note: 'Change: const CACHE_NAME = \'worldsecure-YYYYMMDD\'; — Mobile devices will detect the new version and reload automatically.'
      }
    ]
  },
  {
    title: '7. Databases',
    subsections: [
      {
        title: '7.1 SQLite (Local)',
        content: 'Path: C:\\Users\\amit\\crm-project\\backend\\warehouse.db. Can be opened with DB Browser for SQLite. Recommended backup: copy warehouse.db weekly to external drive / Google Drive. The deleted_entities table tracks deleted records to enable sync deletions to cloud.',
      },
      {
        title: '7.2 PostgreSQL — Supabase',
        content: 'Server: Frankfurt (eu-central-1) | Admin UI: app.supabase.com. RLS (Row Level Security) — disabled on all tables; access controlled by server-cloud.js. Sequences — auto-synced on every backend startup via fixSequences().',
      },
      {
        title: '7.3 Key Tables',
        table: {
          headers: ['Table', 'Contents'],
          rows: [
            ['users', 'System users and roles'],
            ['products', 'Products with SKU, variants, pricing'],
            ['categories / subcategories', 'Product categories with code field'],
            ['customers', 'Customers, countries, contact details'],
            ['suppliers / manufacturers', 'Suppliers and manufacturers with multiple contacts'],
            ['inbound / outbound', 'Warehouse movement transactions'],
            ['support_tickets', 'Support cases / tickets'],
            ['settings', 'Company settings, logo, SMTP config'],
            ['deleted_entities', 'Tracks deleted records for sync propagation'],
          ]
        }
      }
    ]
  },
  {
    title: '8. Environment Variables',
    subsections: [
      {
        title: '8.1 Backend — Cloud (Render)',
        content: 'Where to configure: Render Dashboard → worldsecure-backend → Environment → Environment Variables',
        table: {
          headers: ['Variable', 'Where to get the value', 'Description'],
          rows: [
            ['DATABASE_URL', 'Supabase → Project Settings → Database → Connection String → URI', 'Full PostgreSQL connection string — format: postgresql://user:pass@host:5432/dbname'],
            ['BREVO_API_KEY', 'Brevo → Account (top-right) → API Keys → Generate or copy existing', 'Used by server-cloud.js to send emails via Brevo SMTP API'],
            ['PDFSHIFT_API_KEY', 'pdfshift.io/dashboard → API Key section', 'Used to generate PDF documents (delivery notes, proforma invoices)'],
            ['JWT_SECRET', 'Set once — any random string of 32+ characters', 'Signs and verifies user login tokens — changing this logs out all users'],
            ['NODE_ENV', 'Type manually: production', 'Activates production mode in server-cloud.js'],
          ]
        },
        warning: 'Never commit .env files to git. Verify .gitignore contains: .env, backend/.env, backend-cloud/.env'
      },
      {
        title: '8.2 Backend — Local (.env file)',
        content: 'File location: C:\\Users\\amit\\crm-project\\backend\\.env',
        table: {
          headers: ['Variable', 'Value', 'Description'],
          rows: [
            ['REACT_APP_API_URL', 'http://localhost:3001', 'Points frontend to local backend'],
            ['DATABASE_URL', 'Same Supabase URI as cloud', 'Used by sync-to-cloud.js to connect to Supabase'],
            ['BREVO_API_KEY', 'Same as cloud', 'Used if sending emails from local machine'],
            ['PDFSHIFT_API_KEY', 'Same as cloud', 'Used if generating PDFs from local machine'],
            ['JWT_SECRET', 'Same value as cloud — MUST MATCH', 'Must be identical to cloud — otherwise cloud-generated tokens will be invalid locally'],
          ]
        }
      },
      {
        title: '8.3 Frontend — Local (.env file)',
        content: 'File location: C:\\Users\\amit\\crm-project\\frontend\\.env',
        table: {
          headers: ['Variable', 'Value', 'Description'],
          rows: [
            ['REACT_APP_API_URL', 'http://localhost:3001', 'Points React dev server to local backend API — MUST be on line 1 with no blank lines or spaces before it'],
          ]
        },
        warning: 'This file must contain ONLY the one line above. Any blank line or space at the top causes the "allowedHosts" startup error.'
      }
    ]
  },
  {
    title: '9. Troubleshooting',
    subsections: [
      {
        title: '9.1 Frontend Won\'t Start (Local)',
        table: {
          headers: ['Error', 'Solution'],
          rows: [
            ['allowedHosts[0] should be non-empty string', 'Check frontend/.env — delete any blank lines or spaces at the top of the file'],
            ['Cannot connect to localhost:3001', 'Start backend/server.js first'],
            ['Module not found', 'Run npm install in the frontend folder'],
          ]
        }
      },
      {
        title: '9.2 Sync Errors',
        table: {
          headers: ['Error', 'Solution'],
          rows: [
            ['duplicate key value violates constraint', 'Restart Render service → fixSequences() runs automatically on startup'],
            ['Render sleeping / timeout', 'Wait 30 seconds after first request — Render wakes up on free tier'],
            ['Categories returning after deletion', 'Check deleted_entities in SQLite — entry must exist for the deleted record'],
          ]
        }
      },
      {
        title: '9.3 PWA Not Updating on Mobile',
        steps: [
          { step: 'Step 1', title: 'Open the PWA on the mobile device' },
          { step: 'Step 2', title: 'Open browser settings → Site Settings → Clear Data' },
          { step: 'Step 3', title: 'Reopen the app — the new version will load' },
        ],
        tip: 'Permanent fix: Update CACHE_NAME in service-worker.js before every significant deploy.'
      },
      {
        title: '9.4 Render Deploy Failed',
        steps: [
          { step: 'Step 1', title: 'Go to render.com → Select the service → Logs tab' },
          { step: 'Step 2', title: 'Identify the error in the build/deploy logs' },
          { step: 'Step 3', title: 'Common fix: verify all Environment Variables are correctly set' },
          { step: 'Step 4', title: 'Trigger a Manual Deploy from the Render Dashboard after fixing' },
        ]
      }
    ]
  },
  {
    title: '10. Maintenance',
    subsections: [
      {
        title: '10.1 Backups',
        table: {
          headers: ['What', 'Frequency', 'How'],
          rows: [
            ['SQLite (warehouse.db)', 'Weekly', 'Copy file to external drive or Google Drive'],
            ['PostgreSQL (Supabase)', 'Daily (auto)', 'Supabase Dashboard → Database → Backups'],
            ['Source Code', 'Every push', 'Stored in GitHub — every version recoverable'],
          ]
        }
      },
      {
        title: '10.2 Monitoring',
        steps: [
          { step: '→', title: 'Render Logs', desc: 'Check for errors in server-cloud.js — Render Dashboard → Service → Logs' },
          { step: '→', title: 'Supabase Dashboard', desc: 'Database → Logs — check for SQL errors' },
          { step: '→', title: 'Activity Log', desc: 'Track all user actions — Admin → Activity Log' },
          { step: '→', title: 'Sync terminal', desc: 'Verify "synced" messages appear every 5 minutes' },
        ]
      },
      {
        title: '10.3 Updates',
        steps: [
          { step: '→', title: 'Node.js packages', desc: 'Run npm update in both frontend and backend folders' },
          { step: '→', title: 'react-scripts', desc: 'Upgrade carefully — always check compatibility before updating' },
          { step: '→', title: 'After any update', desc: 'Test locally before pushing to vercel-fix' },
        ]
      },
      {
        title: '10.4 Security',
        steps: [
          { step: '→', title: 'JWT tokens', desc: 'Expire automatically — users are prompted to re-login' },
          { step: '→', title: 'API keys', desc: 'Rotate every 6-12 months (Brevo, PDFShift)' },
          { step: '→', title: 'Supabase', desc: 'Do not enable RLS policies without thorough testing' },
          { step: '→', title: 'GitHub', desc: 'Confirm .env files are in .gitignore and never pushed to the repository' },
          { step: '→', title: 'Admin credentials', desc: 'Change default passwords for all users after initial setup' },
        ]
      }
    ]
  },
  {
    title: '11. Installing on a New Machine',
    content: 'The system includes an automated PowerShell installer script. The full process takes approximately 10-15 minutes.',
    subsections: [
      {
        title: '11.1 Prerequisites',
        steps: [
          { step: '✔', title: 'Windows 10 / 11 — 64-bit' },
          { step: '✔', title: 'Active internet connection', desc: 'Required to download code and packages' },
          { step: '✔', title: 'Administrator privileges on the machine' },
          { step: '✔', title: 'Access to the GitHub repository' },
        ]
      },
      {
        title: '11.2 Files to Prepare from the Old Machine',
        table: {
          headers: ['File', 'Source Location', 'Destination on New Machine'],
          rows: [
            ['warehouse.db', 'crm-project\\backend\\', 'crm-project\\backend\\'],
            ['.env (backend)', 'crm-project\\backend\\', 'crm-project\\backend\\'],
          ]
        },
        warning: 'The .env file contains secret API keys. Transfer it securely (USB only) — never by email.'
      },
      {
        title: '11.3 Installation Steps',
        steps: [
          { step: 'A', title: 'Run the Installer', desc: 'Right-click WorldSecure_CRM_Installer.ps1 → "Run with PowerShell". If Execution Policy error: run as Admin: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process' },
          { step: 'B', title: 'Automated Installation', desc: 'Installer checks internet → installs Node.js + Git → clones code from GitHub (vercel-fix) → runs npm install → waits for DB copy → creates startup script and Desktop shortcut' },
          { step: 'C', title: 'Copy DB and .env Files', desc: 'When the script pauses at Step 5 — copy warehouse.db and .env to: C:\\Users\\[name]\\crm-project\\backend\\. The script detects the files and continues automatically.' },
        ],
        table: {
          headers: ['#', 'Stage', 'What happens'],
          rows: [
            ['0', 'Internet check', 'Verifies active internet connection'],
            ['1', 'Node.js + Git', 'Downloads and installs if not present — Node.js v20 LTS + Git v2.43'],
            ['2', 'Install folder', 'Default: C:\\Users\\[name]\\crm-project — can be changed'],
            ['3', 'Download code', 'git clone from GitHub + checkout vercel-fix branch'],
            ['4', 'npm install', 'Installs Node.js packages for both backend and frontend'],
            ['5', 'Transfer DB', 'Script waits — copy warehouse.db and .env to the folders shown'],
            ['6', 'Startup script', 'Creates start-crm_WITH_SYNC.bat in the project folder'],
            ['7', 'Desktop shortcut', 'Creates "WorldSecure CRM.lnk" on the Desktop'],
          ]
        }
      },
      {
        title: '11.4 First Launch',
        steps: [
          { step: 'Step 1', title: 'Double-click "WorldSecure CRM" on the Desktop' },
          { step: 'Step 2', title: 'Three terminal windows open', desc: 'Backend, Frontend, Cloud Sync' },
          { step: 'Step 3', title: 'After ~30 seconds', desc: 'Browser opens automatically to http://localhost:3000' },
          { step: 'Step 4', title: 'Log in with Admin credentials' },
          { step: 'Step 5', title: 'Verify sync', desc: 'Check the Sync terminal for "synced" messages' },
        ]
      },
      {
        title: '11.5 Post-Installation Checks',
        table: {
          headers: ['Check', 'Expected Result'],
          rows: [
            ['http://localhost:3000 loads', 'WorldSecure CRM login screen'],
            ['Login with Admin account', 'Enter system without errors'],
            ['Products / Customers visible', 'Data from warehouse.db appears'],
            ['Cloud Sync terminal', 'Shows "synced" messages after 5 minutes'],
            ['Login to app.world-secure.com', 'Same data visible in cloud'],
          ]
        }
      },
      {
        title: '11.6 Common Installation Errors',
        table: {
          headers: ['Error', 'Solution'],
          rows: [
            ['Execution Policy error', 'Run: Set-ExecutionPolicy Bypass -Scope Process'],
            ['git clone failed', 'Check GitHub access permissions and internet connection'],
            ['npm install failed', 'Run manually: cd frontend && npm install'],
            ['allowedHosts error on startup', 'Check frontend\\.env — must contain only: REACT_APP_API_URL=http://localhost:3001'],
            ['Backend fails to start', 'Verify .env exists in backend\\ folder with DATABASE_URL'],
          ]
        }
      }
    ]
  },
  {
    title: '12. Quick Reference',
    subsections: [
      {
        title: '12.1 Important Links',
        table: {
          headers: ['Service', 'URL'],
          rows: [
            ['System (Cloud)', 'https://app.world-secure.com'],
            ['Render Dashboard', 'https://dashboard.render.com'],
            ['Supabase Dashboard', 'https://app.supabase.com'],
            ['GitHub Repository', 'https://github.com — branch: vercel-fix'],
            ['Brevo Dashboard', 'https://app.brevo.com'],
            ['PDFShift Dashboard', 'https://pdfshift.io/dashboard'],
            ['cron-job.org', 'https://console.cron-job.org'],
            ['Local System', 'http://localhost:3000'],
            ['Local Backend API', 'http://localhost:3001/api'],
          ]
        }
      },
      {
        title: '12.2 Common Git Commands',
        steps: [
          { step: '1', title: 'cd C:\\Users\\amit\\crm-project' },
          { step: '2', title: 'git add [files]' },
          { step: '3', title: 'git commit -m "description"' },
          { step: '4', title: 'git push origin vercel-fix' },
        ]
      }
    ]
  },
  // ── PART II: User Manual ────────────────────────────────────────────────────
  {
    title: '13. Sales Module — Deal Management',
    nav: '📍 Navigation: Top bar → SALES',
    content: 'The Sales module manages the full sales cycle from quote creation to deal closure.',
    subsections: [
      {
        title: '13.1 Sales Management Screen',
        content: 'The main screen shows the Quotes List table with: Quote Number, Customer, Total, Currency, Status, Date, Actions.',
        table: {
          headers: ['Status', 'Color', 'Meaning'],
          rows: [
            ['Pending', 'Yellow', 'Quote created, awaiting approval'],
            ['Approved', 'Green', 'Quote approved — can proceed through deal stages'],
            ['Closed', 'Blue-gray', 'Deal fully closed — all 9 stages completed'],
          ]
        }
      },
      {
        title: '13.2 Creating a New Quote',
        nav: '📍 Navigation: SALES → Quotes List → "New Quote" button (top of screen)',
        steps: [
          { step: 'Step 1', title: 'Click "New Quote"', desc: 'Blue button at the top of the screen' },
          { step: 'Step 2', title: 'Select Currency', desc: 'Choose deal currency (EUR, USD, Shekel, AOA, KES, etc.). This determines the Base Currency in Additional Costs — choose carefully.' },
          { step: 'Step 3', title: 'Select Customer', desc: 'Choose from the dropdown' },
          { step: 'Step 4', title: 'Add Products', desc: 'Select product → enter quantity → enter unit price → click "Add Item". Repeat for each product.' },
          { step: 'Step 5', title: 'Add Notes', desc: 'Optional comments for the deal' },
          { step: 'Step 6', title: 'Add QR Code', desc: 'Select a QR Code if relevant (optional)' },
          { step: 'Step 7', title: 'Click "Save Quote"', desc: 'Quote saved with Pending status' },
        ],
        warning: 'Enter prices as numbers only. Typing 1,000 will be saved correctly as 1,000 (not 1).'
      },
      {
        title: '13.3 Approving a Quote',
        nav: '📍 Navigation: SALES → Quotes List → Actions column → "Approve" button',
        steps: [
          { step: 'Step 1', title: 'Click "Approve"', desc: 'In the Actions column of the quote row' },
          { step: 'Step 2', title: 'Status changes to Approved (green)', desc: 'The Manage Stages button becomes active. Only after Approve can you proceed with the deal workflow.' },
        ]
      },
      {
        title: '13.4 Managing Deal Stages',
        nav: '📍 Navigation: SALES → Quotes List → Actions column → "Manage Stages" button (available after Approve)',
        content: 'Clicking Manage Stages opens a window with 9 sequential stages. Each stage unlocks after the previous one is completed:',
        table: {
          headers: ['#', 'Stage', 'Required Action', 'Description'],
          rows: [
            ['1', 'Quotation', 'Automatic', 'Created automatically when quote is saved'],
            ['2', 'Quote Approval', 'Click Approve', 'Internal approval by the authorizing person'],
            ['3', 'Proforma Invoice', 'Click Create', 'Select language (PT/EN/HE), enter L/C Number, click Create PDF'],
            ['4', 'Commercial Contract', 'Upload file', 'Upload the signed commercial contract'],
            ['5', 'B/L + Packing List', 'Upload B/L + Delivery Note', 'Upload Bill of Lading. Link existing Delivery Note or create new.'],
            ['6', 'Commercial Invoice', 'Upload document', 'Upload the commercial invoice'],
            ['7', 'Payment Proof', 'Upload proof', 'Upload customer payment confirmation'],
            ['8', 'Additional Costs', 'Fill Costs', 'Enter extra costs: Customs Agent, Bank Fees, Shipping, Other'],
            ['9', 'Additional Costs Upload', 'Upload files + close', 'Upload supporting files. Click "Complete and Close Deal".'],
          ]
        },
        tip: 'After closing, a "Deal Summary" button appears showing a full summary of all 9 stages with all documents.'
      },
      {
        title: '13.5 Additional Actions',
        table: {
          headers: ['Button', 'Action'],
          rows: [
            ['Pricing', 'Calculate deal profitability — computes cost vs revenue with currency conversion'],
            ['Edit', 'Edit the quote — change customer, products, prices (only while not Closed)'],
            ['Delete', 'Permanently delete the quote'],
            ['new_currency_version', 'Create a new version of the quote in a different currency with auto exchange rate conversion'],
            ['Reset', 'Reset all stages — returns to Approved status for corrections'],
            ['Deal Summary', 'Full summary of all 9 stages with documents (appears only after Closed)'],
          ]
        }
      }
    ]
  },
  {
    title: '14. Support Module — Case Management',
    nav: '📍 Navigation: Top bar → SUPPORT → Support Management',
    content: 'The Support module manages all customer support cases from opening to resolution. Every interaction with a customer must be documented in the case timeline.',
    subsections: [
      {
        title: '14.1 Support Management Screen',
        content: 'Access: click SUPPORT in the top navigation bar. The main screen shows All Tickets with columns: Ticket #, Customer, Subject, Priority, Status, Date, Actions. Click "Case Management" in the Actions column to open and manage a case.',
        table: {
          headers: ['Status', 'When to use', 'What happens'],
          rows: [
            ['Open', 'Set automatically when a new ticket is created', 'Case appears in the ticket list — not yet assigned or worked on'],
            ['In Progress', 'When you start actively working on the case', 'Signals to the team that this case is being handled'],
            ['Awaiting Customer', 'When you have contacted the customer and are waiting for their response', 'A required dialog opens: select Communication Channel (Phone/Email/SMS), enter a Note of what was requested, and optionally set an Expected Reply date. Everything is logged automatically in the Timeline.'],
            ['Closed', 'When the issue is fully resolved', 'Requires a resolution comment before closing. Case is archived.'],
            ['Cancelled', 'When the case is no longer relevant (duplicate, error, customer withdrew)', 'Case is closed without resolution — use sparingly and always add a comment explaining why.'],
          ]
        },
        note: 'IMPORTANT: When the customer responds after "Awaiting Customer" — change the status back to "In Progress" immediately. Leaving a case as "Awaiting Customer" after the customer has replied gives a false picture of the workload to the entire team.'
      },
      {
        title: '14.2 Opening a New Support Case',
        nav: '📍 Navigation: SUPPORT → Support Management → "Open New Ticket" button (top of screen)',
        steps: [
          { step: 'Step 1', title: 'Click "Open New Ticket"', desc: 'Blue button at the top of the Support Management screen' },
          { step: 'Step 2', title: 'Select Customer', desc: 'Required — choose from the dropdown' },
          { step: 'Step 3', title: 'Select Product', desc: 'Required — the product related to the issue' },
          { step: 'Step 4', title: 'Enter Subject', desc: 'Required — brief description (max 80 characters)' },
          { step: 'Step 5', title: 'Add Description', desc: 'Detailed explanation of the problem (recommended)' },
          { step: 'Step 6', title: 'Set Priority', desc: 'Low / Medium / High / Urgent' },
          { step: 'Step 7', title: 'Click "Save"', desc: 'Ticket is created with a unique TKT number and Status is automatically set to Open' },
        ],
        note: 'Status cannot be changed during ticket creation — it is automatically set to Open. To change the status, open the case via "Case Management" after it has been created.'
      },
      {
        title: '14.3 Documenting Customer Interactions',
        nav: '📍 Navigation: SUPPORT → Support Management → Actions column → "Case Management" → scroll down to "ADD COMMENT" section',
        warning: 'Every interaction with the customer MUST be documented in the case. This includes phone calls, emails, WhatsApp messages, and any other communication. A case without documentation is incomplete.',
        steps: [
          { step: 'Step 1', title: 'Open the case via "Case Management"' },
          { step: 'Step 2', title: 'Scroll to "ADD COMMENT"' },
          { step: 'Step 3', title: 'Type the interaction details', desc: 'e.g. "Called customer — confirmed the issue. Will send replacement."' },
          { step: 'Step 4', title: 'Click "Save Comment"' },
        ],
        note: 'If the customer sends photos of a defective product, upload them immediately using the "Upload Image" field (up to 5 images). Photos are critical evidence.'
      },
      {
        title: '14.4 Setting Status to "Awaiting Customer"',
        nav: '📍 Navigation: SUPPORT → Support Management → "Case Management" → Ticket Details section → Status dropdown → select "Awaiting Customer"',
        intro: 'When you contact the customer and are waiting for their response:',
        steps: [
          { step: 'Step 1', title: 'Change Status to "Awaiting Customer"', desc: 'A dialog box opens automatically' },
          { step: 'Step 2', title: 'Select Communication Channel', desc: 'Phone / Email / SMS — required' },
          { step: 'Step 3', title: 'Enter Note', desc: 'What you requested from the customer' },
          { step: 'Step 4', title: 'Set Expected Reply', desc: 'Optional — date/time when customer is expected to respond' },
          { step: 'Step 5', title: 'Click "Confirm"' },
        ],
        warning: 'When the customer responds, change the status back to "In Progress" immediately.'
      },
      {
        title: '14.5 Sending a Product from a Case',
        nav: '📍 Navigation: SUPPORT → Support Management → "Case Management" → "Send Product" button',
        intro: 'When a defective or missing product needs to be replaced, use the Send Product workflow. This connects Support directly to the Warehouse:',
        steps: [
          { step: 'Step 1', title: 'Click "Send Product"', desc: 'Inside the case (Case Management). Select the product and quantity, then confirm. A dispatch request is immediately sent to the Warehouse module.' },
          { step: 'Step 2', title: 'Warehouse receives an alert on their Dashboard', desc: 'The warehouse operator sees the dispatch request on the Warehouse Dashboard. They prepare the product and create an Outbound transaction with a Delivery Note.' },
          { step: 'Step 3', title: 'Warehouse confirms dispatch', desc: 'After the product is shipped, the warehouse operator marks the dispatch as confirmed. An automatic alert is sent back to the Support module.' },
          { step: 'Step 4', title: 'Support receives an alert on their Dashboard', desc: 'The Support Dashboard shows a new notification with: product name, quantity, delivery note reference number, and dispatch date.' },
          { step: 'Step 5', title: 'Support acknowledges the alert', desc: 'Open the case and confirm receipt of the dispatch notification. This closes the alert and logs the acknowledgment in the case Timeline.' },
          { step: 'Step 6', title: 'Document customer confirmation', desc: 'When the customer confirms they received the product — add a comment in the case: e.g. "Customer confirmed receipt of replacement unit on [date]."' },
        ],
        tip: 'The entire process — request, dispatch, confirmation, and acknowledgment — is automatically logged in the History / Timeline of the case with full details and timestamps. No manual documentation is needed for the dispatch itself.',
        warning: 'Always check that the Warehouse has sufficient stock before clicking Send Product. Coordinate with the warehouse team if stock is low.'
      },
      {
        title: '14.6 Closing a Case',
        nav: '📍 Navigation: SUPPORT → Support Management → "Case Management" → Ticket Details → Status dropdown → "Closed" → Save',
        steps: [
          { step: 'Step 1', title: 'Verify the issue is fully resolved' },
          { step: 'Step 2', title: 'Add a resolution comment', desc: 'e.g. "Issue resolved — replacement unit shipped and confirmed received."' },
          { step: 'Step 3', title: 'Change Status to "Closed"' },
          { step: 'Step 4', title: 'Click "Save"' },
        ],
        warning: 'Do not close a case without a resolution comment. Every closed case must have a clear record of how it was resolved.'
      },
      {
        title: '14.7 Priority Guidelines',
        table: {
          headers: ['Priority', 'When to use', 'Expected response'],
          rows: [
            ['Low', 'General inquiry, no urgency', 'Within 3 business days'],
            ['Medium', 'Standard issue requiring attention', 'Within 1 business day'],
            ['High', 'Significant impact on customer', 'Within a few hours'],
            ['Urgent', 'Critical failure, customer cannot operate', 'Immediately'],
          ]
        }
      }
    ]
  },
  {
    title: '15. Warehouse Module',
    nav: '📍 Navigation: Top bar → WAREHOUSE',
    content: 'The Warehouse module manages all physical inventory movements. The sidebar contains: Dashboard, Inbound, Outbound, and Warehouse Reports.',
    subsections: [
      {
        title: '15.1 Inbound — Receiving Goods',
        nav: '📍 Navigation: WAREHOUSE → Sidebar → Inbound → "New Inbound" button (top right)',
        intro: 'Record every delivery received from a supplier as a new Inbound transaction.',
        steps: [
          { step: 'Step 1', title: 'Click "New Inbound"', desc: 'Blue button at the top right of the Inbound screen' },
          { step: 'Step 2', title: 'Select Supplier Type', desc: 'Registered (exists in system) or Unregistered' },
          { step: 'Step 3', title: 'Select Supplier', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Repeat for each product.' },
          { step: 'Step 5', title: 'General Notes', desc: 'Optional notes about the delivery' },
          { step: 'Step 6', title: 'Add QR Code', desc: 'Optional — select a QR code to attach to the receipt note' },
          { step: 'Step 7', title: 'Generate Receipt Note', desc: 'Check "Generate receipt note after saving" — the system will automatically generate a receipt PDF immediately after clicking Save' },
          { step: 'Step 8', title: 'Click "Save Transaction"', desc: 'Stock levels are updated automatically. If Generate Receipt Note was checked, the PDF is created immediately.' },
        ],
        tip: 'After saving, click "Receipt Note" in the Actions column to view and print the receipt document.'
      },
      {
        title: '15.2 Outbound — Shipping Goods',
        nav: '📍 Navigation: WAREHOUSE → Sidebar → Outbound → "New Outbound" button (top right)',
        intro: 'Record every shipment leaving the warehouse.',
        steps: [
          { step: 'Step 1', title: 'Click "New Outbound"', desc: 'Blue button at the top right of the Outbound screen' },
          { step: 'Step 2', title: 'Select Customer Type', desc: 'Registered or Unregistered' },
          { step: 'Step 3', title: 'Select Customer', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Set Status', desc: 'Pending / Ready / Shipped / Delivered' },
          { step: 'Step 5', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Available stock is shown next to each product.' },
          { step: 'Step 6', title: 'Packaging', desc: 'Choose: No packaging / Carton Packaging / Pallet Division' },
          { step: 'Step 7', title: 'Add QR Code', desc: 'Optional — select a QR code to attach to the delivery note' },
          { step: 'Step 8', title: 'Generate Delivery Note', desc: 'Check "Generate delivery note after saving" — the system will automatically generate a delivery note PDF immediately after clicking Save' },
          { step: 'Step 9', title: 'Click "Save Transaction"', desc: 'Stock levels are reduced automatically. If Generate Delivery Note was checked, the PDF is created immediately.' },
        ],
        tip: 'After saving, click "Delivery Note" to view, print or email the delivery note.',
        warning: 'Always check available stock before creating an outbound. Never ship more than what is in stock.'
      },
      {
        title: '15.3 Packaging Options',
        table: {
          headers: ['Option', 'When to use', 'What to enter'],
          rows: [
            ['Continue without packaging', 'Items shipped as-is, no packaging details needed', '—'],
            ['Carton Packaging', 'Items packed into cartons', 'Items per carton + Carton weight (kg) → system calculates number of cartons'],
            ['Pallet Division', 'Cartons loaded onto pallets', 'Cartons per pallet + Pallet dimensions + Pallet weight → system calculates number of pallets'],
          ]
        },
        note: 'Pallet Division is only available after completing Carton Packaging.'
      },
      {
        title: '15.4 Outbound Statuses',
        table: {
          headers: ['Status', 'Meaning'],
          rows: [
            ['Pending', 'Transaction created, goods not yet prepared'],
            ['Ready', 'Goods are packed and ready for shipment'],
            ['Shipped', 'Goods have been shipped to the customer'],
            ['Delivered', 'Goods have been delivered and confirmed by customer'],
          ]
        }
      }
    ]
  },
  {
    title: '16. Admin Module',
    nav: '📍 Navigation: Top bar → ADMIN',
    content: 'The Admin module is accessible to Admin users only. It contains all system configuration and master data management.',
    subsections: [
      {
        title: '16.1 Products',
        nav: '📍 Navigation: ADMIN → Sidebar → Products → "Add Product" button',
        content: 'Shows the full product catalog: SKU, Name, Category, Quantity, Unit, Suppliers, Manufacturers. Each product has Edit, Discontinue, and Delete actions.',
        steps: [
          { step: 'Step 1', title: 'Click "Add Product"' },
          { step: 'Step 2', title: 'Choose product type', desc: '"Parent Product (with variants)" for products with multiple variants, or leave unchecked for a simple product' },
          { step: 'Step 3', title: 'Fill in product details', desc: 'SKU (auto-generated), Name (auto-translated to HE/PT), Category, Subcategory, Unit, Suppliers, Manufacturers, Cost Price, Quantity, Min. Qty' },
          { step: 'Step 4', title: 'For Parent Product — Define Variants', desc: 'Click "Define Variants", select an attribute (e.g. Color), add values (e.g. BLACK, BLUE). System generates SKU variants automatically.' },
          { step: 'Step 5', title: 'Click "Save"' },
        ],
        tip: 'SKUs are generated automatically based on category, subcategory, product type, and variant codes. Never edit an SKU manually.',
        table: {
          headers: ['Manage Menu Option', 'Description'],
          rows: [
            ['Categories', 'Add/edit/delete product categories. Each has a Code (e.g. LND) and a Name. Supports Import/Export CSV.'],
            ['Subcategories', 'Add/edit/delete subcategories within a parent category. Supports Import/Export CSV.'],
            ['Attributes', 'Manage variant attributes (Color, Size, Material, etc.). Supports Import/Export CSV.'],
            ['Product Types', 'Define product types with codes used in SKU structure (e.g. VST = Tactical Vest). Supports Import/Export CSV.'],
            ['Translate Missing', 'Auto-translate product names missing translations in Hebrew or Portuguese'],
            ['Translate All', 'Re-translate all product names to all system languages'],
          ]
        }
      },
      {
        title: '16.2 Suppliers & Manufacturers',
        content: 'Both screens are identical in structure. Fields: Name (required), Contact Person (multiple supported with phone, email), Address, Tax ID, Country (required), Notes. Click "Add Supplier" or "Add Manufacturer" to create new records.',
      },
      {
        title: '16.3 Customers',
        content: 'Fields: Name (required), Contact Person (multiple supported), Address, Tax ID, Country (required), Sensitive Customer (hides customer from non-admin users), Notes.',
      },
      {
        title: '16.4 Settings',
        nav: '📍 Navigation: ADMIN → Sidebar → Settings',
        table: {
          headers: ['Section', 'Description'],
          rows: [
            ['Company Logo', 'Upload the company logo displayed on all PDFs and documents'],
            ['Company Settings', 'Company name, address, NIF/Tax ID, bank details (name, address, SWIFT, IBAN)'],
            ['SMTP', 'Email sending configuration — Brevo API key and sender email address'],
            ['QR Codes', 'Create and manage QR codes attachable to quotes and transactions'],
            ['Email Signature', 'Rich-text email signature appended to all outbound emails'],
            ['Outbound Signature', 'Signature for outbound delivery documents'],
            ['Proforma Signature', 'Signature block appearing on proforma invoice PDFs'],
          ]
        }
      },
      {
        title: '16.5 Users',
        nav: '📍 Navigation: ADMIN → Sidebar → Users',
        content: 'Manage all system user accounts. Fields: Username, Password, Role (Admin / Sales / Support / Worker), Language (EN / HE / PT).',
        warning: 'Only Admins can create or modify user accounts. Keep user credentials secure and do not share passwords between users.'
      },
      {
        title: '16.6 Activity Log',
        nav: '📍 Navigation: ADMIN → Sidebar → Activity Log',
        content: 'Records every action performed in the system by all users: User name, Action type (created/updated/deleted/login), Module, Timestamp, Details.',
        tip: 'Use the Activity Log to investigate unexpected changes to data, verify who made a specific change, or review user activity.'
      }
    ]
  }
];

// ─── Section Renderer ─────────────────────────────────────────────────────────
function SectionBlock({ sec, isMobile, styles }) {
  return (
    <div>
      {sec.nav && <div style={styles.nav}>{sec.nav}</div>}
      {sec.content && <p style={styles.content}>{sec.content}</p>}
      {sec.intro && <p style={styles.intro}>{sec.intro}</p>}
      {sec.warning && !sec.steps && <div style={styles.warning}>⚠️ {sec.warning}</div>}
      {sec.warning && sec.steps && <div style={styles.warning}>⚠️ {sec.warning}</div>}
      {sec.steps && sec.steps.map((s, j) => (
        <div key={j} style={styles.stepRow}>
          <span style={styles.stepBadge}>{s.step}</span>
          <div>
            <div style={styles.stepTitle}>{s.title}</div>
            {s.desc && <div style={styles.stepDesc}>{s.desc}</div>}
          </div>
        </div>
      ))}
      {sec.table && <ResponsiveTable headers={sec.table.headers} rows={sec.table.rows} isMobile={isMobile} />}
      {sec.tip && <div style={styles.tip}>✅ {sec.tip}</div>}
      {sec.note && <div style={styles.note}>💡 {sec.note}</div>}
    </div>
  );
}

export default function AdminGuide() {
  const isMobile = useIsMobile(600);

  const styles = {
    container: { maxWidth: '900px', margin: '0 auto', padding: isMobile ? '0.75rem' : '2rem', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '3px solid #2E75B6', paddingBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
    title: { fontSize: isMobile ? '1.2rem' : '1.8rem', fontWeight: 700, color: '#1B3A6B', margin: 0 },
    partBanner: (bg) => ({ background: bg, color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', marginTop: '1.5rem' }),
    section: { marginBottom: '1.2rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' },
    sectionTitle: { background: '#1B3A6B', color: '#fff', padding: '0.8rem 1.2rem', fontSize: isMobile ? '0.95rem' : '1.05rem', fontWeight: 700, margin: 0 },
    subsectionTitle: { fontWeight: 700, color: '#2E75B6', fontSize: '0.95rem', margin: '1rem 0 0.4rem 0', paddingLeft: '0.3rem', borderLeft: '3px solid #2E75B6' },
    sectionBody: { padding: isMobile ? '0.75rem' : '1.2rem' },
    content: { color: '#444', fontSize: '0.95rem', margin: '0 0 0.5rem 0' },
    nav: { background: '#EEF4FF', border: '1px solid #BDD0FF', borderRadius: '6px', padding: '0.45rem 0.8rem', marginBottom: '0.8rem', fontSize: '0.82rem', color: '#2E5AB6', fontWeight: 600 },
    intro: { color: '#444', marginBottom: '0.8rem', fontSize: '0.95rem' },
    stepRow: { display: 'flex', gap: '0.8rem', marginBottom: '0.6rem', alignItems: 'flex-start' },
    stepBadge: { background: '#2E75B6', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', marginTop: '2px', flexShrink: 0 },
    stepTitle: { fontWeight: 700, color: '#1B3A6B', fontSize: '0.95rem' },
    stepDesc: { color: '#555', fontSize: '0.9rem' },
    tip: { background: '#D4EDDA', borderLeft: '4px solid #1E7E34', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '0.8rem', color: '#155724', fontSize: '0.9rem' },
    warning: { background: '#F8D7DA', borderLeft: '4px solid #CC0000', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '0.5rem', marginBottom: '0.5rem', color: '#721C24', fontSize: '0.9rem' },
    note: { background: '#FFF3CD', borderLeft: '4px solid #FFA500', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '0.8rem', color: '#856404', fontSize: '0.9rem' },
    divider: { height: '1px', background: '#e2e8f0', margin: '0.8rem 0' },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>📖 System User Guide</h1>
        <div style={{ fontSize: '0.8rem', color: '#888', fontStyle: 'italic' }}>Admin Reference — v1.0 · April 2026</div>
      </div>

      <div style={styles.partBanner('#1B3A6B')}>PART I — System Reference Manual (IT)</div>

      {sections.map((sec, i) => {
        if (i === 13) {
          return (
            <React.Fragment key={i}>
              <div style={styles.partBanner('#2E75B6')}>PART II — User Manual (All Users)</div>
              <SectionCard sec={sec} isMobile={isMobile} styles={styles} />
            </React.Fragment>
          );
        }
        return <SectionCard key={i} sec={sec} isMobile={isMobile} styles={styles} />;
      })}
    </div>
  );
}

function SectionCard({ sec, isMobile, styles }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{sec.title}</h2>
      <div style={styles.sectionBody}>
        <SectionBlock sec={sec} isMobile={isMobile} styles={styles} />
        {sec.subsections && sec.subsections.map((sub, k) => (
          <div key={k}>
            <div style={styles.divider} />
            <div style={styles.subsectionTitle}>{sub.title}</div>
            <SectionBlock sec={sub} isMobile={isMobile} styles={styles} />
          </div>
        ))}
      </div>
    </div>
  );
}
