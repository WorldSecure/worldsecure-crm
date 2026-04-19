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
      }
    ]
  },
  {
    title: '2. External Services',
    table: {
      headers: ['Service', 'URL', 'Purpose'],
      rows: [
        ['Render', 'render.com', 'Hosting — Frontend (Static Site) + Backend (Web Service)'],
        ['Supabase', 'supabase.com', 'Database — PostgreSQL, Frankfurt region'],
        ['GitHub', 'github.com', 'Source Control — branch: vercel-fix → auto-deploy on Render'],
        ['Brevo', 'brevo.com', 'Email Service — outbound emails (SMTP / API)'],
        ['PDFShift', 'pdfshift.io', 'PDF Generation — delivery notes, proforma invoices'],
        ['cron-job.org', 'console.cron-job.org', 'Keep-Alive Ping — prevents Render from sleeping'],
      ]
    }
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
        steps: [
          { step: 'Step 1', title: 'Make code changes locally' },
          { step: 'Step 2', title: 'git add [files]' },
          { step: 'Step 3', title: 'git commit -m "description"' },
          { step: 'Step 4', title: 'git push origin vercel-fix' },
          { step: 'Step 5', title: 'Render auto-deploys', desc: 'Render detects the push → builds and deploys automatically (~2-3 min). Monitor in Render Dashboard.' },
        ]
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
        title: '8.1 Backend (Render — server-cloud.js)',
        table: {
          headers: ['Variable', 'Service', 'Description'],
          rows: [
            ['DATABASE_URL', 'Supabase', 'PostgreSQL connection string'],
            ['BREVO_API_KEY', 'Brevo', 'API key for sending emails'],
            ['PDFSHIFT_API_KEY', 'PDFShift', 'API key for PDF generation'],
            ['JWT_SECRET', 'Internal', 'Token encryption key'],
            ['NODE_ENV', 'Internal', 'Set to: production'],
          ]
        },
        warning: 'Never commit API keys to git. Always use environment variables. The .env file must be listed in .gitignore.'
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
    content: 'The Sales module manages the full sales cycle from quote creation to deal closure. Access: click SALES in the top navigation bar.',
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
        steps: [
          { step: 'Step 1', title: 'Click "Approve"', desc: 'In the Actions column of the quote row' },
          { step: 'Step 2', title: 'Status changes to Approved (green)', desc: 'The Manage Stages button becomes active. Only after Approve can you proceed with the deal workflow.' },
        ]
      },
      {
        title: '13.4 Managing Deal Stages',
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
    content: 'The Support module manages all customer support cases from opening to resolution. Every interaction with a customer must be documented in the case timeline.',
    subsections: [
      {
        title: '14.1 Support Management Screen',
        content: 'Access: click SUPPORT. The main screen shows All Tickets with columns: Ticket #, Customer, Subject, Priority, Status, Date, Actions.',
        table: {
          headers: ['Status', 'Meaning'],
          rows: [
            ['Open', 'New case — just created, not yet being handled'],
            ['In Progress', 'Case is being actively worked on'],
            ['Awaiting Customer', 'Waiting for a response from the customer'],
            ['Closed', 'Case fully resolved and closed'],
          ]
        }
      },
      {
        title: '14.2 Opening a New Support Case',
        steps: [
          { step: 'Step 1', title: 'Click "Open New Ticket"' },
          { step: 'Step 2', title: 'Select Customer', desc: 'Required' },
          { step: 'Step 3', title: 'Select Product', desc: 'Required — the product related to the issue' },
          { step: 'Step 4', title: 'Enter Subject', desc: 'Required — brief description (max 80 characters)' },
          { step: 'Step 5', title: 'Add Description', desc: 'Detailed explanation of the problem (recommended)' },
          { step: 'Step 6', title: 'Set Priority', desc: 'Low / Medium / High / Urgent' },
          { step: 'Step 7', title: 'Set Status', desc: 'Usually "Open" for new cases' },
          { step: 'Step 8', title: 'Click "Save"', desc: 'Ticket created with a unique TKT number' },
        ]
      },
      {
        title: '14.3 Documenting Customer Interactions',
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
        intro: 'When a defective product needs to be replaced:',
        steps: [
          { step: 'Step 1', title: 'Click "Send Product"', desc: 'A dispatch request is sent to the Warehouse' },
          { step: 'Step 2', title: 'Warehouse receives an alert', desc: 'The warehouse team prepares and ships the product' },
          { step: 'Step 3', title: 'Warehouse confirms dispatch', desc: 'An automatic alert is sent back to Support' },
          { step: 'Step 4', title: 'Support receives the alert', desc: 'Shows product name, quantity, delivery note reference, and date' },
          { step: 'Step 5', title: 'Acknowledge the alert', desc: 'Confirm receipt of the dispatch notification in the case' },
        ],
        tip: 'The entire process is logged automatically in the History / Timeline.'
      },
      {
        title: '14.6 Closing a Case',
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
    content: 'The Warehouse module manages all physical inventory movements. Access: click WAREHOUSE in the top navigation bar. The sidebar contains: Dashboard, Inbound, Outbound, and Warehouse Reports.',
    subsections: [
      {
        title: '15.1 Inbound — Receiving Goods',
        intro: 'Record every delivery received from a supplier as a new Inbound transaction.',
        steps: [
          { step: 'Step 1', title: 'Click "New Inbound"', desc: 'Blue button at the top right of the Inbound screen' },
          { step: 'Step 2', title: 'Select Supplier Type', desc: 'Registered (exists in system) or Unregistered' },
          { step: 'Step 3', title: 'Select Supplier', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Repeat for each product.' },
          { step: 'Step 5', title: 'General Notes', desc: 'Optional notes about the delivery' },
          { step: 'Step 6', title: 'Generate Receipt Note', desc: 'Check "Generate receipt note after saving" to create a receipt PDF automatically' },
          { step: 'Step 7', title: 'Click "Save Transaction"', desc: 'Stock levels are updated automatically' },
        ],
        tip: 'After saving, click "Receipt Note" in the Actions column to view and print the receipt document.'
      },
      {
        title: '15.2 Outbound — Shipping Goods',
        intro: 'Record every shipment leaving the warehouse.',
        steps: [
          { step: 'Step 1', title: 'Click "New Outbound"', desc: 'Blue button at the top right of the Outbound screen' },
          { step: 'Step 2', title: 'Select Customer Type', desc: 'Registered or Unregistered' },
          { step: 'Step 3', title: 'Select Customer', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Set Status', desc: 'Pending / In Progress / Shipped' },
          { step: 'Step 5', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Available stock is shown next to each product.' },
          { step: 'Step 6', title: 'Packaging', desc: 'Choose: No packaging / Carton Packaging / Pallet Division' },
          { step: 'Step 7', title: 'Click "Save Transaction"', desc: 'Stock levels are reduced automatically' },
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
      }
    ]
  },
  {
    title: '16. Admin Module',
    content: 'The Admin module is accessible to Admin users only. It contains all system configuration and master data management. Access: click ADMIN in the top navigation bar.',
    subsections: [
      {
        title: '16.1 Products',
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
        content: 'Manage all system user accounts. Fields: Username, Password, Role (Admin / Sales / Support / Worker), Language (EN / HE / PT).',
        warning: 'Only Admins can create or modify user accounts. Keep user credentials secure and do not share passwords between users.'
      },
      {
        title: '16.6 Activity Log',
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
