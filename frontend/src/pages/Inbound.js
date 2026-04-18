import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import ProductPicker from './ProductPicker';
import MobilePicker from './MobilePicker';

function Inbound() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const getProductName = (product) => {
    if (language === 'he' && product.name_he) return product.name_he;
    if (language === 'pt' && product.name_pt) return product.name_pt;
    return product.name;
  };
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [qrCodes, setQrCodes] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [selectedContact, setSelectedContact] = useState('');
  const [contactOptions, setContactOptions] = useState([]);

  const isAdmin = user?.role === 'admin';
  
  // Debug - check user role
  useEffect(() => {
    console.log('Current user:', user);
    console.log('User role:', user?.role);
    console.log('Is admin:', isAdmin);
  }, [user, isAdmin]);

  // ESC key handler for modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showModal) setShowModal(false);
        // Note: showLanguageModal does NOT close on ESC
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showModal]);

  
  const [formData, setFormData] = useState({
    supplier_id: '',
    supplier_type: 'registered',
    casual_supplier_name: '',
    notes: '',
    items: [],
    generate_receipt_note: false,
    qr_code_id: null
  });

  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    quantity: 1,
    notes: ''
  });
  
  const [editingItemIndex, setEditingItemIndex] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [suppliersRes, productsRes, transactionsRes, qrRes] = await Promise.all([
        axios.get('/api/suppliers'),
        axios.get('/api/products'),
        axios.get('/api/inbound'),
        axios.get('/api/qr-codes').catch(() => ({ data: [] }))
      ]);
      
      setSuppliers(suppliersRes.data);
      setProducts(productsRes.data);
      setTransactions(transactionsRes.data);
      // המר פורמט DB לפורמט dropdown
      const qrList = (qrRes.data || []).map(qr => ({
        id: qr.id,
        type: qr.type,
        title: qr.title || `QR #${qr.id} - ${qr.type}`
      }));
      setQrCodes(qrList);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!currentItem.product_id || parseInt(String(currentItem.quantity).replace(/,/g, '')) <= 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }

    const product = products.find(p => p.id === parseInt(currentItem.product_id));
    
    if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = {
        ...currentItem,
        product_name: getProductName(product),
        product_sku: product.sku
      };
      setFormData({
        ...formData,
        items: updatedItems
      });
      setEditingItemIndex(null);
    } else {
      // Add new item
      setFormData({
        ...formData,
        items: [...formData.items, {
          ...currentItem,
          quantity: parseInt(String(currentItem.quantity).replace(/,/g, '')),
          product_name: getProductName(product),
          product_sku: product.sku
        }]
      });
    }

    setCurrentItem({
      product_id: '',
      quantity: 1,
      notes: ''
    });
  };
  
  const handleEditItem = (index) => {
    const item = formData.items[index];
    setCurrentItem({
      product_id: item.product_id,
      quantity: item.quantity,
      notes: item.notes || ''
    });
    setEditingItemIndex(index);
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleDeleteTransaction = async (transactionId) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (!window.confirm(t('confirm_delete'))) return;

    try {
      await axios.delete(`/api/inbound/${transactionId}`);
      alert(t('success'));
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEdit = async (transaction) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    try {
      // Fetch transaction details with items
      const response = await axios.get(`/api/inbound/${transaction.id}/details`);
      const details = response.data;
      
      setEditingTransaction(transaction);
      setFormData({
        supplier_id: details.supplier_id || '',
        supplier_type: details.supplier_type,
        casual_supplier_name: details.casual_supplier_name || '',
        notes: details.notes || '',
        items: details.items.map(item => ({
          product_id: item.product_id,
          product_name: item.name,
          product_sku: item.sku,
          quantity: item.quantity,
          notes: item.notes || '',
          original_quantity: item.quantity // Store original for inventory calculation
        }))
      });
      setShowModal(true);
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGenerateReceiptNote = async (transactionId) => {
    setSelectedTransactionId(transactionId);
    setSelectedContact('');
    try {
      const res = await axios.get(`/api/inbound/${transactionId}/details`);
      const supplierId = res.data.supplier_id;
      if (supplierId) {
        const suppRes = await axios.get('/api/suppliers');
        const supplier = suppRes.data.find(s => s.id === supplierId);
        if (supplier?.contact_person) {
          let opts = [];
          try {
            const parsed = JSON.parse(supplier.contact_person);
            if (Array.isArray(parsed)) {
              opts = parsed.map(c => [c.name, c.phone, c.email].filter(Boolean).join(' | ')).filter(Boolean);
            }
          } catch(e) {
            opts = supplier.contact_person.split(';').map(c => c.trim()).filter(Boolean);
          }
          setContactOptions(opts);
          setSelectedContact(opts[0] || '');
        } else { setContactOptions([]); }
      } else { setContactOptions([]); }
    } catch(e) { setContactOptions([]); }
    setShowLanguageModal(true);
  };
  
  const handleGenerateWithLanguage = (lang) => {
    setShowLanguageModal(false);
    const contactParam = selectedContact ? `&contact=${encodeURIComponent(selectedContact)}` : '';
    const token = sessionStorage.getItem('token') || '';
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    window.open(`${baseUrl}/api/inbound/${selectedTransactionId}/receipt-note?lang=${lang}${contactParam}&token=${encodeURIComponent(token)}`, '_blank');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.items.length === 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }

    if (formData.supplier_type === 'registered' && !formData.supplier_id) {
      alert(t('error') + ': ' + t('select_supplier'));
      return;
    }

    if (formData.supplier_type === 'casual' && !formData.casual_supplier_name) {
      alert(t('error') + ': ' + t('enter_supplier_name'));
      return;
    }

    try {
      let transactionId;
      
      if (editingTransaction) {
        // Update existing transaction
        await axios.put(`/api/inbound/${editingTransaction.id}`, formData);
        alert(t('success') + '! ' + t('inventory_updated'));
        transactionId = editingTransaction.id;
      } else {
        // Create new transaction
        const response = await axios.post('/api/inbound', { ...formData, transaction_date: new Date().toISOString() });
        alert(t('success') + '! ' + t('inventory_updated'));
        transactionId = response.data.id;
      }
      
      // Check if user wants receipt note
      if (formData.generate_receipt_note) {
        handleGenerateReceiptNote(transactionId);
      }
      
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      supplier_type: 'registered',
      casual_supplier_name: '',
      notes: '',
      items: [],
      generate_receipt_note: false,
    qr_code_id: null
    });
    setCurrentItem({
      product_id: '',
      quantity: 1,
      notes: ''
    });
    setEditingTransaction(null);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('inbound')}</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('inbound_transactions')}</h3>
          <button 
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
          >
            {t('new_inbound')}
          </button>
        </div>

        {/* Desktop Table */}
        <div style={{ display: window.innerWidth <= 768 ? 'none' : 'block' }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('transaction_date')}</th>
                  <th>{t('supplier')}</th>
                  <th>{t('supplier_type')}</th>
                  <th>{t('notes')}</th>
                  <th>{t('username')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan="7" className="text-center">{t('no_data')}</td></tr>
                ) : transactions.map(trans => (
                  <tr key={trans.id}>
                    <td style={{ color: '#888', fontSize: '0.85rem' }}>#{trans.id}</td>
                    <td>{new Date(trans.transaction_date).toLocaleString('he-IL')}</td>
                    <td>{trans.supplier_type === 'casual' ? trans.casual_supplier_name : trans.supplier_name || '-'}</td>
                    <td>
                      <span className={`badge ${trans.supplier_type === 'casual' ? 'badge-warning' : 'badge-success'}`}>
                        {trans.supplier_type === 'casual' ? t('casual') : t('registered')}
                      </span>
                    </td>
                    <td>{trans.notes || '-'}</td>
                    <td>{trans.username}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-success" onClick={() => handleGenerateReceiptNote(trans.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                          📄 {t('receipt_note')}
                        </button>
                        {isAdmin && (
                          <>
                            <button className="btn btn-secondary" onClick={() => handleEdit(trans)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>✏️</button>
                            <button className="btn btn-danger" onClick={() => handleDeleteTransaction(trans.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>🗑️</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div style={{ display: window.innerWidth <= 768 ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
          {transactions.length === 0 ? (
            <div className="text-center" style={{ padding: '2rem', color: '#888' }}>{t('no_data')}</div>
          ) : transactions.map(trans => (
            <div key={trans.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{new Date(trans.transaction_date).toLocaleString('he-IL')}</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>#{trans.id}</span>
                <span className={`badge ${trans.supplier_type === 'casual' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.75rem' }}>
                  {trans.supplier_type === 'casual' ? t('casual') : t('registered')}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', color: '#1e293b' }}>
                🏭 {trans.supplier_type === 'casual' ? trans.casual_supplier_name : trans.supplier_name || '-'}
              </div>
              {trans.notes && <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.25rem' }}>📝 {trans.notes}</div>}
              {trans.username && <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.5rem' }}>👤 {trans.username}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <button className="btn btn-success" onClick={() => handleGenerateReceiptNote(trans.id)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
                  📄 {t('receipt_note')}
                </button>
                {isAdmin && (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleEdit(trans)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>✏️</button>
                    <button className="btn btn-danger" onClick={() => handleDeleteTransaction(trans.id)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingTransaction ? t('edit_transaction') : t('new_inbound')}</h3>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Supplier Selection */}
              <div className="form-group">
                <label className="form-label">{t('supplier_type')}</label>
                <MobilePicker
                  options={[{ value: 'registered', label: t('registered') }, { value: 'casual', label: t('casual') }]}
                  value={formData.supplier_type}
                  onChange={(val) => setFormData({...formData, supplier_type: val, supplier_id: '', casual_supplier_name: ''})}
                  label={t('supplier_type')}
                />
              </div>

              {formData.supplier_type === 'registered' ? (
                <div className="form-group">
                  <label className="form-label">{t('select_supplier')} *</label>
                  <MobilePicker
                    options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
                    value={String(formData.supplier_id)}
                    onChange={(val) => setFormData({...formData, supplier_id: val})}
                    placeholder={t('select_supplier')}
                    label={t('select_supplier')}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">{t('casual_supplier_name')} *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.casual_supplier_name}
                    onChange={(e) => setFormData({...formData, casual_supplier_name: e.target.value})}
                    placeholder={t('enter_supplier_name')}
                    required
                  />
                </div>
              )}

              {/* Add Items Section */}
              <div className="card" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa' }}>
                <h4 style={{ marginBottom: '1rem' }}>{t('add_items')}</h4>
                
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">{t('select_product')}</label>
                    <ProductPicker
                      products={products}
                      value={currentItem.product_id}
                      onChange={(product) => setCurrentItem({ ...currentItem, product_id: product ? String(product.id) : '' })}
                      placeholder={t('select_product')}
                      showStock={true}
                      language={language}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('quantity')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      value={currentItem.quantity}
                      onChange={(e) => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d*$/.test(raw)) { const fmt = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ','); setCurrentItem({...currentItem, quantity: fmt}); } }}
                      onBlur={(e) => { const num = parseInt(String(e.target.value).replace(/,/g, '')); if (!isNaN(num)) { setCurrentItem({...currentItem, quantity: num.toLocaleString('en-US')}); } }}
                      style={{ textAlign: 'right', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('notes')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={currentItem.notes}
                    onChange={(e) => setCurrentItem({...currentItem, notes: e.target.value})}
                    placeholder={t('notes')}
                  />
                </div>

                <button 
                  type="button"
                  className="btn btn-success"
                  onClick={handleAddItem}
                >
                  {editingItemIndex !== null ? t('update_item') : t('add_item')}
                </button>
              </div>

              {/* Items List */}
              {formData.items.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4>{t('items_to_receive')} ({formData.items.length})</h4>
                  <table className="table" style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>{t('sku')}</th>
                        <th>{t('name')}</th>
                        <th>{t('quantity')}</th>
                        <th>{t('notes')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.product_sku}</td>
                          <td>{item.product_name}</td>
                          <td><span className="badge badge-info">{item.quantity}</span></td>
                          <td>{item.notes || '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button 
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleEditItem(index)}
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              >
                                ✏️ {t('edit')}
                              </button>
                              <button 
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleRemoveItem(index)}
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              >
                                {t('remove')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* General Notes */}
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">{t('general_notes')}</label>
                <textarea
                  className="form-textarea"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={t('general_notes')}
                />
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.generate_receipt_note}
                    onChange={(e) => setFormData({...formData, generate_receipt_note: e.target.checked})}
                    style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                    {t('generate_receipt_note_after_save')}
                  </span>
                </label>
                
                {/* QR Code Selection */}
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label">{t('add_qr_code')}</label>
                  <MobilePicker
                    options={[
                      { value: '', label: qrCodes.length === 0 ? t('no_qr_codes_created') : t('select_qr_code') },
                      ...qrCodes.map((qr, index) => ({ value: String(qr.id), label: qr.title || `QR #${index + 1} - ${qr.type}` }))
                    ]}
                    value={formData.qr_code_id ? String(formData.qr_code_id) : ''}
                    onChange={(val) => setFormData({...formData, qr_code_id: val ? parseInt(val) : null})}
                    placeholder={t('select_qr_code')}
                    label={t('add_qr_code')}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={formData.items.length === 0}
                >
                  {t('save_transaction')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLanguageModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('select_document_language') || 'בחר שפה'}</h3>
            </div>
            
            <div className="modal-body">
              {contactOptions.length > 1 && (
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">👤 {t('contact_person')}</label>
                  <select className="form-select" value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}>
                    {contactOptions.map((c, i) => <option key={i} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <p style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                {t('select_language_for_receipt')}
              </p>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleGenerateWithLanguage('he')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇮🇱 עברית
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleGenerateWithLanguage('en')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇬🇧 English
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleGenerateWithLanguage('pt')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇵🇹 Português
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inbound;
