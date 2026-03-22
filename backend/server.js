require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');
const https = require('https');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename with timestamp prefix to prevent duplicates
    const timestamp = Date.now();
    // Handle Hebrew and special characters properly
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // Sanitize filename - remove problematic characters
    const safeName = originalName.replace(/[<>:"/\|?*]/g, '_');
    cb(null, timestamp + '_' + safeName);
  }
});
const upload = multer({ storage });

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Log activity
const logActivity = (userId, action, entityType, entityId, details) => {
  db.run(
    'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId, JSON.stringify(details)]
  );
};

// ============ AUTH ROUTES ============

// Register (first user is admin, rest are users)
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    // Check if user already exists
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (user) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Check if this is the first user
      db.get('SELECT COUNT(*) as count FROM users', [], async (err, result) => {
        const isFirstUser = result.count === 0;
        const userRole = isFirstUser ? 'admin' : (role || 'user');
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
          'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
          [username, email, hashedPassword, userRole],
          function(err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ 
              message: 'User created successfully', 
              userId: this.lastID,
              isFirstUser: isFirstUser,
              role: userRole
            });
          }
        );
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        module_warehouse: user.module_warehouse,
        module_sales: user.module_sales,
        module_service: user.module_service
      }
    });
  });
});

// Get current user data
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// ============ USERS ROUTES ============

app.get('/api/users', authenticateToken, (req, res) => {
  db.all('SELECT id, username, email, role, module_warehouse, module_sales, module_service, created_at FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Update user role (admin only)
app.put('/api/users/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { role, module_warehouse, module_sales, module_service } = req.body;
  
  // Check if requester is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  db.run(
    'UPDATE users SET role = ?, module_warehouse = ?, module_sales = ?, module_service = ? WHERE id = ?',
    [role, module_warehouse ? 1 : 0, module_sales ? 1 : 0, module_service ? 1 : 0, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'UPDATE_USER_ROLE', 'user', id, { role, module_warehouse, module_sales, module_service });
      res.json({ message: 'User permissions updated' });
    }
  );
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Check if requester is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Cannot delete self
  if (req.user.id === parseInt(id)) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    logActivity(req.user.id, 'DELETE_USER', 'user', id, {});
    res.json({ message: 'User deleted' });
  });
});

// Change user password (admin only)
app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'UPDATE_USER_PASSWORD', 'user', id, {});
      res.json({ message: 'Password updated successfully' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ COMPANY SETTINGS ROUTES ============

app.get('/api/company', authenticateToken, (req, res) => {
  db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || {});
  });
});

app.put('/api/company', authenticateToken, (req, res) => {
  const { company_name, address, phone, phone2, phone3, email, tax_id, website,
          smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
          phone1_primary, phone2_primary, phone3_primary } = req.body;
  
  db.run(
    `UPDATE company_settings 
     SET company_name = ?, address = ?, phone = ?, phone2 = ?, phone3 = ?, email = ?, tax_id = ?, website = ?,
         smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?,
         phone1_primary = ?, phone2_primary = ?, phone3_primary = ?
     WHERE id = 1`,
    [company_name, address, phone, phone2 || null, phone3 || null, email, tax_id, website,
     smtp_host || null, smtp_port || 587, smtp_user || null, smtp_pass || null, smtp_from || null,
     phone1_primary !== undefined ? phone1_primary : 1,
     phone2_primary !== undefined ? phone2_primary : 0,
     phone3_primary !== undefined ? phone3_primary : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'UPDATE_COMPANY_SETTINGS', 'company', 1, req.body);
      res.json({ message: 'Company settings updated' });
    }
  );
});

// Send document by email
// Test SMTP connection
app.post('/api/test-smtp', authenticateToken, async (req, res) => {
  try {
    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (!company?.smtp_host || !company?.smtp_user || !company?.smtp_pass) {
      return res.status(400).json({ error: 'פרטי SMTP חסרים - מלא את כל השדות ושמור תחילה' });
    }

    const transporter = nodemailer.createTransport({
      host: company.smtp_host,
      port: parseInt(company.smtp_port) || 587,
      secure: false,
      auth: { user: company.smtp_user, pass: company.smtp_pass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.verify();
    res.json({ success: true, message: `✅ החיבור הצליח! שולח: ${company.smtp_user}`, sender: company.smtp_user });
  } catch (err) {
    let msg = err.message;
    if (msg.includes('535') || msg.includes('Authentication')) {
      msg = '❌ שם משתמש או סיסמה שגויים. ב-Brevo: ודא שה-User הוא המייל שנרשמת איתו, והPassword הוא המפתח xsmtpsib-...';
    } else if (msg.includes('ECONNREFUSED')) {
      msg = '❌ לא ניתן להתחבר - בדוק Host ו-Port';
    } else if (msg.includes('ETIMEDOUT')) {
      msg = '❌ Timeout - ייתכן שה-Port חסום. נסה Port 465';
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/send-email', authenticateToken, async (req, res) => {
  const { to, subject, body, docType, docId, docLang, lcNumber, docContact } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing recipient email' });

  try {
    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (!company?.smtp_host || !company?.smtp_user || !company?.smtp_pass) {
      return res.status(400).json({ error: 'SMTP not configured. Please set up email settings in company settings.' });
    }

    const transporter = nodemailer.createTransport({
      host: company.smtp_host,
      port: parseInt(company.smtp_port) || 587,
      secure: false,
      auth: { user: company.smtp_user, pass: company.smtp_pass },
      tls: { rejectUnauthorized: false }
    });

    // קבל את ה-HTML של המסמך ישירות דרך Express
    let attachments = [];
    if (docType && docId) {
      try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const urlMap = {
          'outbound':         `http://localhost:3001/api/outbound/${docId}/delivery-note?lang=${docLang || 'he'}${docContact ? `&contact=${encodeURIComponent(docContact)}` : ''}&token=${encodeURIComponent(token)}`,
          'inbound':          `http://localhost:3001/api/inbound/${docId}/receipt-note?lang=${docLang || 'he'}${docContact ? `&contact=${encodeURIComponent(docContact)}` : ''}&token=${encodeURIComponent(token)}`,
          'proforma':         `http://localhost:3001/api/quotes/${docId}/proforma?lang=${docLang || 'pt'}&token=${encodeURIComponent(token)}`,
          'proforma-invoice': `http://localhost:3001/api/quotes/${docId}/proforma-invoice?lang=${docLang || 'pt'}${lcNumber ? `&lc_number=${encodeURIComponent(lcNumber)}` : ''}&token=${encodeURIComponent(token)}`
        };
        const nameMap = {
          'outbound':         `delivery_note_${docId}.html`,
          'inbound':          `receipt_note_${docId}.html`,
          'proforma':         `proforma_${docId}.html`,
          'proforma-invoice': `proforma_invoice_${docId}.html`
        };

        const fetchUrl = urlMap[docType];
        if (fetchUrl) {
          const htmlContent = await new Promise((resolve, reject) => {
            const httpModule = require('http');
            const urlObj = new URL(fetchUrl);
            const options = { hostname: urlObj.hostname, port: urlObj.port || 3001, path: urlObj.pathname + urlObj.search, method: 'GET' };
            const httpReq = httpModule.request(options, (httpRes) => {
              let data = '';
              httpRes.on('data', chunk => data += chunk);
              httpRes.on('end', () => resolve(data));
            });
            httpReq.on('error', reject);
            httpReq.end();
          });
          // הסר כפתורים מה-HTML לפני שליחה
          let cleanHtml = htmlContent
            .replace(/<script[\s\S]*?<\/script>/g, '');

          // הוסף CSS שמסתיר כפתורים ומודאל ב-PDF אך משאיר doc-footer
          cleanHtml = cleanHtml.replace('</style>', '.no-print { display: none !important; } .button-container { display: none !important; } .doc-footer { display: block !important; }</style>');

          console.log(`Attachment ready: ${nameMap[docType]}, size: ${htmlContent.length} chars`);

          // המר HTML ל-PDF עם puppeteer
          let attachmentBuffer;
          let attachmentFilename;
          try {
            const puppeteer = require('puppeteer');
            const browser = await puppeteer.launch({
              headless: 'new',
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();
            await page.setContent(cleanHtml, { waitUntil: 'networkidle0' });
            await page.emulateMediaType('print');
            attachmentBuffer = await page.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
              displayHeaderFooter: false,
            });
            await browser.close();
            attachmentFilename = (nameMap[docType] || 'document').replace('.html', '.pdf');
            console.log(`PDF generated: ${attachmentFilename}, size: ${attachmentBuffer.length} bytes`);
          } catch (pdfErr) {
            console.error('PDF generation failed, sending HTML:', pdfErr.message);
            attachmentBuffer = Buffer.from(cleanHtml, 'utf-8');
            attachmentFilename = nameMap[docType] || 'document.html';
          }

          attachments.push({
            filename: attachmentFilename,
            content: attachmentBuffer,
            contentType: attachmentFilename.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8'
          });
        }
      } catch (attachErr) {
        console.error('Attachment error:', attachErr.message);
        // ממשיך בלי קובץ מצורף
      }
    }

    // טען חתימה מה-DB או בנה ברירת מחדל
    let signatureHtml = '';
    const signatureRow = await new Promise((res, rej) => db.get('SELECT content FROM email_signatures WHERE is_active=1 LIMIT 1', [], (err, row) => err ? rej(err) : res(row)));
    if (signatureRow?.content) {
      signatureHtml = signatureRow.content;
    } else {
      let logoHtmlSignature = '';
      if (company.logo_path) {
        try {
          const logoFullPath = path.join(__dirname, company.logo_path.replace('/uploads/', 'uploads/'));
          if (fs.existsSync(logoFullPath)) {
            const logoData = fs.readFileSync(logoFullPath);
            const ext = path.extname(logoFullPath).toLowerCase().replace('.', '');
            const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
            const b64 = logoData.toString('base64');
            logoHtmlSignature = `<tr><td colspan="2" style="padding-top:8px;text-align:left;"><img src="data:${mime};base64,${b64}" alt="${company.company_name||''}" style="max-height:60px;max-width:200px;object-fit:contain;"></td></tr>`;
          }
        } catch (logoErr) { console.error('Logo embed error:', logoErr.message); }
      }
      signatureHtml = `<table style="font-size:13px;color:#333;line-height:1.6;">
        <tr><td colspan="2" style="font-weight:700;font-size:16px;padding-bottom:12px;color:#1a1a1a;">${company.company_name || 'WorldSecure'}</td></tr>
        ${company.phone ? `<tr><td style="padding-right:8px;color:#666;">📞</td><td>${company.phone}</td></tr>` : ''}
        ${company.email ? `<tr><td style="padding-right:8px;color:#666;">✉️</td><td>${company.email}</td></tr>` : ''}
        ${company.website ? `<tr><td colspan="2"><a href="${company.website}" target="_blank" style="color:#1a73e8;text-decoration:none;font-weight:600;">${company.website}</a></td></tr>` : ''}
        ${logoHtmlSignature}
      </table>`;
    }

    const info = await transporter.sendMail({      from: company.smtp_from || company.smtp_user,
      to,
      subject: subject || `מסמך מ-${company.company_name || 'המערכת'}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <p style="margin-bottom: 20px;">${body || 'מצורף מסמך לעיונך.'}</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
          ${signatureHtml}
        </div>
      `,
      attachments
    });

    console.log('Email sent:', info.messageId, '| accepted:', info.accepted, '| rejected:', info.rejected);
    if (info.rejected?.length > 0) {
      return res.status(500).json({ error: `הכתובת נדחתה: ${info.rejected.join(', ')}` });
    }

    res.json({ 
      message: 'Email sent successfully',
      messageId: info.messageId,
      accepted: info.accepted,
      from: company.smtp_from || company.smtp_user,
      hasAttachment: attachments.length > 0
    });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/company/logo', authenticateToken, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const logoPath = '/uploads/' + req.file.filename;
  
  db.run(
    'UPDATE company_settings SET logo_path = ? WHERE id = 1',
    [logoPath],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'UPDATE_LOGO', 'company', 1, { logoPath });
      res.json({ message: 'Logo uploaded', path: logoPath });
    }
  );
});

// ============ EMAIL SIGNATURES ROUTES ============

app.get('/api/email-signatures', authenticateToken, (req, res) => {
  db.all('SELECT * FROM email_signatures ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/email-signatures', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, content, is_active } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content required' });
  // אם זו חתימה פעילה — בטל את כל השאר
  const activate = is_active ? 1 : 0;
  const run = () => db.run(
    'INSERT INTO email_signatures (name, content, is_active) VALUES (?,?,?)',
    [name, content, activate],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, content, is_active: activate });
    }
  );
  if (activate) {
    db.run('UPDATE email_signatures SET is_active=0', [], run);
  } else { run(); }
});

app.put('/api/email-signatures/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, content, is_active } = req.body;
  const activate = is_active ? 1 : 0;
  const run = () => db.run(
    'UPDATE email_signatures SET name=?, content=?, is_active=? WHERE id=?',
    [name, content, activate, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated' });
    }
  );
  if (activate) {
    db.run('UPDATE email_signatures SET is_active=0', [], run);
  } else { run(); }
});

app.delete('/api/email-signatures/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.run('DELETE FROM email_signatures WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

// ============ EMAIL SIGNATURE ROUTES (legacy) ============

app.get('/api/company/email-signature', authenticateToken, (req, res) => {
  db.get('SELECT email_signature FROM company_settings WHERE id=1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ email_signature: row?.email_signature || null });
  });
});

app.put('/api/company/email-signature', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email_signature } = req.body;
  db.run('UPDATE company_settings SET email_signature=? WHERE id=1', [email_signature || null], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Email signature saved' });
  });
});

// ============ CATEGORIES ROUTES ============

// migration — הוסף עמודות שפה אם לא קיימות
db.run(`ALTER TABLE categories ADD COLUMN name_he TEXT`, () => {});
db.run(`ALTER TABLE categories ADD COLUMN name_pt TEXT`, () => {});
db.run(`ALTER TABLE products ADD COLUMN subcategory_id INTEGER`, () => {});
db.run(`ALTER TABLE products ADD COLUMN quantity_updated_at TEXT`, () => {});

app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categories', authenticateToken, (req, res) => {
  const { name, name_he, name_pt, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run(
    `INSERT INTO categories (name, name_he, name_pt, description, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [name, name_he||null, name_pt||null, description||null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'CREATE_CATEGORY', 'category', this.lastID, { name });
      res.json({ id: this.lastID, name, name_he: name_he||null, name_pt: name_pt||null, description });
    }
  );
});

app.put('/api/categories/:id', authenticateToken, (req, res) => {
  const { name, name_he, name_pt, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run(
    `UPDATE categories SET name=?, name_he=?, name_pt=?, description=?, updated_at=datetime('now') WHERE id=?`,
    [name, name_he||null, name_pt||null, description||null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'UPDATE_CATEGORY', 'category', req.params.id, { name });
      res.json({ message: 'updated' });
    }
  );
});

app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  // בדוק אם יש מוצרים מקושרים
  db.get('SELECT COUNT(*) as count FROM products WHERE category_id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) return res.status(400).json({ error: 'Cannot delete category with products' });
    db.run('DELETE FROM categories WHERE id=?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'DELETE_CATEGORY', 'category', req.params.id, {});
      res.json({ message: 'deleted' });
    });
  });
});

// ============ SUBCATEGORIES ROUTES ============

db.run(`CREATE TABLE IF NOT EXISTS subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_he TEXT,
  name_pt TEXT,
  updated_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
)`, () => {});
db.run(`ALTER TABLE subcategories ADD COLUMN updated_at TEXT`, () => {});

app.get('/api/subcategories', authenticateToken, (req, res) => {
  const { category_id } = req.query;
  const sql = category_id
    ? 'SELECT * FROM subcategories WHERE category_id=? ORDER BY name'
    : 'SELECT * FROM subcategories ORDER BY category_id, name';
  const params = category_id ? [category_id] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/subcategories', authenticateToken, (req, res) => {
  const { category_id, name, name_he, name_pt } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: 'category_id and name required' });
  db.run(
    `INSERT INTO subcategories (category_id, name, name_he, name_pt, updated_at) VALUES (?,?,?,?,datetime('now'))`,
    [category_id, name, name_he||null, name_pt||null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, category_id, name, name_he: name_he||null, name_pt: name_pt||null });
    }
  );
});

app.put('/api/subcategories/:id', authenticateToken, (req, res) => {
  const { name, name_he, name_pt } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run(
    `UPDATE subcategories SET name=?, name_he=?, name_pt=?, updated_at=datetime('now') WHERE id=?`,
    [name, name_he||null, name_pt||null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'updated' });
    }
  );
});

app.delete('/api/subcategories/:id', authenticateToken, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM products WHERE subcategory_id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row?.count > 0) return res.status(400).json({ error: 'Cannot delete subcategory with products' });
    db.run('DELETE FROM subcategories WHERE id=?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'deleted' });
    });
  });
});

app.get('/api/products', authenticateToken, (req, res) => {
  const query = `
    SELECT p.*, c.name as category_name, c.name_he as category_name_he, c.name_pt as category_name_pt,
           s.name as subcategory_name, s.name_he as subcategory_name_he, s.name_pt as subcategory_name_pt,
           sup.name as supplier_name, man.name as manufacturer_name
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN subcategories s ON p.subcategory_id = s.id
    LEFT JOIN suppliers sup ON p.supplier_id = sup.id
    LEFT JOIN manufacturers man ON p.manufacturer_id = man.id
    ORDER BY p.name
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/products/low-stock', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM products WHERE quantity <= min_quantity ORDER BY name',
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// פונקציית עזר לקריאה ל-Anthropic API
const callAnthropicAPI = (prompt) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || '{}';
          const clean = text.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(clean));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

// תרגום מוצרים קיימים שאין להם תרגום
app.post('/api/products/translate-existing', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  db.all('SELECT id, name FROM products WHERE name_he IS NULL OR name_pt IS NULL', [], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.json({ message: 'All products already translated', count: 0 });

    let count = 0;
    for (const product of rows) {
      try {
        const translations = await callAnthropicAPI(
          `Translate this product name to Hebrew and Portuguese. Return ONLY valid JSON:\n{"he": "Hebrew translation", "pt": "Portuguese translation"}\n\nProduct: ${product.name}`
        );
        await new Promise((resolve, reject) => {
          db.run('UPDATE products SET name_he = ?, name_pt = ? WHERE id = ?',
            [translations.he, translations.pt, product.id],
            (err) => err ? reject(err) : resolve()
          );
        });
        count++;
        // השהייה קטנה למניעת rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`Failed to translate product ${product.id}:`, e.message);
      }
    }
    res.json({ message: `Translated ${count} products`, count });
  });
});

// ============ PRODUCT TRANSLATION ============

app.post('/api/products/translate', authenticateToken, async (req, res) => {
  const { name, sourceLang = 'en' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const langNames = { he: 'Hebrew', en: 'English', pt: 'Portuguese' };
  const targets = ['he', 'en', 'pt'].filter(l => l !== sourceLang);
  const prompt = `Translate this product name from ${langNames[sourceLang]} to ${targets.map(l => langNames[l]).join(' and ')}. Return ONLY valid JSON with these exact keys: ${JSON.stringify(Object.fromEntries(targets.map(l => [l, '...'])))}\n\nProduct: ${name}`;

  try {
    const translations = await callAnthropicAPI(prompt);
    const result = { he: name, en: name, pt: name };
    targets.forEach(l => { if (translations[l]) result[l] = translations[l]; });
    res.json(result);
  } catch (err) {
    console.error('Translation error:', err);
    res.json({ he: name, en: name, pt: name });
  }
});

app.post('/api/products', authenticateToken, (req, res) => {
  const { sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id } = req.body;
  
  db.run(
    `INSERT INTO products (sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id, meta_updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [sku, name, description, category_id, subcategory_id||null, price, currency || 'ILS', unit, quantity || 0, min_quantity || 0, name_he || null, name_pt || null, supplier_id||null, manufacturer_id||null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'CREATE_PRODUCT', 'product', this.lastID, { sku, name });
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

// Price history endpoints
app.get('/api/products/:id/price-history', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM product_price_history WHERE product_id = ? ORDER BY effective_date DESC, created_at DESC`,
    [req.params.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/products/:id/price-history', authenticateToken, (req, res) => {
  const { price, currency, effective_date } = req.body;
  const createdBy = req.user.username || req.user.email;
  if (!price || !effective_date) return res.status(400).json({ error: 'price and effective_date required' });

  db.run(
    `INSERT INTO product_price_history (product_id, price, currency, effective_date, created_by) VALUES (?,?,?,?,?)`,
    [req.params.id, price, currency || 'ILS', effective_date, createdBy],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      // עדכן גם את המחיר הנוכחי במוצר
      db.run(`UPDATE products SET price = ?, currency = ? WHERE id = ?`, [price, currency || 'ILS', req.params.id]);
      res.json({ id: this.lastID, message: 'Price added' });
    }
  );
});

app.delete('/api/products/:id/price-history/:hid', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.run(`DELETE FROM product_price_history WHERE id = ? AND product_id = ?`,
    [req.params.hid, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Deleted' });
    }
  );
});

app.put('/api/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { sku, name, description, category_id, subcategory_id, price, currency, unit, quantity, min_quantity, name_he, name_pt, supplier_id, manufacturer_id } = req.body;
  
  db.run(
    `UPDATE products 
     SET sku = ?, name = ?, description = ?, category_id = ?, subcategory_id = ?, price = ?, currency = ?, unit = ?, quantity = ?, min_quantity = ?, name_he = ?, name_pt = ?, supplier_id = ?, manufacturer_id = ?, quantity_updated_at = datetime('now'), meta_updated_at = datetime('now')
     WHERE id = ?`,
    [sku, name, description, category_id, subcategory_id||null, price, currency || 'ILS', unit, quantity, min_quantity, name_he || null, name_pt || null, supplier_id||null, manufacturer_id||null, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      autoResolveStockAlerts(id);
      logActivity(req.user.id, 'UPDATE_PRODUCT', 'product', id, req.body);
      res.json({ message: 'Product updated' });
    }
  );
});

app.delete('/api/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM products WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    logActivity(req.user.id, 'DELETE_PRODUCT', 'product', id, {});
    res.json({ message: 'Product deleted' });
  });
});

// ============ SUPPLIERS ROUTES ============

// Email contacts endpoint
app.get('/api/email-contacts', authenticateToken, (req, res) => {
  const sql = "SELECT name, email, 'customer' as type FROM customers WHERE email IS NOT NULL AND email != '' UNION ALL SELECT name, email, 'supplier' as type FROM suppliers WHERE email IS NOT NULL AND email != '' ORDER BY name";
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/suppliers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM suppliers ORDER BY name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/suppliers', authenticateToken, (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  
  db.run(
    'INSERT INTO suppliers (name, address, phone, email, tax_id, notes, country, contact_person) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, address, phone, email, tax_id, notes, country, contact_person],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'CREATE_SUPPLIER', 'supplier', this.lastID, { name });
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/suppliers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  
  db.run(
    'UPDATE suppliers SET name = ?, address = ?, phone = ?, email = ?, tax_id = ?, notes = ?, country = ?, contact_person = ? WHERE id = ?',
    [name, address, phone, email, tax_id, notes, country, contact_person, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'UPDATE_SUPPLIER', 'supplier', id, req.body);
      res.json({ message: 'Supplier updated' });
    }
  );
});

app.delete('/api/suppliers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM suppliers WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    logActivity(req.user.id, 'DELETE_SUPPLIER', 'supplier', id, {});
    res.json({ message: 'Supplier deleted' });
  });
});

// ============ MANUFACTURERS ROUTES ============

app.get('/api/manufacturers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM manufacturers ORDER BY name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/manufacturers', authenticateToken, (req, res) => {
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  db.run(
    'INSERT INTO manufacturers (name, address, phone, email, tax_id, notes, country, contact_person) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, address, phone, email, tax_id, notes, country, contact_person],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'CREATE_MANUFACTURER', 'manufacturer', this.lastID, { name });
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/manufacturers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, address, phone, email, tax_id, notes, country, contact_person } = req.body;
  db.run(
    'UPDATE manufacturers SET name = ?, address = ?, phone = ?, email = ?, tax_id = ?, notes = ?, country = ?, contact_person = ? WHERE id = ?',
    [name, address, phone, email, tax_id, notes, country, contact_person, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'UPDATE_MANUFACTURER', 'manufacturer', id, req.body);
      res.json({ message: 'Manufacturer updated' });
    }
  );
});

app.delete('/api/manufacturers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM manufacturers WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logActivity(req.user.id, 'DELETE_MANUFACTURER', 'manufacturer', id, {});
    res.json({ message: 'Manufacturer deleted' });
  });
});

// ============ CUSTOMERS ROUTES ============

app.get('/api/customers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM customers ORDER BY name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/customers', authenticateToken, (req, res) => {
  const { name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes } = req.body;
  
  db.run(
    'INSERT INTO customers (name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, contact_person, address, phone, email, tax_id, country, is_sensitive || 0, notes],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'CREATE_CUSTOMER', 'customer', this.lastID, { name });
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, contact_person, address, phone, email, tax_id, country, is_sensitive, notes } = req.body;
  
  db.run(
    'UPDATE customers SET name = ?, contact_person = ?, address = ?, phone = ?, email = ?, tax_id = ?, country = ?, is_sensitive = ?, notes = ? WHERE id = ?',
    [name, contact_person, address, phone, email, tax_id, country, is_sensitive || 0, notes, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      logActivity(req.user.id, 'UPDATE_CUSTOMER', 'customer', id, req.body);
      res.json({ message: 'Customer updated' });
    }
  );
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM customers WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    logActivity(req.user.id, 'DELETE_CUSTOMER', 'customer', id, {});
    res.json({ message: 'Customer deleted' });
  });
});

// ============ INBOUND TRANSACTIONS (RECEIVING) ============

app.get('/api/inbound', authenticateToken, (req, res) => {
  const query = `
    SELECT it.*, s.name as supplier_name, COALESCE(it.username, u.username) as username
    FROM inbound_transactions it
    LEFT JOIN suppliers s ON it.supplier_id = s.id
    LEFT JOIN users u ON it.user_id = u.id
    ORDER BY it.transaction_date DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/inbound', authenticateToken, (req, res) => {
  const { supplier_id, supplier_type, casual_supplier_name, items, notes } = req.body;
  
  db.run(
    'INSERT INTO inbound_transactions (supplier_id, supplier_type, casual_supplier_name, notes, user_id, qr_code_id) VALUES (?, ?, ?, ?, ?, ?)',
    [supplier_id, supplier_type, casual_supplier_name, notes, req.user.id, req.body.qr_code_id || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const transactionId = this.lastID;
      
      // Insert items and update inventory
      const itemPromises = items.map(item => {
        return new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO inbound_items (transaction_id, product_id, quantity, notes) VALUES (?, ?, ?, ?)',
            [transactionId, item.product_id, item.quantity, item.notes],
            (err) => {
              if (err) return reject(err);
              
              // Update product quantity
              db.run(
                'UPDATE products SET quantity = quantity + ?, quantity_updated_at = datetime("now") WHERE id = ?',
                [item.quantity, item.product_id],
                (err) => {
                  if (err) return reject(err);
                  resolve();
                }
              );
            }
          );
        });
      });
      
      Promise.all(itemPromises)
        .then(() => {
          // Auto-resolve stock alerts for restocked products
          items.forEach(item => autoResolveStockAlerts(item.product_id));
          logActivity(req.user.id, 'CREATE_INBOUND', 'inbound', transactionId, { items: items.length });
          res.json({ id: transactionId, message: 'Inbound transaction created' });
        })
        .catch(err => {
          res.status(500).json({ error: err.message });
        });
    }
  );
});

// Get inbound transaction details (for editing)
app.get('/api/inbound/:id/details', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT it.*, s.name as supplier_name, u.username
    FROM inbound_transactions it
    LEFT JOIN suppliers s ON it.supplier_id = s.id
    LEFT JOIN users u ON it.user_id = u.id
    WHERE it.id = ?
  `;
  
  db.get(query, [id], (err, transaction) => {
    if (err || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT ii.*, p.sku, p.name, p.unit, p.quantity as available
      FROM inbound_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.transaction_id = ?
    `;
    
    db.all(itemsQuery, [id], (err, items) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ ...transaction, items });
    });
  });
});

// Update inbound transaction (Admin only)
app.put('/api/inbound/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { supplier_id, supplier_type, casual_supplier_name, items, notes } = req.body;
  
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Get old items to reverse inventory
  db.all('SELECT product_id, quantity FROM inbound_items WHERE transaction_id = ?', [id], (err, oldItems) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Update transaction
    db.run(
      'UPDATE inbound_transactions SET supplier_id = ?, supplier_type = ?, casual_supplier_name = ?, notes = ? WHERE id = ?',
      [supplier_id, supplier_type, casual_supplier_name || null, notes || null, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Delete old items and reverse inventory
        const reversePromises = oldItems.map(item => {
          return new Promise((resolve, reject) => {
            db.run(
              'UPDATE products SET quantity = quantity - ?, quantity_updated_at = datetime("now") WHERE id = ?',
              [item.quantity, item.product_id],
              (err) => {
                if (err) return reject(err);
                resolve();
              }
            );
          });
        });
        
        Promise.all(reversePromises)
          .then(() => {
            // Delete old items
            db.run('DELETE FROM inbound_items WHERE transaction_id = ?', [id], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              
              // Add new items
              const itemPromises = items.map((item) => {
                return new Promise((resolve, reject) => {
                  db.run(
                    'INSERT INTO inbound_items (transaction_id, product_id, quantity, notes) VALUES (?, ?, ?, ?)',
                    [id, item.product_id, item.quantity, item.notes || null],
                    (err) => {
                      if (err) return reject(err);
                      
                      // Update product quantity
                      db.run(
                        'UPDATE products SET quantity = quantity + ?, quantity_updated_at = datetime("now") WHERE id = ?',
                        [item.quantity, item.product_id],
                        (err) => {
                          if (err) return reject(err);
                          resolve();
                        }
                      );
                    }
                  );
                });
              });
              
              Promise.all(itemPromises)
                .then(() => {
                  // Auto-resolve stock alerts for restocked products
                  items.forEach(item => autoResolveStockAlerts(item.product_id));
                  logActivity(req.user.id, 'UPDATE_INBOUND', 'inbound', id, { items: items.length });
                  res.json({ id, message: 'Inbound transaction updated' });
                })
                .catch(err => {
                  res.status(500).json({ error: err.message });
                });
            });
          })
          .catch(err => {
            res.status(500).json({ error: err.message });
          });
      }
    );
  });
});

// ============ OUTBOUND TRANSACTIONS (SHIPPING) ============

app.get('/api/outbound', authenticateToken, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const sensitiveFilter = isAdmin ? '' : 'AND (c.is_sensitive IS NULL OR c.is_sensitive = 0)';
  const sql = `
    SELECT ot.*, c.name as customer_name, COALESCE(ot.username, u.username) as username
    FROM outbound_transactions ot
    LEFT JOIN customers c ON ot.customer_id = c.id
    LEFT JOIN users u ON ot.user_id = u.id
    WHERE 1=1 ${sensitiveFilter}
    ORDER BY ot.transaction_date DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/outbound', authenticateToken, (req, res) => {
  const { customer_id, customer_type, casual_customer_name, items, notes, status } = req.body;
  
  // First check if we have enough inventory
  const checkPromises = items.map(item => {
    return new Promise((resolve, reject) => {
      db.get('SELECT quantity FROM products WHERE id = ?', [item.product_id], (err, row) => {
        if (err) return reject(err);
        if (!row || row.quantity < item.quantity) {
          return reject(new Error(`Insufficient inventory for product ID ${item.product_id}`));
        }
        resolve();
      });
    });
  });
  
  Promise.all(checkPromises)
    .then(() => {
      db.run(
        'INSERT INTO outbound_transactions (customer_id, customer_type, casual_customer_name, notes, status, user_id, qr_code_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [customer_id, customer_type, casual_customer_name, notes, status || 'pending', req.user.id, req.body.qr_code_id || null],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const transactionId = this.lastID;
          
          // Insert items and update inventory
          const itemPromises = items.map(item => {
            return new Promise((resolve, reject) => {
              // Build insert query based on whether item has packaging
              let insertQuery, insertParams;
              
              if (item.use_packaging) {
                insertQuery = `INSERT INTO outbound_items (
                  transaction_id, product_id, quantity,
                  use_packaging, items_per_carton, carton_weight, num_cartons,
                  use_pallets, cartons_per_pallet, pallet_dimensions, pallet_weight, num_pallets
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                
                insertParams = [
                  transactionId, 
                  item.product_id, 
                  item.quantity,
                  item.use_packaging ? 1 : 0,
                  item.items_per_carton || null,
                  item.carton_weight || null,
                  item.num_cartons || null,
                  item.use_pallets ? 1 : 0,
                  item.cartons_per_pallet || null,
                  item.pallet_dimensions || null,
                  item.pallet_weight || null,
                  item.num_pallets || null
                ];
              } else {
                insertQuery = 'INSERT INTO outbound_items (transaction_id, product_id, quantity) VALUES (?, ?, ?)';
                insertParams = [transactionId, item.product_id, item.quantity];
              }
              
              db.run(insertQuery, insertParams, (err) => {
                if (err) return reject(err);
                
                // Update product quantity
                db.run(
                  'UPDATE products SET quantity = quantity - ?, quantity_updated_at = datetime("now") WHERE id = ?',
                  [item.quantity, item.product_id],
                  (err) => {
                    if (err) return reject(err);
                    resolve();
                  }
                );
              });
            });
          });
          
          Promise.all(itemPromises)
            .then(() => {
              logActivity(req.user.id, 'CREATE_OUTBOUND', 'outbound', transactionId, { items: items.length });
              res.json({ id: transactionId, message: 'Outbound transaction created' });
            })
            .catch(err => {
              res.status(500).json({ error: err.message });
            });
        }
      );
    })
    .catch(err => {
      res.status(400).json({ error: err.message });
    });
});

// Get outbound transaction details for delivery note
app.get('/api/outbound/:id/details', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      ot.*,
      c.name as customer_name, c.address as customer_address, 
      c.phone as customer_phone, c.email as customer_email, c.tax_id as customer_tax_id,
      u.username
    FROM outbound_transactions ot
    LEFT JOIN customers c ON ot.customer_id = c.id
    LEFT JOIN users u ON ot.user_id = u.id
    WHERE ot.id = ?
  `;
  
  db.get(query, [id], (err, transaction) => {
    if (err || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT oi.*, p.sku, p.name, p.unit
      FROM outbound_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.transaction_id = ?
    `;
    
    db.all(itemsQuery, [id], (err, items) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ ...transaction, items });
    });
  });
});

// Update outbound transaction (Admin only)
app.put('/api/outbound/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_type, casual_customer_name, items, notes, status } = req.body;
  
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Get old items to reverse inventory
  db.all('SELECT product_id, quantity FROM outbound_items WHERE transaction_id = ?', [id], (err, oldItems) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Update transaction
    db.run(
      'UPDATE outbound_transactions SET customer_id = ?, customer_type = ?, casual_customer_name = ?, status = ?, notes = ? WHERE id = ?',
      [customer_id, customer_type, casual_customer_name || null, status, notes || null, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Delete old items and reverse inventory (add back)
        const reversePromises = oldItems.map(item => {
          return new Promise((resolve, reject) => {
            db.run(
              'UPDATE products SET quantity = quantity + ?, quantity_updated_at = datetime("now") WHERE id = ?',
              [item.quantity, item.product_id],
              (err) => {
                if (err) return reject(err);
                resolve();
              }
            );
          });
        });
        
        Promise.all(reversePromises)
          .then(() => {
            // Delete old items
            db.run('DELETE FROM outbound_items WHERE transaction_id = ?', [id], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              
              // Validate stock for new items
              const stockChecks = items.map((item) => {
                return new Promise((resolve, reject) => {
                  db.get(
                    'SELECT quantity FROM products WHERE id = ?',
                    [item.product_id],
                    (err, product) => {
                      if (err) return reject(err);
                      if (!product || product.quantity < item.quantity) {
                        return reject(new Error('Insufficient stock'));
                      }
                      resolve();
                    }
                  );
                });
              });
              
              Promise.all(stockChecks)
                .then(() => {
                  // Add new items
                  const itemPromises = items.map((item) => {
                    return new Promise((resolve, reject) => {
                      db.run(
                        `INSERT INTO outbound_items (
                          transaction_id, product_id, quantity, 
                          use_packaging, items_per_carton, carton_weight, num_cartons,
                          use_pallets, cartons_per_pallet, pallet_dimensions, pallet_weight, num_pallets
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                          id, item.product_id, item.quantity,
                          item.use_packaging || 0,
                          item.items_per_carton || null,
                          item.carton_weight || null,
                          item.num_cartons || null,
                          item.use_pallets || 0,
                          item.cartons_per_pallet || null,
                          item.pallet_dimensions || null,
                          item.pallet_weight || null,
                          item.num_pallets || null
                        ],
                        (err) => {
                          if (err) return reject(err);
                          
                          // Update product quantity
                          db.run(
                            'UPDATE products SET quantity = quantity - ?, quantity_updated_at = datetime("now") WHERE id = ?',
                            [item.quantity, item.product_id],
                            (err) => {
                              if (err) return reject(err);
                              resolve();
                            }
                          );
                        }
                      );
                    });
                  });
                  
                  Promise.all(itemPromises)
                    .then(() => {
                      logActivity(req.user.id, 'UPDATE_OUTBOUND', 'outbound', id, { items: items.length });
                      res.json({ id, message: 'Outbound transaction updated' });
                    })
                    .catch(err => {
                      res.status(500).json({ error: err.message });
                    });
                })
                .catch(err => {
                  res.status(400).json({ error: err.message });
                });
            });
          })
          .catch(err => {
            res.status(500).json({ error: err.message });
          });
      }
    );
  });
});

// Delete inbound transaction (Admin only)
app.delete('/api/inbound/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Reverse inventory changes
  db.all(
    'SELECT product_id, quantity FROM inbound_items WHERE transaction_id = ?',
    [id],
    (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const updatePromises = items.map(item => {
        return new Promise((resolve, reject) => {
          db.run(
            'UPDATE products SET quantity = quantity - ?, quantity_updated_at = datetime("now") WHERE id = ?',
            [item.quantity, item.product_id],
            (err) => {
              if (err) return reject(err);
              resolve();
            }
          );
        });
      });
      
      Promise.all(updatePromises)
        .then(() => {
          db.run('DELETE FROM inbound_items WHERE transaction_id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.run('DELETE FROM inbound_transactions WHERE id = ?', [id], (err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              logActivity(req.user.id, 'DELETE_INBOUND', 'inbound', id, {});
              res.json({ message: 'Inbound transaction deleted' });
            });
          });
        })
        .catch(err => res.status(500).json({ error: err.message }));
    }
  );
});

// Delete outbound transaction (Admin only)
app.delete('/api/outbound/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Reverse inventory changes
  db.all(
    'SELECT product_id, quantity FROM outbound_items WHERE transaction_id = ?',
    [id],
    (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const updatePromises = items.map(item => {
        return new Promise((resolve, reject) => {
          db.run(
            'UPDATE products SET quantity = quantity + ?, quantity_updated_at = datetime("now") WHERE id = ?',
            [item.quantity, item.product_id],
            (err) => {
              if (err) return reject(err);
              resolve();
            }
          );
        });
      });
      
      Promise.all(updatePromises)
        .then(() => {
          db.run('DELETE FROM outbound_items WHERE transaction_id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.run('DELETE FROM outbound_transactions WHERE id = ?', [id], (err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              logActivity(req.user.id, 'DELETE_OUTBOUND', 'outbound', id, {});
              res.json({ message: 'Outbound transaction deleted' });
            });
          });
        })
        .catch(err => res.status(500).json({ error: err.message }));
    }
  );
});

// Helper: Build phone string from primary flags
const buildPhoneString = (company) => {
  const phones = [];
  if (company.phone && company.phone1_primary) phones.push(company.phone);
  if (company.phone2 && company.phone2_primary) phones.push(company.phone2);
  if (company.phone3 && company.phone3_primary) phones.push(company.phone3);
  return phones.length > 0 ? phones.join(', ') : (company.phone || 'N/A');
};

// Generate HTML delivery note (can be printed to PDF)
app.get('/api/outbound/:id/delivery-note', async (req, res) => {
  const { id } = req.params;
  const { lang = 'he', contact = '', token = '' } = req.query; // Get language and selected contact
  
  // Helper function to format date as DD/MM/YYYY
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  // Translation strings
  const translations = {
    he: {
      title: 'תעודת משלוח',
      documentNumber: 'מספר',
      date: 'תאריך',
      companyDetails: 'פרטי החברה',
      customerDetails: 'פרטי הלקוח',
      name: 'שם',
      address: 'כתובת',
      phone: 'טלפון',
      email: 'אימייל',
      contactPerson: 'איש קשר',
      taxId: 'ע.מ / ח.פ',
      status: 'סטטוס',
      items: 'פריטים',
      sku: 'מק"ט',
      productName: 'שם מוצר',
      quantity: 'כמות',
      notes: 'הערות',
      preparedBy: 'נערך על ידי',
      print: 'הדפס / שמור כ-PDF',
      close: 'סגור',
      sendEmail: 'שלח במייל',
      emailTo: 'כתובת מייל',
      emailSubject: 'נושא',
      emailBody: 'הודעה',
      emailSend: 'שלח',
      emailCancel: 'ביטול',
      emailSuccess: 'המייל נשלח בהצלחה!',
      emailError: 'שגיאה בשליחת המייל',
      emailSmtpMissing: 'יש להגדיר SMTP בהגדרות החברה',
      dir: 'rtl'
    },
    en: {
      title: 'Delivery Note',
      documentNumber: 'Number',
      date: 'Date',
      companyDetails: 'Company Details',
      customerDetails: 'Customer Details',
      name: 'Name',
      address: 'Address',
      phone: 'Phone',
      email: 'Email',
      contactPerson: 'Contact Person',
      taxId: 'Tax ID',
      status: 'Status',
      items: 'Items',
      sku: 'SKU',
      productName: 'Product Name',
      quantity: 'Quantity',
      notes: 'Notes',
      preparedBy: 'Prepared by',
      print: 'Print / Save as PDF',
      close: 'Close',
      sendEmail: 'Send by Email',
      emailTo: 'Email Address',
      emailSubject: 'Subject',
      emailBody: 'Message',
      emailSend: 'Send',
      emailCancel: 'Cancel',
      emailSuccess: 'Email sent successfully!',
      emailError: 'Error sending email',
      emailSmtpMissing: 'Please configure SMTP in company settings',
      dir: 'ltr'
    },
    pt: {
      title: 'Nota de Entrega',
      documentNumber: 'Número',
      date: 'Data',
      companyDetails: 'Detalhes da Empresa',
      customerDetails: 'Detalhes do Cliente',
      name: 'Nome',
      address: 'Endereço',
      phone: 'Telefone',
      email: 'E-mail',
      contactPerson: 'Pessoa de Contacto',
      taxId: 'NIF',
      status: 'Status',
      items: 'Itens',
      sku: 'SKU',
      productName: 'Nome do Produto',
      quantity: 'Quantidade',
      notes: 'Notas',
      preparedBy: 'Preparado por',
      print: 'Imprimir / Salvar como PDF',
      close: 'Fechar',
      sendEmail: 'Enviar por Email',
      emailTo: 'Endereço de Email',
      emailSubject: 'Assunto',
      emailBody: 'Mensagem',
      emailSend: 'Enviar',
      emailCancel: 'Cancelar',
      emailSuccess: 'Email enviado com sucesso!',
      emailError: 'Erro ao enviar email',
      emailSmtpMissing: 'Configure o SMTP nas configurações da empresa',
      dir: 'ltr'
    }
  };
  
  const t = translations[lang] || translations.he;
  
  try {
    // Get transaction details
    const transaction = await new Promise((resolve, reject) => {
      const query = `
        SELECT ot.*, c.name as customer_name, c.address as customer_address, 
               c.phone as customer_phone, c.email as customer_email,
               c.contact_person as customer_contact,
               u.username,
               qr.image_url as qr_image_url, qr.qr_data as qr_data
        FROM outbound_transactions ot
        LEFT JOIN customers c ON ot.customer_id = c.id
        LEFT JOIN users u ON ot.user_id = u.id
        LEFT JOIN qr_codes qr ON ot.qr_code_id = qr.id
        WHERE ot.id = ?
      `;
      db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // Get items
    const items = await new Promise((resolve, reject) => {
      const query = `
        SELECT oi.*, p.name, p.name_he, p.name_pt, p.sku
        FROM outbound_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.transaction_id = ?
      `;
      db.all(query, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get company info
    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });
    
    // Build logo HTML - positioned top-left
    let logoHtml = '';
    if (company.logo_path) {
      try {
        const logoFullPath = path.join(__dirname, company.logo_path.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(logoFullPath)) {
          const logoData = fs.readFileSync(logoFullPath);
          const ext = path.extname(logoFullPath).toLowerCase().replace('.', '');
          const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
          const b64 = logoData.toString('base64');
          logoHtml = `<div style="text-align: left; margin-bottom: 20px; position: relative; z-index: 1;">
            <img src="data:${mime};base64,${b64}" alt="Company Logo" style="max-height: 120px; max-width: 300px; object-fit: contain;">
          </div>`;
        }
      } catch(e) { logoHtml = ''; }
    }
    
    // Build QR HTML - positioned top-right (RTL-safe)
    const qrImgHtml = transaction.qr_image_url
      ? `<img src="${transaction.qr_image_url}" alt="QR Code" style="width: 55px; height: 55px; display: block; ${t.dir === 'rtl' ? 'margin-right: auto;' : 'margin-left: auto;'}">`
      : '';

    // Generate HTML for delivery note
    const html = `
<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} #${id}</title>
  <style>
    * { box-sizing: border-box; }
    body > *:first-child { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
    body::before { display: none !important; }
    hr:first-of-type { display: none !important; }
    @media print {
      .no-print { display: none; }
      .doc-footer { display: block !important; }
      @page { margin: 1.5cm 2cm; size: A4; }
      th {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
    }
    .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .btn-print, .btn-email, .btn-close {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print { background: #3498db; color: white; }
    .btn-print:hover { background: #2980b9; }
    .btn-email { background: #27ae60; color: white; }
    .btn-email:hover { background: #229954; }
    .btn-close { background: #95a5a6; color: white; }
    .btn-close:hover { background: #7f8c8d; }
    .doc-footer {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #ddd;
      padding: 6px 0;
      text-align: center;
      font-size: 8pt;
      color: #888;
      background: white;
    }
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
      background: white;
      border-top: none;
    }
    .header {
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 10px 0 0 0;
      color: #333;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .info-box {
      flex: 1;
      margin: 0 10px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    .info-box h3 {
      margin-top: 0;
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: ${t.dir === 'rtl' ? 'right' : 'left'};
    }
    th {
      background-color: #3498db;
      color: white;
      text-align: center;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ddd;
      text-align: center;
      color: #7f8c8d;
    }
    .email-modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 99999;
      justify-content: center;
      align-items: center;
    }
    .email-modal-overlay.open { display: flex !important; }
    .email-modal, .email-modal-box {
      background: white;
      border-radius: 10px;
      padding: 2rem;
      width: 420px;
      max-width: 95vw;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      direction: ${t.dir};
    }
    .email-modal h3, .email-modal-box h3 { margin: 0 0 1.2rem; font-size: 1.2rem; }
    .ac-wrap { position: relative !important; margin-bottom: 1rem; overflow: visible !important; }
    .ac-wrap input { width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; font-size: 0.95rem; font-family: inherit; }
    .ac-list { position: fixed !important; background: white !important; border: 1px solid #ccc; border-radius: 8px; max-height: 220px; overflow-y: auto; z-index: 999999 !important; box-shadow: 0 6px 16px rgba(0,0,0,0.2); display: none; min-width: 300px; }
    .ac-item { padding: 0.5rem 0.85rem; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: block; }
    .ac-item:hover, .ac-item.ac-active { background: #e8f4fd; }
    .ac-name { display: block; font-weight: 600; color: #222; font-size: 0.88rem; }
    .ac-email { display: block; color: #777; font-size: 0.8rem; margin-top: 1px; }
    .email-modal label, .email-modal-box label { display: block; font-weight: 600; margin-bottom: 0.3rem; font-size: 0.9rem; }
    .email-modal input, .email-modal textarea, .email-modal-box input, .email-modal-box textarea {
      width: 100%; padding: 0.6rem; border: 1px solid #ddd;
      border-radius: 5px; font-size: 0.95rem; margin-bottom: 1rem;
      box-sizing: border-box; font-family: inherit;
    }
    .email-modal textarea, .email-modal-box textarea { height: 80px; resize: vertical; }
    .email-modal-footer { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; }
    .email-modal-footer button { padding: 0.6rem 1.4rem; border: none; border-radius: 5px; cursor: pointer; font-size: 0.95rem; }
    .btn-modal-send { background: #27ae60; color: white; }
    .btn-modal-cancel { background: #95a5a6; color: white; }
    #email-status { margin-top: 0.5rem; font-size: 0.9rem; min-height: 1.2rem; }
  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${t.print}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${t.sendEmail}</button>
    <button class="btn-close" onclick="window.close()">❌ ${t.close}</button>
  </div>

  <script>
  window._authToken = '${token}';
  var _ac = [];
  var _acIdx = -1;
  (function loadContacts() {
    var tok = (window._authToken || localStorage.getItem('token') || '');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try { _ac = JSON.parse(xhr.responseText); } catch(e) {}
      }
    };
    xhr.send();
  })();

  function acFilter(val) {
    var box = document.getElementById('acList');
    _acIdx = -1;
    if (!val) { box.style.display = 'none'; return; }
    var q = val.toLowerCase();
    // פצל לקוחות עם כמה מיילים לפריטים נפרדים
    var expanded = [];
    for (var j = 0; j < _ac.length; j++) {
      var c = _ac[j];
      if (!c.email) continue;
      var emails = c.email.split(/[;,]/).map(function(e){ return e.trim(); }).filter(Boolean);
      for (var k = 0; k < emails.length; k++) {
        expanded.push({ name: c.name, email: emails[k], type: c.type });
      }
    }
    var matches = expanded.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 10);
    if (!matches.length) { box.style.display = 'none'; return; }
    var html = '';
    for (var i = 0; i < matches.length; i++) {
      var c = matches[i];
      html += '<div class="ac-item" data-email="' + c.email.replace(/"/g, '&quot;') + '" data-i="' + i + '"' +
        ' onmousedown="acSelect(this.dataset.email)">' +
        '<span class="ac-name">' + c.name + '</span>' +
        '<span class="ac-email">' + c.email + '</span>' +
        '</div>';
    }
    box.innerHTML = html;
    var inp = document.getElementById('emailTo');
    var rect = inp.getBoundingClientRect();
    box.style.top = (rect.bottom + 2) + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.display = 'block';
  }

  function acSelect(email) {
    document.getElementById('emailTo').value = email;
    document.getElementById('acList').style.display = 'none';
  }

  function acKey(e) {
    var box = document.getElementById('acList');
    var items = box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { _acIdx = Math.min(_acIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { _acIdx = Math.max(_acIdx - 1, 0); }
    else if (e.key === 'Enter' && _acIdx >= 0) {
      e.preventDefault();
      acSelect(items[_acIdx].getAttribute('data-email'));
      return;
    } else return;
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === _acIdx ? '#e8f4fd' : '';
    }
    items[_acIdx].scrollIntoView({ block: 'nearest' });
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
    const token = window._authToken || localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
      const res = await fetch('/api/send-email', {
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

  <table style="width: 100%; border: none; margin-bottom: 20px;">
    <tr>
      <td style="vertical-align: middle; border: none; padding: 0;">
        ${logoHtml ? logoHtml.replace('<div style="text-align: left; margin-bottom: 20px; position: relative; z-index: 1;">', '<div>') : ''}
        <div>
          <h1 style="margin: 4px 0; font-size: 28px; font-weight: bold;">${t.title}</h1>
          <p style="margin: 0; font-size: 16px; color: #555;">${t.documentNumber}: ${id} | ${t.date}: ${formatDate(transaction.transaction_date)}</p>
        </div>
      </td>
      <td style="vertical-align: top; text-align: ${t.dir === 'rtl' ? 'left' : 'right'}; border: none; padding: 0; width: 70px;">
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
      <tr>
        <th>#</th>
        <th>${t.sku}</th>
        <th>${t.productName}</th>
        <th>${t.quantity}</th>
        <th>${lang === 'he' ? 'אריזה' : 'Packaging'}</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, index) => {
        let packagingInfo = '';
        
        if (item.use_packaging && item.items_per_carton) {
          const cartonsText = lang === 'he' ? 'קרטונים' : 'cartons';
          const perCartonText = lang === 'he' ? 'יח\' לקרטון' : 'items/carton';
          const kgText = lang === 'he' ? 'ק"ג' : 'kg';
          
          packagingInfo = `${item.num_cartons} ${cartonsText} (${item.items_per_carton} ${perCartonText})`;
          
          if (item.carton_weight) {
            packagingInfo += `<br><small>${item.carton_weight} ${kgText}/${lang === 'he' ? 'קרטון' : 'carton'}</small>`;
          }
          
          if (item.use_pallets && item.num_pallets) {
            const palletsText = lang === 'he' ? 'משטחים' : 'pallets';
            packagingInfo += `<br><strong>${item.num_pallets} ${palletsText}</strong>`;
            
            if (item.pallet_dimensions) {
              packagingInfo += `<br><small>${item.pallet_dimensions} cm</small>`;
            }
          }
        } else {
          packagingInfo = '-';
        }
        
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${item.sku}</td>
            <td>${lang === "he" && item.name_he ? item.name_he : lang === "pt" && item.name_pt ? item.name_pt : item.name}</td>
            <td><strong>${item.quantity}</strong></td>
            <td>${packagingInfo}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
    ${(() => {
      // Calculate total weight
      const totalWeight = items.reduce((sum, item) => {
        if (item.use_packaging && item.num_cartons && item.carton_weight) {
          return sum + (item.num_cartons * item.carton_weight);
        }
        return sum;
      }, 0);
      
      if (totalWeight > 0) {
        const kgText = lang === 'he' ? 'ק"ג' : 'kg';
        const totalWeightText = lang === 'he' ? 'משקל כולל' : 'Total Weight';
        return `
          <tfoot>
            <tr style="background-color: #ecf0f1; font-weight: bold;">
              <td colspan="4" style="text-align: ${lang === 'he' ? 'right' : 'left'};">${totalWeightText}:</td>
              <td><strong>${totalWeight.toFixed(2)} ${kgText}</strong></td>
            </tr>
          </tfoot>
        `;
      }
      return '';
    })()}
  </table>

  ${transaction.notes ? `
    <div class="info-box">
      <h3>${t.notes}</h3>
      <p>${transaction.notes}</p>
    </div>
  ` : ''}

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
        oninput="acFilter(this.value)"
        onfocus="acFilter(this.value)"
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
  <div class="doc-footer">
    ${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}
  </div>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  saveDocument('delivery', id, html, lang, req.user?.id || null, transaction.customer_type === 'casual' ? transaction.casual_customer_name : transaction.customer_name);
    res.send(html);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ACTIVITY LOG ============

app.get('/api/activity-log', authenticateToken, (req, res) => {
  const { limit = 100 } = req.query;
  
  const query = `
    SELECT al.*, u.username
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC
    LIMIT ?
  `;
  
  db.all(query, [parseInt(limit)], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Delete single activity log entry (Admin only)
app.delete('/api/activity-log/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  db.run('DELETE FROM activity_log WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Activity deleted', changes: this.changes });
  });
});

// Delete all activity log entries (Admin only)
app.delete('/api/activity-log', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  db.run('DELETE FROM activity_log', [], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'All activities deleted', changes: this.changes });
  });
});

// ============ REPORTS ============

app.get('/api/reports/inventory', authenticateToken, (req, res) => {
  const query = `
    SELECT p.*, c.name as category_name, c.name_he as category_name_he, c.name_pt as category_name_pt,
      CASE 
        WHEN p.quantity <= p.min_quantity THEN 'low'
        ELSE 'normal'
      END as stock_status
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/reports/outbound', authenticateToken, (req, res) => {
  const { start_date, end_date } = req.query;
  
  let query = `
    SELECT ot.*, c.name as customer_name, u.username,
      (SELECT COUNT(*) FROM outbound_items WHERE transaction_id = ot.id) as item_count
    FROM outbound_transactions ot
    LEFT JOIN customers c ON ot.customer_id = c.id
    LEFT JOIN users u ON ot.user_id = u.id
  `;
  
  const params = [];
  if (start_date && end_date) {
    query += ' WHERE DATE(ot.transaction_date) BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  
  query += ' ORDER BY ot.transaction_date DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ============ DASHBOARD STATS ============

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const stats = {};
  
  // Total products
  db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
    stats.totalProducts = row ? row.count : 0;
    
    // Low stock products
    db.get('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity', [], (err, row) => {
      stats.lowStockProducts = row ? row.count : 0;
      
      // Total customers
      db.get('SELECT COUNT(*) as count FROM customers', [], (err, row) => {
        stats.totalCustomers = row ? row.count : 0;
        
        // Total suppliers
        db.get('SELECT COUNT(*) as count FROM suppliers', [], (err, row) => {
          stats.totalSuppliers = row ? row.count : 0;
          
          // Total Inbound & Outbound
          db.get('SELECT COUNT(*) as count FROM inbound_transactions', [], (err, row) => {
            stats.totalInbound = row ? row.count : 0;
            db.get('SELECT COUNT(*) as count FROM outbound_transactions', [], (err, row) => {
              stats.totalOutbound = row ? row.count : 0;
              res.json(stats);
            });
          });
        });
      });
    });
  });
});

// Inbound Receipt Note
app.get('/api/inbound/:id/receipt-note', async (req, res) => {
  const { id } = req.params;
  const { lang = 'he', contact = '', token = '' } = req.query;
  
  // Helper function to format date as DD/MM/YYYY
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  const translations = {
    he: {
      title: 'תעודת קליטה',
      documentNumber: 'מספר',
      date: 'תאריך',
      companyDetails: 'פרטי החברה',
      supplierDetails: 'פרטי הספק',
      name: 'שם',
      address: 'כתובת',
      phone: 'טלפון',
      email: 'אימייל',
      contactPerson: 'איש קשר',
      taxId: 'ע.מ / ח.פ',
      items: 'פריטים',
      sku: 'מק"ט',
      productName: 'שם מוצר',
      quantity: 'כמות',
      notes: 'הערות',
      receivedBy: 'התקבל ע"י',
      dir: 'rtl'
    },
    en: {
      title: 'Receipt Note',
      documentNumber: 'Number',
      date: 'Date',
      companyDetails: 'Company Details',
      supplierDetails: 'Supplier Details',
      name: 'Name',
      address: 'Address',
      phone: 'Phone',
      email: 'Email',
      contactPerson: 'Contact Person',
      taxId: 'Tax ID',
      items: 'Items',
      sku: 'SKU',
      productName: 'Product Name',
      quantity: 'Quantity',
      notes: 'Notes',
      receivedBy: 'Received by',
      dir: 'ltr'
    },
    pt: {
      title: 'Nota de Recebimento',
      documentNumber: 'Número',
      date: 'Data',
      companyDetails: 'Detalhes da Empresa',
      supplierDetails: 'Detalhes do Fornecedor',
      name: 'Nome',
      address: 'Endereço',
      phone: 'Telefone',
      email: 'E-mail',
      contactPerson: 'Pessoa de Contacto',
      taxId: 'NIF',
      items: 'Itens',
      sku: 'SKU',
      productName: 'Nome do Produto',
      quantity: 'Quantidade',
      notes: 'Notas',
      receivedBy: 'Recebido por',
      dir: 'ltr'
    }
  };
  
  const t = translations[lang] || translations.he;
  
  try {
    const transaction = await new Promise((resolve, reject) => {
      const query = `
        SELECT it.*, s.name as supplier_name, s.address as supplier_address,
               s.phone as supplier_phone, s.email as supplier_email,
               s.contact_person as supplier_contact,
               u.username,
               qr.image_url as qr_image_url, qr.qr_data as qr_data
        FROM inbound_transactions it
        LEFT JOIN suppliers s ON it.supplier_id = s.id
        LEFT JOIN users u ON it.user_id = u.id
        LEFT JOIN qr_codes qr ON it.qr_code_id = qr.id
        WHERE it.id = ?
      `;
      db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const items = await new Promise((resolve, reject) => {
      const query = `
        SELECT ii.*, p.name, p.name_he, p.name_pt, p.sku
        FROM inbound_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.transaction_id = ?
      `;
      db.all(query, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });
    
    const logoHtml = company.logo_path ?
      `<img src="http://localhost:3001${company.logo_path}" alt="Logo" style="max-height: 120px; max-width: 300px; margin-right: 20px;">` :
      '';

    const qrImgHtml = transaction.qr_image_url
      ? `<img src="${transaction.qr_image_url}" alt="QR Code" style="width: 55px; height: 55px; display: block; ${t.dir === 'rtl' ? 'margin-right: auto;' : 'margin-left: auto;'}">`
      : '';
    
    const html = `
<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} #${id}</title>
  <style>
    * { box-sizing: border-box; }
    body > *:first-child { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
    body::before { display: none !important; }
    hr:first-of-type { display: none !important; }
    @media print {
      .no-print { display: none; }
      @page {
        margin: 1.5cm 2cm;
        size: A4;
      }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-footer { display: block !important; }
    }
    .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .btn-print, .btn-email, .btn-close {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print { background: #3498db; color: white; }
    .btn-print:hover { background: #2980b9; }
    .btn-email { background: #27ae60; color: white; }
    .btn-email:hover { background: #229954; }
    .btn-close { background: #95a5a6; color: white; }
    .btn-close:hover { background: #7f8c8d; }
    .doc-footer {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #ddd;
      padding: 6px 0;
      text-align: center;
      font-size: 8pt;
      color: #888;
      background: white;
    }
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; border-top: none; }
    .header-container { display: flex; align-items: center; margin-bottom: 20px; border-top: none !important; padding-top: 0; }
    .header { flex: 1; text-align: left; }
    h1 { color: #2c3e50; margin: 0 0 10px 0; font-size: 24px; }
    .info-section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #3498db; color: white; padding: 12px; text-align: ${t.dir === 'rtl' ? 'right' : 'left'}; }
    td { padding: 10px; border-bottom: 1px solid #ddd; text-align: ${t.dir === 'rtl' ? 'right' : 'left'}; }
    .total { font-weight: bold; background: #f0f0f0; }

    .email-modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:9999; justify-content:center; align-items:center; }
    .email-modal-overlay.open { display:flex !important; }
    .email-modal-box { background:white; border-radius:10px; padding:1.5rem; width:420px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); }
    .email-modal-box label { display:block; font-weight:600; font-size:0.9rem; margin-bottom:0.3rem; }
    .email-modal-box input, .email-modal-box textarea { width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:5px; margin-bottom:0.8rem; box-sizing:border-box; font-size:0.9rem; }
    .email-modal-box textarea { height:70px; }
    .email-modal { background:white; border-radius:10px; padding:1.5rem; width:400px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); }
    .email-modal h3 { margin:0 0 1rem; }
    .email-modal input, .email-modal textarea { width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:5px; margin-bottom:0.8rem; box-sizing:border-box; font-family:inherit; }
    .email-modal textarea { height:70px; resize:vertical; }
    #email-status { font-size:0.9rem; min-height:1.2rem; margin-bottom:0.5rem; }

  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${lang==='he'?'הדפס / שמור כ-PDF':lang==='en'?'Print / Save as PDF':'Imprimir / Salvar como PDF'}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${lang==='he'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</button>
    <button class="btn-close" onclick="window.close()">❌ ${lang==='he'?'סגור':lang==='en'?'Close':'Fechar'}</button>
  </div>

  <table style="width: 100%; border: none; margin-bottom: 20px;">
    <tr>
      <td style="vertical-align: middle; border: none; padding: 0;">
        ${logoHtml}
        <div>
          <h1 style="margin: 4px 0;">${t.title}</h1>
          <p style="margin: 0;">${t.documentNumber}: ${id} | ${t.date}: ${formatDate(transaction.transaction_date)}</p>
        </div>
      </td>
      <td style="vertical-align: top; text-align: ${t.dir === 'rtl' ? 'left' : 'right'}; border: none; padding: 0; width: 70px;">
        ${qrImgHtml}
      </td>
    </tr>
  </table>
  
  <div class="info-section">
    <h3>${t.supplierDetails}</h3>
    <p><strong>${t.name}:</strong> ${transaction.supplier_name || '-'}</p>
    ${!contact && transaction.supplier_phone ? `<p><strong>${t.phone}:</strong> ${transaction.supplier_phone}</p>` : (!contact ? `<p><strong>${t.phone}:</strong> -</p>` : '')}
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
      <tr>
        <th>${t.sku}</th>
        <th>${t.productName}</th>
        <th>${t.quantity}</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
        <tr>
          <td>${item.sku}</td>
          <td>${lang === 'he' && item.name_he ? item.name_he : lang === 'pt' && item.name_pt ? item.name_pt : item.name}</td>
          <td>${item.quantity}</td>
        </tr>
      `).join('')}
      <tr class="total">
        <td colspan="2">${t.dir === 'rtl' ? 'סה"כ פריטים' : 'Total Items'}</td>
        <td>${items.reduce((sum, item) => sum + item.quantity, 0)}</td>
      </tr>
    </tbody>
  </table>
  
  ${transaction.notes ? `<div class="info-section"><strong>${t.notes}:</strong> ${transaction.notes}</div>` : ''}
  
  <p style="margin-top: 30px;"><strong>${t.receivedBy}:</strong> ${transaction.username}</p>

  <div class="email-modal-overlay no-print" id="emailModal">
    <div class="email-modal-box">
      <h3>✉️ ${t.dir==='rtl'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</h3>
      <label style="font-weight:600;font-size:0.9rem">${t.dir==='rtl'?'כתובת מייל':lang==='en'?'Email Address':'Endereço de Email'}</label>
      <div class="ac-wrap">
      <input type="text" id="emailTo" placeholder="example@domain.com" autocomplete="off"
        oninput="acFilter(this.value)"
        onfocus="acFilter(this.value)"
        onblur="setTimeout(function(){var b=document.getElementById('acList');if(b)b.style.display='none'},200)"
        onkeydown="acKey(event)">
      <div id="acList" class="ac-list"></div>
    </div>
      <label style="font-weight:600;font-size:0.9rem">${t.dir==='rtl'?'נושא':lang==='en'?'Subject':'Assunto'}</label>
      <input type="text" id="emailSubject" value="${t.dir==='rtl'?'נושא':lang==='en'?'Subject':'Assunto'}">
      <label style="font-weight:600;font-size:0.9rem">${t.dir==='rtl'?'הודעה':lang==='en'?'Message':'Mensagem'}</label>
      <textarea id="emailBody">${t.dir==='rtl'?'הודעה':lang==='en'?'Message':'Mensagem'}</textarea>
      <div id="email-status"></div>
      <div style="display:flex;gap:0.75rem;justify-content:flex-end">
        <button onclick="document.getElementById('emailModal').classList.remove('open')" style="padding:0.5rem 1rem;background:#95a5a6;color:white;border:none;border-radius:5px;cursor:pointer">${t.dir==='rtl'?'ביטול':lang==='en'?'Cancel':'Cancelar'}</button>
        <button onclick="sendDocumentEmail()" style="padding:0.5rem 1rem;background:#27ae60;color:white;border:none;border-radius:5px;cursor:pointer">📤 ${t.dir==='rtl'?'שלח':lang==='en'?'Send':'Enviar'}</button>
      </div>
    </div>
  </div>
  <script>
  window._authToken = '${token}';
  var _ac = [];
  var _acIdx = -1;
  (function loadContacts() {
    var tok = (window._authToken || localStorage.getItem('token') || '');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try { _ac = JSON.parse(xhr.responseText); } catch(e) {}
      }
    };
    xhr.send();
  })();

  function acFilter(val) {
    var box = document.getElementById('acList');
    _acIdx = -1;
    if (!val) { box.style.display = 'none'; return; }
    var q = val.toLowerCase();
    // פצל לקוחות עם כמה מיילים לפריטים נפרדים
    var expanded = [];
    for (var j = 0; j < _ac.length; j++) {
      var c = _ac[j];
      if (!c.email) continue;
      var emails = c.email.split(/[;,]/).map(function(e){ return e.trim(); }).filter(Boolean);
      for (var k = 0; k < emails.length; k++) {
        expanded.push({ name: c.name, email: emails[k], type: c.type });
      }
    }
    var matches = expanded.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 10);
    if (!matches.length) { box.style.display = 'none'; return; }
    var html = '';
    for (var i = 0; i < matches.length; i++) {
      var c = matches[i];
      html += '<div class="ac-item" data-email="' + c.email.replace(/"/g, '&quot;') + '" data-i="' + i + '"' +
        ' onmousedown="acSelect(this.dataset.email)">' +
        '<span class="ac-name">' + c.name + '</span>' +
        '<span class="ac-email">' + c.email + '</span>' +
        '</div>';
    }
    box.innerHTML = html;
    var inp = document.getElementById('emailTo');
    var rect = inp.getBoundingClientRect();
    box.style.top = (rect.bottom + 2) + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.display = 'block';
  }

  function acSelect(email) {
    document.getElementById('emailTo').value = email;
    document.getElementById('acList').style.display = 'none';
  }

  function acKey(e) {
    var box = document.getElementById('acList');
    var items = box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { _acIdx = Math.min(_acIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { _acIdx = Math.max(_acIdx - 1, 0); }
    else if (e.key === 'Enter' && _acIdx >= 0) {
      e.preventDefault();
      acSelect(items[_acIdx].getAttribute('data-email'));
      return;
    } else return;
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === _acIdx ? '#e8f4fd' : '';
    }
    items[_acIdx].scrollIntoView({ block: 'nearest' });
  }

  window._docType = 'inbound';
  window._docId = '${id}';
  window._docLang = '${lang}';
  window._docContact = '${contact}';
  
  async function sendDocumentEmail() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;
    const status = document.getElementById('email-status');
    if (!to) { status.style.color='red'; status.textContent='נא הכנס כתובת מייל'; return; }
    status.style.color='#555'; status.textContent='⏳ שולח...';
    const token = window._authToken || localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
      const res = await fetch('/api/send-email', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({ to, subject, body, docType: window._docType, docId: window._docId, docLang: window._docLang, lcNumber: window._lcNumber, docContact: window._docContact })
      });
      const data = await res.json();
      if (res.ok) {
        status.style.color='green'; 
        const lang = window._docLang || 'en';
        status.textContent='✅ ' + (lang==='en'?'Email sent successfully!':lang==='pt'?'Email enviado com sucesso!':'המייל נשלח בהצלחה!');
        setTimeout(()=>document.getElementById('emailModal').classList.remove('open'), 3000);
      } else {
        status.style.color='red';
        status.textContent = data.error?.includes('SMTP') ? '⚠️ יש להגדיר SMTP בהגדרות החברה' : '❌ '+data.error;
      }
    } catch(e) { 
      console.error('Email send error:', e);
      status.style.color='red'; 
      status.textContent='❌ שגיאה: ' + (e.message || 'שגיאה בשליחה'); 
    }
  }
  </script>
  <div class="doc-footer">
    ${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}
  </div>
</body>
</html>
    `;
    
  saveDocument('receipt', id, html, lang, req.user?.id || null, transaction.supplier_name || transaction.casual_supplier_name);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUOTES API ====================

// Get all quotes
app.delete('/api/quotes/:id/stages/8/costs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  
  // Delete both stage 8 and stage 9
  db.run(`DELETE FROM quote_stages WHERE quote_id = ? AND stage_number IN (8, 9)`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Reset quote status to approved
    db.run(`UPDATE quotes SET status = 'approved' WHERE id = ?`, [id], () => {
      db.get('SELECT parent_id FROM quotes WHERE id = ?', [id], (e, row) => {
        const parentId = row?.parent_id || id;
        db.run(`UPDATE quotes SET status = 'approved' WHERE parent_id = ? OR id = ?`, [parentId, parentId], () => {});
      });
    });
    
    res.json({ message: 'Stage 8 and 9 deleted, quote reopened' });
  });
});

// Sales report - deal profitability
app.get('/api/quotes/closed-deals', authenticateToken, (req, res) => {
  db.all(`
    SELECT q.id, q.total, q.currency, q.created_at,
           c.name as customer_name,
           qs.approved_at as closed_at
    FROM quotes q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN quote_stages qs ON q.id = qs.quote_id AND qs.stage_number = 8
    WHERE q.status = 'closed' AND q.parent_id IS NULL
    ORDER BY qs.approved_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/quotes/:id/profitability', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT q.*, c.name as customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = ?`, [id], (err, quote) => {
    if (err || !quote) return res.status(404).json({ error: 'Not found' });

    db.all(`
      SELECT qi.*, p.price as purchase_price, p.currency as purchase_currency
      FROM quote_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quote_id = ?
    `, [id], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.get(`SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 8`, [id], (err3, stage8) => {
        // חישוב עלות מוצרים (מחיר קנייה × כמות)
        const productCost = items.reduce((sum, item) => {
          return sum + ((item.purchase_price || 0) * item.quantity);
        }, 0);

        // עלויות שלב 8 (כבר במטבע ראשי)
        const s8 = stage8 || {};
        const costCustoms = (s8.cost_customs || 0) / (s8.cost_customs_rate || 1);
        const costBank    = (s8.cost_bank || 0) / (s8.cost_bank_rate || 1);
        const costShipping= (s8.cost_shipping || 0) / (s8.cost_shipping_rate || 1);
        const costOther   = (s8.cost_other || 0) / (s8.cost_other_rate || 1);
        const additionalCosts = costCustoms + costBank + costShipping + costOther;

        const totalSale = quote.total || 0;
        const totalCosts = productCost + additionalCosts;
        const netProfit = totalSale - totalCosts;
        const profitPct = totalSale > 0 ? Math.round((netProfit / totalSale) * 100) : 0;

        res.json({
          quote,
          items: items.map(i => ({
            ...i,
            cost_total: (i.purchase_price || 0) * i.quantity
          })),
          productCost,
          additionalCosts: {
            customs: s8.cost_customs || 0, customs_currency: s8.cost_customs_currency || s8.cost_base_currency || quote.currency,
            bank: s8.cost_bank || 0, bank_currency: s8.cost_bank_currency || s8.cost_base_currency || quote.currency,
            shipping: s8.cost_shipping || 0, shipping_currency: s8.cost_shipping_currency || s8.cost_base_currency || quote.currency,
            other: s8.cost_other || 0, other_currency: s8.cost_other_currency || s8.cost_base_currency || quote.currency,
            base_currency: s8.cost_base_currency || quote.currency,
            total: additionalCosts,
          },
          totalSale, totalCosts, netProfit, profitPct,
          currency: quote.currency,
        });
      });
    });
  });
});

// Sales report - customer sales analysis (closed deals only)
app.get('/api/quotes/customers-summary', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      c.id,
      c.name as customer_name,
      c.country,
      COUNT(DISTINCT q.id) as deal_count,
      SUM(q.total) as total_amount,
      q.currency
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    WHERE q.parent_id IS NULL AND q.status = 'closed'
    GROUP BY c.id, q.currency
    ORDER BY total_amount DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // קבץ לפי לקוח
    var byCustomer = {};
    rows.forEach(function(r) {
      if (!byCustomer[r.id]) {
        byCustomer[r.id] = { id: r.id, customer_name: r.customer_name, country: r.country || '-', total: 0, deals: 0, currencies: [] };
      }
      byCustomer[r.id].total += r.total_amount || 0;
      byCustomer[r.id].deals += r.deal_count || 0;
      if (r.currency && !byCustomer[r.id].currencies.includes(r.currency)) {
        byCustomer[r.id].currencies.push(r.currency);
      }
    });

    var result = Object.values(byCustomer).sort(function(a, b) { return b.total - a.total; });
    var grandTotal = result.reduce((s, r) => s + r.total, 0);
    var grandDeals = result.reduce((s, r) => s + r.deals, 0);
    result.forEach(r => { r.percent = grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0; });

    res.json({ rows: result, grandTotal, grandDeals });
  });
});

// Sales report - top sold products (closed deals only)
app.get('/api/quotes/products-summary', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      p.id,
      p.name, p.name_he, p.name_pt,
      c.name as category_name, c.name_he as category_name_he, c.name_pt as category_name_pt,
      SUM(qi.quantity) as total_qty,
      COUNT(DISTINCT qi.quote_id) as deal_count
    FROM quote_items qi
    JOIN products p ON qi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    JOIN quotes q ON qi.quote_id = q.id
    WHERE q.parent_id IS NULL
      AND q.status = 'closed'
    GROUP BY p.id
    ORDER BY total_qty DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalQty = rows.reduce((s, r) => s + (r.total_qty || 0), 0);
    const totalDeals = rows.reduce((s, r) => s + (r.deal_count || 0), 0);
    res.json({ rows, totalQty, totalDeals });
  });
});

// Sales report - sales by country
app.get('/api/quotes/country-summary', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      COALESCE(c.country, 'לא ידוע') as country,
      COUNT(DISTINCT q.id) as deal_count,
      SUM(q.total) as total_amount,
      q.currency
    FROM quotes q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.parent_id IS NULL AND q.status = 'closed'
    GROUP BY COALESCE(c.country, 'לא ידוע'), q.currency
    ORDER BY total_amount DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // קבץ לפי מדינה (כי יכול להיות כמה מטבעות)
    var byCountry = {};
    var grandTotal = 0;
    var grandDeals = 0;
    rows.forEach(function(r) {
      if (!byCountry[r.country]) {
        byCountry[r.country] = { country: r.country, total: 0, deals: 0, currencies: [] };
      }
      byCountry[r.country].total += r.total_amount || 0;
      byCountry[r.country].deals += r.deal_count || 0;
      if (r.currency && !byCountry[r.country].currencies.includes(r.currency)) {
        byCountry[r.country].currencies.push(r.currency);
      }
      grandTotal += r.total_amount || 0;
      grandDeals += r.deal_count || 0;
    });

    var result = Object.values(byCountry).sort(function(a, b) { return b.total - a.total; });
    result.forEach(function(r) {
      r.percent = grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0;
    });

    res.json({ rows: result, grandTotal: grandTotal, grandDeals: grandDeals });
  });
});

// Sales report - stages summary
app.get('/api/quotes/stages-summary', authenticateToken, (req, res) => {
  db.all(`
    SELECT q.id, q.status, q.total, q.currency, q.customer_name,
      MAX(qs.stage_number) as max_stage
    FROM quotes q
    LEFT JOIN quote_stages qs ON q.id = qs.quote_id
    WHERE q.parent_id IS NULL
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const stageLabels = {
      1: 'Quotation',
      2: 'Quote Approval',
      3: 'Proforma Invoice',
      4: 'Commercial Contract',
      5: 'B/L + Packing List',
      6: 'Commercial Invoice',
      7: 'Payment Proof',
      8: 'Additional Costs',
      9: 'העלאת הוצאות'
    };

    // Count deals that reached each stage (inclusive)
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    rows.forEach(function(r) {
      var currentStage = r.status === 'closed' ? 9 : (r.max_stage || 1);
      // Each deal counts for all stages up to and including its current stage
      for (var s = 1; s <= currentStage; s++) {
        counts[s] = (counts[s] || 0) + 1;
      }
    });

    var total = rows.length;
    var summary = [];
    for (var s = 1; s <= 9; s++) {
      summary.push({
        stage: s,
        label: stageLabels[s],
        count: counts[s] || 0,
        total: total
      });
    }
    res.json({ summary: summary, total: total, deals: rows });
  });
});

app.get('/api/quotes', authenticateToken, (req, res) => {
  const query = `
    SELECT q.*, c.name as customer_name, u.username
    FROM quotes q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN users u ON q.user_id = u.id
    ORDER BY q.parent_id ASC, q.created_at ASC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Duplicate quote with new currency
app.post('/api/quotes/:id/duplicate', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { currency, exchangeRate = 1 } = req.body;
  const rate = parseFloat(exchangeRate) || 1;
  const user_id = req.user.id;

  try {
    const original = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM quotes WHERE id = ?', [id], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM quote_items WHERE quote_id = ?', [id], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    const parentId = original.parent_id || original.id;
    const newTotal = Math.round(original.total * rate * 100) / 100;

    const newQuoteId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO quotes (customer_id, customer_name, currency, total, notes, user_id, status, parent_id)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [original.customer_id, original.customer_name, currency, newTotal, original.notes, user_id, parentId],
        function(err) { if (err) reject(err); else resolve(this.lastID); }
      );
    });

    // העתק פריטים עם המרת מחיר
    for (const item of items) {
      const newUnitPrice = Math.round(item.unit_price * rate * 10000) / 10000;
      const newItemTotal = Math.round(item.total * rate * 100) / 100;
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO quote_items (quote_id, product_id, product_name, product_sku, quantity, unit_price, total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newQuoteId, item.product_id, item.product_name, item.product_sku, item.quantity, newUnitPrice, newItemTotal],
          err => { if (err) reject(err); else resolve(); }
        );
      });
    }

    logActivity(user_id, 'DUPLICATE_QUOTE', 'quote', newQuoteId, { originalId: id, currency, exchangeRate: rate });
    res.json({ id: newQuoteId, currency, parent_id: parentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new quote
app.post('/api/quotes', authenticateToken, async (req, res) => {
  const { customer_id, customer_name, currency, items, notes } = req.body;
  const user_id = req.user.id;

  try {
    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Insert quote
    const quoteId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO quotes (customer_id, customer_name, currency, total, notes, user_id, qr_code_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [customer_id, customer_name, currency, total, notes, user_id, req.body.qr_code_id || null],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Insert quote items
    for (const item of items) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO quote_items (quote_id, product_id, product_name, product_sku, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [quoteId, item.product_id, item.product_name, item.product_sku, item.quantity, item.unit_price, item.quantity * item.unit_price],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    logActivity(user_id, 'CREATE_QUOTE', 'quote', quoteId, { customer_id, currency, total });

    res.json({ 
      message: 'Quote created successfully', 
      id: quoteId,
      total: total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get quote details with items
app.get('/api/quotes/:id/details', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const quote = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM quotes WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM quote_items WHERE quote_id = ?', [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({ ...quote, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update quote
app.put('/api/quotes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_name, currency, items, notes } = req.body;
  const user_id = req.user.id;

  try {
    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Update quote
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE quotes SET customer_id = ?, customer_name = ?, currency = ?, total = ?, notes = ?, qr_code_id = ? WHERE id = ?',
        [customer_id, customer_name, currency, total, notes, req.body.qr_code_id || null, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Delete old items
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM quote_items WHERE quote_id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Insert new items
    for (const item of items) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO quote_items (quote_id, product_id, product_name, product_sku, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, item.product_id, item.product_name, item.product_sku, item.quantity, item.unit_price, item.quantity * item.unit_price],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    logActivity(user_id, 'UPDATE_QUOTE', 'quote', id, { customer_id, currency, total });

    res.json({ 
      message: 'Quote updated successfully', 
      id: id,
      total: total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete quote
app.delete('/api/quotes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    // Delete quote items first
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM quote_items WHERE quote_id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete quote
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM quotes WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logActivity(user_id, 'DELETE_QUOTE', 'quote', id, {});

    res.json({ message: 'Quote deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update quote status
app.put('/api/quotes/:id/status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'approved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.run('UPDATE quotes SET status = ? WHERE id = ?', [status, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    // כשמאשרים הצעה - שלב 1 מאושר אוטומטית
    if (status === 'approved') {
      const now = new Date().toISOString();
      const approvedBy = req.user.username || req.user.email;
      db.run(
        `INSERT OR REPLACE INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at)
         VALUES (?, 1, 'approved', ?, ?)`,
        [id, approvedBy, now], () => {}
      );
      // עדכן גם את כל גרסאות המטבע הקשורות (parent_id = id או parent_id = parent של id)
      db.get('SELECT parent_id FROM quotes WHERE id = ?', [id], (err2, row) => {
        const parentId = row?.parent_id || id;
        // כל ההצעות שקשורות לאותו parent (כולל הנגזרות)
        db.all('SELECT id FROM quotes WHERE (parent_id = ? OR id = ?) AND id != ?', [parentId, parentId, id], (err3, siblings) => {
          if (!siblings) return;
          siblings.forEach(sibling => {
            db.run('UPDATE quotes SET status = ? WHERE id = ?', [status, sibling.id], () => {});
            if (status === 'approved') {
              db.run(
                `INSERT OR REPLACE INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at)
                 VALUES (?, 1, 'approved', ?, ?)`,
                [sibling.id, approvedBy, now], () => {}
              );
            }
          });
        });
      });
    }
    logActivity(req.user.id, 'UPDATE_QUOTE_STATUS', 'quote', id, { status });
    res.json({ message: 'Status updated', status });
  });
});

// Get quote stages
app.get('/api/quotes/:id/stages', authenticateToken, (req, res) => {
  db.all('SELECT * FROM quote_stages WHERE quote_id = ? ORDER BY stage_number', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Approve a stage
app.post('/api/quotes/:id/stages/:stage/approve', authenticateToken, (req, res) => {
  const { id, stage } = req.params;
  const { lc_number, doc_lang, proforma_quote_id } = req.body;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  db.run(
    `INSERT OR REPLACE INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, lc_number, doc_lang, proforma_quote_id)
     VALUES (?, ?, 'approved', ?, ?, ?, ?, ?)`,
    [id, stage, approvedBy, now, lc_number || null, doc_lang || 'pt', proforma_quote_id || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(req.user.id, 'APPROVE_QUOTE_STAGE', 'quote', id, { stage, approvedBy });
      res.json({ message: 'Stage approved', approvedBy, approvedAt: now });
    }
  );
});

// Edit stage 3 proforma (update lc_number and doc_lang, keep approved)
app.put('/api/quotes/:id/stages/3/proforma', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { lc_number, doc_lang, proforma_quote_id } = req.body;
  db.run(
    `UPDATE quote_stages SET lc_number = ?, doc_lang = ?, proforma_quote_id = ? WHERE quote_id = ? AND stage_number = 3`,
    [lc_number || null, doc_lang || 'pt', proforma_quote_id || null, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Proforma updated' });
    }
  );
});

// Delete stage 3 proforma (reset stage)
app.delete('/api/quotes/:id/stages/3/proforma', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  db.run(
    `DELETE FROM quote_stages WHERE quote_id = ? AND stage_number = 3`,
    [id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Proforma deleted' });
    }
  );
});

// Stage 7 - Upload Payment Proof (final stage)
app.post('/api/quotes/:id/stages/7/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 10MB)' });

  const { id } = req.params;
  const filePath = '/uploads/' + req.file.filename;
  const fileName = req.file.originalname;
  const fileSize = req.file.size;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;
  const fileData = filePath + '|' + fileName + '|' + fileSize + '|' + now;

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 7', [id], (err, row) => {
    const done = (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      logActivity(req.user.id, 'STAGE_7_COMPLETED', 'quote', id, { fileName });
      res.json({ file_path: filePath, file_name: fileName, file_size: fileSize, uploaded_at: now });
    };
    if (row) {
      db.run(`UPDATE quote_stages SET bl_file = ?, bl_approved = 1, status = 'approved', approved_by = ?, approved_at = ? WHERE quote_id = ? AND stage_number = 7`,
        [fileData, approvedBy, now, id], done);
    } else {
      db.run(`INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_file, bl_approved) VALUES (?, 7, 'approved', ?, ?, ?, 1)`,
        [id, approvedBy, now, fileData], done);
    }
  });
});

// Stage 6 - Upload Commercial Invoice
app.post('/api/quotes/:id/stages/6/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 10MB)' });

  const { id } = req.params;
  const filePath = '/uploads/' + req.file.filename;
  const fileName = req.file.originalname;
  const fileSize = req.file.size;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;
  const fileData = filePath + '|' + fileName + '|' + fileSize + '|' + now;

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 6', [id], (err, row) => {
    const done = (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ file_path: filePath, file_name: fileName, file_size: fileSize, uploaded_at: now });
    };
    if (row) {
      db.run(`UPDATE quote_stages SET bl_file = ?, bl_approved = 1, status = 'approved', approved_by = ?, approved_at = ? WHERE quote_id = ? AND stage_number = 6`,
        [fileData, approvedBy, now, id], done);
    } else {
      db.run(`INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_file, bl_approved) VALUES (?, 6, 'approved', ?, ?, ?, 1)`,
        [id, approvedBy, now, fileData], done);
    }
  });
});

// Stage 8 - Save Costs
app.post('/api/quotes/:id/stages/8/costs', authenticateToken, (req, res) => {
  const { id } = req.params;
  const {
    cost_base_currency,
    cost_customs, cost_customs_currency, cost_customs_rate,
    cost_bank, cost_bank_currency, cost_bank_rate,
    cost_shipping, cost_shipping_currency, cost_shipping_rate,
    cost_other, cost_other_currency, cost_other_rate,
  } = req.body;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  console.log(`💰 Saving stage 8 costs for quote #${id}`);
  console.log('Received data:', { cost_base_currency, cost_customs, cost_bank, cost_shipping, cost_other });

  const fields = [
    cost_base_currency || 'USD',
    cost_customs||0, cost_customs_currency||cost_base_currency||'USD', cost_customs_rate||1,
    cost_bank||0, cost_bank_currency||cost_base_currency||'USD', cost_bank_rate||1,
    cost_shipping||0, cost_shipping_currency||cost_base_currency||'USD', cost_shipping_rate||1,
    cost_other||0, cost_other_currency||cost_base_currency||'USD', cost_other_rate||1,
    approvedBy, now
  ];

  // Stage 8 now saves costs and enables stage 9 - does NOT close deal
  const enableStage9 = () => {
    // Create stage 9 if it doesn't exist
    db.get(`SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 9`, [id], (err, stage9) => {
      if (err) {
        console.error('❌ Error checking stage 9:', err.message);
        return;
      }
      
      if (!stage9) {
        db.run(
          `INSERT INTO quote_stages (quote_id, stage_number, status) VALUES (?, 9, 'pending')`,
          [id],
          (err) => {
            if (err) {
              console.error('❌ Error creating stage 9:', err.message);
            } else {
              console.log(`✅ Created stage 9 for quote #${id}`);
            }
          }
        );
      } else {
        console.log(`ℹ️ Stage 9 already exists for quote #${id}`);
      }
    });
    
    logActivity(req.user.id, 'STAGE_8_SAVED', 'quote', id, { stage: 8 });
    console.log(`✅ Stage 8 saved successfully for quote #${id}`);
    res.json({ message: 'Stage 8 costs saved - waiting for file uploads' });
  };

  db.get(`SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 8`, [id], (err, row) => {
    if (err) {
      console.error('❌ Error checking stage 8:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const sql_update = `UPDATE quote_stages SET
      cost_base_currency=?, cost_customs=?, cost_customs_currency=?, cost_customs_rate=?,
      cost_bank=?, cost_bank_currency=?, cost_bank_rate=?,
      cost_shipping=?, cost_shipping_currency=?, cost_shipping_rate=?,
      cost_other=?, cost_other_currency=?, cost_other_rate=?,
      status='waiting_for_files', approved_by=?, approved_at=?
      WHERE quote_id=? AND stage_number=8`;
    const sql_insert = `INSERT INTO quote_stages
      (quote_id, stage_number, status, cost_base_currency,
       cost_customs, cost_customs_currency, cost_customs_rate,
       cost_bank, cost_bank_currency, cost_bank_rate,
       cost_shipping, cost_shipping_currency, cost_shipping_rate,
       cost_other, cost_other_currency, cost_other_rate,
       approved_by, approved_at)
      VALUES (?,8,'waiting_for_files',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    if (row) {
      console.log(`📝 Updating existing stage 8 for quote #${id}`);
      db.run(sql_update, [...fields, id], function(err) {
        if (err) {
          console.error('❌ Error updating stage 8:', err.message);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Updated stage 8 (${this.changes} rows changed)`);
        enableStage9();
      });
    } else {
      console.log(`📝 Creating new stage 8 for quote #${id}`);
      db.run(sql_insert, [id, ...fields], function(err) {
        if (err) {
          console.error('❌ Error inserting stage 8:', err.message);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Created stage 8 (lastID: ${this.lastID})`);
        enableStage9();
      });
    }
  });
});

// Stage 4 - Link existing outbound transaction
app.post('/api/quotes/:id/stages/5/link-delivery', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { outbound_id, delivery_lang } = req.body;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  console.log(`🔗 Linking delivery #${outbound_id} to quote #${id}`);

  // Update outbound transaction status to completed
  db.run('UPDATE outbound_transactions SET status = ? WHERE id = ?', ['completed', outbound_id], function(statusErr) {
    if (statusErr) {
      console.error('❌ Error updating outbound status:', statusErr.message);
    } else {
      console.log(`✅ Updated outbound #${outbound_id} status to 'completed' (${this.changes} rows changed)`);
    }
  });

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [id], (err, row) => {
    if (err) {
      console.error('❌ Error checking quote_stages:', err.message);
      return res.status(500).json({ error: err.message });
    }

    if (row) {
      db.run(
        `UPDATE quote_stages SET outbound_id = ?, delivery_approved = 1, approved_by = ?, approved_at = ?, delivery_lang = ?
         WHERE quote_id = ? AND stage_number = 5`,
        [outbound_id, approvedBy, now, delivery_lang || 'he', id],
        (err2) => {
          if (err2) {
            console.error('❌ Error updating quote_stages:', err2.message);
            return res.status(500).json({ error: err2.message });
          }
          console.log(`✅ Updated quote_stages for quote #${id}`);
          checkStage5Complete(id, res);
        }
      );
    } else {
      db.run(
        `INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_approved, delivery_approved, outbound_id, delivery_lang)
         VALUES (?, 5, 'pending', ?, ?, 0, 1, ?, ?)`,
        [id, approvedBy, now, outbound_id, delivery_lang || 'he'],
        (err2) => {
          if (err2) {
            console.error('❌ Error inserting quote_stages:', err2.message);
            return res.status(500).json({ error: err2.message });
          }
          console.log(`✅ Created quote_stages for quote #${id}`);
          checkStage5Complete(id, res);
        }
      );
    }
  });
});

// Stage 4 - Unlink delivery
app.delete('/api/quotes/:id/stages/5/link-delivery', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(
    `UPDATE quote_stages SET outbound_id = NULL, delivery_approved = 0, status = 'pending'
     WHERE quote_id = ? AND stage_number = 5`,
    [id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Delivery unlinked' });
    }
  );
});

// Stage 4 - Upload Commercial Contract
app.post('/api/quotes/:id/stages/4/contract-upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { id } = req.params;
  const fileRef = `/uploads/${req.file.filename}|${req.file.originalname}|${req.file.size}|${new Date().toISOString()}`;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;
  db.run(
    `INSERT OR REPLACE INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_file)
     VALUES (?, 4, 'approved', ?, ?, ?)`,
    [id, approvedBy, now, fileRef],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Contract uploaded', file: fileRef });
    }
  );
});

// Stage 4 - Delete Commercial Contract

// Stage 5 - Upload B/L file (real file)
app.post('/api/quotes/:id/stages/5/bl-upload', authenticateToken, upload.single('bl_file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { id } = req.params;
  const filePath = '/uploads/' + req.file.filename;
  const fileName = req.file.originalname;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [id], (err, row) => {
    if (row) {
      db.run(
        `UPDATE quote_stages SET bl_file = ?, bl_approved = 1, approved_by = ?, approved_at = ?
         WHERE quote_id = ? AND stage_number = 5`,
        [filePath + '|' + fileName, approvedBy, now, id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ file_path: filePath, file_name: fileName });
        }
      );
    } else {
      db.run(
        `INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_file, bl_approved, delivery_approved)
         VALUES (?, 5, 'pending', ?, ?, ?, 1, 0)`,
        [id, approvedBy, now, filePath + '|' + fileName],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ file_path: filePath, file_name: fileName });
        }
      );
    }
  });
});

// Stage 5 - Upload B/L file
app.post('/api/quotes/:id/stages/5/bl', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { bl_file, reset } = req.body;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  const blApproved = reset ? 0 : 1;
  const blFileValue = reset ? null : bl_file;

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [id], (err, row) => {
    if (row) {
      db.run(
        `UPDATE quote_stages SET bl_file = ?, bl_approved = ?, approved_by = ?, approved_at = ?,
         status = CASE WHEN ? = 1 AND delivery_approved = 1 THEN 'approved' ELSE 'pending' END
         WHERE quote_id = ? AND stage_number = 5`,
        [blFileValue, blApproved, approvedBy, now, blApproved, id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          checkStage5Complete(id, res);
        }
      );
    } else {
      db.run(
        `INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_file, bl_approved, delivery_approved)
         VALUES (?, 5, 'pending', ?, ?, ?, ?, 0)`,
        [id, approvedBy, now, blFileValue, blApproved],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          checkStage5Complete(id, res);
        }
      );
    }
  });
});

// Stage 4 - Mark delivery note as done
app.post('/api/quotes/:id/stages/5/delivery', authenticateToken, (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [id], (err, row) => {
    if (row) {
      db.run(
        `UPDATE quote_stages SET delivery_approved = 1, approved_by = ?, approved_at = ?
         WHERE quote_id = ? AND stage_number = 5`,
        [approvedBy, now, id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          checkStage5Complete(id, res);
        }
      );
    } else {
      db.run(
        `INSERT INTO quote_stages (quote_id, stage_number, status, approved_by, approved_at, bl_approved, delivery_approved)
         VALUES (?, 5, 'pending', ?, ?, 0, 1)`,
        [id, approvedBy, now],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          checkStage5Complete(id, res);
        }
      );
    }
  });
});

// בדיקה אם שלב 4 הושלם
// Save document to filesystem and DB
async function saveDocument(type, referenceId, htmlContent, language, userId, entityName) {
  const docsDir = path.join(__dirname, 'documents', type);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = entityName ? '_' + entityName.replace(/[^a-zA-Z0-9֐-׿\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 30) : '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const langLabel = language === 'he' ? 'HE_VERSION' : language === 'pt' ? 'PT_VERSION' : 'EN_VERSION';
  const filename = `${type}${safeName}_ID${referenceId}_${dateStr}_${langLabel}.pdf`;
  const filepath = path.join(docsDir, filename);
  
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({ path: filepath, format: 'A4', printBackground: true, margin: { top: '1.5cm', bottom: '1.5cm', left: '2cm', right: '2cm' } });
    await browser.close();
  } catch (err) {
    console.error('PDF generation failed, saving as HTML:', err.message);
    const htmlFilename = `${type}_${referenceId}_${language}_${timestamp}.html`;
    const htmlFilepath = path.join(docsDir, htmlFilename);
    fs.writeFileSync(htmlFilepath, htmlContent, 'utf8');
    const fileSize = fs.statSync(htmlFilepath).size;
    const relativePath = `/documents/${type}/${htmlFilename}`;
    db.run(`INSERT INTO documents (type, reference_id, filename, filepath, language, file_size, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [type, referenceId, htmlFilename, relativePath, language, fileSize, userId]);
    return relativePath;
  }

  const fileSize = fs.statSync(filepath).size;
  const relativePath = `/documents/${type}/${filename}`;
  db.run(
    `INSERT INTO documents (type, reference_id, filename, filepath, language, file_size, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [type, referenceId, filename, relativePath, language, fileSize, userId],
    (err) => {
      if (err) {
        console.error('Error saving document to DB:', err);
      } else {
        console.log(`✅ Saved ${type} PDF document: ${filename}`);
      }
    }
  );
  
  return relativePath;
}

function checkStage5Complete(quoteId, res) {
  db.get('SELECT * FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [quoteId], (err, row) => {
    if (row && row.bl_approved && row.delivery_approved) {
      const now = new Date().toISOString();
      db.run(
        `UPDATE quote_stages SET status = 'approved', approved_at = ? WHERE quote_id = ? AND stage_number = 5`,
        [now, quoteId], () => {}
      );
    }
    db.all('SELECT * FROM quote_stages WHERE quote_id = ? ORDER BY stage_number', [quoteId], (err2, rows) => {
      res.json({ stages: rows, complete: row?.bl_approved && row?.delivery_approved });
    });
  });
}

// Generate Proforma PDF/HTML
app.get('/api/quotes/:id/proforma', async (req, res) => {
  const { id } = req.params;
  const { lang = 'pt', token = '' } = req.query; // Default to Portuguese as in original template
  
  // Translations for Proforma
  const translations = {
    he: {
      clientName: 'שם לקוח',
      proformaNumber: 'הצעת מחיר מס׳',
      nif: 'ע.מ',
      address: 'כתובת',
      companyAddress: 'נחל דן 19/11 קריית אונו 55450 ישראל',
      number: 'מס׳',
      itemDescription: 'תיאור הפריט',
      qty: 'כמות',
      price: 'מחיר',
      total: 'סה״כ',
      observationsTitle: 'הערות',
      validity: 'תוקף הצעה זו הוא 30 יום.',
      pricesCIF: 'כל המחירים הם CIF',
      bankName: 'שם בנק',
      bankAddress: 'כתובת בנק',
      swiftCode: 'קוד SWIFT',
      dir: 'rtl'
    },
    en: {
      clientName: 'Client Name',
      proformaNumber: 'Pricing Proposal No',
      nif: 'Tax ID',
      address: 'Address',
      companyAddress: 'Nahal-Dan 19/11 Qiryat-Ono 55450 Israel',
      number: 'No',
      itemDescription: 'Item Description',
      qty: 'QTY',
      price: 'Price',
      total: 'Total',
      observationsTitle: 'Observations',
      validity: 'This proforma is valid for 30 days.',
      pricesCIF: 'All prices are CIF',
      bankName: 'Bank Name',
      bankAddress: 'Bank Address',
      swiftCode: 'Swift Code',
      dir: 'ltr'
    },
    pt: {
      clientName: 'Client Name',
      proformaNumber: 'Proposta de Preços No',
      nif: 'NIF',
      address: 'Address',
      companyAddress: 'Nahal-Dan 19/11 Qiryat-Ono 55450 Israel',
      number: 'Nº',
      itemDescription: 'Descrição do item',
      qty: 'QTY',
      price: 'Preço',
      total: 'Total',
      observationsTitle: 'Observações',
      validity: 'Esta proforma tem a validade de 30 dias.',
      pricesCIF: 'Todos os preços são CIF',
      bankName: 'Bank Name',
      bankAddress: 'Bank Address',
      swiftCode: 'Swift Code',
      dir: 'ltr'
    }
  };

  const t = translations[lang] || translations.pt;
  
  try {
    const quote = await new Promise((resolve, reject) => {
      const query = `
        SELECT q.*, c.name as customer_name, c.address as customer_address,
               c.phone as customer_phone, c.tax_id as customer_tax_id, u.username,
               qr.image_url as qr_image_url, qr.qr_data as qr_data
        FROM quotes q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN users u ON q.user_id = u.id
        LEFT JOIN qr_codes qr ON q.qr_code_id = qr.id
        WHERE q.id = ?
      `;
      db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const items = await new Promise((resolve, reject) => {
      db.all(`
        SELECT qi.*,
          CASE WHEN ? = 'he' AND p.name_he IS NOT NULL AND p.name_he != '' THEN p.name_he
               WHEN ? = 'pt' AND p.name_pt IS NOT NULL AND p.name_pt != '' THEN p.name_pt
               ELSE qi.product_name END as product_name
        FROM quote_items qi
        LEFT JOIN products p ON qi.product_id = p.id
        WHERE qi.quote_id = ?
      `, [lang, lang, id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const formatCurrency = (amount, currency) => {
      const formatted = parseFloat(amount).toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
      
      switch(currency) {
        case 'EUR': return `€ ${formatted}`;
        case 'USD': return `$ ${formatted}`;
        case 'ILS': return `₪ ${formatted}`;
        case 'AOA': return `${formatted} AOA`;
        case 'KES': return `${formatted} KES`;
        default: return `${currency} ${formatted}`;
      }
    };

    const getCurrencyName = (currency) => {
      switch(currency) {
        case 'EUR': return 'EURO';
        case 'USD': return 'USD';
        case 'ILS': return 'ILS';
        case 'AOA': return 'AOA';
        case 'KES': return 'KES';
        default: return currency;
      }
    };

    const logoHtml = company.logo_path ?
      `<img src="http://localhost:3001${company.logo_path}" alt="Logo" style="max-height: 100px; max-width: 250px;">` :
      '';

    const qrHtml = quote.qr_image_url ?
      `<div style="float: right; margin: 0 0 10px 20px;">
        <img src="${quote.qr_image_url}" alt="QR Code" style="width: 65px; height: 65px; display: block;">
      </div>` : '';

    const html = `
<!DOCTYPE html>
<html dir="${t.dir}">
<head>
  <meta charset="UTF-8">
  <title>${t.proformaNumber}: ${id}</title>
  <style>
    * { box-sizing: border-box; }
    body > *:first-child { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
    body::before { display: none !important; }
    hr:first-of-type { display: none !important; }
    @media print {
      .no-print { display: none; }
      .doc-footer { display: block !important; }
      @page { margin: 1.5cm 2cm; size: A4; }
    }
    .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .btn-print, .btn-email, .btn-close {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print { background: #3498db; color: white; }
    .btn-print:hover { background: #2980b9; }
    .btn-email { background: #27ae60; color: white; }
    .btn-email:hover { background: #229954; }
    .btn-close { background: #95a5a6; color: white; }
    .btn-close:hover { background: #7f8c8d; }

    .doc-footer {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #ddd;
      padding: 6px 0;
      text-align: center;
      font-size: 8pt;
      color: #888;
      background: white;
    }
    body { 
      font-family: Arial, sans-serif; 
      max-width: 21cm; 
      margin: 0 auto; 
      padding: 20px;
      font-size: 11pt;
      direction: ${t.dir};
      border-top: none;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 20px;
      align-items: flex-start;
      border-top: none !important;
      padding-top: 0;
    }
    .company-info {
      flex: 1;
    }
    .company-info h2 {
      margin: 0;
      font-size: 16pt;
      font-weight: bold;
    }
    .company-info p {
      margin: 3px 0;
      font-size: 10pt;
    }
    .date-section {
      text-align: ${t.dir === 'rtl' ? 'left' : 'right'};
      font-weight: bold;
      font-size: 11pt;
    }
    .title-section {
      text-align: center;
      margin: 20px 0;
    }
    .title-section h1 {
      margin: 5px 0;
      font-size: 14pt;
      font-weight: bold;
    }
    .client-section {
      margin: 15px 0;
    }
    .client-section p {
      margin: 3px 0;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background-color: #f0f0f0;
      padding: 10px;
      text-align: ${t.dir === 'rtl' ? 'right' : 'left'};
      border: 1px solid #000;
      font-weight: bold;
      font-size: 10pt;
    }
    td {
      padding: 8px;
      border: 1px solid #000;
      font-size: 10pt;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row {
      background-color: #f9f9f9;
      font-weight: bold;
      font-size: 12pt;
    }
    .footer-section {
      margin-top: 30px;
    }
    .footer-section h3 {
      font-size: 12pt;
      font-weight: bold;
      margin: 10px 0 5px 0;
    }
    .footer-section p {
      margin: 2px 0;
      font-size: 10pt;
    }
    .footer-section ul {
      margin: 5px 0;
      padding-${t.dir === 'rtl' ? 'right' : 'left'}: 20px;
    }
    .footer-section li {
      margin: 2px 0;
      font-size: 10pt;
      font-weight: bold;
    }
    .bank-details {
      margin-top: 15px;
      font-size: 10pt;
    }
    .bank-details p {
      margin: 2px 0;
    }

    .email-modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:9999; justify-content:center; align-items:center; }
    .email-modal-overlay.open { display:flex !important; }
    .email-modal-box { background:white; border-radius:10px; padding:1.5rem; width:420px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); }
    .email-modal-box h3 { margin:0 0 1rem; font-size:1.1rem; }
    .ac-wrap { position: relative !important; margin-bottom: 1rem; overflow: visible !important; }
    .ac-wrap input { width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; font-size: 0.95rem; font-family: inherit; }
    .ac-list { position: fixed !important; background: white !important; border: 1px solid #ccc; border-radius: 8px; max-height: 220px; overflow-y: auto; z-index: 999999 !important; box-shadow: 0 6px 16px rgba(0,0,0,0.2); display: none; min-width: 300px; }
    .ac-item { padding: 0.5rem 0.85rem; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: block; }
    .ac-item:hover, .ac-item.ac-active { background: #e8f4fd; }
    .ac-name { display: block; font-weight: 600; color: #222; font-size: 0.88rem; }
    .ac-email { display: block; color: #777; font-size: 0.8rem; margin-top: 1px; }
    .email-modal-box label { display:block; font-weight:600; font-size:0.9rem; margin-bottom:0.3rem; }
    .email-modal-box input, .email-modal-box textarea { width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:5px; margin-bottom:0.8rem; box-sizing:border-box; font-family:inherit; font-size:0.9rem; }
    .email-modal-box textarea { height:70px; resize:vertical; }
    #email-status { font-size:0.85rem; min-height:1.2rem; margin-bottom:0.5rem; }
  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${lang === 'he' ? 'הדפס / שמור כ-PDF' : lang === 'en' ? 'Print / Save as PDF' : 'Imprimir / Salvar como PDF'}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${lang==='he'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</button>
    <button class="btn-close" onclick="window.close()">❌ ${lang === 'he' ? 'סגור' : lang === 'en' ? 'Close' : 'Fechar'}</button>
  </div>

  <table style="width: 100%; margin-bottom: 10px; border: none;">
    <tr>
      <td style="vertical-align: top; border: none; padding: 0;">
        ${logoHtml}
      </td>
      <td style="vertical-align: top; text-align: ${t.dir === 'rtl' ? 'left' : 'right'}; border: none; padding: 0;">
        ${quote.qr_image_url ? `<img src="${quote.qr_image_url}" alt="QR" style="width: 45px; height: 45px; display: block; ${t.dir === 'rtl' ? 'margin-right: auto;' : 'margin-left: auto;'} margin-top: -18px;">` : ''}
        <div style="font-weight: bold; font-size: 11pt; margin-top: 4px;">${formatDate(quote.created_at)}</div>
      </td>
    </tr>
  </table>
  <div class="company-info" style="margin-bottom: 10px;">
    <h2>WorldSecure LTD</h2>
    <p><strong>${t.nif}:</strong> 514568237</p>
    <p><strong>${t.address}:</strong> ${t.companyAddress}</p>
  </div>

  <div class="client-section">
    <p>${t.clientName}: ${quote.customer_name || '-'}</p>
  </div>

  <div class="title-section">
    <h1>${t.proformaNumber}: ${id}</h1>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 8%;">${t.number}</th>
        <th style="width: 47%;">${t.itemDescription}</th>
        <th style="width: 10%;" class="text-center">${t.qty}</th>
        <th style="width: 17%;" class="text-right">${t.price} (${getCurrencyName(quote.currency)})</th>
        <th style="width: 18%;" class="text-right">${t.total} (${getCurrencyName(quote.currency)})</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, index) => `
        <tr>
          <td class="text-center">${String(index + 1).padStart(2, '0')}</td>
          <td>${item.product_name}</td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-right">${formatCurrency(item.unit_price, quote.currency)}</td>
          <td class="text-right">${formatCurrency(item.total, quote.currency)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="text-align: ${t.dir === 'rtl' ? 'left' : 'right'}; margin: 20px 0;">
    <p style="font-size: 14pt; font-weight: bold;">
      ${t.total} (${getCurrencyName(quote.currency)}): ${formatCurrency(quote.total, quote.currency)}
    </p>
  </div>

  <div class="footer-section">
    <h3>${t.observationsTitle}</h3>
    <ul>
      <li>${t.validity}</li>
      <li>${t.pricesCIF}</li>
    </ul>

    ${quote.notes ? `<p style="margin-top: 10px;"><strong>${lang === 'he' ? 'הערות נוספות' : lang === 'en' ? 'Additional notes' : 'Notas adicionais'}:</strong> ${quote.notes}</p>` : ''}

    <div class="bank-details">
      <p><strong>${t.bankName}:</strong> Bank Leumi LE Israel B.M. Concord Branch</p>
      <p><strong>${t.bankAddress}:</strong> David Ben Gurion 9, 18th Floor, Bnei Brak, Israel</p>
      <p><strong>${t.swiftCode}:</strong> LUMIILITTLV</p>
      <p><strong>IBAN:</strong> IL60 0108 5500 0003 7690 096</p>
    </div>
  </div>


  <div class="email-modal-overlay no-print" id="emailModal">
    <div class="email-modal-box">
      <h3>✉️ ${lang==='he'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</h3>
      <label>${lang==='he'?'כתובת מייל':lang==='en'?'Email Address':'Endereço de Email'}</label>
      <div class="ac-wrap">
      <input type="text" id="emailTo" placeholder="example@domain.com" autocomplete="off"
        oninput="acFilter(this.value)"
        onfocus="acFilter(this.value)"
        onblur="setTimeout(function(){var b=document.getElementById('acList');if(b)b.style.display='none'},200)"
        onkeydown="acKey(event)">
      <div id="acList" class="ac-list"></div>
    </div>
      <label>${lang==='he'?'נושא':lang==='en'?'Subject':'Assunto'}</label>
      <input type="text" id="emailSubject" value="${lang==='he'?'מסמך מצורף':lang==='en'?'Attached Document':'Documento em anexo'}">
      <label>${lang==='he'?'הודעה':lang==='en'?'Message':'Mensagem'}</label>
      <textarea id="emailBody">${lang==='he'?'מצורף מסמך לעיונך.':lang==='en'?'Please find the attached document.':'Segue em anexo o documento para sua análise.'}</textarea>
      <div id="email-status"></div>
      <div style="display:flex;gap:0.75rem;justify-content:flex-end">
        <button onclick="document.getElementById('emailModal').classList.remove('open')" style="padding:0.5rem 1rem;background:#95a5a6;color:white;border:none;border-radius:5px;cursor:pointer">${lang==='he'?'ביטול':lang==='en'?'Cancel':'Cancelar'}</button>
        <button onclick="sendDocumentEmail()" style="padding:0.5rem 1rem;background:#27ae60;color:white;border:none;border-radius:5px;cursor:pointer">📤 ${lang==='he'?'שלח':lang==='en'?'Send':'Enviar'}</button>
      </div>
    </div>
  </div>
  <script>
  window._authToken = '${token}';
  var _ac = [];
  var _acIdx = -1;
  (function loadContacts() {
    var tok = (window._authToken || localStorage.getItem('token') || '');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try { _ac = JSON.parse(xhr.responseText); } catch(e) {}
      }
    };
    xhr.send();
  })();

  function acFilter(val) {
    var box = document.getElementById('acList');
    _acIdx = -1;
    if (!val) { box.style.display = 'none'; return; }
    var q = val.toLowerCase();
    // פצל לקוחות עם כמה מיילים לפריטים נפרדים
    var expanded = [];
    for (var j = 0; j < _ac.length; j++) {
      var c = _ac[j];
      if (!c.email) continue;
      var emails = c.email.split(/[;,]/).map(function(e){ return e.trim(); }).filter(Boolean);
      for (var k = 0; k < emails.length; k++) {
        expanded.push({ name: c.name, email: emails[k], type: c.type });
      }
    }
    var matches = expanded.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 10);
    if (!matches.length) { box.style.display = 'none'; return; }
    var html = '';
    for (var i = 0; i < matches.length; i++) {
      var c = matches[i];
      html += '<div class="ac-item" data-email="' + c.email.replace(/"/g, '&quot;') + '" data-i="' + i + '"' +
        ' onmousedown="acSelect(this.dataset.email)">' +
        '<span class="ac-name">' + c.name + '</span>' +
        '<span class="ac-email">' + c.email + '</span>' +
        '</div>';
    }
    box.innerHTML = html;
    var inp = document.getElementById('emailTo');
    var rect = inp.getBoundingClientRect();
    box.style.top = (rect.bottom + 2) + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.display = 'block';
  }

  function acSelect(email) {
    document.getElementById('emailTo').value = email;
    document.getElementById('acList').style.display = 'none';
  }

  function acKey(e) {
    var box = document.getElementById('acList');
    var items = box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { _acIdx = Math.min(_acIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { _acIdx = Math.max(_acIdx - 1, 0); }
    else if (e.key === 'Enter' && _acIdx >= 0) {
      e.preventDefault();
      acSelect(items[_acIdx].getAttribute('data-email'));
      return;
    } else return;
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === _acIdx ? '#e8f4fd' : '';
    }
    items[_acIdx].scrollIntoView({ block: 'nearest' });
  }

  window._docType = 'proforma';
  window._docId = '${id}';
  window._docLang = '${lang}';
  async function sendDocumentEmail() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;
    const status = document.getElementById('email-status');
    if (!to) { status.style.color='red'; status.textContent='נא הכנס כתובת מייל'; return; }
    status.style.color='#555'; status.textContent='⏳ שולח...';
    const token = window._authToken || localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
      const res = await fetch('/api/send-email', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({ to, subject, body, docType: window._docType, docId: window._docId, docLang: window._docLang, lcNumber: window._lcNumber, docContact: window._docContact })
      });
      const data = await res.json();
      if (res.ok) {
        status.style.color='green'; 
        const lang = window._docLang || 'en';
        status.textContent='✅ ' + (lang==='en'?'Email sent successfully!':lang==='pt'?'Email enviado com sucesso!':'המייל נשלח בהצלחה!');
        setTimeout(()=>document.getElementById('emailModal').classList.remove('open'), 3000);
      } else {
        status.style.color='red';
        status.textContent = data.error?.includes('SMTP') ? '⚠️ יש להגדיר SMTP בהגדרות החברה' : '❌ '+data.error;
      }
    } catch(e) { 
      console.error('Email send error:', e);
      status.style.color='red'; 
      status.textContent='❌ שגיאה: ' + (e.message || 'שגיאה בשליחה'); 
    }
  }
  </script>
  <div class="doc-footer">
    ${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}
  </div>
</body>
</html>
    `;

  saveDocument('proforma', id, html, lang, req.user?.id || null, quote.customer_name);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stage 3 - Generate Proforma Invoice (העתק מדויק של Quotation עם שינויי כותרת + L/C)
app.get('/api/quotes/:id/proforma-invoice', async (req, res) => {
  const { id } = req.params;
  const { lang = 'pt', lc_number = '', token = '' } = req.query;

  const translations = {
    he: {
      clientName: 'שם לקוח', proformaNumber: 'חשבונית פרופורמה מס׳',
      nif: 'ע.מ', address: 'כתובת', companyAddress: 'נחל דן 19/11 קריית אונו 55450 ישראל',
      number: 'מס׳', itemDescription: 'תיאור הפריט', qty: 'כמות', price: 'מחיר', total: 'סה״כ',
      observationsTitle: 'הערות', validity: 'תוקף חשבונית זו הוא 30 יום.',
      pricesCIF: 'כל המחירים הם CIF', bankName: 'שם בנק', bankAddress: 'כתובת בנק',
      swiftCode: 'קוד SWIFT', lcNumber: 'מספר אשראי דוקומנטרי', dir: 'rtl'
    },
    en: {
      clientName: 'Client Name', proformaNumber: 'Proforma Invoice No',
      nif: 'Tax ID', address: 'Address', companyAddress: 'Nahal-Dan 19/11 Qiryat-Ono 55450 Israel',
      number: 'No', itemDescription: 'Item Description', qty: 'QTY', price: 'Price', total: 'Total',
      observationsTitle: 'Observations', validity: 'This proforma invoice is valid for 30 days.',
      pricesCIF: 'All prices are CIF', bankName: 'Bank Name', bankAddress: 'Bank Address',
      swiftCode: 'Swift Code', lcNumber: 'L/C Number', dir: 'ltr'
    },
    pt: {
      clientName: 'Client Name', proformaNumber: 'Fatura Proforma Nº',
      nif: 'NIF', address: 'Address', companyAddress: 'Nahal-Dan 19/11 Qiryat-Ono 55450 Israel',
      number: 'Nº', itemDescription: 'Descrição do item', qty: 'QTY', price: 'Preço', total: 'Total',
      observationsTitle: 'Observações', validity: 'Esta fatura proforma tem a validade de 30 dias.',
      pricesCIF: 'Todos os preços são CIF', bankName: 'Bank Name', bankAddress: 'Bank Address',
      swiftCode: 'Swift Code', lcNumber: 'Número L/C', dir: 'ltr'
    }
  };

  const t = translations[lang] || translations.pt;

  try {
    const quote = await new Promise((resolve, reject) => {
      db.get(`SELECT q.*, c.name as customer_name, c.address as customer_address,
               c.phone as customer_phone, c.tax_id as customer_tax_id, u.username,
               qr.image_url as qr_image_url
        FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN users u ON q.user_id = u.id
        LEFT JOIN qr_codes qr ON q.qr_code_id = qr.id WHERE q.id = ?`, [id], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    const items = await new Promise((resolve, reject) => {
      db.all(`
        SELECT qi.*, 
          CASE WHEN ? = 'he' AND p.name_he IS NOT NULL AND p.name_he != '' THEN p.name_he
               WHEN ? = 'pt' AND p.name_pt IS NOT NULL AND p.name_pt != '' THEN p.name_pt
               ELSE qi.product_name END as product_name
        FROM quote_items qi
        LEFT JOIN products p ON qi.product_id = p.id
        WHERE qi.quote_id = ?
      `, [lang, lang, id], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    const company = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM company_settings WHERE id = 1', [], (err, row) => {
        if (err) reject(err); else resolve(row || {});
      });
    });

    const formatDate = (d) => {
      const date = new Date(d);
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
    };
    const formatCurrency = (amount, currency) => {
      const f = parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const map = { EUR: `€ ${f}`, USD: `$ ${f}`, ILS: `₪ ${f}` };
      return map[currency] || `${currency} ${f}`;
    };
    const getCurrencyName = (c) => ({ EUR:'EURO', USD:'USD', ILS:'ILS', AOA:'AOA', KES:'KES' }[c] || c);

    const logoHtml = company.logo_path
      ? `<img src="http://localhost:3001${company.logo_path}" alt="Logo" style="max-height: 100px; max-width: 250px;">`
      : '';

    const lcHtml = lc_number
      ? `<p style="margin: 5px 0; font-weight: bold;">${t.lcNumber}: ${lc_number}</p>`
      : '';

    const html = `<!DOCTYPE html>
<html dir="${t.dir}">
<head>
  <meta charset="UTF-8">
  <title>${t.proformaNumber}: ${id}</title>
  <style>
    * { box-sizing: border-box; }
    body > *:first-child { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
    body::before { display: none !important; }
    hr:first-of-type { display: none !important; }
    @media print { .no-print { display: none; } .doc-footer { display: block !important; } @page { margin: 1.5cm 2cm; size: A4; } }
    .doc-footer {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #ddd;
      padding: 6px 0;
      text-align: center;
      font-size: 8pt;
      color: #888;
      background: white;
    }
    .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .btn-print, .btn-email, .btn-close {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print { background: #3498db; color: white; }
    .btn-print:hover { background: #2980b9; }
    .btn-email { background: #27ae60; color: white; }
    .btn-email:hover { background: #229954; }
    .btn-close { background: #95a5a6; color: white; }
    .btn-close:hover { background: #7f8c8d; }

    body { font-family: Arial, sans-serif; max-width: 21cm; margin: 0 auto; padding: 20px; font-size: 11pt; direction: ${t.dir}; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
    .company-info h2 { margin: 0; font-size: 16pt; font-weight: bold; }
    .company-info p { margin: 3px 0; font-size: 10pt; }
    .date-section { text-align: ${t.dir === 'rtl' ? 'left' : 'right'}; font-weight: bold; font-size: 11pt; }
    .title-section { text-align: center; margin: 20px 0; }
    .title-section h1 { margin: 5px 0; font-size: 14pt; font-weight: bold; }
    .client-section { margin: 15px 0; }
    .client-section p { margin: 3px 0; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background-color: #f0f0f0; padding: 10px; text-align: ${t.dir === 'rtl' ? 'right' : 'left'}; border: 1px solid #000; font-weight: bold; font-size: 10pt; }
    td { padding: 8px; border: 1px solid #000; font-size: 10pt; }
    .text-right { text-align: right; } .text-center { text-align: center; }
    .footer-section h3 { font-size: 12pt; font-weight: bold; margin: 10px 0 5px 0; }
    .footer-section p, .footer-section li { margin: 2px 0; font-size: 10pt; }
    .footer-section li { font-weight: bold; }
    .bank-details p { margin: 2px 0; font-size: 10pt; }

    .email-modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:9999; justify-content:center; align-items:center; }
    .email-modal-overlay.open { display:flex !important; }
    .email-modal-box { background:white; border-radius:10px; padding:1.5rem; width:420px; max-width:95vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); direction:rtl; }
    .email-modal-box h3 { margin:0 0 1rem; font-size:1.1rem; }
    .email-modal-box label { display:block; font-weight:600; font-size:0.9rem; margin-bottom:0.3rem; }
    .email-modal-box input, .email-modal-box textarea { width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:5px; margin-bottom:0.8rem; box-sizing:border-box; font-family:inherit; font-size:0.9rem; }
    .email-modal-box textarea { height:70px; resize:vertical; }
    #email-status { font-size:0.85rem; min-height:1.2rem; margin-bottom:0.5rem; }
  </style>
</head>
<body>
  <div class="button-container no-print">
    <button class="btn-print" onclick="window.print()">🖨️ ${lang === 'he' ? 'הדפס / שמור כ-PDF' : lang === 'en' ? 'Print / Save as PDF' : 'Imprimir / Salvar como PDF'}</button>
    <button class="btn-email" onclick="document.getElementById('emailModal').classList.add('open')">✉️ ${lang==='he'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</button>
    <button class="btn-close" onclick="window.close()">❌ ${lang === 'he' ? 'סגור' : lang === 'en' ? 'Close' : 'Fechar'}</button>
  </div>

  <table style="width: 100%; margin-bottom: 10px; border: none;">
    <tr>
      <td style="vertical-align: top; border: none; padding: 0;">
        ${logoHtml}
      </td>
      <td style="vertical-align: top; text-align: right; border: none; padding: 0;">
        ${quote.qr_image_url ? `<img src="${quote.qr_image_url}" alt="QR" style="width: 45px; height: 45px; display: block; margin-left: auto; margin-top: -18px;">` : ''}
        <div style="font-weight: bold; font-size: 11pt; margin-top: 4px;">${formatDate(quote.created_at)}</div>
      </td>
    </tr>
  </table>
  <div class="company-info" style="margin-bottom: 10px;">
    <h2>WorldSecure LTD</h2>
    <p><strong>${t.nif}:</strong> 514568237</p>
    <p><strong>${t.address}:</strong> ${t.companyAddress}</p>
  </div>
  <div class="client-section">
    <p>${t.clientName}: ${quote.customer_name || '-'}</p>
    ${lcHtml}
  </div>
  <div class="title-section">
    <h1>${t.proformaNumber}: ${id}</h1>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:8%">${t.number}</th>
        <th style="width:47%">${t.itemDescription}</th>
        <th style="width:10%" class="text-center">${t.qty}</th>
        <th style="width:17%" class="text-right">${t.price} (${getCurrencyName(quote.currency)})</th>
        <th style="width:18%" class="text-right">${t.total} (${getCurrencyName(quote.currency)})</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, i) => `<tr>
        <td class="text-center">${String(i+1).padStart(2,'0')}</td>
        <td>${item.product_name}</td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">${formatCurrency(item.unit_price, quote.currency)}</td>
        <td class="text-right">${formatCurrency(item.total, quote.currency)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="text-align:${t.dir==='rtl'?'left':'right'}; margin:20px 0;">
    <p style="font-size:14pt; font-weight:bold;">${t.total} (${getCurrencyName(quote.currency)}): ${formatCurrency(quote.total, quote.currency)}</p>
  </div>
  <div class="footer-section">
    <h3>${t.observationsTitle}</h3>
    <ul><li>${t.validity}</li><li>${t.pricesCIF}</li></ul>
    ${quote.notes ? `<p><strong>${lang==='he'?'הערות':'Notes'}:</strong> ${quote.notes}</p>` : ''}
    <div class="bank-details" style="margin-top:15px;">
      <p><strong>${t.bankName}:</strong> Bank Leumi LE Israel B.M. Concord Branch</p>
      <p><strong>${t.bankAddress}:</strong> David Ben Gurion 9, 18th Floor, Bnei Brak, Israel</p>
      <p><strong>${t.swiftCode}:</strong> LUMIILITTLV</p>
      <p><strong>IBAN:</strong> IL60 0108 5500 0003 7690 096</p>
    </div>
  </div>

  <div class="email-modal-overlay no-print" id="emailModal">
    <div class="email-modal-box">
      <h3>✉️ ${lang==='he'?'שלח במייל':lang==='en'?'Send by Email':'Enviar por Email'}</h3>
      <label>${lang==='he'?'כתובת מייל':lang==='en'?'Email Address':'Endereço de Email'}</label>
      <div class="ac-wrap">
      <input type="text" id="emailTo" placeholder="example@domain.com" autocomplete="off"
        oninput="acFilter(this.value)"
        onfocus="acFilter(this.value)"
        onblur="setTimeout(function(){var b=document.getElementById('acList');if(b)b.style.display='none'},200)"
        onkeydown="acKey(event)">
      <div id="acList" class="ac-list"></div>
    </div>
      <label>${lang==='he'?'נושא':lang==='en'?'Subject':'Assunto'}</label>
      <input type="text" id="emailSubject" value="${lang==='he'?'מסמך מצורף':lang==='en'?'Attached Document':'Documento em anexo'}">
      <label>${lang==='he'?'הודעה':lang==='en'?'Message':'Mensagem'}</label>
      <textarea id="emailBody">${lang==='he'?'מצורף מסמך לעיונך.':lang==='en'?'Please find the attached document.':'Segue em anexo o documento para sua análise.'}</textarea>
      <div id="email-status"></div>
      <div style="display:flex;gap:0.75rem;justify-content:flex-end">
        <button onclick="document.getElementById('emailModal').classList.remove('open')" style="padding:0.5rem 1rem;background:#95a5a6;color:white;border:none;border-radius:5px;cursor:pointer">${lang==='he'?'ביטול':lang==='en'?'Cancel':'Cancelar'}</button>
        <button onclick="sendDocumentEmail()" style="padding:0.5rem 1rem;background:#27ae60;color:white;border:none;border-radius:5px;cursor:pointer">📤 ${lang==='he'?'שלח':lang==='en'?'Send':'Enviar'}</button>
      </div>
    </div>
  </div>
  <script>
  window._authToken = '${token}';
  var _ac = [];
  var _acIdx = -1;
  (function loadContacts() {
    var tok = (window._authToken || localStorage.getItem('token') || '');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/email-contacts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try { _ac = JSON.parse(xhr.responseText); } catch(e) {}
      }
    };
    xhr.send();
  })();

  function acFilter(val) {
    var box = document.getElementById('acList');
    _acIdx = -1;
    if (!val) { box.style.display = 'none'; return; }
    var q = val.toLowerCase();
    // פצל לקוחות עם כמה מיילים לפריטים נפרדים
    var expanded = [];
    for (var j = 0; j < _ac.length; j++) {
      var c = _ac[j];
      if (!c.email) continue;
      var emails = c.email.split(/[;,]/).map(function(e){ return e.trim(); }).filter(Boolean);
      for (var k = 0; k < emails.length; k++) {
        expanded.push({ name: c.name, email: emails[k], type: c.type });
      }
    }
    var matches = expanded.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 10);
    if (!matches.length) { box.style.display = 'none'; return; }
    var html = '';
    for (var i = 0; i < matches.length; i++) {
      var c = matches[i];
      html += '<div class="ac-item" data-email="' + c.email.replace(/"/g, '&quot;') + '" data-i="' + i + '"' +
        ' onmousedown="acSelect(this.dataset.email)">' +
        '<span class="ac-name">' + c.name + '</span>' +
        '<span class="ac-email">' + c.email + '</span>' +
        '</div>';
    }
    box.innerHTML = html;
    var inp = document.getElementById('emailTo');
    var rect = inp.getBoundingClientRect();
    box.style.top = (rect.bottom + 2) + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.display = 'block';
  }

  function acSelect(email) {
    document.getElementById('emailTo').value = email;
    document.getElementById('acList').style.display = 'none';
  }

  function acKey(e) {
    var box = document.getElementById('acList');
    var items = box.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { _acIdx = Math.min(_acIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { _acIdx = Math.max(_acIdx - 1, 0); }
    else if (e.key === 'Enter' && _acIdx >= 0) {
      e.preventDefault();
      acSelect(items[_acIdx].getAttribute('data-email'));
      return;
    } else return;
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === _acIdx ? '#e8f4fd' : '';
    }
    items[_acIdx].scrollIntoView({ block: 'nearest' });
  }

  window._docType = 'proforma-invoice';
  window._docId = '${id}';
  window._docLang = '${lang}';
  window._lcNumber = '${lc_number}';
  async function sendDocumentEmail() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').value;
    const status = document.getElementById('email-status');
    if (!to) { status.style.color='red'; status.textContent='נא הכנס כתובת מייל'; return; }
    status.style.color='#555'; status.textContent='⏳ שולח...';
    const token = window._authToken || localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
      const res = await fetch('/api/send-email', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({ to, subject, body, docType: window._docType, docId: window._docId, docLang: window._docLang, lcNumber: window._lcNumber, docContact: window._docContact })
      });
      const data = await res.json();
      if (res.ok) {
        status.style.color='green'; 
        const lang = window._docLang || 'en';
        status.textContent='✅ ' + (lang==='en'?'Email sent successfully!':lang==='pt'?'Email enviado com sucesso!':'המייל נשלח בהצלחה!');
        setTimeout(()=>document.getElementById('emailModal').classList.remove('open'), 3000);
      } else {
        status.style.color='red';
        status.textContent = data.error?.includes('SMTP') ? '⚠️ יש להגדיר SMTP בהגדרות החברה' : '❌ '+data.error;
      }
    } catch(e) { 
      console.error('Email send error:', e);
      status.style.color='red'; 
      status.textContent='❌ שגיאה: ' + (e.message || 'שגיאה בשליחה'); 
    }
  }
  </script>
  <div class="doc-footer">
    ${company.company_name || 'WorldSecure LTD'} &nbsp;&bull;&nbsp; ${company.email || 'info@world-secure.com'}
  </div>
</body>
</html>`;

  saveDocument('proforma-invoice', id, html, lang, req.user?.id || null, quote.customer_name);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DATABASE BACKUP ============

const DB_PATH = path.join(__dirname, 'warehouse.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_EXTERNAL = 'C:\\Active Companies\\CRM BACKUP';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(function(file) {
    var srcFile = path.join(src, file);
    var destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDirRecursive(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

function backupToDir(backupDir) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  var date = new Date().toISOString().slice(0, 10);

  // גיבוי DB
  if (fs.existsSync(DB_PATH)) {
    var dest = path.join(backupDir, 'warehouse_' + date + '.db');
    fs.copyFileSync(DB_PATH, dest);
    console.log('DB backup saved:', dest);
  }

  // גיבוי uploads
  if (fs.existsSync(UPLOADS_DIR)) {
    var uploadsBackup = path.join(backupDir, 'uploads_' + date);
    copyDirRecursive(UPLOADS_DIR, uploadsBackup);
    console.log('Uploads backup saved:', uploadsBackup);
  }

  // שמור רק 7 גיבויים אחרונים
  var dbFiles = fs.readdirSync(backupDir)
    .filter(function(f) { return f.startsWith('warehouse_') && f.endsWith('.db'); })
    .sort();
  if (dbFiles.length > 7) {
    dbFiles.slice(0, dbFiles.length - 7).forEach(function(f) {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch(e) {}
    });
  }
  var uploadDirs = fs.readdirSync(backupDir)
    .filter(function(f) { return f.startsWith('uploads_'); })
    .sort();
  if (uploadDirs.length > 7) {
    uploadDirs.slice(0, uploadDirs.length - 7).forEach(function(d) {
      try { fs.rmSync(path.join(backupDir, d), { recursive: true, force: true }); } catch(e) {}
    });
  }
}

function backupDatabase() {
  try {
    // גיבוי ל-backend/backups
    backupToDir(BACKUP_DIR);
  } catch(e) { console.error('Local backup error:', e.message); }

  try {
    // גיבוי לספרייה החיצונית
    backupToDir(BACKUP_EXTERNAL);
  } catch(e) { console.error('External backup error (C:\\Active Companies\\CRM BACKUP):', e.message); }
}

// גיבוי בהפעלה + כל 24 שעות
setTimeout(backupDatabase, 3000);
setInterval(backupDatabase, 24 * 60 * 60 * 1000);

// הורדת גיבוי ידני
app.get('/api/backup/download', authenticateToken, function(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'DB not found' });
  
  // שמור עותק בתיקיית backups
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes());
  const backupFilename = 'backup_' + timestamp + '.db';
  const backupPath = path.join(BACKUP_DIR, backupFilename);
  
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(DB_PATH, backupPath);
  } catch(e) { console.error('Backup copy error:', e.message); }
  
  res.download(DB_PATH, 'warehouse.db');
});

// רשימת גיבויים זמינים
app.get('/api/backup/list', authenticateToken, function(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
  var items = fs.readdirSync(BACKUP_DIR);
  var dbFiles = items
    .filter(function(f) { return (f.startsWith('warehouse_') || f.startsWith('uploaded_') || f.startsWith('pre_restore_') || f.startsWith('backup_')) && f.endsWith('.db'); })
    .sort().reverse()
    .map(function(f) {
      var stat = fs.statSync(path.join(BACKUP_DIR, f));
      // בדוק אם יש גיבוי uploads מאותו תאריך
      var dateStr = f.replace('warehouse_', '').replace('uploaded_', '').replace('pre_restore_', '').replace('backup_', '').replace('.db', '');
      var hasUploads = f.startsWith('uploaded_') || f.startsWith('pre_restore_') || f.startsWith('backup_') || fs.existsSync(path.join(BACKUP_DIR, 'uploads_' + dateStr));
      return { name: f, size: stat.size, date: stat.mtime, hasUploads: hasUploads };
    });
  res.json(dbFiles);
});

// שחזור מגיבוי
app.post('/api/backup/restore/:filename', authenticateToken, function(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const filename = path.basename(req.params.filename);
  const backupFile = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(backupFile)) return res.status(404).json({ error: 'Backup not found' });
  try {
    // גיבוי של המצב הנוכחי לפני שחזור
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, 'pre_restore_' + now + '.db'));
    // שחזור
    fs.copyFileSync(backupFile, DB_PATH);
    res.json({ message: 'Restored successfully. Please restart the server.' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// העלאת גיבוי
app.post('/api/backup/upload', authenticateToken, upload.single('backup'), function(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Check file extension
  const allowedExts = ['.sql', '.mdf', '.bak', '.db'];
  const ext = path.extname(req.file.originalname).toLowerCase();
  
  if (!allowedExts.includes(ext)) {
    fs.unlinkSync(req.file.path); // Delete uploaded file
    return res.status(400).json({ error: 'Invalid file type. Only .sql, .mdf, .bak, .db files allowed' });
  }
  
  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `uploaded_${timestamp}${ext}`;
    const targetPath = path.join(BACKUP_DIR, filename);
    
    // Move file to backup directory
    fs.renameSync(req.file.path, targetPath);
    
    res.json({ 
      message: 'Backup uploaded successfully',
      filename: filename 
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// Delete Stage 4 Contract
app.delete('/api/quotes/:id/stages/4/contract-upload', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT bl_file FROM quote_stages WHERE quote_id = ? AND stage_number = 4', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete physical file if exists
    if (row && row.bl_file) {
      try {
        // bl_file format: "/uploads/filename|originalname|size|date"
        const filePath = row.bl_file.split('|')[0];
        const fullPath = path.join(__dirname, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log('Deleted contract file:', fullPath);
        }
      } catch(e) {
        console.error('Error deleting contract file:', e);
      }
    }
    
    // Delete from DB
    db.run(
      'DELETE FROM quote_stages WHERE quote_id = ? AND stage_number = 4',
      [id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.id, 'DELETE_CONTRACT', 'quote', id, { stage: 4 });
        res.json({ message: 'Contract deleted' });
      }
    );
  });
});

// Delete Stage 5 BL
app.delete('/api/quotes/:id/stages/5/bl-upload', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT bl_file FROM quote_stages WHERE quote_id = ? AND stage_number = 5', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete physical file if exists
    if (row && row.bl_file) {
      try {
        const filePath = row.bl_file.split('|')[0];
        const fullPath = path.join(__dirname, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log('Deleted BL file:', fullPath);
        }
      } catch(e) {
        console.error('Error deleting BL file:', e);
      }
    }
    
    // Update DB - set bl_file to NULL
    db.run(
      'UPDATE quote_stages SET bl_file = NULL, bl_approved = 0 WHERE quote_id = ? AND stage_number = 5',
      [id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.id, 'DELETE_BL', 'quote', id, { stage: 5 });
        res.json({ message: 'BL deleted' });
      }
    );
  });
});

// Delete Stage 6 File
app.delete('/api/quotes/:id/stages/6/upload', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT data FROM stages WHERE quote_id = ? AND stage_number = 6', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete physical file if exists
    if (row && row.data) {
      try {
        const data = JSON.parse(row.data);
        if (data.file_path) {
          const filePath = path.join(__dirname, data.file_path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Deleted Stage 6 file:', filePath);
          }
        }
      } catch(e) {
        console.error('Error deleting Stage 6 file:', e);
      }
    }
    
    // Update DB
    const currentData = row && row.data ? JSON.parse(row.data) : {};
    delete currentData.file_path;
    delete currentData.file_name;
    
    db.run(
      'UPDATE stages SET data = ? WHERE quote_id = ? AND stage_number = 6',
      [JSON.stringify(currentData), id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.id, 'DELETE_STAGE_6_FILE', 'quote', id, { stage: 6 });
        res.json({ message: 'File deleted' });
      }
    );
  });
});

// Delete Stage 7 File
app.delete('/api/quotes/:id/stages/7/upload', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT data FROM stages WHERE quote_id = ? AND stage_number = 7', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete physical file if exists
    if (row && row.data) {
      try {
        const data = JSON.parse(row.data);
        if (data.file_path) {
          const filePath = path.join(__dirname, data.file_path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Deleted Stage 7 file:', filePath);
          }
        }
      } catch(e) {
        console.error('Error deleting Stage 7 file:', e);
      }
    }
    
    // Update DB
    const currentData = row && row.data ? JSON.parse(row.data) : {};
    delete currentData.file_path;
    delete currentData.file_name;
    
    db.run(
      'UPDATE stages SET data = ? WHERE quote_id = ? AND stage_number = 7',
      [JSON.stringify(currentData), id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.id, 'DELETE_STAGE_7_FILE', 'quote', id, { stage: 7 });
        res.json({ message: 'File deleted' });
      }
    );
  });
});



// Get documents list
app.get('/api/documents/:type/:refId', authenticateToken, (req, res) => {
  const { type, refId } = req.params;
  
  db.all(
    `SELECT d.*, u.username 
     FROM documents d 
     LEFT JOIN users u ON d.created_by = u.id
     WHERE d.type = ? AND d.reference_id = ?
     ORDER BY d.created_at DESC`,
    [type, refId],
    (err, docs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(docs);
    }
  );
});

// Serve document files
app.get('/documents/:type/:filename', authenticateToken, (req, res) => {
  const { type, filename } = req.params;
  const filepath = path.join(__dirname, 'documents', type, filename);
  
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: 'Document not found' });
  }
});


// Check stock and create alerts
app.post('/api/quotes/:id/check-stock', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get quote items
    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM quote_items WHERE quote_id = ?', [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const alerts = [];
    
    // Check each item against inventory
    for (const item of items) {
      const product = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM products WHERE id = ?', [item.product_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (product) {
        const availableQty = product.quantity || 0;
        const requiredQty = item.quantity || 0;
        
        if (availableQty < requiredQty) {
          const shortageQty = requiredQty - availableQty;
          
          // Create alert
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO stock_alerts (quote_id, product_id, product_name, required_qty, available_qty, shortage_qty, status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')`,
              [id, product.id, product.name, requiredQty, availableQty, shortageQty],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          alerts.push({
            product_name: product.name,
            required: requiredQty,
            available: availableQty,
            shortage: shortageQty
          });
        }
      }
    }
    
    if (alerts.length > 0) {
      console.log(`⚠️ Stock alerts created for quote #${id}:`, alerts);
    }
    
    res.json({ 
      hasShortage: alerts.length > 0,
      alerts: alerts
    });
    
  } catch (error) {
    console.error('Error checking stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: auto-resolve stock alerts when product stock is sufficient
function autoResolveStockAlerts(productId) {
  db.get('SELECT quantity, min_quantity FROM products WHERE id = ?', [productId], (err, product) => {
    if (err || !product) return;
    if (product.quantity >= product.min_quantity) {
      db.run(
        `UPDATE stock_alerts SET status = 'resolved', resolved_at = datetime('now')
         WHERE product_id = ? AND status = 'active'`,
        [productId],
        (err) => { if (err) console.error('autoResolveStockAlerts error:', err.message); }
      );
    }
  });
}

// Get active stock alerts
app.get('/api/stock-alerts', authenticateToken, (req, res) => {
  db.all(
    `SELECT a.*, q.id as quote_number 
     FROM stock_alerts a
     LEFT JOIN quotes q ON a.quote_id = q.id
     WHERE a.status = 'active'
     ORDER BY a.created_at DESC`,
    [],
    (err, alerts) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(alerts);
    }
  );
});

// Resolve alert
app.post('/api/stock-alerts/:id/resolve', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(
    `UPDATE stock_alerts SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`,
    [id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Alert resolved' });
    }
  );
});


// ===== QR CODES ENDPOINTS =====

// Get all QR codes
app.get('/api/qr-codes', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM qr_codes ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Create new QR code
app.post('/api/qr-codes', authenticateToken, (req, res) => {
  const { type, qr_data, image_url, title } = req.body;
  
  db.run(
    'INSERT INTO qr_codes (type, qr_data, image_url, title, created_by) VALUES (?, ?, ?, ?, ?)',
    [type, qr_data, image_url, title || null, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const newId = this.lastID;
      db.get('SELECT * FROM qr_codes WHERE id = ?', [newId], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(row);
      });
    }
  );
});

// Delete QR code
app.delete('/api/qr-codes/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM qr_codes WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'QR code deleted', changes: this.changes });
  });
});

app.put('/api/qr-codes/:id', authenticateToken, (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  db.run('UPDATE qr_codes SET title=? WHERE id=?', [title, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'QR title updated' });
  });
});


// ===== SUPPORT TICKETS - MIGRATIONS =====
db.run(`ALTER TABLE support_tickets ADD COLUMN owner_id INTEGER`, () => {});
db.run(`ALTER TABLE company_settings ADD COLUMN email_signature TEXT`, () => {});
db.run(`CREATE TABLE IF NOT EXISTS email_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN owner_updated_at DATETIME`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN owner_name TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN cancelled_at TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN awaiting_channel TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN awaiting_note TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN awaiting_deadline TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN ticket_number TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN customer_id INTEGER`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN customer_name TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN product_id INTEGER`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN product_name TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN description TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN priority TEXT DEFAULT 'medium'`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN created_by INTEGER`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN created_at TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN updated_at TEXT`, () => {});
db.run(`ALTER TABLE support_tickets ADD COLUMN closed_at TEXT`, () => {});
db.run(`ALTER TABLE support_ticket_history ADD COLUMN comment TEXT`, () => {});
db.run(`ALTER TABLE notifications ADD COLUMN needs_ack INTEGER DEFAULT 0`, () => {});
db.run(`ALTER TABLE notifications ADD COLUMN acked_at TEXT`, () => {});
db.run(`ALTER TABLE notifications ADD COLUMN cloud_id INTEGER`, () => {});
db.run(`ALTER TABLE notifications ADD COLUMN user_email TEXT`, () => {});

db.run(`CREATE TABLE IF NOT EXISTS warehouse_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
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
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
)`, () => {});
db.run(`ALTER TABLE warehouse_alerts ADD COLUMN outbound_id INTEGER`, () => {});
db.run(`ALTER TABLE warehouse_alerts ADD COLUMN outbound_ref TEXT`, () => {});
db.run(`ALTER TABLE warehouse_alerts ADD COLUMN customer_id INTEGER`, () => {});

db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  data TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`, () => {});

db.run(`CREATE TABLE IF NOT EXISTS support_ticket_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
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
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
)`, () => {});

db.run(`CREATE TABLE IF NOT EXISTS support_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, filename TEXT, file_path TEXT, file_size INTEGER, uploaded_at TEXT DEFAULT (datetime('now')))`, () => {});

// ===== SUPPORT HISTORY HELPER =====
const logTicketHistory = (ticketId, userId, username, action, details = {}) => {
  db.run(`INSERT INTO support_ticket_history 
    (ticket_id, user_id, username, action, old_status, new_status, awaiting_channel, awaiting_note, awaiting_deadline, owner_id, owner_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [ticketId, userId, username, action,
     details.old_status||null, details.new_status||null,
     details.awaiting_channel||null, details.awaiting_note||null, details.awaiting_deadline||null,
     details.owner_id||null, details.owner_name||null],
    () => {}
  );
};

// ===== SUPPORT TICKETS =====

app.get('/api/support-tickets', authenticateToken, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const query = isAdmin
    ? `SELECT t.*, 
        u1.username as created_by_name,
        u2.username as owner_name
       FROM support_tickets t
       LEFT JOIN users u1 ON t.created_by = u1.id
       LEFT JOIN users u2 ON t.owner_id = u2.id
       ORDER BY t.id DESC`
    : `SELECT t.*,
        u1.username as created_by_name,
        u2.username as owner_name
       FROM support_tickets t
       LEFT JOIN users u1 ON t.created_by = u1.id
       LEFT JOIN users u2 ON t.owner_id = u2.id
       WHERE t.owner_id = ?
       ORDER BY t.id DESC`;
  const params = isAdmin ? [] : [req.user.id];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/support-tickets/stats', authenticateToken, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const where = isAdmin ? '' : `WHERE t.owner_id = ${req.user.id}`;
  db.all(`SELECT t.status, COUNT(*) as count FROM support_tickets t ${where} GROUP BY t.status`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const stats = { open: 0, in_progress: 0, closed: 0, pending: 0, total: 0 };
    (rows||[]).forEach(r => { stats[r.status] = r.count; stats.total += r.count; });
    if (isAdmin) {
      db.all(`SELECT u.username, u.id, COUNT(t.id) as total,
        SUM(CASE WHEN t.status='open' THEN 1 ELSE 0 END) as open_count
        FROM users u LEFT JOIN support_tickets t ON t.owner_id = u.id
        GROUP BY u.id HAVING total > 0`, [], (err2, agents) => {
        res.json({ ...stats, agents: agents||[] });
      });
    } else {
      res.json(stats);
    }
  });
});

app.post('/api/support-tickets', authenticateToken, upload.array('images', 5), (req, res) => {
  const { customer_id, customer_name, product_id, product_name, subject, description, status, priority, owner_id } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject is required' });
  const ticket_number = 'TKT-' + String(Date.now()).slice(-6);
  const resolvedOwnerId = owner_id || req.user.id;
  db.get('SELECT username FROM users WHERE id = ?', [resolvedOwnerId], (err, ownerRow) => {
    const owner_name = ownerRow?.username || null;
    db.run(
      `INSERT INTO support_tickets (ticket_number, customer_id, customer_name, product_id, product_name, subject, description, status, priority, created_by, owner_id, owner_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [ticket_number, customer_id||null, customer_name||null, product_id||null, product_name||null,
       subject, description||'', status||'open', priority||'medium', req.user.id, resolvedOwnerId, owner_name],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const ticketId = this.lastID;
        const files = req.files || [];
        files.forEach(file => {
          db.run(`INSERT INTO support_attachments (ticket_id, filename, file_path, file_size) VALUES (?, ?, ?, ?)`,
            [ticketId, file.originalname, '/uploads/' + file.filename, file.size], () => {});
        });
        logActivity(req.user.id, 'CREATE_TICKET', 'support_ticket', ticketId, { subject });
        logTicketHistory(ticketId, req.user.id, req.user.username||req.user.email, 'created', { new_status: status||'open', owner_id: resolvedOwnerId, owner_name });
        res.json({ id: ticketId, ticket_number });
      }
    );
  });
});

app.put('/api/support-tickets/:id', authenticateToken, upload.array('images', 5), (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_name, product_id, product_name, subject, description, status, priority, owner_id } = req.body;
  console.log('[PUT support-tickets] id='+id+' owner_id='+owner_id+' role='+req.user.role);
  if (!subject) return res.status(400).json({ error: 'Subject is required' });
  // בדוק אם לקוח רגיש ומנסים להעביר למשתמש שאינו admin
  const proceedWithUpdate = () => {
  const closedCol = status === 'closed' ? ", closed_at=datetime('now')" : '';
  const ownerChangedByAdmin = !!(owner_id && req.user.role === 'admin');
  const ownerUpdatedCol = ownerChangedByAdmin ? ", owner_updated_at=datetime('now')" : '';
  const resolveOwner = (cb) => {
    if (ownerChangedByAdmin) {
      db.get('SELECT username FROM users WHERE id = ?', [owner_id], (e, r) => cb(owner_id, r?.username||null));
    } else {
      db.get('SELECT owner_id, owner_name FROM support_tickets WHERE id = ?', [id], (e, r) => cb(r?.owner_id||null, r?.owner_name||null));
    }
  };
  resolveOwner((ownerId, ownerName) => {
    // Get old status/owner before update
    db.get('SELECT status, owner_id, owner_name FROM support_tickets WHERE id = ?', [id], (err0, oldRow) => {
      const { awaiting_channel, awaiting_note, awaiting_deadline } = req.body;
      db.run(
        `UPDATE support_tickets SET customer_id=?, customer_name=?, product_id=?, product_name=?,
         subject=?, description=?, status=?, priority=?, owner_id=?, owner_name=?,
         awaiting_channel=?, awaiting_note=?, awaiting_deadline=?,
         updated_at=datetime('now')${closedCol}${ownerUpdatedCol} WHERE id=?`,
        [customer_id||null, customer_name||null, product_id||null, product_name||null,
         subject, description||'', status||'open', priority||'medium', ownerId, ownerName,
         awaiting_channel||null, awaiting_note||null, awaiting_deadline||null, id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          const files = req.files || [];
          files.forEach(file => {
            db.run(`INSERT INTO support_attachments (ticket_id, filename, file_path, file_size) VALUES (?, ?, ?, ?)`,
              [id, file.originalname, '/uploads/' + file.filename, file.size], () => {});
          });
          logActivity(req.user.id, 'UPDATE_TICKET', 'support_ticket', id, { subject, status });
          // Log history
          const histDetails = {
            old_status: oldRow?.status, new_status: status||'open',
            owner_id: ownerId, owner_name: ownerName,
          };
          if (status === 'awaiting_customer') {
            histDetails.awaiting_channel = awaiting_channel||null;
            histDetails.awaiting_note = awaiting_note||null;
            histDetails.awaiting_deadline = awaiting_deadline||null;
          }
          const action = oldRow?.status !== status ? 'status_changed' :
                         oldRow?.owner_id !== parseInt(ownerId) ? 'owner_changed' : 'updated';
          logTicketHistory(id, req.user.id, req.user.username||req.user.email, action, histDetails);
          res.json({ message: 'Ticket updated' });
        }
      );
    });
  });
  }; // end proceedWithUpdate
  if (owner_id && req.user.role === 'admin') {
    db.get('SELECT is_sensitive FROM customers WHERE id=?', [customer_id||0], (e, custRow) => {
      db.get('SELECT role FROM users WHERE id=?', [owner_id], (e2, ownerRow) => {
        if (custRow?.is_sensitive && ownerRow?.role !== 'admin') {
          return res.status(400).json({ error: 'לקוח זה מסומן כרגיש — לא ניתן להעביר ownership למשתמש שאינו admin' });
        }
        proceedWithUpdate();
      });
    });
  } else {
    proceedWithUpdate();
  }
});

app.get('/api/support-tickets/:id/history', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.all(`SELECT h.*, u.username as actor_name FROM support_ticket_history h
    LEFT JOIN users u ON h.user_id = u.id
    WHERE h.ticket_id = ? ORDER BY h.created_at ASC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/support-tickets/:id/comments', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || !comment.trim()) return res.status(400).json({ error: 'Comment is required' });
  db.get('SELECT username FROM users WHERE id = ?', [req.user.id], (err, userRow) => {
    db.run(`INSERT INTO support_ticket_history (ticket_id, user_id, username, action, comment, created_at)
      VALUES (?, ?, ?, 'comment', ?, datetime('now'))`,
      [id, req.user.id, userRow?.username || req.user.email, comment.trim()],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.delete('/api/support-tickets/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM support_ticket_history WHERE ticket_id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM support_tickets WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
      // שמור ב-deleted_support_tickets כדי שהסינק יידע למחוק גם בענן
      db.run(`CREATE TABLE IF NOT EXISTS deleted_support_tickets (
        ticket_id INTEGER PRIMARY KEY,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, () => {
        db.run('INSERT OR REPLACE INTO deleted_support_tickets (ticket_id) VALUES (?)', [id]);
      });
      logActivity(req.user.id, 'DELETE_TICKET', 'support_ticket', id, {});
      res.json({ message: 'Ticket deleted' });
    });
  });
});

// ===== WAREHOUSE ALERTS =====

// POST - create warehouse alert from support ticket
app.post('/api/warehouse-alerts', authenticateToken, (req, res) => {
  const { ticket_id, product_id, product_name, quantity } = req.body;
  if (!ticket_id || !product_id) return res.status(400).json({ error: 'ticket_id and product_id required' });
  db.get('SELECT ticket_number, customer_name, customer_id FROM support_tickets WHERE id = ?', [ticket_id], (err, ticket) => {
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    db.run(`INSERT INTO warehouse_alerts (ticket_id, ticket_number, customer_name, customer_id, product_id, product_name, quantity, requested_by, requested_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [ticket_id, ticket.ticket_number, ticket.customer_name, ticket.customer_id||null, product_id, product_name, quantity||1, req.user.id, req.user.username||req.user.email],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// GET - get pending warehouse alerts (for warehouse dashboard)
app.get('/api/warehouse-alerts', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM warehouse_alerts WHERE status = 'pending' ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// PUT - complete warehouse alert (mark as done)
// GET outbound transactions by customer for dispatch linking
app.get('/api/outbound/by-customer/:customerId', authenticateToken, (req, res) => {
  const { customerId } = req.params;
  const name = req.query.name || '';
  db.all(`SELECT ot.id, ot.transaction_date, ot.status, ot.customer_type,
    CASE WHEN ot.customer_type='casual' THEN ot.casual_customer_name ELSE c.name END as customer_name,
    GROUP_CONCAT(p.name || ' x' || oi.quantity, ', ') as items_summary
    FROM outbound_transactions ot
    LEFT JOIN outbound_items oi ON oi.transaction_id = ot.id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN customers c ON c.id = ot.customer_id
    WHERE ot.customer_id = ?
       OR c.name LIKE ?
       OR ot.casual_customer_name LIKE ?
    GROUP BY ot.id
    ORDER BY ot.transaction_date DESC LIMIT 20`,
    [customerId, `%${name}%`, `%${name}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.put('/api/warehouse-alerts/:id/complete', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { outbound_id, outbound_ref } = req.body;
  db.get('SELECT * FROM warehouse_alerts WHERE id = ?', [id], (err, alert) => {
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    db.run(`UPDATE warehouse_alerts SET status='completed', completed_at=datetime('now'), outbound_id=?, outbound_ref=? WHERE id=?`,
      [outbound_id || null, outbound_ref || null, id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // Log to ticket history
      logTicketHistory(alert.ticket_id, req.user.id, req.user.username||req.user.email, 'product_dispatched', {
        new_status: null,
        awaiting_note: `${alert.product_name} x${alert.quantity}${outbound_ref ? ` | Ref: ${outbound_ref}` : ''}`
      });
      // Send needs_ack notification to support user
      db.run(`INSERT INTO notifications (user_id, type, title, message, data, needs_ack, created_at)
        VALUES (?, 'warehouse_dispatched', 'warehouse_dispatched', ?, ?, 1, datetime('now'))`,
        [alert.requested_by,
         JSON.stringify({ product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: outbound_ref || null }),
         JSON.stringify({ ticket_id: alert.ticket_id, alert_id: id, product_name: alert.product_name, quantity: alert.quantity, ticket_number: alert.ticket_number, outbound_ref: outbound_ref || null })],
        () => {}
      );
      res.json({ message: 'Alert completed' });
    });
  });
});

// PUT - acknowledge notification (user confirms receipt)
app.put('/api/notifications/:id/acknowledge', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id], (err, n) => {
    if (!n) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE notifications SET is_read=1, needs_ack=0, acked_at=datetime('now') WHERE id=?`, [id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // Log acknowledgement to ticket history
      try {
        const data = JSON.parse(n.data || '{}');
        if (data.ticket_id) {
          logTicketHistory(data.ticket_id, req.user.id, req.user.username||req.user.email, 'dispatch_acknowledged', {
            awaiting_note: `${data.product_name} x${data.quantity}`
          });
        }
      } catch(e) {}
      res.json({ message: 'Acknowledged' });
    });
  });
});

// ===== NOTIFICATIONS =====

app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/notifications/pending-ack', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM notifications WHERE user_id = ? AND needs_ack = 1 AND is_read = 0 ORDER BY created_at DESC`,
    [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/notifications/unread-count', authenticateToken, (req, res) => {
  db.get(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: row?.count || 0 });
  });
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  db.run(`UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?`, [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Marked as read' });
  });
});

app.put('/api/notifications/read-all', authenticateToken, (req, res) => {
  db.run(`UPDATE notifications SET is_read=1 WHERE user_id=?`, [req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'All marked as read' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Database initialized at:', path.join(__dirname, 'warehouse.db'));
});

// ===== STAGE 9: Additional Costs File Upload =====

// Upload file for stage 9
app.post('/api/quotes/:id/stages/9/upload', authenticateToken, upload.single('file'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const now = new Date().toISOString();
  const uploadedBy = req.user.username || req.user.email;

  db.run(
    `INSERT INTO quote_stage_files (quote_id, stage_number, file_path, uploaded_by, uploaded_at)
     VALUES (?, 9, ?, ?, ?)`,
    [id, filePath, uploadedBy, now],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      logActivity(req.user.id, 'STAGE_9_FILE_UPLOADED', 'quote', id, { 
        file: req.file.filename,
        stage: 9
      });
      
      res.json({
        message: 'File uploaded successfully',
        file: {
          id: this.lastID,
          path: filePath,
          name: req.file.originalname,
          size: req.file.size,
          uploaded_at: now
        }
      });
    }
  );
});

// Get files for stage 9
app.get('/api/quotes/:id/stages/9/files', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT * FROM quote_stage_files 
     WHERE quote_id = ? AND stage_number = 9
     ORDER BY uploaded_at DESC`,
    [id],
    (err, files) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(files);
    }
  );
});

// Delete specific file from stage 9
app.delete('/api/quotes/:id/stages/9/files/:fileId', authenticateToken, (req, res) => {
  const { id, fileId } = req.params;
  
  // Get file path first
  db.get(
    `SELECT file_path FROM quote_stage_files WHERE id = ? AND quote_id = ? AND stage_number = 9`,
    [fileId, id],
    (err, file) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!file) return res.status(404).json({ error: 'File not found' });
      
      // Delete from DB
      db.run(
        `DELETE FROM quote_stage_files WHERE id = ? AND quote_id = ? AND stage_number = 9`,
        [fileId, id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          // Delete physical file
          const fs = require('fs');
          const path = require('path');
          const fullPath = path.join(__dirname, file.file_path);
          fs.unlink(fullPath, (err) => {
            if (err) console.error('Error deleting file:', err);
          });
          
          logActivity(req.user.id, 'STAGE_9_FILE_DELETED', 'quote', id, { 
            file_id: fileId,
            stage: 9
          });
          
          res.json({ message: 'File deleted successfully' });
        }
      );
    }
  );
});

// Complete stage 9 - mark as approved and close the deal
app.post('/api/quotes/:id/stages/9/complete', authenticateToken, (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const approvedBy = req.user.username || req.user.email;

  // Update stage 9 to approved
  db.run(
    `UPDATE quote_stages SET status = 'approved', approved_by = ?, approved_at = ?
     WHERE quote_id = ? AND stage_number = 9`,
    [approvedBy, now, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Now close the deal
      db.run(`UPDATE quotes SET status = 'closed' WHERE id = ?`, [id], () => {
        db.get('SELECT parent_id FROM quotes WHERE id = ?', [id], (err, row) => {
          const parentId = row?.parent_id || id;
          db.run(
            `UPDATE quotes SET status = 'closed' WHERE parent_id = ? OR id = ?`,
            [parentId, parentId],
            () => {}
          );
        });
      });
      
      logActivity(req.user.id, 'QUOTE_CLOSED', 'quote', id, { stage: 9 });
      
      res.json({ message: 'Stage 9 completed - deal closed successfully' });
    }
  );
});

