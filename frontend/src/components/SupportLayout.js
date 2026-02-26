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
            
            {hasModuleAccess('warehouse') && (
              <>
                <Link to="/support/products" className={isActive('/support/products')}>
                  <span className="sidebar-icon">📦</span>
                  {t('products')}
                </Link>
                
                <Link to="/support/suppliers" className={isActive('/support/suppliers')}>
                  <span className="sidebar-icon">🏭</span>
                  {t('suppliers')}
                </Link>
                
                <Link to="/support/customers" className={isActive('/support/customers')}>
                  <span className="sidebar-icon">👥</span>
                  {t('customers')}
                </Link>
              </>
            )}
            
            <Link to="/support/settings" className={isActive('/support/settings')}>
              <span className="sidebar-icon">⚙️</span>
              {t('settings')}
            </Link>
            
            <Link to="/support/users" className={isActive('/support/users')}>
              <span className="sidebar-icon">👤</span>
              {t('users')}
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

export default SupportLayout;
