import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';

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

function Products() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ value: '' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [subcategoryForm, setSubcategoryForm] = useState({ value: '' });
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(''); // לסינון במודל סאב-קטגוריות
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [priceHistory, setPriceHistory] = useState([]);
  const [showAddPrice, setShowAddPrice] = useState(false);
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
    min_quantity: 0
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


  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, subcategoriesRes] = await Promise.all([
        axios.get('/api/products'),
        axios.get('/api/categories'),
        axios.get('/api/subcategories')
      ]);
      
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setSubcategories(subcategoriesRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      setLoading(false);
    }
  };

  // ── Category management ───────────────────────────────────────────────────
  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ value: '' });
    setShowCategoryModal(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    // הצג את השם בשפת המערכת הנוכחית
    const currentVal = language === 'he' ? (cat.name_he || cat.name) :
                       language === 'pt' ? (cat.name_pt || cat.name) : cat.name;
    setCategoryForm({ value: currentVal || '' });
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.value.trim()) return;
    try {
      setSavingCategory(true);
      // בנה payload לפי שפת מערכת
      const payload = {};
      if (language === 'he') {
        payload.name_he = categoryForm.value;
        if (editingCategory) {
          payload.name = editingCategory.name || categoryForm.value;
          payload.name_pt = editingCategory.name_pt || null;
        } else {
          payload.name = categoryForm.value; // fallback לאנגלית
        }
      } else if (language === 'pt') {
        payload.name_pt = categoryForm.value;
        if (editingCategory) {
          payload.name = editingCategory.name || categoryForm.value;
          payload.name_he = editingCategory.name_he || null;
        } else {
          payload.name = categoryForm.value;
        }
      } else {
        payload.name = categoryForm.value;
        if (editingCategory) {
          payload.name_he = editingCategory.name_he || null;
          payload.name_pt = editingCategory.name_pt || null;
        }
      }

      if (editingCategory) {
        await axios.put(`/api/categories/${editingCategory.id}`, payload);
      } else {
        await axios.post('/api/categories', payload);
      }
      const res = await axios.get('/api/categories');
      setCategories(res.data);
      setEditingCategory(null);
      setCategoryForm({ value: '' });
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
        setCategoryForm({ value: '' });
      }
    } catch(e) { alert(e.response?.data?.error || e.message); }
  };

  const getCatDisplayName = (cat) => {
    if (language === 'he' && cat.name_he) return cat.name_he;
    if (language === 'pt' && cat.name_pt) return cat.name_pt;
    return cat.name;
  };

  const getSubcatDisplayName = (sub) => {
    if (language === 'he' && sub.name_he) return sub.name_he;
    if (language === 'pt' && sub.name_pt) return sub.name_pt;
    return sub.name;
  };

  // ── Subcategory management ─────────────────────────────────────────────────
  const openEditSubcategory = (sub) => {
    setEditingSubcategory(sub);
    const currentVal = language === 'he' ? (sub.name_he || sub.name) :
                       language === 'pt' ? (sub.name_pt || sub.name) : sub.name;
    setSubcategoryForm({ value: currentVal || '' });
  };

  const handleSaveSubcategory = async () => {
    if (!subcategoryForm.value.trim() || !selectedCategoryFilter) return;
    try {
      setSavingSubcategory(true);
      const payload = { category_id: selectedCategoryFilter };
      if (language === 'he') {
        payload.name_he = subcategoryForm.value;
        payload.name = editingSubcategory?.name || subcategoryForm.value;
        payload.name_pt = editingSubcategory?.name_pt || null;
      } else if (language === 'pt') {
        payload.name_pt = subcategoryForm.value;
        payload.name = editingSubcategory?.name || subcategoryForm.value;
        payload.name_he = editingSubcategory?.name_he || null;
      } else {
        payload.name = subcategoryForm.value;
        payload.name_he = editingSubcategory?.name_he || null;
        payload.name_pt = editingSubcategory?.name_pt || null;
      }
      if (editingSubcategory) {
        await axios.put(`/api/subcategories/${editingSubcategory.id}`, payload);
      } else {
        await axios.post('/api/subcategories', payload);
      }
      const res = await axios.get('/api/subcategories');
      setSubcategories(res.data);
      setEditingSubcategory(null);
      setSubcategoryForm({ value: '' });
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
        setSubcategoryForm({ value: '' });
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

  const getSortedProducts = () => {
    let filtered = products.filter(product =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aValue, bValue;
      
      if (sortField === 'category') {
        aValue = (a.category_name || '').toLowerCase();
        bValue = (b.category_name || '').toLowerCase();
      } else {
        aValue = (a[sortField] || '').toString().toLowerCase();
        bValue = (b[sortField] || '').toString().toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
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
      const payload = { ...formData, name: finalName, name_he, name_pt };

      if (editingProduct) {
        await axios.put(`/api/products/${editingProduct.id}`, payload);
      } else {
        await axios.post('/api/products', payload);
      }
      
      alert(t('success'));
      setShowModal(false);
      resetForm();
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
      min_quantity: product.min_quantity
    });
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
      min_quantity: 0
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

  const sortedProducts = getSortedProducts();

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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isAdmin && (
            <button 
              className="btn btn-secondary"
              onClick={() => setShowCategoryModal(true)}
            >
              📂 {t('edit_categories') || 'ערוך קטגוריות'}
            </button>
            )}
            {isAdmin && (
            <button 
              className="btn btn-secondary"
              onClick={() => { setSelectedCategoryFilter(categories[0]?.id?.toString() || ''); setShowSubcategoryModal(true); }}
            >
              📁 {t('edit_subcategories') || 'ערוך סאב-קטגוריות'}
            </button>
            )}
            {isAdmin && (
            <button 
              className="btn btn-primary"
              onClick={() => { resetForm(); setShowModal(true); }}
            >
              {t('add_product')}
            </button>
            )}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isMobile ? (
          /* ===== MOBILE CARD VIEW ===== */
          <div style={{ padding: '0.5rem' }}>
            {sortedProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>{t('no_data')}</div>
            ) : (
              sortedProducts.map(product => (
                <div key={product.id} style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                }}>
                  {/* Row 1: Name + stock badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>
                      {getProductName(product, language)}
                    </span>
                    {product.quantity <= product.min_quantity ? (
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

                  {/* Row 3: Unit + Min stock + Price (admin) */}
                  <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: '0.5rem' }}>
                    <span>📦 {getUnitTranslation(product.unit)}</span>
                    <span style={{ marginLeft: '0.75rem' }}>⬇️ min: {product.min_quantity}</span>
                    {isAdmin && product.price && (
                      <span style={{ marginLeft: '0.75rem' }}>💰 {parseFloat(product.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {product.currency || 'ILS'}</span>
                    )}
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => handleEdit(product)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flex: 1 }}>
                        ✏️ {t('edit')}
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDelete(product.id)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
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
                <th>{t('min_quantity')}</th>
                {isAdmin && <th>{t('price')}</th>}
                <th>{t('unit')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? "8" : "7"} className="text-center">{t('no_data')}</td>
                </tr>
              ) : (
                sortedProducts.map(product => (
                  <tr key={product.id}>
                    <td>{product.sku}</td>
                    <td>{getProductName(product, language)}</td>
                    <td>{getCategoryName(product, language)}</td>
                    <td>
                      {product.quantity <= product.min_quantity ? (
                        <span className="badge badge-danger">{product.quantity}</span>
                      ) : (
                        <span className="badge badge-success">{product.quantity}</span>
                      )}
                    </td>
                    <td>{product.min_quantity}</td>
                    {isAdmin && <td>{product.price ? `${parseFloat(product.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${product.currency || 'ILS'}` : '-'}</td>}
                    <td>{getUnitTranslation(product.unit)}</td>
                    <td>
                      {isAdmin && (
                      <div className="table-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleEdit(product)}
                        >
                          {t('edit')}
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleDelete(product.id)}
                        >
                          {t('delete')}
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('sku')} * <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 400 }}>XXX-XXX-XXX-XXX</span></label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    value={formData.sku}
                    onChange={(e) => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                    placeholder="ABC-123-XYZ-456"
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
                  <select
                    className="form-select"
                    value={formData.category_id}
                    onChange={(e) => setFormData({...formData, category_id: e.target.value, subcategory_id: ''})}
                  >
                    <option value="">{t('select_category')}</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* סאב-קטגוריה — מוצג רק אם יש סאב-קטגוריות לקטגוריה שנבחרה */}
                {formData.category_id && subcategories.filter(s => String(s.category_id) === String(formData.category_id)).length > 0 && (
                  <div className="form-group">
                    <label className="form-label">{t('subcategory') || 'סאב-קטגוריה'}</label>
                    <select
                      className="form-select"
                      value={formData.subcategory_id}
                      onChange={(e) => setFormData({...formData, subcategory_id: e.target.value})}
                    >
                      <option value="">{t('select_subcategory') || 'בחר סאב-קטגוריה'}</option>
                      {subcategories
                        .filter(s => String(s.category_id) === String(formData.category_id))
                        .map(sub => (
                          <option key={sub.id} value={sub.id}>{getSubcatDisplayName(sub)}</option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('unit')}</label>
                  <select
                    className="form-select"
                    value={formData.unit}
                    onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  >
                    <option value="unit">{t('unit_piece')}</option>
                    <option value="box">{t('unit_box')}</option>
                    <option value="carton">{t('unit_carton')}</option>
                    <option value="kg">{t('unit_kg')}</option>
                    <option value="liter">{t('unit_liter')}</option>
                    <option value="meter">{t('unit_meter')}</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                {isAdmin && (
                  <div className="form-group">
                    <label className="form-label">{t('price')}</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: e.target.value})}
                        onBlur={(e) => {
                          if (e.target.value) {
                            const formatted = parseFloat(e.target.value).toFixed(2);
                            setFormData({...formData, price: formatted});
                          }
                        }}
                        placeholder="0.00"
                        style={{ textAlign: 'right', fontFamily: 'monospace', flex: 2 }}
                      />
                      <select
                        className="form-select"
                        value={formData.currency}
                        onChange={(e) => setFormData({...formData, currency: e.target.value})}
                        style={{ flex: 1 }}
                      >
                        <option value="ILS">₪ ILS</option>
                        <option value="USD">$ USD</option>
                        <option value="EUR">€ EUR</option>
                      </select>
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
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('min_quantity')}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.min_quantity}
                    onChange={(e) => setFormData({...formData, min_quantity: e.target.value})}
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
          <div className="modal" style={{ maxWidth: '560px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📂 {t('edit_categories') || 'ערוך קטגוריות'}</h3>
              <button className="modal-close" onClick={() => { setShowCategoryModal(false); setEditingCategory(null); setCategoryForm({ value: '' }); }}>×</button>
            </div>

            <div className="modal-body" style={{ padding: '1.2rem' }}>
              {/* קטגוריות קיימות */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                  {t('existing_categories') || 'קטגוריות קיימות'}
                </h4>
                {categories.length === 0 ? (
                  <div style={{ color: '#888', fontSize: '0.9rem' }}>{t('no_data')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {categories.map(cat => (
                      <div key={cat.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.6rem 0.8rem', background: editingCategory?.id === cat.id ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${editingCategory?.id === cat.id ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: '8px'
                      }}>
                        <span style={{ fontWeight: 500 }}>{getCatDisplayName(cat)}</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => openEditCategory(cat)}
                            style={{ padding: '0.25rem 0.6rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            ✏️ {t('edit')}
                          </button>
                          <button onClick={() => handleDeleteCategory(cat.id)}
                            style={{ padding: '0.25rem 0.6rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* טופס הוספה/עריכה */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.2rem' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                  {editingCategory ? `✏️ ${t('edit_category') || 'ערוך קטגוריה'}: ${getCatDisplayName(editingCategory)}` : `➕ ${t('add_category') || 'הוסף קטגוריה'}`}
                </h4>
                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label className="form-label">
                    {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                    {t('category_name') || 'שם קטגוריה'} *
                  </label>
                  <input className="form-input" type="text" value={categoryForm.value}
                    onChange={e => setCategoryForm({ value: e.target.value })}
                    placeholder={
                      language === 'he' ? 'למשל: אלקטרוניקה' :
                      language === 'pt' ? 'ex: Eletrônicos' :
                      'e.g. Electronics'
                    } />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {editingCategory && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingCategory(null); setCategoryForm({ value: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingCategory || !categoryForm.value.trim()}
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
              <button className="modal-close" onClick={() => { setShowSubcategoryModal(false); setEditingSubcategory(null); setSubcategoryForm({ value: '' }); }}>×</button>
            </div>

            <div className="modal-body" style={{ padding: '1.2rem' }}>
              {/* בחירת קטגוריה אב */}
              <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                <label className="form-label">📂 {t('category') || 'קטגוריה'}</label>
                <select className="form-select" value={selectedCategoryFilter}
                  onChange={e => { setSelectedCategoryFilter(e.target.value); setEditingSubcategory(null); setSubcategoryForm({ value: '' }); }}>
                  <option value="">{t('select_category') || 'בחר קטגוריה'}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{getCatDisplayName(cat)}</option>
                  ))}
                </select>
              </div>

              {selectedCategoryFilter && (
                <>
                  {/* סאב-קטגוריות קיימות */}
                  <div style={{ marginBottom: '1.2rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                      {t('existing_subcategories') || 'סאב-קטגוריות קיימות'}
                    </h4>
                    {subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).length === 0 ? (
                      <div style={{ color: '#888', fontSize: '0.9rem' }}>{t('no_data')}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {subcategories.filter(s => String(s.category_id) === String(selectedCategoryFilter)).map(sub => (
                          <div key={sub.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.6rem 0.8rem',
                            background: editingSubcategory?.id === sub.id ? '#eff6ff' : '#f8fafc',
                            border: `1px solid ${editingSubcategory?.id === sub.id ? '#bfdbfe' : '#e2e8f0'}`,
                            borderRadius: '8px'
                          }}>
                            <span style={{ fontWeight: 500 }}>{getSubcatDisplayName(sub)}</span>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={() => openEditSubcategory(sub)}
                                style={{ padding: '0.25rem 0.6rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                ✏️ {t('edit')}
                              </button>
                              <button onClick={() => handleDeleteSubcategory(sub.id)}
                                style={{ padding: '0.25rem 0.6rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* טופס הוספה/עריכה */}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.2rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#374151' }}>
                      {editingSubcategory ? `✏️ ${t('edit_subcategory') || 'ערוך'}: ${getSubcatDisplayName(editingSubcategory)}` : `➕ ${t('add_subcategory') || 'הוסף סאב-קטגוריה'}`}
                    </h4>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label className="form-label">
                        {language === 'he' ? '🇮🇱 ' : language === 'pt' ? '🇵🇹 ' : '🇬🇧 '}
                        {t('subcategory_name') || 'שם סאב-קטגוריה'} *
                      </label>
                      <input className="form-input" type="text" value={subcategoryForm.value}
                        onChange={e => setSubcategoryForm({ value: e.target.value })}
                        placeholder={language === 'he' ? 'למשל: צלילה' : language === 'pt' ? 'ex: Mergulho' : 'e.g. Diving'} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {editingSubcategory && (
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setEditingSubcategory(null); setSubcategoryForm({ value: '' }); }}>
                  {t('cancel')}
                </button>
              )}
              <button type="button" className="btn btn-primary"
                disabled={savingSubcategory || !subcategoryForm.value.trim() || !selectedCategoryFilter}
                onClick={handleSaveSubcategory}>
                {savingSubcategory ? '...' : (editingSubcategory ? t('save') : `➕ ${t('add_subcategory') || 'הוסף'}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
