import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import { LanguageProvider } from './utils/LanguageContext';
import Layout from './components/Layout';
import SalesLayout from './components/SalesLayout';
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
import './App.css';

function PrivateRoute({ children }) {
  const { token, loading } = useAuth();
  
  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }
  
  return token ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { token, user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }
  
  if (!token) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* מסך מחסן ראשי */}
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
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
              <Route path="activity-log" element={<ActivityLog />} />
              <Route path="*" element={<div className="card"><h3>דף לא נמצא</h3><p>הדף המבוקש אינו קיים</p></div>} />
            </Route>

            {/* פורטל מכירות - טאב נפרד */}
            <Route path="/sales-portal" element={<PrivateRoute><SalesLayout /></PrivateRoute>}>
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
            </Route>
          </Routes>
  );
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
