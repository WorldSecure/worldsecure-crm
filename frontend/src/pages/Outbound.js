import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

function Outbound() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const getProductName = (product) => {
    if (language === 'he' && product.name_he) return product.name_he;
    if (language === 'pt' && product.name_pt) return product.name_pt;
    return product.name;
  };
  const [customers, setCustomers] = useState([]);
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
  const [editingItemIndex, setEditingItemIndex] = useState(null);

  const isAdmin = user?.role === 'admin';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Debug - check user role
  useEffect(() => {
    console.log('Current user:', user);
    console.log('User role:', user?.role);
    console.log('Is admin:', isAdmin);
  }, [user, isAdmin]);
  
  const [formData, setFormData] = useState({
    customer_id: '',
    customer_type: 'registered',
    casual_customer_name: '',
    status: 'pending',
    notes: '',
    items: [],
    generate_delivery_note: false,
    qr_code_id: null
  });

  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    quantity: 1
  });
  
  const [showPackagingSteps, setShowPackagingSteps] = useState(false);
  const [packagingData, setPackagingData] = useState({
    use_packaging: false,
    items_per_carton: '',
    carton_weight: '',
    use_pallets: false,
    cartons_per_pallet: '',
    pallet_dimensions: '',
    pallet_weight: ''
  });
  const [packagingStep, setPackagingStep] = useState(0); // 0=ask, 1=cartons, 2=pallets

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [customersRes, productsRes, transactionsRes, qrRes] = await Promise.all([
        axios.get('/api/customers'),
        axios.get('/api/products'),
        axios.get('/api/outbound'),
        axios.get('/api/qr-codes').catch(() => ({ data: [] }))
      ]);
      
      const isAdmin = user?.role === 'admin';
      setCustomers(isAdmin ? customersRes.data : customersRes.data.filter(c => !c.is_sensitive));
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
    if (!currentItem.product_id || currentItem.quantity <= 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }

    const product = products.find(p => p.id === parseInt(currentItem.product_id));
    
    if (product.quantity < currentItem.quantity) {
      alert(t('insufficient_stock') + `! ${t('available_stock')}: ${product.quantity}`);
      return;
    }

    // Show packaging steps inline in the same modal
    setPackagingStep(0); // Start with question
    setPackagingData({
      use_packaging: false,
      items_per_carton: '',
      carton_weight: '',
      use_pallets: false,
      cartons_per_pallet: '',
      pallet_dimensions: '',
      pallet_weight: ''
    });
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
    
    // Add packaging data if user chose to pack
    if (packagingData.use_packaging && packagingData.items_per_carton) {
      const numCartons = Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton));
      const totalCartonWeight = numCartons * (parseFloat(packagingData.carton_weight) || 0);
      
      itemWithPackaging = {
        ...itemWithPackaging,
        use_packaging: true,
        items_per_carton: parseInt(packagingData.items_per_carton),
        carton_weight: parseFloat(packagingData.carton_weight) || 0,
        num_cartons: numCartons,
        total_carton_weight: totalCartonWeight
      };
      
      if (packagingData.use_pallets && packagingData.cartons_per_pallet) {
        const numPallets = Math.ceil(numCartons / parseInt(packagingData.cartons_per_pallet));
        
        itemWithPackaging = {
          ...itemWithPackaging,
          use_pallets: true,
          cartons_per_pallet: parseInt(packagingData.cartons_per_pallet),
          pallet_dimensions: packagingData.pallet_dimensions || '',
          pallet_weight: parseFloat(packagingData.pallet_weight) || 0,
          num_pallets: numPallets
        };
      }
    }

    // Check if we're editing an existing item or adding new
    if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = {
        ...updatedItems[editingItemIndex],
        ...itemWithPackaging
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
        items: [...formData.items, itemWithPackaging]
      });
    }

    setCurrentItem({
      product_id: '',
      quantity: 1
    });
    
    setShowPackagingSteps(false);
    setPackagingStep(0);
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };
  
  const handleEditItemPackaging = (index) => {
    const item = formData.items[index];
    setEditingItemIndex(index);
    
    // Set current item for editing
    setCurrentItem({
      product_id: item.product_id,
      quantity: item.quantity
    });
    
    // Load existing packaging data
    setPackagingData({
      use_packaging: item.use_packaging || false,
      items_per_carton: item.items_per_carton || '',
      carton_weight: item.carton_weight || '',
      use_pallets: item.use_pallets || false,
      cartons_per_pallet: item.cartons_per_pallet || '',
      pallet_dimensions: item.pallet_dimensions || '',
      pallet_weight: item.pallet_weight || ''
    });
    
    // Start at appropriate step
    if (item.use_packaging) {
      setPackagingStep(1); // Start at cartons step
    } else {
      setPackagingStep(0); // Start at question
    }
    
    setShowPackagingSteps(true);
  };

  const handleDeleteTransaction = async (transactionId) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (!window.confirm(t('confirm_delete'))) return;

    try {
      await axios.delete(`/api/outbound/${transactionId}`);
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
      const response = await axios.get(`/api/outbound/${transaction.id}/details`);
      const details = response.data;
      
      setEditingTransaction(transaction);
      setFormData({
        customer_id: details.customer_id || '',
        customer_type: details.customer_type,
        casual_customer_name: details.casual_customer_name || '',
        status: details.status,
        notes: details.notes || '',
        items: details.items.map(item => ({
          product_id: item.product_id,
          product_name: item.name,
          product_sku: item.sku,
          quantity: item.quantity,
          available: item.available || 0,
          original_quantity: item.quantity, // Store original for inventory calculation
          // Include packaging data if exists
          use_packaging: item.use_packaging || false,
          items_per_carton: item.items_per_carton || '',
          carton_weight: item.carton_weight || '',
          num_cartons: item.num_cartons || '',
          use_pallets: item.use_pallets || false,
          cartons_per_pallet: item.cartons_per_pallet || '',
          pallet_dimensions: item.pallet_dimensions || '',
          pallet_weight: item.pallet_weight || '',
          num_pallets: item.num_pallets || ''
        }))
      });
      setShowModal(true);
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGenerateDeliveryNote = async (transactionId) => {
    setSelectedTransactionId(transactionId);
    setSelectedContact('');
    // מושך את פרטי הלקוח לקבלת אנשי קשר
    try {
      const res = await axios.get(`/api/outbound/${transactionId}/details`);
      const customerId = res.data.customer_id;
      if (customerId) {
        const custRes = await axios.get(`/api/customers`);
        const customer = custRes.data.find(c => c.id === customerId);
        if (customer?.contact_person) {
          let contacts = [];
          try {
            const parsed = JSON.parse(customer.contact_person);
            if (Array.isArray(parsed)) {
              // פורמט חדש - {name, phone}
              contacts = parsed.map(c => [c.name, c.phone, c.email].filter(Boolean).join(' | ')).filter(Boolean);
            }
          } catch (e) {
            // פורמט ישן - מחרוזת
            contacts = customer.contact_person.split(';').map(c => c.trim()).filter(Boolean);
          }
          setContactOptions(contacts);
          setSelectedContact(contacts[0] || '');
        } else {
          setContactOptions([]);
        }
      } else {
        setContactOptions([]);
      }
    } catch (e) {
      setContactOptions([]);
    }
    setShowLanguageModal(true);
  };
  
  const handleGenerateWithLanguage = async (lang) => {
    setShowLanguageModal(false);
    
    try {
      const contactParam = selectedContact ? `&contact=${encodeURIComponent(selectedContact)}` : '';
      const token = sessionStorage.getItem('token') || '';
      const response = await axios.get(`/api/outbound/${selectedTransactionId}/delivery-note?lang=${lang}${contactParam}&token=${encodeURIComponent(token)}`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      
      // Open HTML in new window
      const newWindow = window.open('', '_blank');
      newWindow.document.write(response.data);
      newWindow.document.close();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.items.length === 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }

    if (formData.customer_type === 'registered' && !formData.customer_id) {
      alert(t('error') + ': ' + t('select_customer'));
      return;
    }

    if (formData.customer_type === 'casual' && !formData.casual_customer_name) {
      alert(t('error') + ': ' + t('enter_customer_name'));
      return;
    }

    try {
      let transactionId;
      
      if (editingTransaction) {
        // Update existing transaction
        await axios.put(`/api/outbound/${editingTransaction.id}`, formData);
        alert(t('success') + '! ' + t('inventory_updated'));
        transactionId = editingTransaction.id;
      } else {
        // Create new transaction
        const response = await axios.post('/api/outbound', { ...formData, transaction_date: new Date().toISOString() });
        alert(t('success') + '! ' + t('inventory_updated'));
        transactionId = response.data.id;
      }
      
      // Check if user wants delivery note
      if (formData.generate_delivery_note) {
        handleGenerateDeliveryNote(transactionId);
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
      customer_id: '',
      customer_type: 'registered',
      casual_customer_name: '',
      status: 'pending',
      notes: '',
      items: [],
      generate_delivery_note: false,
    qr_code_id: null
    });
    setCurrentItem({
      product_id: '',
      quantity: 1
    });
    setEditingTransaction(null);
    setShowPackagingSteps(false);
    setPackagingStep(0);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('outbound')}</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('outbound_transactions')}</h3>
          <button 
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
          >
            {t('new_outbound')}
          </button>
        </div>

        {isMobile ? (
          /* ===== MOBILE CARD VIEW ===== */
          <div style={{ padding: '0.5rem' }}>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>{t('no_data')}</div>
            ) : (
              transactions.map(trans => (
                <div key={trans.id} style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                }}>
                  {/* Row 1: Date + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#555' }}>
                      📅 {new Date(trans.transaction_date).toLocaleString('he-IL')}
                    </span>
                    <span className={`badge ${
                      trans.status === 'delivered' ? 'badge-success' :
                      trans.status === 'shipped' ? 'badge-info' :
                      'badge-warning'
                    }`}>
                      {trans.status === 'pending' ? t('status_pending') :
                       trans.status === 'ready' ? t('status_ready') :
                       trans.status === 'shipped' ? t('status_shipped') : t('status_delivered')}
                    </span>
                  </div>

                  {/* Row 2: Customer */}
                  <div style={{ marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: '600', fontSize: '1rem' }}>
                      👤 {trans.customer_type === 'casual' ? trans.casual_customer_name : trans.customer_name || '-'}
                    </span>
                    {' '}
                    <span className={`badge ${trans.customer_type === 'casual' ? 'badge-warning' : 'badge-success'}`}
                      style={{ fontSize: '0.72rem' }}>
                      {trans.customer_type === 'casual' ? t('casual') : t('registered')}
                    </span>
                  </div>

                  {/* Row 3: Username + Notes */}
                  <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: '0.75rem' }}>
                    <span>🧑 {trans.username}</span>
                    {trans.notes && <span style={{ marginLeft: '0.75rem' }}>📝 {trans.notes}</span>}
                  </div>

                  {/* Row 4: Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-success"
                      onClick={() => handleGenerateDeliveryNote(trans.id)}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flex: '1', minWidth: '120px' }}
                    >
                      📄 {t('delivery_note')}
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleEdit(trans)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                        >
                          ✏️ {t('edit')}
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteTransaction(trans.id)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ===== DESKTOP TABLE VIEW ===== */
          <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('transaction_date')}</th>
                <th>{t('customer')}</th>
                <th>{t('customer_type')}</th>
                <th>{t('status')}</th>
                <th>{t('notes')}</th>
                <th>{t('username')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center">{t('no_data')}</td>
                </tr>
              ) : (
                transactions.map(trans => (
                  <tr key={trans.id}>
                    <td>{new Date(trans.transaction_date).toLocaleString('he-IL')}</td>
                    <td>
                      {trans.customer_type === 'casual' 
                        ? trans.casual_customer_name 
                        : trans.customer_name || '-'}
                    </td>
                    <td>
                      <span className={`badge ${trans.customer_type === 'casual' ? 'badge-warning' : 'badge-success'}`}>
                        {trans.customer_type === 'casual' ? t('casual') : t('registered')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        trans.status === 'delivered' ? 'badge-success' :
                        trans.status === 'shipped' ? 'badge-info' :
                        'badge-warning'
                      }`}>
                        {trans.status === 'pending' ? t('status_pending') :
                         trans.status === 'ready' ? t('status_ready') :
                         trans.status === 'shipped' ? t('status_shipped') : t('status_delivered')}
                      </span>
                    </td>
                    <td>{trans.notes || '-'}</td>
                    <td>{trans.username}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <button 
                          className="btn btn-success"
                          onClick={() => handleGenerateDeliveryNote(trans.id)}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          📄 {t('delivery_note')}
                        </button>
                        {isAdmin && (
                          <>
                            <button 
                              className="btn btn-secondary"
                              onClick={() => handleEdit(trans)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn btn-danger"
                              onClick={() => handleDeleteTransaction(trans.id)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingTransaction ? t('edit_transaction') : t('new_outbound')}</h3>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Customer Selection */}
              <div className="form-group">
                <label className="form-label">{t('customer_type')}</label>
                <select
                  className="form-select"
                  value={formData.customer_type}
                  onChange={(e) => setFormData({...formData, customer_type: e.target.value, customer_id: '', casual_customer_name: ''})}
                >
                  <option value="registered">{t('registered')}</option>
                  <option value="casual">{t('casual')}</option>
                </select>
              </div>

              {formData.customer_type === 'registered' ? (
                <div className="form-group">
                  <label className="form-label">{t('select_customer')} *</label>
                  <select
                    className="form-select"
                    value={formData.customer_id}
                    onChange={(e) => setFormData({...formData, customer_id: e.target.value})}
                    required
                  >
                    <option value="">{t('select_customer')}</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">{t('casual_customer_name')} *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.casual_customer_name}
                    onChange={(e) => setFormData({...formData, casual_customer_name: e.target.value})}
                    placeholder={t('enter_customer_name')}
                    required
                  />
                </div>
              )}

              {/* Status */}
              <div className="form-group">
                <label className="form-label">{t('status')}</label>
                <select
                  className="form-select"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  <option value="pending">{t('status_pending')}</option>
                  <option value="ready">{t('status_ready')}</option>
                  <option value="shipped">{t('status_shipped')}</option>
                  <option value="delivered">{t('status_delivered')}</option>
                </select>
              </div>

              {/* Add Items Section */}
              <div className="card" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa' }}>
                <h4 style={{ marginBottom: '1rem' }}>{t('add_items')}</h4>
                
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">{t('select_product')}</label>
                    <select
                      className="form-select"
                      value={currentItem.product_id}
                      onChange={(e) => setCurrentItem({...currentItem, product_id: e.target.value})}
                    >
                      <option value="">{t('select_product')}</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.sku} - {getProductName(product)} ({t('available_stock')}: {product.quantity})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('quantity')}</label>
                    <input
                      type="number"
                      className="form-input"
                      value={currentItem.quantity}
                      onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value})}
                      min="1"
                    />
                  </div>
                </div>

                <button 
                  type="button"
                  className="btn btn-success"
                  onClick={handleAddItem}
                  disabled={showPackagingSteps}
                >
                  {t('add_item')}
                </button>
              </div>

              {/* Inline Packaging Steps */}
              {showPackagingSteps && (
                <div style={{ 
                  marginTop: '1.5rem', 
                  padding: '1.5rem', 
                  background: '#f8f9fa', 
                  borderRadius: '8px',
                  border: '2px solid #3498db'
                }}>
                  <h4 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
                    📦 {t('packaging')}
                  </h4>
                  
                  {/* Step 0: Ask if want packaging */}
                  {packagingStep === 0 && (
                    <div>
                      <h5 style={{ marginBottom: '1rem' }}>{t('use_packaging')}</h5>
                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button 
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setPackagingData({...packagingData, use_packaging: true});
                            setPackagingStep(1);
                          }}
                          style={{ padding: '0.75rem 1.5rem' }}
                        >
                          ✓ {t('yes')}
                        </button>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setPackagingData({...packagingData, use_packaging: false});
                            handleConfirmPackaging();
                          }}
                          style={{ padding: '0.75rem 1.5rem' }}
                        >
                          {t('continue_without_packaging')}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Step 1: Carton packaging */}
                  {packagingStep === 1 && (
                    <div>
                      <h5 style={{ marginBottom: '1rem' }}>{t('carton_packaging')}</h5>
                      
                      <div className="form-group">
                        <label className="form-label">{t('items_per_carton')} *</label>
                        <input
                          type="number"
                          className="form-input"
                          value={packagingData.items_per_carton}
                          onChange={(e) => setPackagingData({...packagingData, items_per_carton: e.target.value})}
                          placeholder="10"
                          min="1"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label">{t('carton_weight')}</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-input"
                          value={packagingData.carton_weight}
                          onChange={(e) => setPackagingData({...packagingData, carton_weight: e.target.value})}
                          placeholder="8.5"
                        />
                      </div>
                      
                      {packagingData.items_per_carton && currentItem.quantity && (
                        <div style={{ 
                          background: '#e3f2fd', 
                          padding: '1rem', 
                          borderRadius: '4px',
                          marginTop: '1rem'
                        }}>
                          <p><strong>{t('num_cartons')}:</strong> {Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton))} {t('cartons')}</p>
                          {packagingData.carton_weight && (
                            <p><strong>{t('total_carton_weight')}:</strong> {(Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton)) * parseFloat(packagingData.carton_weight)).toFixed(2)} ק"ג</p>
                          )}
                        </div>
                      )}
                      
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setPackagingStep(0)}
                        >
                          {t('back')}
                        </button>
                        <button 
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setPackagingStep(2)}
                          disabled={!packagingData.items_per_carton}
                        >
                          {t('next')} →
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Step 2: Pallet division */}
                  {packagingStep === 2 && (
                    <div>
                      <h5 style={{ marginBottom: '1rem' }}>{t('pallet_division')}</h5>
                      <p style={{ marginBottom: '1rem', color: '#666' }}>{t('use_pallets')}</p>
                      
                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button 
                          type="button"
                          className={`btn ${packagingData.use_pallets ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPackagingData({...packagingData, use_pallets: true})}
                        >
                          {t('yes')}
                        </button>
                        <button 
                          type="button"
                          className={`btn ${!packagingData.use_pallets ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPackagingData({...packagingData, use_pallets: false})}
                        >
                          {t('no')}
                        </button>
                      </div>
                      
                      {packagingData.use_pallets && (
                        <div>
                          <div className="form-group">
                            <label className="form-label">{t('cartons_per_pallet')} *</label>
                            <input
                              type="number"
                              className="form-input"
                              value={packagingData.cartons_per_pallet}
                              onChange={(e) => setPackagingData({...packagingData, cartons_per_pallet: e.target.value})}
                              placeholder="20"
                              min="1"
                            />
                          </div>
                          
                          <div className="form-group">
                            <label className="form-label">{t('pallet_dimensions')}</label>
                            <input
                              type="text"
                              className="form-input"
                              value={packagingData.pallet_dimensions}
                              onChange={(e) => setPackagingData({...packagingData, pallet_dimensions: e.target.value})}
                              placeholder="120×80×150"
                            />
                          </div>
                          
                          <div className="form-group">
                            <label className="form-label">{t('pallet_weight')}</label>
                            <input
                              type="number"
                              step="0.1"
                              className="form-input"
                              value={packagingData.pallet_weight}
                              onChange={(e) => setPackagingData({...packagingData, pallet_weight: e.target.value})}
                              placeholder="50"
                            />
                          </div>
                          
                          {packagingData.cartons_per_pallet && packagingData.items_per_carton && (
                            <div style={{ 
                              background: '#e8f5e9', 
                              padding: '1rem', 
                              borderRadius: '4px',
                              marginTop: '1rem'
                            }}>
                              <p><strong>{t('num_pallets')}:</strong> {Math.ceil(Math.ceil(currentItem.quantity / parseInt(packagingData.items_per_carton)) / parseInt(packagingData.cartons_per_pallet))} {t('pallets')}</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setPackagingStep(1)}
                        >
                          {t('back')}
                        </button>
                        <button 
                          type="button"
                          className="btn btn-success"
                          onClick={handleConfirmPackaging}
                          disabled={packagingData.use_pallets && !packagingData.cartons_per_pallet}
                        >
                          ✓ {t('confirm_and_save')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Items List */}
              {formData.items.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4>{t('items_to_ship')} ({formData.items.length})</h4>
                  <table className="table" style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>{t('sku')}</th>
                        <th>{t('name')}</th>
                        <th>{t('quantity')}</th>
                        <th>{t('available_stock')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.product_sku}</td>
                          <td>{item.product_name}</td>
                          <td><span className="badge badge-info">{item.quantity}</span></td>
                          <td><span className="badge badge-success">{item.available}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button 
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleEditItemPackaging(index)}
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                title={t('edit_packaging')}
                              >
                                📦
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
                    checked={formData.generate_delivery_note}
                    onChange={(e) => setFormData({...formData, generate_delivery_note: e.target.checked})}
                    style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                    {t('generate_delivery_note_after_save')}
                  </span>
                </label>
                
                {/* QR Code Selection */}
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label">{t('add_qr_code')}</label>
                  <select
                    className="form-input"
                    value={formData.qr_code_id || ''}
                    onChange={(e) => setFormData({...formData, qr_code_id: e.target.value ? parseInt(e.target.value) : null})}
                  >
                    <option value="">{qrCodes.length === 0 ? t('no_qr_codes_created') : t('select_qr_code')}</option>
                    {qrCodes.map((qr, index) => (
                      <option key={qr.id} value={qr.id}>
                        QR #{index + 1} - {qr.type}
                      </option>
                    ))}
                  </select>
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
      
      {/* Language Selection Modal for Delivery Note */}
      {showLanguageModal && (
        <div className="modal-overlay" onClick={() => setShowLanguageModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📄 {t('delivery_note')}</h3>
              <button 
                className="modal-close"
                onClick={() => setShowLanguageModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {contactOptions.length > 1 && (
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">👤 {t('contact_person')}</label>
                  <select
                    className="form-select"
                    value={selectedContact}
                    onChange={(e) => setSelectedContact(e.target.value)}
                  >
                    {contactOptions.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              <p style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                {t('select_language_for_delivery')}
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

export default Outbound;
