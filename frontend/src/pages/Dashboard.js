import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [salesStats, setSalesStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warehouseAlerts, setWarehouseAlerts] = useState([]);
  const [completingAlert, setCompletingAlert] = useState(null);
  const [dispatchModal, setDispatchModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // alert pending confirm
  const [outboundList, setOutboundList] = useState([]);
  const [selectedOutbound, setSelectedOutbound] = useState(null);
  const [loadingOutbound, setLoadingOutbound] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if we're in Sales Portal
  const isSalesPortal = location.pathname.startsWith('/sales-portal');

  useEffect(() => {
    fetchData();
  }, [isSalesPortal]);

  const fetchData = async () => {
    try {
      if (isSalesPortal) {
        // Sales Portal Dashboard
        const [salesRes, lowStockRes] = await Promise.all([
          axios.get('/api/sales-dashboard/stats'),
          axios.get('/api/products/low-stock')
        ]);
        setSalesStats(salesRes.data);
        setLowStockProducts(lowStockRes.data);
      } else {
        // Warehouse Dashboard
        const [statsRes, lowStockRes, alertsRes, warehouseAlertsRes] = await Promise.all([
          axios.get('/api/dashboard/stats'),
          axios.get('/api/products/low-stock'),
          axios.get('/api/stock-alerts'),
          axios.get('/api/warehouse-alerts')
        ]);
        setStats(statsRes.data);
        setLowStockProducts(lowStockRes.data);
        setStockAlerts(alertsRes.data);
        setWarehouseAlerts(warehouseAlertsRes.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const handleDispatchClick = (alert) => {
    setConfirmModal(alert);
  };

  const handleConfirmYes = async () => {
    const alert = confirmModal;
    setConfirmModal(null);
    setLoadingOutbound(true);
    setSelectedOutbound(null);
    try {
      // חיפוש לפי שם לקוח (customer_id אם קיים, + שם)
      const res = await axios.get(`/api/outbound/by-customer/${alert.customer_id || 0}?name=${encodeURIComponent(alert.customer_name || '')}`);
      setOutboundList(res.data);
    } catch(e) {
      setOutboundList([]);
    }
    setLoadingOutbound(false);
    setDispatchModal(alert);
  };

  const handleCompleteAlert = async () => {
    if (!dispatchModal) return;
    if (!selectedOutbound) {
      alert(t('delivery_note_required') || 'Please select a delivery note');
      return;
    }
    try {
      setCompletingAlert(dispatchModal.id);
      const outbound = outboundList.find(o => o.id === selectedOutbound);
      await axios.put(`/api/warehouse-alerts/${dispatchModal.id}/complete`, {
        outbound_id: selectedOutbound,
        outbound_ref: `#${selectedOutbound} — ${new Date(outbound?.transaction_date).toLocaleDateString('he-IL')}`
      });
      setWarehouseAlerts(prev => prev.filter(a => a.id !== dispatchModal.id));
      setDispatchModal(null);
      setSelectedOutbound(null);
    } catch(e) { console.error(e); }
    finally { setCompletingAlert(null); }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  // Sales Portal Dashboard
  if (isSalesPortal) {
    return (
      <div>
        <div className="page-header">
          <h2>{t('dashboard')}</h2>
          <p>{t('welcome')}</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card normal">
            <div className="stat-value">{salesStats?.lowStockProducts || 0}</div>
            <div className="stat-label">{t('low_stock')}</div>
          </div>

          <div className="stat-card normal">
            <div className="stat-value">{salesStats?.totalCustomers || 0}</div>
            <div className="stat-label">{t('total_customers')}</div>
          </div>

          <div className="stat-card normal">
            <div className="stat-value">{salesStats?.totalSuppliers || 0}</div>
            <div className="stat-label">{t('total_suppliers')}</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '4px solid #f39c12' }}>
            <div className="stat-value">{salesStats?.submittedQuotes || 0}</div>
            <div className="stat-label">{t('quotes_submitted')}</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '4px solid #e67e22' }}>
            <div className="stat-value">{salesStats?.pendingApprovals || 0}</div>
            <div className="stat-label">{t('pending_approvals')}</div>
          </div>
        </div>

        {lowStockProducts.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{t('low_stock')} ⚠️</h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('sku')}</th>
                    <th>{t('name')}</th>
                    <th>{t('quantity')}</th>
                    <th>{t('min_quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map(product => (
                    <tr key={product.id}>
                      <td>{product.sku}</td>
                      <td>{product.name}</td>
                      <td>
                        <span className="badge badge-danger">
                          {product.quantity}
                        </span>
                      </td>
                      <td>{product.min_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Warehouse Dashboard (original)
  return (
    <div>
<style>
{`
  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
    50% { box-shadow: 0 0 20px 10px rgba(220, 53, 69, 0.3); }
  }
`}
</style>
      <div className="page-header">
        <h2>{t('dashboard')}</h2>
        <p>{t('welcome')}</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="stat-card normal">
          <div className="stat-value">{stats?.totalProducts || 0}</div>
          <div className="stat-label">{t('total_products')}</div>
        </div>

        <div className="stat-card normal">
          <div className="stat-value">{stats?.totalInbound || 0}</div>
          <div className="stat-label">{t('total_inbound') || 'Total Inbound'}</div>
        </div>

        <div className="stat-card normal">
          <div className="stat-value">{stats?.totalOutbound || 0}</div>
          <div className="stat-label">{t('total_outbound') || 'Total Outbound'}</div>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('low_stock')} ⚠️</h3>
          </div>
          {isMobile ? (
            <div style={{ padding: '0.5rem' }}>
              {lowStockProducts.map(product => (
                <div key={product.id} style={{ background: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>🔖 {product.sku} — {product.name}</div>
                  <div style={{ fontSize: '0.85rem' }}>
                    <span className="badge badge-danger">{product.quantity}</span>
                    <span style={{ marginLeft: '0.5rem', color: '#666' }}>min: {product.min_quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('sku')}</th>
                    <th>{t('name')}</th>
                    <th>{t('quantity')}</th>
                    <th>{t('min_quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map(product => (
                    <tr key={product.id}>
                      <td>{product.sku}</td>
                      <td>{product.name}</td>
                      <td><span className="badge badge-danger">{product.quantity}</span></td>
                      <td>{product.min_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Warehouse Alerts from Support */}
      {warehouseAlerts.length > 0 && (
        <div className="card" style={{ border:'2px solid #e67e22', backgroundColor:'#fff8f0', marginBottom:'1.5rem' }}>
          <div className="card-header" style={{ background:'linear-gradient(135deg,#e67e22,#ca6f1e)', borderRadius:'8px 8px 0 0', padding:'1rem 1.5rem' }}>
            <h3 className="card-title" style={{ color:'white', margin:0 }}>
              {t('urgent_dispatches')} 🚨 ({warehouseAlerts.length})
            </h3>
          </div>
          {isMobile ? (
            <div style={{ padding: '0.5rem' }}>
              {warehouseAlerts.map(alert => (
                <div key={alert.id} style={{ background: '#fff3e0', border: '1px solid #e67e22', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>🎫 {alert.ticket_number}</div>
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>👥 {alert.customer_name}</div>
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>📦 {alert.product_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span style={{ background:'#e67e22', color:'white', padding:'0.2rem 0.6rem', borderRadius:'8px', fontWeight:700 }}>{alert.quantity}</span>
                    <button onClick={() => handleDispatchClick(alert)} disabled={completingAlert === alert.id}
                      style={{ background:'#27ae60', color:'white', border:'none', borderRadius:'8px', padding:'0.4rem 0.9rem', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                      {completingAlert === alert.id ? t('loading') : `✅ ${t('dispatched')}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-container" style={{ overflowX:'visible' }}>
              <table className="table" style={{ tableLayout:'fixed', width:'100%' }}>
                <thead>
                  <tr>
                    <th>{t('ticket_number')}</th>
                    <th>{t('customer')}</th>
                    <th>{t('product')}</th>
                    <th>{t('quantity')}</th>
                    <th>{t('requested_by')}</th>
                    <th>{t('date')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseAlerts.map(alert => (
                    <tr key={alert.id} style={{ background:'#fff3e0' }}>
                      <td style={{ fontWeight:700 }}>{alert.ticket_number}</td>
                      <td style={{ wordBreak:'break-word' }}>{alert.customer_name}</td>
                      <td style={{ wordBreak:'break-word' }}>{alert.product_name}</td>
                      <td><span style={{ background:'#e67e22', color:'white', padding:'0.2rem 0.6rem', borderRadius:'8px', fontWeight:700 }}>{alert.quantity}</span></td>
                      <td>{alert.requested_by_name}</td>
                      <td>{alert.created_at ? new Date(alert.created_at).toLocaleDateString() : '-'}</td>
                      <td>
                        <button onClick={() => handleDispatchClick(alert)} disabled={completingAlert === alert.id}
                          style={{ background:'#27ae60', color:'white', border:'none', borderRadius:'8px', padding:'0.4rem 0.9rem', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                          {completingAlert === alert.id ? t('loading') : `✅ ${t('dispatched')}`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stock Alerts - Order Shortages */}
      {stockAlerts.length > 0 && (
        <div className="card" style={{ 
          border: '2px solid #dc3545', 
          animation: 'pulse-red 2s infinite',
          backgroundColor: '#fff5f5'
        }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: '#dc3545' }}>
              🚨 {t('stock_alerts')} - {t('order_shortages')}
            </h3>
          </div>
          <div className="card-body">
            <p style={{ color: '#dc3545', fontWeight: 'bold', marginBottom: '1rem' }}>
              ⚠️ {t('new_orders_stock_shortage')}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('quote')}</th>
                  <th>{t('product')}</th>
                  <th>{t('required')}</th>
                  <th>{t('available')}</th>
                  <th>{t('shortage')}</th>
                </tr>
              </thead>
              <tbody>
                {stockAlerts.map(alert => (
                  <tr key={alert.id} style={{ backgroundColor: '#ffe6e6' }}>
                    <td>#{alert.quote_number}</td>
                    <td>{alert.product_name}</td>
                    <td>{alert.required_qty}</td>
                    <td>{alert.available_qty}</td>
                    <td style={{ color: '#dc3545', fontWeight: 'bold' }}>
                      -{alert.shortage_qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Confirm Modal — האם ייצרת תעודת משלוח? */}
      {confirmModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📋 {t('confirm_dispatch_title') || 'אישור משלוח'}</h3>
              <button className="modal-close" onClick={() => setConfirmModal(null)}>×</button>
            </div>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>
                {t('confirm_dispatch_question') || 'האם ייצרת תעודת משלוח בהתאם לבקשת מערכת התמיכה?'}
              </p>
              <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                <div><strong>{t('customer')}:</strong> {confirmModal.customer_name}</div>
                <div><strong>{t('product')}:</strong> {confirmModal.product_name} x{confirmModal.quantity}</div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button className="btn btn-danger" style={{ minWidth: '80px' }} onClick={() => setConfirmModal(null)}>
                  {t('no') || 'לא'}
                </button>
                <button className="btn btn-success" style={{ minWidth: '80px' }} onClick={handleConfirmYes}>
                  {t('yes') || 'כן'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal — בחירת תעודת משלוח */}
      {dispatchModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📦 {t('select_delivery_note') || 'בחר תעודת משלוח'}</h3>
              <button className="modal-close" onClick={() => setDispatchModal(null)}>×</button>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ background: '#fff3e0', border: '1px solid #e67e22', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                <strong>{t('customer')}:</strong> {dispatchModal.customer_name} &nbsp;|&nbsp;
                <strong>{t('product')}:</strong> {dispatchModal.product_name} x{dispatchModal.quantity}
              </div>

              <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>{t('select_delivery_note_you_created') || 'בחר את תעודת המשלוח שיצרת:'}</p>

              {loadingOutbound ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner"></div></div>
              ) : outboundList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#888', background: '#f8f9fa', borderRadius: '8px' }}>
                  ⚠️ {t('no_delivery_notes_found') || 'לא נמצאו תעודות משלוח עבור לקוח זה.'}<br/>
                  <small>{t('create_delivery_note_first') || 'צור תעודת משלוח בדף Outbound ואז חזור לכאן.'}</small>
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {outboundList.map(ob => (
                    <div key={ob.id}
                      onClick={() => setSelectedOutbound(ob.id)}
                      style={{
                        border: `2px solid ${selectedOutbound === ob.id ? '#28a745' : '#dee2e6'}`,
                        background: selectedOutbound === ob.id ? '#f0fff4' : 'white',
                        borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{t('delivery_note')} #{ob.id}</strong>
                          <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: '#555' }}>
                            {new Date(ob.transaction_date).toLocaleString('he-IL')}
                          </span>
                        </div>
                        <span className={`badge ${ob.status === 'delivered' ? 'badge-success' : ob.status === 'shipped' ? 'badge-info' : 'badge-warning'}`}>
                          {ob.status}
                        </span>
                      </div>
                      {ob.items_summary && (
                        <div style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.25rem' }}>📦 {ob.items_summary}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDispatchModal(null)}>{t('cancel')}</button>
              <button
                className="btn btn-success"
                onClick={handleCompleteAlert}
                disabled={!selectedOutbound || completingAlert === dispatchModal.id}
              >
                {completingAlert === dispatchModal.id ? t('loading') : `✅ ${t('dispatched') || 'אישור משלוח'}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
