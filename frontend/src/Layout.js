import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';
import axios from 'axios';

function Layout() {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [companyLogo, setCompanyLogo] = useState(null);

  useEffect(() => {
    fetchCompanyLogo();
  }, []);

  const fetchCompanyLogo = async () => {
    try {
      const response = await axios.get('/api/company');
      if (response.data.logo_path) {
        setCompanyLogo(`http://localhost:3001${response.data.logo_path}`);
      }
    } catch (error) {
      console.error('Error fetching company logo:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  // Check if user has access to a module
  const hasModuleAccess = (module) => {
    if (user?.role === 'admin') return true; // Admins have access to everything
    
    switch(module) {
      case 'warehouse':
        return user?.module_warehouse !== 0;
      case 'sales':
        return user?.module_sales !== 0;
      case 'service':
        return user?.module_service !== 0;
      default:
        return false;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt="Company Logo" 
              style={{ 
                maxHeight: '100px', 
                maxWidth: '300px',
                objectFit: 'contain',
                marginRight: '1.5rem'
              }} 
            />
          )}
          <h1 style={{ fontSize: '2.2rem', fontWeight: '700', color: '#ffffff', margin: 0, marginLeft: '3rem' }}>
            WorldSecure ERP
          </h1>
        </div>
        
        <div className="header-right">
          <select
            className="language-selector"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="he">עברית</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
          
          <div className="user-info">
            <span>{user?.username || user?.email}</span>
          </div>
          
          <button className="btn btn-secondary" onClick={handleLogout}>
            {t('logout')}
          </button>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            <Link to="/dashboard" className={isActive('/dashboard')}>
              <span className="sidebar-icon">📊</span>
              {t('dashboard')}
            </Link>

            {hasModuleAccess('sales') && (
              <a
                href="/sales-portal"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', padding: '0.75rem 1rem',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', textDecoration: 'none', borderRadius: '4px',
                  margin: '0.25rem 0.5rem', fontWeight: 600
                }}
              >
                <span className="sidebar-icon">💰</span>
                {t('sales_management')}
              </a>
            )}
            
            {/* Warehouse Module */}
            {hasModuleAccess('warehouse') && (
              <>
                <Link to="/products" className={isActive('/products')}>
                  <span className="sidebar-icon">📦</span>
                  {t('products')}
                </Link>
                
                <Link to="/inbound" className={isActive('/inbound')}>
                  <span className="sidebar-icon">⬇️</span>
                  {t('inbound')}
                </Link>
                
                <Link to="/outbound" className={isActive('/outbound')}>
                  <span className="sidebar-icon">⬆️</span>
                  {t('outbound')}
                </Link>
                
                <Link to="/suppliers" className={isActive('/suppliers')}>
                  <span className="sidebar-icon">🏭</span>
                  {t('suppliers')}
                </Link>
                
                <Link to="/customers" className={isActive('/customers')}>
                  <span className="sidebar-icon">👥</span>
                  {t('customers')}
                </Link>
              </>
            )}
            
            {/* Reports - available to all */}
            <Link to="/reports" className={isActive('/reports')}>
              <span className="sidebar-icon">📈</span>
              {t('reports')}
            </Link>
            
            {/* Settings - admin only */}
            {user?.role === 'admin' && (
              <Link to="/settings" className={isActive('/settings')}>
                <span className="sidebar-icon">⚙️</span>
                {t('settings')}
              </Link>
            )}
            
            {/* Users - admin only */}
            {user?.role === 'admin' && (
              <Link to="/users" className={isActive('/users')}>
                <span className="sidebar-icon">👥</span>
                {t('users')}
              </Link>
            )}
            
            {/* Activity Log - available to all */}
            <Link to="/activity-log" className={isActive('/activity-log')}>
              <span className="sidebar-icon">📝</span>
              {t('activity_log')}
            </Link>
          </nav>
        </aside>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
