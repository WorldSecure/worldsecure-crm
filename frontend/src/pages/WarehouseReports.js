import React, { useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

function WarehouseReports() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isMobile = window.innerWidth <= 768;

  // Preload logo
  const [logoBase64Cache, setLogoBase64Cache] = useState('');
  React.useEffect(() => {
    const loadLogo = async () => {
      try {
        const response = await fetch('/logo.png', { cache: 'force-cache' });
        if (!response.ok) return;
        const blob = await response.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        setLogoBase64Cache(base64);
      } catch (err) { console.log('Logo preload failed:', err); }
    };
    loadLogo();
  }, []);

  // ── State: דוח 1 - מלאי נוכחי ──
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryData, setInventoryData] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySort, setInventorySort] = useState({ field: 'name', dir: 'asc' });
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryPageSize, setInventoryPageSize] = useState(10);
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);

  // ── State: דוח 2 - תנועות ──
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsData, setMovementsData] = useState(null);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsSort, setMovementsSort] = useState({ field: 'date', dir: 'desc' });
  const [movementsTypeFilter, setMovementsTypeFilter] = useState('all');
  const [movementsDateFilter, setMovementsDateFilter] = useState('30d');
  const [movementsCustomFrom, setMovementsCustomFrom] = useState('');
  const [movementsCustomTo, setMovementsCustomTo] = useState('');
  const [movementsAllData, setMovementsAllData] = useState(null);

  // ── State: דוח 3 - מלאי נמוך ──
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [lowStockData, setLowStockData] = useState(null);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockSort, setLowStockSort] = useState({ field: 'shortage', dir: 'desc' });

  // ── State: דוח 4 - ספקים פעילים ──
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [suppliersData, setSuppliersData] = useState(null);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersSort, setSuppliersSort] = useState({ field: 'total_receipts', dir: 'desc' });
  const [suppliersDateFilter, setSuppliersDateFilter] = useState('all');
  const [suppliersCustomFrom, setSuppliersCustomFrom] = useState('');
  const [suppliersCustomTo, setSuppliersCustomTo] = useState('');
  const [suppliersAllData, setSuppliersAllData] = useState(null);

  // ── State: דוח 5 - ערך מלאי כולל (Admin only) ──
  const [valueOpen, setValueOpen] = useState(false);
  const [valueData, setValueData] = useState(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueSort, setValueSort] = useState({ field: 'total_value', dir: 'desc' });
  const [valueSearch, setValueSearch] = useState('');
  const [valuePageSize, setValuePageSize] = useState(10);
  const [valueCurrentPage, setValueCurrentPage] = useState(1);

  // ── Helpers ──
  const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0);

  const getProductName = (p) => {
    if (language === 'he' && p.name_he) return p.name_he;
    if (language === 'pt' && p.name_pt) return p.name_pt;
    return p.name;
  };

  const doSort = (rows, field, dir, getters) => [...rows].sort((a, b) => {
    const av = getters[field] ? getters[field](a) : (a[field] || '');
    const bv = getters[field] ? getters[field](b) : (b[field] || '');
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });

  const applyDateFilter = (data, filter, customFrom, customTo, dateField = 'date') => {
    if (!data || filter === 'all') return data;
    const now = new Date();
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
    let from = null, to = null;
    if (filter === '7d') { from = new Date(now - 7 * 86400000); }
    else if (filter === '30d') { from = new Date(now - 30 * 86400000); }
    else if (filter === '90d') { from = new Date(now - 90 * 86400000); }
    else if (filter === 'this_month') { from = startOfMonth(now); }
    else if (filter === 'last_month') { from = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = startOfMonth(now); }
    else if (filter === 'this_quarter') { from = startOfQuarter(now); }
    else if (filter === 'last_quarter') { from = startOfQuarter(new Date(now.getFullYear(), now.getMonth() - 3, 1)); to = startOfQuarter(now); }
    else if (filter === 'this_year') { from = startOfYear(now); }
    else if (filter === 'last_year') { from = startOfYear(new Date(now.getFullYear() - 1, 0, 1)); to = startOfYear(now); }
    else if (filter === 'custom') {
      from = customFrom ? new Date(new Date(customFrom).setHours(0, 0, 0, 0)) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23, 59, 59, 999)) : null;
    }
    return data.filter(r => {
      const d = r[dateField] ? new Date(r[dateField]) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  };

  const buildSupplierStats = (transactions) => {
    const map = {};
    transactions.forEach(tx => {
      const name = tx.supplier_type === 'casual' ? tx.casual_supplier_name : (tx.supplier_name || 'Unknown');
      if (!map[name]) map[name] = { supplier_name: name, total_receipts: 0, last_date: null };
      map[name].total_receipts++;
      if (!map[name].last_date || tx.transaction_date > map[name].last_date) map[name].last_date = tx.transaction_date;
    });
    return Object.values(map);
  };

  // ── Toggle functions ──
  const toggleInventory = async () => {
    if (inventoryOpen) { setInventoryOpen(false); return; }
    setInventoryLoading(true);
    try { const res = await axios.get('/api/products'); setInventoryData(res.data); } catch (e) { console.error(e); }
    setInventoryLoading(false);
    setInventoryOpen(true);
  };

  const toggleMovements = async () => {
    if (movementsOpen) { setMovementsOpen(false); return; }
    setMovementsLoading(true);
    try {
      const [inRes, outRes] = await Promise.all([axios.get('/api/inbound'), axios.get('/api/outbound')]);
      const inbound = inRes.data.map(tx => ({ ...tx, type: 'inbound', date: tx.transaction_date, party: tx.supplier_type === 'casual' ? tx.casual_supplier_name : (tx.supplier_name || '-') }));
      const outbound = outRes.data.map(tx => ({ ...tx, type: 'outbound', date: tx.transaction_date, party: tx.customer_type === 'casual' ? tx.casual_customer_name : (tx.customer_name || '-') }));
      const all = [...inbound, ...outbound].sort((a, b) => new Date(b.date) - new Date(a.date));
      setMovementsAllData(all);
      setMovementsData(applyDateFilter(all, movementsDateFilter, movementsCustomFrom, movementsCustomTo));
    } catch (e) { console.error(e); }
    setMovementsLoading(false);
    setMovementsOpen(true);
  };

  const toggleLowStock = async () => {
    if (lowStockOpen) { setLowStockOpen(false); return; }
    setLowStockLoading(true);
    try {
      const res = await axios.get('/api/products/low-stock');
      setLowStockData(res.data.map(p => ({ ...p, name_display: getProductName(p), shortage: (p.min_quantity || 0) - (p.quantity || 0) })));
    } catch (e) { console.error(e); }
    setLowStockLoading(false);
    setLowStockOpen(true);
  };

  const toggleSuppliers = async () => {
    if (suppliersOpen) { setSuppliersOpen(false); return; }
    setSuppliersLoading(true);
    try {
      const res = await axios.get('/api/inbound');
      setSuppliersAllData(res.data);
      setSuppliersData(buildSupplierStats(applyDateFilter(res.data, suppliersDateFilter, suppliersCustomFrom, suppliersCustomTo, 'transaction_date')));
    } catch (e) { console.error(e); }
    setSuppliersLoading(false);
    setSuppliersOpen(true);
  };

  // ── Getters for sort ──
  const inventoryGetters = { name: r => getProductName(r) || '', sku: r => r.sku || '', quantity: r => r.quantity || 0, min_quantity: r => r.min_quantity || 0, category: r => r.category_name || '' };
  const movementsGetters = { date: r => r.date || '', type: r => r.type || '', party: r => r.party || '', notes: r => r.notes || '' };
  const lowStockGetters = { name: r => r.name_display || '', sku: r => r.sku || '', quantity: r => r.quantity || 0, min_quantity: r => r.min_quantity || 0, shortage: r => r.shortage || 0 };
  const suppliersGetters = { supplier_name: r => r.supplier_name || '', total_receipts: r => r.total_receipts || 0, last_date: r => r.last_date || '' };

  const toggleValue = async () => {
    if (valueOpen) { setValueOpen(false); return; }
    setValueLoading(true);
    try {
      const res = await axios.get('/api/products');
      // Only products with price > 0 and quantity > 0
      const withValue = res.data
        .filter(p => (p.price || 0) > 0 && (p.quantity || 0) > 0)
        .map(p => ({
          ...p,
          name_display: getProductName(p),
          total_value: (p.price || 0) * (p.quantity || 0),
        }));
      setValueData(withValue);
    } catch (e) { console.error(e); }
    setValueLoading(false);
    setValueOpen(true);
  };

  const valueGetters = {
    name: r => r.name_display || '',
    sku: r => r.sku || '',
    category: r => r.category_name || '',
    quantity: r => r.quantity || 0,
    price: r => r.price || 0,
    total_value: r => r.total_value || 0,
    currency: r => r.currency || '',
  };

  // ── UI Components ──
  const SortTh = ({ field, sortState, onSort, children, style = {} }) => {
    const active = sortState.field === field;
    return (
      <th onClick={() => onSort(field)} style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: active ? '#eef2ff' : '#f8f9fa', textAlign: 'left', ...style }}>
        <span style={{ marginLeft: '4px', color: active ? '#3b5bdb' : '#aaa', fontSize: '0.75rem' }}>{active ? (sortState.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
        <span style={{ fontWeight: 600, color: active ? '#3b5bdb' : '#495057' }}>{children}</span>
      </th>
    );
  };

  const AccordionBtn = ({ open, onClick, color, children }) => (
    <button onClick={onClick} style={{ width: '100%', padding: '0.85rem 1.4rem', background: open ? color.dark : color.base, color: 'white', border: 'none', borderRadius: open ? '8px 8px 0 0' : '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }}>
      <span>{children}</span>
      <span style={{ fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
    </button>
  );

  const AccordionBody = ({ open, loading, children }) => (
    <div style={{ maxHeight: open ? '3000px' : '0', overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
      <div style={{ background: 'white', border: '1px solid #dee2e6', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: loading ? '2rem' : '0', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', color: '#888' }}>טוען...</div> : children}
      </div>
    </div>
  );

  const FilterBar = ({ activeFilter, onFilter, color, customFrom, customTo, onCustomFrom, onCustomTo }) => (
    <>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#f8f9fa', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: '#555', fontSize: '0.88rem' }}>📅</span>
        {[
          { key: 'all', label: t('filter_all') || 'All' },
          { key: '7d', label: t('filter_7d') || 'Last 7 days' },
          { key: '30d', label: t('filter_30d') || 'Last 30 days' },
          { key: '90d', label: t('filter_90d') || 'Last 90 days' },
          { key: 'this_month', label: t('filter_this_month') || 'This month' },
          { key: 'last_month', label: t('filter_last_month') || 'Last month' },
          { key: 'this_quarter', label: t('filter_this_quarter') || 'This quarter' },
          { key: 'last_quarter', label: t('filter_last_quarter') || 'Last quarter' },
          { key: 'this_year', label: t('filter_this_year') || 'This year' },
          { key: 'last_year', label: t('filter_last_year') || 'Last year' },
          { key: 'custom', label: t('filter_custom') || 'Custom' },
        ].map(opt => (
          <button key={opt.key} onClick={() => onFilter(opt.key)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer', background: activeFilter === opt.key ? color : '#e9ecef', color: activeFilter === opt.key ? 'white' : '#495057' }}>{opt.label}</button>
        ))}
      </div>
      {activeFilter === 'custom' && (
        <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('from') || 'From'}:</label>
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
          <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('to') || 'To'}:</label>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
        </div>
      )}
    </>
  );

  const PrintBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      🖨️ {t('print_pdf') || 'Print / Save as PDF'}
    </button>
  );

  const openPrint = (html) => {
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const printHeader = (title, color) => {
    const dir = language === 'he' ? 'rtl' : 'ltr';
    const ta = language === 'he' ? 'right' : 'left';
    const locale = language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US';
    return `<html dir="${dir}"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;direction:${dir};margin:0}
        .hdr{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:3px solid ${color};margin-bottom:30px}
        .logo{width:150px;height:auto}
        .ci strong{display:block;color:${color};font-size:1.8rem;font-weight:700}
        h1{text-align:center;color:${color};margin:20px 0;font-size:1.8rem}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{border:1px solid #dee2e6;padding:10px;text-align:${ta};font-size:0.85rem}
        th{background:#f8f9fa;font-weight:600}
        tfoot tr{background:#f0f0f0;font-weight:700}
        .footer{margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6;text-align:center;color:#999;font-size:0.8rem}
        .btn-c{text-align:center;margin-bottom:20px;padding:15px;background:#f8f9fa;border-bottom:1px solid #dee2e6}
        .bp,.bc{padding:12px 24px;margin:0 8px;font-size:16px;cursor:pointer;border:none;border-radius:5px;font-weight:600}
        .bp{background:#3498db;color:white}.bc{background:#95a5a6;color:white}
        @media print{.btn-c{display:none!important}}
      </style></head><body>
      <div class="btn-c">
        <button class="bp" onclick="window.print()">&#128424; Print / Save as PDF</button>
        <button class="bc" onclick="window.close()">&#10005; Close</button>
      </div>
      <div class="hdr">
        ${logoBase64Cache ? `<img src="${logoBase64Cache}" class="logo" alt="Logo">` : `<div style="font-size:2rem;color:${color};font-weight:700;">🌐 WorldSecure</div>`}
        <div class="ci"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(locale)}</div></div>
      </div>
      <h1>${title}</h1>`;
  };

  const RefreshBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
      🔄 {t('refresh') || 'רענן'}
    </button>
  );

  // ═══════════════════════════════════════════
  return (
    <div>
      <div className="page-header">
        <h2>📊 {t('warehouse_reports') || 'דוחות מחסן'}</h2>
      </div>

      {/* ── דוח 1: מלאי נוכחי ── */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={inventoryOpen} onClick={toggleInventory} color={{ base: '#007bff', dark: '#0056b3' }}>
          📦 {t('current_inventory') || 'מלאי נוכחי'}
        </AccordionBtn>
        <AccordionBody open={inventoryOpen} loading={inventoryLoading}>
          {inventoryData && (() => {
            const q = inventorySearch.toLowerCase();
            const filtered = q ? inventoryData.filter(p => getProductName(p).toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)) : inventoryData;
            const sorted = doSort(filtered, inventorySort.field, inventorySort.dir, inventoryGetters);
            const handleSort = f => { setInventorySort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' })); setInventoryCurrentPage(1); };
            const totalPages = inventoryPageSize === 'all' ? 1 : Math.ceil(sorted.length / inventoryPageSize);
            const paginated = inventoryPageSize === 'all' ? sorted : sorted.slice((inventoryCurrentPage - 1) * inventoryPageSize, inventoryCurrentPage * inventoryPageSize);
            return (
              <>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>🔍</span>
                    <input type="text" placeholder={t('search') || 'חיפוש...'} value={inventorySearch} onChange={e => { setInventorySearch(e.target.value); setInventoryCurrentPage(1); }}
                      style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem', outline: 'none', width: '200px' }} />
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>{t('products') || 'מוצרים'}: <strong>{filtered.length}</strong></span>
                  </div>
                  <RefreshBtn onClick={async () => { setInventoryLoading(true); try { const r = await axios.get('/api/products'); setInventoryData(r.data); } catch (e) {} setInventoryLoading(false); }} />
                </div>
                <div style={{ display: isMobile ? 'none' : 'block' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="sku" sortState={inventorySort} onSort={handleSort} style={{ width: '110px' }}>SKU</SortTh>
                      <SortTh field="name" sortState={inventorySort} onSort={handleSort}>{t('product') || 'מוצר'}</SortTh>
                      <SortTh field="category" sortState={inventorySort} onSort={handleSort} style={{ width: '130px' }}>{t('category') || 'קטגוריה'}</SortTh>
                      <SortTh field="quantity" sortState={inventorySort} onSort={handleSort} style={{ width: '100px', textAlign: 'center' }}>{t('quantity') || 'כמות'}</SortTh>
                      <SortTh field="min_quantity" sortState={inventorySort} onSort={handleSort} style={{ width: '100px', textAlign: 'center' }}>{t('min_quantity') || 'מינימום'}</SortTh>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', width: '90px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>{t('status') || 'סטטוס'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((p, i) => {
                      const isLow = (p.quantity || 0) <= (p.min_quantity || 0);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', color: '#888', fontSize: '0.82rem' }}>{p.sku || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{getProductName(p)}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', fontSize: '0.85rem' }}>{p.category_name || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: isLow ? '#f8d7da' : '#d4edda', color: isLow ? '#721c24' : '#155724', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{fmt(p.quantity)}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666' }}>{fmt(p.min_quantity || 0)}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {isLow
                              ? <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>⚠️ {t('low_stock') || 'נמוך'}</span>
                              : <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>✅ {t('ok') || 'תקין'}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#e3f2fd', fontWeight: 700, borderTop: '2px solid #007bff' }}>
                      <td colSpan={3} style={{ padding: '0.65rem 1rem', color: '#1565c0' }}>{t('total') || 'סה"כ'}: {sorted.length} {t('products') || 'מוצרים'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#1565c0' }}>{fmt(sorted.reduce((s, p) => s + (p.quantity || 0), 0))}</td>
                      <td></td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#721c24' }}>⚠️ {sorted.filter(p => (p.quantity || 0) <= (p.min_quantity || 0)).length}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
                {/* Mobile Cards */}
                <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
                  {paginated.map(p => {
                    const isLow = (p.quantity || 0) <= (p.min_quantity || 0);
                    return (
                      <div key={p.id} style={{ background: 'white', border: `1px solid ${isLow ? '#f5c6cb' : '#e2e8f0'}`, borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: '#888' }}>{p.sku || '-'}</span>
                          {isLow
                            ? <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>⚠️ {t('low_stock') || 'נמוך'}</span>
                            : <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>✅ {t('ok') || 'תקין'}</span>}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.25rem' }}>📦 {getProductName(p)}</div>
                        {p.category_name && <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.4rem' }}>🏷️ {p.category_name}</div>}
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('quantity') || 'כמות'}</div>
                            <span style={{ background: isLow ? '#f8d7da' : '#d4edda', color: isLow ? '#721c24' : '#155724', padding: '2px 12px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem' }}>{fmt(p.quantity)}</span>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('min_quantity') || 'מינימום'}</div>
                            <span style={{ color: '#666', fontWeight: 600, fontSize: '0.9rem' }}>{fmt(p.min_quantity || 0)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Pagination Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#555' }}>
                    <span>{sorted.length} {t('products') || 'מוצרים'}</span>
                    <span>|</span>
                    <label>{t('per_page') || 'פר עמוד'}:</label>
                    <select value={inventoryPageSize} onChange={e => { setInventoryPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setInventoryCurrentPage(1); }}
                      style={{ padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}>
                      {[10, 15, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="all">{t('all') || 'הכל'}</option>
                    </select>
                  </div>
                  {inventoryPageSize !== 'all' && totalPages > 1 && (
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button onClick={() => setInventoryCurrentPage(1)} disabled={inventoryCurrentPage === 1}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: inventoryCurrentPage === 1 ? '#f3f4f6' : '#fff', cursor: inventoryCurrentPage === 1 ? 'default' : 'pointer' }}>«</button>
                      <button onClick={() => setInventoryCurrentPage(p => Math.max(1, p - 1))} disabled={inventoryCurrentPage === 1}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: inventoryCurrentPage === 1 ? '#f3f4f6' : '#fff', cursor: inventoryCurrentPage === 1 ? 'default' : 'pointer' }}>‹</button>
                      <span style={{ fontSize: '0.85rem', padding: '0 0.3rem' }}>{inventoryCurrentPage} / {totalPages}</span>
                      <button onClick={() => setInventoryCurrentPage(p => Math.min(totalPages, p + 1))} disabled={inventoryCurrentPage === totalPages}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: inventoryCurrentPage === totalPages ? '#f3f4f6' : '#fff', cursor: inventoryCurrentPage === totalPages ? 'default' : 'pointer' }}>›</button>
                      <button onClick={() => setInventoryCurrentPage(totalPages)} disabled={inventoryCurrentPage === totalPages}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: inventoryCurrentPage === totalPages ? '#f3f4f6' : '#fff', cursor: inventoryCurrentPage === totalPages ? 'default' : 'pointer' }}>»</button>
                    </div>
                  )}
                </div>
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end' }}>
                  <PrintBtn onClick={() => {
                    const rows = sorted.map(p => {
                      const isLow = (p.quantity || 0) <= (p.min_quantity || 0);
                      return `<tr><td>${p.sku || '-'}</td><td>${getProductName(p)}</td><td>${p.category_name || '-'}</td><td style="text-align:center;">${fmt(p.quantity)}</td><td style="text-align:center;">${fmt(p.min_quantity || 0)}</td><td style="text-align:center;">${isLow ? '⚠️ Low' : '✅ OK'}</td></tr>`;
                    }).join('');
                    openPrint(printHeader(`📦 ${t('current_inventory') || 'מלאי נוכחי'}`, '#007bff')
                      + `<table><thead><tr><th>SKU</th><th>${t('product') || 'מוצר'}</th><th>${t('category') || 'קטגוריה'}</th><th>${t('quantity') || 'כמות'}</th><th>${t('min_quantity') || 'מינימום'}</th><th>${t('status') || 'סטטוס'}</th></tr></thead><tbody>${rows}</tbody></table>`
                      + `<div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString()}</div></body></html>`);
                  }} />
                </div>
              </>
            );
          })()}
        </AccordionBody>
      </div>

      {/* ── דוח 2: תנועות מחסן ── */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={movementsOpen} onClick={toggleMovements} color={{ base: '#28a745', dark: '#1e7e34' }}>
          🔄 {t('warehouse_movements') || 'תנועות מחסן'}
        </AccordionBtn>
        <AccordionBody open={movementsOpen} loading={movementsLoading}>
          {movementsData && (() => {
            const handleSort = f => setMovementsSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
            const typeFiltered = movementsData.filter(r => movementsTypeFilter === 'all' || r.type === movementsTypeFilter);
            const sorted = doSort(typeFiltered, movementsSort.field, movementsSort.dir, movementsGetters);
            return (
              <>
                <FilterBar
                  activeFilter={movementsDateFilter}
                  onFilter={f => { setMovementsDateFilter(f); setMovementsData(applyDateFilter(movementsAllData, f, movementsCustomFrom, movementsCustomTo)); }}
                  color="#28a745"
                  customFrom={movementsCustomFrom}
                  customTo={movementsCustomTo}
                  onCustomFrom={v => { setMovementsCustomFrom(v); setMovementsData(applyDateFilter(movementsAllData, 'custom', v, movementsCustomTo)); }}
                  onCustomTo={v => { setMovementsCustomTo(v); setMovementsData(applyDateFilter(movementsAllData, 'custom', movementsCustomFrom, v)); }}
                />
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: t('filter_all') || 'All', bg: '#495057' },
                    { key: 'inbound', label: `⬇️ ${t('inbound') || 'כניסות'}`, bg: '#007bff' },
                    { key: 'outbound', label: `⬆️ ${t('outbound') || 'יציאות'}`, bg: '#dc3545' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setMovementsTypeFilter(opt.key)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer', background: movementsTypeFilter === opt.key ? opt.bg : '#e9ecef', color: movementsTypeFilter === opt.key ? 'white' : '#495057' }}>{opt.label}</button>
                  ))}
                  <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.85rem' }}>
                    {t('total') || 'סה"כ'}: <strong>{sorted.length}</strong>
                    {movementsAllData && movementsDateFilter !== 'all' && <span style={{ color: '#999' }}> / {movementsAllData.length}</span>}
                  </span>
                  <RefreshBtn onClick={async () => {
                    setMovementsLoading(true);
                    try {
                      const [i, o] = await Promise.all([axios.get('/api/inbound'), axios.get('/api/outbound')]);
                      const all = [...i.data.map(tx => ({ ...tx, type: 'inbound', date: tx.transaction_date, party: tx.supplier_type === 'casual' ? tx.casual_supplier_name : (tx.supplier_name || '-') })),
                        ...o.data.map(tx => ({ ...tx, type: 'outbound', date: tx.transaction_date, party: tx.customer_type === 'casual' ? tx.casual_customer_name : (tx.customer_name || '-') }))
                      ].sort((a, b) => new Date(b.date) - new Date(a.date));
                      setMovementsAllData(all);
                      setMovementsData(applyDateFilter(all, movementsDateFilter, movementsCustomFrom, movementsCustomTo));
                    } catch (e) { console.error(e); }
                    setMovementsLoading(false);
                  }} />
                </div>
                <div style={{ display: isMobile ? 'none' : 'block' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="date" sortState={movementsSort} onSort={handleSort} style={{ width: '120px' }}>{t('date') || 'תאריך'}</SortTh>
                      <SortTh field="type" sortState={movementsSort} onSort={handleSort} style={{ width: '130px', textAlign: 'center' }}>{t('type') || 'סוג'}</SortTh>
                      <SortTh field="party" sortState={movementsSort} onSort={handleSort} style={{ minWidth: '200px' }}>{t('supplier') || 'ספק / לקוח'}</SortTh>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#495057', textAlign: 'left' }}>{t('notes') || 'הערות'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0
                      ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'אין נתונים'}</td></tr>
                      : sorted.map((r, i) => (
                        <tr key={`${r.type}-${r.id}`} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{r.date ? new Date(r.date).toLocaleDateString() : '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {r.type === 'inbound'
                              ? <span style={{ background: '#cce5ff', color: '#004085', padding: '2px 8px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 600 }}>⬇️ {t('inbound') || 'קבלה'}</span>
                              : <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 600 }}>⬆️ {t('outbound') || 'משלוח'}</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{r.party}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', fontSize: '0.85rem' }}>{r.notes || '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#d4edda', fontWeight: 700, borderTop: '2px solid #28a745' }}>
                      <td style={{ padding: '0.65rem 1rem', color: '#155724' }}>{t('total') || 'סה"כ'}: {sorted.length}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <span style={{ color: '#004085' }}>⬇️ {sorted.filter(r => r.type === 'inbound').length}</span>
                        {' / '}
                        <span style={{ color: '#721c24' }}>⬆️ {sorted.filter(r => r.type === 'outbound').length}</span>
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
                </div>
                {/* Mobile Cards */}
                <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
                  {sorted.length === 0
                    ? <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'אין נתונים'}</div>
                    : sorted.map(r => (
                      <div key={`${r.type}-${r.id}`} style={{ background: 'white', border: `1px solid ${r.type === 'inbound' ? '#b8daff' : '#f5c6cb'}`, borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{r.date ? new Date(r.date).toLocaleDateString() : '-'}</span>
                          {r.type === 'inbound'
                            ? <span style={{ background: '#cce5ff', color: '#004085', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>⬇️ {t('inbound') || 'קבלה'}</span>
                            : <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>⬆️ {t('outbound') || 'משלוח'}</span>}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                          {r.type === 'inbound' ? '🏭' : '👤'} {r.party}
                        </div>
                        {r.notes && <div style={{ fontSize: '0.82rem', color: '#64748b' }}>📝 {r.notes}</div>}
                      </div>
                    ))}
                </div>
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end' }}>
                  <PrintBtn onClick={() => {
                    const rows = sorted.map(r => `<tr><td>${r.date ? new Date(r.date).toLocaleDateString() : '-'}</td><td style="text-align:center;">${r.type === 'inbound' ? '⬇️ Inbound' : '⬆️ Outbound'}</td><td>${r.party}</td><td>${r.notes || '-'}</td></tr>`).join('');
                    openPrint(printHeader(`🔄 ${t('warehouse_movements') || 'תנועות מחסן'}`, '#28a745')
                      + `<table><thead><tr><th>${t('date') || 'תאריך'}</th><th>${t('type') || 'סוג'}</th><th>${t('supplier') || 'ספק/לקוח'}</th><th>${t('notes') || 'הערות'}</th></tr></thead><tbody>${rows}</tbody></table>`
                      + `<div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString()}</div></body></html>`);
                  }} />
                </div>
              </>
            );
          })()}
        </AccordionBody>
      </div>

      {/* ── דוח 3: מלאי נמוך ── */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={lowStockOpen} onClick={toggleLowStock} color={{ base: '#dc3545', dark: '#a71d2a' }}>
          ⚠️ {t('low_stock_report') || 'מוצרים עם מלאי נמוך'}
        </AccordionBtn>
        <AccordionBody open={lowStockOpen} loading={lowStockLoading}>
          {lowStockData && (() => {
            const handleSort = f => setLowStockSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
            const sorted = doSort(lowStockData, lowStockSort.field, lowStockSort.dir, lowStockGetters);
            return (
              <>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#721c24', fontWeight: 600, fontSize: '0.9rem' }}>
                    ⚠️ {lowStockData.length} {t('products') || 'מוצרים'} {t('below_minimum') || 'מתחת למינימום'}
                  </span>
                  <RefreshBtn onClick={async () => {
                    setLowStockLoading(true);
                    try { const r = await axios.get('/api/products/low-stock'); setLowStockData(r.data.map(p => ({ ...p, name_display: getProductName(p), shortage: (p.min_quantity || 0) - (p.quantity || 0) }))); } catch (e) { console.error(e); }
                    setLowStockLoading(false);
                  }} />
                </div>
                {lowStockData.length === 0
                  ? <div style={{ padding: '2rem', textAlign: 'center', color: '#155724', fontWeight: 600 }}>✅ {t('all_stock_ok') || 'כל המוצרים תקינים!'}</div>
                  : (
                    <>
                    <div style={{ display: isMobile ? 'none' : 'block' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          <SortTh field="sku" sortState={lowStockSort} onSort={handleSort} style={{ width: '110px' }}>SKU</SortTh>
                          <SortTh field="name" sortState={lowStockSort} onSort={handleSort}>{t('product') || 'מוצר'}</SortTh>
                          <SortTh field="quantity" sortState={lowStockSort} onSort={handleSort} style={{ width: '100px', textAlign: 'center' }}>{t('quantity') || 'כמות'}</SortTh>
                          <SortTh field="min_quantity" sortState={lowStockSort} onSort={handleSort} style={{ width: '100px', textAlign: 'center' }}>{t('min_quantity') || 'מינימום'}</SortTh>
                          <SortTh field="shortage" sortState={lowStockSort} onSort={handleSort} style={{ width: '110px', textAlign: 'center' }}>{t('shortage') || 'חסר'}</SortTh>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff5f5' : 'white' }}>
                            <td style={{ padding: '0.6rem 1rem', color: '#888', fontSize: '0.82rem' }}>{p.sku || '-'}</td>
                            <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{p.name_display}</td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                              <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{fmt(p.quantity)}</span>
                            </td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666' }}>{fmt(p.min_quantity || 0)}</td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                              <span style={{ background: '#721c24', color: 'white', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>-{fmt(p.shortage)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8d7da', fontWeight: 700, borderTop: '2px solid #dc3545' }}>
                          <td colSpan={2} style={{ padding: '0.65rem 1rem', color: '#721c24' }}>{t('total') || 'סה"כ'}: {sorted.length}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#721c24' }}>{fmt(sorted.reduce((s, p) => s + (p.quantity || 0), 0))}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#721c24' }}>{fmt(sorted.reduce((s, p) => s + (p.min_quantity || 0), 0))}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#721c24' }}>-{fmt(sorted.reduce((s, p) => s + (p.shortage || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                    {/* Mobile Cards */}
                    <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
                      {sorted.map(p => (
                        <div key={p.id} style={{ background: 'white', border: '1px solid #f5c6cb', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#888' }}>{p.sku || '-'}</span>
                            <span style={{ background: '#721c24', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>-{fmt(p.shortage)} {t('shortage') || 'חסר'}</span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#721c24', marginBottom: '0.5rem' }}>⚠️ {p.name_display}</div>
                          <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('quantity') || 'כמות'}</div>
                              <span style={{ background: '#f8d7da', color: '#721c24', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem' }}>{fmt(p.quantity)}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('min_quantity') || 'מינימום'}</div>
                              <span style={{ color: '#666', fontWeight: 600, fontSize: '0.9rem' }}>{fmt(p.min_quantity || 0)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end' }}>
                  <PrintBtn onClick={() => {
                    const rows = sorted.map(p => `<tr><td>${p.sku || '-'}</td><td>${p.name_display}</td><td style="text-align:center;">${fmt(p.quantity)}</td><td style="text-align:center;">${fmt(p.min_quantity || 0)}</td><td style="text-align:center;">-${fmt(p.shortage)}</td></tr>`).join('');
                    openPrint(printHeader(`⚠️ ${t('low_stock_report') || 'מלאי נמוך'}`, '#dc3545')
                      + `<table><thead><tr><th>SKU</th><th>${t('product') || 'מוצר'}</th><th>${t('quantity') || 'כמות'}</th><th>${t('min_quantity') || 'מינימום'}</th><th>${t('shortage') || 'חסר'}</th></tr></thead><tbody>${rows}</tbody></table>`
                      + `<div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString()}</div></body></html>`);
                  }} />
                </div>
              </>
            );
          })()}
        </AccordionBody>
      </div>

      {/* ── דוח 4: ספקים פעילים ── */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={suppliersOpen} onClick={toggleSuppliers} color={{ base: '#6f42c1', dark: '#553098' }}>
          🏭 {t('active_suppliers_report') || 'ספקים פעילים'}
        </AccordionBtn>
        <AccordionBody open={suppliersOpen} loading={suppliersLoading}>
          {suppliersData && (() => {
            const handleSort = f => setSuppliersSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
            const sorted = doSort(suppliersData, suppliersSort.field, suppliersSort.dir, suppliersGetters);
            return (
              <>
                <FilterBar
                  activeFilter={suppliersDateFilter}
                  onFilter={f => { setSuppliersDateFilter(f); setSuppliersData(buildSupplierStats(applyDateFilter(suppliersAllData, f, suppliersCustomFrom, suppliersCustomTo, 'transaction_date'))); }}
                  color="#6f42c1"
                  customFrom={suppliersCustomFrom}
                  customTo={suppliersCustomTo}
                  onCustomFrom={v => { setSuppliersCustomFrom(v); setSuppliersData(buildSupplierStats(applyDateFilter(suppliersAllData, 'custom', v, suppliersCustomTo, 'transaction_date'))); }}
                  onCustomTo={v => { setSuppliersCustomTo(v); setSuppliersData(buildSupplierStats(applyDateFilter(suppliersAllData, 'custom', suppliersCustomFrom, v, 'transaction_date'))); }}
                />
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#666', fontSize: '0.88rem' }}>{t('suppliers') || 'ספקים'}: <strong>{sorted.length}</strong>
                    {suppliersAllData && suppliersDateFilter !== 'all' && <span style={{ color: '#999' }}> | {t('total_receipts') || 'קבלות'}: <strong>{sorted.reduce((s, r) => s + r.total_receipts, 0)}</strong></span>}
                  </span>
                  <RefreshBtn onClick={async () => {
                    setSuppliersLoading(true);
                    try { const r = await axios.get('/api/inbound'); setSuppliersAllData(r.data); setSuppliersData(buildSupplierStats(applyDateFilter(r.data, suppliersDateFilter, suppliersCustomFrom, suppliersCustomTo, 'transaction_date'))); } catch (e) { console.error(e); }
                    setSuppliersLoading(false);
                  }} />
                </div>
                {sorted.length === 0
                  ? <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'אין נתונים'}</div>
                  : (
                    <>
                    <div style={{ display: isMobile ? 'none' : 'block' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          <SortTh field="supplier_name" sortState={suppliersSort} onSort={handleSort} style={{ minWidth: '200px' }}>{t('supplier') || 'ספק'}</SortTh>
                          <SortTh field="total_receipts" sortState={suppliersSort} onSort={handleSort} style={{ width: '130px', textAlign: 'center' }}>{t('total_receipts') || 'סה"כ קבלות'}</SortTh>
                          <SortTh field="last_date" sortState={suppliersSort} onSort={handleSort} style={{ width: '140px', textAlign: 'center' }}>{t('last_receipt') || 'קבלה אחרונה'}</SortTh>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r, i) => (
                          <tr key={r.supplier_name} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>🏭 {r.supplier_name}</td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                              <span style={{ background: '#ede7f6', color: '#4527a0', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{r.total_receipts}</span>
                            </td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666' }}>{r.last_date ? new Date(r.last_date).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#ede7f6', fontWeight: 700, borderTop: '2px solid #6f42c1' }}>
                          <td style={{ padding: '0.65rem 1rem', color: '#4527a0' }}>{t('total') || 'סה"כ'}: {sorted.length}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#4527a0' }}>{sorted.reduce((s, r) => s + r.total_receipts, 0)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                    {/* Mobile Cards */}
                    <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
                      {sorted.map(r => (
                        <div key={r.supplier_name} style={{ background: 'white', border: '1px solid #d1c4e9', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.5rem' }}>🏭 {r.supplier_name}</div>
                          <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('total_receipts') || 'קבלות'}</div>
                              <span style={{ background: '#ede7f6', color: '#4527a0', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem' }}>{r.total_receipts}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>{t('last_receipt') || 'קבלה אחרונה'}</div>
                              <span style={{ color: '#666', fontWeight: 600, fontSize: '0.85rem' }}>{r.last_date ? new Date(r.last_date).toLocaleDateString() : '-'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end' }}>
                  <PrintBtn onClick={() => {
                    const rows = sorted.map(r => `<tr><td>${r.supplier_name}</td><td style="text-align:center;">${r.total_receipts}</td><td style="text-align:center;">${r.last_date ? new Date(r.last_date).toLocaleDateString() : '-'}</td></tr>`).join('');
                    openPrint(printHeader(`🏭 ${t('active_suppliers_report') || 'ספקים פעילים'}`, '#6f42c1')
                      + `<table><thead><tr><th>${t('supplier') || 'ספק'}</th><th>${t('total_receipts') || 'קבלות'}</th><th>${t('last_receipt') || 'קבלה אחרונה'}</th></tr></thead><tbody>${rows}</tbody></table>`
                      + `<div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString()}</div></body></html>`);
                  }} />
                </div>
              </>
            );
          })()}
        </AccordionBody>
      </div>

      {/* ── דוח 5: ערך מלאי כולל (Admin only) ── */}
      {isAdmin && window.location.pathname.startsWith('/admin') && (
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={valueOpen} onClick={toggleValue} color={{ base: '#20c997', dark: '#12b886' }}>
          💰 {t('inventory_value_report') || 'Inventory Value Report'}
        </AccordionBtn>
        <AccordionBody open={valueOpen} loading={valueLoading}>
          {valueData && (() => {
            const q = valueSearch.toLowerCase();
            const filtered = q ? valueData.filter(p => p.name_display.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.category_name || '').toLowerCase().includes(q)) : valueData;
            const sorted = doSort(filtered, valueSort.field, valueSort.dir, valueGetters);
            const handleSort = f => { setValueSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' })); setValueCurrentPage(1); };
            const totalPages = valuePageSize === 'all' ? 1 : Math.ceil(sorted.length / valuePageSize);
            const paginated = valuePageSize === 'all' ? sorted : sorted.slice((valueCurrentPage - 1) * valuePageSize, valueCurrentPage * valuePageSize);

            // Group by category for subtotals
            const categories = [...new Set(paginated.map(p => p.category_name || 'Uncategorized'))];
            const grandTotal = sorted.reduce((s, p) => s + p.total_value, 0);

            // Group by currency for grand total display
            const byCurrency = {};
            sorted.forEach(p => {
              const cur = p.currency || 'USD';
              if (!byCurrency[cur]) byCurrency[cur] = 0;
              byCurrency[cur] += p.total_value;
            });

            return (
              <>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>🔍</span>
                    <input type="text" placeholder={t('search') || 'חיפוש...'} value={valueSearch} onChange={e => setValueSearch(e.target.value)}
                      style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem', outline: 'none', width: '200px' }} />
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>{t('products') || 'מוצרים'}: <strong>{filtered.length}</strong></span>
                  </div>
                  <RefreshBtn onClick={async () => { setValueLoading(true); try { const r = await axios.get('/api/products'); setValueData(r.data.filter(p => (p.price||0)>0 && (p.quantity||0)>0).map(p => ({...p, name_display: getProductName(p), total_value: (p.price||0)*(p.quantity||0)}))); } catch(e){} setValueLoading(false); }} />
                </div>

                {/* Desktop Table */}
                <div style={{ display: isMobile ? 'none' : 'block' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <SortTh field="sku" sortState={valueSort} onSort={handleSort} style={{ width: '100px' }}>SKU</SortTh>
                        <SortTh field="name" sortState={valueSort} onSort={handleSort}>{t('product') || 'מוצר'}</SortTh>
                        <SortTh field="category" sortState={valueSort} onSort={handleSort} style={{ width: '130px' }}>{t('category') || 'קטגוריה'}</SortTh>
                        <SortTh field="quantity" sortState={valueSort} onSort={handleSort} style={{ width: '90px', textAlign: 'center' }}>{t('quantity') || 'כמות'}</SortTh>
                        <SortTh field="price" sortState={valueSort} onSort={handleSort} style={{ width: '110px', textAlign: 'right' }}>{t('cost_price') || 'מחיר עלות'}</SortTh>
                        <SortTh field="currency" sortState={valueSort} onSort={handleSort} style={{ width: '80px', textAlign: 'center' }}>{t('currency') || 'מטבע'}</SortTh>
                        <SortTh field="total_value" sortState={valueSort} onSort={handleSort} style={{ width: '130px', textAlign: 'right' }}>{t('total_value') || 'ערך כולל'}</SortTh>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(cat => {
                        const catRows = paginated.filter(p => (p.category_name || 'Uncategorized') === cat);
                        const catTotal = catRows.reduce((s, p) => s + p.total_value, 0);
                        const catCurrencies = [...new Set(catRows.map(p => p.currency || 'USD'))];
                        return [
                          ...catRows.map((p, i) => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                              <td style={{ padding: '0.6rem 1rem', color: '#888', fontSize: '0.82rem' }}>{p.sku || '-'}</td>
                              <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{p.name_display}</td>
                              <td style={{ padding: '0.6rem 1rem', color: '#666', fontSize: '0.85rem' }}>{p.category_name || '-'}</td>
                              <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>{fmt(p.quantity)}</td>
                              <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{fmt(p.price)}</td>
                              <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.82rem' }}>{p.currency || 'USD'}</td>
                              <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600, color: '#155724' }}>{fmt(p.total_value)}</td>
                            </tr>
                          )),
                          <tr key={`subtotal-${cat}`} style={{ background: '#e8f5e9', borderTop: '1px solid #a5d6a7' }}>
                            <td colSpan={6} style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#2e7d32', fontSize: '0.85rem' }}>
                              🏷️ {cat} — {catRows.length} {t('products') || 'מוצרים'}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, color: '#2e7d32', fontSize: '0.85rem' }}>
                              {catCurrencies.map(cur => `${fmt(catRows.filter(p=>(p.currency||'USD')===cur).reduce((s,p)=>s+p.total_value,0))} ${cur}`).join(' | ')}
                            </td>
                          </tr>
                        ];
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#d4edda', fontWeight: 700, borderTop: '2px solid #20c997' }}>
                        <td colSpan={6} style={{ padding: '0.65rem 1rem', color: '#155724', fontSize: '0.9rem' }}>
                          💰 {t('total_inventory_value') || 'סך ערך המלאי'} — {sorted.length} {t('products') || 'מוצרים'}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#155724', fontSize: '0.95rem' }}>
                          {Object.entries(byCurrency).map(([cur, val]) => `${fmt(val)} ${cur}`).join(' | ')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
                  {sorted.length === 0
                    ? <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'No data'}</div>
                    : sorted.map(p => (
                      <div key={p.id} style={{ background: 'white', border: '1px solid #b2dfdb', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', color: '#888' }}>{p.sku || '-'}</span>
                          <span style={{ fontSize: '0.78rem', color: '#666' }}>🏷️ {p.category_name || '-'}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.5rem' }}>💰 {p.name_display}</div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.72rem', color: '#888' }}>{t('quantity') || 'כמות'}</div>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#333' }}>{fmt(p.quantity)}</span>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.72rem', color: '#888' }}>{t('cost_price') || 'עלות'}</div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#555' }}>{fmt(p.price)} {p.currency || 'USD'}</span>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.72rem', color: '#888' }}>{t('total_value') || 'ערך'}</div>
                            <span style={{ background: '#d4edda', color: '#155724', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem' }}>{fmt(p.total_value)} {p.currency || 'USD'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  {/* Mobile Summary */}
                  <div style={{ background: '#d4edda', borderRadius: '10px', padding: '1rem', border: '2px solid #20c997' }}>
                    <div style={{ fontWeight: 700, color: '#155724', fontSize: '0.9rem', marginBottom: '0.4rem' }}>💰 {t('total_inventory_value') || 'סך ערך המלאי'}</div>
                    {Object.entries(byCurrency).map(([cur, val]) => (
                      <div key={cur} style={{ fontWeight: 700, color: '#155724', fontSize: '1rem' }}>{fmt(val)} {cur}</div>
                    ))}
                  </div>
                </div>

                {/* Pagination Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#555' }}>
                    <span>{sorted.length} {t('products') || 'מוצרים'}</span>
                    <span>|</span>
                    <label>{t('per_page') || 'פר עמוד'}:</label>
                    <select value={valuePageSize} onChange={e => { setValuePageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setValueCurrentPage(1); }}
                      style={{ padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}>
                      {[10, 15, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="all">{t('all') || 'הכל'}</option>
                    </select>
                  </div>
                  {valuePageSize !== 'all' && totalPages > 1 && (
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button onClick={() => setValueCurrentPage(1)} disabled={valueCurrentPage === 1}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: valueCurrentPage === 1 ? '#f3f4f6' : '#fff', cursor: valueCurrentPage === 1 ? 'default' : 'pointer' }}>«</button>
                      <button onClick={() => setValueCurrentPage(p => Math.max(1, p - 1))} disabled={valueCurrentPage === 1}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: valueCurrentPage === 1 ? '#f3f4f6' : '#fff', cursor: valueCurrentPage === 1 ? 'default' : 'pointer' }}>‹</button>
                      <span style={{ fontSize: '0.85rem', padding: '0 0.3rem' }}>{valueCurrentPage} / {totalPages}</span>
                      <button onClick={() => setValueCurrentPage(p => Math.min(totalPages, p + 1))} disabled={valueCurrentPage === totalPages}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: valueCurrentPage === totalPages ? '#f3f4f6' : '#fff', cursor: valueCurrentPage === totalPages ? 'default' : 'pointer' }}>›</button>
                      <button onClick={() => setValueCurrentPage(totalPages)} disabled={valueCurrentPage === totalPages}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: valueCurrentPage === totalPages ? '#f3f4f6' : '#fff', cursor: valueCurrentPage === totalPages ? 'default' : 'pointer' }}>»</button>
                    </div>
                  )}
                </div>
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end' }}>
                  <PrintBtn onClick={() => {
                    const dir = language === 'he' ? 'rtl' : 'ltr';
                    const ta = language === 'he' ? 'right' : 'left';
                    const locale = language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US';
                    const rows = sorted.map(p => `<tr><td>${p.sku||'-'}</td><td>${p.name_display}</td><td>${p.category_name||'-'}</td><td style="text-align:center;">${fmt(p.quantity)}</td><td style="text-align:right;">${fmt(p.price)}</td><td style="text-align:center;">${p.currency||'USD'}</td><td style="text-align:right;font-weight:700;">${fmt(p.total_value)}</td></tr>`).join('');
                    const html = printHeader(`💰 ${t('inventory_value_report')||'Inventory Value Report'}`, '#20c997')
                      + `<table><thead><tr><th>SKU</th><th>${t('product')||'Product'}</th><th>${t('category')||'Category'}</th><th>${t('quantity')||'Qty'}</th><th>${t('cost_price')||'Cost'}</th><th>${t('currency')||'Currency'}</th><th>${t('total_value')||'Total Value'}</th></tr></thead><tbody>${rows}</tbody>
                      <tfoot><tr style="background:#d4edda;font-weight:700;"><td colspan="6">${t('total_inventory_value')||'Total Inventory Value'} (${sorted.length} ${t('products')||'products'})</td><td style="text-align:right;">${Object.entries(byCurrency).map(([c,v])=>`${fmt(v)} ${c}`).join(' | ')}</td></tr></tfoot></table>`
                      + `<div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(locale)}</div></body></html>`;
                    openPrint(html);
                  }} />
                </div>
              </>
            );
          })()}
        </AccordionBody>
      </div>
      )}

      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ccc', border: '2px dashed #e9ecef', borderRadius: '8px', background: '#fafafa' }}>
        {t('more_reports_coming') || '➕ דוחות נוספים יתווספו בקרוב'}
      </div>
    </div>
  );
}

export default WarehouseReports;
