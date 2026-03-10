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

  const handleCompleteAlert = async (alertId) => {
    try {
      setCompletingAlert(alertId);
      await axios.put(`/api/warehouse-alerts/${alertId}/complete`);
      setWarehouseAlerts(prev => prev.filter(a => a.id !== alertId));
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

      <div className="stats-grid">
        <div className="stat-card normal">
          <div className="stat-value">{stats?.totalProducts || 0}</div>
          <div className="stat-label">{t('total_products')}</div>
        </div>


        <div className="stat-card normal">
          <div className="stat-value">{stats?.todayTransactions || 0}</div>
          <div className="stat-label">{t('today_transactions')}</div>
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
      {/* Warehouse Alerts from Support */}
      {warehouseAlerts.length > 0 && (
        <div className="card" style={{ border:'2px solid #e67e22', backgroundColor:'#fff8f0', marginBottom:'1.5rem' }}>
          <div className="card-header" style={{ background:'linear-gradient(135deg,#e67e22,#ca6f1e)', borderRadius:'8px 8px 0 0', padding:'1rem 1.5rem' }}>
            <h3 className="card-title" style={{ color:'white', margin:0 }}>
              {t('urgent_dispatches')} 🚨 ({warehouseAlerts.length})
            </h3>
          </div>
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
                      <button
                        onClick={() => handleCompleteAlert(alert.id)}
                        disabled={completingAlert === alert.id}
                        style={{ background:'#27ae60', color:'white', border:'none', borderRadius:'8px', padding:'0.4rem 0.9rem', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}
                      >
                        {completingAlert === alert.id ? t('loading') : `✅ ${t('dispatched')}`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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


    </div>
  );
}

export default Dashboard;
