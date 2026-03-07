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
    <div className="app">
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

            <Link to="/sales-portal/customers" className={isActive('/sales-portal/customers')}>
              <span className="sidebar-icon">👥</span>
              {t('customers')}
            </Link>

            <Link to="/sales-portal/products" className={isActive('/sales-portal/products')}>
              <span className="sidebar-icon">📦</span>
              {t('products')}
            </Link>

            <Link to="/sales-portal/suppliers" className={isActive('/sales-portal/suppliers')}>
              <span className="sidebar-icon">🏭</span>
              {t('suppliers')}
            </Link>

            <Link to="/sales-portal/reports" className={isActive('/sales-portal/reports')}>
              <span className="sidebar-icon">📦</span>
              {t('warehouse_reports') || 'דוחות מחסן'}
            </Link>

            <Link to="/sales-portal/sales-reports" className={isActive('/sales-portal/sales-reports')}>
              <span className="sidebar-icon">📊</span>
              {t('sales_reports') || 'דוחות מכירות'}
            </Link>

            <Link to="/sales-portal/settings" className={isActive('/sales-portal/settings')}>
              <span className="sidebar-icon">⚙️</span>
              {t('settings')}
            </Link>

            {user?.role === 'admin' && (
              <Link to="/sales-portal/users" className={isActive('/sales-portal/users')}>
                <span className="sidebar-icon">👤</span>
                {t('users')}
              </Link>
            )}

            {user?.role === 'admin' && (
              <Link to="/sales-portal/activity-log" className={isActive('/sales-portal/activity-log')}>
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

export default SalesLayout;
