import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';

function SalesLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    document.title = 'ניהול מכירות - WorldSecure';
  }, []);

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <div>
      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            <Link to="/sales-portal/dashboard" className={isActive('/sales-portal/dashboard')}>
              <span className="sidebar-icon">📊</span>
              {t('dashboard')}
            </Link>

            <Link to="/sales-portal/sales" className={isActive('/sales-portal/sales')}>
              <span className="sidebar-icon">💰</span>
              {t('sales_management')}
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

export default SalesLayout;
