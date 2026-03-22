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
  const [countrySort, setCountrySort] = useState({ field: 'total', dir: 'desc' });

  const [productsOpen, setProductsOpen] = useState(false);
  const [productsData, setProductsData] = useState(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsSort, setProductsSort] = useState({ field: 'total_qty', dir: 'desc' });
  const [productsSearch, setProductsSearch] = useState('');

  const [customersOpen, setCustomersOpen] = useState(false);
  const [customersData, setCustomersData] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersSort, setCustomersSort] = useState({ field: 'total', dir: 'desc' });
  const [customersSearch, setCustomersSearch] = useState('');

  const [profitOpen, setProfitOpen] = useState(false);
  const [closedDeals, setClosedDeals] = useState(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [profitData, setProfitData] = useState(null);
  const [profitCalcLoading, setProfitCalcLoading] = useState(false);

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

  const toggleProductsReport = async () => {
    if (productsOpen) { setProductsOpen(false); return; }
    if (!productsData) {
      setProductsLoading(true);
      try { const res = await axios.get('/api/quotes/products-summary'); setProductsData(res.data); }
      catch(e) { console.error(e); }
      setProductsLoading(false);
    }
    setProductsOpen(true);
  };

  const toggleCustomersReport = async () => {
    if (customersOpen) { setCustomersOpen(false); return; }
    if (!customersData) {
      setCustomersLoading(true);
      try { const res = await axios.get('/api/quotes/customers-summary'); setCustomersData(res.data); }
      catch(e) { console.error(e); }
      setCustomersLoading(false);
    }
    setCustomersOpen(true);
  };

  const toggleProfitReport = async () => {
    if (profitOpen) { setProfitOpen(false); setSelectedDeal(null); setProfitData(null); return; }
    if (!closedDeals) {
      setProfitLoading(true);
      try { const res = await axios.get('/api/quotes/closed-deals'); setClosedDeals(res.data); }
      catch(e) { console.error(e); }
      setProfitLoading(false);
    }
    setProfitOpen(true);
  };

  const loadProfitability = async (deal) => {
    setSelectedDeal(deal);
    setProfitCalcLoading(true);
    try {
      const res = await axios.get(`/api/quotes/${deal.id}/profitability`);
      setProfitData(res.data);
    } catch(e) { console.error(e); }
    setProfitCalcLoading(false);
  };

  const toggleCountryReport = async () => {
    if (countryOpen) { setCountryOpen(false); return; }
    if (!countryData) {
      setCountryLoading(true);
      try { const res = await axios.get('/api/quotes/country-summary'); setCountryData(res.data); }
      catch(e) { console.error(e); }
      setCountryLoading(false);
    }
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
    name: r => r.name || '',
    total_qty: r => r.total_qty || 0,
    deal_count: r => r.deal_count || 0,
    category: r => r.category_name || ''
  };
  const handleProductsSort = (f) => setProductsSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const handleCustomersSort = (f) => setCustomersSort(p => ({ field: f, dir: p.field === f && p.dir === 'asc' ? 'desc' : 'asc' }));
  const customersGetters = {
    customer_name: r => r.customer_name || '',
    deals: r => r.deals || 0,
    total: r => r.total || 0,
    country: r => r.country || '',
    percent: r => r.percent || 0,
  };
  const countryGetters = { country: r => r.country || '', deals: r => r.deals, total: r => r.total, currency: r => (r.currencies[0] || ''), percent: r => r.percent };

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

      {/* דוח 1 - Support Status Report */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={statusOpen} onClick={toggleStatusReport} color={{ base: '#007bff', dark: '#0056b3' }}>
          📞 {t('support_status_report') || 'Support Status Report'}
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
                      const printContent = `<html dir="${dir}"><head><meta charset="utf-8"><title>Support Status Report</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
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
                        </style></head><body>
                        <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div class="logo-placeholder">🌐 WorldSecure</div>`}
                          <div class="company-info"><strong>WorldSecure</strong><div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div></div>
                        </div>
                        <h1>📞 Support Status Report</h1>
                        <div class="report-meta">Open Cases: <strong>${sorted.length}</strong></div>
                        <table><thead><tr>
                          <th>Ticket #</th><th>Customer</th><th>Subject</th><th>Priority</th>
                          <th>Status</th><th>Owner</th><th>Created</th><th>Last Updated</th>
                        </tr></thead><tbody>${rows}</tbody></table>
                        <div class="footer">Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </body></html>`;
                      const printWindow = window.open('', '', 'width=800,height=600');
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
                      printWindow.print();
                      setTimeout(() => { printWindow.close(); }, 100);
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
                        </style></head><body>
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
                      const printWindow = window.open('', '', 'width=800,height=600');
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
                      printWindow.print();
                      setTimeout(() => { printWindow.close(); }, 100);
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

      {/* דוח 2 - מכירות לפי מדינה */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={countryOpen} onClick={toggleCountryReport} color={{ base: '#28a745', dark: '#1e7e34' }}>
          🌍 {t('sales_by_country') || 'מכירות לפי מדינה'}
        </AccordionBtn>
        <AccordionBody open={countryOpen} loading={countryLoading}>
          {countryData && countryData.rows.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>אין נתונים</div>
          )}
          {countryData && countryData.rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }}>
              <colgroup>
                <col />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead>
                <tr>
                  <SortTh field="country" sortState={countrySort} onSort={handleCountrySort}>{t('country') || 'מדינה'}</SortTh>
                  <SortTh field="deals" sortState={countrySort} onSort={handleCountrySort} style={{ textAlign: 'center' }}>{t('deals') || 'עסקאות'}</SortTh>
                  <SortTh field="total" sortState={countrySort} onSort={handleCountrySort} style={{ textAlign: 'right' }}>{t('sales') || 'מכירות'}</SortTh>
                  <SortTh field="currency" sortState={countrySort} onSort={handleCountrySort} style={{ textAlign: 'center' }}>{t('currency') || 'מטבע'}</SortTh>
                  <SortTh field="percent" sortState={countrySort} onSort={handleCountrySort} style={{ textAlign: 'center' }}>%</SortTh>
                </tr>
              </thead>
              <tbody>
                {doSort(countryData.rows, countrySort.field, countrySort.dir, countryGetters).map((row, i) => (
                  <tr key={row.country} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '0.6rem 1rem', fontWeight: 500, textAlign: 'center' }}>🌍 {row.country}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                      <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.deals}</span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>{fmt(row.total)}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>{row.currencies.join(', ')}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                        <div style={{ flex: 1, height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden', maxWidth: '60px' }}>
                          <div style={{ width: row.percent + '%', height: '100%', background: '#28a745', borderRadius: '3px' }}></div>
                        </div>
                        <span style={{ fontSize: '0.82rem', color: '#555', minWidth: '34px', textAlign: 'left' }}>{row.percent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#d4edda', fontWeight: 700, borderTop: '2px solid #28a745' }}>
                  <td style={{ padding: '0.65rem 1rem', color: '#155724' }}>{t('total') || 'סה"כ'}</td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#155724' }}>{countryData.grandDeals}</td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#155724' }}>{fmt(countryData.grandTotal)}</td>
                  <td style={{ padding: '0.65rem 1rem' }}></td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#155724' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          )}
          {countryData && countryData.rows.length > 0 && (
            <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={async () => {
                  // Determine direction based on language
                  const dir = language === 'he' ? 'rtl' : 'ltr';
                  const textAlign = language === 'he' ? 'right' : 'left';
                  
                  // Use preloaded logo
                  const logoBase64 = logoBase64Cache;
                  
                  // Create printable content
                  const printContent = `
                    <html dir="${dir}">
                    <head>
                      <meta charset="utf-8">
                      <title>Sales by Country Report</title>
                      <style>
                        @media print {
                          @page { margin: 1cm; }
                        }
                        body { 
                          font-family: Arial, sans-serif; 
                          padding: 20px; 
                          direction: ${dir}; 
                          margin: 0;
                        }
                        .header {
                          display: flex;
                          justify-content: space-between;
                          align-items: center;
                          padding: 20px 0;
                          border-bottom: 3px solid #28a745;
                          margin-bottom: 30px;
                        }
                        .logo {
                          width: 150px;
                          height: auto;
                          ${!logoBase64 ? 'display: none;' : ''}
                        }
                        .company-info {
                          text-align: ${textAlign === 'right' ? 'left' : 'right'};
                          color: #666;
                          font-size: 0.9rem;
                        }
                        .company-info strong {
                          display: block;
                          color: #28a745;
                          font-size: 1.8rem;
                          font-weight: 700;
                          margin-bottom: 5px;
                        }
                        .logo-placeholder {
                          font-size: 2.5rem;
                          color: #28a745;
                          font-weight: 700;
                        }
                        h1 { 
                          text-align: center; 
                          color: #28a745; 
                          margin: 20px 0;
                          font-size: 1.8rem;
                        }
                        .report-meta {
                          text-align: center;
                          color: #666;
                          font-size: 0.9rem;
                          margin-bottom: 20px;
                        }
                        table { 
                          width: 100%; 
                          border-collapse: collapse; 
                          margin-top: 20px; 
                          direction: ${dir}; 
                        }
                        th, td { 
                          border: 1px solid #dee2e6; 
                          padding: 12px; 
                          text-align: ${textAlign}; 
                        }
                        th { 
                          background: #f8f9fa; 
                          font-weight: 600; 
                          color: #333;
                        }
                        tfoot { 
                          background: #d4edda; 
                          font-weight: 700; 
                        }
                        .footer {
                          margin-top: 30px;
                          padding: 20px 0 0 0;
                          border-top: 1px solid #dee2e6;
                          text-align: center;
                          color: #999;
                          font-size: 0.8rem;
                          page-break-inside: avoid;
                        }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        ${logoBase64 
                          ? `<img src="${logoBase64}" alt="Company Logo" class="logo">` 
                          : `<div class="logo-placeholder">🌐 WorldSecure</div>`
                        }
                        <div class="company-info">
                          <strong>WorldSecure</strong>
                          <div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                        </div>
                      </div>
                      
                      <h1>🌍 ${t('sales_by_country') || 'מכירות לפי מדינה'}</h1>
                      
                      <div class="report-meta">
                        ${t('total') || 'סה"כ'}: <strong>${countryData.grandDeals}</strong> ${t('deals') || 'עסקאות'} | 
                        ${t('sales') || 'מכירות'}: <strong>${fmt(countryData.grandTotal)}</strong>
                      </div>
                      
                      <table>
                        <thead>
                          <tr>
                            <th>${t('country') || 'מדינה'}</th>
                            <th>${t('deals') || 'עסקאות'}</th>
                            <th>${t('sales') || 'מכירות'}</th>
                            <th>${t('currency') || 'מטבע'}</th>
                            <th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${countryData.rows.map(row => `
                            <tr>
                              <td>${row.country}</td>
                              <td>${row.deals}</td>
                              <td>${fmt(row.total)}</td>
                              <td>${row.currencies.join(', ')}</td>
                              <td>${row.percent}%</td>
                            </tr>
                          `).join('')}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td><strong>${t('total') || 'סה"כ'}</strong></td>
                            <td><strong>${countryData.grandDeals}</strong></td>
                            <td><strong>${fmt(countryData.grandTotal)}</strong></td>
                            <td></td>
                            <td><strong>100%</strong></td>
                          </tr>
                        </tfoot>
                      </table>
                      
                      <div class="footer">
                        Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}
                      
                      </div>
                    </body>
                    </html>
                  `;
                  const printWindow = window.open('', '', 'width=800,height=600');
                  printWindow.document.write(printContent);
                  printWindow.document.close();
                  
                  // Wait for images to load before printing
                  if (logoBase64) {
                    await new Promise(resolve => {
                      const checkReady = setInterval(() => {
                        if (printWindow.document.readyState === 'complete') {
                          clearInterval(checkReady);
                          setTimeout(resolve, 200); // Extra delay for image rendering
                        }
                      }, 50);
                    });
                  }
                  
                  // Auto-close window after print dialog closes
                  printWindow.print();
                  
                  // Close window after printing (or cancel)
                  setTimeout(() => {
                    printWindow.close();
                  }, 100);
                }}
                style={{
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🖨️ {t('print_pdf') || 'Print / Save as PDF'}
              </button>
              <button
                onClick={async () => {
                  // Dynamic import of SheetJS
                  const XLSX = await import('xlsx');
                  
                  // Prepare data
                  const data = [
                    // Headers
                    [t('country') || 'מדינה', t('deals') || 'עסקאות', t('sales') || 'מכירות', t('currency') || 'מטבע', '%'],
                    // Data rows
                    ...countryData.rows.map(row => [
                      row.country,
                      row.deals,
                      row.total,
                      row.currencies.join(', '),
                      row.percent
                    ]),
                    // Total row
                    [t('total') || 'סה"כ', countryData.grandDeals, countryData.grandTotal, '', 100]
                  ];
                  
                  // Create worksheet
                  const ws = XLSX.utils.aoa_to_sheet(data);
                  
                  // Set column widths
                  ws['!cols'] = [
                    { wch: 20 }, // Country
                    { wch: 12 }, // Deals
                    { wch: 15 }, // Sales
                    { wch: 12 }, // Currency
                    { wch: 8 }   // %
                  ];
                  
                  // Create workbook
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Sales by Country');
                  
                  // Download
                  const fileName = `sales_by_country_${new Date().toISOString().split('T')[0]}.xlsx`;
                  XLSX.writeFile(wb, fileName);
                }}
                style={{
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                📊 {t('save_excel') || 'שמור כאקסל'}
              </button>
            </div>
          )}
        </AccordionBody>
      </div>

      {/* דוח 3 - מוצרים נמכרים */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={productsOpen} onClick={toggleProductsReport} color={{ base: '#17a2b8', dark: '#117a8b' }}>
          📦 {t('product_sales_analysis') || 'ניתוח מכירות מוצרים'}
        </AccordionBtn>
        <AccordionBody open={productsOpen} loading={productsLoading}>
          {productsData && (
            <>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder={t('search') || 'חיפוש...'}
                  value={productsSearch}
                  onChange={e => setProductsSearch(e.target.value)}
                  style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem', outline: 'none', width: '200px' }}
                />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }}>
                <colgroup>
                  <col />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '160px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <SortTh field="name" sortState={productsSort} onSort={handleProductsSort}>{t('product') || 'מוצר'}</SortTh>
                    <SortTh field="total_qty" sortState={productsSort} onSort={handleProductsSort} style={{ textAlign: 'center' }}>{t('quantity') || 'כמות'}</SortTh>
                    <SortTh field="deal_count" sortState={productsSort} onSort={handleProductsSort} style={{ textAlign: 'center' }}>{t('deals') || 'עסקאות'}</SortTh>
                    <SortTh field="category" sortState={productsSort} onSort={handleProductsSort}>{t('category') || 'קטגוריה'}</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = productsSearch.toLowerCase();
                    const filtered = q
                      ? productsData.rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.category_name || '').toLowerCase().includes(q))
                      : productsData.rows;
                    const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                    const totalQty = filtered.reduce((s, r) => s + (r.total_qty || 0), 0);
                    const totalDeals = filtered.reduce((s, r) => s + (r.deal_count || 0), 0);
                    return <>
                      {sorted.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{row.name}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{fmt(row.total_qty)}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#555' }}>{row.deal_count}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#666', fontSize: '0.85rem' }}>
                            <span style={{ background: '#e9ecef', padding: '2px 8px', borderRadius: '10px' }}>{row.category_name || '-'}</span>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: '#e0f7fa', fontWeight: 700, borderTop: '2px solid #17a2b8' }}>
                        <td style={{ padding: '0.65rem 1rem', color: '#0c5460' }}>{t('total') || 'סה"כ'} ({sorted.length})</td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#0c5460' }}>{fmt(totalQty)}</td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#0c5460' }}>{totalDeals}</td>
                        <td></td>
                      </tr>
                    </>;
                  })()}
                </tbody>
              </table>
              {productsData.rows.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>אין נתונים</div>
              )}
              {productsData.rows.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      // Determine direction based on language
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      
                      // Load logo as base64
                      let logoBase64 = '';
                      try {
                        const response = await fetch('/logo.png', { cache: 'force-cache' });
                        const blob = await response.blob();
                        logoBase64 = await new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onloadend = () => resolve(reader.result);
                          reader.readAsDataURL(blob);
                        });
                      } catch (err) {
                        console.log('Logo not found, skipping');
                      }
                      
                      // Prepare data
                      const q = productsSearch.toLowerCase();
                      const filtered = q
                        ? productsData.rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.category_name || '').toLowerCase().includes(q))
                        : productsData.rows;
                      const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                      const totalQty = filtered.reduce((s, r) => s + (r.total_qty || 0), 0);
                      const totalDeals = filtered.reduce((s, r) => s + (r.deal_count || 0), 0);
                      
                      // Create printable content
                      const printContent = `
                        <html dir="${dir}">
                        <head>
                          <meta charset="utf-8">
                          <title>Product Sales Analysis Report</title>
                          <style>
                            @media print {
                              @page { 
                                margin: 1.5cm 1cm;
                              }
                            }
                            body { 
                              font-family: Arial, sans-serif; 
                              padding: 20px; 
                              direction: ${dir}; 
                              margin: 0;
                            }
                            .header {
                              display: flex;
                              justify-content: space-between;
                              align-items: center;
                              padding: 20px 0;
                              border-bottom: 3px solid #17a2b8;
                              margin-bottom: 30px;
                            }
                            .logo {
                              width: 150px;
                              height: auto;
                              ${!logoBase64 ? 'display: none;' : ''}
                            }
                            .logo-placeholder {
                              font-size: 2.5rem;
                              color: #17a2b8;
                              font-weight: 700;
                            }
                            .company-info {
                              text-align: ${textAlign === 'right' ? 'left' : 'right'};
                              color: #666;
                              font-size: 0.9rem;
                            }
                            .company-info strong {
                              display: block;
                              color: #17a2b8;
                              font-size: 1.8rem;
                              font-weight: 700;
                              margin-bottom: 5px;
                            }
                            h1 { 
                              text-align: center; 
                              color: #17a2b8; 
                              margin: 20px 0;
                              font-size: 1.8rem;
                            }
                            .report-meta {
                              text-align: center;
                              color: #666;
                              font-size: 0.9rem;
                              margin-bottom: 20px;
                            }
                            table { 
                              width: 100%; 
                              border-collapse: collapse; 
                              margin-top: 20px; 
                              direction: ${dir}; 
                            }
                            th, td { 
                              border: 1px solid #dee2e6; 
                              padding: 12px; 
                              text-align: ${textAlign}; 
                            }
                            th { 
                              background: #f8f9fa; 
                              font-weight: 600; 
                              color: #333;
                            }
                            tfoot { 
                              background: #e0f7fa; 
                              font-weight: 700; 
                            }
                            .footer {
                              text-align: center;
                              padding: 15px;
                              font-size: 0.8rem;
                              color: #999;
                              border-top: 1px solid #ddd;
                              margin-top: auto;
                              page-break-inside: avoid;
                            }
                          </style>
                        </head>
                        <body>
                      <div class="header">
                            ${logoBase64 
                              ? `<img src="${logoBase64}" alt="Company Logo" class="logo">` 
                              : `<div class="logo-placeholder">🌐 WorldSecure</div>`
                            }
                            <div class="company-info">
                              <strong>WorldSecure</strong>
                              <div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                            </div>
                          </div>
                          
                          <h1>📦 ${t('product_sales_analysis') || 'ניתוח מכירות מוצרים'}</h1>
                          
                          <div class="report-meta">
                            ${t('total') || 'סה"כ'}: <strong>${sorted.length}</strong> ${t('products') || 'מוצרים'} | 
                            ${t('quantity') || 'כמות'}: <strong>${fmt(totalQty)}</strong> | 
                            ${t('deals') || 'עסקאות'}: <strong>${totalDeals}</strong>
                          </div>
                          
                          <table>
                            <thead>
                              <tr>
                                <th>${t('product') || 'מוצר'}</th>
                                <th>${t('quantity') || 'כמות'}</th>
                                <th>${t('deals') || 'עסקאות'}</th>
                                <th>${t('category') || 'קטגוריה'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${sorted.map(row => `
                                <tr>
                                  <td>${row.name}</td>
                                  <td>${fmt(row.total_qty)}</td>
                                  <td>${row.deal_count}</td>
                                  <td>${row.category_name || '-'}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td><strong>${t('total') || 'סה"כ'} (${sorted.length})</strong></td>
                                <td><strong>${fmt(totalQty)}</strong></td>
                                <td><strong>${totalDeals}</strong></td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                          
                          <div class="footer">
                            Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}
                          
                      </div>
                    </body>
                        </html>
                      `;
                      
                      const printWindow = window.open('', '', 'width=800,height=600');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                      
                      // Auto-close window after print dialog closes
                      printWindow.print();
                      
                      // Close window after printing (or cancel)
                      setTimeout(() => {
                        printWindow.close();
                      }, 100);
                    }}
                    style={{
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                  <button
                    onClick={async () => {
                      // Dynamic import of SheetJS
                      const XLSX = await import('xlsx');
                      
                      // Prepare data
                      const q = productsSearch.toLowerCase();
                      const filtered = q
                        ? productsData.rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.category_name || '').toLowerCase().includes(q))
                        : productsData.rows;
                      const sorted = doSort(filtered, productsSort.field, productsSort.dir, productsGetters);
                      const totalQty = filtered.reduce((s, r) => s + (r.total_qty || 0), 0);
                      const totalDeals = filtered.reduce((s, r) => s + (r.deal_count || 0), 0);
                      
                      const data = [
                        // Headers
                        [t('product') || 'מוצר', t('quantity') || 'כמות', t('deals') || 'עסקאות', t('category') || 'קטגוריה'],
                        // Data rows
                        ...sorted.map(row => [
                          row.name,
                          row.total_qty,
                          row.deal_count,
                          row.category_name || '-'
                        ]),
                        // Total row
                        [t('total') || 'סה"כ' + ` (${sorted.length})`, totalQty, totalDeals, '']
                      ];
                      
                      // Create worksheet
                      const ws = XLSX.utils.aoa_to_sheet(data);
                      
                      // Set column widths
                      ws['!cols'] = [
                        { wch: 30 }, // Product
                        { wch: 12 }, // Quantity
                        { wch: 12 }, // Deals
                        { wch: 20 }  // Category
                      ];
                      
                      // Create workbook
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Product Sales Analysis');
                      
                      // Download
                      const fileName = `product_sales_analysis_${new Date().toISOString().split('T')[0]}.xlsx`;
                      XLSX.writeFile(wb, fileName);
                    }}
                    style={{
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    📊 {t('save_excel') || 'שמור כאקסל'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 4 - ניתוח מכירות לקוחות */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={customersOpen} onClick={toggleCustomersReport} color={{ base: '#6f42c1', dark: '#553098' }}>
          👥 {t('customer_sales_analysis') || 'ניתוח מכירות לקוחות'}
        </AccordionBtn>
        <AccordionBody open={customersOpen} loading={customersLoading}>
          {customersData && (
            <>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder={t('search') || 'חיפוש...'}
                  value={customersSearch}
                  onChange={e => setCustomersSearch(e.target.value)}
                  style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem', outline: 'none', width: '200px' }}
                />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }}>
                <colgroup>
                  <col />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '130px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <SortTh field="customer_name" sortState={customersSort} onSort={handleCustomersSort}>{t('customer') || 'לקוח'}</SortTh>
                    <SortTh field="deals" sortState={customersSort} onSort={handleCustomersSort} style={{ textAlign: 'center' }}>{t('deals') || 'עסקאות'}</SortTh>
                    <SortTh field="total" sortState={customersSort} onSort={handleCustomersSort} style={{ textAlign: 'right' }}>{t('sales') || 'מכירות'}</SortTh>
                    <SortTh field="country" sortState={customersSort} onSort={handleCustomersSort} style={{ textAlign: 'center' }}>{t('country') || 'מדינה'}</SortTh>
                    <SortTh field="percent" sortState={customersSort} onSort={handleCustomersSort} style={{ textAlign: 'center' }}>%</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = customersSearch.toLowerCase();
                    const filtered = q
                      ? customersData.rows.filter(r => (r.customer_name || '').toLowerCase().includes(q) || (r.country || '').toLowerCase().includes(q))
                      : customersData.rows;
                    const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                    const totalAmt = filtered.reduce((s, r) => s + (r.total || 0), 0);
                    const totalDeals = filtered.reduce((s, r) => s + (r.deals || 0), 0);
                    return <>
                      {sorted.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>👤 {row.customer_name}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem' }}>{row.deals}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>{fmt(row.total)}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>{row.country}</td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                              <div style={{ flex: 1, height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden', maxWidth: '60px' }}>
                                <div style={{ width: row.percent + '%', height: '100%', background: '#6f42c1', borderRadius: '3px' }}></div>
                              </div>
                              <span style={{ fontSize: '0.82rem', color: '#555', minWidth: '34px' }}>{row.percent}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: '#ede7f6', fontWeight: 700, borderTop: '2px solid #6f42c1' }}>
                        <td style={{ padding: '0.65rem 1rem', color: '#4527a0' }}>{t('total') || 'סה"כ'} ({sorted.length})</td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#4527a0' }}>{totalDeals}</td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#4527a0' }}>{fmt(totalAmt)}</td>
                        <td></td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#4527a0' }}>100%</td>
                      </tr>
                    </>;
                  })()}
                </tbody>
              </table>
              {customersData.rows.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>אין נתונים</div>
              )}
              {customersData.rows.length > 0 && (
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      // Determine direction based on language
                      const dir = language === 'he' ? 'rtl' : 'ltr';
                      const textAlign = language === 'he' ? 'right' : 'left';
                      
                      // Load logo as base64
                      let logoBase64 = '';
                      try {
                        const response = await fetch('/logo.png', { cache: 'force-cache' });
                        const blob = await response.blob();
                        logoBase64 = await new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onloadend = () => resolve(reader.result);
                          reader.readAsDataURL(blob);
                        });
                      } catch (err) {
                        console.log('Logo not found, skipping');
                      }
                      
                      // Prepare data
                      const q = customersSearch.toLowerCase();
                      const filtered = q
                        ? customersData.rows.filter(r => (r.customer_name || '').toLowerCase().includes(q) || (r.country || '').toLowerCase().includes(q))
                        : customersData.rows;
                      const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                      const totalAmt = filtered.reduce((s, r) => s + (r.total || 0), 0);
                      const totalDeals = filtered.reduce((s, r) => s + (r.deals || 0), 0);
                      
                      // Create printable content
                      const printContent = `
                        <html dir="${dir}">
                        <head>
                          <meta charset="utf-8">
                          <title>Customer Sales Analysis Report</title>
                          <style>
                            @media print {
                              @page { 
                                margin: 1.5cm 1cm;
                              }
                            }
                            body { 
                              font-family: Arial, sans-serif; 
                              padding: 20px; 
                              direction: ${dir}; 
                              margin: 0;
                            }
                            .header {
                              display: flex;
                              justify-content: space-between;
                              align-items: center;
                              padding: 20px 0;
                              border-bottom: 3px solid #6f42c1;
                              margin-bottom: 30px;
                            }
                            .logo {
                              width: 150px;
                              height: auto;
                              ${!logoBase64 ? 'display: none;' : ''}
                            }
                            .logo-placeholder {
                              font-size: 2.5rem;
                              color: #6f42c1;
                              font-weight: 700;
                            }
                            .company-info {
                              text-align: ${textAlign === 'right' ? 'left' : 'right'};
                              color: #666;
                              font-size: 0.9rem;
                            }
                            .company-info strong {
                              display: block;
                              color: #6f42c1;
                              font-size: 1.8rem;
                              font-weight: 700;
                              margin-bottom: 5px;
                            }
                            h1 { 
                              text-align: center; 
                              color: #6f42c1; 
                              margin: 20px 0;
                              font-size: 1.8rem;
                            }
                            .report-meta {
                              text-align: center;
                              color: #666;
                              font-size: 0.9rem;
                              margin-bottom: 20px;
                            }
                            table { 
                              width: 100%; 
                              border-collapse: collapse; 
                              margin-top: 20px; 
                              direction: ${dir}; 
                            }
                            th, td { 
                              border: 1px solid #dee2e6; 
                              padding: 12px; 
                              text-align: ${textAlign}; 
                            }
                            th { 
                              background: #f8f9fa; 
                              font-weight: 600; 
                              color: #333;
                            }
                            tfoot { 
                              background: #ede7f6; 
                              font-weight: 700; 
                            }
                            .footer {
                              text-align: center;
                              padding: 15px;
                              font-size: 0.8rem;
                              color: #999;
                              border-top: 1px solid #ddd;
                              margin-top: auto;
                              page-break-inside: avoid;
                            }
                          </style>
                        </head>
                        <body>
                      <div class="header">
                            ${logoBase64 
                              ? `<img src="${logoBase64}" alt="Company Logo" class="logo">` 
                              : `<div class="logo-placeholder">🌐 WorldSecure</div>`
                            }
                            <div class="company-info">
                              <strong>WorldSecure</strong>
                              <div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}</div>
                            </div>
                          </div>
                          
                          <h1>👥 ${t('customer_sales_analysis') || 'ניתוח מכירות לקוחות'}</h1>
                          
                          <div class="report-meta">
                            ${t('total') || 'סה"כ'}: <strong>${sorted.length}</strong> ${t('customers') || 'לקוחות'} | 
                            ${t('deals') || 'עסקאות'}: <strong>${totalDeals}</strong> | 
                            ${t('sales') || 'מכירות'}: <strong>${fmt(totalAmt)}</strong>
                          </div>
                          
                          <table>
                            <thead>
                              <tr>
                                <th>${t('customer') || 'לקוח'}</th>
                                <th>${t('deals') || 'עסקאות'}</th>
                                <th>${t('sales') || 'מכירות'}</th>
                                <th>${t('country') || 'מדינה'}</th>
                                <th>%</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${sorted.map(row => `
                                <tr>
                                  <td>${row.customer_name}</td>
                                  <td>${row.deals}</td>
                                  <td>${fmt(row.total)}</td>
                                  <td>${row.country}</td>
                                  <td>${row.percent}%</td>
                                </tr>
                              `).join('')}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td><strong>${t('total') || 'סה"כ'} (${sorted.length})</strong></td>
                                <td><strong>${totalDeals}</strong></td>
                                <td><strong>${fmt(totalAmt)}</strong></td>
                                <td></td>
                                <td><strong>100%</strong></td>
                              </tr>
                            </tfoot>
                          </table>
                          
                          <div class="footer">
                            Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : language === 'pt' ? 'pt-PT' : 'en-US')}
                          
                      </div>
                    </body>
                        </html>
                      `;
                      
                      const printWindow = window.open('', '', 'width=800,height=600');
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                      
                      // Auto-close window after print dialog closes
                      printWindow.print();
                      
                      // Close window after printing (or cancel)
                      setTimeout(() => {
                        printWindow.close();
                      }, 100);
                    }}
                    style={{
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    🖨️ {t('print_pdf') || 'Print / Save as PDF'}
                  </button>
                  <button
                    onClick={async () => {
                      // Dynamic import of SheetJS
                      const XLSX = await import('xlsx');
                      
                      // Prepare data
                      const q = customersSearch.toLowerCase();
                      const filtered = q
                        ? customersData.rows.filter(r => (r.customer_name || '').toLowerCase().includes(q) || (r.country || '').toLowerCase().includes(q))
                        : customersData.rows;
                      const sorted = doSort(filtered, customersSort.field, customersSort.dir, customersGetters);
                      const totalAmt = filtered.reduce((s, r) => s + (r.total || 0), 0);
                      const totalDeals = filtered.reduce((s, r) => s + (r.deals || 0), 0);
                      
                      const data = [
                        // Headers
                        [t('customer') || 'לקוח', t('deals') || 'עסקאות', t('sales') || 'מכירות', t('country') || 'מדינה', '%'],
                        // Data rows
                        ...sorted.map(row => [
                          row.customer_name,
                          row.deals,
                          row.total,
                          row.country,
                          row.percent
                        ]),
                        // Total row
                        [t('total') || 'סה"כ' + ` (${sorted.length})`, totalDeals, totalAmt, '', 100]
                      ];
                      
                      // Create worksheet
                      const ws = XLSX.utils.aoa_to_sheet(data);
                      
                      // Set column widths
                      ws['!cols'] = [
                        { wch: 25 }, // Customer
                        { wch: 12 }, // Deals
                        { wch: 15 }, // Sales
                        { wch: 15 }, // Country
                        { wch: 8 }   // %
                      ];
                      
                      // Create workbook
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Customer Sales Analysis');
                      
                      // Download
                      const fileName = `customer_sales_analysis_${new Date().toISOString().split('T')[0]}.xlsx`;
                      XLSX.writeFile(wb, fileName);
                    }}
                    style={{
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    📊 {t('save_excel') || 'שמור כאקסל'}
                  </button>
                </div>
              )}
            </>
          )}
        </AccordionBody>
      </div>

      {/* דוח 5 - רווחיות עסקה */}
      <div style={{ marginBottom: '1rem' }}>
        <AccordionBtn open={profitOpen} onClick={toggleProfitReport} color={{ base: '#fd7e14', dark: '#c96a10' }}>
          💹 {t('deal_profit_report') || '${translations.dealProfit}'}
        </AccordionBtn>
        <AccordionBody open={profitOpen} loading={profitLoading}>
          {closedDeals && !profitData && (
            <>
              {closedDeals.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>{t('no_closed_deals') || 'אין עסקאות סגורות'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }}>
                  <colgroup><col /><col style={{ width: '160px' }} /><col style={{ width: '130px' }} /><col style={{ width: '130px' }} /><col style={{ width: '100px' }} /></colgroup>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', fontWeight: 600 }}>{t('customer') || 'לקוח'}</th>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', fontWeight: 600, textAlign: 'right' }}>{t('total') || 'סכום'}</th>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', fontWeight: 600, textAlign: 'center' }}>{t('currency') || 'מטבע'}</th>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6', fontWeight: 600, textAlign: 'center' }}>{t('date') || 'תאריך סגירה'}</th>
                      <th style={{ padding: '0.65rem 1rem', borderBottom: '2px solid #dee2e6' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedDeals.map((deal, i) => (
                      <tr key={deal.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>#{deal.id} {deal.customer_name}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>{fmt(deal.total)}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666' }}>{deal.currency}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.82rem' }}>{deal.closed_at ? deal.closed_at.split('T')[0] : '-'}</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                          <button onClick={() => loadProfitability(deal)} style={{ background: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem 0.7rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            💹 {t('calc_profit') || 'חשב רווח'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {profitCalcLoading && <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>מחשב...</div>}

          {profitData && !profitCalcLoading && (
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#333' }}>💹 {t('deal_profitability') || 'רווחיות עסקה'} #{profitData.quote.id} — {profitData.quote.customer_name}</h4>
                <button onClick={() => { setProfitData(null); setSelectedDeal(null); }} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem 0.8rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  ← {t('back') || 'חזור'}
                </button>
              </div>

              {/* סך מכירה */}
              <div style={{ background: '#e3f2fd', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: '#1565c0' }}>💰 {t('total_sale') || 'סך מכירה'}</span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1565c0' }}>{fmt(profitData.totalSale)} {profitData.currency}</span>
              </div>

              {/* מוצרים */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#555' }}>📦 {t('product_costs') || '${translations.productCosts}'}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #dee2e6', textAlign: 'right' }}>{t('product') || 'מוצר'}</th>
                      <th style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #dee2e6', textAlign: 'center', width: '70px' }}>{t('quantity') || 'כמות'}</th>
                      <th style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #dee2e6', textAlign: 'right', width: '120px' }}>{t('sale_price') || 'מחיר מכירה'}</th>
                      <th style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #dee2e6', textAlign: 'right', width: '120px' }}>{t('purchase_price') || 'מחיר קנייה'}</th>
                      <th style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #dee2e6', textAlign: 'right', width: '110px' }}>{t('cost_total') || 'עלות סה"כ'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitData.items.map((item, i) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '0.5rem 0.8rem' }}>{item.product_name}</td>
                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: item.purchase_price ? '#333' : '#aaa' }}>{item.purchase_price ? fmt(item.purchase_price) : '—'}</td>
                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', fontWeight: 500, color: '#dc3545' }}>{item.purchase_price ? fmt(item.cost_total) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#ffeaea', fontWeight: 700, borderTop: '2px solid #dc3545' }}>
                      <td colSpan={4} style={{ padding: '0.5rem 0.8rem', color: '#c0392b' }}>{t('total_product_cost') || 'סה"כ ${translations.productCosts}'}</td>
                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: '#c0392b' }}>{fmt(profitData.productCost)} {profitData.currency}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ${translations.additionalCosts} */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#555' }}>💸 {t('additional_costs') || '${translations.additionalCosts}'} ({t('stage') || 'שלב'} 8)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <tbody>
                    {[
                      { label: t('cost_customs')||'עמיל מכס', val: profitData.additionalCosts.customs, cur: profitData.additionalCosts.customs_currency },
                      { label: t('cost_bank')||'עמלות בנק', val: profitData.additionalCosts.bank, cur: profitData.additionalCosts.bank_currency },
                      { label: t('cost_shipping')||'הובלה לשדה', val: profitData.additionalCosts.shipping, cur: profitData.additionalCosts.shipping_currency },
                      { label: t('cost_other')||'שונות', val: profitData.additionalCosts.other, cur: profitData.additionalCosts.other_currency },
                    ].filter(r => r.val > 0).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '0.4rem 0.8rem' }}>{r.label}</td>
                        <td style={{ padding: '0.4rem 0.8rem', textAlign: 'right', color: '#e67e22' }}>{fmt(r.val)} {r.cur}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#fff3cd', fontWeight: 700, borderTop: '2px solid #ffc107' }}>
                      <td style={{ padding: '0.5rem 0.8rem', color: '#856404' }}>{t('total_additional_costs') || 'סה"כ ${translations.additionalCosts}'}</td>
                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: '#856404' }}>{fmt(profitData.additionalCosts.total)} {profitData.additionalCosts.base_currency}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* סיכום רווח */}
              <div style={{ background: profitData.netProfit >= 0 ? '#d4edda' : '#f8d7da', border: `2px solid ${profitData.netProfit >= 0 ? '#28a745' : '#dc3545'}`, borderRadius: '8px', padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>{t('total_costs') || 'סה"כ עלויות'}</div>
                    <div style={{ fontWeight: 700, color: '#dc3545', fontSize: '1rem' }}>{fmt(profitData.totalCosts)} {profitData.currency}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>{t('net_profit') || 'רווח נקי'}</div>
                    <div style={{ fontWeight: 700, color: profitData.netProfit >= 0 ? '#155724' : '#721c24', fontSize: '1.1rem' }}>{fmt(profitData.netProfit)} {profitData.currency}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>{t('profit_margin') || 'מרווח רווח'}</div>
                    <div style={{ fontWeight: 700, fontSize: '1.3rem', color: profitData.profitPct >= 0 ? '#155724' : '#721c24' }}>{profitData.profitPct}%</div>
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              <div style={{ padding: '1rem 0', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #dee2e6', marginTop: '1rem' }}>
                <button
                  onClick={async () => {
                    // Pre-calculate all translations
                    const translations = {
                      dealProfit: t('deal_profit_report') || 'חישוב רווח לעסקה',
                      customer: t('customer') || 'לקוח',
                      totalSale: t('total_sale') || 'סך מכירה',
                      productCosts: t('product_costs') || 'עלות מוצרים',
                      product: t('product') || 'מוצר',
                      quantity: t('quantity') || 'כמות',
                      salePrice: t('sale_price') || 'מחיר מכירה',
                      purchasePrice: t('purchase_price') || 'מחיר קנייה',
                      costTotal: t('cost_total') || 'עלות סה"כ',
                      totalProductCost: t('total_product_cost') || 'סה"כ עלות מוצרים',
                      additionalCosts: t('additional_costs') || 'עלויות נוספות',
                      costCustoms: t('cost_customs') || 'עמיל מכס',
                      costBank: t('cost_bank') || 'עמלות בנק',
                      costShipping: t('cost_shipping') || 'הובלה לשדה',
                      costOther: t('cost_other') || 'שונות',
                      totalAdditionalCosts: t('total_additional_costs') || 'סה"כ עלויות נוספות',
                      totalCosts: t('total_costs') || 'סה"כ עלויות',
                      netProfit: t('net_profit') || 'רווח נקי',
                      profitMargin: t('profit_margin') || 'מרווח רווח'
                    };
                    
                    // Load logo as base64
                    let logoBase64 = '';
                    try {
                      const response = await fetch('/logo.png', { cache: 'force-cache' });
                      const blob = await response.blob();
                      logoBase64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                    } catch (err) {
                      console.log('Logo not found, skipping');
                    }

                    const dir = language === 'he' ? 'rtl' : 'ltr';
                    const textAlign = language === 'he' ? 'right' : 'left';
                    
                    // Pre-calculate costs array
                    const additionalCostsArray = [
                      { label: translations.costCustoms, val: profitData.additionalCosts.customs },
                      { label: translations.costBank, val: profitData.additionalCosts.bank },
                      { label: translations.costShipping, val: profitData.additionalCosts.shipping },
                      { label: translations.costOther, val: profitData.additionalCosts.other }
                    ].filter(r => r.val > 0);
                    
                    const printContent = `
                      <html dir="${dir}">
                      <head>
                        <meta charset="utf-8">
                        <title>${translations.dealProfit} - ${profitData.quote.customer_name}</title>
                        <style>
                          @media print { @page { margin: 1cm; } }
                          body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; margin: 0; }
                          .header {
                            display: flex; justify-content: space-between; align-items: center;
                            padding: 20px 0; border-bottom: 3px solid #fd7e14; margin-bottom: 30px;
                          }
                          .logo { width: 150px; height: auto; ${!logoBase64 ? 'display: none;' : ''} }
                          .logo-placeholder { font-size: 2.5rem; color: #fd7e14; font-weight: 700; }
                          .company-info { text-align: ${textAlign === 'right' ? 'left' : 'right'}; color: #666; font-size: 0.9rem; }
                          .company-info strong { display: block; color: #fd7e14; font-size: 1.8rem; font-weight: 700; margin-bottom: 5px; }
                          h1 { text-align: center; color: #fd7e14; margin: 20px 0; font-size: 1.8rem; }
                          table { width: 100%; border-collapse: collapse; margin: 15px 0; direction: ${dir}; }
                          th, td { border: 1px solid #dee2e6; padding: 10px; text-align: ${textAlign}; }
                          th { background: #f8f9fa; font-weight: 600; }
                          .summary-box { background: ${profitData.netProfit >= 0 ? '#d4edda' : '#f8d7da'}; 
                                         border: 2px solid ${profitData.netProfit >= 0 ? '#28a745' : '#dc3545'}; 
                                         padding: 20px; border-radius: 8px; margin-top: 20px; }
                          .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; 
                                   text-align: center; color: #999; font-size: 0.85rem; }
                        </style>
                      </head>
                      <body>
                      <div class="header">
                          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : `<div class="logo-placeholder">🌐 WorldSecure</div>`}
                          <div class="company-info">
                            <strong>WorldSecure</strong>
                            <div>${new Date().toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US')}</div>
                          </div>
                        </div>
                        
                        <h1>💹 ${translations.dealProfit} #${profitData.quote.id}</h1>
                        <h3 style="text-align: center; color: #666;">${translations.customer}: ${profitData.quote.customer_name}</h3>
                        
                        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                          <strong>💰 ${translations.totalSale}:</strong> <span style="font-size: 1.2rem; font-weight: 700;">${fmt(profitData.totalSale)} ${profitData.currency}</span>
                        </div>
                        
                        <h3>📦 ${translations.productCosts}</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>${translations.product}</th><th>${translations.quantity}</th><th>${translations.salePrice}</th><th>${translations.purchasePrice}</th><th>עלות סה"כ</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${profitData.items.map(item => `
                              <tr>
                                <td>${item.product_name}</td>
                                <td style="text-align: center;">${item.quantity}</td>
                                <td>${fmt(item.unit_price)}</td>
                                <td>${item.purchase_price ? fmt(item.purchase_price) : '—'}</td>
                                <td>${item.purchase_price ? fmt(item.cost_total) : '—'}</td>
                              </tr>
                            `).join('')}
                            <tr style="background: #ffeaea; font-weight: 700;">
                              <td colspan="4">סה"כ ${translations.productCosts}</td>
                              <td>${fmt(profitData.productCost)} ${profitData.currency}</td>
                            </tr>
                          </tbody>
                        </table>
                        
                        <h3>💸 ${translations.additionalCosts}</h3>
                        <table>
                          <tbody>
                            ${additionalCostsArray.map(r => `
                              <tr>
                                <td>${r.label}</td>
                                <td style="text-align: right;">${fmt(r.val)} ${profitData.additionalCosts.base_currency}</td>
                              </tr>
                            `).join('')}
                            <tr style="background: #fff3cd; font-weight: 700;">
                              <td>סה"כ ${translations.additionalCosts}</td>
                              <td style="text-align: right;">${fmt(profitData.additionalCosts.total)} ${profitData.additionalCosts.base_currency}</td>
                            </tr>
                          </tbody>
                        </table>
                        
                        <div class="summary-box">
                          <table style="border: none; margin: 0;">
                            <tr style="border: none;">
                              <td style="border: none; font-size: 1.1rem;"><strong>סה"כ עלויות:</strong></td>
                              <td style="border: none; text-align: right; font-size: 1.1rem; color: #dc3545; font-weight: 700;">${fmt(profitData.totalCosts)} ${profitData.currency}</td>
                            </tr>
                            <tr style="border: none;">
                              <td style="border: none; font-size: 1.2rem;"><strong>${translations.netProfit}:</strong></td>
                              <td style="border: none; text-align: right; font-size: 1.3rem; color: ${profitData.netProfit >= 0 ? '#155724' : '#721c24'}; font-weight: 700;">${fmt(profitData.netProfit)} ${profitData.currency}</td>
                            </tr>
                            <tr style="border: none;">
                              <td style="border: none; font-size: 1.2rem;"><strong>${translations.profitMargin}:</strong></td>
                              <td style="border: none; text-align: right; font-size: 1.5rem; color: ${profitData.netProfit >= 0 ? '#155724' : '#721c24'}; font-weight: 700;">${profitData.profitPct}%</td>
                            </tr>
                          </table>
                        </div>
                        
                        <div class="footer">
                          Generated by WorldSecure CRM • ${new Date().toLocaleString(language === 'he' ? 'he-IL' : 'en-US')}
                        
                      </div>
                    </body>
                      </html>
                    `;
                    
                    const printWindow = window.open('', '', 'width=800,height=600');
                    printWindow.document.write(printContent);
                    printWindow.document.close();
                    printWindow.print();
                    setTimeout(() => printWindow.close(), 100);
                  }}
                  style={{
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  🖨️ {t('print_pdf') || 'שמור PDF / הדפס'}
                </button>
                
                <button
                  onClick={async () => {
                    const XLSX = await import('xlsx');
                    
                    // Products table
                    const productsData = [
                      ['מוצר', 'כמות', 'מחיר מכירה', 'מחיר קנייה', 'עלות סה"כ'],
                      ...profitData.items.map(item => [
                        item.product_name,
                        item.quantity,
                        item.unit_price,
                        item.purchase_price || 0,
                        item.cost_total || 0
                      ]),
                      ['סה"כ ${translations.productCosts}', '', '', '', profitData.productCost]
                    ];
                    
                    // Additional costs
                    const costsData = [
                      ['', ''],
                      ['${translations.additionalCosts}', ''],
                      ['עמיל מכס', profitData.additionalCosts.customs],
                      ['עמלות בנק', profitData.additionalCosts.bank],
                      ['הובלה לשדה', profitData.additionalCosts.shipping],
                      ['שונות', profitData.additionalCosts.other],
                      ['סה"כ ${translations.additionalCosts}', profitData.additionalCosts.total]
                    ];
                    
                    // Summary
                    const summaryData = [
                      ['', ''],
                      ['סיכום', ''],
                      ['סך מכירה', profitData.totalSale],
                      ['סה"כ עלויות', profitData.totalCosts],
                      ['רווח נקי', profitData.netProfit],
                      ['מרווח רווח (%)', profitData.profitPct]
                    ];
                    
                    const allData = [...productsData, ...costsData, ...summaryData];
                    
                    const ws = XLSX.utils.aoa_to_sheet(allData);
                    ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
                    
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Profit Calculation');
                    
                    const fileName = `חישוב_רווח_לעסקה_${profitData.quote.customer_name}_${new Date().toISOString().split('T')[0]}.xlsx`;
                    XLSX.writeFile(wb, fileName);
                  }}
                  style={{
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  📊 {t('save_excel') || 'שמור כאקסל'}
                </button>
              </div>
            </div>
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
