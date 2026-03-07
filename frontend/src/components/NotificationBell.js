import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';

function NotificationBell() {
  const { t } = useLanguage();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [acking, setAcking] = useState(null);
  const ref = useRef(null);

  const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });

  const fetchCount = async () => {
    try {
      const res = await axios.get('/api/notifications/unread-count', auth());
      setCount(res.data.count || 0);
    } catch(e) {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/notifications', auth());
      setNotifications(res.data);
    } catch(e) {}
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpen = () => {
    setOpen(!open);
    if (!open) fetchNotifications();
  };

  const markRead = async (id) => {
    try {
      await axios.put(`/api/notifications/${id}/read`, {}, auth());
      setNotifications(prev => prev.map(n => n.id === id ? {...n, is_read:1} : n));
      setCount(prev => Math.max(0, prev - 1));
    } catch(e) {}
  };

  const markAllRead = async () => {
    try {
      await axios.put('/api/notifications/read-all', {}, auth());
      setNotifications(prev => prev.map(n => ({...n, is_read:1})));
      setCount(0);
    } catch(e) {}
  };

  const handleAcknowledge = async (n) => {
    try {
      setAcking(n.id);
      await axios.put(`/api/notifications/${n.id}/acknowledge`, {}, auth());
      setNotifications(prev => prev.map(x => x.id === n.id ? {...x, is_read:1, needs_ack:0} : x));
      setCount(prev => Math.max(0, prev - 1));
    } catch(e) { console.error(e); }
    finally { setAcking(null); }
  };

  const parseMessage = (n) => {
    try {
      const d = JSON.parse(n.message);
      return `${d.product_name} (${d.quantity}) — ${t('ticket')||'קריאה'} ${d.ticket_number}`;
    } catch(e) { return n.message; }
  };

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button onClick={handleOpen} style={{ background:'none', border:'none', cursor:'pointer', position:'relative', fontSize:'1.4rem', padding:'0.3rem 0.5rem', lineHeight:1 }}>
        🔔
        {count > 0 && (
          <span style={{ position:'absolute', top:'-2px', right:'-2px', background:'#e74c3c', color:'white', borderRadius:'50%', width:'18px', height:'18px', fontSize:'0.7rem', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:'360px', background:'white', borderRadius:'12px', boxShadow:'0 8px 32px rgba(0,0,0,0.15)', zIndex:9999, border:'1px solid #eee', overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.8rem 1rem', borderBottom:'1px solid #eee', background:'#f8f9fa' }}>
            <span style={{ fontWeight:700, fontSize:'0.95rem' }}>🔔 {t('notifications')}</span>
            {count > 0 && (
              <button onClick={markAllRead} style={{ background:'none', border:'none', color:'#2196F3', cursor:'pointer', fontSize:'0.8rem', fontWeight:600 }}>
                {t('mark_all_read')}
              </button>
            )}
          </div>

          <div style={{ maxHeight:'420px', overflowY:'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding:'2rem', textAlign:'center', color:'#888', fontSize:'0.9rem' }}>{t('no_notifications')}</div>
            ) : (
              notifications.map(n => (
                <div key={n.id}
                  style={{ padding:'0.8rem 1rem', borderBottom:'1px solid #f0f0f0', background: n.is_read ? 'white' : (n.needs_ack ? '#fff3e0' : '#e3f2fd'), transition:'background 0.15s' }}
                >
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-start' }}>
                    <span style={{ fontSize:'1.2rem' }}>{n.needs_ack ? '🚨' : '📦'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize:'0.88rem', color:'#333', marginBottom:'0.2rem' }}>
                        {t('product_dispatched_title')}
                      </div>
                      <div style={{ fontSize:'0.82rem', color:'#555', lineHeight:'1.4', marginBottom:'0.5rem' }}>
                        {parseMessage(n)}
                      </div>

                      {/* ACK button — only when needs_ack */}
                      {n.needs_ack === 1 && (
                        <button
                          onClick={() => handleAcknowledge(n)}
                          disabled={acking === n.id}
                          style={{ background:'#27ae60', color:'white', border:'none', borderRadius:'8px', padding:'0.35rem 0.8rem', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', width:'100%' }}
                        >
                          {acking === n.id ? '...' : `✅ ${t('ack_dispatch') || 'קיבלתי, ממשיך לטפל'}`}
                        </button>
                      )}

                      <div style={{ fontSize:'0.75rem', color:'#aaa', marginTop:'0.3rem' }}>
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                    {!n.is_read && !n.needs_ack && (
                      <span onClick={() => markRead(n.id)} style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#2196F3', flexShrink:0, marginTop:'4px', cursor:'pointer' }} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
