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
    <div>
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

            <Link to="/support/guide" className={isActive('/support/guide')}>
              <span className="sidebar-icon">📖</span>
              User Guide
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
