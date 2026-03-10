import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';

function SupportLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const hasModuleAccess = (module) => {
    if (user?.role === 'admin') return true;
    
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
      {/* Header removed - now in App.js */}

      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            <Link to="/support/dashboard" className={isActive('/support/dashboard')}>
              <span className="sidebar-icon">📊</span>
              {t('dashboard')}
            </Link>

            <Link to="/support/management" className={isActive('/support/management')} style={
              location.pathname === '/support/management'
                ? { background: '#2196F3', color: 'white' }
                : {}
            }>
              <span className="sidebar-icon">📞</span>
              {t('support_management') || 'Support Management'}
            </Link>
            
            {hasModuleAccess('warehouse') && (
              <>
 {user?.role === 'admin' && (

                <Link to="/support/suppliers" className={isActive('/support/suppliers')}>
                  <span className="sidebar-icon">🏭</span>
                  {t('suppliers')}
                </Link>
)}
                
                <Link to="/support/customers" className={isActive('/support/customers')}>
                  <span className="sidebar-icon">👥</span>
                  {t('customers')}
                </Link>
              </>
            )}
{user?.role === 'admin' && (
            
            <Link to="/support/settings" className={isActive('/support/settings')}>
              <span className="sidebar-icon">⚙️</span>
              {t('settings')}
            </Link>
)}
            
            {user?.role === 'admin' && (
              <Link to="/support/users" className={isActive('/support/users')}>
                <span className="sidebar-icon">👤</span>
                {t('users')}
              </Link>
            )}

            {user?.role === 'admin' && (
              <Link to="/support/activity-log" className={isActive('/support/activity-log')}>
                <span className="sidebar-icon">📝</span>
                {t('activity_log')}
              </Link>
            )}
          </nav>
        </aside>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default SupportLayout;
