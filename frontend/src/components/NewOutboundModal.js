import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';

// קומפוננטה עצמאית ליצירת הוצאה חדשה - ניתן לייבא מכל מקום
function NewOutboundModal({ onClose, onSuccess }) {
  const { t, language } = useLanguage();

  const getProductName = (product) => {
    if (language === 'he' && product.name_he) return product.name_he;
    if (language === 'pt' && product.name_pt) return product.name_pt;
    return product.name;
  };

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [showPackagingSteps, setShowPackagingSteps] = useState(false);
  const [packagingStep, setPackagingStep] = useState(0);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [newTransactionId, setNewTransactionId] = useState(null);

  const [formData, setFormData] = useState({
    customer_id: '',
    customer_type: 'registered',
    casual_customer_name: '',
    status: 'pending',
    notes: '',
    items: [],
    generate_delivery_note: false
  });

  const [currentItem, setCurrentItem] = useState({ product_id: '', quantity: 1 });

  const [packagingData, setPackagingData] = useState({
    use_packaging: false, items_per_carton: '', carton_weight: '',
    use_pallets: false, cartons_per_pallet: '', pallet_dimensions: '', pallet_weight: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      const [customersRes, productsRes] = await Promise.all([
        axios.get('/api/customers'),
        axios.get('/api/products')
      ]);
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
    };
    fetchData();
  }, []);

  const handleAddItem = () => {
    if (!currentItem.product_id || currentItem.quantity <= 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }
    const product = products.find(p => p.id === parseInt(currentItem.product_id));
    if (product.quantity < currentItem.quantity) {
      alert(t('insufficient_stock') + `! ${t('available_stock')}: ${product.quantity}`);
      return;
    }
    setPackagingStep(0);
    setPackagingData({ use_packaging: false, items_per_carton: '', carton_weight: '', use_pallets: false, cartons_per_pallet: '', pallet_dimensions: '', pallet_weight: '' });
    setShowPackagingSteps(true);
  };

  const handleConfirmPackaging = () => {
    const product = products.find(p => p.id === parseInt(currentItem.product_id));
    let itemWithPackaging = {
      ...currentItem,
      product_name: getProductName(product),
      product_sku: product.sku,
      available: product.quantity
    };
    if (packagingData.use_packaging && packagingData.items_per_carton) {
      const numCartons = Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton));
      itemWithPackaging = { ...itemWithPackaging, use_packaging: true, items_per_carton: parseInt(packagingData.items_per_carton), carton_weight: parseFloat(packagingData.carton_weight) || 0, num_cartons: numCartons, total_carton_weight: numCartons * (parseFloat(packagingData.carton_weight) || 0) };
      if (packagingData.use_pallets && packagingData.cartons_per_pallet) {
        const numPallets = Math.ceil(numCartons / parseInt(packagingData.cartons_per_pallet));
        itemWithPackaging = { ...itemWithPackaging, use_pallets: true, cartons_per_pallet: parseInt(packagingData.cartons_per_pallet), pallet_dimensions: packagingData.pallet_dimensions || '', pallet_weight: parseFloat(packagingData.pallet_weight) || 0, num_pallets: numPallets };
      }
    }
    if (editingItemIndex !== null) {
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = { ...updatedItems[editingItemIndex], ...itemWithPackaging };
      setFormData({ ...formData, items: updatedItems });
      setEditingItemIndex(null);
    } else {
      setFormData({ ...formData, items: [...formData.items, itemWithPackaging] });
    }
    setCurrentItem({ product_id: '', quantity: 1 });
    setShowPackagingSteps(false);
    setPackagingStep(0);
  };

  const handleRemoveItem = (index) => {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) });
  };

  const handleEditItemPackaging = (index) => {
    const item = formData.items[index];
    setEditingItemIndex(index);
    setCurrentItem({ product_id: item.product_id, quantity: item.quantity });
    setPackagingData({ use_packaging: item.use_packaging || false, items_per_carton: item.items_per_carton || '', carton_weight: item.carton_weight || '', use_pallets: item.use_pallets || false, cartons_per_pallet: item.cartons_per_pallet || '', pallet_dimensions: item.pallet_dimensions || '', pallet_weight: item.pallet_weight || '' });
    setPackagingStep(item.use_packaging ? 1 : 0);
    setShowPackagingSteps(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) { alert(t('error') + ': ' + t('select_at_least_one')); return; }
    if (formData.customer_type === 'registered' && !formData.customer_id) { alert(t('error') + ': ' + t('select_customer')); return; }
    if (formData.customer_type === 'casual' && !formData.casual_customer_name) { alert(t('error') + ': ' + t('enter_customer_name')); return; }
    try {
      const response = await axios.post('/api/outbound', formData);
      const transactionId = response.data.id;
      if (formData.generate_delivery_note) {
        setNewTransactionId(transactionId);
        setShowLanguageModal(true);
      } else {
        onSuccess(transactionId);
      }
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGenerateWithLanguage = async (lang) => {
    setShowLanguageModal(false);
    try {
      const response = await axios.get(`/api/outbound/${newTransactionId}/delivery-note?lang=${lang}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const newWindow = window.open('', '_blank');
      newWindow.document.write(response.data);
      newWindow.document.close();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
    onSuccess(newTransactionId);
  };

  if (showLanguageModal) {
    return (
      <div className="modal-overlay" onClick={() => { setShowLanguageModal(false); onSuccess(newTransactionId); }}>
        <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">📄 {t('delivery_note')}</h3>
            <button className="modal-close" onClick={() => { setShowLanguageModal(false); onSuccess(newTransactionId); }}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>{t('select_language_for_delivery')}</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[['he','🇮🇱 עברית'],['en','🇬🇧 English'],['pt','🇵🇹 Português']].map(([lang, label]) => (
                <button key={lang} type="button" className="btn btn-primary" onClick={() => handleGenerateWithLanguage(lang)} style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">📦 {t('new_outbound')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('customer_type')}</label>
            <select className="form-select" value={formData.customer_type} onChange={e => setFormData({ ...formData, customer_type: e.target.value, customer_id: '', casual_customer_name: '' })}>
              <option value="registered">{t('registered')}</option>
              <option value="casual">{t('casual')}</option>
            </select>
          </div>

          {formData.customer_type === 'registered' ? (
            <div className="form-group">
              <label className="form-label">{t('select_customer')} *</label>
              <select className="form-select" value={formData.customer_id} onChange={e => setFormData({ ...formData, customer_id: e.target.value })} required>
                <option value="">{t('select_customer')}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('casual_customer_name')} *</label>
              <input type="text" className="form-input" value={formData.casual_customer_name} onChange={e => setFormData({ ...formData, casual_customer_name: e.target.value })} placeholder={t('enter_customer_name')} required />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('status')}</label>
            <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
              <option value="pending">{t('status_pending')}</option>
              <option value="ready">{t('status_ready')}</option>
              <option value="shipped">{t('status_shipped')}</option>
              <option value="delivered">{t('status_delivered')}</option>
            </select>
          </div>

          <div className="card" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa' }}>
            <h4 style={{ marginBottom: '1rem' }}>{t('add_items')}</h4>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">{t('select_product')}</label>
                <select className="form-select" value={currentItem.product_id} onChange={e => setCurrentItem({ ...currentItem, product_id: e.target.value })}>
                  <option value="">{t('select_product')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {getProductName(p)} ({t('available_stock')}: {p.quantity})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('quantity')}</label>
                <input type="number" className="form-input" value={currentItem.quantity} onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.value })} min="1" />
              </div>
            </div>
            <button type="button" className="btn btn-success" onClick={handleAddItem} disabled={showPackagingSteps}>{t('add_item')}</button>
          </div>

          {showPackagingSteps && (
            <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px', border: '2px solid #3498db' }}>
              <h4 style={{ marginBottom: '1rem', color: '#2c3e50' }}>📦 {t('packaging')}</h4>
              {packagingStep === 0 && (
                <div>
                  <h5 style={{ marginBottom: '1rem' }}>{t('use_packaging')}</h5>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => { setPackagingData({ ...packagingData, use_packaging: true }); setPackagingStep(1); }} style={{ padding: '0.75rem 1.5rem' }}>✓ {t('yes')}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { setPackagingData({ ...packagingData, use_packaging: false }); handleConfirmPackaging(); }} style={{ padding: '0.75rem 1.5rem' }}>{t('continue_without_packaging')}</button>
                  </div>
                </div>
              )}
              {packagingStep === 1 && (
                <div>
                  <h5 style={{ marginBottom: '1rem' }}>{t('carton_packaging')}</h5>
                  <div className="form-group"><label className="form-label">{t('items_per_carton')} *</label><input type="number" className="form-input" value={packagingData.items_per_carton} onChange={e => setPackagingData({ ...packagingData, items_per_carton: e.target.value })} min="1" /></div>
                  <div className="form-group"><label className="form-label">{t('carton_weight')}</label><input type="number" step="0.1" className="form-input" value={packagingData.carton_weight} onChange={e => setPackagingData({ ...packagingData, carton_weight: e.target.value })} /></div>
                  {packagingData.items_per_carton && currentItem.quantity && (
                    <div style={{ background: '#e3f2fd', padding: '1rem', borderRadius: '4px', marginTop: '1rem' }}>
                      <p><strong>{t('num_cartons')}:</strong> {Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton))} {t('cartons')}</p>
                    </div>
                  )}
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setPackagingStep(0)}>{t('back')}</button>
                    <button type="button" className="btn btn-primary" onClick={() => setPackagingStep(2)} disabled={!packagingData.items_per_carton}>{t('next')} →</button>
                  </div>
                </div>
              )}
              {packagingStep === 2 && (
                <div>
                  <h5 style={{ marginBottom: '1rem' }}>{t('pallet_division')}</h5>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <button type="button" className={`btn ${packagingData.use_pallets ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPackagingData({ ...packagingData, use_pallets: true })}>{t('yes')}</button>
                    <button type="button" className={`btn ${!packagingData.use_pallets ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPackagingData({ ...packagingData, use_pallets: false })}>{t('no')}</button>
                  </div>
                  {packagingData.use_pallets && (
                    <div>
                      <div className="form-group"><label className="form-label">{t('cartons_per_pallet')} *</label><input type="number" className="form-input" value={packagingData.cartons_per_pallet} onChange={e => setPackagingData({ ...packagingData, cartons_per_pallet: e.target.value })} min="1" /></div>
                      <div className="form-group"><label className="form-label">{t('pallet_dimensions')}</label><input type="text" className="form-input" value={packagingData.pallet_dimensions} onChange={e => setPackagingData({ ...packagingData, pallet_dimensions: e.target.value })} placeholder="120×80×150" /></div>
                      <div className="form-group"><label className="form-label">{t('pallet_weight')}</label><input type="number" step="0.1" className="form-input" value={packagingData.pallet_weight} onChange={e => setPackagingData({ ...packagingData, pallet_weight: e.target.value })} /></div>
                    </div>
                  )}
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setPackagingStep(1)}>{t('back')}</button>
                    <button type="button" className="btn btn-success" onClick={handleConfirmPackaging} disabled={packagingData.use_pallets && !packagingData.cartons_per_pallet}>✓ {t('confirm_and_save')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {formData.items.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4>{t('items_to_ship')} ({formData.items.length})</h4>
              <table className="table" style={{ marginTop: '1rem' }}>
                <thead><tr><th>{t('sku')}</th><th>{t('name')}</th><th>{t('quantity')}</th><th>{t('available_stock')}</th><th></th></tr></thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.product_sku}</td>
                      <td>{item.product_name}</td>
                      <td><span className="badge badge-info">{item.quantity}</span></td>
                      <td><span className="badge badge-success">{item.available}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => handleEditItemPackaging(index)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} title={t('edit_packaging')}>📦</button>
                          <button type="button" className="btn btn-danger" onClick={() => handleRemoveItem(index)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>{t('remove')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '1.5rem' }}>
            <label className="form-label">{t('general_notes')}</label>
            <textarea className="form-textarea" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder={t('general_notes')} />
          </div>

          <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={formData.generate_delivery_note} onChange={e => setFormData({ ...formData, generate_delivery_note: e.target.checked })} style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }} />
              <span style={{ fontSize: '1rem', fontWeight: '500' }}>{t('generate_delivery_note_after_save')}</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={formData.items.length === 0}>{t('save_transaction')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewOutboundModal;
