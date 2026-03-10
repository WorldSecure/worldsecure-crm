import React, { useState, useEffect } from 'react';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import axios from 'axios';

function SupportDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState({ open: 0, in_progress: 0, closed: 0, pending: 0, total: 0, agents: [] });
  const [loading, setLoading] = useState(true);
  const [dispatchAlerts, setDispatchAlerts] = useState([]);
  const [acking, setAcking] = useState(null);

  const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });

  useEffect(() => {
    Promise.all([
      axios.get('/api/support-tickets/stats', auth()),
      axios.get('/api/notifications/pending-ack', auth()),
    ])
      .then(([statsRes, alertsRes]) => {
        setStats(statsRes.data);
        setDispatchAlerts(alertsRes.data);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAck = async (notifId) => {
    try {
      setAcking(notifId);
      await axios.put(`/api/notifications/${notifId}/acknowledge`, {}, auth());
      setDispatchAlerts(prev => prev.filter(a => a.id !== notifId));
    } catch(e) { console.error(e); }
    finally { setAcking(null); }
  };

  const parseAlert = (n) => {
    try { return JSON.parse(n.data || n.message); } catch(e) { return {}; }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">📊 {t('dashboard')}</h2>
      </div>

      {/* Dispatch Alerts from Warehouse */}
      {dispatchAlerts.length > 0 && (
        <div className="card" style={{ border:'2px solid #e67e22', backgroundColor:'#fff8f0', marginBottom:'1.5rem', animation:'pulse-orange 2s infinite' }}>
          <style>{`@keyframes pulse-orange { 0%,100%{box-shadow:0 0 0 0 rgba(230,126,34,0.6)} 50%{box-shadow:0 0 16px 8px rgba(230,126,34,0.2)} }`}</style>
          <div className="card-header" style={{ background:'linear-gradient(135deg,#e67e22,#ca6f1e)', borderRadius:'8px 8px 0 0', padding:'1rem 1.5rem' }}>
            <h3 className="card-title" style={{ color:'white', margin:0 }}>
              🚨 {t('dispatch_alerts_title') || 'מוצרים שנשלחו מהמחסן'} ({dispatchAlerts.length})
            </h3>
          </div>
          <div style={{ padding:'1rem' }}>
            {dispatchAlerts.map(n => {
              const d = parseAlert(n);
              return (
                <div key={n.id} style={{ background:'white', border:'1px solid #ffd9b3', borderRadius:'10px', padding:'1rem 1.2rem', marginBottom:'0.8rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'0.3rem' }}>
                      📦 {d.product_name} <span style={{ background:'#e67e22', color:'white', borderRadius:'8px', padding:'0.1rem 0.5rem', fontSize:'0.8rem' }}>x{d.quantity}</span>
                    </div>
                    <div style={{ fontSize:'0.85rem', color:'#666' }}>
                      {t('ticket_number') || '#'}: <strong>{d.ticket_number}</strong>
                    </div>
                    <div style={{ fontSize:'0.78rem', color:'#aaa', marginTop:'0.2rem' }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAck(n.id)}
                    disabled={acking === n.id}
                    style={{ background:'#27ae60', color:'white', border:'none', borderRadius:'10px', padding:'0.6rem 1.2rem', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', whiteSpace:'nowrap', boxShadow:'0 2px 6px rgba(39,174,96,0.4)' }}
                  >
                    {acking === n.id ? '...' : `✅ ${t('ack_dispatch') || 'קיבלתי, ממשיך לטפל'}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stat Cards — זהה למחסן ולמכירות */}
      <div className="stats-grid">
        

        <div className="stat-card" style={{ borderLeft: '4px solid #27ae60' }}>
          <div className="stat-value">{stats.closed}</div>
          <div className="stat-label">🔵 {t('status_closed') }</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #2196F3' }}>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">📞 {isAdmin ? (t('all_tickets') ) : (t('my_tickets') )}</div>
        </div>
      </div>

      {/* Agents breakdown — Admin בלבד */}
      {isAdmin && stats.agents && stats.agents.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">👥 {t('agents') }</h3>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>👤 {t('agent') }</th>
                  <th>{t('total_tickets') }</th>
                  <th>{t('status_open') }</th>
                </tr>
              </thead>
              <tbody>
                {stats.agents.map(a => (
                  <tr key={a.id}>
                    <td>{a.username}</td>
                    <td>{a.total}</td>
                    <td>
                      <span style={{ background: a.open_count > 0 ? '#fff3cd' : '#d4edda', color: a.open_count > 0 ? '#856404' : '#155724', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 500 }}>
                        {a.open_count}
                      </span>
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

export default SupportDashboard;
