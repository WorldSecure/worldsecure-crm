import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';

function AdminLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';
  const isCloud = window.location.hostname === 'app.world-secure.com';
  const isMobile = window.innerWidth <= 768;

  const groupLabel = isMobile ? null : (label) => (
    <div style={{
      fontSize: '0.68rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: 'rgba(255,255,255,0.45)',
      padding: '1rem 1rem 0.25rem 1rem',
      textTransform: 'uppercase',
      userSelect: 'none',
    }}>
      {label}
    </div>
  );

  const divider = isMobile ? null : (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '0.5rem 0.75rem' }} />
  );

  return (
    <div>
      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            {groupLabel && groupLabel(t('master_data') || 'Master Data')}
            <Link to="/admin/products" className={isActive('/admin/products')}>
              <span className="sidebar-icon">📦</span>
              {t('products')}
            </Link>
            <Link to="/admin/suppliers" className={isActive('/admin/suppliers')}>
              <span className="sidebar-icon">🏭</span>
              {t('suppliers')}
            </Link>
            <Link to="/admin/manufacturers" className={isActive('/admin/manufacturers')}>
              <span className="sidebar-icon">🏗️</span>
              {t('manufacturers') || 'Manufacturers'}
            </Link>
            <Link to="/admin/customers" className={isActive('/admin/customers')}>
              <span className="sidebar-icon">👥</span>
              {t('customers')}
            </Link>

            {groupLabel && groupLabel(t('reports') || 'Reports')}
            <Link to="/admin/warehouse-reports" className={isActive('/admin/warehouse-reports')}>
              <span className="sidebar-icon">📊</span>
              {t('warehouse_reports') || 'Warehouse Reports'}
            </Link>
            {!isCloud && (
              <Link to="/admin/sales-reports" className={isActive('/admin/sales-reports')}>
                <span className="sidebar-icon">💹</span>
                {t('sales_reports') || 'Sales Reports'}
              </Link>
            )}
            <Link to="/admin/support-reports" className={isActive('/admin/support-reports')}>
              <span className="sidebar-icon">📞</span>
              {t('support_reports') || 'Support Reports'}
            </Link>
            <Link to="/admin/activity-log" className={isActive('/admin/activity-log')}>
              <span className="sidebar-icon">📝</span>
              {t('activity_log')}
            </Link>

            {groupLabel && groupLabel(t('system') || 'System')}
            <Link to="/admin/settings" className={isActive('/admin/settings')}>
              <span className="sidebar-icon">⚙️</span>
              {t('settings')}
            </Link>
            <Link to="/admin/users" className={isActive('/admin/users')}>
              <span className="sidebar-icon">👤</span>
              {t('users')}
            </Link>

            {divider}
            <Link to="/admin/guide" className={isActive('/admin/guide')}>
              <span className="sidebar-icon">📖</span>
              {t('system_guide') || 'System Guide'}
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
