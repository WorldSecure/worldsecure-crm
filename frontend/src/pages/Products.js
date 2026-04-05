import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import MobilePicker from './MobilePicker';

const getProductName = (product, lang) => {
  if (lang === 'en') return product.name;
  if (lang === 'he' && product.name_he) return product.name_he;
  if (lang === 'pt' && product.name_pt) return product.name_pt;
  return product.name; // fallback לאנגלית אם אין תרגום
};

const getCategoryName = (product, lang) => {
  if (lang === 'he' && product.category_name_he) return product.category_name_he;
  if (lang === 'pt' && product.category_name_pt) return product.category_name_pt;
  return product.category_name || '-';
};

const formatNumber = (num) => {
  if (!num || num === '') return '';
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// מכפלה קרטזית לדגמים
const cartesian = (arrays) => arrays.reduce((acc, arr) => {
  const res = [];
  acc.forEach(a => arr.forEach(b => res.push([...a, b])));
  return res;
}, [[]]);

function Products() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [variantAttrs, setVariantAttrs] = useState([
    { name: '', values: [''] }
  ]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [showAttrTypesModal, setShowAttrTypesModal] = useState(false);
  const [attrTypes, setAttrTypes] = useState([]);
  const [editingAttrType, setEditingAttrType] = useState(null);
  const [attrTypeForm, setAttrTypeForm] = useState({ name: '' });
  const [savingAttrType, setSavingAttrType] = useState(false);
  const [showProductTypeModal, setShowProductTypeModal] = useState(false);
  const [productTypeCodes, setProductTypeCodes] = useState([]);
  const [editingProductType, setEditingProductType] = useState(null);
  const [productTypeForm, setProductTypeForm] = useState({ code: '', name: '' });
  const [savingProductType, setSavingProductType] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importCsvResult, setImportCsvResult] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ code: '', name: '' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [subcategoryForm, setSubcategoryForm] = useState({ code: '', name: '' });
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(''); // לסינון במודל סאב-קטגוריות
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [priceHistory, setPriceHistory] = useState([]);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [expandedParents, setExpandedParents] = useState({});
  const [variantsCache, setVariantsCache] = useState({});
  const [editingQty, setEditingQty] = useState({}); // { variantId: newQty }
  const [editingPrice, setEditingPrice] = useState({}); // { variantId: newPrice }
  const [editingUnit, setEditingUnit] = useState({}); // { variantId: unit }
  const [editingMinQty, setEditingMinQty] = useState({}); // { variantId: min_quantity }
  const [editingCurrency, setEditingCurrency] = useState({}); // { variantId: currency }
  const [variantPage, setVariantPage] = useState({}); // { parentId: currentPage }
  const VARIANT_PAGE_SIZE = 5;
  const [newPrice, setNewPrice] = useState({ price: '', currency: 'ILS', effective_date: new Date().toISOString().split('T')[0] });
  
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category_id: '',
    subcategory_id: '',
    price: '',
    currency: 'ILS',
    unit: 'unit',
    quantity: 0,
    min_quantity: 0,
    supplier_id: '',
    manufacturer_id: '',
    is_parent: false,
    product_type_code: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  // ESC key handler for modal
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showModal]);

  // סגירת תפריט Actions בלחיצה מחוץ
  useEffect(() => {
    if (!showActionsMenu) return;
    const handleClickOutside = (e) => setShowActionsMenu(false);
    // timeout קצר כדי לא לבטל את הלחיצה על הכפתור עצמו
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
    }, 10);
    return () => { clearTimeout(timer); window.removeEventListener('click', handleClickOutside); };
  }, [showActionsMenu]);


  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, subcategoriesRes, suppliersRes, manufacturersRes, attrTypesRes, productTypeRes] = await Promise.all([
        axios.get('/api/products'),
        axios.get('/api/categories'),
        axios.get('/api/subcategories'),
        axios.get('/api/suppliers'),
        axios.get('/api/manufacturers'),
        axios.get('/api/variant-attribute-types'),
        axios.get('/api/product-type-codes')
      ]);
      
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setSubcategories(subcategoriesRes.data);
      setSuppliers(suppliersRes.data);
      setManufacturers(manufacturersRes.data);
      setAttrTypes(attrTypesRes.data || []);
      setProductTypeCodes(productTypeRes.data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      setLoading(false);
    }
  };

  const fetchProducts = async (discontinued = false) => {
    try {
      const res = await axios.get(`/api/products${discontinued ? '?discontinued=true' : ''}`);
      setProducts(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchAttrTypes = async () => {
    try {
      const res = await axios.get('/api/variant-attribute-types');
      setAttrTypes(res.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchProductTypeCodes = async () => {
    try {
      const res = await axios.get('/api/product-type-codes');
      setProductTypeCodes(res.data || []);
    } catch (e) { console.error(e); }
  };

  // ── Variant Attribute Types management ───────────────────────────────────────
  const openAddAttrType = () => { setEditingAttrType(null); setAttrTypeForm({ name: '' }); setShowAttrTypesModal(true); };
  const openEditAttrType = (at) => { setEditingAttrType(at); setAttrTypeForm({ name: '' }); setShowAttrTypesModal(true); };

  const handleSaveAttrType = async () => {
    if (!attrTypeForm.name.trim()) return;
    setSavingAttrType(true);
    try {
      // תרגום אוטומטי
      const lang = localStorage.getItem('language') || 'he';
      let name = attrTypeForm.name.trim();
      let name_he = name, name_en = name, name_pt = name;
      try {
        const transRes = await axios.post('/api/products/translate', { name, sourceLang: lang });
        name_he = transRes.data.he || name;
        name_en = transRes.data.en || name;
        name_pt = transRes.data.pt || name;
      } catch(e) {}

      const payload = { name: name_en, name_he, name_pt };
      if (editingAttrType) {
        await axios.put(`/api/variant-attribute-types/${editingAttrType.id}`, payload);
      } else {
        await axios.post('/api/variant-attribute-types', payload);
      }
      await fetchAttrTypes();
      setAttrTypeForm({ name: '' });
      setEditingAttrType(null);
    } catch(e) { console.error(e); }
    setSavingAttrType(false);
  };

  const handleDeleteAttrType = async (id) => {
    if (!window.confirm(t('confirm_delete') || 'למחוק?')) return;
    try {
      await axios.delete(`/api/variant-attribute-types/${id}`);
      await fetchAttrTypes();
    } catch(e) { console.error(e); }
  };

  // ── Product Type Codes management ────────────────────────────────────────────
  const openAddProductType = () => { setEditingProductType(null); setProductTypeForm({ code: '', name: '' }); setShowProductTypeModal(true); };
  const openEditProductType = (pt) => { setEditingProductType(pt); setProductTypeForm({ code: pt.code, name: '' }); setShowProductTypeModal(true); };

  const handleSaveProductType = async () => {
    if (!productTypeForm.code.trim() || !productTypeForm.name.trim()) return;
    setSavingProductType(true);
    try {
      const lang = localStorage.getItem('language') || 'he';
      let name = productTypeForm.name.trim();
      let name_he = name, name_en = name, name_pt = name;
      try {
        const transRes = await axios.post('/api/products/translate', { name, sourceLang: lang });
        name_he = transRes.data.he || name;
        name_en = transRes.data.en || name;
        name_pt = transRes.data.pt || name;
      } catch(e) {}
      const payload = { code: productTypeForm.code.toUpperCase().slice(0,3), name: name_en, name_he, name_pt };
      if (editingProductType) {
        await axios.put(`/api/product-type-codes/${editingProductType.id}`, payload);
      } else {
        await axios.post('/api/product-type-codes', payload);
      }
      await fetchProductTypeCodes();
      setProductTypeForm({ code: '', name: '' });
      setEditingProductType(null);
    } catch(e) { alert(t('error') + ': ' + (e.response?.data?.error || e.message)); }
    setSavingProductType(false);
  };

  const handleDeleteProductType = async (id) => {
    if (!window.confirm(t('confirm_delete') || 'למחוק?')) return;
    try {
      await axios.delete(`/api/product-type-codes/${id}`);
      await fetchProductTypeCodes();
    } catch(e) { console.error(e); }
  };

  const handleImportCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportingCsv(true);
    setImportCsvResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // דלג על שורת כותרת אם קיימת
      const dataLines = lines[0]?.toLowerCase().startsWith('code') ? lines.slice(1) : lines;
      const lang = localStorage.getItem('language') || 'he';
      let success = 0, skipped = 0, errors = [];

      for (const line of dataLines) {
        const [rawCode, ...nameParts] = line.split(',');
        const code = (rawCode || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        const name = nameParts.join(',').trim().replace(/^"|"$/g, '');
        if (!code || code.length !== 3 || !name) { skipped++; continue; }

        try {
          // תרגום אוטומטי
          let name_en = name, name_he = name, name_pt = name;
          try {
            const transRes = await axios.post('/api/products/translate', { name, sourceLang: lang });
            name_he = transRes.data.he || name;
            name_en = transRes.data.en || name;
            name_pt = transRes.data.pt || name;
          } catch(e) {}
          await axios.post('/api/product-type-codes', { code, name: name_en, name_he, name_pt });
          success++;
        } catch(e) {
          if (e.response?.status === 500 && (e.response?.data?.error?.includes('UNIQUE') || e.response?.data?.error?.includes('duplicate key') || e.response?.data?.error?.includes('unique constraint'))) {
            skipped++; // קוד כבר קיים
          } else {
            errors.push(code);
          }
        }
      }
      await fetchProductTypeCodes();
      setImportCsvResult({ success, skipped, errors });
    } catch(e) {
      setImportCsvResult({ error: e.message });
    }
    setImportingCsv(false);
  };

  // ── Category management ───────────────────────────────────────────────────
  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ code: '', name: '' });
    setShowCategoryModal(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({ code: cat.code || '', name: '' });
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.code.trim() || !categoryForm.name.trim()) return;
    setSavingCategory(true);
    try {
      const lang = localStorage.getItem('language') || 'he';
      let name = categoryForm.name.trim();
      let name_he = name, name_en = name, name_pt = name;
      try {
        const transRes = await axios.post('/api/products/translate', { name, sourceLang: lang });
        name_he = transRes.data.he || name;
        name_en = transRes.data.en || name;
        name_pt = transRes.data.pt || name;
      } catch(e) {}
      const payload = {
        code: categoryForm.code.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3),
        name: name_en,
        name_he,
        name_pt
      };
      if (editingCategory) {
        await axios.put(`/api/categories/${editingCategory.id}`, payload);
      } else {
        await axios.post('/api/categories', payload);
      }
      const res = await axios.get('/api/categories');
      setCategories(res.data);
      setEditingCategory(null);
      setCategoryForm({ code: '', name: '' });
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSavingCategory(false); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await axios.delete(`/api/categories/${id}`);
      const res = await axios.get('/api/categories');
      setCategories(res.data);
      if (editingCategory?.id === id) {
        setEditingCategory(null);
        setCategoryForm({ code: '', name: '' });
      }
    } catch(e) { alert(e.response?.data?.error || e.message); }
  };

  const getCatDisplayName = (cat) => {
    const name = language === 'he' ? (cat.name_he || cat.name) : language === 'pt' ? (cat.name_pt || cat.name) : cat.name;
    return cat.code ? `${cat.code} — ${name}` : name;
  };

  const getSubcatDisplayName = (sub) => {
    const name = language === 'he' ? (sub.name_he || sub.name) : language === 'pt' ? (sub.name_pt || sub.name) : sub.name;
    return sub.code ? `${sub.code} — ${name}` : name;
  };

  // ── Subcategory management ─────────────────────────────────────────────────
  const openNewSubcategory = () => {
    setEditingSubcategory(null);
    setSubcategoryForm({ code: '', name: '' });
  };

  const openEditSubcategory = (sub) => {
    setEditingSubcategory(sub);
    setSubcategoryForm({ code: sub.code || '', name: '' });
  };

  const handleSaveSubcategory = async () => {
    if (!subcategoryForm.code.trim() || !subcategoryForm.name.trim() || !selectedCategoryFilter) return;
    try {
      setSavingSubcategory(true);
      const lang = localStorage.getItem('language') || 'he';
      let name = subcategoryForm.name.trim();
      let name_he = name, name_en = name, name_pt = name;
      try {
        const transRes = await axios.post('/api/products/translate', { name, sourceLang: lang });
        name_he = transRes.data.he || name;
        name_en = transRes.data.en || name;
        name_pt = transRes.data.pt || name;
      } catch(e) {}
      const payload = {
        category_id: selectedCategoryFilter,
        code: subcategoryForm.code.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3),
        name: name_en,
        name_he,
        name_pt
      };
      if (editingSubcategory) {
        await axios.put(`/api/subcategories/${editingSubcategory.id}`, payload);
      } else {
        await axios.post('/api/subcategories', payload);
      }
      const res = await axios.get('/api/subcategories');
      setSubcategories(res.data);
      setEditingSubcategory(null);
      setSubcategoryForm({ code: '', name: '' });
    } catch(e) { alert(e.response?.data?.error || e.message); }
    finally { setSavingSubcategory(false); }
  };

  const handleDeleteSubcategory = async (id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await axios.delete(`/api/subcategories/${id}`);
      const res = await axios.get('/api/subcategories');
      setSubcategories(res.data);
      if (editingSubcategory?.id === id) {
        setEditingSubcategory(null);
        setSubcategoryForm({ code: '', name: '' });
      }
    } catch(e) { alert(e.response?.data?.error || e.message); }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getFilteredSortedProducts = () => {
    let filtered = products.filter(product => {
      // הסתר דגמים (מוצרים עם parent_id) — הם מוצגים רק בתוך שורת האב
      if (product.parent_id) return false;
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSku = !skuFilter || product.sku.toUpperCase().startsWith(skuFilter.toUpperCase());
      return matchesSearch && matchesSku;
    });
    return filtered.sort((a, b) => {
      let aValue, bValue;
      if (sortField === 'category') {
        aValue = (a.category_name || '').toLowerCase();
        bValue = (b.category_name || '').toLowerCase();
      } else {
        aValue = (a[sortField] || '').toString().toLowerCase();
        bValue = (b[sortField] || '').toString().toLowerCase();
      }
      return sortDirection === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
    });
  };

  const getSortedProducts = () => {
    const all = getFilteredSortedProducts();
    if (pageSize === 'all') return all;
    const start = (currentPage - 1) * pageSize;
    return all.slice(start, start + pageSize);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // תרגום אוטומטי אם השם השתנה או מוצר חדש
      let name_he = editingProduct?.name_he || null;
      let name_pt = editingProduct?.name_pt || null;
      let name_en = formData.name; // ברירת מחדל - name הוא אנגלית
      const nameChanged = !editingProduct || editingProduct.name !== formData.name;

      if (nameChanged) {
        try {
          const transRes = await axios.post('/api/products/translate', {
            name: formData.name,
            sourceLang: language  // שולח את שפת המערכת הנוכחית
          });
          name_he = transRes.data.he || null;
          name_pt = transRes.data.pt || null;
          name_en = transRes.data.en || formData.name;
        } catch (e) {
          console.warn('Translation failed, saving without translation');
          // שמור את השם בשדה הנכון לפי שפת המקור
          if (language === 'he') name_he = formData.name;
          if (language === 'pt') name_pt = formData.name;
        }
      }

      // name (אנגלית) תמיד נשמר
      const finalName = language === 'en' ? formData.name : name_en;

      // בניית SKU למוצר אב אוטומטית
      let finalSku = formData.sku;
      let variantSkuPrefix = '';
      if (formData.is_parent) {
        const cat = categories.find(c => String(c.id) === String(formData.category_id));
        const sub = subcategories.find(s => String(s.id) === String(formData.subcategory_id));
        // קרא code ישירות מהטבלה — fallback ל-3 אותיות ראשונות מהשם
        const catCode = (cat?.code || (cat?.name || 'CAT').slice(0,3)).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
        const subCode = sub ? (sub?.code || (sub?.name || 'SUB').slice(0,3)).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3) : null;
        const typeCode = formData.product_type_code || null;
        // בנה prefix: CAT-SUB-TYPE או CAT-TYPE או CAT-SUB
        const parts = [catCode, subCode, typeCode].filter(Boolean);
        variantSkuPrefix = parts.join('-');
        finalSku = `${variantSkuPrefix}-PAR`;
      }

      const payload = { ...formData, sku: finalSku, name: finalName, name_he, name_pt, variant_sku_prefix: variantSkuPrefix };

      if (editingProduct) {
        await axios.put(`/api/products/${editingProduct.id}`, payload);
      } else {
        await axios.post('/api/products', payload);
      }
      
      alert(t('success'));
      setShowModal(false);
      resetForm();
      // נקה cache של הדגמים לאב הזה כדי שיטען מחדש מהשרת
      if (editingProduct?.id) {
        setVariantsCache(c => { const n = { ...c }; delete n[editingProduct.id]; return n; });
        setExpandedParents(p => ({ ...p, [editingProduct.id]: false }));
      }
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEdit = async (product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      category_id: product.category_id || '',
      subcategory_id: product.subcategory_id || '',
      price: product.price || '',
      currency: product.currency || 'ILS',
      unit: product.unit,
      quantity: product.quantity,
      min_quantity: product.min_quantity,
      supplier_id: product.supplier_id || '',
      manufacturer_id: product.manufacturer_id || '',
      is_parent: product.is_parent ? true : false,
      variant_attrs: product.variant_attrs || '',
      product_type_code: product.product_type_code || ''
    });

    // פרסור variant_attrs חזרה למבנה [{ name, values }]
    if (product.is_parent && product.variant_attrs) {
      const attrPattern = /\[([^\]=]+)=([^\]]+)\]/g;
      const parsed = [];
      let match;
      while ((match = attrPattern.exec(product.variant_attrs)) !== null) {
        parsed.push({ name: match[1].trim(), values: match[2].split(',').map(v => v.trim()).filter(Boolean) });
      }
      setVariantAttrs(parsed.length > 0 ? parsed : [{ name: '', values: [''] }]);
    } else {
      setVariantAttrs([{ name: '', values: [''] }]);
    }
    setShowAddPrice(false);
    setNewPrice({ price: '', currency: product.currency || 'ILS', effective_date: new Date().toISOString().split('T')[0] });
    try {
      const res = await axios.get(`/api/products/${product.id}/price-history`);
      setPriceHistory(res.data);
    } catch(e) { setPriceHistory([]); }
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    
    try {
      await axios.delete(`/api/products/${id}`);
      alert(t('success'));
      fetchData();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDiscontinue = async (product) => {
    const isActive = product.is_active === 1 || product.is_active === true;
    const msg = isActive
      ? (t('confirm_discontinue') || `להפסיק את שיווק "${product.name}"? המוצר יוסתר אך ישמר בהיסטוריה.`)
      : (t('confirm_restore') || `לשחזר את "${product.name}"?`);
    if (!window.confirm(msg)) return;
    try {
      await axios.patch(`/api/products/${product.id}/discontinue`, { is_active: !isActive });
      fetchProducts(showDiscontinued);
    } catch (e) {
      alert(t('error') + ': ' + (e.response?.data?.error || e.message));
    }
  };

  const toggleExpand = async (parentId) => {
    if (expandedParents[parentId]) {
      setExpandedParents(p => ({ ...p, [parentId]: false }));
      return;
    }
    // תמיד מושך מהשרת (גם אם cache קיים אבל ריק)
    try {
      const res = await axios.get(`/api/products/${parentId}/variants`);
      setVariantsCache(c => ({ ...c, [parentId]: res.data }));
    } catch (e) { return; }
    setExpandedParents(p => ({ ...p, [parentId]: true }));
  };

  const saveVariantQty = async (variantId, parentId) => {
    const qty = editingQty[variantId];
    const price = editingPrice[variantId];
    const unit = editingUnit[variantId];
    const currency = editingCurrency[variantId];
    const minQty = editingMinQty[variantId];
    if (qty === undefined && price === undefined && unit === undefined && currency === undefined && minQty === undefined) return;
    try {
      await axios.patch(`/api/products/${variantId}/quantity`, {
        ...(qty !== undefined ? { quantity: parseInt(qty) } : {}),
        ...(price !== undefined ? { price: parseFloat(price) } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(minQty !== undefined ? { min_quantity: parseInt(minQty) } : {})
      });
      setVariantsCache(c => ({
        ...c,
        [parentId]: c[parentId].map(v => v.id === variantId ? {
          ...v,
          ...(qty !== undefined ? { quantity: parseInt(qty) } : {}),
          ...(price !== undefined ? { price: parseFloat(price) } : {}),
          ...(unit !== undefined ? { unit } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(minQty !== undefined ? { min_quantity: parseInt(minQty) } : {})
        } : v)
      }));
      setEditingQty(q => { const n = { ...q }; delete n[variantId]; return n; });
      setEditingPrice(p => { const n = { ...p }; delete n[variantId]; return n; });
      setEditingUnit(u => { const n = { ...u }; delete n[variantId]; return n; });
      setEditingCurrency(c => { const n = { ...c }; delete n[variantId]; return n; });
      setEditingMinQty(q => { const n = { ...q }; delete n[variantId]; return n; });
    } catch (e) {
      alert(t('error') + ': ' + e.message);
    }
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      description: '',
      category_id: '',
      subcategory_id: '',
      price: '',
      currency: 'ILS',
      unit: 'unit',
      quantity: 0,
      min_quantity: 0,
      supplier_id: '',
      manufacturer_id: ''
    });
    setEditingProduct(null);
  };

  const getUnitTranslation = (unit) => {
    const unitMap = {
      'unit': 'unit_piece',
      'box': 'unit_box',
      'carton': 'unit_carton',
      'kg': 'unit_kg',
      'liter': 'unit_liter',
      'meter': 'unit_meter'
    };
    return t(unitMap[unit] || 'unit_piece');
  };

  const allFiltered = getFilteredSortedProducts();
  const totalFiltered = allFiltered.length;
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalFiltered / pageSize);
  const sortedProducts = getSortedProducts();

  const PaginationBar = () => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem', marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid #e2e8f0' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.85rem', color:'#555' }}>
        <span>{totalFiltered} {t('products') || 'מוצרים'}</span>
        <span>|</span>
        <label>{t('per_page') || 'פר עמוד'}:</label>
        <select value={pageSize} onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setCurrentPage(1); }}
          style={{ padding:'0.2rem 0.4rem', borderRadius:'6px', border:'1px solid #d1d5db', fontSize:'0.85rem' }}>
          {[10,15,20,50].map(n => <option key={n} value={n}>{n}</option>)}
          <option value="all">{t('all') || 'הכל'}</option>
        </select>
      </div>
      {pageSize !== 'all' && totalPages > 1 && (
        <div style={{ display:'flex', gap:'0.3rem', alignItems:'center' }}>
          <button onClick={() => setCurrentPage(1)} disabled={currentPage===1}
            style={{ padding:'0.2rem 0.5rem', borderRadius:'6px', border:'1px solid #d1d5db', background: currentPage===1 ? '#f3f4f6':'#fff', cursor: currentPage===1 ? 'default':'pointer' }}>«</button>
          <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1}
            style={{ padding:'0.2rem 0.5rem', borderRadius:'6px', border:'1px solid #d1d5db', background: currentPage===1 ? '#f3f4f6':'#fff', cursor: currentPage===1 ? 'default':'pointer' }}>‹</button>
          <span style={{ fontSize:'0.85rem', padding:'0 0.3rem' }}>{currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
            style={{ padding:'0.2rem 0.5rem', borderRadius:'6px', border:'1px solid #d1d5db', background: currentPage===totalPages ? '#f3f4f6':'#fff', cursor: currentPage===totalPages ? 'default':'pointer' }}>›</button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage===totalPages}
            style={{ padding:'0.2rem 0.5rem', borderRadius:'6px', border:'1px solid #d1d5db', background: currentPage===totalPages ? '#f3f4f6':'#fff', cursor: currentPage===totalPages ? 'default':'pointer' }}>»</button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>⬍</span>;
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  return (
    <div>
      <div className="page-header">
        <h2>{t('products')}</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('products')}</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
            {isAdmin && isMobile ? (
              // מובייל — dropdown אחד + Add Product
              <>
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowActionsMenu(m => !m)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    ⚙️ {showActionsMenu ? '▲' : '▼'}
                  </button>
                  {showActionsMenu && (
                    <div style={{
                      position: 'absolute', top: '110%', right: 0, zIndex: 999,
                      background: 'white', border: '1px solid #dee2e6', borderRadius: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '200px', overflow: 'hidden'
                    }}>
                      {[
                        { icon: '📂', label: t('edit_categories') || 'Categories', action: () => { openNewCategory(); setShowActionsMenu(false); } },
                        { icon: '📁', label: t('edit_subcategories') || 'Subcategories', action: () => { setSelectedCategoryFilter(categories[0]?.id?.toString() || ''); setEditingSubcategory(null); setSubcategoryForm({ code: '', name: '' }); setShowSubcategoryModal(true); setShowActionsMenu(false); } },
                        { icon: '🏷️', label: t('edit_variant_attr_types') || 'Attributes', action: () => { openAddAttrType(); setShowActionsMenu(false); } },
                        { icon: '📦', label: t('product_types') || 'Product Types', action: () => { openAddProductType(); setShowActionsMenu(false); } },
                      ].map((item, i) => (
                        <button key={i} onClick={item.action} style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          width: '100%', padding: '0.75rem 1rem', background: 'none',
                          border: 'none', borderBottom: i < 2 ? '1px solid #f0f0f0' : 'none',
                          cursor: 'pointer', fontSize: '0.9rem', textAlign: 'right'
                        }}>
                          <span>{item.icon}</span> {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => { resetForm(); setShowModal(true); }}
                >
                  + {t('add_product')}
                </button>
              </>
            ) : (
              // דסקטופ — כפתורים רגילים
              <>
                {isAdmin && (
                <button className="btn btn-secondary" onClick={() => openNewCategory()}>
                  📂 {t('edit_categories') || 'Categories'}
                </button>
                )}
                {isAdmin && (
                <button className="btn btn-secondary" onClick={() => openAddAttrType()}>
                  🏷️ {t('edit_variant_attr_types') || 'Attributes'}
                </button>
                )}
                {isAdmin && (
                <button className="btn btn-secondary" onClick={() => openAddProductType()}>
                  📦 {t('product_types') || 'Product Types'}
                </button>
                )}
                {isAdmin && (
                <button className="btn btn-secondary" onClick={() => { setSelectedCategoryFilter(categories[0]?.id?.toString() || ''); setEditingSubcategory(null); setSubcategoryForm({ code: '', name: '' }); setShowSubcategoryModal(true); }}>
                  📁 {t('edit_subcategories') || 'Subcategories'}
                </button>
                )}
                {isAdmin && (
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                  {t('add_product')}
                </button>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: 1, minWidth: '180px' }}
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
          <select
            className="form-select"
            style={{ minWidth: '160px', flex: '0 0 auto' }}
            value={skuFilter}
            onChange={(e) => { setSkuFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="">🔖 {t('all_skus') || 'כל ה-SKU'}</option>
            {/* קבוצה ראשונה — XXX */}
            {[...new Set(products.map(p => p.sku?.split('-')[0]).filter(Boolean))].sort().map(seg1 => (
              <optgroup key={seg1} label={seg1}>
                <option value={seg1}>{seg1}</option>
                {[...new Set(products
                  .filter(p => p.sku?.startsWith(seg1 + '-'))
                  .map(p => p.sku?.split('-').slice(0,2).join('-'))
                  .filter(Boolean)
                )].sort().map(seg2 => (
                  <option key={seg2} value={seg2}>{seg2}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {isAdmin && (
            <button
              className={`btn ${showDiscontinued ? 'btn-warning' : 'btn-secondary'}`}
              style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', ...(showDiscontinued ? { background: '#fd7e14', border: 'none', color: 'white' } : {}) }}
              onClick={() => {
                const next = !showDiscontinued;
                setShowDiscontinued(next);
                fetchProducts(next);
              }}
            >
              {showDiscontinued ? `👁️ ${t('hide_discontinued') || 'הסתר מוסתרים'}` : `🚫 ${t('show_discontinued') || 'הצג מוסתרים'}`}
            </button>
          )}
        </div>

        {isMobile ? (
          /* ===== MOBILE CARD VIEW ===== */
          <div style={{ padding: '0.5rem' }}>
            {sortedProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>{t('no_data')}</div>
            ) : (
              sortedProducts.map(product => (
                <React.Fragment key={product.id}>
                <div style={{
                  background: !!product.is_parent ? '#fffbf0' : '#fff',
                  border: !!product.is_parent ? '1px solid #ffc107' : '1px solid #e0e0e0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                }}>
                  {/* Row 1: Name + stock badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {!!product.is_parent && (
                        <button onClick={() => toggleExpand(product.id)} style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.8rem' }}>
                          {expandedParents[product.id] ? '▼' : '▶'}
                        </button>
                      )}
                      {!!product.is_parent ? <span>⭐ </span> : null}
                      {getProductName(product, language)}
                      {(product.is_active === 0 || product.is_active === false) && (
                        <span style={{ fontSize: '0.7rem', background: '#6c757d', color: 'white', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>
                          {t('discontinued') || 'מוסתר'}
                        </span>
                      )}
                    </span>
                    {!!product.is_parent ? (
                      <span style={{ color: '#999', fontSize: '0.8rem' }}>—</span>
                    ) : (product.quantity < 0 || (product.min_quantity > 0 && product.quantity < product.min_quantity)) ? (
                      <span className="badge badge-danger">{product.quantity}</span>
                    ) : (
                      <span className="badge badge-success">{product.quantity}</span>
                    )}
                  </div>

                  {/* Row 2: SKU + Category */}
                  <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '0.35rem' }}>
                    <span>🔖 {product.sku}</span>
                    {product.category_name && <span style={{ marginLeft: '0.75rem' }}>📂 {getCategoryName(product, language)}</span>}
                  </div>

                  {/* Row 3: Unit + Supplier + Manufacturer */}
                  <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: '0.5rem' }}>
                    <span>📦 {getUnitTranslation(product.unit)}</span>
                    {product.supplier_name && <span style={{ marginLeft: '0.75rem' }}>🏭 {product.supplier_name}</span>}
                    {product.manufacturer_name && <span style={{ marginLeft: '0.75rem' }}>🏗️ {product.manufacturer_name}</span>}
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => handleEdit(product)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flex: 1 }}>
                        ✏️ {t('edit')}
                      </button>
                      {(product.is_active === 1 || product.is_active === true || product.is_active == null) ? (
                        <button className="btn btn-warning" onClick={() => handleDiscontinue(product)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', background: '#fd7e14', border: 'none', color: 'white' }}
                          title={t('discontinue') || 'הפסק שיווק'}>
                          🚫
                        </button>
                      ) : (
                        <button className="btn btn-success" onClick={() => handleDiscontinue(product)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                          title={t('restore_product') || 'שחזר'}>
                          ✅
                        </button>
                      )}
                      <button className="btn btn-danger" onClick={() => handleDelete(product.id)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        🗑️
                      </button>
                    </div>
                  )}
                </div>

                {/* כרטיסי דגמים */}
                {!!product.is_parent && expandedParents[product.id] && (variantsCache[product.id] || []).map(variant => (
                  <div key={variant.id} style={{ background: '#f9f9f9', border: '1px solid #dee2e6', borderLeft: '4px solid #ffc107', borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', marginRight: '1rem' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#555', marginBottom: '0.5rem' }}>└ {variant.sku}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <input type="number" min="0"
                          style={{ width: '65px', padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
                          value={editingQty[variant.id] !== undefined ? editingQty[variant.id] : (variant.quantity ?? 0)}
                          onChange={(e) => setEditingQty(q => ({ ...q, [variant.id]: e.target.value }))}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#888' }}>{t('quantity') || 'כמות'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <select style={{ padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.82rem' }}
                          value={editingUnit[variant.id] !== undefined ? editingUnit[variant.id] : (variant.unit ?? 'unit')}
                          onChange={(e) => setEditingUnit(u => ({ ...u, [variant.id]: e.target.value }))}>
                          <option value="unit">{t('unit_piece')}</option>
                          <option value="box">{t('unit_box')}</option>
                          <option value="carton">{t('unit_carton')}</option>
                          <option value="kg">{t('unit_kg')}</option>
                          <option value="liter">{t('unit_liter')}</option>
                          <option value="meter">{t('unit_meter')}</option>
                        </select>
                        <span style={{ fontSize: '0.72rem', color: '#888' }}>{t('unit') || 'יחידה'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div style={{ display: 'flex', gap: '0.2rem' }}>
                          <input type="number" min="0" step="0.01"
                            style={{ width: '70px', padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
                            value={editingPrice[variant.id] !== undefined ? editingPrice[variant.id] : (variant.price ?? 0)}
                            onChange={(e) => setEditingPrice(p => ({ ...p, [variant.id]: e.target.value }))}
                          />
                          <select style={{ padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.82rem' }}
                            value={editingCurrency[variant.id] !== undefined ? editingCurrency[variant.id] : (variant.currency ?? 'ILS')}
                            onChange={(e) => setEditingCurrency(c => ({ ...c, [variant.id]: e.target.value }))}>
                            <option value="ILS">ILS</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#888' }}>{t('price') || 'מחיר'}</span>
                      </div>
                      {(editingQty[variant.id] !== undefined || editingPrice[variant.id] !== undefined || editingUnit[variant.id] !== undefined || editingCurrency[variant.id] !== undefined || editingMinQty[variant.id] !== undefined) && (
                        <button onClick={() => saveVariantQty(variant.id, product.id)}
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-end' }}>✓</button>
                      )}
                    </div>
                  </div>
                ))}
                </React.Fragment>
              ))
            )}
            <PaginationBar />
          </div>
        ) : (
          /* ===== DESKTOP TABLE VIEW ===== */
          <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => handleSort('sku')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('sku')} <SortIcon field="sku" />
                </th>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('name')} <SortIcon field="name" />
                </th>
                <th onClick={() => handleSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('category')} <SortIcon field="category" />
                </th>
                <th>{t('quantity')}</th>
                <th>{t('unit')}</th>
                <th>{t('suppliers') || 'Supplier'}</th>
                <th>{t('manufacturers') || 'Manufacturer'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center">{t('no_data')}</td>
                </tr>
              ) : (
                sortedProducts.map(product => (
                  <React.Fragment key={product.id}>
                  <tr key={product.id} style={{ background: !!product.is_parent ? '#fffbf0' : '' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{product.sku}</td>
                    <td>
                      {!!!!product.is_parent ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button onClick={() => toggleExpand(product.id)} style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.8rem', lineHeight: 1 }}>
                            {expandedParents[product.id] ? '▼' : '▶'}
                          </button>
                          <span>⭐ {getProductName(product, language)}</span>
                          {(product.is_active === 0 || product.is_active === false) && (
                            <span style={{ fontSize: '0.7rem', background: '#6c757d', color: 'white', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{t('discontinued') || 'מוסתר'}</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {getProductName(product, language)}
                          {(product.is_active === 0 || product.is_active === false) && (
                            <span style={{ fontSize: '0.7rem', background: '#6c757d', color: 'white', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{t('discontinued') || 'מוסתר'}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td>{getCategoryName(product, language)}</td>
                    <td>
                      {!!!!product.is_parent ? (
                        <span style={{ color: '#999', fontSize: '0.8rem' }}>—</span>
                      ) : (product.quantity < 0 || (product.min_quantity > 0 && product.quantity < product.min_quantity)) ? (
                        <span className="badge badge-danger">{product.quantity}</span>
                      ) : (
                        <span className="badge badge-success">{product.quantity}</span>
                      )}
                    </td>
                    <td>{getUnitTranslation(product.unit)}</td>
                    <td>{product.supplier_name || '-'}</td>
                    <td>{product.manufacturer_name || '-'}</td>
                    <td>
                      {isAdmin && (
                      <div className="table-actions">
                        <button className="btn btn-secondary" onClick={() => handleEdit(product)}>{t('edit')}</button>
                        {(product.is_active === 1 || product.is_active === true || product.is_active == null) ? (
                          <button className="btn btn-warning" onClick={() => handleDiscontinue(product)}
                            style={{ background: '#fd7e14', border: 'none', color: 'white' }}
                            title={t('discontinue') || 'הפסק שיווק'}>
                            🚫 {t('discontinue') || 'הפסק'}
                          </button>
                        ) : (
                          <button className="btn btn-success" onClick={() => handleDiscontinue(product)}
                            title={t('restore_product') || 'שחזר'}>
                            ✅ {t('restore_product') || 'שחזר'}
                          </button>
                        )}
                        <button className="btn btn-danger" onClick={() => handleDelete(product.id)}>{t('delete')}</button>
                      </div>
                      )}
                    </td>
                  </tr>
                  {/* מיני-טבלת דגמים עם pagination */}
                  {!!product.is_parent && expandedParents[product.id] && (() => {
                    const allVariants = variantsCache[product.id] || [];
                    const vPage = variantPage[product.id] || 1;
                    const vTotalPages = Math.ceil(allVariants.length / VARIANT_PAGE_SIZE) || 1;
                    const vStart = (vPage - 1) * VARIANT_PAGE_SIZE;
                    const pageVariants = allVariants.slice(vStart, vStart + VARIANT_PAGE_SIZE);
                    return (
                      <tr key={`variants-${product.id}`}>
                        <td colSpan="8" style={{ padding: 0, background: '#fffdf0' }}>
                          <div style={{ marginLeft: '2rem', borderLeft: '4px solid #ffc107' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: '#fff8e1', borderBottom: '1px solid #ffc107' }}>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: '0.78rem' }}>SKU</th>
                                  <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#666', fontSize: '0.78rem' }}>{t('name')}</th>
                                  <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#666', fontSize: '0.78rem' }}>{t('quantity')}</th>
                                  <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#666', fontSize: '0.78rem' }}>{t('min_quantity')}</th>
                                  <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#666', fontSize: '0.78rem' }}>{t('price')}</th>
                                  <th style={{ padding: '0.4rem 0.6rem' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {pageVariants.map(variant => (
                                  <tr key={variant.id} style={{ borderBottom: '1px solid #f0e6c0' }}>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#555' }}>└ {variant.sku}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', color: '#444' }}>{getProductName(variant, language) || variant.sku}</td>
                                    <td style={{ padding: '0.4rem 0.6rem' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <input type="number" min="0" style={{ width: '65px', padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
                                          value={editingQty[variant.id] !== undefined ? editingQty[variant.id] : (variant.quantity ?? 0)}
                                          onChange={(e) => setEditingQty(q => ({ ...q, [variant.id]: e.target.value }))} />
                                        <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{t('quantity')}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.4rem 0.6rem' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <input type="number" min="0" style={{ width: '65px', padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
                                          value={editingMinQty[variant.id] !== undefined ? editingMinQty[variant.id] : (variant.min_quantity ?? 0)}
                                          onChange={(e) => setEditingMinQty(q => ({ ...q, [variant.id]: e.target.value }))} />
                                        <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{t('min_quantity')}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.4rem 0.6rem' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                          <input type="number" min="0" step="0.01" style={{ width: '72px', padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
                                            value={editingPrice[variant.id] !== undefined ? editingPrice[variant.id] : (variant.price ?? 0)}
                                            onChange={(e) => setEditingPrice(p => ({ ...p, [variant.id]: e.target.value }))} />
                                          <select style={{ padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.82rem' }}
                                            value={editingCurrency[variant.id] !== undefined ? editingCurrency[variant.id] : (variant.currency ?? 'ILS')}
                                            onChange={(e) => setEditingCurrency(c => ({ ...c, [variant.id]: e.target.value }))}>
                                            <option value="ILS">ILS</option>
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                          </select>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{t('price')}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.4rem 0.6rem' }}>
                                      {(editingQty[variant.id] !== undefined || editingPrice[variant.id] !== undefined || editingUnit[variant.id] !== undefined || editingCurrency[variant.id] !== undefined || editingMinQty[variant.id] !== undefined) && (
                                        <button onClick={() => saveVariantQty(variant.id, product.id)}
                                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                          ✓ {t('save') || 'שמור'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {vTotalPages > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem', padding: '0.4rem 0.6rem', background: '#fff8e1', borderTop: '1px solid #f0e6c0', fontSize: '0.82rem' }}>
                                <span style={{ color: '#666' }}>{allVariants.length} {t('variants') || 'דגמים'}</span>
                                <button onClick={() => setVariantPage(p => ({ ...p, [product.id]: Math.max(1, vPage - 1) }))} disabled={vPage === 1}
                                  style={{ padding: '0.15rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', background: vPage === 1 ? '#f3f4f6' : 'white', cursor: vPage === 1 ? 'default' : 'pointer' }}>‹</button>
                                <span>{vPage} / {vTotalPages}</span>
                                <button onClick={() => setVariantPage(p => ({ ...p, [product.id]: Math.min(vTotalPages, vPage + 1) }))} disabled={vPage === vTotalPages}
                                  style={{ padding: '0.15rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', background: vPage === vTotalPages ? '#f3f4f6' : 'white', cursor: vPage === vTotalPages ? 'default' : 'pointer' }}>›</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
            <PaginationBar />
          </div>
        )}
      </div>

      {showVariantsModal && (() => {
        // חישוב category/subcategory prefix
        const cat = categories.find(c => String(c.id) === String(formData.category_id));
        const sub = subcategories.find(s => String(s.id) === String(formData.subcategory_id));
        const catCode = (cat?.code || (cat?.name || 'CAT').slice(0,3)).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
        const subCode = sub ? (sub?.code || (sub?.name || 'SUB').slice(0,3)).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3) : null;
        const prefix = subCode ? `${catCode}-${subCode}` : catCode;

        // תצוגה מקדימה — מכפלה קרטזית
        const filledAttrs = variantAttrs.filter(a => a.name.trim() && a.values.some(v => v.trim()));
        const valueSets = filledAttrs.map(a => a.values.filter(v => v.trim()).map(v => v.trim().toUpperCase()));
        const combos = valueSets.length > 0 ? cartesian(valueSets) : [];
        const skuPreviews = combos.map(combo => {
          const parts = filledAttrs.map((a, i) => combo[i]);
          return `${prefix}-${parts.join('-')}`;
        });

        return (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <h3 className="modal-title">⭐ {t('variant_attrs_title') || 'הגדרת מאפייני דגמים'}</h3>
                <button className="modal-close" onClick={() => setShowVariantsModal(false)}>×</button>
              </div>
              <div className="modal-body">
                {/* דוגמה */}
                <div style={{ background: '#f0f4ff', border: '1px solid #c7d7fa', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#334' }}>
                  <strong>📋 {t('example') || 'דוגמה'}:</strong><br/>
                  <span style={{ fontFamily: 'monospace' }}>
                    {t('variant_example_1') || 'צבע: BLK BLU GRN | מידה: UNI'}<br/>
                    → {prefix}-BLK-UNI &nbsp; {prefix}-BLU-UNI &nbsp; {prefix}-GRN-UNI
                  </span>
                </div>

                {/* שדות מאפיינים */}
                {variantAttrs.map((attr, ai) => (
                  <div key={ai} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem', background: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', margin: 0 }}>{t('attr_name') || 'שם מאפיין'} {ai + 1}</label>
                      {variantAttrs.length > 1 && (
                        <button type="button" onClick={() => {
                          setVariantAttrs(variantAttrs.filter((_, i) => i !== ai));
                        }} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }} title="הסר מאפיין">×</button>
                      )}
                    </div>
                    {attrTypes.length > 0 ? (
                      <MobilePicker
                        options={[{ value: '', label: t('select_attr_type') || 'בחר מאפיין...' }, ...attrTypes.map(at => {
                          const lang = localStorage.getItem('language') || 'he';
                          const label = lang === 'he' ? (at.name_he || at.name) : lang === 'pt' ? (at.name_pt || at.name) : at.name;
                          return { value: at.name, label };
                        })]}
                        value={attr.name}
                        onChange={(val) => { const updated = [...variantAttrs]; updated[ai] = { ...updated[ai], name: val }; setVariantAttrs(updated); }}
                        placeholder={t('select_attr_type') || 'בחר מאפיין...'} label={t('attr_name') || 'מאפיין'}
                      />
                    ) : (
                      <input className="form-input" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}
                        placeholder={ai === 0 ? (t('attr_name_placeholder_1') || 'למשל: צבע / Color') : (t('attr_name_placeholder_2') || 'למשל: מידה / Size')}
                        value={attr.name}
                        onChange={(e) => {
                          const updated = [...variantAttrs];
                          updated[ai] = { ...updated[ai], name: e.target.value };
                          setVariantAttrs(updated);
                        }} />
                    )}
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('attr_values') || 'ערכים'}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {attr.values.map((val, vi) => (
                        <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <input className="form-input" style={{ width: '70px', fontSize: '0.85rem', fontFamily: 'monospace', textTransform: 'uppercase', padding: '0.3rem 0.4rem' }}
                            placeholder="BLK"
                            maxLength={5}
                            value={val}
                            onChange={(e) => {
                              const updated = [...variantAttrs];
                              updated[ai].values[vi] = e.target.value.toUpperCase();
                              setVariantAttrs(updated);
                            }} />
                          {attr.values.length > 1 && (
                            <button type="button" onClick={() => {
                              const updated = [...variantAttrs];
                              updated[ai].values = updated[ai].values.filter((_, i) => i !== vi);
                              setVariantAttrs(updated);
                            }} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => {
                        const updated = [...variantAttrs];
                        updated[ai].values = [...updated[ai].values, ''];
                        setVariantAttrs(updated);
                      }} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', border: '1px dashed #007bff', borderRadius: '4px', background: 'white', color: '#007bff', cursor: 'pointer' }}>
                        + {t('add_value') || 'ערך'}
                      </button>
                    </div>
                  </div>
                ))}

                {/* כפתור הוספת מאפיין */}
                <button type="button" onClick={() => {
                  setVariantAttrs([...variantAttrs, { name: '', values: [''] }]);
                }} style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', border: '1px dashed #6c757d', borderRadius: '8px', background: 'white', color: '#6c757d', cursor: 'pointer', marginBottom: '0.75rem' }}>
                  + {t('add_attribute') || 'הוסף מאפיין'}
                </button>

                {/* תצוגה מקדימה */}
                {skuPreviews.length > 0 && (
                  <div style={{ background: '#f0fff4', border: '1px solid #28a745', borderRadius: '8px', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>👁️ {t('sku_preview') || 'תצוגה מקדימה'} ({skuPreviews.length} {t('variants') || 'דגמים'}):</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                      {skuPreviews.map((sku, i) => (
                        <span key={i} style={{ background: '#d4edda', borderRadius: '4px', padding: '0.2rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>✅ {sku}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => {
                  if (filledAttrs.length === 0) { alert(t('variant_attrs_required') || 'יש להגדיר לפחות מאפיין אחד'); return; }
                  // שמור את המאפיינים ב-formData
                  const attrsStr = filledAttrs.map(a => `[${a.name}=${a.values.filter(v=>v.trim()).join(',')}]`).join('');
                  setFormData(f => ({ ...f, variant_attrs: attrsStr }));
                  setShowVariantsModal(false);
                }}>
                  💾 {t('save') || 'שמור'}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowVariantsModal(false)}>
                  {t('cancel') || 'ביטול'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingProduct ? t('edit_product') : t('add_product')}
              </h3>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* מוצר אב */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_parent}
                    onChange={(e) => {
                      setFormData({ ...formData, is_parent: e.target.checked, variant_attrs: '' });
                      if (e.target.checked) {
                        setVariantAttrs([{ name: '', values: [''] }]);
                        setShowVariantsModal(true);
                      }
                    }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    ⭐ {t('is_parent_product') || 'מוצר אב (עם דגמים)'}
                  </span>
                </label>
                {formData.is_parent && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Product Type dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '180px' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 500, whiteSpace: 'nowrap' }}>📦 {t('product_type') || 'סוג מוצר'}:</label>
                      <div style={{ flex: 1 }}>
                        <MobilePicker
                          options={[{ value: '', label: `— ${t('none') || 'ללא'} —` }, ...productTypeCodes.map(pt => {
                            const lang = localStorage.getItem('language') || 'he';
                            const label = lang === 'he' ? (pt.name_he || pt.name) : lang === 'pt' ? (pt.name_pt || pt.name) : pt.name;
                            return { value: pt.code, label: `${pt.code} — ${label}` };
                          })]}
                          value={formData.product_type_code || ''}
                          onChange={(val) => setFormData({ ...formData, product_type_code: val })}
                          placeholder={`— ${t('none') || 'ללא'} —`} label={t('product_type') || 'סוג מוצר'}
                        />
                      </div>
                    </div>
                    {formData.variant_attrs && (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', background: '#f0fff4', border: '1px solid #28a745', borderRadius: '4px', padding: '0.2rem 0.5rem' }}>
                        {formData.variant_attrs}
                      </span>
                    )}
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                      onClick={() => setShowVariantsModal(true)}>
                      ✏️ {t('define_variants') || 'הגדר דגמים'}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('sku')} * <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 400 }}>XXX-XXX-XXX-XXX</span></label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'monospace', letterSpacing: '0.05em', background: formData.is_parent ? '#f0f0f0' : '', color: formData.is_parent ? '#999' : '' }}
                    value={formData.sku}
                    onChange={(e) => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                    placeholder="ABC-123-XYZ-456"
                    disabled={formData.is_parent}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {t('name')} *
                    <span style={{ marginRight: '0.5rem', fontSize: '0.8rem', color: '#666', fontWeight: 'normal' }}>
                      ({language === 'he' ? '🇮🇱 עברית' : language === 'pt' ? '🇵🇹 Português' : '🇬🇧 English'} - {t('auto_translate') || 'יתורגם אוטומטית'})
                    </span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('description')}</label>
                <textarea
                  className="form-textarea"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('category')}</label>
                  <MobilePicker
                    options={[{ value: '', label: t('select_category') }, ...categories.map(cat => {
                      const label = language === 'he' ? (cat.name_he || cat.name) : language === 'pt' ? (cat.name_pt || cat.name) : cat.name;
                      return { value: String(cat.id), label: cat.code ? `${cat.code} — ${label}` : label };
                    })]}
                    value={String(formData.category_id)}
                    onChange={(val) => setFormData({...formData, category_id: val, subcategory_id: ''})}
                    placeholder={t('select_category')} label={t('category')}
                  />
                </div>

                {/* סאב-קטגוריה */}
                {formData.category_id && subcategories.filter(s => String(s.category_id) === String(formData.category_id)).length > 0 && (
                  <div className="form-group">
                    <label className="form-label">{t('subcategory') || 'סאב-קטגוריה'}</label>
                    <MobilePicker
                      options={[{ value: '', label: t('select_subcategory') || 'בחר סאב-קטגוריה' }, ...subcategories.filter(s => String(s.category_id) === String(formData.category_id)).map(sub => ({ value: String(sub.id), label: getSubcatDisplayName(sub) }))]}
                      value={String(formData.subcategory_id)}
                      onChange={(val) => setFormData({...formData, subcategory_id: val})}
                      placeholder={t('select_subcategory') || 'בחר סאב-קטגוריה'} label={t('subcategory') || 'סאב-קטגוריה'}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('unit')}</label>
                  <MobilePicker
                    options={[{ value: 'unit', label: t('unit_piece') }, { value: 'box', label: t('unit_box') }, { value: 'carton', label: t('unit_carton') }, { value: 'kg', label: t('unit_kg') }, { value: 'liter', label: t('unit_liter') }, { value: 'meter', label: t('unit_meter') }]}
                    value={formData.unit}
                    onChange={(val) => setFormData({...formData, unit: val})}
                    label={t('unit')}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('suppliers') || 'Supplier'}</label>
                  <MobilePicker
                    options={[{ value: '', label: t('select') || '— None —' }, ...suppliers.map(s => ({ value: String(s.id), label: s.name }))]}
                    value={String(formData.supplier_id)}
                    onChange={(val) => setFormData({...formData, supplier_id: val})}
                    placeholder={t('select') || '— None —'} label={t('suppliers') || 'Supplier'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('manufacturers') || 'Manufacturer'}</label>
                  <MobilePicker
                    options={[{ value: '', label: t('select') || '— None —' }, ...manufacturers.map(m => ({ value: String(m.id), label: m.name }))]}
                    value={String(formData.manufacturer_id)}
                    onChange={(val) => setFormData({...formData, manufacturer_id: val})}
                    placeholder={t('select') || '— None —'} label={t('manufacturers') || 'Manufacturer'}
                  />
                </div>
              </div>

              <div className="form-row">
                {isAdmin && (
                  <div className="form-group">
                    <label className="form-label">{t('price')}</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number" step="0.01" className="form-input"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: e.target.value})}
                        onBlur={(e) => { if (e.target.value) { const formatted = parseFloat(e.target.value).toFixed(2); setFormData({...formData, price: formatted}); } }}
                        placeholder="0.00" disabled={formData.is_parent}
                        style={{ textAlign: 'right', fontFamily: 'monospace', flex: 2, background: formData.is_parent ? '#f0f0f0' : '', color: formData.is_parent ? '#999' : '' }}
                      />
                      <div style={{ flex: 1 }}>
                        <MobilePicker
                          options={[{ value: 'ILS', label: '₪ ILS' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }]}
                          value={formData.currency}
                          onChange={(val) => setFormData({...formData, currency: val})}
                          label="Currency" disabled={formData.is_parent}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* היסטוריית מחירים - רק בעריכה */}
                {isAdmin && editingProduct && (
                  <div className="form-group" style={{ background: '#f8f9fa', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e9ecef' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ margin: 0 }}>📈 {t('price_history') || 'היסטוריית מחירים'}</label>
                      <button type="button"
                        onClick={() => setShowAddPrice(!showAddPrice)}
                        style={{ background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        {showAddPrice ? '✕' : `+ ${t('add_price') || 'הוסף מחיר חדש'}`}
                      </button>
                    </div>

                    {/* שדה הוספת מחיר */}
                    {showAddPrice && (
                      <div style={{ background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px auto', gap: '0.4rem', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>{t('price') || 'מחיר'}</label>
                            <input 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              className="form-input"
                              value={newPrice.price}
                              onChange={e => setNewPrice(p => ({ ...p, price: e.target.value }))}
                              onBlur={(e) => {
                                if (e.target.value) {
                                  const formatted = parseFloat(e.target.value).toFixed(2);
                                  setNewPrice(p => ({ ...p, price: formatted }));
                                }
                              }}
                              style={{ textAlign: 'right', fontFamily: 'monospace' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>{t('currency') || 'מטבע'}</label>
                            <select className="form-select" value={newPrice.currency} onChange={e => setNewPrice(p => ({ ...p, currency: e.target.value }))}>
                              <option value="ILS">ILS</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>{t('date') || 'תאריך'}</label>
                            <input type="date" className="form-input"
                              value={newPrice.effective_date}
                              onChange={e => setNewPrice(p => ({ ...p, effective_date: e.target.value }))} />
                          </div>
                          <button type="button"
                            onClick={async () => {
                              if (!newPrice.price) return;
                              try {
                                await axios.post(`/api/products/${editingProduct.id}/price-history`, newPrice);
                                const res = await axios.get(`/api/products/${editingProduct.id}/price-history`);
                                setPriceHistory(res.data);
                                setFormData(p => ({ ...p, price: newPrice.price, currency: newPrice.currency }));
                                setShowAddPrice(false);
                                setNewPrice({ price: '', currency: newPrice.currency, effective_date: new Date().toISOString().split('T')[0] });
                              } catch(e) { alert('שגיאה'); }
                            }}
                            style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '0.35rem 0.7rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                            💾 {t('save') || 'שמור'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* טבלת היסטוריה */}
                    {priceHistory.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#e9ecef' }}>
                            <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('date') || 'תאריך'}</th>
                            <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('price') || 'מחיר'}</th>
                            <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('currency') || 'מטבע'}</th>
                            <th style={{ width: '40px', borderBottom: '1px solid #dee2e6' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {priceHistory.map((h, i) => (
                            <tr key={h.id} style={{ background: i === 0 ? '#e8f5e9' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '0.3rem 0.6rem' }}>{h.effective_date}</td>
                              <td style={{ padding: '0.3rem 0.6rem', fontWeight: i === 0 ? 700 : 400 }}>
                                {parseFloat(h.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                {i === 0 && <span style={{ marginRight: '0.3rem', color: '#28a745', fontSize: '0.75rem' }}> ✓ {t('current') || 'נוכחי'}</span>}
                              </td>
                              <td style={{ padding: '0.3rem 0.6rem', color: '#666' }}>{h.currency}</td>
                              <td style={{ padding: '0.3rem 0.4rem', textAlign: 'center' }}>
                                <button type="button" onClick={async () => {
                                  if (!window.confirm(t('confirm_delete') || 'למחוק?')) return;
                                  await axios.delete(`/api/products/${editingProduct.id}/price-history/${h.id}`);
                                  const res = await axios.get(`/api/products/${editingProduct.id}/price-history`);
                                  setPriceHistory(res.data);
                                }} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ color: '#aaa', fontSize: '0.82rem', textAlign: 'center', padding: '0.5rem' }}>
                        {t('no_price_history') || 'אין היסטוריית מחירים'}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('quantity')}</label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ background: formData.is_parent ? '#f0f0f0' : '', color: formData.is_parent ? '#999' : '' }}
                    value={formData.is_parent ? 0 : formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    disabled={formData.is_parent}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('min_quantity')}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.min_quantity}
                    onChange={(e) => setFormData({...formData, min_quantity: e.target.value})}
                    disabled={formData.is_parent}
                    style={{ background: formData.is_parent ? '#f0f0f0' : '', color: formData.is_parent ? '#999' : '' }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Category Management Modal ── */}
      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '520px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📂 {t('edit_categories') || 'ערוך קטגוריות'}</h3>
              <button className="modal-close" onClick={() => { setShowCategoryModal(false); setEditingCategory(null); setCategoryForm({ code: '', name: '' }); }}>×</button>
            </div>
            <div className="modal-body">
              {/* רשימה קיימת */}
              {categories.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  {categories.map(cat => {
                    const label = language === 'he' ? (cat.name_he || cat.name) : language === 'pt' ? (cat.name_pt || cat.name) : cat.name;
                    return (
                      <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#f8f9fa', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }}>
                        <span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#e9ecef', borderRadius: '4px', padding: '0.1rem 0.4rem', marginRight: '0.5rem' }}>{cat.code || '—'}</span>
                          {label}
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => openEditCategory(cat)}>✏️</button>
                          <button className="btn btn-danger" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => handleDeleteCategory(cat.id)}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* טופס הוספה/עריכה */}
              <div style={{ borderTop: categories.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: categories.length > 0 ? '1.2rem' : '0' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                  {editingCategory ? `✏️ ${t('edit_category') || 'ערוך קטגוריה'}` : `➕ ${t('add_category') || 'הוסף קטגוריה'}`}
                </h4>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: '0 0 90px' }}>
                    <label className="form-label">📌 {t('category_code') || 'קוד'} *</label>
                    <input className="form-input" type="text" maxLength={3}
                      value={categoryForm.code}
                      onChange={e => setCategoryForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z]/g,'') }))}
                      placeholder="MAR"
                      style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">
                      {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                      {t('category_name') || 'שם קטגוריה'} *
                    </label>
                    <input className="form-input" type="text"
                      value={categoryForm.name}
                      onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={language === 'he' ? 'למשל: ציוד ים' : language === 'pt' ? 'ex: Equipamento' : 'e.g. Maritime Equipment'} />
                  </div>
                </div>
                <small style={{ color: '#6c757d', fontSize: '0.78rem', marginTop: '0.3rem', display: 'block' }}>
                  {language === 'he' ? 'השם יתורגם אוטומטית לכל השפות ✨' : language === 'pt' ? 'O nome será traduzido automaticamente ✨' : 'Name will be auto-translated to all languages ✨'}
                </small>
              </div>
            </div>

            <div className="modal-footer">
              {editingCategory && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingCategory(null); setCategoryForm({ code: '', name: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingCategory || !categoryForm.code.trim() || !categoryForm.name.trim()}
                onClick={handleSaveCategory}>
                {savingCategory ? '...' : (editingCategory ? t('save') : `➕ ${t('add_category') || 'הוסף'}`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subcategory Management Modal ── */}
      {showSubcategoryModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '580px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📁 {t('edit_subcategories') || 'ערוך סאב-קטגוריות'}</h3>
              <button className="modal-close" onClick={() => { setShowSubcategoryModal(false); setEditingSubcategory(null); setSubcategoryForm({ code: '', name: '' }); }}>×</button>
            </div>

            <div className="modal-body">
              {/* בחירת קטגוריה אב */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">📂 {t('category') || 'קטגוריה'}</label>
                <MobilePicker
                  options={[
                    { value: '', label: t('select_category') || 'בחר קטגוריה' },
                    ...categories.map(cat => {
                      const label = language === 'he' ? (cat.name_he || cat.name) : language === 'pt' ? (cat.name_pt || cat.name) : cat.name;
                      return { value: String(cat.id), label: cat.code ? `${cat.code} — ${label}` : label };
                    })
                  ]}
                  value={String(selectedCategoryFilter)}
                  onChange={val => { setSelectedCategoryFilter(val); setEditingSubcategory(null); setSubcategoryForm({ code: '', name: '' }); }}
                  placeholder={t('select_category') || 'בחר קטגוריה'}
                  label={t('category') || 'קטגוריה'}
                />
              </div>

              {selectedCategoryFilter && (
                <>
                  {/* סאב-קטגוריות קיימות */}
                  {subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).length > 0 && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      {subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).map(sub => {
                        const label = language === 'he' ? (sub.name_he || sub.name) : language === 'pt' ? (sub.name_pt || sub.name) : sub.name;
                        return (
                          <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#f8f9fa', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }}>
                            <span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#e9ecef', borderRadius: '4px', padding: '0.1rem 0.4rem', marginRight: '0.5rem' }}>{sub.code || '—'}</span>
                              {label}
                            </span>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => openEditSubcategory(sub)}>✏️</button>
                              <button className="btn btn-danger" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => handleDeleteSubcategory(sub.id)}>🗑️</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* טופס הוספה/עריכה */}
                  <div style={{ borderTop: subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).length > 0 ? '1.2rem' : '0' }}>
                    <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                      {editingSubcategory ? `✏️ ${t('edit_subcategory') || 'ערוך'}` : `➕ ${t('add_subcategory') || 'הוסף סאב-קטגוריה'}`}
                    </h4>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ marginBottom: 0, flex: '0 0 90px' }}>
                        <label className="form-label">📌 {t('subcategory_code') || 'קוד'} *</label>
                        <input className="form-input" type="text" maxLength={3}
                          value={subcategoryForm.code}
                          onChange={e => setSubcategoryForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z]/g,'') }))}
                          placeholder="DIV"
                          style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <label className="form-label">
                          {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                          {t('subcategory_name') || 'שם סאב-קטגוריה'} *
                        </label>
                        <input className="form-input" type="text"
                          value={subcategoryForm.name}
                          onChange={e => setSubcategoryForm(f => ({ ...f, name: e.target.value }))}
                          placeholder={language === 'he' ? 'למשל: צלילה' : language === 'pt' ? 'ex: Mergulho' : 'e.g. Diving'} />
                      </div>
                    </div>
                    <small style={{ color: '#6c757d', fontSize: '0.78rem', marginTop: '0.3rem', display: 'block' }}>
                      {language === 'he' ? 'השם יתורגם אוטומטית לכל השפות ✨' : language === 'pt' ? 'O nome será traduzido automaticamente ✨' : 'Name will be auto-translated to all languages ✨'}
                    </small>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {editingSubcategory && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingSubcategory(null); setSubcategoryForm({ code: '', name: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingSubcategory || !subcategoryForm.code.trim() || !subcategoryForm.name.trim() || !selectedCategoryFilter}
                onClick={handleSaveSubcategory}>
                {savingSubcategory ? '...' : (editingSubcategory ? t('save') : `➕ ${t('add_subcategory') || 'הוסף'}`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── מודל ניהול מאפייני דגמים ───────────────────────────────────────── */}
      {showAttrTypesModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">🏷️ {t('variant_attr_types_title') || 'ניהול מאפייני דגמים'}</h3>
              <button className="modal-close" onClick={() => { setShowAttrTypesModal(false); setEditingAttrType(null); setAttrTypeForm({ name: '' }); }}>×</button>
            </div>
            <div className="modal-body">
              {/* רשימת מאפיינים קיימים */}
              {attrTypes.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  {attrTypes.map(at => {
                    const lang = localStorage.getItem('language') || 'he';
                    const label = lang === 'he' ? (at.name_he || at.name) : lang === 'pt' ? (at.name_pt || at.name) : at.name;
                    return (
                      <div key={at.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#f8f9fa', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontWeight: 500 }}>{label}</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => openEditAttrType(at)}>✏️</button>
                          <button className="btn btn-danger" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => handleDeleteAttrType(at.id)}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* טופס הוספה/עריכה */}
              <div style={{ borderTop: attrTypes.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: attrTypes.length > 0 ? '1.2rem' : '0' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                  {editingAttrType ? `✏️ ${t('edit_variant_attr_type') || 'ערוך מאפיין'}` : `➕ ${t('add_variant_attr_type') || 'הוסף מאפיין'}`}
                </h4>
                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label className="form-label">
                    {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                    {t('variant_attr_type_name') || 'שם מאפיין'} *
                  </label>
                  <input className="form-input" type="text" value={attrTypeForm.name}
                    onChange={e => setAttrTypeForm({ name: e.target.value })}
                    placeholder={language === 'he' ? 'למשל: צבע' : language === 'pt' ? 'ex: Cor' : 'e.g. Color'} />
                  <small style={{ color: '#6c757d', fontSize: '0.78rem' }}>
                    {language === 'he' ? 'יתורגם אוטומטית לכל השפות ✨' : language === 'pt' ? 'Será traduzido automaticamente ✨' : 'Will be auto-translated to all languages ✨'}
                  </small>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {editingAttrType && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingAttrType(null); setAttrTypeForm({ name: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingAttrType || !attrTypeForm.name.trim()}
                onClick={handleSaveAttrType}>
                {savingAttrType ? '...' : (editingAttrType ? t('save') : `➕ ${t('add_variant_attr_type') || 'הוסף'}`)}
              </button>
            </div>
          </div>
        </div>
      )}
      )}

      {/* ── מודל ניהול קודי סוג מוצר ──────────────────────────────────────── */}
      {showProductTypeModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">📦 {t('product_types_title') || 'ניהול קודי סוג מוצר'}</h3>
              <button className="modal-close" onClick={() => { setShowProductTypeModal(false); setEditingProductType(null); setProductTypeForm({ code: '', name: '' }); }}>×</button>
            </div>
            <div className="modal-body">
              {/* כפתור Import CSV */}
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ cursor: importingCsv ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.9rem', fontSize: '0.85rem', fontWeight: 500, opacity: importingCsv ? 0.6 : 1 }}>
                  {importingCsv ? '⏳ ...' : '📥 Import CSV'}
                  <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleImportCsv} disabled={importingCsv} />
                </label>
                <small style={{ color: '#6c757d', fontSize: '0.78rem' }}>
                  {language === 'he' ? 'פורמט: code,שם (לדוגמה: CYL,בלון)' : 'Format: code,name (e.g. CYL,Cylinder)'}
                </small>
              </div>
              {importCsvResult && (
                <div style={{ marginBottom: '1rem', padding: '0.6rem 0.9rem', borderRadius: '6px', fontSize: '0.83rem',
                  background: importCsvResult.error ? '#fff3f3' : '#f0fff4',
                  border: `1px solid ${importCsvResult.error ? '#dc3545' : '#28a745'}`,
                  color: importCsvResult.error ? '#dc3545' : '#155724' }}>
                  {importCsvResult.error ? `❌ ${importCsvResult.error}` :
                    `✅ ${importCsvResult.success} ${language === 'he' ? 'נוספו' : 'imported'} · ${importCsvResult.skipped} ${language === 'he' ? 'דולגו' : 'skipped'}${importCsvResult.errors?.length ? ` · ❌ שגיאה: ${importCsvResult.errors.join(', ')}` : ''}`
                  }
                </div>
              )}

              {/* רשימה קיימת */}
              {productTypeCodes.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  {productTypeCodes.map(pt => {
                    const lang = localStorage.getItem('language') || 'he';
                    const label = lang === 'he' ? (pt.name_he || pt.name) : lang === 'pt' ? (pt.name_pt || pt.name) : pt.name;
                    return (
                      <div key={pt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#f8f9fa', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }}>
                        <span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#e9ecef', borderRadius: '4px', padding: '0.1rem 0.4rem', marginRight: '0.5rem' }}>{pt.code}</span>
                          {label}
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => openEditProductType(pt)}>✏️</button>
                          <button className="btn btn-danger" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => handleDeleteProductType(pt.id)}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* טופס הוספה/עריכה */}
              <div style={{ borderTop: productTypeCodes.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: productTypeCodes.length > 0 ? '1.2rem' : '0' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                  {editingProductType ? `✏️ ${t('edit_product_type') || 'ערוך סוג מוצר'}` : `➕ ${t('add_product_type') || 'הוסף סוג מוצר'}`}
                </h4>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: '0 0 90px' }}>
                    <label className="form-label">📌 {t('sku_code') || 'קוד SKU'} *</label>
                    <input className="form-input" type="text" maxLength={3}
                      value={productTypeForm.code}
                      onChange={e => setProductTypeForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z]/g,'') }))}
                      placeholder="CYL"
                      style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">
                      {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                      {t('product_type_name') || 'שם סוג המוצר'} *
                    </label>
                    <input className="form-input" type="text"
                      value={productTypeForm.name}
                      onChange={e => setProductTypeForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={language === 'he' ? 'למשל: בלון' : language === 'pt' ? 'ex: Cilindro' : 'e.g. Cylinder'} />
                  </div>
                </div>
                <small style={{ color: '#6c757d', fontSize: '0.78rem', marginTop: '0.3rem', display: 'block' }}>
                  {language === 'he' ? 'השם יתורגם אוטומטית לכל השפות ✨' : language === 'pt' ? 'O nome será traduzido automaticamente ✨' : 'Name will be auto-translated to all languages ✨'}
                </small>
              </div>
            </div>

            <div className="modal-footer">
              {editingProductType && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingProductType(null); setProductTypeForm({ code: '', name: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingProductType || !productTypeForm.code.trim() || !productTypeForm.name.trim()}
                onClick={handleSaveProductType}>
                {savingProductType ? '...' : (editingProductType ? t('save') : `➕ ${t('add_product_type') || 'הוסף'}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
