import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';
import { useAuth } from '../utils/AuthContext';
import { countries } from '../utils/countries';
import MobilePicker from './MobilePicker';

const COUNTRY_FLAGS = {
  'Afghanistan':'🇦🇫','Albania':'🇦🇱','Algeria':'🇩🇿','Angola':'🇦🇴','Argentina':'🇦🇷',
  'Armenia':'🇦🇲','Australia':'🇦🇺','Austria':'🇦🇹','Azerbaijan':'🇦🇿','Bahrain':'🇧🇭',
  'Bangladesh':'🇧🇩','Belarus':'🇧🇾','Belgium':'🇧🇪','Bolivia':'🇧🇴','Bosnia':'🇧🇦',
  'Brazil':'🇧🇷','Bulgaria':'🇧🇬','Cambodia':'🇰🇭','Cameroon':'🇨🇲','Canada':'🇨🇦',
  'Chile':'🇨🇱','China':'🇨🇳','Colombia':'🇨🇴','Croatia':'🇭🇷','Cuba':'🇨🇺',
  'Cyprus':'🇨🇾','Czech Republic':'🇨🇿','Denmark':'🇩🇰','Ecuador':'🇪🇨','Egypt':'🇪🇬',
  'Estonia':'🇪🇪','Ethiopia':'🇪🇹','Finland':'🇫🇮','France':'🇫🇷','Georgia':'🇬🇪',
  'Germany':'🇩🇪','Ghana':'🇬🇭','Greece':'🇬🇷','Guatemala':'🇬🇹','Honduras':'🇭🇳',
  'Hungary':'🇭🇺','India':'🇮🇳','Indonesia':'🇮🇩','Iran':'🇮🇷','Iraq':'🇮🇶',
  'Ireland':'🇮🇪','Israel':'🇮🇱','Italy':'🇮🇹','Jamaica':'🇯🇲','Japan':'🇯🇵',
  'Jordan':'🇯🇴','Kazakhstan':'🇰🇿','Kenya':'🇰🇪','Kuwait':'🇰🇼','Latvia':'🇱🇻',
  'Lebanon':'🇱🇧','Libya':'🇱🇾','Lithuania':'🇱🇹','Luxembourg':'🇱🇺','Malaysia':'🇲🇾',
  'Mexico':'🇲🇽','Moldova':'🇲🇩','Morocco':'🇲🇦','Mozambique':'🇲🇿','Myanmar':'🇲🇲',
  'Netherlands':'🇳🇱','New Zealand':'🇳🇿','Nigeria':'🇳🇬','Norway':'🇳🇴','Oman':'🇴🇲',
  'Pakistan':'🇵🇰','Panama':'🇵🇦','Paraguay':'🇵🇾','Peru':'🇵🇪','Philippines':'🇵🇭',
  'Poland':'🇵🇱','Portugal':'🇵🇹','Qatar':'🇶🇦','Romania':'🇷🇴','Russia':'🇷🇺',
  'Saudi Arabia':'🇸🇦','Senegal':'🇸🇳','Serbia':'🇷🇸','Singapore':'🇸🇬','Slovakia':'🇸🇰',
  'Slovenia':'🇸🇮','Somalia':'🇸🇴','South Africa':'🇿🇦','South Korea':'🇰🇷','Spain':'🇪🇸',
  'Sri Lanka':'🇱🇰','Sudan':'🇸🇩','Sweden':'🇸🇪','Switzerland':'🇨🇭','Syria':'🇸🇾',
  'Taiwan':'🇹🇼','Tanzania':'🇹🇿','Thailand':'🇹🇭','Tunisia':'🇹🇳','Turkey':'🇹🇷',
  'Uganda':'🇺🇬','Ukraine':'🇺🇦','United Arab Emirates':'🇦🇪','United Kingdom':'🇬🇧',
  'United States':'🇺🇸','Uruguay':'🇺🇾','Uzbekistan':'🇺🇿','Venezuela':'🇻🇪',
  'Vietnam':'🇻🇳','Yemen':'🇾🇪','Zambia':'🇿🇲','Zimbabwe':'🇿🇼',
  'DR Congo':'🇨🇩','Congo':'🇨🇬','Ivory Coast':'🇨🇮',
};

const getCountryFlag = (country) => COUNTRY_FLAGS[country] || '🌍';

function Manufacturers() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [manufacturers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const tableRef = useRef(null);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  
  const isAdmin = user?.role === 'admin';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [contacts, setContacts] = useState([{ name: '', phones: [''], email: '', show_in_table: true }]);

  const addContact = () => { setContacts([...contacts, { name: '', phones: [''], email: '', show_in_table: false }]); };
  const removeContact = (i) => { const n = contacts.filter((_, idx) => idx !== i); setContacts(n.length > 0 ? n : [{ name: '', phones: [''], email: '', show_in_table: true }]); };
  const updateContact = (i, field, value) => { const n = [...contacts]; n[i] = { ...n[i], [field]: value }; setContacts(n); };
  const addPhone = (i) => { if ((contacts[i].phones || []).length < 3) { const n = [...contacts]; n[i] = { ...n[i], phones: [...(n[i].phones || ['']), ''] }; setContacts(n); } };
  const removePhone = (i, pi) => { const n = [...contacts]; const newPhones = n[i].phones.filter((_, idx) => idx !== pi); n[i] = { ...n[i], phones: newPhones.length > 0 ? newPhones : [''] }; setContacts(n); };
  const updatePhone = (i, pi, value) => { const n = [...contacts]; const newPhones = [...(n[i].phones || [''])]; newPhones[pi] = value; n[i] = { ...n[i], phones: newPhones }; setContacts(n); };

  const parseContacts = (contactStr, phoneStr) => {
    try {
      const p = JSON.parse(contactStr);
      if (Array.isArray(p)) {
        return p.map(c => ({
          name: c.name || '',
          phones: Array.isArray(c.phones) ? c.phones : (c.phone ? [c.phone] : ['']),
          email: c.email || '',
          show_in_table: c.show_in_table !== undefined ? c.show_in_table : true
        }));
      }
    } catch (e) {}
    const names = contactStr ? contactStr.split(';').map(s => s.trim()) : [''];
    const phones = phoneStr ? phoneStr.split(';').map(s => s.trim()) : [''];
    return names.map((name, i) => ({ name, phones: phones[i] ? [phones[i]] : [''], email: '', show_in_table: i === 0 })).filter(c => c.name || c.phones[0]);
  };

  const serializeContacts = (list) => {
    const valid = list.filter(c => c.name.trim() || (c.phones && c.phones.some(p => p.trim())) || c.email?.trim());
    return {
      contact_person: JSON.stringify(valid),
      phone: valid.map(c => (c.phones || []).filter(Boolean).join(', ')).filter(Boolean).join('; '),
      email: valid.map(c => c.email).filter(Boolean).join('; ')
    };
  };
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    tax_id: '',
    country: '',
    contact_person: '',
    notes: ''
  });

  useEffect(() => {
    fetchSuppliers();
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


  const fetchSuppliers = async () => {
    try {
      const response = await axios.get('/api/manufacturers');
      setSuppliers(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching manufacturers:', error);
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedSuppliers = () => {
    const filtered = manufacturers.filter(manufacturer =>
      manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (manufacturer.email && manufacturer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (manufacturer.phone && manufacturer.phone.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return [...filtered].sort((a, b) => {
      let aValue = (a[sortField] || '').toString().toLowerCase();
      let bValue = (b[sortField] || '').toString().toLowerCase();

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const addPhoneNumber = () => {};  // legacy - not used
  const removePhoneNumber = () => {};
  const updatePhoneNumber = () => {};
  const addContactPerson = () => {};
  const removeContactPerson = () => {};
  const updateContactPerson = () => {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { contact_person, phone, email } = serializeContacts(contacts);
    const dataToSubmit = { ...formData, phone, contact_person, email };
    try {
      if (editingSupplier) {
        await axios.put(`/api/manufacturers/${editingSupplier.id}`, dataToSubmit);
      } else {
        await axios.post('/api/manufacturers', dataToSubmit);
      }
      alert(t('success'));
      setShowModal(false);
      resetForm();
      fetchSuppliers();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };
  const handleEdit = (manufacturer) => {
    setEditingSupplier(manufacturer);
    const parsed = parseContacts(manufacturer.contact_person || '', manufacturer.phone || '');
    setContacts(parsed.length > 0 ? parsed.map(c => ({ name: c.name || '', phones: Array.isArray(c.phones) ? c.phones : (c.phone ? [c.phone] : ['']), email: c.email || '', show_in_table: c.show_in_table !== undefined ? c.show_in_table : true })) : [{ name: '', phones: [''], email: '', show_in_table: true }]);
    setFormData({
      name: manufacturer.name,
      address: manufacturer.address || '',
      phone: manufacturer.phone || '',
      email: manufacturer.email || '',
      tax_id: manufacturer.tax_id || '',
      country: manufacturer.country || '',
      contact_person: manufacturer.contact_person || '',
      notes: manufacturer.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    
    try {
      await axios.delete(`/api/manufacturers/${id}`);
      alert(t('success'));
      fetchSuppliers();
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', phone: '', email: '', tax_id: '', country: '', contact_person: '', notes: '' });
    setContacts([{ name: '', phone: '', email: '' }]);
    setEditingSupplier(null);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  const _paginatedAll = sortedSuppliers();
  const totalFiltered = _paginatedAll.length;
  const _pageSize = pageSize === 'all' ? totalFiltered : pageSize;
  const totalPages = _pageSize > 0 ? Math.ceil(totalFiltered / _pageSize) : 1;
  const paginatedManufacturer = _paginatedAll.slice((currentPage - 1) * _pageSize, currentPage * _pageSize);

  return (
    <div>
      <div className="page-header">
        <h2>{t('manufacturers')}</h2>
      </div>

      <div className="card" ref={tableRef}>
        <div className="card-header">
          <h3 className="card-title">{t('manufacturers')}</h3>
          {isAdmin && (
          <button 
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
          >
            {t('add_manufacturer') || 'Add Manufacturer'}
          </button>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {isMobile ? (
          /* ===== MOBILE CARD VIEW ===== */
          <div style={{ padding: '0.5rem' }}>
            {paginatedManufacturer.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>{t('no_data')}</div>
            ) : (
              paginatedManufacturer.map(manufacturer => (
                <div key={manufacturer.id} style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                }}>
                  {/* Row 1: Name + Country */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>🏭 {manufacturer.name}</span>
                    {manufacturer.country && <span style={{ fontSize: '0.82rem', color: '#555' }}>{getCountryFlag(manufacturer.country)} {manufacturer.country}</span>}
                  </div>

                  {/* Row 2: Tax ID */}
                  {manufacturer.tax_id && (
                    <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: '0.35rem' }}>
                      🪪 {manufacturer.tax_id}
                    </div>
                  )}

                  {/* Row 3: Contact info */}
                  {(() => {
                    try {
                      const p = JSON.parse(manufacturer.contact_person);
                      if (Array.isArray(p) && p.length > 0) {
                        const visible = p.filter(c => c.show_in_table);
                        if (visible.length === 0) return null;
                        return (
                          <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '0.5rem' }}>
                            {visible.map((c, i) => (
                              <div key={i}>
                                {c.name && <span>👤 {c.name} </span>}
                                {(Array.isArray(c.phones) ? c.phones : (c.phone ? [c.phone] : [])).filter(Boolean).map((ph, pi) => (
                                  <span key={pi}>📞 {ph} </span>
                                ))}
                                {c.email && <span>✉️ {c.email}</span>}
                              </div>
                            ))}
                          </div>
                        );
                      }
                    } catch(e) {}
                    return (manufacturer.contact_person || manufacturer.phone || manufacturer.email) ? (
                      <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '0.5rem' }}>
                        {manufacturer.contact_person && <div>👤 {manufacturer.contact_person}</div>}
                        {manufacturer.phone && <div>📞 {manufacturer.phone}</div>}
                        {manufacturer.email && <div>✉️ {manufacturer.email}</div>}
                      </div>
                    ) : null;
                  })()}

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => handleEdit(manufacturer)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flex: 1 }}>
                        ✏️ {t('edit')}
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDelete(manufacturer.id)}
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
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('name')} {sortField === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th>{t('contact_person')}</th>
                <th>{t('tax_id')}</th>
                <th onClick={() => handleSort('country')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('country')} {sortField === 'country' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedManufacturer.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center">{t('no_data')}</td>
                </tr>
              ) : (
                paginatedManufacturer.map(manufacturer => (
                  <tr key={manufacturer.id}>
                    <td><strong>{manufacturer.name}</strong></td>
                    <td>{(() => {
                      try {
                        const p = JSON.parse(manufacturer.contact_person);
                        if (Array.isArray(p) && p.length > 0) {
                          const visible = p.filter(c => c.show_in_table);
                          if (visible.length === 0) return <span style={{ color: '#aaa', fontSize: '0.85rem' }}>—</span>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {visible.map((c, i) => (
                                <div key={i} style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                                  {c.name && <div style={{ fontWeight: 500 }}>👤 {c.name}</div>}
                                  {(Array.isArray(c.phones) ? c.phones : (c.phone ? [c.phone] : [])).filter(Boolean).map((p, pi) => (
                                    <div key={pi} style={{ color: '#555' }}>📞 {p}</div>
                                  ))}
                                  {c.email && <div style={{ color: '#555' }}>✉️ {c.email}</div>}
                                </div>
                              ))}
                            </div>
                          );
                        }
                      } catch(e) {}
                      return (
                        <div style={{ fontSize: '0.85rem' }}>
                          {manufacturer.contact_person && <div>👤 {manufacturer.contact_person}</div>}
                          {manufacturer.phone && <div>📞 {manufacturer.phone}</div>}
                          {manufacturer.email && <div>✉️ {manufacturer.email}</div>}
                        </div>
                      );
                    })()}</td>
                    <td>{manufacturer.tax_id || '-'}</td>
                    <td>{manufacturer.country || '-'}</td>
                    <td>
                      {isAdmin && (
                        <div className="table-actions">
                          <button 
                            className="btn btn-secondary"
                            onClick={() => handleEdit(manufacturer)}
                          >
                            {t('edit')}
                          </button>
                          <button 
                            className="btn btn-danger"
                            onClick={() => handleDelete(manufacturer.id)}
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
        {/* ── Pagination ── */}
        {totalPages > 1 && pageSize !== 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between', padding: '0.75rem 0 0.25rem', borderTop: '1px solid #e5e7eb', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#6b7280' }}>
              <span>{totalFiltered} {t('items') || 'items'}</span>
              <span style={{ margin: '0 0.25rem' }}>|</span>
              <label>{t('per_page') || 'Per page'}:</label>
              <select value={pageSize} onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setCurrentPage(1); }}
                style={{ fontSize: '0.85rem', padding: '0.15rem 0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}>
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                <option value="all">{t('all') || 'All'}</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button onClick={() => { setCurrentPage(1); tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={currentPage === 1}
                style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: currentPage === 1 ? '#f3f4f6' : '#fff', cursor: currentPage === 1 ? 'default' : 'pointer' }}>«</button>
              <button onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={currentPage === 1}
                style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: currentPage === 1 ? '#f3f4f6' : '#fff', cursor: currentPage === 1 ? 'default' : 'pointer' }}>‹</button>
              <span style={{ fontSize: '0.85rem', padding: '0 0.3rem' }}>{currentPage} / {totalPages}</span>
              <button onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={currentPage === totalPages}
                style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: currentPage === totalPages ? '#f3f4f6' : '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer' }}>›</button>
              <button onClick={() => { setCurrentPage(totalPages); tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={currentPage === totalPages}
                style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', background: currentPage === totalPages ? '#f3f4f6' : '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer' }}>»</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingSupplier ? t('edit_manufacturer') || 'Edit Manufacturer' : t('add_manufacturer') || 'Add Manufacturer'}
              </h3>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">{t('name')} *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('contact_person')}</label>
                {contacts.map((contact, index) => (
                  <div key={index} style={{ marginBottom: '0.75rem', background: '#f8f9fa', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                    {/* שם + כפתור הסרת איש קשר */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <input type="text" className="form-input" value={contact.name} onChange={(e) => updateContact(index, 'name', e.target.value)} placeholder={`${t('contact_person')} ${index + 1}`} style={{ flex: 1 }} />
                      {index > 0 && (
                        <button type="button" onClick={() => removeContact(index)} className="btn btn-danger" style={{ minWidth: '36px', padding: '0.4rem' }} title="הסר איש קשר">×</button>
                      )}
                    </div>
                    {/* טלפונים */}
                    {(contact.phones && contact.phones.length > 0 ? contact.phones : ['']).map((phone, pi) => (
                      <div key={pi} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                        <input type="tel" className="form-input" value={phone} onChange={(e) => updatePhone(index, pi, e.target.value)} placeholder={t('phone')} style={{ flex: 1 }} />
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {pi > 0 && (
                            <button type="button" onClick={() => removePhone(index, pi)} className="btn btn-danger" style={{ minWidth: '36px', padding: '0.4rem' }} title="הסר טלפון">−</button>
                          )}
                          {pi === (contact.phones || ['']).length - 1 && (contact.phones || ['']).length < 3 && (
                            <button type="button" onClick={() => addPhone(index)} className="btn btn-success" style={{ minWidth: '36px', padding: '0.4rem' }} title="הוסף טלפון">+</button>
                          )}
                          {pi === 0 && (contact.phones || ['']).length === 1 && (
                            <div style={{ minWidth: '36px' }} />
                          )}
                        </div>
                      </div>
                    ))}
                    {/* אימייל */}
                    <input type="email" className="form-input" value={contact.email || ''} onChange={(e) => updateContact(index, 'email', e.target.value)} placeholder={t('email')} style={{ marginTop: '0.2rem' }} />
                    {/* הצג בטבלה */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: '#374151' }}>
                      <input type="checkbox" checked={!!contact.show_in_table} onChange={(e) => updateContact(index, 'show_in_table', e.target.checked)} />
                      {t('show_in_table') || 'הצג בטבלה'}
                    </label>
                  </div>
                ))}
                {/* כפתור הוספת איש קשר */}
                <button type="button" onClick={addContact} className="btn btn-secondary" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  + {t('add_contact') || 'הוסף איש קשר'}
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('address')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('tax_id')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.tax_id}
                  onChange={(e) => setFormData({...formData, tax_id: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('country')} *</label>
                <MobilePicker
                  options={[{ value: '', label: t('select_country') }, ...countries.map(c => ({ value: c, label: c }))]}
                  value={formData.country}
                  onChange={(val) => setFormData({...formData, country: val})}
                  placeholder={t('select_country')} label={t('country')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('notes')}</label>
                <textarea
                  className="form-textarea"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
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
    </div>
  );
}

export default Manufacturers;
