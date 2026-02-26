import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

function ActivityLog() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchActivities();
  }, [limit]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/activity-log?limit=${limit}`);
      setActivities(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching activity log:', error);
      setLoading(false);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (!window.confirm(t('confirm_delete'))) return;

    try {
      await axios.delete(`/api/activity-log/${activityId}`);
      alert(t('success'));
      fetchActivities();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteAll = async () => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (!window.confirm(t('confirm_delete_all') + '?')) return;

    try {
      await axios.delete('/api/activity-log');
      alert(t('success'));
      fetchActivities();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const getActionText = (action) => {
    const actionKey = `action_${action.toLowerCase()}`;
    return t(actionKey) !== actionKey ? t(actionKey) : action;
  };

  const getActionColor = (action) => {
    if (action.includes('CREATE') || action.includes('INBOUND')) return 'badge-success';
    if (action.includes('DELETE')) return 'badge-danger';
    if (action.includes('UPDATE')) return 'badge-info';
    return 'badge-secondary';
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('activity_log')}</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('activity_log_title')}</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label>{t('show')}:</label>
            <select 
              className="form-select" 
              style={{ width: 'auto' }}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            >
              <option value="50">{t('last_50')}</option>
              <option value="100">{t('last_100')}</option>
              <option value="200">{t('last_200')}</option>
              <option value="500">{t('last_500')}</option>
            </select>
            {isAdmin && activities.length > 0 && (
              <button 
                className="btn btn-danger"
                onClick={handleDeleteAll}
                style={{ marginLeft: 'auto' }}
              >
                🗑️ {t('delete_all')}
              </button>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('transaction_date')}</th>
                <th>{t('username')}</th>
                <th>{t('action')}</th>
                <th>{t('type')}</th>
                <th>{t('entity_id')}</th>
                <th>{t('details')}</th>
                {isAdmin && <th>{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? "7" : "6"} className="text-center">{t('no_data')}</td>
                </tr>
              ) : (
                activities.map(activity => (
                  <tr key={activity.id}>
                    <td style={{ fontSize: '0.9rem' }}>
                      {new Date(activity.timestamp).toLocaleString('he-IL')}
                    </td>
                    <td>
                      <strong>{activity.username || t('user')}</strong>
                    </td>
                    <td>
                      <span className={`badge ${getActionColor(activity.action)}`}>
                        {getActionText(activity.action)}
                      </span>
                    </td>
                    <td>{activity.entity_type || '-'}</td>
                    <td>{activity.entity_id || '-'}</td>
                    <td style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>
                      {activity.details ? (
                        <details>
                          <summary style={{ cursor: 'pointer' }}>{t('view_details')}</summary>
                          <pre style={{ 
                            fontSize: '0.8rem', 
                            marginTop: '0.5rem',
                            background: '#f8f9fa',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            maxWidth: '300px',
                            overflow: 'auto'
                          }}>
                            {JSON.stringify(JSON.parse(activity.details), null, 2)}
                          </pre>
                        </details>
                      ) : '-'}
                    </td>
                    {isAdmin && (
                      <td>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteActivity(activity.id)}
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          {t('delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
          <strong>{t('summary')}:</strong>
          <div style={{ marginTop: '0.5rem' }}>
            {t('showing_activities').replace('{count}', activities.length)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">{t('activity_log_info')}</h3>
        </div>
        <div style={{ padding: '1rem' }}>
          <p>{t('log_description')}:</p>
          <ul style={{ marginTop: '0.5rem', paddingRight: '1.5rem' }}>
            <li>{t('products')}, {t('suppliers')}, {t('customers')}</li>
            <li>{t('inbound')} {t('outbound')}</li>
            <li>{t('settings')}</li>
            <li>{t('username')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ActivityLog;
