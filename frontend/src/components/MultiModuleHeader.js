import React from 'react';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';
import './MultiModuleHeader.css';

function MultiModuleHeader({ companyLogo, openedTabs, activeTab, toggleTab }) {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  // Dynamic title based on active tab
  const getDynamicTitle = () => {
    switch(activeTab) {
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

  const getTabLabel = (tab) => {
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
    return labels[tab][language] || labels[tab].en;
  };

  return (
    <header className="multi-module-header">
      {/* Top Bar */}
      <div className="header-top-bar">
        <div className="header-logo-section">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt="Company Logo" 
              className="header-logo-img"
            />
          )}
        </div>

        <h1 className="header-dynamic-title">{getDynamicTitle()}</h1>

        <div className="header-user-menu">
          <span className="header-username">{user?.username || user?.email}</span>
          <select
            className="header-language-selector"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="he">🇮🇱 עברית</option>
            <option value="en">🇬🇧 English</option>
            <option value="pt">🇵🇹 Português</option>
          </select>
          <button className="header-btn-logout" onClick={handleLogout}>
            {language === 'he' ? 'יציאה' : language === 'pt' ? 'Sair' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="header-tab-buttons">
        <button 
          className={`tab-button ${activeTab === 'warehouse' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeTab === 'warehouse' ? '#4CAF50' : '#e0e0e0',
            color: activeTab === 'warehouse' ? 'white' : '#333'
          }}
          onClick={() => toggleTab('warehouse')}
        >
          <span className="tab-icon">📦</span>
          {getTabLabel('warehouse')}
        </button>

        <button 
          className={`tab-button ${activeTab === 'sales' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeTab === 'sales' ? '#9C27B0' : '#e0e0e0',
            color: activeTab === 'sales' ? 'white' : '#333'
          }}
          onClick={() => toggleTab('sales')}
        >
          <span className="tab-icon">💰</span>
          {getTabLabel('sales')}
        </button>

        <button 
          className={`tab-button ${activeTab === 'support' ? 'active' : ''}`}
          style={{ 
            flex: 1,
            background: activeTab === 'support' ? '#2196F3' : '#e0e0e0',
            color: activeTab === 'support' ? 'white' : '#333'
          }}
          onClick={() => toggleTab('support')}
        >
          <span className="tab-icon">📞</span>
          {getTabLabel('support')}
        </button>
      </div>
    </header>
  );
}

export default MultiModuleHeader;
