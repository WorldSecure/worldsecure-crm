import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';
import axios from 'axios';
import './SharedHeader.css';

function SharedHeader() {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
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
    window.location.href = '/login';
  };

  // Determine which module is active based on current path
  const getActiveModule = () => {
    if (location.pathname.startsWith('/sales-portal')) return 'sales';
    if (location.pathname.startsWith('/support')) return 'support';
    return 'warehouse';
  };

  const activeModule = getActiveModule();

  // Dynamic title based on active module
  const getDynamicTitle = () => {
    switch(activeModule) {
      case 'warehouse':
        return language === 'he' ? 'ניהול מחסן' : 
               language === 'pt' ? 'GESTÃO ARMAZÉM' : 
               'WAREHOUSE MANAGEMENT';
      case 'sales':
        return language === 'he' ? 'ניהול מכירות' : 
               language === 'pt' ? 'VENDAS' : 
               'SALES MANAGEMENT';
      case 'support':
        return language === 'he' ? 'תמיכה' : 
               language === 'pt' ? 'SUPORTE' : 
               'SUPPORT';
      default:
        return 'WorldSecure ERP';
    }
  };

  const getTabLabel = (module) => {
    const labels = {
      warehouse: {
        he: 'ניהול מחסן',
        en: 'WAREHOUSE',
        pt: 'GESTÃO ARMAZÉM'
      },
      sales: {
        he: 'ניהול מכירות',
        en: 'SALES',
        pt: 'VENDAS'
      },
      support: {
        he: 'תמיכה',
        en: 'SUPPORT',
        pt: 'SUPORTE'
      }
    };
    return labels[module][language] || labels[module].en;
  };

  const handleTabClick = (module) => {
    switch(module) {
      case 'warehouse':
        if (activeModule !== 'warehouse') {
          window.open('/', '_blank');
        }
        break;
      case 'sales':
        if (activeModule !== 'sales') {
          window.open('/sales-portal', '_blank');
        }
        break;
      case 'support':
        if (activeModule !== 'support') {
          window.open('/support', '_blank');
        }
        break;
      default:
        break;
    }
  };

  return (
    <header className="shared-header">
      {/* Top Bar */}
      <div className="shared-header-top">
        <div className="shared-header-logo">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt="Company Logo" 
              className="shared-logo-img"
            />
          )}
        </div>

        <h1 className="shared-header-title">{getDynamicTitle()}</h1>

        <div className="shared-header-menu">
          <span className="shared-username">{user?.username || user?.email}</span>
          <select
            className="shared-language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="he">🇮🇱 עברית</option>
            <option value="en">🇬🇧 English</option>
            <option value="pt">🇵🇹 Português</option>
          </select>
          <button className="shared-logout-btn" onClick={handleLogout}>
            {language === 'he' ? 'יציאה' : language === 'pt' ? 'Sair' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="shared-tabs">
        <button 
          className={`shared-tab ${activeModule === 'warehouse' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeModule === 'warehouse' ? '#4CAF50' : '#e0e0e0',
            color: activeModule === 'warehouse' ? 'white' : '#333'
          }}
          onClick={() => handleTabClick('warehouse')}
        >
          <span className="shared-tab-icon">📦</span>
          {getTabLabel('warehouse')}
        </button>

        <button 
          className={`shared-tab ${activeModule === 'sales' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeModule === 'sales' ? '#9C27B0' : '#e0e0e0',
            color: activeModule === 'sales' ? 'white' : '#333'
          }}
          onClick={() => handleTabClick('sales')}
        >
          <span className="shared-tab-icon">💰</span>
          {getTabLabel('sales')}
        </button>

        <button 
          className={`shared-tab ${activeModule === 'support' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeModule === 'support' ? '#2196F3' : '#e0e0e0',
            color: activeModule === 'support' ? 'white' : '#333'
          }}
          onClick={() => handleTabClick('support')}
        >
          <span className="shared-tab-icon">📞</span>
          {getTabLabel('support')}
        </button>
      </div>
    </header>
  );
}

export default SharedHeader;
