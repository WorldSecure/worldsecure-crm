import React, { useState, useEffect, useRef } from 'react';
import SupportCaseManagementModal from './SupportCaseManagementModal';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import ProductPicker from './ProductPicker';
import MobilePicker from './MobilePicker';

const SortIcon = ({ column, sortBy, sortOrder }) => {
  if (sortBy !== column) return <span style={{ opacity: 0.3, marginInlineEnd: '4px' }}>↕</span>;
  return <span style={{ marginInlineEnd: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
};

const PRIORITIES = [
  { value: 'low',    emoji: '🟢', he: 'נמוך',   en: 'Low',    pt: 'Baixo'   },
  { value: 'medium', emoji: '🟡', he: 'בינוני', en: 'Medium', pt: 'Médio'   },
  { value: 'high',   emoji: '🟠', he: 'גבוה',   en: 'High',   pt: 'Alto'    },
  { value: 'urgent', emoji: '🔴', he: 'דחוף',   en: 'Urgent', pt: 'Urgente' },
];

function SupportManagement() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tickets, setTickets]     = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAwaitingPopup, setShowAwaitingPopup] = useState(false);
  const [showSendProduct, setShowSendProduct] = useState(false);
  const [sendProductForm, setSendProductForm] = useState({ product_id:'', product_name:'', quantity:1 });
  const [sendingProduct, setSendingProduct] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTicket, setHistoryTicket] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [awaitingForm, setAwaitingForm] = useState({ channel: '', note: '', deadline: '' });
  const [pendingStatus, setPendingStatus] = useState(null); // ticket id waiting for awaiting confirmation
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const [images, setImages]       = useState([]);
  const [sortBy, setSortBy]       = useState('id');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showCaseModal, setShowCaseModal]   = useState(false);
  const [caseTicket, setCaseTicket]         = useState(null);
  const fileRef = useRef();

  const EMPTY_FORM = {
    customer_id: '', customer_name: '', product_id: '', product_name: '',
    subject: '', description: '', priority: 'medium', status: 'open',
    owner_id: user?.id || '', owner_name: user?.username || '',
  };
  const [form, setForm] = useState(EMPTY_FORM);

  const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const calls = [
        axios.get('/api/support-tickets', auth()),
        axios.get('/api/customers',       auth()),
        axios.get('/api/products',        auth()),
      ];
      if (isAdmin) calls.push(axios.get('/api/users', auth()));
      const results = await Promise.all(calls);
      setTickets(results[0].data);
      const allCustomers = results[1].data;
      setCustomers(isAdmin ? allCustomers : allCustomers.filter(c => !c.is_sensitive));
      setProducts(results[2].data);
      if (isAdmin) setUsers(results[3].data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('desc'); }
  };

  const sorted = [...tickets].sort((a, b) => {
    let av = a[sortBy] ?? '', bv = b[sortBy] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return av < bv ? (sortOrder === 'asc' ? -1 : 1) : av > bv ? (sortOrder === 'asc' ? 1 : -1) : 0;
  });

  const openNew = () => {
    setForm({ ...EMPTY_FORM, owner_id: user?.id || '', owner_name: user?.username || '' });
    setImages([]); setEditingId(null); setShowModal(true);
  };
  const openEdit = (tk) => {
    setForm({
      customer_id: tk.customer_id||'', customer_name: tk.customer_name||'',
      product_id: tk.product_id||'',   product_name: tk.product_name||'',
      subject: tk.subject||'',         description: tk.description||'',
      priority: tk.priority||'medium', status: tk.status||'open',
      owner_id: tk.owner_id||'',       owner_name: tk.owner_name||'',
      created_by_name: tk.created_by_name || tk.owner_name || '',
    });
    setImages([]); setEditingId(tk.id); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setForm(EMPTY_FORM); setImages([]); setEditingId(null); };

  const addImages = (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...valid].slice(0, 5));
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      setSavingComment(true);
      await axios.post(`/api/support-tickets/${historyTicket.id}/comments`, { comment: newComment }, auth());
      setNewComment('');
      // Refresh history
      const res = await axios.get(`/api/support-tickets/${historyTicket.id}/history`, auth());
      setHistoryData(res.data);
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSavingComment(false); }
  };

  const openHistory = async (tk) => {
    setHistoryTicket(tk);
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const res = await axios.get(`/api/support-tickets/${tk.id}/history`, auth());
      setHistoryData(res.data);
    } catch(e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const handleSendProduct = async () => {
    if (!sendProductForm.product_id) { alert('יש לבחור מוצר'); return; }
    if (!editingId) { alert(t('save_ticket_first') || 'Please save the ticket first'); return; }
    try {
      setSendingProduct(true);
      await axios.post('/api/warehouse-alerts', {
        ticket_id: editingId,
        product_id: sendProductForm.product_id,
        product_name: sendProductForm.product_name,
        quantity: sendProductForm.quantity
      }, auth());
      // Log to ticket history
      await axios.post(`/api/support-tickets/${editingId}/comments`, {
        comment: `📦 ${t('product_send_requested')||'Product dispatch requested'}: ${sendProductForm.product_name} x${sendProductForm.quantity}`
      }, auth());
      setShowSendProduct(false);
      setSendProductForm({ product_id:'', product_name:'', quantity:1 });
      showToast(t('product_sent_to_warehouse')||'✅ Product dispatch request sent to warehouse');
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSendingProduct(false); }
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'awaiting_customer') {
      setAwaitingForm({ channel: '', note: '', deadline: '' });
      setShowAwaitingPopup(true);
    } else {
      setForm({...form, status: newStatus});
    }
  };

  const handleAwaitingConfirm = () => {
    if (!awaitingForm.channel) { alert('יש לבחור ערוץ תקשורת'); return; }
    setForm({...form, status: 'awaiting_customer', awaiting_channel: awaitingForm.channel, awaiting_note: awaitingForm.note, awaiting_deadline: awaitingForm.deadline});
    setShowAwaitingPopup(false);
  };

  const handleSave = async () => {
    if (!form.customer_id) { alert(t('customer_required')); return; }
    if (!form.product_id)  { alert(t('product_required')); return; }
    if (!form.subject.trim()) { alert(t('subject_required')); return; }
    try {
      setSaving(true);
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
      images.forEach(img => fd.append('images', img));
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' };
      if (editingId) {
        await axios.put(`/api/support-tickets/${editingId}`, fd, { headers });
        showToast('✅ ' + (t('ticket_updated')));
      } else {
        const res = await axios.post('/api/support-tickets', fd, { headers });
        showToast('✅ ' + (t('ticket_created')) + ' ' + res.data.ticket_number);
      }
      closeModal(); fetchAll();
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try { await axios.delete(`/api/support-tickets/${id}`, auth()); fetchAll(); }
    catch(e) { alert(e.response?.data?.error || e.message); }
  };

  const getPriorityLabel = (p) => {
    const pr = PRIORITIES.find(x => x.value === p);
    if (!pr) return p||'-';
    return `${pr.emoji} ${language==='he' ? pr.he : language==='pt' ? pr.pt : pr.en}`;
  };

  const getStatusBadge = (s) => {
    const m = {
      open:               { bg:'#FF9800', border:'#F57C00', label: t('status_open')},
      in_progress:        { bg:'#FF5722', border:'#E64A19', label: t('status_in_progress')},
      awaiting_customer:  { bg:'#4CAF50', border:'#388E3C', label: t('status_awaiting_customer')},
      closed:             { bg:'#2196F3', border:'#1976D2', label: t('status_closed')},
      cancelled:          { bg:'#9E9E9E', border:'#757575', label: t('status_cancelled')},
    };
    const st = m[s] || { bg:'#9E9E9E', border:'#757575', label: s||'-' };
    return <span style={{ background: st.bg, color:'white', border:`1px solid ${st.border}`, padding:'0.25rem 0.5rem', borderRadius:'12px', fontSize:'0.78rem', fontWeight:600, display:'inline-block', textAlign:'center', maxWidth:'85px', lineHeight:'1.3', wordBreak:'break-word' }}>{st.label}</span>;
  };

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:'1.5rem', right:'1.5rem', background:'#27ae60', color:'white', padding:'1rem 1.5rem', borderRadius:'10px', zIndex:9999, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <h2 className="page-title">📞 {t('support_management')}</h2>
        <button className="btn btn-primary" onClick={openNew}>
          ➕ {t('open_new_ticket')}
        </button>
      </div>


      {/* Table / Cards */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            {isAdmin ? t('all_tickets') : t('my_tickets')} | {t('total')}: {tickets.length}
          </h3>
        </div>
        {loading ? <div className="loading">{t('loading')}</div> : (
          <>
            {/* Desktop Table */}
            <div style={{ display: window.innerWidth <= 768 ? 'none' : 'block' }}>
              <div className="table-container" style={{ overflowX:'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('ticket_number')} style={{ cursor:'pointer', userSelect:'none', width:'120px' }}><SortIcon column="ticket_number" sortBy={sortBy} sortOrder={sortOrder} />{t('ticket_number')||'Ticket'}</th>
                      <th onClick={() => handleSort('customer_name')} style={{ cursor:'pointer', userSelect:'none' }}><SortIcon column="customer_name" sortBy={sortBy} sortOrder={sortOrder} />{t('customer')}</th>
                      <th onClick={() => handleSort('subject')} style={{ cursor:'pointer', userSelect:'none' }}><SortIcon column="subject" sortBy={sortBy} sortOrder={sortOrder} />{t('subject')}</th>
                      <th onClick={() => handleSort('priority')} style={{ cursor:'pointer', userSelect:'none', width:'90px' }}><SortIcon column="priority" sortBy={sortBy} sortOrder={sortOrder} />{t('priority')}</th>
                      <th onClick={() => handleSort('status')} style={{ cursor:'pointer', userSelect:'none', width:'130px' }}><SortIcon column="status" sortBy={sortBy} sortOrder={sortOrder} />{t('status')}</th>
                      <th onClick={() => handleSort('created_at')} style={{ cursor:'pointer', userSelect:'none', width:'100px' }}><SortIcon column="created_at" sortBy={sortBy} sortOrder={sortOrder} />{t('date')}</th>
                      <th style={{ width:'120px', minWidth:'120px' }}>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan="7" className="text-center">{t('no_tickets')}</td></tr>
                    ) : sorted.map(tk => (
                      <tr key={tk.id}>
                        <td style={{ fontWeight:700, color:'#2196F3', fontSize:'0.85rem', whiteSpace:'nowrap' }}>{tk.ticket_number || `#${tk.id}`}</td>
                        <td style={{ wordBreak:'break-word' }}>{tk.customer_name||'-'}</td>
                        <td style={{ wordBreak:'break-word' }}>{tk.subject}</td>
                        <td>{getPriorityLabel(tk.priority)}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', flexWrap:'wrap' }}>
                            {getStatusBadge(tk.status)}
                            {tk.status === 'awaiting_customer' && tk.awaiting_channel && (
                              <span style={{ fontSize:'1rem' }}>
                                {tk.awaiting_channel === 'phone' ? '☎️' : tk.awaiting_channel === 'email' ? '📧' : '📱'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</td>
                        <td>
                          <button
                            onClick={() => { setCaseTicket(tk); setShowCaseModal(true); }}
                            style={{ padding:'0.4rem 0.5rem', background:'#1e40af', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.82rem', fontWeight:700, whiteSpace:'normal', lineHeight:'1.3', textAlign:'center', width:'100%' }}
                          >
                            🗂️ {t('case_management')||'Case Management'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div style={{ display: window.innerWidth <= 768 ? 'flex' : 'none', flexDirection:'column', gap:'0.75rem', padding:'0.5rem 0' }}>
              {sorted.length === 0 ? (
                <div className="text-center" style={{ padding:'2rem', color:'#888' }}>{t('no_tickets')}</div>
              ) : sorted.map(tk => (
                <div key={tk.id} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'1rem', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                    <span style={{ fontWeight:700, color:'#2196F3', fontSize:'0.9rem' }}>{tk.ticket_number || `#${tk.id}`}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                      {getStatusBadge(tk.status)}
                      {tk.status === 'awaiting_customer' && tk.awaiting_channel && (
                        <span>{tk.awaiting_channel === 'phone' ? '☎️' : tk.awaiting_channel === 'email' ? '📧' : '📱'}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize:'0.9rem', fontWeight:600, marginBottom:'0.25rem', color:'#1e293b' }}>{tk.subject}</div>
                  <div style={{ fontSize:'0.82rem', color:'#64748b', marginBottom:'0.25rem' }}>👥 {tk.customer_name||'-'}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.5rem' }}>
                    <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                      {getPriorityLabel(tk.priority)}
                      <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>{tk.created_at ? new Date(tk.created_at).toLocaleDateString() : '-'}</span>
                    </div>
                    <button
                      onClick={() => { setCaseTicket(tk); setShowCaseModal(true); }}
                      style={{ padding:'0.4rem 0.8rem', background:'#1e40af', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.82rem', fontWeight:700 }}
                    >
                      🗂️ {t('case_management')||'Case'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:'600px', width:'95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingId ? (t('edit_ticket')) : (t('open_new_ticket'))}</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            {/* Created By + Owner */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">👤 {t('created_by')}</label>
                <input className="form-input" value={editingId ? (form.created_by_name||'') : (user?.username||'')} readOnly style={{ background:'#f5f5f5', color:'#666' }} />
              </div>
              <div className="form-group">
                <label className="form-label">👤 {t('owner')}</label>
                {isAdmin ? (
                  <select className="form-select" value={form.owner_id} onChange={e => {
                    const u = users.find(u => u.id === parseInt(e.target.value));
                    setForm({...form, owner_id: e.target.value, owner_name: u?.username||''});
                  }}>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={user?.username||''} readOnly style={{ background:'#f5f5f5', color:'#666' }} />
                )}
              </div>
            </div>

            {/* לקוח + מוצר */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">👥 {t('customer')} *</label>
                <MobilePicker
                  options={customers.map(c => ({ value: String(c.id), label: c.name }))}
                  value={String(form.customer_id)}
                  onChange={val => {
                    const c = customers.find(c => c.id === parseInt(val));
                    setForm({...form, customer_id: val, customer_name: c?.name||''});
                  }}
                  placeholder={t('select_customer')}
                  label={t('customer')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">📦 {t('product')||'מוצר'} *</label>
                <ProductPicker
                  products={products}
                  value={form.product_id}
                  onChange={(p) => setForm({...form, product_id: p ? String(p.id) : '', product_name: p?.name||''})}
                  placeholder={t('select_product')}
                  showStock={true}
                  language={language}
                />
              </div>
            </div>

            {/* נושא */}
            <div className="form-group">
              <label className="form-label" style={{ display:'flex', justifyContent:'space-between' }}>
                <span>📝 {t('subject')} *</span>
                <span style={{ color: form.subject.length > 70 ? '#e74c3c' : '#888', fontSize:'0.82rem' }}>{form.subject.length}/80</span>
              </label>
              <input className="form-input" type="text" maxLength={80} value={form.subject}
                onChange={e => setForm({...form, subject: e.target.value})}
                placeholder={t('subject_placeholder')} />
            </div>

            {/* תיאור */}
            <div className="form-group">
              <label className="form-label" style={{ display:'flex', justifyContent:'space-between' }}>
                <span>📄 {t('description')}</span>
                <span style={{ color:'#888', fontSize:'0.82rem' }}>{form.description.length}</span>
              </label>
              <textarea className="form-textarea" value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                placeholder={t('description_placeholder')}
                style={{ minHeight:'90px' }} />
            </div>

            {/* תמונה */}
            <div className="form-group">
              <label className="form-label">📎 {t('attach_image')}</label>
              <div
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }}
                style={{ border:`2px dashed ${dragOver ? '#2196F3' : '#ccc'}`, borderRadius:'8px', padding:'1rem', textAlign:'center', cursor:'pointer', background: dragOver ? '#e3f2fd' : '#fafafa', transition:'all 0.2s' }}
              >
                📎 <span style={{ color:'#888', fontSize:'0.85rem' }}>{t('drag_or_click')} (עד 5)</span>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => addImages(e.target.files)} />
              </div>
              {images.length > 0 && (
                <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.5rem' }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ position:'relative' }}>
                      <img src={URL.createObjectURL(img)} alt="" style={{ width:'60px', height:'60px', objectFit:'cover', borderRadius:'6px', border:'1px solid #ddd' }} />
                      <button onClick={() => setImages(prev => prev.filter((_,j) => j!==i))}
                        style={{ position:'absolute', top:'-6px', right:'-6px', background:'#e74c3c', color:'white', border:'none', borderRadius:'50%', width:'18px', height:'18px', fontSize:'10px', cursor:'pointer', lineHeight:'18px', padding:0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* עדיפות */}
            <div className="form-group">
              <label className="form-label">🔥 {t('priority')}</label>
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                {PRIORITIES.map(p => (
                  <label key={p.value} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', border:`2px solid ${form.priority===p.value ? '#2196F3' : '#ddd'}`, borderRadius:'8px', cursor:'pointer', background: form.priority===p.value ? '#e3f2fd' : 'white', fontWeight: form.priority===p.value ? 600 : 400, transition:'all 0.15s' }}>
                    <input type="radio" name="priority" value={p.value} checked={form.priority===p.value} onChange={() => setForm({...form, priority: p.value})} style={{ display:'none' }} />
                    {p.emoji} {language==='he' ? p.he : language==='pt' ? p.pt : p.en}
                  </label>
                ))}
              </div>
            </div>



            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>{t('cancel')} ✕</button>

              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight:600 }}>
                {saving ? '...' : `🎯 ${editingId ? (t('save')) : (t('open_ticket'))}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:'620px', width:'95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">📋 {t('history')} — {historyTicket?.ticket_number || `#${historyTicket?.id}`} | {historyTicket?.subject}</h3>
              <button className="modal-close" onClick={() => setShowHistory(false)}>✕</button>
            </div>

            {historyLoading ? (
              <div style={{ padding:'2rem', textAlign:'center' }}>{t('loading')}</div>
            ) : historyData.length === 0 ? (
              <div style={{ padding:'2rem', textAlign:'center', color:'#888' }}>{t('no_history')}</div>
            ) : (
              <div style={{ padding:'1rem', maxHeight:'460px', overflowY:'auto' }}>
                <div style={{ position:'relative', paddingRight:'1.5rem' }}>
                  {/* Timeline line */}
                  <div style={{ position:'absolute', right:'7px', top:0, bottom:0, width:'2px', background:'#e0e0e0' }} />

                  {historyData.map((h, i) => {
                    const isStatus = h.action === 'status_changed';
                    const isCreated = h.action === 'created';
                    const isOwner = h.action === 'owner_changed';
                    const isAwaiting = h.new_status === 'awaiting_customer';
                    const statusColors = {
                      open:'#FF9800', in_progress:'#FF5722', awaiting_customer:'#4CAF50',
                      closed:'#2196F3', cancelled:'#9E9E9E'
                    };
                    const dot = isCreated ? '🟢' : isOwner ? '👤' : isStatus ? '🔄' : h.action === 'comment' ? '💬' : h.action === 'product_dispatched' ? '📦' : h.action === 'dispatch_acknowledged' ? '✅' : '✏️';

                    return (
                      <div key={h.id} style={{ marginBottom:'1.2rem', paddingRight:'1.2rem', position:'relative' }}>
                        {/* Dot */}
                        <div style={{ position:'absolute', right:'-1px', top:'4px', width:'16px', height:'16px', borderRadius:'50%', background: isCreated ? '#27ae60' : isStatus ? (statusColors[h.new_status]||'#888') : h.action === 'comment' ? '#2196F3' : h.action === 'product_dispatched' ? '#e67e22' : h.action === 'dispatch_acknowledged' ? '#27ae60' : '#9b59b6', border:'2px solid white', zIndex:1 }} />

                        <div style={{ background:'#f8f9fa', borderRadius:'8px', padding:'0.7rem 1rem', border:'1px solid #eee' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                            <span style={{ fontWeight:600, fontSize:'0.9rem' }}>
                              {dot} {h.actor_name || h.username}
                            </span>
                            <span style={{ fontSize:'0.78rem', color:'#888' }}>
                              {h.created_at ? new Date(h.created_at).toLocaleString() : '-'}
                            </span>
                          </div>

                          {isCreated && (
                            <div style={{ fontSize:'0.85rem', color:'#555' }}>
                              {t('ticket_created_action')}
                              {h.owner_name && <span> | {t('owner')}: <strong>{h.owner_name}</strong></span>}
                            </div>
                          )}

                          {isStatus && (
                            <div style={{ fontSize:'0.85rem', color:'#555' }}>
                              {t('status_changed')}:{' '}
                              <span style={{ background: statusColors[h.old_status]||'#eee', color:'white', padding:'0.1rem 0.4rem', borderRadius:'8px', fontSize:'0.78rem' }}>{h.old_status ? t(`status_${h.old_status}`) || h.old_status : '-'}</span>
                              {' → '}
                              <span style={{ background: statusColors[h.new_status]||'#eee', color:'white', padding:'0.1rem 0.4rem', borderRadius:'8px', fontSize:'0.78rem' }}>{h.new_status ? t(`status_${h.new_status}`) || h.new_status : '-'}</span>
                              {isAwaiting && h.awaiting_channel && (
                                <div style={{ marginTop:'0.3rem' }}>
                                  {h.awaiting_channel === 'phone' ? '☎️' : h.awaiting_channel === 'email' ? '📧' : '📱'} {h.awaiting_channel}
                                  {h.awaiting_note && <span> — {h.awaiting_note}</span>}
                                  {h.awaiting_deadline && <span> | ⏰ {new Date(h.awaiting_deadline).toLocaleString('he-IL')}</span>}
                                </div>
                              )}
                            </div>
                          )}

                          {isOwner && (
                            <div style={{ fontSize:'0.85rem', color:'#555' }}>
                              {t('ownership_transferred')} → <strong>{h.owner_name}</strong>
                            </div>
                          )}

                          {h.action === 'updated' && (
                            <div style={{ fontSize:'0.85rem', color:'#555' }}>{t('ticket_updated_action')}</div>
                          )}

                          {h.action === 'product_dispatched' && (
                            <div style={{ fontSize:'0.85rem', color:'#e67e22', fontWeight:600 }}>
                              📦 {t('product_dispatched_history')||'מוצר נשלח מהמחסן'}
                              {h.awaiting_note && <span style={{ fontWeight:400, color:'#555' }}> — {h.awaiting_note}</span>}
                            </div>
                          )}

                          {h.action === 'dispatch_acknowledged' && (
                            <div style={{ fontSize:'0.85rem', color:'#27ae60', fontWeight:600 }}>
                              ✅ {t('dispatch_acknowledged_history')||'אישור קבלת מוצר — ממשיך לטפל'}
                              {h.awaiting_note && <span style={{ fontWeight:400, color:'#555' }}> — {h.awaiting_note}</span>}
                            </div>
                          )}

                          {h.action === 'comment' && (
                            <div style={{ fontSize:'0.88rem', color:'#333', background:'white', border:'1px solid #e3f2fd', borderRadius:'6px', padding:'0.5rem 0.7rem', marginTop:'0.2rem', lineHeight:'1.5' }}>
                              "{h.comment}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add Comment */}
            <div style={{ padding:'0 1rem 1rem', borderTop:'1px solid #eee', paddingTop:'1rem' }}>
              <label style={{ fontSize:'0.85rem', fontWeight:600, color:'#555', display:'block', marginBottom:'0.4rem' }}>
                💬 {t('add_comment')}
              </label>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
                  placeholder={t('comment_placeholder')}
                  style={{ flex:1, padding:'0.5rem', border:'1px solid #ddd', borderRadius:'6px', fontSize:'0.85rem', resize:'vertical', minHeight:'60px', fontFamily:'inherit' }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={savingComment || !newComment.trim()}
                  style={{ padding:'0.5rem 1rem', background: newComment.trim() ? '#2196F3' : '#ccc', color:'white', border:'none', borderRadius:'6px', cursor: newComment.trim() ? 'pointer' : 'default', fontWeight:600, whiteSpace:'nowrap', alignSelf:'flex-end' }}
                >
                  {savingComment ? '...' : t('save_comment')}
                </button>
              </div>
              <div style={{ fontSize:'0.75rem', color:'#aaa', marginTop:'0.3rem' }}>{t('ctrl_enter_hint')}</div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistory(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Product Popup */}
      {showSendProduct && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:'440px', width:'95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">📦 {t('send_product') || 'שלח מוצר למחסן'}</h3>
              <button className="modal-close" onClick={() => setShowSendProduct(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">📦 {t('product')} *</label>
              <ProductPicker
                products={products}
                value={sendProductForm.product_id}
                onChange={(p) => setSendProductForm({...sendProductForm, product_id: p ? String(p.id) : '', product_name: p?.name||''})}
                placeholder={t('select_product') || 'בחר מוצר'}
                showStock={true}
                language={language}
              />
            </div>

            <div className="form-group">
              <label className="form-label">🔢 {t('quantity') || 'כמות'}</label>
              <input className="form-input" type="number" min="1" value={sendProductForm.quantity}
                onChange={e => setSendProductForm({...sendProductForm, quantity: parseInt(e.target.value)||1})}
                style={{ maxWidth:'120px' }} />
            </div>

            <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:'8px', padding:'0.7rem 1rem', fontSize:'0.85rem', color:'#856404', marginBottom:'1rem' }}>
              ⚠️ {t('warehouse_alert_note') || 'This request will appear as an urgent alert in the warehouse dashboard'}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSendProduct(false)}>{t('cancel')}</button>
              <button
                disabled={sendingProduct || !sendProductForm.product_id}
                onClick={handleSendProduct}
                style={{ padding:'0.5rem 1.2rem', background: sendProductForm.product_id ? '#e67e22' : '#ccc', color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor: sendProductForm.product_id ? 'pointer' : 'default' }}
              >
                {sendingProduct ? '...' : `📦 ${t('send_to_warehouse')||'Send to Warehouse'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Awaiting Customer Popup */}
      {showAwaitingPopup && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:'420px', width:'95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">🟢 {t('status_awaiting_customer')}</h3>
              <button className="modal-close" onClick={() => setShowAwaitingPopup(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">{t('communication_channel') || 'ערוץ תקשורת'} *</label>
              <div style={{ display:'flex', gap:'0.8rem', flexWrap:'wrap' }}>
                {[
                  {v:'phone', icon:'☎️', label: t('channel_phone') || 'טלפון'},
                  {v:'email', icon:'📧', label: t('channel_email') || 'מייל'},
                  {v:'sms',   icon:'📱', label: 'SMS'}
                ].map(ch => (
                  <label key={ch.v} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', border:`2px solid ${awaitingForm.channel===ch.v ? '#4CAF50' : '#ddd'}`, borderRadius:'8px', cursor:'pointer', background: awaitingForm.channel===ch.v ? '#e8f5e9' : 'white', fontWeight: awaitingForm.channel===ch.v ? 600 : 400, transition:'all 0.15s' }}>
                    <input type="radio" name="aw_channel" value={ch.v} checked={awaitingForm.channel===ch.v} onChange={() => setAwaitingForm({...awaitingForm, channel: ch.v})} style={{ display:'none' }} />
                    {ch.icon} {ch.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">📝 {t('note') || 'הערה'}</label>
              <input className="form-input" type="text" value={awaitingForm.note}
                onChange={e => setAwaitingForm({...awaitingForm, note: e.target.value})}
                placeholder={t('note_placeholder') || 'למשל: ביקשתי screenshot'} />
            </div>

            <div className="form-group">
              <label className="form-label">⏰ {t('expected_reply') || 'צפי לתגובה'} ({t('optional') || 'אופציונלי'})</label>
              <input className="form-input" type="datetime-local" value={awaitingForm.deadline}
                onChange={e => setAwaitingForm({...awaitingForm, deadline: e.target.value})} />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAwaitingPopup(false)}>{t('cancel')}</button>
              <button className="btn btn-primary" style={{ background:'#4CAF50', borderColor:'#388E3C' }} onClick={handleAwaitingConfirm}>
                ✅ {t('confirm') || 'אישור'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Case Management Modal */}
      {showCaseModal && caseTicket && (
        <SupportCaseManagementModal
          ticket={caseTicket}
          customers={customers}
          products={products}
          users={users}
          onClose={() => { setShowCaseModal(false); setCaseTicket(null); }}
          onRefresh={fetchAll}
          showToast={showToast}
        />
      )}
    </div>
  );
}

export default SupportManagement;
