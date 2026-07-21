import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import { LanguageProvider, useLanguage } from './utils/LanguageContext';
import Layout from './components/Layout';
import SalesLayout from './components/SalesLayout';
import SupportLayout from './components/SupportLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import Manufacturers from './pages/Manufacturers';
import Customers from './pages/Customers';
import Inbound from './pages/Inbound';
import Outbound from './pages/Outbound';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import SalesReports from './pages/SalesReports';
import SupportReports from './pages/SupportReports';
import WarehouseReports from './pages/WarehouseReports';
import Settings from './pages/Settings';
import ActivityLog from './pages/ActivityLog';
import Users from './pages/Users';
import SupportDashboard from './pages/SupportDashboard';
import SupportManagement from './pages/SupportManagement';
import AdminLayout from './components/AdminLayout';
import MobilePicker from './pages/MobilePicker';
import WarehouseGuide from './pages/WarehouseGuide';
import SupportGuide from './pages/SupportGuide';
import AdminGuide from './pages/AdminGuide';
import './App.css';

// כפתור בחירת שפה — שומר על עיצוב ה-Header במובייל ובדסקטופ
const LangPicker = ({ language, setLanguage, isMobile }) => {
  const [open, setOpen] = React.useState(false);
  const labels = { he: 'עברית', en: 'English', pt: 'Português' };

  if (!isMobile) {
    return (
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          padding: '0.8rem 1.5rem',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '50px',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '1rem'
        }}
      >
        <option value="he" style={{background: '#0a3d6b', color: 'white'}}>עברית</option>
        <option value="en" style={{background: '#0a3d6b', color: 'white'}}>English</option>
        <option value="pt" style={{background: '#0a3d6b', color: 'white'}}>Português</option>
      </select>
    );
  }

  // מובייל — כפתור בסגנון Header + MobilePicker
  return (
    <>
      <span
        onClick={() => setOpen(true)}
        style={{
          padding: '0.3rem 0.5rem',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '50px',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          userSelect: 'none'
        }}
      >
        {labels[language]} <span style={{ fontSize: '0.6rem' }}>▼</span>
      </span>
      {open && ReactDOM.createPortal(
        <div>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'white', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#d1d5db' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111' }}>
                {language === 'he' ? 'שפה' : language === 'pt' ? 'Idioma' : 'Language'}
              </span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer' }}>×</button>
            </div>
            {[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }, { value: 'pt', label: 'Português' }].map(opt => (
              <div key={opt.value} onClick={() => { setLanguage(opt.value); setOpen(false); }}
                style={{ padding: '0.9rem 1.2rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '1rem',
                  background: language === opt.value ? '#e8f5e9' : 'white',
                  color: language === opt.value ? '#1a7a3c' : '#374151',
                  fontWeight: language === opt.value ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px' }}>
                <span>{opt.label}</span>
                {language === opt.value && <span style={{ color: '#27ae60' }}>✓</span>}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

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

  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          <LangPicker language={language} setLanguage={setLanguage} isMobile={isMobile} />
          
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
        {user?.role === 'admin' && (
          <a href="/admin" style={activeTab === 'admin'
            ? buttonActiveStyle('#FF5722', '#E64A19')
            : {...buttonInactiveStyle(), background: '#FF9800'}
          }>
            👨‍💼 {language === 'he' ? 'ניהול' : language === 'pt' ? 'ADMIN' : 'ADMIN'}
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
    if (location.pathname === '/' || location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/products') || location.pathname.startsWith('/suppliers') || location.pathname.startsWith('/customers') || location.pathname.startsWith('/inbound') || location.pathname.startsWith('/outbound') || location.pathname.startsWith('/reports') || location.pathname.startsWith('/warehouse-reports') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/users') || location.pathname.startsWith('/activity-log')) return 'warehouse';
    if (location.pathname.startsWith('/sales-portal')) return 'sales';
    if (location.pathname.startsWith('/support')) return 'support';
    if (location.pathname.startsWith('/admin')) return 'admin';
    return 'warehouse';
  };

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
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
            <Route path="warehouse-reports" element={<WarehouseReports />} />
            <Route path="warehouse-guide" element={<WarehouseGuide />} />
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
            <Route path="guide" element={<SupportGuide />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="customers" element={<Customers />} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="users" element={<Users />} />
            <Route path="activity-log" element={<AdminRoute><ActivityLog /></AdminRoute>} />
          </Route>

          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Navigate to="/admin/products" />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="manufacturers" element={<Manufacturers />} />
            <Route path="customers" element={<Customers />} />
            <Route path="settings" element={<Settings />} />
            <Route path="users" element={<Users />} />
            {window.location.hostname !== 'app.world-secure.com' && (
              <Route path="reports" element={<Reports />} />
            )}
            {window.location.hostname !== 'app.world-secure.com' && (
              <Route path="sales-reports" element={<SalesReports />} />
            )}
            <Route path="support-reports" element={<SupportReports />} />
            <Route path="warehouse-reports" element={<WarehouseReports />} />
            <Route path="activity-log" element={<ActivityLog />} />
            <Route path="guide" element={<AdminGuide />} />
          </Route>

          <Route path="/login" element={<Login />} />
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
