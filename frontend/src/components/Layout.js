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
    <div>
      <div className="main-layout">
        <aside className="sidebar">
          <nav>
            <Link to="/dashboard" className={isActive('/dashboard')}>
              <span className="sidebar-icon">📊</span>
              {t('dashboard')}
            </Link>


            
            {/* Warehouse Module */}
            {hasModuleAccess('warehouse') && (
              <>
                <Link to="/inbound" className={isActive('/inbound')}>
                  <span className="sidebar-icon">⬇️</span>
                  {t('inbound')}
                </Link>
                
                <Link to="/outbound" className={isActive('/outbound')}>
                  <span className="sidebar-icon">⬆️</span>
                  {t('outbound')}
                </Link>
                
                <Link to="/products" className={isActive('/products')}>
                  <span className="sidebar-icon">📦</span>
                  {t('products')}
                </Link>
                

              </>
            )}
            
          
            {/* suppliers - admin only */}
                {user?.role === 'admin' && (
                <Link to="/suppliers" className={isActive('/suppliers')}>
                  <span className="sidebar-icon">🏭</span>
                  {t('suppliers')}
                </Link>
                )}
                
               {/* customers - admin only */}
               {user?.role === 'admin' && (
                <Link to="/customers" className={isActive('/customers')}>
                  <span className="sidebar-icon">👥</span>
                  {t('customers')}
                </Link>
           )}
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
           
            {/* Reports - admin only */}
            {user?.role === 'admin' && (
            <Link to="/reports" className={isActive('/reports')}>
              <span className="sidebar-icon">📦</span>
              {t('Warehouse Reports')}
            </Link>
            )}
            
            {/* Activity Log - admin only */}
            {user?.role === 'admin' && (
              <Link to="/activity-log" className={isActive('/activity-log')}>
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

export default Layout;
