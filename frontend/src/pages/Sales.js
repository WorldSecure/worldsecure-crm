import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import NewOutboundModal from '../components/NewOutboundModal';

function Sales() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showProformaLanguageModal, setShowProformaLanguageModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('EUR');
  
  const [formData, setFormData] = useState({
    customer_id: '',
    notes: '',
    items: [],
    qr_code_id: null
  });

  const [qrCodes, setQrCodes] = useState([]);

  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    quantity: 1,
    unit_price: ''
  });

  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [stagesQuote, setStagesQuote] = useState(null);
  const [stages, setStages] = useState([]);
  const [showLCModal, setShowLCModal] = useState(false);
  const [lcNumber, setLcNumber] = useState('');
  const [lcLang, setLcLang] = useState('pt');
  const [editingProforma, setEditingProforma] = useState(false);
  const [proformaQuoteId, setProformaQuoteId] = useState(null); // איזו גרסה להשתמש
  const [showVersionSelectModal, setShowVersionSelectModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [outboundList, setOutboundList] = useState([]);
  const [showNewOutboundModal, setShowNewOutboundModal] = useState(false);
  const [deliveryLang, setDeliveryLang] = useState('he');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState(null);
  const [duplicateCurrency, setDuplicateCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [expandedParents, setExpandedParents] = useState({});
  const [showCostsModal, setShowCostsModal] = useState(false);
  const [costsQuoteId, setCostsQuoteId] = useState(null);
  const [costsData, setCostsData] = useState({
    baseCurrency: 'USD',
    customs: '', customs_currency: 'USD', customs_rate: '1',
    bank: '', bank_currency: 'USD', bank_rate: '1',
    shipping: '', shipping_currency: 'USD', shipping_rate: '1',
    other: '', other_currency: 'USD', other_rate: '1',
  });
  
  // Stage 9 - File uploads
  const [showStage9Modal, setShowStage9Modal] = useState(false);
  const [stage9Files, setStage9Files] = useState([]);
  const [stage9QuoteId, setStage9QuoteId] = useState(null);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortedQuotes = () => {
    // מחזיר רק הצעות ראשיות (ללא parent_id)
    const parents = quotes.filter(q => !q.parent_id);
    return [...parents].sort((a, b) => {
      let valA, valB;
      if (sortBy === 'id') { valA = a.id; valB = b.id; }
      else if (sortBy === 'customer') { valA = a.customer_name?.toLowerCase(); valB = b.customer_name?.toLowerCase(); }
      else if (sortBy === 'date') { valA = new Date(a.created_at); valB = new Date(b.created_at); }
      else if (sortBy === 'total') { valA = a.total; valB = b.total; }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // מחזיר גרסאות מטבע של הצעה
  const getQuoteVersions = (parentId) => quotes.filter(q => q.parent_id === parentId);

  const handleOpenDuplicate = (quoteId) => {
    setDuplicateSourceId(quoteId);
    setDuplicateCurrency('USD');
    setExchangeRate('1');
    setShowDuplicateModal(true);
  };

  const handleConfirmDuplicate = async () => {
    const rate = parseFloat(exchangeRate);
    if (!rate || rate <= 0) {
      alert('יש להזין שער המרה תקין');
      return;
    }
    try {
      await axios.post(`/api/quotes/${duplicateSourceId}/duplicate`, { currency: duplicateCurrency, exchangeRate: rate });
      setShowDuplicateModal(false);
      setExpandedParents(prev => ({ ...prev, [duplicateSourceId]: true }));
      fetchData();
    } catch (err) {
      alert(t('error') + ': ' + err.message);
    }
  };

  const toggleExpanded = (parentId) => {
    setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return <span style={{ marginRight: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [quotesRes, customersRes, productsRes, qrRes] = await Promise.all([
        axios.get('/api/quotes'),
        axios.get('/api/customers'),
        axios.get('/api/products'),
        axios.get('/api/qr-codes').catch(() => ({ data: [] }))
      ]);
      
      setQuotes(quotesRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
      // המר פורמט DB לפורמט dropdown
      const qrList = (qrRes.data || []).map(qr => ({
        id: qr.id,
        type: qr.type,
        title: qr.title || `QR #${qr.id} - ${qr.type}`
      }));
      setQrCodes(qrList);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handleNewQuote = () => {
    setShowCurrencyModal(true);
  };

  const handleGenerateProforma = (quoteId) => {
    setSelectedQuoteId(quoteId);
    setShowProformaLanguageModal(true);
  };

  const handleProformaWithLanguage = async (lang) => {
    setShowProformaLanguageModal(false);
    try {
      const response = await axios.get(`/api/quotes/${selectedQuoteId}/proforma?lang=${lang}&token=${encodeURIComponent(localStorage.getItem('token') || '')}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const newWindow = window.open('', '_blank');
      newWindow.document.write(response.data);
      newWindow.document.close();
    } catch (error) {
      alert('שגיאה בפתיחת המסמך: ' + error.message);
    }
  };


  const openProformaInvoice = async (quoteId, lang, lcNum) => {
    try {
      const response = await axios.get(`/api/quotes/${quoteId}/proforma-invoice?lang=${lang}${lcNum ? `&lc_number=${encodeURIComponent(lcNum)}` : ''}&token=${encodeURIComponent(localStorage.getItem('token') || '')}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const newWindow = window.open('', '_blank');
      newWindow.document.write(response.data);
      newWindow.document.close();
    } catch (error) {
      alert('שגיאה בפתיחת המסמך: ' + error.message);
    }
  };
  const handleEditQuote = async (quote) => {
    try {
      // Fetch quote details with items
      const response = await axios.get(`/api/quotes/${quote.id}/details`);
      const quoteDetails = response.data;
      
      // Set form data with existing quote data
      setFormData({
        customer_id: quoteDetails.customer_id,
        notes: quoteDetails.notes || '',
        items: quoteDetails.items.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total
        }))
      });
      
      setSelectedCurrency(quoteDetails.currency);
      setEditingQuoteId(quote.id);
      setShowQuoteModal(true);
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteQuote = async (quoteId) => {
    if (!window.confirm(t('confirm_delete_quote'))) {
      return;
    }

    try {
      await axios.delete(`/api/quotes/${quoteId}`);
      alert(t('success'));
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCurrencySelect = (currency) => {
    setSelectedCurrency(currency);
    setShowCurrencyModal(false);
    setShowQuoteModal(true);
  };

  const handleAddItem = () => {
    if (!currentItem.product_id || currentItem.quantity <= 0 || currentItem.unit_price <= 0) {
      alert(t('error') + ': ' + t('fill_all_fields'));
      return;
    }

    const product = products.find(p => p.id === parseInt(currentItem.product_id));
    
    if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = {
        ...currentItem,
        product_name: product.name,
        product_sku: product.sku,
        total: currentItem.quantity * currentItem.unit_price
      };
      setFormData({
        ...formData,
        items: updatedItems
      });
      setEditingItemIndex(null);
    } else {
      // Add new item
      setFormData({
        ...formData,
        items: [...formData.items, {
          ...currentItem,
          product_name: product.name,
          product_sku: product.sku,
          total: currentItem.quantity * currentItem.unit_price
        }]
      });
    }

    setCurrentItem({
      product_id: '',
      quantity: 1,
      unit_price: ''
    });
  };

  const handleEditItem = (index) => {
    const item = formData.items[index];
    setCurrentItem({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
    setEditingItemIndex(index);
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const calculateGrandTotal = () => {
    const total = formData.items.reduce((sum, item) => sum + item.total, 0);
    return formatNumber(total);
  };

  const formatNumber = (num) => {
    return parseFloat(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.items.length === 0) {
      alert(t('error') + ': ' + t('select_at_least_one'));
      return;
    }

    if (!formData.customer_id) {
      alert(t('error') + ': ' + t('select_customer'));
      return;
    }

    try {
      const customer = customers.find(c => c.id === parseInt(formData.customer_id));
      
      if (editingQuoteId) {
        // Update existing quote
        await axios.put(`/api/quotes/${editingQuoteId}`, {
          customer_id: formData.customer_id,
          customer_name: customer.name,
          currency: selectedCurrency,
          items: formData.items,
          notes: formData.notes,
          qr_code_id: formData.qr_code_id
        });
      } else {
        // Create new quote
        await axios.post('/api/quotes', {
          customer_id: formData.customer_id,
          customer_name: customer.name,
          currency: selectedCurrency,
          items: formData.items,
          notes: formData.notes,
          qr_code_id: formData.qr_code_id
        });
      }

      alert(t('success'));
      setShowQuoteModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      customer_id: '',
      notes: '',
      items: [],
      qr_code_id: null
    });
    setCurrentItem({
      product_id: '',
      quantity: 1,
      unit_price: ''
    });
    setEditingItemIndex(null);
    setEditingQuoteId(null);
  };

  const handleUpdateStatus = async (quoteId, status) => {
    try {
      await axios.put(`/api/quotes/${quoteId}/status`, { status });
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'closed') {
      return <span style={{ background: '#cce5ff', color: '#004085', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 600 }}>🎉 {t('deal_closed_badge')}</span>;
    }
    if (status === 'approved') {
      return <span style={{ background: '#d4edda', color: '#155724', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 600 }}>🟢 {t('status_approved') || 'מאושרת'}</span>;
    }
    return <span style={{ background: '#fff3cd', color: '#856404', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 600 }}>🟡 {t('status_pending') || 'ממתינה'}</span>;
  };

  const handleOpenStages = async (quote) => {
    setStagesQuote(quote);
    try {
      const res = await axios.get(`/api/quotes/${quote.id}/stages`);
      setStages(res.data);
    } catch (e) {
      setStages([]);
    }
    setShowStagesModal(true);
  };

  const handleApproveStage = async (stageNumber) => {
    try {
      await axios.post(`/api/quotes/${stagesQuote.id}/stages/${stageNumber}/approve`);
      const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(res.data);
    } catch (e) {
      alert(t('error') + ': ' + e.message);
    }
  };

  const handleCreateProformaInvoice = async () => {
    openProformaInvoice(proformaQuoteId, lcLang, lcNumber);
    await axios.post(`/api/quotes/${stagesQuote.id}/stages/3/approve`, { lc_number: lcNumber, doc_lang: lcLang, proforma_quote_id: proformaQuoteId });
    
    // Check stock after approving stage 3
    try {
      const stockCheck = await axios.post(`/api/quotes/${stagesQuote.id}/check-stock`);
      if (stockCheck.data.hasShortage) {
        const shortageList = stockCheck.data.alerts.map(a => 
          `${a.product_name}: ${a.shortage} ${t('units')} (${t('need')} ${a.required}, ${t('have')} ${a.available})`
        ).join('\n');
        alert(`⚠️ ${t('stock_shortage')}!\n\n${shortageList}`);
      }
    } catch (e) {
      console.error('Stock check error:', e);
    }
    
    const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(res.data);
    setShowLCModal(false);
    setLcNumber('');
  };

  // בודק אם יש גרסאות מטבע - אם כן פותח בחירה, אחרת ישירות למודאל
  const handleOpenStage3 = () => {
    const versions = getQuoteVersions(stagesQuote.id);
    if (versions.length > 0) {
      setProformaQuoteId(stagesQuote.id); // ברירת מחדל - ההצעה הראשית
      setShowVersionSelectModal(true);
    } else {
      setProformaQuoteId(stagesQuote.id);
      setLcNumber('');
      setShowLCModal(true);
    }
  };

  const handleEditProforma = (stageData) => {
    setProformaQuoteId(stagesQuote.id);
    setLcNumber(stageData.lc_number || '');
    setLcLang(stageData.doc_lang || 'pt');
    setShowLCModal(true);
    setEditingProforma(true);
  };

  const handleUpdateProforma = async () => {
    await axios.put(`/api/quotes/${stagesQuote.id}/stages/3/proforma`, { lc_number: lcNumber, doc_lang: lcLang, proforma_quote_id: proformaQuoteId });
    openProformaInvoice(proformaQuoteId, lcLang, lcNumber);
    const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(res.data);
    setShowLCModal(false);
    setEditingProforma(false);
  };

  const handleDeleteProforma = async () => {
    if (!window.confirm('למחוק את ה-Proforma Invoice? שלב 4 יינעל מחדש.')) return;
    await axios.delete(`/api/quotes/${stagesQuote.id}/stages/3/proforma`);
    const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(res.data);
  };

  const handleBLUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('bl_file', file);
      await axios.post(`/api/quotes/${stagesQuote.id}/stages/5/bl-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(refreshed.data);
    } catch (err) {
      alert('שגיאה בהעלאת B/L: ' + err.message);
    }
  };

  const handleOpenDeliveryModal = async () => {
    try {
      const res = await axios.get('/api/outbound');
      setOutboundList(res.data);
    } catch (e) {
      setOutboundList([]);
    }
    setShowDeliveryModal(true);
  };

  const handleLinkDelivery = async (outboundId) => {
    try {
      await axios.post(`/api/quotes/${stagesQuote.id}/stages/5/link-delivery`, { 
        outbound_id: outboundId, 
        delivery_lang: deliveryLang 
      });
      
      // Refresh stages
      const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(refreshed.data);
      
      // Refresh outbound list to get updated status from DB
      const outboundRes = await axios.get('/api/outbound');
      setOutboundList(outboundRes.data);
      
      // Close modal after a short delay so user sees the update
      setTimeout(() => {
        setShowDeliveryModal(false);
      }, 800);
    } catch (err) {
      alert('שגיאה: ' + err.message);
    }
  };

  const handleUnlinkDelivery = async () => {
    if (!window.confirm('לנתק את תעודת המשלוח?')) return;
    await axios.delete(`/api/quotes/${stagesQuote.id}/stages/5/link-delivery`);
    const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(refreshed.data);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
  };

  const handleStage5Upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('הקובץ גדול מ-10MB'); return; }
    if (!file.type.includes('pdf')) { alert('יש להעלות קובץ PDF בלבד'); return; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`/api/quotes/${stagesQuote.id}/stages/6/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(refreshed.data);
    } catch (err) {
      alert('שגיאה בהעלאה: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStage5Delete = async () => {
    if (!window.confirm('למחוק את ה-Commercial Invoice?')) return;
    await axios.delete(`/api/quotes/${stagesQuote.id}/stages/6/upload`);
    const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(refreshed.data);
  };

  const handleStage6Upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('הקובץ גדול מ-10MB'); return; }
    if (!file.type.includes('pdf')) { alert('יש להעלות קובץ PDF בלבד'); return; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`/api/quotes/${stagesQuote.id}/stages/7/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(refreshed.data);
      fetchData(); // מרענן גם את טבלת ההצעות
    } catch (err) {
      alert('שגיאה בהעלאה: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStage6Delete = async () => {
    if (!window.confirm('למחוק את הוכחת התשלום? העסקה תחזור לסטטוס מאושרת.')) return;
    await axios.delete(`/api/quotes/${stagesQuote.id}/stages/7/upload`);
    const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
    setStages(refreshed.data);
    fetchData();
  };

  // ===== STAGE 9 FUNCTIONS =====
  
  const handleOpenStage9 = async (quoteId) => {
    setStage9QuoteId(quoteId);
    // Fetch existing files
    try {
      const res = await axios.get(`/api/quotes/${quoteId}/stages/9/files`);
      setStage9Files(res.data);
    } catch (err) {
      setStage9Files([]);
    }
    setShowStage9Modal(true);
  };

  const handleStage9Upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      await axios.post(`/api/quotes/${stage9QuoteId}/stages/9/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Refresh file list
      const res = await axios.get(`/api/quotes/${stage9QuoteId}/stages/9/files`);
      setStage9Files(res.data);
      
      alert('קובץ הועלה בהצלחה!');
    } catch (err) {
      alert('שגיאה בהעלאת קובץ: ' + err.message);
    }
    
    // Reset file input
    e.target.value = '';
  };

  const handleStage9DeleteFile = async (fileId) => {
    if (!window.confirm('למחוק את הקובץ?')) return;
    
    try {
      await axios.delete(`/api/quotes/${stage9QuoteId}/stages/9/files/${fileId}`);
      
      // Refresh file list
      const res = await axios.get(`/api/quotes/${stage9QuoteId}/stages/9/files`);
      setStage9Files(res.data);
      
      alert('קובץ נמחק בהצלחה');
    } catch (err) {
      alert('שגיאה במחיקת קובץ: ' + err.message);
    }
  };

  const handleStage9EditFile = async (e, fileId) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Delete old file and upload new one
    try {
      await axios.delete(`/api/quotes/${stage9QuoteId}/stages/9/files/${fileId}`);
      
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`/api/quotes/${stage9QuoteId}/stages/9/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Refresh file list
      const res = await axios.get(`/api/quotes/${stage9QuoteId}/stages/9/files`);
      setStage9Files(res.data);
      
      alert('קובץ הוחלף בהצלחה!');
    } catch (err) {
      alert('שגיאה בהחלפת קובץ: ' + err.message);
    }
    
    // Reset file input
    e.target.value = '';
  };

  const handleStage9Complete = async () => {
    if (!window.confirm('לסיים שלב 9 ולסגור את העסקה?')) return;
    
    try {
      await axios.post(`/api/quotes/${stage9QuoteId}/stages/9/complete`);
      
      // Refresh stages and quotes
      const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
      setStages(refreshed.data);
      await fetchData();
      
      setShowStage9Modal(false);
      setShowStagesModal(false);
      
      alert('🎉 שלב 9 הושלם! העסקה נסגרה בהצלחה!');
    } catch (err) {
      alert('שגיאה בסיום שלב 9: ' + err.message);
    }
  };

  const getStageData = (stageNumber) => {
    return stages.find(s => s.stage_number === stageNumber) || null;
  };

  const isStageUnlocked = (stageNumber) => {
    if (stageNumber === 1) return true; // שלב 1 תמיד מאושר כשהצעה מאושרת
    if (stageNumber === 2) return true; // שלב 2 פעיל אחרי אישור הצעה
    
    // שלב 9 פעיל אם שלב 8 הושלם (waiting_for_files או approved)
    if (stageNumber === 9) {
      const stage8 = getStageData(8);
      return stage8?.status === 'waiting_for_files' || stage8?.status === 'approved';
    }
    
    // שלב N פעיל רק אם שלב N-1 מאושר
    return getStageData(stageNumber - 1)?.status === 'approved';
  };

  const formatApprovedAt = (isoDate) => {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const STAGE_DEFINITIONS = [
    { number: 1, name: 'Quotation',          action: null },
    { number: 2, name: 'Quote Approval',     action: 'approve' },
    { number: 3, name: 'Proforma Invoice',   action: 'create' },
    { number: 4, name: 'Commercial Contract', action: 'contract' },
    { number: 5, name: 'B/L + Packing List', action: 'upload_create' },
    { number: 6, name: 'Commercial Invoice', action: 'upload' },
    { number: 7, name: 'Payment Proof',      action: 'upload_file' },
    { number: 8, name: 'Additional Costs',   action: 'costs' },
    { number: 9, name: 'Additional Costs Upload', action: 'upload_costs_files' },
  ];

  if (loading) {
    return <div>{t('loading')}</div>;
  }

  const currencies = [
    { code: 'EUR', symbol: '💶', name: t('currency_eur') },
    { code: 'USD', symbol: '💵', name: t('currency_usd') },
    { code: 'ILS', symbol: '₪', name: t('currency_ils') },
    { code: 'AOA', symbol: 'AOA', name: t('currency_aoa'), flag: '🇦🇴' },
    { code: 'KES', symbol: 'KES', name: t('currency_kes'), flag: '🇰🇪' }
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">💰 {t('sales_management')}</h2>
        <button className="btn btn-primary" onClick={handleNewQuote}>
          ➕ {t('new_quote')}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('quotes_list')}</h3>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => handleSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <SortIcon column="id" />{t('quote_number')}
                </th>
                <th onClick={() => handleSort('customer')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <SortIcon column="customer" />{t('customer')}
                </th>
                <th onClick={() => handleSort('total')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <SortIcon column="total" />{t('total')}
                </th>
                <th>{t('currency')}</th>
                <th>{t('status') || 'סטטוס'}</th>
                <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <SortIcon column="date" />{t('date')}
                </th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center">{t('no_quotes_yet')}</td>
                </tr>
              ) : (
                getSortedQuotes().map(quote => {
                  const versions = getQuoteVersions(quote.id);
                  const isExpanded = expandedParents[quote.id];
                  return (
                  <React.Fragment key={quote.id}>
                    <tr style={{ background: versions.length > 0 ? '#f0f7ff' : 'white' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {versions.length > 0 && (
                          <button onClick={() => toggleExpanded(quote.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        #{quote.id}
                      </div>
                    </td>
                    <td>{quote.customer_name}</td>
                    <td>{formatNumber(quote.total)}</td>
                    <td>{quote.currency}</td>
                    <td>{getStatusBadge(quote.status)}</td>
                    <td>{new Date(quote.created_at).toLocaleDateString()}</td>
                    <td>
                      {/* שורה 1 - מסמכים ועריכה */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                        <button
                          className="btn btn-success"
                          onClick={() => handleGenerateProforma(quote.id)}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                        >
                          📄 Pricing
                        </button>
                        {user?.role === 'admin' && (
                          <>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleEditQuote(quote)}
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                            >
                              ✏️ {t('edit')}
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleDeleteQuote(quote.id)}
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                            >
                              🗑️ {t('delete')}
                            </button>
                          </>
                        )}
                      </div>
                      {/* שורה 2 - שינוי סטטוס (ADMIN בלבד) */}
                      {user?.role === 'admin' && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn"
                            onClick={() => handleUpdateStatus(quote.id, 'approved')}
                            disabled={quote.status === 'approved'}
                            style={{
                              fontSize: '0.8rem', padding: '0.3rem 0.7rem',
                              background: quote.status === 'approved' ? '#c3e6cb' : '#28a745',
                              color: quote.status === 'approved' ? '#155724' : 'white',
                              border: 'none', borderRadius: '4px', cursor: quote.status === 'approved' ? 'default' : 'pointer'
                            }}
                          >
                            ✓ {t('approve') || 'אשר'}
                          </button>
                          <button
                            className="btn"
                            disabled={quote.status === 'pending'}
                            onClick={() => (quote.status === 'approved' || quote.status === 'closed') && handleOpenStages(quote)}
                            style={{
                              fontSize: '0.8rem', padding: '0.3rem 0.7rem',
                              background: quote.status === 'closed' ? '#28a745' : quote.status === 'approved' ? '#007bff' : '#ccc',
                              color: (quote.status === 'approved' || quote.status === 'closed') ? 'white' : '#666',
                              border: 'none', borderRadius: '4px',
                              cursor: (quote.status === 'approved' || quote.status === 'closed') ? 'pointer' : 'not-allowed',
                              opacity: quote.status === 'pending' ? 0.65 : 1
                            }}
                            title={quote.status === 'pending' ? (t('approve_quote_first') || 'יש לאשר את ההצעה תחילה') : quote.status === 'closed' ? t('deal_summary') : t('manage_stages')}
                          >
                            {quote.status === 'closed' ? '🎉' : quote.status === 'approved' ? '📋' : '🔒'} {quote.status === 'closed' ? t('deal_summary') : t('manage_stages')}
                          </button>
                          <button
                            className="btn"
                            onClick={() => handleUpdateStatus(quote.id, 'pending')}
                            disabled={quote.status === 'pending'}
                            style={{
                              fontSize: '0.8rem', padding: '0.3rem 0.7rem',
                              background: quote.status === 'pending' ? '#e2e3e5' : '#6c757d',
                              color: quote.status === 'pending' ? '#6c757d' : 'white',
                              border: 'none', borderRadius: '4px', cursor: quote.status === 'pending' ? 'default' : 'pointer'
                            }}
                          >
                            ↺ {t('reset') || 'אפס'}
                          </button>
                        </div>
                      )}
                      {/* כפתור גרסת מטבע */}
                      <div style={{ marginTop: '0.3rem' }}>
                        <button
                          onClick={() => handleOpenDuplicate(quote.id)}
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: '#e8f4fd', color: '#0366d6', border: '1px solid #0366d6', borderRadius: '4px', cursor: 'pointer' }}
                          {...{title: t("create_currency_version")}}
                        >
                          💱 {t('new_currency_version') || 'גרסת מטבע'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* גרסאות מטבע */}
                  {isExpanded && versions.map(ver => (
                    <tr key={ver.id} style={{ background: '#f8f9ff', borderRight: '4px solid #0366d6' }}>
                      <td style={{ paddingRight: '2rem', color: '#0366d6', fontSize: '0.9rem' }}>↳ #{ver.id}</td>
                      <td style={{ fontSize: '0.9rem', color: '#666' }}>{ver.customer_name}</td>
                      <td style={{ fontSize: '0.9rem' }}>{formatNumber(ver.total)}</td>
                      <td><span style={{ background: '#0366d6', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{ver.currency}</span></td>
                      <td>{getStatusBadge(ver.status)}</td>
                      <td style={{ fontSize: '0.9rem', color: '#666' }}>{new Date(ver.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-success" onClick={() => handleGenerateProforma(ver.id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>📄 Pricing</button>
                          {user?.role === 'admin' && (
                            <>
                              <button className="btn btn-secondary" onClick={() => handleEditQuote(ver)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>✏️</button>
                              <button className="btn btn-danger" onClick={() => handleDeleteQuote(ver.id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>🗑️</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Currency Selection Modal */}
      {showCurrencyModal && (
        <div className="modal-overlay"> {/* onClick={() => setShowCurrencyModal(false)}> */}
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('select_currency')}</h3>
              <button className="modal-close" onClick={() => setShowCurrencyModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                {t('select_currency_for_quote')}
              </p>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {currencies.map(curr => (
                  <button
                    key={curr.code}
                    className="btn btn-primary"
                    onClick={() => handleCurrencySelect(curr.code)}
                    style={{ 
                      padding: '1rem', 
                      fontSize: '1.1rem', 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: curr.code === 'EUR' ? '#667eea' : '#3498db'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{curr.symbol}</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>{curr.name}</span>
                    {curr.flag && <span style={{ fontSize: '1.5rem' }}>{curr.flag}</span>}
                    {curr.code === 'EUR' && <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>★</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Form Modal */}
      {showQuoteModal && (
        <div className="modal-overlay"> {/*onClick={() => { setShowQuoteModal(false); resetForm(); }}>*/}
          <div className="modal" style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingQuoteId ? t('edit_quote') : t('new_quote')} - {selectedCurrency}
              </h3>
              <button className="modal-close" onClick={() => { setShowQuoteModal(false); resetForm(); }}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Customer Selection */}
              <div className="form-group">
                <label className="form-label">{t('select_customer')} *</label>
                <select
                  className="form-select"
                  value={formData.customer_id}
                  onChange={(e) => setFormData({...formData, customer_id: e.target.value})}
                  required
                >
                  <option value="">{t('select_customer')}</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>

              {/* Add Items Section */}
              <div className="card" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa' }}>
                <h4 style={{ marginBottom: '1rem' }}>{t('add_items')}</h4>
                
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">{t('select_product')}</label>
                    <select
                      className="form-select"
                      value={currentItem.product_id}
                      onChange={(e) => setCurrentItem({...currentItem, product_id: e.target.value})}
                    >
                      <option value="">{t('select_product')}</option>
                      {products.filter(p => !p.is_parent && (p.is_active === 1 || p.is_active === true || p.is_active == null)).map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.quantity > 0 ? `🟢 ${product.quantity}` : `🔴 ${product.quantity}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('quantity')}</label>
                    <input
                      type="number"
                      className="form-input"
                      value={currentItem.quantity}
                      onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value})}
                      min="1"
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('unit_price')} ({selectedCurrency})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      value={currentItem.unit_price}
                      onChange={(e) => setCurrentItem({...currentItem, unit_price: e.target.value})}
                      onBlur={(e) => {
                        if (e.target.value) {
                          setCurrentItem({...currentItem, unit_price: parseFloat(e.target.value).toFixed(2)});
                        }
                      }}
                      placeholder="0.00"
                      style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem' }}
                    />
                  </div>
                </div>

                <button 
                  type="button"
                  className="btn btn-success"
                  onClick={handleAddItem}
                >
                  {editingItemIndex !== null ? t('update_item') : '➕ ' + t('add_item')}
                </button>
              </div>

              {/* Items List */}
              {formData.items.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4>{t('items_in_quote')} ({formData.items.length})</h4>
                  <table className="table" style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>{t('sku')}</th>
                        <th>{t('name')}</th>
                        <th>{t('quantity')}</th>
                        <th>{t('unit_price')}</th>
                        <th>{t('total')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.product_sku}</td>
                          <td>{item.product_name}</td>
                          <td><span className="badge badge-info">{item.quantity}</span></td>
                          <td>{formatNumber(item.unit_price)} {selectedCurrency}</td>
                          <td><strong>{formatNumber(item.total)} {selectedCurrency}</strong></td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button 
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleEditItem(index)}
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              >
                                ✏️
                              </button>
                              <button 
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleRemoveItem(index)}
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="total-row" style={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                        <td colSpan="4" style={{ textAlign: 'right' }}>{t('grand_total')}:</td>
                        <td colSpan="2" style={{ fontSize: '1.2rem' }}>
                          {calculateGrandTotal()} {selectedCurrency}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes */}
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">{t('notes')}</label>
                <textarea
                  className="form-textarea"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={t('additional_notes')}
                  rows="3"
                />
              </div>

              {/* QR Code Selection */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">📱 {t('add_qr_code') || 'הוסף קוד QR'}</label>
                <select
                  className="form-input"
                  value={formData.qr_code_id || ''}
                  onChange={(e) => setFormData({...formData, qr_code_id: e.target.value ? parseInt(e.target.value) : null})}
                >
                  <option value="">{qrCodes.length === 0 ? (t('no_qr_codes_created') || 'לא יוצרו קודי QR עדיין') : (t('select_qr_code') || 'בחר קוד QR')}</option>
                  {qrCodes.map((qr, index) => (
                    <option key={qr.id} value={qr.id}>
                      QR #{index + 1} - {qr.type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => { setShowQuoteModal(false); resetForm(); }}
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={formData.items.length === 0}
                >
                  💾 {t('save_quote')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proforma Language Selection Modal */}
      {showProformaLanguageModal && (
        <div className="modal-overlay"> {/*onClick={() => setShowProformaLanguageModal(false)}>*/}
          <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📄 Proforma</h3>
              <button className="modal-close" onClick={() => setShowProformaLanguageModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                {t('select_language_for_proforma')}
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleProformaWithLanguage('he')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇮🇱 עברית
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleProformaWithLanguage('en')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇬🇧 English
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleProformaWithLanguage('pt')}
                  style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                >
                  🇵🇹 Português
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Stages Modal */}
      {showStagesModal && stagesQuote && (
        <div className="modal-overlay"> {/*onClick={() => setShowStagesModal(false)}>*/}
          <div className="modal" style={{ maxWidth: '750px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {stagesQuote.status === 'closed' ? `🎉 ${t('deal_summary')}` : `📋 ${t('manage_stages')}`} - {t('quote') || 'Quote'} #{stagesQuote.id} | {stagesQuote.customer_name}
              </h3>
              <button className="modal-close" onClick={() => setShowStagesModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {stagesQuote.status === 'closed' && (
                <div style={{
                  background: 'linear-gradient(135deg, #d4edda, #c3e6cb)',
                  border: '2px solid #28a745', borderRadius: '8px',
                  padding: '1rem', marginBottom: '1rem', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>🎉</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#155724' }}>{t('deal_closed')}</div>
                  <div style={{ color: '#155724', fontSize: '0.9rem', marginTop: '0.3rem' }}>
                    {t('all_stages_done') || 'All 8 stages completed successfully'}
                  </div>
                </div>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>{t('stage')}</th>
                    <th>{t('document')}</th>
                    <th>{t('status')}</th>
                    <th>{t('approved_by')}</th>
                    <th>{t('date')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_DEFINITIONS.map(stage => {
                    const data = getStageData(stage.number);
                    const unlocked = isStageUnlocked(stage.number);
                    const approved = data?.status === 'approved' || data?.status === 'completed';

                    return (
                      <tr key={stage.number} style={{ background: approved ? '#f0fff4' : unlocked ? '#fff' : '#fafafa' }}>
                        <td><strong>{stage.number}</strong></td>
                        <td>{stage.name}</td>
                        <td>
                          {approved
                            ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem' }}>{`✅ ${t('status_approved')}`}</span>
                            : unlocked
                              ? <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem' }}>{`⏳ ${t('pending') || 'Pending'}`}</span>
                              : <span style={{ background: '#e2e3e5', color: '#6c757d', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem' }}>{`🔒 ${t('locked')}`}</span>
                          }
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {data?.approved_by ? `${data.approved_by}` : '-'}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{formatApprovedAt(data?.approved_at)}</td>
                        <td>
                          {stage.action === 'approve' && !approved && unlocked && (
                            <button
                              className="btn"
                              onClick={() => handleApproveStage(stage.number)}
                              style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                              ✓ APPROVE
                            </button>
                          )}
                          {stage.action === 'approve' && approved && (
                            <span style={{ color: '#28a745', fontSize: '0.8rem' }}>{`✅ ${t('status_approved')}`}</span>
                          )}
                          {stage.action === 'create' && !approved && (
                            <button
                              disabled={!unlocked}
                              onClick={() => unlocked && handleOpenStage3()}
                              style={{
                                background: unlocked ? '#007bff' : '#ccc',
                                color: unlocked ? 'white' : '#666',
                                border: 'none', borderRadius: '4px',
                                padding: '0.3rem 0.8rem', fontSize: '0.8rem',
                                cursor: unlocked ? 'pointer' : 'not-allowed'
                              }}
                            >
                              {unlocked ? `📄 ${t('create')}` : `🔒 ${t('create')}`}
                            </button>
                          )}
                          {stage.action === 'create' && approved && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <button
                                onClick={() => openProformaInvoice(data.proforma_quote_id || stagesQuote.id, data.doc_lang || 'pt', data.lc_number)}
                                style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                📄 proforma_Q{String(data.proforma_quote_id || stagesQuote.id).padStart(3,'0')}.pdf
                                {data.proforma_quote_id && data.proforma_quote_id !== stagesQuote.id && (
                                  <span style={{ marginRight: '0.3rem', fontSize: '0.75rem', opacity: 0.85 }}>
                                    ({quotes.find(q => q.id === data.proforma_quote_id)?.currency})
                                  </span>
                                )}
                              </button>
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button
                                  onClick={() => handleEditProforma(data)}
                                  style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  {`✏️ ${t("edit")}`}
                                </button>
                                <button
                                  onClick={handleDeleteProforma}
                                  style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  {`🗑️ ${t("delete")}`}
                                </button>
                              </div>
                            </div>
                          )}
                          {stage.action === 'contract' && (() => {
                            const fileRef = data?.bl_file;
                            const fileParts = fileRef ? fileRef.split('|') : null;
                            const fileName = fileParts?.[1] || null;
                            const fileSize = fileParts?.[2] ? (parseInt(fileParts[2]) / (1024*1024)).toFixed(2) + ' MB' : null;
                            const fileDate = fileParts?.[3] ? new Date(fileParts[3]).toLocaleString('he-IL') : null;
                            const filePath = fileParts?.[0] || null;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {!approved ? (
                                  <label style={{ cursor: unlocked ? 'pointer' : 'not-allowed' }}>
                                    <input
                                      type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                                      disabled={!unlocked}
                                      onChange={async (e) => {
                                        if (!e.target.files[0]) return;
                                        const fd = new FormData();
                                        fd.append('file', e.target.files[0]);
                                        await axios.post(`/api/quotes/${stagesQuote.id}/stages/4/contract-upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                                        const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
                                        setStages(res.data);
                                      }}
                                    />
                                    <span style={{
                                      display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '4px', fontSize: '0.8rem',
                                      background: unlocked ? '#007bff' : '#ccc', color: unlocked ? 'white' : '#666',
                                      cursor: unlocked ? 'pointer' : 'not-allowed'
                                    }}>
                                      {unlocked ? `📎 ${t('upload_contract')}` : `🔒 ${t('locked')}`}
                                    </span>
                                  </label>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <a href={`http://localhost:3001${filePath}`} target="_blank" rel="noreferrer"
                                      style={{ color: '#28a745', fontWeight: 500, fontSize: '0.85rem', textDecoration: 'none' }}>
                                      📄 {fileName}
                                    </a>
                                    {fileDate && <span style={{ fontSize: '0.75rem', color: '#888' }}>📅 {fileDate}</span>}
                                    {fileSize && <span style={{ fontSize: '0.75rem', color: '#888' }}>💾 {fileSize}</span>}
                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                      <label style={{ cursor: 'pointer' }}>
                                        <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                                          onChange={async (e) => {
                                            if (!e.target.files[0]) return;
                                            const fd = new FormData();
                                            fd.append('file', e.target.files[0]);
                                            await axios.post(`/api/quotes/${stagesQuote.id}/stages/4/contract-upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                                            const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
                                            setStages(res.data);
                                          }}
                                        />
                                        <span style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>{`✏️ ${t('replace') || 'החלף'}`}</span>
                                      </label>
                                      {user?.role === 'admin' && (
                                        <button onClick={async () => {
                                          await axios.delete(`/api/quotes/${stagesQuote.id}/stages/4/contract-upload`);
                                          const res = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
                                          setStages(res.data);
                                        }} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                          {`🗑️ ${t("delete")}`}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {stage.action === 'upload_create' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {/* כפתור העלאת B/L */}
                              {data?.bl_approved ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                  <a
                                    href={`http://localhost:3001${data.bl_file?.split('|')[0]}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: '#28a745', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' }}
                                  >
                                    📄 {data.bl_file?.split('|')[1] || 'B/L הועלה'}
                                  </a>
                                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    <label style={{
                                      background: '#6c757d', color: 'white',
                                      border: 'none', borderRadius: '4px',
                                      padding: '0.25rem 0.6rem', fontSize: '0.75rem',
                                      cursor: 'pointer', display: 'inline-block'
                                    }}>
                                      {`✏️ ${t("edit")}`}
                                      <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleBLUpload} />
                                    </label>
                                    <button
                                      onClick={async () => {
                                        if (!window.confirm(t('delete_bl_confirm'))) return;
                                        await axios.post(`/api/quotes/${stagesQuote.id}/stages/5/bl`, { bl_file: null, reset: true });
                                        const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
                                        setStages(refreshed.data);
                                      }}
                                      style={{
                                        background: '#dc3545', color: 'white',
                                        border: 'none', borderRadius: '4px',
                                        padding: '0.25rem 0.6rem', fontSize: '0.75rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {`🗑️ ${t("delete")}`}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <label style={{
                                  background: unlocked ? '#007bff' : '#ccc',
                                  color: unlocked ? 'white' : '#666',
                                  border: 'none', borderRadius: '4px',
                                  padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                                  cursor: unlocked ? 'pointer' : 'not-allowed',
                                  display: 'inline-block'
                                }}>
                                  {unlocked ? `📎 ${t('upload_bl')}` : `🔒 ${t('upload_bl')}`}
                                  {unlocked && <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleBLUpload} />}
                                </label>
                              )}
                              {/* כפתור תעודת משלוח */}
                              {data?.delivery_approved ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                  <a
                                    href="#"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      try {
                                        const token = localStorage.getItem('token') || '';
                                        const response = await fetch(`/api/outbound/${data.outbound_id}/delivery-note?lang=${data.delivery_lang || 'he'}&token=${encodeURIComponent(token)}`, {
                                          headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                        const html = await response.text();
                                        const newWindow = window.open('', '_blank');
                                        newWindow.document.write(html);
                                        newWindow.document.close();
                                      } catch(err) { alert('שגיאה בפתיחת התעודה'); }
                                    }}
                                    rel="noreferrer"
                                    style={{ color: '#28a745', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' }}
                                  >
                                    📦 תעודת משלוח #{data.outbound_id}
                                  </a>
                                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem' }}>
                                  <button
                                    onClick={handleUnlinkDelivery}
                                    style={{
                                      background: '#dc3545', color: 'white',
                                      border: 'none', borderRadius: '4px',
                                      padding: '0.25rem 0.6rem', fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    🗑️ {t('disconnect') || 'נתק'}
                                  </button>
                                </div>
                                </div>
                              ) : (
                                <button
                                  disabled={!unlocked}
                                  onClick={() => unlocked && handleOpenDeliveryModal()}
                                  style={{
                                    background: unlocked ? '#007bff' : '#ccc',
                                    color: unlocked ? 'white' : '#666',
                                    border: 'none', borderRadius: '4px',
                                    padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                                    cursor: unlocked ? 'pointer' : 'not-allowed'
                                  }}
                                >
                                  {unlocked ? `📦 ${t('delivery_note')}` : `🔒 ${t('delivery_note')}`}
                                </button>
                              )}
                            </div>
                          )}
                          {stage.action === 'upload' && (() => {
                            const parts = data?.bl_file?.split('|') || [];
                            const [filePath, fileName, fileSize, uploadedAt] = parts;
                            return approved ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <a href={`http://localhost:3001${filePath}`} target="_blank" rel="noreferrer"
                                  style={{ color: '#28a745', fontSize: '0.8rem', textDecoration: 'underline' }}>
                                  📄 {fileName}
                                </a>
                                <span style={{ color: '#666', fontSize: '0.75rem' }}>
                                  📅 {formatApprovedAt(uploadedAt)} &nbsp; 💾 {formatFileSize(Number(fileSize))}
                                </span>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <label style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-block' }}>
                                    {`✏️ ${t("edit")}`}
                                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleStage5Upload} />
                                  </label>
                                  <button onClick={handleStage5Delete}
                                    style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    {`🗑️ ${t("delete")}`}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label style={{
                                background: unlocked ? '#007bff' : '#ccc',
                                color: unlocked ? 'white' : '#666',
                                border: 'none', borderRadius: '4px',
                                padding: '0.3rem 0.8rem', fontSize: '0.8rem',
                                fontWeight: 'bold', cursor: unlocked ? 'pointer' : 'not-allowed',
                                display: 'inline-block'
                              }}>
                                {unlocked ? `📎 ${t('upload_document')}` : `🔒 ${t('upload_document')}`}
                                {unlocked && <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleStage5Upload} />}
                              </label>
                            );
                          })()}
                          {stage.action === 'upload_file' && (() => {
                            const parts = data?.bl_file?.split('|') || [];
                            const [filePath, fileName, fileSize, uploadedAt] = parts;
                            return approved ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <a href={`http://localhost:3001${filePath}`} target="_blank" rel="noreferrer"
                                  style={{ color: '#28a745', fontSize: '0.8rem', textDecoration: 'underline' }}>
                                  📄 {fileName}
                                </a>
                                <span style={{ color: '#666', fontSize: '0.75rem' }}>
                                  📅 {formatApprovedAt(uploadedAt)} &nbsp; 💾 {formatFileSize(Number(fileSize))}
                                </span>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <label style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-block' }}>
                                    {`✏️ ${t("edit")}`}
                                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleStage6Upload} />
                                  </label>
                                  <button onClick={handleStage6Delete}
                                    style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    {`🗑️ ${t("delete")}`}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label style={{
                                background: unlocked ? '#007bff' : '#ccc',
                                color: unlocked ? 'white' : '#666',
                                border: 'none', borderRadius: '4px',
                                padding: '0.3rem 0.8rem', fontSize: '0.8rem',
                                fontWeight: 'bold', cursor: unlocked ? 'pointer' : 'not-allowed',
                                display: 'inline-block'
                              }}>
                                {unlocked ? `💳 ${t('upload_payment')}` : `🔒 ${t('upload_payment')}`}
                                {unlocked && <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleStage6Upload} />}
                              </label>
                            );
                          })()}
                          {stage.action === 'costs' && (() => {
                            const stage7 = stages.find(s => s.stage_number === 7);
                            const stage7Done = stage7?.bl_file || stage7?.status === 'completed';
                            // Stage 8 is "done" when it has waiting_for_files or approved status
                            const stage8Done = data?.status === 'waiting_for_files' || data?.status === 'approved';
                            return stage8Done ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <span style={{ color: '#2196F3', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                  📁 {t('waiting_for_file_upload') || 'המתנה להעלאת קבצים'}
                                </span>
                                <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', width: '100%' }}>
                                  <thead>
                                    <tr style={{ background: '#f0f0f0' }}>
                                      <th style={{ padding: '0.2rem 0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd' }}>{t('description')||'תיאור'}</th>
                                      <th style={{ padding: '0.2rem 0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd', width: '80px' }}>{t('amount')||'סכום'}</th>
                                      <th style={{ padding: '0.2rem 0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd', width: '50px' }}>{t('currency')||'מטבע'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[
                                      { label: t('cost_customs')||'עמיל מכס',     val: data?.cost_customs,  cur: data?.cost_customs_currency },
                                      { label: t('cost_bank')||'עמלות בנק',       val: data?.cost_bank,     cur: data?.cost_bank_currency },
                                      { label: t('cost_shipping')||'הובלה לשדה',  val: data?.cost_shipping, cur: data?.cost_shipping_currency },
                                      { label: t('cost_other')||'שונות',          val: data?.cost_other,    cur: data?.cost_other_currency },
                                    ].filter(r => r.val > 0).map((r, i) => (
                                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                        <td style={{ padding: '0.2rem 0.5rem' }}>{r.label}</td>
                                        <td style={{ padding: '0.2rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>{Number(r.val).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ padding: '0.2rem 0.5rem', textAlign: 'center', color: '#666' }}>{r.cur}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: '#e8f5e9', fontWeight: 700 }}>
                                      <td style={{ padding: '0.25rem 0.5rem', color: '#155724' }}>{t('total')||'סה"כ'}</td>
                                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', color: '#155724' }}>
                                        {((data?.cost_customs||0)/(data?.cost_customs_rate||1) + (data?.cost_bank||0)/(data?.cost_bank_rate||1) + (data?.cost_shipping||0)/(data?.cost_shipping_rate||1) + (data?.cost_other||0)/(data?.cost_other_rate||1)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', color: '#155724' }}>{data?.cost_base_currency}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button onClick={() => {
                                    setCostsQuoteId(stagesQuote.id);
                                    setCostsData({ baseCurrency: data?.cost_base_currency||'USD', customs: data?.cost_customs||'', customs_currency: data?.cost_customs_currency||'USD', customs_rate: data?.cost_customs_rate||'1', bank: data?.cost_bank||'', bank_currency: data?.cost_bank_currency||'USD', bank_rate: data?.cost_bank_rate||'1', shipping: data?.cost_shipping||'', shipping_currency: data?.cost_shipping_currency||'USD', shipping_rate: data?.cost_shipping_rate||'1', other: data?.cost_other||'', other_currency: data?.cost_other_currency||'USD', other_rate: data?.cost_other_rate||'1' });
                                    setShowCostsModal(true);
                                  }} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    ✏️ {t('edit')||'ערוך'}
                                  </button>
                                  <button onClick={async () => {
                                    if (!window.confirm(t('confirm_delete')||'למחוק?')) return;
                                    try {
                                      await axios.delete(`/api/quotes/${stagesQuote.id}/stages/8/costs`);
                                      const [rs, rq] = await Promise.all([axios.get(`/api/quotes/${stagesQuote.id}/stages`), axios.get('/api/quotes')]);
                                      setStages(rs.data);
                                      setQuotes(rq.data);
                                      setStagesQuote(prev => prev ? { ...prev, status: 'approved' } : prev);
                                    } catch(e) { alert('שגיאה'); }
                                  }} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    🗑️ {t('delete')||'מחק'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                disabled={!stage7Done}
                                onClick={() => {
                                  setCostsQuoteId(stagesQuote.id);
                                  setCostsData({ baseCurrency: 'USD', customs: '', customs_currency: 'USD', customs_rate: '1', bank: '', bank_currency: 'USD', bank_rate: '1', shipping: '', shipping_currency: 'USD', shipping_rate: '1', other: '', other_currency: 'USD', other_rate: '1' });
                                  setShowCostsModal(true);
                                }}
                                style={{
                                  background: stage7Done ? '#007bff' : '#ccc',
                                  color: stage7Done ? 'white' : '#666',
                                  border: 'none', borderRadius: '4px',
                                  padding: '0.3rem 0.8rem', fontSize: '0.8rem',
                                  fontWeight: 'bold', cursor: stage7Done ? 'pointer' : 'not-allowed'
                                }}>
                                {stage7Done ? `💰 ${t('fill_costs') || 'מלא עלויות'}` : `🔒 ${t('fill_costs') || 'מלא עלויות'}`}
                              </button>
                            );
                          })()}
                          {stage.action === 'upload_costs_files' && (() => {
                            const stage8 = stages.find(s => s.stage_number === 8);
                            const stage8Done = stage8?.status === 'waiting_for_files' || stage8?.status === 'approved';
                            const unlocked = stage8Done;
                            
                            return approved ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                  ✅ {t('stage_9_completed') || 'העלאת קבצים הושלמה'}
                                </span>
                                <button
                                  onClick={() => handleOpenStage9(stagesQuote.id)}
                                  style={{
                                    background: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '0.3rem 0.7rem',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  📁 {t('view_files') || 'צפה בקבצים'}
                                </button>
                              </div>
                            ) : (
                              <button
                                disabled={!unlocked}
                                onClick={() => handleOpenStage9(stagesQuote.id)}
                                style={{
                                  background: unlocked ? '#2196F3' : '#ccc',
                                  color: unlocked ? 'white' : '#666',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '0.3rem 0.8rem',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: unlocked ? 'pointer' : 'not-allowed'
                                }}
                              >
                                {unlocked ? `📁 ${t('upload_costs_files') || 'העלה קבצים'}` : `🔒 ${t('upload_costs_files') || 'העלה קבצים'}`}
                              </button>
                            );
                          })()}
                          {!stage.action && approved && (
                            <span style={{ color: '#28a745', fontSize: '0.8rem' }}>✅</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* LC Number Modal - Stage 3 */}
      {showVersionSelectModal && (
        <div className="modal-overlay"> {/* onClick={() => setShowVersionSelectModal(false)}> */}
          <div className="modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{`📄 ${t('select_quote_for_proforma')}`}</h3>
              <button className="modal-close" onClick={() => setShowVersionSelectModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#555', fontSize: '0.9rem' }}>
                {t('multiple_currency_versions_hint')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* ההצעה הראשית */}
                {[stagesQuote, ...getQuoteVersions(stagesQuote.id)].map(q => (
                  <div
                    key={q.id}
                    onClick={() => setProformaQuoteId(q.id)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: proformaQuoteId === q.id ? '2px solid #007bff' : '2px solid #e9ecef',
                      background: proformaQuoteId === q.id ? '#e8f4fd' : '#f8f9fa',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>#{q.id}</span>
                      {!q.parent_id && <span style={{ marginRight: '0.5rem', fontSize: '0.8rem', color: '#666' }}>{`(${t('main_version')})`}</span>}
                      <span style={{ fontSize: '0.9rem', color: '#444' }}>{q.customer_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{formatNumber(q.total)}</span>
                      <span style={{
                        background: '#007bff', color: 'white',
                        padding: '2px 10px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600
                      }}>{q.currency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowVersionSelectModal(false)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={() => {
                setShowVersionSelectModal(false);
                setLcNumber('');
                setShowLCModal(true);
              }}>
                {t('continue')} →
              </button>
            </div>
          </div>
        </div>
      )}

      {showCostsModal && (
        <div className="modal-overlay"> {/* onClick={() => setShowCostsModal(false)}> */}
          <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">💰 {t('additional_costs') || 'עלויות נוספות'} — {t('quote') || 'הצעה'} #{costsQuoteId}</h3>
              <button className="modal-close" onClick={() => setShowCostsModal(false)}>×</button>
            </div>
            <div className="modal-body">

              {/* מטבע ראשי */}
              <div style={{ background: '#e8f4fd', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontWeight: 600, color: '#0056b3' }}>💵 {t('base_currency') || 'מטבע ראשי'}:</span>
                <select className="form-input" style={{ width: '120px' }}
                  value={costsData.baseCurrency}
                  onChange={e => {
                    const bc = e.target.value;
                    setCostsData(prev => ({
                      ...prev, baseCurrency: bc,
                      customs_currency: prev.customs_currency === prev.baseCurrency ? bc : prev.customs_currency,
                      bank_currency: prev.bank_currency === prev.baseCurrency ? bc : prev.bank_currency,
                      shipping_currency: prev.shipping_currency === prev.baseCurrency ? bc : prev.shipping_currency,
                      other_currency: prev.other_currency === prev.baseCurrency ? bc : prev.other_currency,
                    }));
                  }}>
                  {['USD','EUR','GBP','ILS'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>הסה"כ יחושב במטבע זה</span>
              </div>

              {/* שדות עלויות */}
              {[
                { key: 'customs',  label: t('cost_customs')  || 'עמיל מכס' },
                { key: 'bank',     label: t('cost_bank')     || 'עמלות בנק' },
                { key: 'shipping', label: t('cost_shipping') || 'הובלה לשדה' },
                { key: 'other',    label: t('cost_other')    || 'שונות' },
              ].map(({ key, label }) => {
                const isDiff = costsData[`${key}_currency`] !== costsData.baseCurrency;
                const amount = Number(costsData[key] || 0);
                const rate = Number(costsData[`${key}_rate`] || 1);
                const converted = isDiff ? (amount / rate) : amount;
                return (
                  <div key={key} style={{ marginBottom: '0.75rem', background: isDiff ? '#fff9e6' : 'white', border: `1px solid ${isDiff ? '#ffc107' : '#e9ecef'}`, borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                    <label className="form-label" style={{ marginBottom: '0.4rem', fontWeight: 600 }}>{label}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.5rem' }}>
                      <input type="number" className="form-input" min="0" placeholder="0"
                        value={costsData[key]}
                        onChange={e => setCostsData(prev => ({ ...prev, [key]: e.target.value }))} />
                      <select className="form-input"
                        value={costsData[`${key}_currency`]}
                        onChange={e => setCostsData(prev => ({ ...prev, [`${key}_currency`]: e.target.value, [`${key}_rate`]: e.target.value === costsData.baseCurrency ? '1' : prev[`${key}_rate`] }))}>
                        {['USD','EUR','GBP','ILS'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {isDiff && (
                      <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', color: '#856404' }}>💱 שער המרה ל-{costsData.baseCurrency}:</span>
                        <input type="number" min="0.0001" step="0.0001" placeholder="1"
                          value={costsData[`${key}_rate`]}
                          onChange={e => setCostsData(prev => ({ ...prev, [`${key}_rate`]: e.target.value }))}
                          style={{ width: '90px', padding: '0.2rem 0.4rem', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '0.85rem' }} />
                        {amount > 0 && rate > 0 && (
                          <>
                            <span style={{ fontSize: '0.8rem', color: '#555' }}>= {converted.toLocaleString('en-US', { maximumFractionDigits: 2 })} {costsData.baseCurrency}</span>
                            <button
                              onClick={() => setCostsData(prev => ({
                                ...prev,
                                [key]: converted.toFixed(2),
                                [`${key}_currency`]: costsData.baseCurrency,
                                [`${key}_rate`]: '1'
                              }))}
                              style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
                              ✓ {t('apply') || 'החל המרה'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* סה"כ */}
              {(() => {
                const total = ['customs','bank','shipping','other'].reduce((sum, key) => {
                  const amount = Number(costsData[key] || 0);
                  const rate = Number(costsData[`${key}_rate`] || 1);
                  const isDiff = costsData[`${key}_currency`] !== costsData.baseCurrency;
                  return sum + (isDiff ? amount / rate : amount);
                }, 0);
                return (
                  <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #dee2e6' }}>
                    <span style={{ fontWeight: 700 }}>{t('total_costs') || 'סה"כ עלויות'}</span>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#007bff' }}>
                      {total.toLocaleString('en-US', { maximumFractionDigits: 2 })} {costsData.baseCurrency}
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowCostsModal(false)}>{t('cancel') || 'בטל'}</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await axios.post(`/api/quotes/${costsQuoteId}/stages/8/costs`, {
                    cost_base_currency: costsData.baseCurrency,
                    cost_customs: Number(costsData.customs)||0,
                    cost_customs_currency: costsData.customs_currency,
                    cost_customs_rate: Number(costsData.customs_rate)||1,
                    cost_bank: Number(costsData.bank)||0,
                    cost_bank_currency: costsData.bank_currency,
                    cost_bank_rate: Number(costsData.bank_rate)||1,
                    cost_shipping: Number(costsData.shipping)||0,
                    cost_shipping_currency: costsData.shipping_currency,
                    cost_shipping_rate: Number(costsData.shipping_rate)||1,
                    cost_other: Number(costsData.other)||0,
                    cost_other_currency: costsData.other_currency,
                    cost_other_rate: Number(costsData.other_rate)||1,
                  });
                  setShowCostsModal(false);
                  // רענן שלבים + רשימת הצעות
                  const [refreshedStages, refreshedQuotes] = await Promise.all([
                    axios.get(`/api/quotes/${costsQuoteId}/stages`),
                    axios.get('/api/quotes'),
                  ]);
                  setStages(refreshedStages.data);
                  setQuotes(refreshedQuotes.data);
                  // Quote נשאר approved - לא נסגר
                  alert('✅ עלויות נשמרו! המשך לשלב 9 להעלאת קבצים');
                } catch(e) { 
                  console.error('Error saving costs:', e);
                  alert('שגיאה בשמירה: ' + (e.response?.data?.error || e.message)); 
                }
              }}>💾 {t('save_costs') || 'שמור עלויות'}</button>
            </div>
          </div>
        </div>
      )}

      {showLCModal && (
        <div className="modal-overlay"> {/* onClick={() => { setShowLCModal(false); setEditingProforma(false); }}> */}
          <div className="modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📄 {editingProforma ? t('edit_proforma_invoice') : t('proforma_invoice')}</h3>
              <button className="modal-close" onClick={() => { setShowLCModal(false); setEditingProforma(false); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">L/C Number <span style={{ color: '#999', fontWeight: 'normal' }}>({t('optional')})</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={lcNumber}
                  onChange={e => setLcNumber(e.target.value)}
                  placeholder={t('lc_placeholder')}
                />
              </div>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">{t('document_language')}</label>
                <select className="form-select" value={lcLang} onChange={e => setLcLang(e.target.value)}>
                  <option value="he">🇮🇱 עברית</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="pt">🇵🇹 Português</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowLCModal(false); setEditingProforma(false); }}>{t('cancel')}</button>
              <button
                className="btn btn-primary"
                onClick={editingProforma ? handleUpdateProforma : handleCreateProformaInvoice}
              >
                {`📄 ${editingProforma ? t('update_pdf') : t('create_pdf')}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delivery Note Selection Modal - Stage 4 */}
      {showDeliveryModal && (
        <div className="modal-overlay"> {/* onClick={() => setShowDeliveryModal(false)}> */}
          <div className="modal" style={{ maxWidth: '650px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{`📦 ${t('select_delivery_note')}`}</h3>
              <button className="modal-close" onClick={() => setShowDeliveryModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{t('select_or_create_delivery')}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => { setShowDeliveryModal(false); setShowNewOutboundModal(true); }}
                  style={{ fontSize: '0.85rem' }}
                >
                  {`➕ ${t('create_new_delivery')}`}
                </button>
              </div>
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ margin: 0, fontWeight: 500, whiteSpace: 'nowrap' }}>{`🌐 ${t('document_language')}:`}</label>
                <select className="form-select" style={{ maxWidth: '180px' }} value={deliveryLang} onChange={e => setDeliveryLang(e.target.value)}>
                  <option value="he">🇮🇱 עברית</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="pt">🇵🇹 Português</option>
                </select>
              </div>
              {outboundList.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>{t('no_delivery_notes')}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('customer')}</th>
                      <th>{t('date')}</th>
                      <th>{t('status')}</th>
                      <th>{t('link')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundList.map(ot => (
                      <tr key={ot.id}>
                        <td>#{ot.id}</td>
                        <td>{ot.customer_name || ot.casual_customer_name || '-'}</td>
                        <td>{new Date(ot.transaction_date).toLocaleDateString()}</td>
                        <td>
                          <span style={{
                            background: ot.status === 'completed' ? '#d4edda' : '#fff3cd',
                            color: ot.status === 'completed' ? '#155724' : '#856404',
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem'
                          }}>
                            {ot.status === 'completed' ? `✅ ${t('completed')}` : `⏳ ${t('in_progress')}`}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleLinkDelivery(ot.id)}
                            style={{
                              background: '#007bff', color: 'white',
                              border: 'none', borderRadius: '4px',
                              padding: '0.3rem 0.7rem', fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            {`🔗 ${t('link_delivery')}`}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {/* New Outbound Modal - Stage 4 */}
      {showNewOutboundModal && (
        <NewOutboundModal
          onClose={() => { setShowNewOutboundModal(false); setShowDeliveryModal(true); }}
          onSuccess={async (newId) => {
            setShowNewOutboundModal(false);
            await axios.post(`/api/quotes/${stagesQuote.id}/stages/5/link-delivery`, { outbound_id: newId, delivery_lang: deliveryLang });
            const refreshed = await axios.get(`/api/quotes/${stagesQuote.id}/stages`);
            setStages(refreshed.data);
          }}
        />
      )}

      {/* Duplicate Quote - Currency Modal */}
      {showDuplicateModal && (
        <div className="modal-overlay"> {/* onClick={() => setShowDuplicateModal(false)}> */}
          <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">💱 {t('new_currency_version') || 'גרסת מטבע חדשה'}</h3>
              <button className="modal-close" onClick={() => setShowDuplicateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#555' }}>
                {t('duplicate_quote_info') || 'כל המחירים יוכפלו בשער ההמרה שתבחר.'}
              </p>
              <div className="form-group">
                <label className="form-label">{t('currency')}</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {[
                    { code: 'EUR', flag: '💶' },
                    { code: 'USD', flag: '💵' },
                    { code: 'ILS', flag: '🇮🇱' },
                    { code: 'AOA', flag: '🇦🇴' },
                    { code: 'KES', flag: '🇰🇪' },
                  ].map(c => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setDuplicateCurrency(c.code)}
                      style={{
                        padding: '0.6rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem',
                        background: duplicateCurrency === c.code ? '#007bff' : '#f0f0f0',
                        color: duplicateCurrency === c.code ? 'white' : '#333',
                        border: duplicateCurrency === c.code ? '2px solid #0056b3' : '2px solid transparent',
                        fontWeight: duplicateCurrency === c.code ? 600 : 400
                      }}
                    >
                      {c.flag} {c.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '1.2rem' }}>
                <label className="form-label">
                  שער המרה
                  <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal', marginRight: '0.5rem' }}>
                    (1 יחידת מטבע מקורי = ? {duplicateCurrency})
                  </span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    min="0.0001"
                    step="0.01"
                    style={{ maxWidth: '150px', fontSize: '1.1rem', fontWeight: 600 }}
                    placeholder="1.00"
                  />
                  {parseFloat(exchangeRate) > 0 && parseFloat(exchangeRate) !== 1 && (
                    <span style={{ color: '#555', fontSize: '0.9rem' }}>
                      לדוגמה: מחיר 100 ← {(100 * parseFloat(exchangeRate)).toFixed(2)} {duplicateCurrency}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDuplicateModal(false)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleConfirmDuplicate}>
                ✓ {t('create') || 'צור גרסה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 9 Modal - Additional Costs File Upload */}
      {showStage9Modal && (
        <div className="modal-overlay"> {/* onClick={() => setShowStage9Modal(false)}> */}
          <div className="modal" style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📁 {t('stage_9_upload') || 'העלאת קבצי הוצאות נוספות'}</h3>
              <button className="modal-close" onClick={() => setShowStage9Modal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#e3f2fd', borderRadius: '8px' }}>
                <p style={{ margin: 0, color: '#1976d2', fontSize: '0.95rem' }}>
                  💡 {t('stage_9_info') || 'העלה קבצים הקשורים להוצאות נוספות (חשבוניות, אישורים, תעודות וכו\')'}
                </p>
              </div>

              {/* Upload Button */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  <span>📤 {t('upload_file') || 'העלה קובץ'}</span>
                  <input 
                    type="file" 
                    style={{ display: 'none' }} 
                    onChange={handleStage9Upload}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  />
                </label>
              </div>

              {/* Files List */}
              {stage9Files.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
                  <p>{t('no_files_uploaded') || 'לא הועלו קבצים עדיין'}</p>
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>
                    📋 {t('uploaded_files') || 'קבצים שהועלו'} ({stage9Files.length})
                  </h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('file') || 'קובץ'}</th>
                        <th>{t('date') || 'תאריך'}</th>
                        <th>{t('size') || 'גודל'}</th>
                        <th>{t('actions') || 'פעולות'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage9Files.map((file) => {
                        const fileName = file.file_path.split('/').pop();
                        const fileSize = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-';
                        const uploadDate = file.uploaded_at 
                          ? new Date(file.uploaded_at).toLocaleDateString('he-IL')
                          : '-';
                        
                        return (
                          <tr key={file.id}>
                            <td>
                              <a 
                                href={`http://localhost:3001${file.file_path}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: '#007bff', textDecoration: 'none' }}
                              >
                                📄 {fileName}
                              </a>
                            </td>
                            <td>{uploadDate}</td>
                            <td>{fileSize}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <label 
                                  className="btn btn-sm btn-secondary"
                                  style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  ✏️ {t('edit') || 'עריכה'}
                                  <input 
                                    type="file" 
                                    style={{ display: 'none' }} 
                                    onChange={(e) => handleStage9EditFile(e, file.id)}
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                  />
                                </label>
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => handleStage9DeleteFile(file.id)}
                                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  🗑️ {t('delete') || 'מחיקה'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={() => setShowStage9Modal(false)}>
                {t('close') || 'סגור'}
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleStage9Complete}
                style={{ background: '#28a745', fontWeight: 'bold' }}
              >
                ✅ {t('complete_and_close_deal') || 'בוצע - סגור עסקה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;
