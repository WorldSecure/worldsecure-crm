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
