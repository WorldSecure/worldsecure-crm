import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import { LanguageProvider, useLanguage } from './utils/LanguageContext';
import Layout from './components/Layout';
import SalesLayout from './components/SalesLayout';
import SupportLayout from './components/SupportLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Inbound from './pages/Inbound';
import Outbound from './pages/Outbound';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import SalesReports from './pages/SalesReports';
import Settings from './pages/Settings';
import ActivityLog from './pages/ActivityLog';
import Users from './pages/Users';
import SupportDashboard from './pages/SupportDashboard';
import SupportManagement from './pages/SupportManagement';
import './App.css';

// Header חדש עם הרשאות
const NewHeader = ({ activeTab }) => {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const headerRef = React.useRef(null);

  React.useEffect(() => {
    const updateHeight = () => {
      if (headerRef.current) {
        const h = headerRef.current.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--header-height', h + 'px');
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // בדיקת הרשאות למודול
  const hasModuleAccess = (module) => {
    if (user?.role === 'admin') return true; // Admin רואה הכל
    
    switch(module) {
      case 'warehouse':
        return user?.module_warehouse === true || user?.module_warehouse === 1;
      case 'sales':
        return user?.module_sales === true || user?.module_sales === 1;
      case 'support':
        return user?.module_service === true || user?.module_service === 1;
      default:
        return false;
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div ref={headerRef} style={{
      width: '100%',
      background: 'linear-gradient(135deg, #0a3d6b 0%, #1a6fa8 100%)',
      padding: isMobile ? '0.6rem' : '1rem',
      boxSizing: 'border-box',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    }}>
      {/* Header עליון */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '0.6rem',
        padding: isMobile ? '0.5rem' : '1rem',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        <div style={{ fontSize: isMobile ? '1.1rem' : '2rem', fontWeight: '600', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          🌐 WorldSecure Business Hub
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'white', flexWrap: 'wrap' }}>
          {/* שם משתמש */}
          <span style={{ 
            padding: '0.4rem 0.8rem', 
            background: 'rgba(255,255,255,0.2)', 
            borderRadius: '50px',
            fontWeight: '600',
            fontSize: isMobile ? '0.8rem' : '1rem'
          }}>
            {user?.username || user?.email || 'משתמש'}
          </span>
          
          {/* בחירת שפה */}
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ 
              padding: isMobile ? '0.3rem 0.5rem' : '0.8rem 1.5rem',
              background: 'rgba(255,255,255,0.2)', 
              borderRadius: '50px',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: isMobile ? '0.8rem' : '1rem'
            }}
          >
            <option value="he" style={{background: '#0a3d6b', color: 'white'}}>עברית</option>
            <option value="en" style={{background: '#0a3d6b', color: 'white'}}>English</option>
            <option value="pt" style={{background: '#0a3d6b', color: 'white'}}>Português</option>
          </select>
          
          {/* כפתור יציאה */}
          <button 
            onClick={handleLogout}
            style={{
              padding: isMobile ? '0.4rem 0.8rem' : '1rem 2rem',
              background: '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '50px', 
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s',
              fontSize: isMobile ? '0.8rem' : '1rem'
            }}
            onMouseOver={(e) => e.target.style.background = '#dc2626'}
            onMouseOut={(e) => e.target.style.background = '#ef4444'}
          >
            {language === 'he' ? 'יציאה' : language === 'pt' ? 'Sair' : 'Logout'}
          </button>
        </div>
      </div>

      {/* 3 כפתורים - רק אם יש הרשאה */}
      <div style={{ display: 'flex', gap: isMobile ? '0.4rem' : '1.5rem' }}>
        {hasModuleAccess('warehouse') && (
          <a href="/" style={activeTab === 'warehouse' 
            ? buttonActiveStyle('#0a3d6b', '#083264') 
            : buttonInactiveStyle()
          }>
            📦 {language === 'he' ? 'ניהול מחסן' : language === 'pt' ? 'ARMAZÉM' : 'WAREHOUSE'}
          </a>
        )}
        
        {hasModuleAccess('sales') && window.location.hostname !== 'app.world-secure.com' && (
          <a href="/sales-portal" style={activeTab === 'sales' 
            ? buttonActiveStyle('#cc0000', '#a80000') 
            : buttonInactiveStyle()
          }>
            💰 {language === 'he' ? 'ניהול מכירות' : language === 'pt' ? 'VENDAS' : 'SALES'}
          </a>
        )}
        
        {hasModuleAccess('support') && (
          <a href="/support" style={activeTab === 'support' 
            ? buttonActiveStyle('#1a6fa8', '#135d8f') 
            : buttonInactiveStyle()
          }>
            📞 {language === 'he' ? 'תמיכה' : language === 'pt' ? 'SUPORTE' : 'SUPPORT'}
          </a>
        )}
      </div>
    </div>
  );
};

// סגנונות כפתורים
const buttonBaseStyle = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  return {
    flex: 1,
    padding: isMobile ? '0.5rem 0.3rem' : '1.2rem 0.8rem',
    color: 'white',
    fontSize: isMobile ? '0.75rem' : '1rem',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    height: isMobile ? '36px' : '48px',
    textDecoration: 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    transition: 'all 0.3s',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
};

const buttonActiveStyle = (bgColor, hoverColor) => ({
  ...buttonBaseStyle(),
  background: bgColor,
  transform: 'scale(1.05)',
  boxShadow: `0 25px 50px ${bgColor}40`,
  position: 'relative',
  outline: `4px solid ${bgColor}30`
});

const buttonInactiveStyle = () => ({
  ...buttonBaseStyle(),
  background: '#94a3b8'
});

function AppRoutes() {
  const location = useLocation();
  const { token } = useAuth();
  
  const getActiveTab = () => {
    if (location.pathname === '/' || location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/products') || location.pathname.startsWith('/suppliers') || location.pathname.startsWith('/customers') || location.pathname.startsWith('/inbound') || location.pathname.startsWith('/outbound') || location.pathname.startsWith('/reports') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/users') || location.pathname.startsWith('/activity-log')) return 'warehouse';
    if (location.pathname.startsWith('/sales-portal')) return 'sales';
    if (location.pathname.startsWith('/support')) return 'support';
    return 'warehouse';
  };

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', overflowX: 'hidden', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', display: 'flex', flexDirection: 'column' }}>
      <NewHeader activeTab={getActiveTab()} />
      
      <div style={{ width: '100%', flex: 1 }}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="customers" element={<Customers />} />
            <Route path="inbound" element={<Inbound />} />
            <Route path="outbound" element={<Outbound />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="users" element={<Users />} />
            <Route path="activity-log" element={<AdminRoute><ActivityLog /></AdminRoute>} />
          </Route>

          <Route path="/sales-portal" element={<SalesLayout />}>
            <Route index element={<Navigate to="/sales-portal/sales" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="sales" element={<Sales />} />
            <Route path="customers" element={<Customers />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="reports" element={<Reports />} />
            <Route path="sales-reports" element={<SalesReports />} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="users" element={<Users />} />
            <Route path="activity-log" element={<AdminRoute><ActivityLog /></AdminRoute>} />
          </Route>

          <Route path="/support" element={<SupportLayout />}>
            <Route index element={<Navigate to="/support/dashboard" />} />
            <Route path="dashboard" element={<SupportDashboard />} />
            <Route path="management" element={<SupportManagement />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="customers" element={<Customers />} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="users" element={<Users />} />
            <Route path="activity-log" element={<AdminRoute><ActivityLog /></AdminRoute>} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </div>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  return token ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { token, user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!token) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <AppRoutes />
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
