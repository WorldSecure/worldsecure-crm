import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';

function AdminLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <div>
      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            <Link to="/admin/products" className={isActive('/admin/products')}>
              <span className="sidebar-icon">📦</span>
              {t('products')}
            </Link>
            <Link to="/admin/suppliers" className={isActive('/admin/suppliers')}>
              <span className="sidebar-icon">🏭</span>
              {t('suppliers')}
            </Link>
            <Link to="/admin/customers" className={isActive('/admin/customers')}>
              <span className="sidebar-icon">👥</span>
              {t('customers')}
            </Link>
            <Link to="/admin/settings" className={isActive('/admin/settings')}>
              <span className="sidebar-icon">⚙️</span>
              {t('settings')}
            </Link>
            <Link to="/admin/users" className={isActive('/admin/users')}>
              <span className="sidebar-icon">👤</span>
              {t('users')}
            </Link>
            <Link to="/admin/reports" className={isActive('/admin/reports')}>
              <span className="sidebar-icon">📊</span>
              {t('Warehouse Reports')}
            </Link>
            <Link to="/admin/sales-reports" className={isActive('/admin/sales-reports')}>
              <span className="sidebar-icon">💹</span>
              {t('sales_reports') || 'Sales Reports'}
            </Link>
            <Link to="/admin/activity-log" className={isActive('/admin/activity-log')}>
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

export default AdminLayout;
