import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';

const getCategoryName = (item, lang) => {
  if (lang === 'he' && item.category_name_he) return item.category_name_he;
  if (lang === 'pt' && item.category_name_pt) return item.category_name_pt;
  return item.category_name || '-';
};

const getProductName = (item, lang) => {
  if (lang === 'he' && item.name_he) return item.name_he;
  if (lang === 'pt' && item.name_pt) return item.name_pt;
  return item.name;
};

function Reports() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('inventory');
  const [inventoryData, setInventoryData] = useState([]);
  const [outboundData, setOutboundData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: ''
  });
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    fetchInventoryReport();
  }, []);

  const fetchInventoryReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/reports/inventory');
      setInventoryData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching inventory report:', error);
      setLoading(false);
    }
  };

  const fetchOutboundReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange.start_date) params.start_date = dateRange.start_date;
      if (dateRange.end_date) params.end_date = dateRange.end_date;
      
      const response = await axios.get('/api/reports/outbound', { params });
      setOutboundData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching outbound report:', error);
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedInventory = () => {
    return [...inventoryData].sort((a, b) => {
      let aValue, bValue;
      
      if (sortField === 'category') {
        aValue = (a.category_name || '').toLowerCase();
        bValue = (b.category_name || '').toLowerCase();
      } else {
        aValue = (a[sortField] || '').toString().toLowerCase();
        bValue = (b[sortField] || '').toString().toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'inventory') {
      fetchInventoryReport();
    } else if (tab === 'outbound') {
      fetchOutboundReport();
    }
  };

  const exportToCSV = (data, filename) => {
    if (data.length === 0) {
      alert(t('no_data'));
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => 
          JSON.stringify(row[header] || '')
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('reports')}</h2>
      </div>

      {/* Tabs */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #ecf0f1', padding: '1rem' }}>
          <button
            className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleTabChange('inventory')}
          >
            {t('inventory_report')}
          </button>
          <button
            className={`btn ${activeTab === 'outbound' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleTabChange('outbound')}
          >
            {t('outbound_report')}
          </button>
        </div>
      </div>

      {/* Inventory Report */}
      {activeTab === 'inventory' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('inventory_report')}</h3>
            <button 
              className="btn btn-success"
              onClick={() => exportToCSV(getSortedInventory(), 'inventory_report')}
            >
              {t('export')} CSV
            </button>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('sku')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {t('sku')} {sortField === 'sku' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {t('name')} {sortField === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {t('category')} {sortField === 'category' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th>{t('quantity')}</th>
                  <th>{t('min_quantity')}</th>
                  <th>{t('stock_status')}</th>
                  <th>{t('price')}</th>
                </tr>
              </thead>
              <tbody>
                {getSortedInventory().length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center">{t('no_data')}</td>
                  </tr>
                ) : (
                  getSortedInventory().map(item => (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{getProductName(item, language)}</td>
                      <td>{getCategoryName(item, language)}</td>
                      <td>
                        <span className={`badge ${
                          item.stock_status === 'low' ? 'badge-danger' : 'badge-success'
                        }`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td>{item.min_quantity}</td>
                      <td>
                        {item.stock_status === 'low' ? (
                          <span className="badge badge-danger">⚠️ {t('low')}</span>
                        ) : (
                          <span className="badge badge-success">✓ {t('normal')}</span>
                        )}
                      </td>
                      <td>{item.price ? `₪${item.price}` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
            <strong>{t('summary')}:</strong>
            <div style={{ marginTop: '0.5rem' }}>
              {t('total_products')}: {inventoryData.length} | 
              {' '}{t('low_stock')}: {inventoryData.filter(i => i.stock_status === 'low').length}
            </div>
          </div>
        </div>
      )}

      {/* Outbound Report */}
      {activeTab === 'outbound' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('outbound_report')}</h3>
            <button 
              className="btn btn-success"
              onClick={() => exportToCSV(outboundData, 'outbound_report')}
            >
              {t('export')} CSV
            </button>
          </div>

          <div className="form-row" style={{ marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">{t('start_date')}</label>
              <input
                type="date"
                className="form-input"
                value={dateRange.start_date}
                onChange={(e) => setDateRange({...dateRange, start_date: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('end_date')}</label>
              <input
                type="date"
                className="form-input"
                value={dateRange.end_date}
                onChange={(e) => setDateRange({...dateRange, end_date: e.target.value})}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button 
                className="btn btn-primary"
                onClick={fetchOutboundReport}
              >
                {t('filter')}
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('transaction_date')}</th>
                  <th>{t('customer')}</th>
                  <th>{t('item_count')}</th>
                  <th>{t('status')}</th>
                  <th>{t('username')}</th>
                </tr>
              </thead>
              <tbody>
                {outboundData.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">{t('no_data')}</td>
                  </tr>
                ) : (
                  outboundData.map(trans => (
                    <tr key={trans.id}>
                      <td>{new Date(trans.transaction_date).toLocaleDateString('he-IL')}</td>
                      <td>{trans.customer_name || trans.casual_customer_name || '-'}</td>
                      <td><span className="badge badge-info">{trans.item_count}</span></td>
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
                      <td>{trans.username}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
            <strong>{t('summary')}:</strong>
            <div style={{ marginTop: '0.5rem' }}>
              {t('total_outbound')}: {outboundData.length} | 
              {' '}{t('total_items')}: {outboundData.reduce((sum, t) => sum + (t.item_count || 0), 0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
