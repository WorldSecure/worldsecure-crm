import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

function Users() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUsername, setEditingUsername] = useState({ id: null, username: '' });
  const [editingUser, setEditingUser] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ id: null, username: '', password: '', confirm: '' });
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    module_warehouse: true,
    module_sales: true,
    module_service: true
  });

  const isAdmin = user?.role === 'admin';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (!editingUser && users.length >= 10) {
      alert(t('max_users_reached'));
      return;
    }
    
    try {
      if (editingUser) {
        // Update user role and module permissions
        await axios.put(`/api/users/${editingUser.id}`, {
          role: formData.role,
          module_warehouse: formData.module_warehouse,
          module_sales: formData.module_sales,
          module_service: formData.module_service
        });
      } else {
        // Create new user
        await axios.post('/api/auth/register', formData);
      }
      
      alert(t('success'));
      setShowModal(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEdit = (userItem) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }
    
    setEditingUser(userItem);
    setFormData({
      username: userItem.username,
      email: userItem.email,
      password: '',
      role: userItem.role,
      module_warehouse: userItem.module_warehouse === true || userItem.module_warehouse === 1,
      module_sales: userItem.module_sales === true || userItem.module_sales === 1,
      module_service: userItem.module_service === true || userItem.module_service === 1
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      alert(t('admin_only'));
      return;
    }

    if (id === user.id) {
      alert('לא ניתן למחוק את המשתמש המחובר');
      return;
    }
    
    if (!window.confirm(t('confirm_delete'))) return;
    
    try {
      await axios.delete(`/api/users/${id}`);
      alert(t('success'));
      fetchUsers();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEditUsername = (userItem) => {
    setEditingUsername({ id: userItem.id, username: userItem.username });
    setShowEditModal(true);
  };

  const handleSaveUsername = async () => {
    if (!editingUsername.username.trim()) return;
    try {
      await axios.put(`/api/users/${editingUsername.id}/username`, { username: editingUsername.username });
      alert(t('success'));
      setShowEditModal(false);
      fetchUsers();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.password.length < 6) {
      alert('הסיסמה חייבת להיות לפחות 6 תווים');
      return;
    }
    if (passwordData.password !== passwordData.confirm) {
      alert('הסיסמאות אינן תואמות');
      return;
    }
    try {
      await axios.put(`/api/users/${passwordData.id}/password`, { password: passwordData.password });
      alert(t('success'));
      setShowPasswordModal(false);
      setPasswordData({ id: null, username: '', password: '', confirm: '' });
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'user',
      module_warehouse: true,
      module_sales: true,
      module_service: true
    });
    setEditingUser(null);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('user_management')}</h2>
        <p>{t('user_management')} - {t('max_users_reached')}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('users')} ({users.length}/10)</h3>
          {isAdmin && users.length < 10 && (
            <button 
              className="btn btn-primary"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
            >
              {t('add_user')}
            </button>
          )}
        </div>

        {!isAdmin && (
          <div className="alert alert-info" style={{ margin: '1rem' }}>
            {t('admin_only')}
          </div>
        )}

        {isMobile ? (
          /* ===== MOBILE CARD VIEW ===== */
          <div style={{ padding: '0.5rem' }}>
            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>{t('no_data')}</div>
            ) : (
              users.map(userItem => (
                <div key={userItem.id} style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                }}>
                  {/* Row 1: Username + Role badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>
                      {userItem.role === 'admin' ? '👑' : '👤'} {userItem.username}
                    </span>
                    <span className={`badge ${userItem.role === 'admin' ? 'badge-danger' : 'badge-info'}`}>
                      {userItem.role === 'admin' ? t('admin') : t('user')}
                    </span>
                  </div>

                  {/* Row 2: Email + Date */}
                  <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '0.5rem' }}>
                    <div>✉️ {userItem.email}</div>
                    <div>📅 {new Date(userItem.created_at).toLocaleDateString('he-IL')}</div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" onClick={() => handleEdit(userItem)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flex: 1 }}>
                        {t('change_role')}
                      </button>
                      <button className="btn btn-primary" onClick={() => handleEditUsername(userItem)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        ✏️
                      </button>
                      <button className="btn btn-warning" onClick={() => { setPasswordData({ id: userItem.id, username: userItem.username, password: '', confirm: '' }); setShowPasswordModal(true); }}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        🔑
                      </button>
                      {userItem.id !== user.id && (
                        <button className="btn btn-danger" onClick={() => handleDelete(userItem.id)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
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
                <th>{t('username')}</th>
                <th>{t('email')}</th>
                <th>{t('role')}</th>
                <th>{t('created_date')}</th>
                {isAdmin && <th>{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(userItem => (
                <tr key={userItem.id}>
                  <td><strong>{userItem.username}</strong></td>
                  <td>{userItem.email}</td>
                  <td>
                    <span className={`badge ${userItem.role === 'admin' ? 'badge-danger' : 'badge-info'}`}>
                      {userItem.role === 'admin' ? t('admin') : t('user')}
                    </span>
                  </td>
                  <td>{new Date(userItem.created_at).toLocaleDateString('he-IL')}</td>
                  {isAdmin && (
                    <td>
                      <div className="table-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleEdit(userItem)}
                        >
                          {t('change_role')}
                        </button>
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleEditUsername(userItem)}
                        >
                          ✏️ Edit Name
                        </button>
                        <button
                          onClick={() => { setPasswordData({ id: userItem.id, username: userItem.username, password: '', confirm: '' }); setShowPasswordModal(true); }}
                          style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontWeight: '500' }}
                        >
                          🔑 סיסמה
                        </button>
                        {userItem.id !== user.id && (
                          <button 
                            className="btn btn-danger"
                            onClick={() => handleDelete(userItem.id)}
                          >
                            {t('delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">{t('role_info')}</h3>
        </div>
        <div style={{ padding: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>👑 {t('admin')}</h4>
          <ul style={{ marginBottom: '1rem', paddingRight: '1.5rem' }}>
            <li>{t('admin_description')}</li>
            <li>{t('user_management')}</li>
            <li>{t('edit_transaction')}, {t('delete_transaction')}</li>
            <li>{t('company_settings')}</li>
          </ul>

          <h4 style={{ marginBottom: '0.5rem' }}>👤 {t('user')}</h4>
          <ul style={{ paddingRight: '1.5rem' }}>
            <li>{t('user_description')}</li>
            <li>{t('add_items')}</li>
          </ul>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingUser ? t('change_role') : t('add_user')}
              </h3>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {!editingUser ? (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('username')} *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('email')} *</label>
                    <input
                      type="email"
                      className="form-input"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('password')} *</label>
                    <input
                      type="password"
                      className="form-input"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                      minLength="6"
                    />
                  </div>
                </>
              ) : (
                <div className="alert alert-info">
                  {t('editing_user')}: <strong>{editingUser.username}</strong>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">{t('role')} *</label>
                <select
                  className="form-select"
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  required
                >
                  <option value="user">{t('user')}</option>
                  <option value="admin">{t('admin')}</option>
                </select>
              </div>

              {/* Module Permissions - Only show for non-admin users */}
              {formData.role !== 'admin' && (
                <div className="form-group" style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px', marginTop: '1rem' }}>
                  <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block', fontWeight: 'bold' }}>
                    {t('module_permissions')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.module_warehouse}
                        onChange={(e) => setFormData({...formData, module_warehouse: e.target.checked})}
                        style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '1rem' }}>📦 {t('module_warehouse')}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.module_sales}
                        onChange={(e) => setFormData({...formData, module_sales: e.target.checked})}
                        style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '1rem' }}>💰 {t('module_sales')}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.module_service}
                        onChange={(e) => setFormData({...formData, module_service: e.target.checked})}
                        style={{ width: '20px', height: '20px', marginRight: '0.75rem', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '1rem' }}>🛠️ {t('module_service')}</span>
                    </label>
                  </div>
                  <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#666', marginBottom: 0 }}>
                    {t('module_permissions_note')}
                  </p>
                </div>
              )}

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Username Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">✏️ Edit Username</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingUsername.username}
                  onChange={(e) => setEditingUsername({...editingUsername, username: e.target.value})}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveUsername}>
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">🔑 שינוי סיסמה — {passwordData.username}</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>×</button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">סיסמה חדשה *</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.password}
                  onChange={(e) => setPasswordData({...passwordData, password: e.target.value})}
                  placeholder="לפחות 6 תווים"
                  minLength="6"
                />
              </div>
              <div className="form-group">
                <label className="form-label">אימות סיסמה *</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                  placeholder="הקש שוב את הסיסמה"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                {t('cancel')}
              </button>
              <button type="button" onClick={handleChangePassword}
                style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', padding: '0.5rem 1.5rem', cursor: 'pointer', fontWeight: '600' }}>
                🔑 שמור סיסמה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
