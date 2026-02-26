import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import MultiModuleHeader from './MultiModuleHeader';
import axios from 'axios';
import './MultiModuleContainer.css';

// Import existing layouts (we'll use their sidebar/content)
import WarehouseModule from './modules/WarehouseModule';
import SalesModule from './modules/SalesModule';
import SupportModule from './modules/SupportModule';

function MultiModuleContainer() {
  const { token } = useAuth();
  const [companyLogo, setCompanyLogo] = useState(null);
  const [openedTabs, setOpenedTabs] = useState(new Set(['support'])); // Support open by default
  const [activeTab, setActiveTab] = useState('support'); // Support active by default

  useEffect(() => {
    if (token) {
      fetchCompanyLogo();
    }
  }, [token]);

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

  const toggleTab = (tab) => {
    if (activeTab === tab) {
      // Second click on active tab - close it
      const newSet = new Set(openedTabs);
      newSet.delete(tab);
      setOpenedTabs(newSet);
      
      // Set another tab as active if available
      if (newSet.size > 0) {
        setActiveTab([...newSet][0]);
      }
    } else if (openedTabs.has(tab)) {
      // Tab is open but not active - make it active
      setActiveTab(tab);
    } else {
      // Tab is closed - open it and make it active
      const newSet = new Set(openedTabs);
      newSet.add(tab);
      setOpenedTabs(newSet);
      setActiveTab(tab);
    }
  };

  return (
    <div className="multi-module-container">
      <MultiModuleHeader
        companyLogo={companyLogo}
        openedTabs={openedTabs}
        activeTab={activeTab}
        toggleTab={toggleTab}
      />

      <div className="modules-container">
        {openedTabs.has('warehouse') && (
          <div className={`module-wrapper ${activeTab === 'warehouse' ? 'active' : 'hidden'}`}>
            <WarehouseModule />
          </div>
        )}

        {openedTabs.has('sales') && (
          <div className={`module-wrapper ${activeTab === 'sales' ? 'active' : 'hidden'}`}>
            <SalesModule />
          </div>
        )}

        {openedTabs.has('support') && (
          <div className={`module-wrapper ${activeTab === 'support' ? 'active' : 'hidden'}`}>
            <SupportModule />
          </div>
        )}
      </div>
    </div>
  );
}

export default MultiModuleContainer;
