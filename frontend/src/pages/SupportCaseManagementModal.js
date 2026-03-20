import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

const PRIORITIES = [
  { value: 'low',    emoji: '🟢', he: 'נמוך',   en: 'Low',    pt: 'Baixo'   },
  { value: 'medium', emoji: '🟡', he: 'בינוני', en: 'Medium', pt: 'Médio'   },
  { value: 'high',   emoji: '🟠', he: 'גבוה',   en: 'High',   pt: 'Alto'    },
  { value: 'urgent', emoji: '🔴', he: 'דחוף',   en: 'Urgent', pt: 'Urgente' },
];

function SupportCaseManagementModal({ ticket, customers, products, users, onClose, onRefresh, showToast }) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const fileRef = useRef();

  // ─── Form state ───────────────────────────────────────────────
  const [form, setForm] = useState({
    customer_id:   ticket.customer_id   || '',
    customer_name: ticket.customer_name || '',
    product_id:    ticket.product_id    || '',
    product_name:  ticket.product_name  || '',
    subject:       ticket.subject       || '',
    description:   ticket.description   || '',
    priority:      ticket.priority      || 'medium',
    status:        ticket.status        || 'open',
    owner_id:      ticket.owner_id      || '',
    owner_name:    ticket.owner_name    || '',
  });
  const [images, setImages]           = useState([]);
  const [dragOver, setDragOver]       = useState(false);
  const [saving, setSaving]           = useState(false);

  // ─── Comment state ────────────────────────────────────────────
  const [newComment, setNewComment]       = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // ─── History state ────────────────────────────────────────────
  const [historyData, setHistoryData]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ─── Send Product state ───────────────────────────────────────
  const [showSendProduct, setShowSendProduct]     = useState(false);
  const [sendProductForm, setSendProductForm]     = useState({ product_id:'', product_name:'', quantity:1 });
  const [sendingProduct, setSendingProduct]       = useState(false);

  // ─── Awaiting Customer state ──────────────────────────────────
  const [showAwaitingPopup, setShowAwaitingPopup] = useState(false);
  const [awaitingForm, setAwaitingForm]           = useState({ channel:'', note:'', deadline:'' });

  const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });

  // ─── Load history on mount ────────────────────────────────────
  useEffect(() => {
    loadHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await axios.get(`/api/support-tickets/${ticket.id}/history`, auth());
      setHistoryData(res.data);
    } catch(e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const addImages = (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...valid].slice(0, 5));
  };

  // ─── Save ticket ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.customer_id)    { alert(t('customer_required')); return; }
    if (!form.product_id)     { alert(t('product_required')); return; }
    if (!form.subject.trim()) { alert(t('subject_required')); return; }
    const selectedCustomer = customers.find(c => c.id === parseInt(form.customer_id));
    const selectedOwner = users.find(u => u.id === parseInt(form.owner_id));
    if (selectedCustomer?.is_sensitive && selectedOwner?.role !== 'admin') {
      alert('⚠️ לקוח זה מסומן כרגיש — לא ניתן להעביר ownership למשתמש שאינו admin');
      return;
    }
    try {
      setSaving(true);
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
      images.forEach(img => fd.append('images', img));
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' };
      await axios.put(`/api/support-tickets/${ticket.id}`, fd, { headers });
      showToast('✅ ' + t('ticket_updated'));
      await loadHistory();
      onRefresh();
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  // ─── Status change ────────────────────────────────────────────
  const handleStatusChange = (newStatus) => {
    if (newStatus === 'awaiting_customer') {
      setAwaitingForm({ channel:'', note:'', deadline:'' });
      setShowAwaitingPopup(true);
    } else {
      setForm(f => ({...f, status: newStatus}));
    }
  };

  const handleAwaitingConfirm = async () => {
    if (!awaitingForm.channel) { alert(t('channel_required') || 'יש לבחור ערוץ תקשורת'); return; }
    const updatedForm = { ...form, status:'awaiting_customer', awaiting_channel: awaitingForm.channel, awaiting_note: awaitingForm.note, awaiting_deadline: awaitingForm.deadline };
    setForm(updatedForm);
    setShowAwaitingPopup(false);
    try {
      const fd = new FormData();
      Object.entries(updatedForm).forEach(([k,v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
      const hdrs = { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' };
      await axios.put(`/api/support-tickets/${ticket.id}`, fd, { headers: hdrs });
      showToast('✅ ' + t('ticket_updated'));
      await loadHistory();
      onRefresh();
    } catch(e) { console.error(e); }
  };

  // ─── Add comment ──────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      setSavingComment(true);
      await axios.post(`/api/support-tickets/${ticket.id}/comments`, { comment: newComment }, auth());
      setNewComment('');
      await loadHistory();
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSavingComment(false); }
  };

  // ─── Send Product ─────────────────────────────────────────────
  const handleSendProduct = async () => {
    if (!sendProductForm.product_id) { alert('יש לבחור מוצר'); return; }
    try {
      setSendingProduct(true);
      await axios.post('/api/warehouse-alerts', {
        ticket_id: ticket.id,
        product_id: sendProductForm.product_id,
        product_name: sendProductForm.product_name,
        quantity: sendProductForm.quantity
      }, auth());
      await axios.post(`/api/support-tickets/${ticket.id}/comments`, {
        comment: `📦 ${t('product_send_requested')||'Product dispatch requested'}: ${sendProductForm.product_name} x${sendProductForm.quantity}`
      }, auth());
      setShowSendProduct(false);
      setSendProductForm({ product_id:'', product_name:'', quantity:1 });
      showToast(t('product_sent_to_warehouse') || '✅ Product dispatch request sent to warehouse');
      await loadHistory();
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSendingProduct(false); }
  };

  // ─── Delete ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await axios.delete(`/api/support-tickets/${ticket.id}`, auth());
      showToast('✅ ' + t('ticket_deleted'));
      onRefresh();
      onClose();
    } catch(e) { alert(e.response?.data?.error || e.message); }
  };

  // ─── History helpers ──────────────────────────────────────────
  const statusColors = {
    open:'#FF9800', in_progress:'#FF5722', awaiting_customer:'#4CAF50',
    closed:'#2196F3', cancelled:'#9E9E9E'
  };

  const getStatusBadge = (s) => {
    const m = {
      open:              { bg:'#FF9800', label: t('status_open') },
      in_progress:       { bg:'#FF5722', label: t('status_in_progress') },
      awaiting_customer: { bg:'#4CAF50', label: t('status_awaiting_customer') },
      closed:            { bg:'#2196F3', label: t('status_closed') },
      cancelled:         { bg:'#9E9E9E', label: t('status_cancelled') },
    };
    const st = m[s] || { bg:'#9E9E9E', label: s||'-' };
    return <span style={{ background:st.bg, color:'white', padding:'0.2rem 0.6rem', borderRadius:'10px', fontSize:'0.78rem', fontWeight:600 }}>{st.label}</span>;
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Main Case Management Modal */}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth:'780px', width:'96%', maxHeight:'92vh', overflowY:'hidden', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="modal-header" style={{ flexShrink:0, background:'white', zIndex:10, borderBottom:'2px solid #e0e0e0' }}>
            <h3 className="modal-title" style={{ fontSize:'1rem' }}>
              🗂️ {t('case_management')||'Case Management'} — <span style={{ color:'#2196F3', fontWeight:800 }}>{ticket.ticket_number || `#${ticket.id}`}</span>
            </h3>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding:'1.2rem', flex:1, overflowY:'auto' }}>

            {/* ── SECTION 1: Ticket Form ── */}
            <div style={{ background:'#f8f9fa', borderRadius:'10px', padding:'1rem', marginBottom:'1rem', border:'1px solid #e9ecef' }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#666', marginBottom:'0.8rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                📋 {t('ticket_details')||'Ticket Details'}
              </div>

              {/* Created By + Owner */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">👤 {t('created_by')}</label>
                  <input className="form-input" value={ticket.created_by_name || user?.username || ''} readOnly style={{ background:'#f0f0f0', color:'#666' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">👤 {t('owner')}</label>
                  {isAdmin ? (
                    <select className="form-select" value={form.owner_id} onChange={e => {
                      const u = users.find(u => u.id === parseInt(e.target.value));
                      const selectedCustomer = customers.find(c => c.id === parseInt(form.customer_id));
                      if (selectedCustomer?.is_sensitive && u?.role !== 'admin') {
                        alert('⚠️ לקוח זה מסומן כרגיש — לא ניתן להעביר ownership למשתמש שאינו admin');
                        return;
                      }
                      setForm(f => ({...f, owner_id: e.target.value, owner_name: u?.username||''}));
                    }}>
                      {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                  ) : (
                    <input className="form-input" value={form.owner_name || user?.username || ''} readOnly style={{ background:'#f0f0f0', color:'#666' }} />
                  )}
                </div>
              </div>

              {/* Customer + Product */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">👥 {t('customer')} *</label>
                  <select className="form-select" value={form.customer_id} onChange={e => {
                    const c = customers.find(c => c.id === parseInt(e.target.value));
                    setForm(f => ({...f, customer_id: e.target.value, customer_name: c?.name||''}));
                  }}>
                    <option value="">{t('select_customer')}</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">📦 {t('product')} *</label>
                  <select className="form-select" value={form.product_id} onChange={e => {
                    const p = products.find(p => p.id === parseInt(e.target.value));
                    setForm(f => ({...f, product_id: e.target.value, product_name: p?.name||''}));
                  }}>
                    <option value="">{t('select_product')}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div className="form-group">
                <label className="form-label" style={{ display:'flex', justifyContent:'space-between' }}>
                  <span>📝 {t('subject')} *</span>
                  <span style={{ color: form.subject.length > 70 ? '#e74c3c' : '#888', fontSize:'0.82rem' }}>{form.subject.length}/80</span>
                </label>
                <input className="form-input" type="text" maxLength={80} value={form.subject}
                  onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                  placeholder={t('subject_placeholder')} />
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">📄 {t('description')}</label>
                <textarea className="form-textarea" value={form.description}
                  onChange={e => setForm(f => ({...f, description: e.target.value}))}
                  placeholder={t('description_placeholder')}
                  style={{ minHeight:'80px' }} />
              </div>

              {/* Priority */}
              <div className="form-group">
                <label className="form-label">🔥 {t('priority')}</label>
                <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                  {PRIORITIES.map(p => (
                    <label key={p.value} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.4rem 0.9rem', border:`2px solid ${form.priority===p.value ? '#2196F3' : '#ddd'}`, borderRadius:'8px', cursor:'pointer', background: form.priority===p.value ? '#e3f2fd' : 'white', fontWeight: form.priority===p.value ? 600 : 400, fontSize:'0.88rem', transition:'all 0.15s' }}>
                      <input type="radio" name="cm_priority" value={p.value} checked={form.priority===p.value} onChange={() => setForm(f => ({...f, priority: p.value}))} style={{ display:'none' }} />
                      {p.emoji} {language==='he' ? p.he : language==='pt' ? p.pt : p.en}
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">🔘 {t('status')}</label>
                <select className="form-select" value={form.status} onChange={e => handleStatusChange(e.target.value)}>
                  <option value="open">{t('status_open')}</option>
                  <option value="in_progress">{t('status_in_progress')}</option>
                  <option value="awaiting_customer">{t('status_awaiting_customer')}</option>
                  <option value="closed">{t('status_closed')}</option>
                  <option value="cancelled">{t('status_cancelled')}</option>
                </select>
                {form.status === 'awaiting_customer' && form.awaiting_channel && (
                  <div style={{ marginTop:'0.4rem', fontSize:'0.8rem', color:'#4CAF50', fontWeight:500 }}>
                    ✅ {form.awaiting_channel === 'phone' ? '☎️' : form.awaiting_channel === 'email' ? '📧' : '📱'} {form.awaiting_note && `— ${form.awaiting_note}`}
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="form-group">
                <label className="form-label">📎 {t('attach_image')}</label>
                <div onClick={() => fileRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }}
                  style={{ border:`2px dashed ${dragOver ? '#0288d1' : '#4dd0e1'}`, borderRadius:'8px', padding:'0.9rem', textAlign:'center', cursor:'pointer', background: dragOver ? '#b2ebf2' : '#e0f7fa', transition:'all 0.2s' }}>
                  📎 <span style={{ color:'#006064', fontSize:'0.85rem', fontWeight:500 }}>{t('drag_or_click')} ({t('max_5')||'max 5'})</span>
                  <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => addImages(e.target.files)} />
                </div>
                {images.length > 0 && (
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.5rem' }}>
                    {images.map((img, i) => (
                      <div key={i} style={{ position:'relative' }}>
                        <img src={URL.createObjectURL(img)} alt="" style={{ width:'55px', height:'55px', objectFit:'cover', borderRadius:'6px', border:'1px solid #ddd' }} />
                        <button onClick={() => setImages(prev => prev.filter((_,j) => j!==i))}
                          style={{ position:'absolute', top:'-6px', right:'-6px', background:'#e74c3c', color:'white', border:'none', borderRadius:'50%', width:'18px', height:'18px', fontSize:'10px', cursor:'pointer', lineHeight:'18px', padding:0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── SECTION 2: Add Comment ── */}
            <div style={{ background:'#f0f7ff', borderRadius:'10px', padding:'1rem', marginBottom:'1rem', border:'1px solid #b3d9ff' }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#1565c0', marginBottom:'0.7rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                💬 {t('add_comment')}
              </div>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
                  placeholder={t('comment_placeholder')}
                  style={{ flex:1, padding:'0.5rem', border:'1px solid #90caf9', borderRadius:'6px', fontSize:'0.85rem', resize:'vertical', minHeight:'60px', fontFamily:'inherit' }}
                />
                <button onClick={handleAddComment} disabled={savingComment || !newComment.trim()}
                  style={{ padding:'0.5rem 1rem', background: newComment.trim() ? '#2196F3' : '#ccc', color:'white', border:'none', borderRadius:'6px', cursor: newComment.trim() ? 'pointer' : 'default', fontWeight:600, whiteSpace:'nowrap', alignSelf:'flex-end' }}>
                  {savingComment ? '...' : t('save_comment')}
                </button>
              </div>
              <div style={{ fontSize:'0.75rem', color:'#90caf9', marginTop:'0.3rem' }}>{t('ctrl_enter_hint')}</div>
            </div>

            {/* ── SECTION 3: History / Timeline ── */}
            <div style={{ background:'#f8f9fa', borderRadius:'10px', padding:'1rem', border:'1px solid #e9ecef' }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#666', marginBottom:'0.8rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                📅 {t('history')||'History'} / Timeline
              </div>

              {historyLoading ? (
                <div style={{ textAlign:'center', padding:'1rem', color:'#888' }}>{t('loading')}</div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign:'center', padding:'1rem', color:'#888' }}>{t('no_history')}</div>
              ) : (
                <div style={{ position:'relative', paddingRight:'1.5rem', maxHeight:'340px', overflowY:'auto' }}>
                  {/* Timeline line */}
                  <div style={{ position:'absolute', right:'7px', top:0, bottom:0, width:'2px', background:'#e0e0e0' }} />

                  {historyData.map(h => {
                    const isCreated = h.action === 'created';
                    const isStatus  = h.action === 'status_changed';
                    const isOwner   = h.action === 'owner_changed';
                    const isAwaiting = h.new_status === 'awaiting_customer';
                    const dot = isCreated ? '🟢' : isOwner ? '👤' : isStatus ? '🔄' : h.action === 'comment' ? '💬' : h.action === 'product_dispatched' ? '📦' : h.action === 'dispatch_acknowledged' ? '✅' : '✏️';
                    const dotColor = isCreated ? '#27ae60' : isStatus ? (statusColors[h.new_status]||'#888') : h.action === 'comment' ? '#2196F3' : h.action === 'product_dispatched' ? '#e67e22' : h.action === 'dispatch_acknowledged' ? '#27ae60' : '#9b59b6';

                    return (
                      <div key={h.id} style={{ marginBottom:'1rem', paddingRight:'1.2rem', position:'relative' }}>
                        <div style={{ position:'absolute', right:'-1px', top:'4px', width:'16px', height:'16px', borderRadius:'50%', background:dotColor, border:'2px solid white', zIndex:1 }} />
                        <div style={{ background:'white', borderRadius:'8px', padding:'0.6rem 0.9rem', border:'1px solid #eee' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' }}>
                            <span style={{ fontWeight:600, fontSize:'0.88rem' }}>{dot} {h.actor_name || h.username}</span>
                            <span style={{ fontSize:'0.75rem', color:'#aaa' }}>{h.created_at ? new Date(h.created_at).toLocaleString() : '-'}</span>
                          </div>

                          {isCreated && (
                            <div style={{ fontSize:'0.82rem', color:'#555' }}>
                              {t('ticket_created_action')}
                              {h.owner_name && <span> | {t('owner')}: <strong>{h.owner_name}</strong></span>}
                            </div>
                          )}
                          {isStatus && (
                            <div style={{ fontSize:'0.82rem', color:'#555' }}>
                              {t('status_changed')}:{' '}
                              <span style={{ background:statusColors[h.old_status]||'#eee', color:'white', padding:'0.1rem 0.4rem', borderRadius:'8px', fontSize:'0.75rem' }}>{h.old_status ? t(`status_${h.old_status}`)||h.old_status : '-'}</span>
                              {' → '}
                              <span style={{ background:statusColors[h.new_status]||'#eee', color:'white', padding:'0.1rem 0.4rem', borderRadius:'8px', fontSize:'0.75rem' }}>{h.new_status ? t(`status_${h.new_status}`)||h.new_status : '-'}</span>
                              {isAwaiting && h.awaiting_channel && (
                                <div style={{ marginTop:'0.2rem' }}>
                                  {h.awaiting_channel === 'phone' ? '☎️' : h.awaiting_channel === 'email' ? '📧' : '📱'} {h.awaiting_channel}
                                  {h.awaiting_note && <span> — {h.awaiting_note}</span>}
                                  {h.awaiting_deadline && <span> | ⏰ {new Date(h.awaiting_deadline).toLocaleString()}</span>}
                                </div>
                              )}
                            </div>
                          )}
                          {isOwner && <div style={{ fontSize:'0.82rem', color:'#555' }}>{t('ownership_transferred')} → <strong>{h.owner_name}</strong></div>}
                          {h.action === 'updated' && <div style={{ fontSize:'0.82rem', color:'#555' }}>{t('ticket_updated_action')}</div>}
                          {h.action === 'product_dispatched' && (
                            <div style={{ fontSize:'0.82rem', color:'#e67e22', fontWeight:600 }}>
                              📦 {t('product_dispatched_history')||'מוצר נשלח מהמחסן'}
                              {h.awaiting_note && <span style={{ fontWeight:400, color:'#555' }}> — {h.awaiting_note}</span>}
                            </div>
                          )}
                          {h.action === 'dispatch_acknowledged' && (
                            <div style={{ fontSize:'0.82rem', color:'#27ae60', fontWeight:600 }}>
                              ✅ {t('dispatch_acknowledged_history')||'אישור קבלת מוצר — ממשיך לטפל'}
                              {h.awaiting_note && <span style={{ fontWeight:400, color:'#555' }}> — {h.awaiting_note}</span>}
                            </div>
                          )}
                          {h.action === 'comment' && (
                            <div style={{ fontSize:'0.85rem', color:'#333', background:'#f0f7ff', border:'1px solid #b3d9ff', borderRadius:'6px', padding:'0.4rem 0.6rem', marginTop:'0.2rem', lineHeight:'1.5' }}>
                              "{h.comment}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer */}
          <div className="modal-footer" style={{ flexShrink:0, background:'white', borderTop:'1px solid #eee', zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
            <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap' }}>
              <button onClick={handleSave} disabled={saving}
                style={{ padding:'0.5rem 1.2rem', background:'#2196F3', color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor:'pointer', fontSize:'0.88rem' }}>
                {saving ? '...' : `🎯 ${t('save')}`}
              </button>
              <button onClick={() => setShowSendProduct(true)}
                style={{ padding:'0.5rem 1.2rem', background:'#ea580c', color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor:'pointer', fontSize:'0.88rem' }}>
                📦 {t('send_product')||'Send Product'}
              </button>
              {isAdmin && (
                <button onClick={handleDelete}
                  style={{ padding:'0.5rem 1.2rem', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'8px', fontWeight:600, cursor:'pointer', fontSize:'0.88rem' }}>
                  🗑️ {t('delete')||'Delete'}
                </button>
              )}
            </div>
            <button className="btn btn-secondary" onClick={onClose}>{t('close')}</button>
          </div>
        </div>
      </div>

      {/* ── Send Product Popup ── */}
      {showSendProduct && (
        <div className="modal-overlay" style={{ zIndex:10010 }} onClick={() => setShowSendProduct(false)}>
          <div className="modal" style={{ maxWidth:'440px', width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📦 {t('send_product')||'שלח מוצר למחסן'}</h3>
              <button className="modal-close" onClick={() => setShowSendProduct(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">📦 {t('product')} *</label>
              <select className="form-select" value={sendProductForm.product_id}
                onChange={e => {
                  const p = products.find(x => x.id === parseInt(e.target.value));
                  setSendProductForm(f => ({...f, product_id: e.target.value, product_name: p?.name||''}));
                }}>
                <option value="">{t('select_product')||'בחר מוצר'}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">🔢 {t('quantity')||'כמות'}</label>
              <input className="form-input" type="number" min="1" value={sendProductForm.quantity}
                onChange={e => setSendProductForm(f => ({...f, quantity: parseInt(e.target.value)||1}))}
                style={{ maxWidth:'120px' }} />
            </div>
            <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:'8px', padding:'0.7rem 1rem', fontSize:'0.85rem', color:'#856404', marginBottom:'1rem' }}>
              ⚠️ {t('warehouse_alert_note') || 'This request will appear as an urgent alert in the warehouse dashboard'}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSendProduct(false)}>{t('cancel')}</button>
              <button disabled={sendingProduct || !sendProductForm.product_id} onClick={handleSendProduct}
                style={{ padding:'0.5rem 1.2rem', background: sendProductForm.product_id ? '#e67e22' : '#ccc', color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor: sendProductForm.product_id ? 'pointer' : 'default' }}>
                {sendingProduct ? '...' : `📦 ${t('send_to_warehouse')||'Send to Warehouse'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Awaiting Customer Popup ── */}
      {showAwaitingPopup && (
        <div className="modal-overlay" style={{ zIndex:10010 }} onClick={() => setShowAwaitingPopup(false)}>
          <div className="modal" style={{ maxWidth:'420px', width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🟢 {t('status_awaiting_customer')}</h3>
              <button className="modal-close" onClick={() => setShowAwaitingPopup(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">{t('communication_channel')||'ערוץ תקשורת'} *</label>
              <div style={{ display:'flex', gap:'0.8rem', flexWrap:'wrap' }}>
                {[{v:'phone',icon:'☎️',label:t('channel_phone')||'טלפון'},{v:'email',icon:'📧',label:t('channel_email')||'מייל'},{v:'sms',icon:'📱',label:'SMS'}].map(ch => (
                  <label key={ch.v} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', border:`2px solid ${awaitingForm.channel===ch.v ? '#4CAF50' : '#ddd'}`, borderRadius:'8px', cursor:'pointer', background: awaitingForm.channel===ch.v ? '#e8f5e9' : 'white', fontWeight: awaitingForm.channel===ch.v ? 600 : 400, transition:'all 0.15s' }}>
                    <input type="radio" name="aw_ch" value={ch.v} checked={awaitingForm.channel===ch.v} onChange={() => setAwaitingForm(f => ({...f, channel:ch.v}))} style={{ display:'none' }} />
                    {ch.icon} {ch.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">📝 {t('note')||'הערה'}</label>
              <input className="form-input" type="text" value={awaitingForm.note}
                onChange={e => setAwaitingForm(f => ({...f, note:e.target.value}))}
                placeholder={t('note_placeholder')||'למשל: ביקשתי screenshot'} />
            </div>
            <div className="form-group">
              <label className="form-label">⏰ {t('expected_reply')||'צפי לתגובה'} ({t('optional')||'אופציונלי'})</label>
              <input className="form-input" type="datetime-local" value={awaitingForm.deadline}
                onChange={e => setAwaitingForm(f => ({...f, deadline:e.target.value}))} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAwaitingPopup(false)}>{t('cancel')}</button>
              <button className="btn btn-primary" style={{ background:'#4CAF50', borderColor:'#388E3C' }} onClick={handleAwaitingConfirm}>
                ✅ {t('confirm')||'אישור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SupportCaseManagementModal;
