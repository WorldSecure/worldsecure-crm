import React, { useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';

function SupportReports() {
  const { t, language } = useLanguage();

  // Preload logo as base64
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
      } catch (err) {
        console.log('Logo preload failed:', err);
      }
    };
    loadLogo();
  }, []);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusSort, setStatusSort] = useState({ field: 'ticket_number', dir: 'asc' });

  const [closedOpen, setClosedOpen] = useState(false);
  const [closedData, setClosedData] = useState(null);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedSort, setClosedSort] = useState({ field: 'ticket_number', dir: 'asc' });
  const [closedFilter, setClosedFilter] = useState('all');
  const [closedCustomFrom, setClosedCustomFrom] = useState('');
  const [closedCustomTo, setClosedCustomTo] = useState('');
  const [closedAllData, setClosedAllData] = useState(null);

  const [countryOpen, setCountryOpen] = useState(false);
  const [countryData, setCountryData] = useState(null);
  const [countryLoading, setCountryLoading] = useState(false);
  const [countrySort, setCountrySort] = useState({ field: 'total_cases', dir: 'desc' });
  const [countryFilter, setCountryFilter] = useState('all');
  const [countryCustomFrom, setCountryCustomFrom] = useState('');
  const [countryCustomTo, setCountryCustomTo] = useState('');
  const [countryAllData, setCountryAllData] = useState(null);

  const [productsOpen, setProductsOpen] = useState(false);
  const [productsData, setProductsData] = useState(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsSort, setProductsSort] = useState({ field: 'total_cases', dir: 'desc' });
  const [productsSearch, setProductsSearch] = useState('');
  const [productsFilter, setProductsFilter] = useState('all');
  const [productsCustomFrom, setProductsCustomFrom] = useState('');
  const [productsCustomTo, setProductsCustomTo] = useState('');
  const [productsAllData, setProductsAllData] = useState(null);

  const [customersOpen, setCustomersOpen] = useState(false);
  const [customersData, setCustomersData] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersSort, setCustomersSort] = useState({ field: 'total_cases', dir: 'desc' });
  const [customersSearch, setCustomersSearch] = useState('');
  const [customersFilter, setCustomersFilter] = useState('all');
  const [customersCustomFrom, setCustomersCustomFrom] = useState('');
  const [customersCustomTo, setCustomersCustomTo] = useState('');
  const [customersAllData, setCustomersAllData] = useState(null);


  const toggleStatusReport = async () => {
    if (statusOpen) { setStatusOpen(false); return; }
    setStatusLoading(true);
    try {
      const res = await axios.get('/api/support-tickets');
      // סינון רק פתוחים
      const open = res.data.filter(t => ['open','in_progress','awaiting_customer'].includes(t.status));
      setStatusData(open);
    } catch(e) { console.error(e); }
    setStatusLoading(false);
    setStatusOpen(true);
  };

  const toggleClosedReport = async () => {
    if (closedOpen) { setClosedOpen(false); return; }
    setClosedLoading(true);
    try {
      const res = await axios.get('/api/support-tickets');
      const all = res.data.filter(t => ['closed', 'cancelled'].includes(t.status));
      setClosedAllData(all);
      setClosedData(applyClosedFilter(all, closedFilter, closedCustomFrom, closedCustomTo));
    } catch(e) { console.error(e); }
    setClosedLoading(false);
    setClosedOpen(true);
  };

  const applyClosedFilter = (data, filter, customFrom, customTo) => {
    if (!data) return [];
    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);

    let from = null, to = null;
    if (filter === '7d') { from = new Date(now - 7*86400000); }
    else if (filter === '30d') { from = new Date(now - 30*86400000); }
    else if (filter === '90d') { from = new Date(now - 90*86400000); }
    else if (filter === 'this_month') { from = startOfMonth(now); }
    else if (filter === 'last_month') { from = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)); to = startOfMonth(now); }
    else if (filter === 'this_quarter') { from = startOfQuarter(now); }
    else if (filter === 'last_quarter') { from = startOfQuarter(new Date(now.getFullYear(), now.getMonth()-3, 1)); to = startOfQuarter(now); }
    else if (filter === 'this_year') { from = startOfYear(now); }
    else if (filter === 'last_year') { from = startOfYear(new Date(now.getFullYear()-1, 0, 1)); to = startOfYear(now); }
    else if (filter === 'custom') {
      from = customFrom ? startOfDay(new Date(customFrom)) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23,59,59,999)) : null;
    }

    return data.filter(tk => {
      const d = tk.updated_at ? new Date(tk.updated_at) : null;
      if (!d) return filter === 'all';
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  };

  const applyProductsFilter = (data, filter, customFrom, customTo) => {
    if (!data || filter === 'all') return data;
    const now = new Date();
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
    let from = null, to = null;
    if (filter === '7d') { from = new Date(now - 7*86400000); }
    else if (filter === '30d') { from = new Date(now - 30*86400000); }
    else if (filter === '90d') { from = new Date(now - 90*86400000); }
    else if (filter === 'this_month') { from = startOfMonth(now); }
    else if (filter === 'last_month') { from = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)); to = startOfMonth(now); }
    else if (filter === 'this_quarter') { from = startOfQuarter(now); }
    else if (filter === 'last_quarter') { from = startOfQuarter(new Date(now.getFullYear(), now.getMonth()-3, 1)); to = startOfQuarter(now); }
    else if (filter === 'this_year') { from = startOfYear(now); }
    else if (filter === 'last_year') { from = startOfYear(new Date(now.getFullYear()-1, 0, 1)); to = startOfYear(now); }
    else if (filter === 'custom') {
      from = customFrom ? new Date(new Date(customFrom).setHours(0,0,0,0)) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23,59,59,999)) : null;
    }
    return data.filter(tk => {
      const d = tk.created_at ? new Date(tk.created_at) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  };

  const buildProductStats = (tickets) => {
    const map = {};
    tickets.forEach(tk => {
      const name = tk.product_name || 'Unknown';
      if (!map[name]) map[name] = { product_name: name, total_cases: 0, open: 0, closed: 0, totalDays: 0, closedCount: 0 };
      map[name].total_cases++;
      if (['closed','cancelled'].includes(tk.status)) {
        map[name].closed++;
        if (tk.created_at && tk.updated_at) {
          const days = Math.round((new Date(tk.updated_at) - new Date(tk.created_at)) / 86400000);
          map[name].totalDays += days;
          map[name].closedCount++;
        }
      } else {
        map[name].open++;
      }
    });
    return Object.values(map).map(r => ({ ...r, avg_days: r.closedCount > 0 ? Math.round(r.totalDays / r.closedCount) : null }));
  };

  const toggleProductsReport = async () => {
    if (productsOpen) { setProductsOpen(false); return; }
    setProductsLoading(true);
    try {
      const res = await axios.get('/api/support-tickets');
      setProductsAllData(res.data);
      setProductsData(buildProductStats(applyProductsFilter(res.data, productsFilter, productsCustomFrom, productsCustomTo)));
    } catch(e) { console.error(e); }
    setProductsLoading(false);
    setProductsOpen(true);
  };

  const applyCustomersFilter = (data, filter, customFrom, customTo) => {
    if (!data || filter === 'all') return data;
    const now = new Date();
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
    let from = null, to = null;
    if (filter === '7d') { from = new Date(now - 7*86400000); }
    else if (filter === '30d') { from = new Date(now - 30*86400000); }
    else if (filter === '90d') { from = new Date(now - 90*86400000); }
    else if (filter === 'this_month') { from = startOfMonth(now); }
    else if (filter === 'last_month') { from = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)); to = startOfMonth(now); }
    else if (filter === 'this_quarter') { from = startOfQuarter(now); }
    else if (filter === 'last_quarter') { from = startOfQuarter(new Date(now.getFullYear(), now.getMonth()-3, 1)); to = startOfQuarter(now); }
    else if (filter === 'this_year') { from = startOfYear(now); }
    else if (filter === 'last_year') { from = startOfYear(new Date(now.getFullYear()-1, 0, 1)); to = startOfYear(now); }
    else if (filter === 'custom') {
      from = customFrom ? new Date(new Date(customFrom).setHours(0,0,0,0)) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23,59,59,999)) : null;
    }
    return data.filter(tk => {
      const d = tk.created_at ? new Date(tk.created_at) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  };

  const buildUserStats = (tickets) => {
    const map = {};
    const total = tickets.length;
    tickets.forEach(tk => {
      const name = tk.owner_name || 'Unassigned';
      if (!map[name]) map[name] = { owner_name: name, total_cases: 0, open: 0, closed: 0, totalDays: 0, closedCount: 0 };
      map[name].total_cases++;
      if (['closed','cancelled'].includes(tk.status)) {
        map[name].closed++;
        if (tk.created_at && tk.updated_at) {
          const days = Math.round((new Date(tk.updated_at) - new Date(tk.created_at)) / 86400000);
          map[name].totalDays += days;
          map[name].closedCount++;
        }
      } else {
        map[name].open++;
      }
    });
    return Object.values(map).map(r => ({
      ...r,
      avg_days: r.closedCount > 0 ? Math.round(r.totalDays / r.closedCount) : null,
      workload_pct: total > 0 ? Math.round((r.total_cases / total) * 100) : 0
    }));
  };

  const toggleCustomersReport = async () => {
    if (customersOpen) { setCustomersOpen(false); return; }
    setCustomersLoading(true);
    try {
      const res = await axios.get('/api/support-tickets');
      setCustomersAllData(res.data);
      setCustomersData(buildUserStats(applyCustomersFilter(res.data, customersFilter, customersCustomFrom, customersCustomTo)));
    } catch(e) { console.error(e); }
    setCustomersLoading(false);
    setCustomersOpen(true);
  };

  const applyCountryFilter = (data, filter, customFrom, customTo) => {
    if (!data || filter === 'all') return data;
    const now = new Date();
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
    let from = null, to = null;
    if (filter === '7d') { from = new Date(now - 7*86400000); }
    else if (filter === '30d') { from = new Date(now - 30*86400000); }
    else if (filter === '90d') { from = new Date(now - 90*86400000); }
    else if (filter === 'this_month') { from = startOfMonth(now); }
    else if (filter === 'last_month') { from = startOfMonth(new Date(now.getFullYear(), now.getMonth()-1, 1)); to = startOfMonth(now); }
    else if (filter === 'this_quarter') { from = startOfQuarter(now); }
    else if (filter === 'last_quarter') { from = startOfQuarter(new Date(now.getFullYear(), now.getMonth()-3, 1)); to = startOfQuarter(now); }
    else if (filter === 'this_year') { from = startOfYear(now); }
    else if (filter === 'last_year') { from = startOfYear(new Date(now.getFullYear()-1, 0, 1)); to = startOfYear(now); }
    else if (filter === 'custom') {
      from = customFrom ? new Date(new Date(customFrom).setHours(0,0,0,0)) : null;
      to = customTo ? new Date(new Date(customTo).setHours(23,59,59,999)) : null;
    }
    return data.filter(tk => {
      const d = tk.created_at ? new Date(tk.created_at) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  };

  const buildCustomerStats = (tickets) => {
    const map = {};
    tickets.forEach(tk => {
      const name = tk.customer_name || 'Unknown';
      if (!map[name]) map[name] = { customer_name: name, total_cases: 0, open: 0, closed: 0, totalDays: 0, closedCount: 0 };
      map[name].total_cases++;
      if (['closed','cancelled'].includes(tk.status)) {
        map[name].closed++;
        if (tk.created_at && tk.updated_at) {
          const days = Math.round((new Date(tk.updated_at) - new Date(tk.created_at)) / 86400000);
          map[name].totalDays += days;
          map[name].closedCount++;
        }
      } else {
        map[name].open++;
      }
    });
    return Object.values(map).map(r => ({ ...r, avg_days: r.closedCount > 0 ? Math.round(r.totalDays / r.closedCount) : null }));
  };

  const toggleCountryReport = async () => {
    if (countryOpen) { setCountryOpen(false); return; }
    setCountryLoading(true);
    try {
      const res = await axios.get('/api/support-tickets');
      setCountryAllData(res.data);
      setCountryData(buildCustomerStats(applyCountryFilter(res.data, countryFilter, countryCustomFrom, countryCustomTo)));
    } catch(e) { console.error(e); }
    setCountryLoading(false);
    setCountryOpen(true);
  };

  const stageIcons = ['📋','✅','📄','📋','🚢','🧾','💳','📦','📤'];
  const stageLabels = {
    1: t('quotation') || 'Quotation',
    2: t('quote_approval') || 'Quote Approval',
    3: t('proforma_invoice') || 'Proforma Invoice',
    4: t('commercial_contract') || 'Commercial Contract',
    5: t('bl_packing') || 'B/L + Packing List',
    6: t('commercial_invoice') || 'Commercial Invoice',
    7: t('payment_proof') || 'Payment Proof',
    8: 'Additional Costs',
    9: 'העלאת הוצאות',
  };

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

  const doSort = (rows, field, dir, getters) => [...rows].sort((a, b) => {
    const av = getters[field](a), bv = getters[field](b);
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });

  const SortTh = ({ field, sortState, onSort, children, style = {} }) => {
    const active = sortState.field === field;
    return (
      <th onClick={() => onSort(field)} style={{
        padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        background: active ? '#eef2ff' : '#f8f9fa', ...style
      }}>
        <span style={{ marginLeft: '4px', color: active ? '#3b5bdb' : '#aaa', fontSize: '0.75rem' }}>
          {active ? (sortState.dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
        <span style={{ fontWeight: 600, color: active ? '#3b5bdb' : '#495057' }}>{children}</span>
      </th>
    );
  };

  const handleStatusSort = (f) => setStatusSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const handleCountrySort = (f) => setCountrySort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const countryGetters = { customer_name: r => r.customer_name || '', total_cases: r => r.total_cases || 0, open: r => r.open || 0, closed: r => r.closed || 0, avg_days: r => r.avg_days || 0 };
  const statusGetters = {
    ticket_number: r => r.ticket_number || r.id || 0,
    customer_name: r => r.customer_name || '',
    subject: r => r.subject || '',
    priority: r => r.priority || '',
    status: r => r.status || '',
    owner_name: r => r.owner_name || '',
    created_at: r => r.created_at || '',
    updated_at: r => r.updated_at || '',
  };
  const closedGetters = {
    ticket_number: r => r.ticket_number || r.id || 0,
    customer_name: r => r.customer_name || '',
    subject: r => r.subject || '',
    priority: r => r.priority || '',
    status: r => r.status || '',
    owner_name: r => r.owner_name || '',
    created_at: r => r.created_at || '',
    updated_at: r => r.updated_at || '',
  };
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const statusColors = {
    open: { bg: '#FF9800', text: 'white', label: 'Open' },
    in_progress: { bg: '#FF5722', text: 'white', label: 'In Progress' },
    awaiting_customer: { bg: '#4CAF50', text: 'white', label: 'Awaiting' },
    closed: { bg: '#2196F3', text: 'white', label: 'Closed' },
    cancelled: { bg: '#9E9E9E', text: 'white', label: 'Cancelled' },
  };
  const priorityColors = {
    high: { bg: '#f8d7da', text: '#c0392b', label: '🔴 High' },
    medium: { bg: '#fff3cd', text: '#856404', label: '🟡 Medium' },
    low: { bg: '#d4edda', text: '#155724', label: '🟢 Low' },
  };
  const productsGetters = {
    product_name: r => r.product_name || '',
    total_cases: r => r.total_cases || 0,
    open: r => r.open || 0,
    closed: r => r.closed || 0,
    avg_days: r => r.avg_days || 0,
  };
  const handleProductsSort = (f) => setProductsSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const handleCustomersSort = (f) => setCustomersSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const customersGetters = {
    owner_name: r => r.owner_name || '',
    total_cases: r => r.total_cases || 0,
    open: r => r.open || 0,
    closed: r => r.closed || 0,
    avg_days: r => r.avg_days || 0,
    workload_pct: r => r.workload_pct || 0,
  };


  const AccordionBtn = ({ open, onClick, color, children }) => (
    <button onClick={onClick} style={{
      width: '100%', padding: '0.85rem 1.4rem',
      background: open ? color.dark : color.base,
      color: 'white', border: 'none', borderRadius: open ? '8px 8px 0 0' : '8px',
      fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      transition: 'background 0.2s'
    }}>
      <span>{children}</span>
      <span style={{ fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
    </button>
  );

  const AccordionBody = ({ open, loading, children }) => (
    <div style={{ maxHeight: open ? '1000px' : '0', overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
      <div style={{ background: 'white', border: '1px solid #dee2e6', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: loading ? '2rem' : '0', overflowX: 'auto' }}>
        {loading
          ? <div style={{ textAlign: 'center', color: '#888' }}>טוען...</div>
          : children
        }
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>📊 {t('support_reports') || 'דוחות מכירות'}</h2>
      </div>

      {/* דוח 1 - Support Open Cases Report */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={statusOpen} onClick={toggleStatusReport} color={{ base: '#007bff', dark: '#0056b3' }}>
          📞 {t('support_open_cases_report') || 'Support Open Cases Report'}
        </AccordionBtn>
        <AccordionBody open={statusOpen} loading={statusLoading}>
          {statusData && (
            <>
              <div style={{ padding: '0.75rem 1rem', color: '#666', fontSize: '0.88rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('open_cases') || 'פניות פתוחות'}: <strong>{statusData.length}</strong></span>
                <button
                  onClick={async () => {
                    setStatusLoading(true);
                    try {
                      const res = await axios.get('/api/support-tickets');
                      setStatusData(res.data.filter(t => ['open','in_progress','awaiting_customer'].includes(t.status)));
                    } catch(err) { console.error(err); }
                    setStatusLoading(false);
                  }}
                  style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  🔄 {t('refresh') || 'רענן'}
                </button>
              </div>
              {statusData.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_open_cases') || 'No open cases'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="ticket_number" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('ticket_number') || 'Ticket #'}</SortTh>
                      <SortTh field="customer_name" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))}>{t('customer') || 'לקוח'}</SortTh>
                      <SortTh field="subject" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))}>{t('subject') || 'נושא'}</SortTh>
                      <SortTh field="priority" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('priority') || 'עדיפות'}</SortTh>
                      <SortTh field="status" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '130px' }}>{t('status') || 'סטטוס'}</SortTh>
                      <SortTh field="owner_name" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '110px' }}>{t('owner') || 'מטפל'}</SortTh>
                      <SortTh field="created_at" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('date') || 'תאריך פתיחה'}</SortTh>
                      <SortTh field="updated_at" sortState={statusSort} onSort={f => setStatusSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '110px' }}>{t('last_updated') || 'עדכון אחרון'}</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {doSort(statusData, statusSort.field, statusSort.dir, statusGetters).map((tk, i) => {
                      const sc = statusColors[tk.status] || { bg: '#ccc', text: '#333', label: tk.status };
                      const pc = priorityColors[tk.priority] || { bg: '#eee', text: '#333', label: tk.priority };
                      return (
                        <tr key={tk.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#2196F3', whiteSpace: 'nowrap' }}>{tk.ticket_number || `#${tk.id}`}</td>
                          <td style={{ padding: '0.6rem 1rem', wordBreak: 'break-word' }}>{tk.customer_name || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', wordBreak: 'break-word' }}>{tk.subject || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: pc.bg, color: pc.text, padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{pc.label}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', color: '#555' }}>{tk.owner_name || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{tk.updated_at ? new Date(tk.updated_at).toLocaleDateString() : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {statusData && statusData.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      const logoBase64 = logoBase64Cache;
                      const sorted = doSort(statusData, statusSort.field, statusSort.dir, statusGetters);
                      const rows = sorted.map(tk => `
                        <tr>
                          <td>${tk.ticket_number || '#' + tk.id}</td>
                          <td>${tk.customer_name || '-'}</td>
                          <td>${tk.subject || '-'}</td>
                          <td>${tk.priority || '-'}</td>
                          <td>${tk.status || '-'}</td>
                          <td>${tk.owner_name || '-'}</td>
                          <td>${tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</td>
                          <td>${tk.updated_at ? new Date(tk.updated_at).toLocaleDateString() : '-'}</td>
                        </tr>
                      `).join('');
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Support Open Cases Report</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
            body { padding-top: 75px !important; font-family: Arial, sans-serif; }
            @media print { body { padding-top: 0 !important; } }
            .btn-print { background: #007bff; color: white; }
            .btn-print:hover { background: #0056b3; }
            .btn-close-win { background: #6c757d; color: white; }
            .btn-close-win:hover { background: #545b62; }
            body { padding-top: 75px !important; font-family: Arial, sans-serif; }
            @media print { body { padding-top: 0 !important; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 3px solid #007bff; margin-bottom: 30px; }
                          .logo { width: 150px; height: auto; }
                          .company-info { color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #007bff; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          .logo-placeholder { font-size: 2.5rem; color: #007bff; font-weight: 700; }
                          h1 { text-align: center; color: #007bff; margin: 20px 0; font-size: 1.8rem; }
                          .report-meta { text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; font-size: 0.85rem; }
                          th { background: #f8f9fa; font-weight: 600; color: #333; }
                          .footer { margin-top: 30px; padding: 20px 0 0; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 0.8rem; }
                        .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }
    .btn-print-doc, .btn-close-doc {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print-doc { background: #3498db; color: white; }
    .btn-print-doc:hover { background: #2980b9; }
    .btn-close-doc { background: #95a5a6; color: white; }
    .btn-close-doc:hover { background: #7f8c8d; }
    @media print { .button-container { display: none !important; } }
                        </style></head><body>

                        <div class="button-container">
                          <button class="btn-print-doc" onclick="window.print()">&#128424; Print / Save as PDF</button>
                          <button class="btn-close-doc" onclick="window.close()">&#10005; Close</button>
                        </div>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div class="logo-placeholder">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>📞 Support Open Cases Report</h1>
                        <div class="report-meta">Open Cases: <strong>${sorted.length}</strong></div>
                        <table><thead><tr>
                          <th>Ticket #</th><th>Customer</th><th>Subject</th><th>Priority</th>
                          <th>Status</th><th>Owner</th><th>Created</th><th>Last Updated</th>
                        </tr></thead><tbody>${rows}</tbody></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                      if (logoBase64) {
                        await new Promise(resolve => {
                          const checkReady = setInterval(() => {
                            if (printWindow.document.readyState === 'complete') {
                              clearInterval(checkReady);
                              setTimeout(resolve, 200);
                            }
                          }, 50);
                        });
                      }
                    }}
                    style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 1b - Support Closed Cases Report */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={closedOpen} onClick={toggleClosedReport} color={{ base: '#6c757d', dark: '#545b62' }}>
          ✅ {t('support_closed_report') || 'Support Closed Cases Report'}
        </AccordionBtn>
        <AccordionBody open={closedOpen} loading={closedLoading}>
          {closedData && (
            <>
              {/* Filter Bar */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#f8f9fa', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#555', fontSize: '0.88rem', marginInlineEnd: '0.25rem' }}>📅</span>
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
                  <button key={opt.key} onClick={() => {
                    setClosedFilter(opt.key);
                    setClosedData(applyClosedFilter(closedAllData, opt.key, closedCustomFrom, closedCustomTo));
                  }} style={{
                    padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: closedFilter === opt.key ? '#6c757d' : '#e9ecef',
                    color: closedFilter === opt.key ? 'white' : '#495057',
                    transition: 'all 0.15s'
                  }}>{opt.label}</button>
                ))}
              </div>

              {/* Custom date range */}
              {closedFilter === 'custom' && (
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('from') || 'From'}:</label>
                  <input type="date" value={closedCustomFrom} onChange={e => {
                    setClosedCustomFrom(e.target.value);
                    setClosedData(applyClosedFilter(closedAllData, 'custom', e.target.value, closedCustomTo));
                  }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('to') || 'To'}:</label>
                  <input type="date" value={closedCustomTo} onChange={e => {
                    setClosedCustomTo(e.target.value);
                    setClosedData(applyClosedFilter(closedAllData, 'custom', closedCustomFrom, e.target.value));
                  }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                </div>
              )}

              {/* Count + Refresh */}
              <div style={{ padding: '0.75rem 1rem', color: '#666', fontSize: '0.88rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('closed_cases') || 'פניות סגורות'}: <strong>{closedData.length}</strong>
                  {closedAllData && closedFilter !== 'all' && <span style={{ color: '#999', fontWeight: 400 }}> / {closedAllData.length} {t('total') || 'total'}</span>}
                </span>
                <button
                  onClick={async () => {
                    setClosedLoading(true);
                    try {
                      const res = await axios.get('/api/support-tickets');
                      const all = res.data.filter(t => ['closed', 'cancelled'].includes(t.status));
                      setClosedAllData(all);
                      setClosedData(applyClosedFilter(all, closedFilter, closedCustomFrom, closedCustomTo));
                    } catch(err) { console.error(err); }
                    setClosedLoading(false);
                  }}
                  style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  🔄 {t('refresh') || 'רענן'}
                </button>
              </div>
              {closedData.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_closed_cases') || 'No closed cases'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="ticket_number" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('ticket_number') || 'Ticket #'}</SortTh>
                      <SortTh field="customer_name" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))}>{t('customer') || 'לקוח'}</SortTh>
                      <SortTh field="subject" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))}>{t('subject') || 'נושא'}</SortTh>
                      <SortTh field="priority" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('priority') || 'עדיפות'}</SortTh>
                      <SortTh field="status" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '130px' }}>{t('status') || 'סטטוס'}</SortTh>
                      <SortTh field="owner_name" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '110px' }}>{t('owner') || 'מטפל'}</SortTh>
                      <SortTh field="created_at" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '100px' }}>{t('open_date') || 'Open Date'}</SortTh>
                      <SortTh field="updated_at" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '110px' }}>{t('closed_date') || 'Closed Date'}</SortTh>
                      <SortTh field="open_days" sortState={closedSort} onSort={f => setClosedSort(p => ({ field: f, dir: p.field===f && p.dir==='asc'?'desc':'asc' }))} style={{ width: '110px', textAlign: 'center' }}>{t('total_open_days') || 'Total Open Days'}</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {doSort(closedData, closedSort.field, closedSort.dir, { ...closedGetters, open_days: r => r.created_at && r.updated_at ? Math.round((new Date(r.updated_at) - new Date(r.created_at)) / 86400000) : 0 }).map((tk, i) => {
                      const sc = statusColors[tk.status] || { bg: '#ccc', text: '#333', label: tk.status };
                      const pc = priorityColors[tk.priority] || { bg: '#eee', text: '#333', label: tk.priority };
                      const openDays = tk.created_at && tk.updated_at ? Math.round((new Date(tk.updated_at) - new Date(tk.created_at)) / 86400000) : '-';
                      const daysColor = openDays === '-' ? '#888' : openDays <= 3 ? '#155724' : openDays <= 7 ? '#856404' : '#721c24';
                      const daysBg = openDays === '-' ? '#eee' : openDays <= 3 ? '#d4edda' : openDays <= 7 ? '#fff3cd' : '#f8d7da';
                      return (
                        <tr key={tk.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#2196F3', whiteSpace: 'nowrap' }}>{tk.ticket_number || `#${tk.id}`}</td>
                          <td style={{ padding: '0.6rem 1rem', wordBreak: 'break-word' }}>{tk.customer_name || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', wordBreak: 'break-word' }}>{tk.subject || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: pc.bg, color: pc.text, padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{pc.label}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', color: '#555' }}>{tk.owner_name || '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{tk.updated_at ? new Date(tk.updated_at).toLocaleDateString() : '-'}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: daysBg, color: daysColor, padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>{openDays === '-' ? '-' : `${openDays}d`}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {closedData && closedData.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      const logoBase64 = logoBase64Cache;
                      const sorted = doSort(closedData, closedSort.field, closedSort.dir, closedGetters);
                      const rows = sorted.map(tk => {
                          const openDays = tk.created_at && tk.updated_at ? Math.round((new Date(tk.updated_at) - new Date(tk.created_at)) / 86400000) : '-';
                          return `
                        <tr>
                          <td>${tk.ticket_number || '#' + tk.id}</td>
                          <td>${tk.customer_name || '-'}</td>
                          <td>${tk.subject || '-'}</td>
                          <td>${tk.priority || '-'}</td>
                          <td>${tk.status || '-'}</td>
                          <td>${tk.owner_name || '-'}</td>
                          <td>${tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</td>
                          <td>${tk.updated_at ? new Date(tk.updated_at).toLocaleDateString() : '-'}</td>
                          <td style="text-align:center; font-weight:700;">${openDays === '-' ? '-' : openDays + 'd'}</td>
                        </tr>
                      `}).join('');
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Support Closed Cases Report</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
            body { padding-top: 75px !important; font-family: Arial, sans-serif; }
            @media print { body { padding-top: 0 !important; } }
            .btn-print { background: #007bff; color: white; }
            .btn-print:hover { background: #0056b3; }
            .btn-close-win { background: #6c757d; color: white; }
            .btn-close-win:hover { background: #545b62; }
            body { padding-top: 75px !important; font-family: Arial, sans-serif; }
            @media print { body { padding-top: 0 !important; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 3px solid #6c757d; margin-bottom: 30px; }
                          .logo { width: 150px; height: auto; }
                          .company-info { color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #6c757d; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          .logo-placeholder { font-size: 2.5rem; color: #6c757d; font-weight: 700; }
                          h1 { text-align: center; color: #6c757d; margin: 20px 0; font-size: 1.8rem; }
                          .report-meta { text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; font-size: 0.85rem; }
                          th { background: #f8f9fa; font-weight: 600; color: #333; }
                          .footer { margin-top: 30px; padding: 20px 0 0; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 0.8rem; }
                        .button-container {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }
    .btn-print-doc, .btn-close-doc {
      padding: 12px 24px;
      margin: 0 8px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 5px;
      font-weight: 600;
    }
    .btn-print-doc { background: #3498db; color: white; }
    .btn-print-doc:hover { background: #2980b9; }
    .btn-close-doc { background: #95a5a6; color: white; }
    .btn-close-doc:hover { background: #7f8c8d; }
    @media print { .button-container { display: none !important; } }
                        </style></head><body>

                        <div class="button-container">
                          <button class="btn-print-doc" onclick="window.print()">&#128424; Print / Save as PDF</button>
                          <button class="btn-close-doc" onclick="window.close()">&#10005; Close</button>
                        </div>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div class="logo-placeholder">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>✅ Support Closed Cases Report</h1>
                        <div class="report-meta">Closed Cases: <strong>${sorted.length}</strong></div>
                        <table><thead><tr>
                          <th>Ticket #</th><th>Customer</th><th>Subject</th><th>Priority</th>
                          <th>Status</th><th>Owner</th><th>Open Date</th><th>Closed Date</th><th>Total Open Days</th>
                        </tr></thead><tbody>${rows}</tbody></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                      if (logoBase64) {
                        await new Promise(resolve => {
                          const checkReady = setInterval(() => {
                            if (printWindow.document.readyState === 'complete') {
                              clearInterval(checkReady);
                              setTimeout(resolve, 200);
                            }
                          }, 50);
                        });
                      }
                    }}
                    style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 2 - Customer Cases Analysis */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={countryOpen} onClick={toggleCountryReport} color={{ base: '#17a2b8', dark: '#117a8b' }}>
          👥 {t('customer_cases_analysis') || 'Customer Cases Analysis'}
        </AccordionBtn>
        <AccordionBody open={countryOpen} loading={countryLoading}>
          {countryData && (
            <>
              {/* Filter Bar */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#f8f9fa', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#555', fontSize: '0.88rem', marginInlineEnd: '0.25rem' }}>📅</span>
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
                  <button key={opt.key} onClick={() => {
                    setCountryFilter(opt.key);
                    setCountryData(buildCustomerStats(applyCountryFilter(countryAllData, opt.key, countryCustomFrom, countryCustomTo)));
                  }} style={{
                    padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: countryFilter === opt.key ? '#17a2b8' : '#e9ecef',
                    color: countryFilter === opt.key ? 'white' : '#495057',
                  }}>{opt.label}</button>
                ))}
              </div>
              {countryFilter === 'custom' && (
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('from') || 'From'}:</label>
                  <input type="date" value={countryCustomFrom} onChange={e => { setCountryCustomFrom(e.target.value); setCountryData(buildCustomerStats(applyCountryFilter(countryAllData, 'custom', e.target.value, countryCustomTo))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('to') || 'To'}:</label>
                  <input type="date" value={countryCustomTo} onChange={e => { setCountryCustomTo(e.target.value); setCountryData(buildCustomerStats(applyCountryFilter(countryAllData, 'custom', countryCustomFrom, e.target.value))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                </div>
              )}
              {/* Count row */}
              <div style={{ padding: '0.75rem 1rem', color: '#666', fontSize: '0.88rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('customer') || 'לקוחות'}: <strong>{countryData.length}</strong>
                  {countryAllData && countryFilter !== 'all' && <span style={{ color: '#999', fontWeight: 400 }}> &nbsp;| {t('total_cases') || 'Total Cases'}: <strong>{countryData.reduce((s,r) => s+r.total_cases, 0)}</strong></span>}
                </span>
                <button onClick={async () => {
                  setCountryLoading(true);
                  try {
                    const res = await axios.get('/api/support-tickets');
                    setCountryAllData(res.data);
                    setCountryData(buildCustomerStats(applyCountryFilter(res.data, countryFilter, countryCustomFrom, countryCustomTo)));
                  } catch(e) { console.error(e); }
                  setCountryLoading(false);
                }} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
                  🔄 {t('refresh') || 'רענן'}
                </button>
              </div>
              {countryData.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'No data'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="customer_name" sortState={countrySort} onSort={handleCountrySort}>{t('customer') || 'לקוח'}</SortTh>
                      <SortTh field="total_cases" sortState={countrySort} onSort={handleCountrySort} style={{ width: '110px', textAlign: 'center' }}>{t('total_cases') || 'Total Cases'}</SortTh>
                      <SortTh field="open" sortState={countrySort} onSort={handleCountrySort} style={{ width: '90px', textAlign: 'center' }}>{t('open') || 'Open'}</SortTh>
                      <SortTh field="closed" sortState={countrySort} onSort={handleCountrySort} style={{ width: '90px', textAlign: 'center' }}>{t('closed') || 'Closed'}</SortTh>
                      <SortTh field="avg_days" sortState={countrySort} onSort={handleCountrySort} style={{ width: '130px', textAlign: 'center' }}>{t('avg_open_days') || 'Avg. Open Days'}</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {doSort(countryData, countrySort.field, countrySort.dir, countryGetters).map((row, i) => (
                      <tr key={row.customer_name} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>👤 {row.customer_name}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.total_cases}</span>
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          {row.open > 0 ? <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.open}</span> : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          {row.closed > 0 ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.closed}</span> : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          {row.avg_days !== null
                            ? <span style={{ background: row.avg_days <= 3 ? '#d4edda' : row.avg_days <= 7 ? '#fff3cd' : '#f8d7da', color: row.avg_days <= 3 ? '#155724' : row.avg_days <= 7 ? '#856404' : '#721c24', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.avg_days}d</span>
                            : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#e3f2fd', fontWeight: 700, borderTop: '2px solid #17a2b8' }}>
                      <td style={{ padding: '0.65rem 1rem', color: '#1565c0' }}>{t('total') || 'Total'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#1565c0' }}>{countryData.reduce((s,r) => s+r.total_cases, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#856404' }}>{countryData.reduce((s,r) => s+r.open, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#155724' }}>{countryData.reduce((s,r) => s+r.closed, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#1565c0' }}>
                        {(() => { const c = countryData.filter(r => r.avg_days !== null); return c.length > 0 ? Math.round(c.reduce((s,r) => s+r.avg_days, 0)/c.length) + 'd' : '—'; })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {countryData && countryData.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      const logoBase64 = logoBase64Cache;
                      const sorted = doSort(countryData, countrySort.field, countrySort.dir, countryGetters);
                      const rows = sorted.map(row => `
                        <tr>
                          <td>${row.customer_name}</td>
                          <td style="text-align:center;">${row.total_cases}</td>
                          <td style="text-align:center;">${row.open}</td>
                          <td style="text-align:center;">${row.closed}</td>
                          <td style="text-align:center;">${row.avg_days !== null ? row.avg_days + 'd' : '—'}</td>
                        </tr>`).join('');
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Customer Cases Analysis</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 3px solid #17a2b8; margin-bottom: 30px; }
                          .logo { width: 150px; height: auto; }
                          .company-info { color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #17a2b8; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          h1 { text-align: center; color: #17a2b8; margin: 20px 0; font-size: 1.8rem; }
                          .report-meta { text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; font-size: 0.85rem; }
                          th { background: #f8f9fa; font-weight: 600; color: #333; }
                          tfoot { background: #e3f2fd; font-weight: 700; }
                          .footer { margin-top: 30px; padding: 20px 0 0; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 0.8rem; }
                          .button-container { text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; }
                          .btn-print-doc, .btn-close-doc { padding: 12px 24px; margin: 0 8px; font-size: 16px; cursor: pointer; border: none; border-radius: 5px; font-weight: 600; }
                          .btn-print-doc { background: #3498db; color: white; }
                          .btn-close-doc { background: #95a5a6; color: white; }
                          @media print { .button-container { display: none !important; } }
                        </style></head><body>
                        <div class="button-container">
                          <button class="btn-print-doc" onclick="window.print()">&#128424; Print / Save as PDF</button>
                          <button class="btn-close-doc" onclick="window.close()">&#10005; Close</button>
                        </div>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div style="font-size:2rem;color:#17a2b8;font-weight:700;">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>👥 ${t('customer_cases_analysis') || 'Customer Cases Analysis'}</h1>
                        <div class="report-meta">${t('customer') || 'Customers'}: <strong>${sorted.length}</strong> | ${t('total_cases') || 'Total Cases'}: <strong>${countryData.reduce((s,r) => s+r.total_cases, 0)}</strong></div>
                        <table><thead><tr>
                          <th>${t('customer') || 'Customer'}</th>
                          <th>${t('total_cases') || 'Total Cases'}</th>
                          <th>${t('open') || 'Open'}</th>
                          <th>${t('closed') || 'Closed'}</th>
                          <th>${t('avg_open_days') || 'Avg. Open Days'}</th>
                        </tr></thead><tbody>${rows}</tbody>
                        <tfoot><tr>
                          <td><strong>${t('total') || 'Total'}</strong></td>
                          <td style="text-align:center;"><strong>${countryData.reduce((s,r) => s+r.total_cases, 0)}</strong></td>
                          <td style="text-align:center;"><strong>${countryData.reduce((s,r) => s+r.open, 0)}</strong></td>
                          <td style="text-align:center;"><strong>${countryData.reduce((s,r) => s+r.closed, 0)}</strong></td>
                          <td style="text-align:center;"></td>
                        </tr></tfoot></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                    }}
                    style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                  <button
                    onClick={async () => {
                      const XLSX = await import('xlsx');
                      const sorted = doSort(countryData, countrySort.field, countrySort.dir, countryGetters);
                      const data = [
                        [t('customer') || 'Customer', t('total_cases') || 'Total Cases', t('open') || 'Open', t('closed') || 'Closed', t('avg_open_days') || 'Avg. Open Days'],
                        ...sorted.map(r => [r.customer_name, r.total_cases, r.open, r.closed, r.avg_days !== null ? r.avg_days : '']),
                        [t('total') || 'Total', countryData.reduce((s,r) => s+r.total_cases,0), countryData.reduce((s,r) => s+r.open,0), countryData.reduce((s,r) => s+r.closed,0), '']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(data);
                      ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Customer Cases');
                      XLSX.writeFile(wb, `customer_cases_${new Date().toISOString().split('T')[0]}.xlsx`);
                    }}
                    style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    📊 {t('save_excel') || 'שמור כאקסל'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 3 - Product Cases Analysis */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={productsOpen} onClick={toggleProductsReport} color={{ base: '#fd7e14', dark: '#dc6502' }}>
          📦 {t('product_cases_analysis') || 'Product Cases Analysis'}
        </AccordionBtn>
        <AccordionBody open={productsOpen} loading={productsLoading}>
          {productsData && (
            <>
              {/* Filter Bar */}
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
                  <button key={opt.key} onClick={() => {
                    setProductsFilter(opt.key);
                    setProductsData(buildProductStats(applyProductsFilter(productsAllData, opt.key, productsCustomFrom, productsCustomTo)));
                  }} style={{
                    padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: productsFilter === opt.key ? '#fd7e14' : '#e9ecef',
                    color: productsFilter === opt.key ? 'white' : '#495057',
                  }}>{opt.label}</button>
                ))}
              </div>
              {productsFilter === 'custom' && (
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('from') || 'From'}:</label>
                  <input type="date" value={productsCustomFrom} onChange={e => { setProductsCustomFrom(e.target.value); setProductsData(buildProductStats(applyProductsFilter(productsAllData, 'custom', e.target.value, productsCustomTo))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('to') || 'To'}:</label>
                  <input type="date" value={productsCustomTo} onChange={e => { setProductsCustomTo(e.target.value); setProductsData(buildProductStats(applyProductsFilter(productsAllData, 'custom', productsCustomFrom, e.target.value))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                </div>
              )}
              {/* Search + Count + Refresh */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#666', fontSize: '0.85rem' }}>🔍</span>
                  <input type="text" placeholder={t('search') || 'Search...'} value={productsSearch} onChange={e => setProductsSearch(e.target.value)}
                    style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem', outline: 'none', width: '200px' }} />
                  <span style={{ color: '#666', fontSize: '0.88rem' }}>{t('products') || 'Products'}: <strong>{productsData.filter(r => !productsSearch || r.product_name.toLowerCase().includes(productsSearch.toLowerCase())).length}</strong></span>
                </div>
                <button onClick={async () => {
                  setProductsLoading(true);
                  try {
                    const res = await axios.get('/api/support-tickets');
                    setProductsAllData(res.data);
                    setProductsData(buildProductStats(applyProductsFilter(res.data, productsFilter, productsCustomFrom, productsCustomTo)));
                  } catch(e) { console.error(e); }
                  setProductsLoading(false);
                }} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
                  🔄 {t('refresh') || 'רענן'}
                </button>
              </div>
              {productsData.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'No data'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="product_name" sortState={productsSort} onSort={handleProductsSort}>{t('product') || 'מוצר'}</SortTh>
                      <SortTh field="total_cases" sortState={productsSort} onSort={handleProductsSort} style={{ width: '110px', textAlign: 'center' }}>{t('total_cases') || 'Total Cases'}</SortTh>
                      <SortTh field="open" sortState={productsSort} onSort={handleProductsSort} style={{ width: '90px', textAlign: 'center' }}>{t('open') || 'Open'}</SortTh>
                      <SortTh field="closed" sortState={productsSort} onSort={handleProductsSort} style={{ width: '90px', textAlign: 'center' }}>{t('closed') || 'Closed'}</SortTh>
                      <SortTh field="avg_days" sortState={productsSort} onSort={handleProductsSort} style={{ width: '130px', textAlign: 'center' }}>{t('avg_open_days') || 'Avg. Open Days'}</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = productsSearch.toLowerCase();
                      const filtered = q ? productsData.filter(r => r.product_name.toLowerCase().includes(q)) : productsData;
                      const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                      return sorted.map((row, i) => (
                        <tr key={row.product_name} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>📦 {row.product_name}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: '#fff3e0', color: '#e65100', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.total_cases}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.open > 0 ? <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.open}</span> : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.closed > 0 ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.closed}</span> : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.avg_days !== null
                              ? <span style={{ background: row.avg_days <= 3 ? '#d4edda' : row.avg_days <= 7 ? '#fff3cd' : '#f8d7da', color: row.avg_days <= 3 ? '#155724' : row.avg_days <= 7 ? '#856404' : '#721c24', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.avg_days}d</span>
                              : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fff3e0', fontWeight: 700, borderTop: '2px solid #fd7e14' }}>
                      <td style={{ padding: '0.65rem 1rem', color: '#e65100' }}>{t('total') || 'Total'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#e65100' }}>{productsData.reduce((s,r) => s+r.total_cases, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#856404' }}>{productsData.reduce((s,r) => s+r.open, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#155724' }}>{productsData.reduce((s,r) => s+r.closed, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        {(() => { const c = productsData.filter(r => r.avg_days !== null); return c.length > 0 ? Math.round(c.reduce((s,r) => s+r.avg_days, 0)/c.length) + 'd' : '—'; })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {productsData && productsData.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      const logoBase64 = logoBase64Cache;
                      const q = productsSearch.toLowerCase();
                      const filtered = q ? productsData.filter(r => r.product_name.toLowerCase().includes(q)) : productsData;
                      const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                      const rows = sorted.map(row => `
                        <tr>
                          <td>${row.product_name}</td>
                          <td style="text-align:center;">${row.total_cases}</td>
                          <td style="text-align:center;">${row.open}</td>
                          <td style="text-align:center;">${row.closed}</td>
                          <td style="text-align:center;">${row.avg_days !== null ? row.avg_days + 'd' : '—'}</td>
                        </tr>`).join('');
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Product Cases Analysis</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 3px solid #fd7e14; margin-bottom: 30px; }
                          .logo { width: 150px; height: auto; }
                          .company-info { color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #fd7e14; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          h1 { text-align: center; color: #fd7e14; margin: 20px 0; font-size: 1.8rem; }
                          .report-meta { text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; font-size: 0.85rem; }
                          th { background: #f8f9fa; font-weight: 600; color: #333; }
                          tfoot { background: #fff3e0; font-weight: 700; }
                          .footer { margin-top: 30px; padding: 20px 0 0; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 0.8rem; }
                          .button-container { text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; }
                          .btn-print-doc, .btn-close-doc { padding: 12px 24px; margin: 0 8px; font-size: 16px; cursor: pointer; border: none; border-radius: 5px; font-weight: 600; }
                          .btn-print-doc { background: #3498db; color: white; }
                          .btn-close-doc { background: #95a5a6; color: white; }
                          @media print { .button-container { display: none !important; } }
                        </style></head><body>
                        <div class="button-container">
                          <button class="btn-print-doc" onclick="window.print()">&#128424; Print / Save as PDF</button>
                          <button class="btn-close-doc" onclick="window.close()">&#10005; Close</button>
                        </div>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div style="font-size:2rem;color:#fd7e14;font-weight:700;">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>📦 ${t('product_cases_analysis') || 'Product Cases Analysis'}</h1>
                        <div class="report-meta">${t('products') || 'Products'}: <strong>${sorted.length}</strong> | ${t('total_cases') || 'Total Cases'}: <strong>${sorted.reduce((s,r) => s+r.total_cases, 0)}</strong></div>
                        <table><thead><tr>
                          <th>${t('product') || 'Product'}</th>
                          <th>${t('total_cases') || 'Total Cases'}</th>
                          <th>${t('open') || 'Open'}</th>
                          <th>${t('closed') || 'Closed'}</th>
                          <th>${t('avg_open_days') || 'Avg. Open Days'}</th>
                        </tr></thead><tbody>${rows}</tbody>
                        <tfoot><tr>
                          <td><strong>${t('total') || 'Total'}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.total_cases,0)}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.open,0)}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.closed,0)}</strong></td>
                          <td style="text-align:center;"></td>
                        </tr></tfoot></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                    }}
                    style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                  <button
                    onClick={async () => {
                      const XLSX = await import('xlsx');
                      const q = productsSearch.toLowerCase();
                      const filtered = q ? productsData.filter(r => r.product_name.toLowerCase().includes(q)) : productsData;
                      const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                      const data = [
                        [t('product') || 'Product', t('total_cases') || 'Total Cases', t('open') || 'Open', t('closed') || 'Closed', t('avg_open_days') || 'Avg. Open Days'],
                        ...sorted.map(r => [r.product_name, r.total_cases, r.open, r.closed, r.avg_days !== null ? r.avg_days : '']),
                        [t('total') || 'Total', sorted.reduce((s,r) => s+r.total_cases,0), sorted.reduce((s,r) => s+r.open,0), sorted.reduce((s,r) => s+r.closed,0), '']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(data);
                      ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Product Cases');
                      XLSX.writeFile(wb, `product_cases_${new Date().toISOString().split('T')[0]}.xlsx`);
                    }}
                    style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    📊 {t('save_excel') || 'שמור כאקסל'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 4 - Users Cases Analysis */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={customersOpen} onClick={toggleCustomersReport} color={{ base: '#6f42c1', dark: '#553098' }}>
          🧑‍💼 {t('users_cases_analysis') || 'Users Cases Analysis'}
        </AccordionBtn>
        <AccordionBody open={customersOpen} loading={customersLoading}>
          {customersData && (
            <>
              {/* Filter Bar */}
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
                  <button key={opt.key} onClick={() => {
                    setCustomersFilter(opt.key);
                    setCustomersData(buildUserStats(applyCustomersFilter(customersAllData, opt.key, customersCustomFrom, customersCustomTo)));
                  }} style={{
                    padding: '0.3rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: customersFilter === opt.key ? '#6f42c1' : '#e9ecef',
                    color: customersFilter === opt.key ? 'white' : '#495057',
                  }}>{opt.label}</button>
                ))}
              </div>
              {customersFilter === 'custom' && (
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('from') || 'From'}:</label>
                  <input type="date" value={customersCustomFrom} onChange={e => { setCustomersCustomFrom(e.target.value); setCustomersData(buildUserStats(applyCustomersFilter(customersAllData, 'custom', e.target.value, customersCustomTo))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                  <label style={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{t('to') || 'To'}:</label>
                  <input type="date" value={customersCustomTo} onChange={e => { setCustomersCustomTo(e.target.value); setCustomersData(buildUserStats(applyCustomersFilter(customersAllData, 'custom', customersCustomFrom, e.target.value))); }} style={{ border: '1px solid #ced4da', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                </div>
              )}
              {/* Count + Refresh */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#666', fontSize: '0.88rem' }}>{t('users') || 'Users'}: <strong>{customersData.filter(r => !customersSearch || r.owner_name.toLowerCase().includes(customersSearch.toLowerCase())).length}</strong>
                  {customersFilter !== 'all' && <span style={{ color: '#999', fontWeight: 400 }}> &nbsp;| {t('total_cases') || 'Total Cases'}: <strong>{customersData.reduce((s,r) => s+r.total_cases, 0)}</strong></span>}
                </span>
                <button onClick={async () => {
                  setCustomersLoading(true);
                  try {
                    const res = await axios.get('/api/support-tickets');
                    setCustomersAllData(res.data);
                    setCustomersData(buildUserStats(applyCustomersFilter(res.data, customersFilter, customersCustomFrom, customersCustomTo)));
                  } catch(e) { console.error(e); }
                  setCustomersLoading(false);
                }} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
                  🔄 {t('refresh') || 'רענן'}
                </button>
              </div>
              {customersData.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_data') || 'No data'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <SortTh field="owner_name" sortState={customersSort} onSort={handleCustomersSort}>{t('user') || 'User'}</SortTh>
                      <SortTh field="total_cases" sortState={customersSort} onSort={handleCustomersSort} style={{ width: '110px', textAlign: 'center' }}>{t('total_cases') || 'Total Cases'}</SortTh>
                      <SortTh field="open" sortState={customersSort} onSort={handleCustomersSort} style={{ width: '90px', textAlign: 'center' }}>{t('open') || 'Open'}</SortTh>
                      <SortTh field="closed" sortState={customersSort} onSort={handleCustomersSort} style={{ width: '90px', textAlign: 'center' }}>{t('closed') || 'Closed'}</SortTh>
                      <SortTh field="avg_days" sortState={customersSort} onSort={handleCustomersSort} style={{ width: '130px', textAlign: 'center' }}>{t('avg_open_days') || 'Avg. Open Days'}</SortTh>
                      <SortTh field="workload_pct" sortState={customersSort} onSort={handleCustomersSort} style={{ width: '120px', textAlign: 'center' }}>Workload %</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = customersSearch.toLowerCase();
                      const filtered = q ? customersData.filter(r => r.owner_name.toLowerCase().includes(q)) : customersData;
                      const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                      return sorted.map((row, i) => (
                        <tr key={row.owner_name} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>🧑‍💼 {row.owner_name}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: '#ede7f6', color: '#4527a0', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.total_cases}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.open > 0 ? <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.open}</span> : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.closed > 0 ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.closed}</span> : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            {row.avg_days !== null
                              ? <span style={{ background: row.avg_days <= 3 ? '#d4edda' : row.avg_days <= 7 ? '#fff3cd' : '#f8d7da', color: row.avg_days <= 3 ? '#155724' : row.avg_days <= 7 ? '#856404' : '#721c24', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>{row.avg_days}d</span>
                              : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                              <div style={{ flex: 1, height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden', maxWidth: '60px' }}>
                                <div style={{ width: row.workload_pct + '%', height: '100%', background: '#6f42c1', borderRadius: '3px' }}></div>
                              </div>
                              <span style={{ fontSize: '0.82rem', color: '#555', minWidth: '34px' }}>{row.workload_pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#ede7f6', fontWeight: 700, borderTop: '2px solid #6f42c1' }}>
                      <td style={{ padding: '0.65rem 1rem', color: '#4527a0' }}>{t('total') || 'Total'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#4527a0' }}>{customersData.reduce((s,r) => s+r.total_cases, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#856404' }}>{customersData.reduce((s,r) => s+r.open, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#155724' }}>{customersData.reduce((s,r) => s+r.closed, 0)}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        {(() => { const c = customersData.filter(r => r.avg_days !== null); return c.length > 0 ? Math.round(c.reduce((s,r) => s+r.avg_days, 0)/c.length) + 'd' : '—'; })()}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#4527a0' }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {customersData && customersData.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      const logoBase64 = logoBase64Cache;
                      const q = customersSearch.toLowerCase();
                      const filtered = q ? customersData.filter(r => r.owner_name.toLowerCase().includes(q)) : customersData;
                      const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                      const rows = sorted.map(row => `
                        <tr>
                          <td>${row.owner_name}</td>
                          <td style="text-align:center;">${row.total_cases}</td>
                          <td style="text-align:center;">${row.open}</td>
                          <td style="text-align:center;">${row.closed}</td>
                          <td style="text-align:center;">${row.avg_days !== null ? row.avg_days + 'd' : '—'}</td>
                          <td style="text-align:center;">${row.workload_pct}%</td>
                        </tr>`).join('');
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Users Cases Analysis</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 3px solid #6f42c1; margin-bottom: 30px; }
                          .logo { width: 150px; height: auto; }
                          .company-info { color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #6f42c1; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          h1 { text-align: center; color: #6f42c1; margin: 20px 0; font-size: 1.8rem; }
                          .report-meta { text-align: center; color: #666; font-size: 0.9rem; margin-bottom: 20px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; font-size: 0.85rem; }
                          th { background: #f8f9fa; font-weight: 600; color: #333; }
                          tfoot { background: #ede7f6; font-weight: 700; }
                          .footer { margin-top: 30px; padding: 20px 0 0; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 0.8rem; }
                          .button-container { text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; }
                          .btn-print-doc, .btn-close-doc { padding: 12px 24px; margin: 0 8px; font-size: 16px; cursor: pointer; border: none; border-radius: 5px; font-weight: 600; }
                          .btn-print-doc { background: #3498db; color: white; }
                          .btn-close-doc { background: #95a5a6; color: white; }
                          @media print { .button-container { display: none !important; } }
                        </style></head><body>
                        <div class="button-container">
                          <button class="btn-print-doc" onclick="window.print()">&#128424; Print / Save as PDF</button>
                          <button class="btn-close-doc" onclick="window.close()">&#10005; Close</button>
                        </div>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div style="font-size:2rem;color:#6f42c1;font-weight:700;">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>🧑‍💼 ${t('users_cases_analysis') || 'Users Cases Analysis'}</h1>
                        <div class="report-meta">${t('users') || 'Users'}: <strong>${sorted.length}</strong> | ${t('total_cases') || 'Total Cases'}: <strong>${sorted.reduce((s,r) => s+r.total_cases, 0)}</strong></div>
                        <table><thead><tr>
                          <th>${t('user') || 'User'}</th>
                          <th>${t('total_cases') || 'Total Cases'}</th>
                          <th>${t('open') || 'Open'}</th>
                          <th>${t('closed') || 'Closed'}</th>
                          <th>${t('avg_open_days') || 'Avg. Open Days'}</th>
                          <th>Workload %</th>
                        </tr></thead><tbody>${rows}</tbody>
                        <tfoot><tr>
                          <td><strong>${t('total') || 'Total'}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.total_cases,0)}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.open,0)}</strong></td>
                          <td style="text-align:center;"><strong>${sorted.reduce((s,r) => s+r.closed,0)}</strong></td>
                          <td style="text-align:center;"></td>
                          <td style="text-align:center;">100%</td>
                        </tr></tfoot></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                    }}
                    style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                  <button
                    onClick={async () => {
                      const XLSX = await import('xlsx');
                      const q = customersSearch.toLowerCase();
                      const filtered = q ? customersData.filter(r => r.owner_name.toLowerCase().includes(q)) : customersData;
                      const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                      const data = [
                        [t('user') || 'User', t('total_cases') || 'Total Cases', t('open') || 'Open', t('closed') || 'Closed', t('avg_open_days') || 'Avg. Open Days', 'Workload %'],
                        ...sorted.map(r => [r.owner_name, r.total_cases, r.open, r.closed, r.avg_days !== null ? r.avg_days : '', r.workload_pct + '%']),
                        [t('total') || 'Total', sorted.reduce((s,r) => s+r.total_cases,0), sorted.reduce((s,r) => s+r.open,0), sorted.reduce((s,r) => s+r.closed,0), '', '100%']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(data);
                      ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 }];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Users Cases');
                      XLSX.writeFile(wb, `users_cases_${new Date().toISOString().split('T')[0]}.xlsx`);
                    }}
                    style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    📊 {t('save_excel') || 'שמור כאקסל'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ccc', border: '2px dashed #e9ecef', borderRadius: '8px', background: '#fafafa' }}>
        {t('more_reports_coming') || '➕ דוחות נוספים יתווספו בקרוב'}
      </div>
    </div>
  );
}

export default SupportReports;
