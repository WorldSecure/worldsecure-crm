import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../utils/LanguageContext';

function Settings() {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('logo');
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [companyData, setCompanyData] = useState({
    company_name: '',
    address: '',
    phone: '',
    phone2: '',
    phone3: '',
    email: '',
    tax_id: '',
    website: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
   phone1_primary: false,
  phone2_primary: false, 
  phone3_primary: false
});

  // phones array — [{number, primary}]
  const [phones, setPhones] = useState([{ number: '', primary: false }]);

  const addPhone = () => { if (phones.length < 5) setPhones([...phones, { number: '', primary: false }]); };
  const removePhone = (i) => { if (phones.length <= 1) return; setPhones(phones.filter((_, idx) => idx !== i)); };
  const updatePhone = (i, field, value) => { const n = [...phones]; n[i] = { ...n[i], [field]: value }; setPhones(n); };

  
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // QR Code States
  const [qrGallery, setQrGallery] = useState([]);
  const [newQr, setNewQr] = useState({ type: 'website', data: {} });
  const [signatures, setSignatures] = useState([]);
  const [editingSig, setEditingSig] = useState(null); // { id, name, content } or null=new
  const [sigContent, setSigContent] = useState('');
  const [sigName, setSigName] = useState('');
  const [signaturePreview, setSignaturePreview] = useState(false);
  const [showSigEditor, setShowSigEditor] = useState(false);
  const sigFrameRef = useRef(null);
  const sigInitializedRef = useRef(false);
  const [editingQrTitle, setEditingQrTitle] = useState(null); // { id, title }

  useEffect(() => {
    fetchCompanyData();
    loadQrGallery();
    fetchSignatures();
  }, []);

  const fetchCompanyData = async () => {
    try {
      const response = await axios.get('/api/company');
      setCompanyData({
  ...response.data,
  phone1_primary: response.data.phone1_primary || false,
  phone2_primary: response.data.phone2_primary || false,
  phone3_primary: response.data.phone3_primary || false
});

      // בנה את phones array מהנתונים הישנים
      const loadedPhones = [];
      if (response.data.phone?.trim())  loadedPhones.push({ number: response.data.phone,  primary: response.data.phone1_primary || false });
      if (response.data.phone2?.trim()) loadedPhones.push({ number: response.data.phone2, primary: response.data.phone2_primary || false });
      if (response.data.phone3?.trim()) loadedPhones.push({ number: response.data.phone3, primary: response.data.phone3_primary || false });
      setPhones(loadedPhones.length > 0 ? loadedPhones : [{ number: '', primary: false }]);


      if (response.data.logo_base64) {
        setLogoPreview(response.data.logo_base64);
      } else if (response.data.logo_path) {
        setLogoPreview(`${axios.defaults.baseURL}${response.data.logo_path}`);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching company data:', error);
      setLoading(false);
    }
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    
    try {
      // המר phones array לשדות phone/phone2/phone3
      const phoneData = {
        phone:         phones[0]?.number || '',
        phone2:        phones[1]?.number || '',
        phone3:        phones[2]?.number || '',
        phone1_primary: phones[0]?.primary || false,
        phone2_primary: phones[1]?.primary || false,
        phone3_primary: phones[2]?.primary || false,
      };
      // הוצא logo_base64 — הוא נשמר בנפרד דרך /api/company/logo-base64
      const { logo_base64, ...companyDataWithoutLogo } = companyData;
      await axios.put('/api/company', { ...companyDataWithoutLogo, ...phoneData });
      alert(t('success'));
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = async () => {
    if (!logoFile) {
      alert(t('required_field'));
      return;
    }

    try {
      // המר לוגו ל-Base64 ושמור ישירות ב-DB
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result; // data:image/png;base64,...
        try {
          await axios.post('/api/company/logo-base64', { logo_base64: base64 });
          alert(t('success'));
          setLogoFile(null);
          setLogoPreview(base64);
          setCompanyData(prev => ({ ...prev, logo_base64: base64 }));
        } catch (error) {
          alert(t('error') + ': ' + (error.response?.data?.error || error.message));
        }
      };
      reader.readAsDataURL(logoFile);
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };


  const fetchSignatures = async () => {
    try {
      const res = await axios.get('/api/email-signatures');
      setSignatures(res.data);
    } catch (e) { console.error('Error fetching signatures:', e); }
  };

  const saveSignature = async () => {
    if (!sigName.trim()) { alert('חובה להזין שם לחתימה'); return; }
    if (!sigContent.trim()) { alert('החתימה לא יכולה להיות ריקה'); return; }
    try {
      if (editingSig?.id) {
        await axios.put(`/api/email-signatures/${editingSig.id}`, { name: sigName, content: sigContent, is_active: editingSig.is_active });
      } else {
        await axios.post('/api/email-signatures', { name: sigName, content: sigContent, is_active: false });
      }
      alert(t('success'));
      setShowSigEditor(false);
      sigInitializedRef.current = false;
      setEditingSig(null);
      setSigName('');
      setSigContent('');
      fetchSignatures();
    } catch (e) {
      alert(t('error') + ': ' + (e.response?.data?.error || e.message));
    }
  };

  const setActiveSignature = async (id) => {
    try {
      const sig = signatures.find(s => s.id === id);
      await axios.put(`/api/email-signatures/${id}`, { name: sig.name, content: sig.content, is_active: true });
      fetchSignatures();
    } catch (e) { alert(t('error') + ': ' + (e.response?.data?.error || e.message)); }
  };

  const deleteSignature = async (id) => {
    if (!window.confirm(t('confirm_delete') || 'למחוק?')) return;
    try {
      await axios.delete(`/api/email-signatures/${id}`);
      fetchSignatures();
    } catch (e) { alert(t('error') + ': ' + (e.response?.data?.error || e.message)); }
  };

  const loadQrGallery = async () => {
    try {
      // טען מה-DB (מקור האמת)
      const response = await axios.get('/api/qr-codes');
      const dbGallery = response.data || [];

      // === MIGRATION: אם DB ריק אבל יש נתונים ב-localStorage - דחוף ל-DB ===
      if (dbGallery.length === 0) {
        const saved = localStorage.getItem('qrGallery');
        if (saved) {
          const localGallery = JSON.parse(saved);
          if (localGallery.length > 0) {
            console.log('Migrating QR codes from localStorage to DB...');
            const migrated = [];
            for (const qr of localGallery) {
              try {
                const res = await axios.post('/api/qr-codes', {
                  type: qr.type,
                  qr_data: qr.qrData,
                  image_url: qr.image,
                  title: qr.title || `QR - ${qr.type}`
                });
                migrated.push({
                  id: res.data.id,
                  type: res.data.type,
                  qrData: res.data.qr_data,
                  image: res.data.image_url,
                  title: res.data.title
                });
              } catch (e) {
                console.error('Migration failed for QR item:', e);
              }
            }
            setQrGallery(migrated);
            localStorage.setItem('qrGallery', JSON.stringify(migrated));
            return;
          }
        }
      }

      // המר פורמט DB לפורמט Gallery
      const gallery = dbGallery.map(qr => ({
        id: qr.id,
        type: qr.type,
        qrData: qr.qr_data,
        image: qr.image_url,
        title: qr.title
      }));
      setQrGallery(gallery);
      // עדכן localStorage כגיבוי
      localStorage.setItem('qrGallery', JSON.stringify(gallery));
    } catch (error) {
      console.error('Error loading QR from DB, falling back to localStorage:', error);
      // Fallback ל-localStorage
      const saved = localStorage.getItem('qrGallery');
      if (saved) {
        setQrGallery(JSON.parse(saved));
      }
    }
  };

  const saveQrGallery = async (gallery) => {
    // שמור ב-state ו-localStorage מיד
    setQrGallery(gallery);
    localStorage.setItem('qrGallery', JSON.stringify(gallery));
  };

  const syncQrToDb = async (qrItem) => {
    try {
      // שמור QR חדש ב-DB
      const response = await axios.post('/api/qr-codes', {
        type: qrItem.type,
        qr_data: qrItem.qrData,
        image_url: qrItem.image,
        title: qrItem.title || `QR - ${qrItem.type}`
      });
      return response.data;
    } catch (error) {
      console.error('Error syncing QR to DB:', error);
      return null;
    }
  };

  const deleteQrFromDb = async (qrId) => {
    try {
      // מחק רק אם זה ID מספרי (מה-DB)
      if (typeof qrId === 'number') {
        await axios.delete(`/api/qr-codes/${qrId}`);
      }
    } catch (error) {
      console.error('Error deleting QR from DB:', error);
    }
  };

  const generateQrData = (type, data) => {
    switch(type) {
      case 'website':
        return data.url || '';
      case 'video':
        return data.url || '';
      case 'pdf':
        return data.url || '';
      case 'phone':
        return `tel:${data.phone || ''}`;
      case 'email':
        return `mailto:${data.email || ''}`;
      case 'whatsapp':
        const cleanPhone = (data.phone || '').replace(/[^0-9]/g, '');
        return `https://wa.me/${cleanPhone}`;
      case 'wifi':
        return `WIFI:S:${data.ssid || ''};T:WPA;P:${data.password || ''};;`;
      case 'text':
        return data.text || '';
      default:
        return '';
    }
  };

  const createQrCode = async () => {
    const qrData = generateQrData(newQr.type, newQr.data);
    if (!qrData) {
      alert(t('fill_all_fields') || 'נא למלא את כל השדות');
      return;
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
    
    const tempQrItem = {
      id: Date.now(),
      type: newQr.type,
      data: newQr.data,
      qrData: qrData,
      image: qrUrl,
      title: `QR - ${newQr.type}`
    };

    // שמור ב-DB וקבל ID אמיתי
    const dbResult = await syncQrToDb(tempQrItem);
    const finalItem = dbResult ? {
      id: dbResult.id,
      type: dbResult.type,
      qrData: dbResult.qr_data,
      image: dbResult.image_url,
      title: dbResult.title
    } : tempQrItem;

    saveQrGallery([...qrGallery, finalItem]);
    setNewQr({ type: 'website', data: {} });
  };

  const moveQr = (index, direction) => {
    const newGallery = [...qrGallery];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newGallery.length) return;
    
    [newGallery[index], newGallery[newIndex]] = [newGallery[newIndex], newGallery[index]];
    saveQrGallery(newGallery);
  };

  const deleteQr = async (index) => {
    if (window.confirm(t('delete') + '?')) {
      const qrToDelete = qrGallery[index];
      await deleteQrFromDb(qrToDelete.id);
      const newGallery = qrGallery.filter((_, i) => i !== index);
      saveQrGallery(newGallery);
    }
  };

  const clearAllQr = async () => {
    if (window.confirm(t('delete_all_qr') || 'למחוק את כל קודי ה-QR?')) {
      // מחק כל QR מה-DB
      for (const qr of qrGallery) {
        await deleteQrFromDb(qr.id);
      }
      saveQrGallery([]);
    }
  };

  const renameQr = async (id, newTitle) => {
    try {
      await axios.put(`/api/qr-codes/${id}`, { title: newTitle });
      const updated = qrGallery.map(qr => qr.id === id ? { ...qr, title: newTitle } : qr);
      setQrGallery(updated);
      localStorage.setItem('qrGallery', JSON.stringify(updated));
      setEditingQrTitle(null);
    } catch (error) {
      alert(t('error') + ': ' + (error.response?.data?.error || error.message));
    }
  };

  const downloadQr = async (qr) => {
    try {
      const response = await fetch(qr.image);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-${qr.type}-${qr.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('Download failed:', err);
      alert('שגיאה בהורדת QR');
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('settings')}</h2>
      </div>

      {/* ניווט כפתורים */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: isMobile ? '0.5rem' : '0.75rem',
        marginBottom: '1.5rem'
      }}>
        {[
          { key: 'logo',    icon: '🖼️', label: t('company_logo') || 'Company Logo' },
          { key: 'company', icon: '🏢', label: t('company_settings') || 'Company Settings' },
          { key: 'backup',  icon: '🗄️', label: t('backup_restore') || 'גיבוי ושחזור' },
          { key: 'smtp',    icon: '✉️', label: t('smtp_settings') || 'הגדרות SMTP' },
          { key: 'qr',      icon: '📱', label: t('qr_code') || 'QR CODE' },
          { key: 'signature', icon: '✍️', label: t('email_signature') || 'חתימת מייל' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            style={{
              padding: isMobile ? '0.5rem 0.3rem' : '0.6rem 1.4rem',
              borderRadius: '8px',
              border: activeSection === s.key ? '2px solid #007bff' : '2px solid #dee2e6',
              background: activeSection === s.key ? '#007bff' : 'white',
              color: activeSection === s.key ? 'white' : '#333',
              fontWeight: activeSection === s.key ? 700 : 400,
              fontSize: isMobile ? '0.78rem' : '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.2rem',
              textAlign: 'center',
              lineHeight: 1.3
            }}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Company Logo */}
      {activeSection === 'logo' && <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('company_logo')}</h3>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            {logoPreview && (
              <div style={{ marginBottom: '1rem' }}>
                <img 
                  src={logoPreview} 
                  alt="Logo" 
                  style={{ 
                    maxWidth: '200px', 
                    maxHeight: '200px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '0.5rem'
                  }} 
                />
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">{t('upload_logo')}</label>
              <input
                type="file"
                className="form-input"
                accept="image/png, image/jpeg, image/svg+xml"
                onChange={handleLogoChange}
              />
              <small style={{ color: '#7f8c8d', marginTop: '0.5rem', display: 'block' }}>
                {t('file_size_limit')}
              </small>
            </div>

            <button 
              className="btn btn-primary"
              onClick={handleLogoUpload}
              disabled={!logoFile}
            >
              {t('upload')}
            </button>
          </div>
        </div>
      </div>}

      {/* Company Information */}
      {activeSection === 'company' && <div className="card" style={{ marginTop: '0' }}>
        <div className="card-header">
          <h3 className="card-title">{t('company_settings')}</h3>
        </div>

        <form onSubmit={handleCompanySubmit}>
          <div className="form-group">
            <label className="form-label">{t('company_name')} *</label>
            <input
              type="text"
              className="form-input"
              value={companyData.company_name || ''}
              onChange={(e) => setCompanyData({...companyData, company_name: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('address')}</label>
            <input
              type="text"
              className="form-input"
              value={companyData.address || ''}
              onChange={(e) => setCompanyData({...companyData, address: e.target.value})}
            />
          </div>

          <div className="form-row">
  <div className="form-group">
    <label className="form-label">{t('phone')}</label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {phones.map((ph, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="tel"
            className="form-input"
            style={{ flex: 1 }}
            value={ph.number}
            onChange={(e) => updatePhone(i, 'number', e.target.value)}
            placeholder="+972..."
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={ph.primary}
              onChange={(e) => updatePhone(i, 'primary', e.target.checked)}
              style={{ width: '18px', height: '18px', margin: 0 }}
            />
            ✅
          </label>
          {phones.length > 1 && (
            <button type="button" onClick={() => removePhone(i)}
              style={{ padding: '0.3rem 0.6rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              ✕
            </button>
          )}
        </div>
      ))}
      {phones.length < 5 && (
        <button type="button" onClick={addPhone}
          style={{ alignSelf: 'flex-start', padding: '0.3rem 0.8rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
          + {t('add_phone') || 'הוסף טלפון'}
        </button>
      )}
    </div>
  </div>

                

            <div className="form-group">
              <label className="form-label">{t('email')}</label>
              <input
                type="email"
                className="form-input"
                value={companyData.email || ''}
                onChange={(e) => setCompanyData({...companyData, email: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('tax_id')}</label>
              <input
                type="text"
                className="form-input"
                value={companyData.tax_id || ''}
                onChange={(e) => setCompanyData({...companyData, tax_id: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('website')}</label>
              <input
                type="url"
                className="form-input"
                value={companyData.website || ''}
                onChange={(e) => setCompanyData({...companyData, website: e.target.value})}
                placeholder="https://www.example.com"
              />
            </div>

          </div> {/* סגירת ה-grid הראשי */}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      </div>}

      
      {/* QR CODE */}
      {activeSection === 'qr' && <div className="card">
        <div className="card-header">
          <h3 className="card-title">📱 {t('qr_gallery') || 'QR Gallery'}</h3>
          <div style={{fontSize: '0.9rem', color: '#666', marginTop: '0.5rem'}}>
            {qrGallery.length}/10 {t('qr_codes') || 'QR Codes'}
          </div>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: isMobile ? '0.5rem' : '1rem', marginBottom: '1.5rem', width: '100%', boxSizing: 'border-box'}}>
          {qrGallery.map((qr, index) => (
            <div key={qr.id} style={{border: '1px solid #ddd', borderRadius: '8px', padding: isMobile ? '0.5rem' : '1rem', textAlign: 'center', background: 'white', overflow: 'hidden', boxSizing: 'border-box', minWidth: 0}}>
              <img src={qr.image} alt="QR Code" style={{width: isMobile ? '100%' : '150px', height: isMobile ? 'auto' : '150px', maxWidth: '150px', marginBottom: '0.5rem'}} />
              <div style={{fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem'}}>{qr.type.toUpperCase()}</div>
              
              {/* שם QR - ניתן לעריכה */}
              {editingQrTitle?.id === qr.id ? (
                <div style={{display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', alignItems: 'center'}}>
                  <input
                    type="text"
                    value={editingQrTitle.title}
                    onChange={(e) => setEditingQrTitle({...editingQrTitle, title: e.target.value})}
                    onKeyDown={(e) => { if (e.key === 'Enter') renameQr(qr.id, editingQrTitle.title); if (e.key === 'Escape') setEditingQrTitle(null); }}
                    autoFocus
                    style={{flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #007bff'}}
                  />
                  <button onClick={() => renameQr(qr.id, editingQrTitle.title)} style={{padding: '0.25rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px', border: 'none', background: '#28a745', color: 'white', cursor: 'pointer'}}>✓</button>
                  <button onClick={() => setEditingQrTitle(null)} style={{padding: '0.25rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px', border: 'none', background: '#6c757d', color: 'white', cursor: 'pointer'}}>✕</button>
                </div>
              ) : (
                <div style={{fontSize: '0.8rem', color: '#444', marginBottom: '0.25rem', fontStyle: 'italic', cursor: 'pointer'}}
                  onClick={() => setEditingQrTitle({ id: qr.id, title: qr.title || qr.type })}>
                  {qr.title || qr.type} ✏️
                </div>
              )}

              <div style={{fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem', wordBreak: 'break-all'}}>{qr.qrData.substring(0, 30)}...</div>
              <div style={{display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap'}}>
                <button onClick={() => moveQr(index, 'up')} disabled={index === 0} style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ddd', background: 'white', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.5 : 1}}>⬆️</button>
                <button onClick={() => moveQr(index, 'down')} disabled={index === qrGallery.length - 1} style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ddd', background: 'white', cursor: index === qrGallery.length - 1 ? 'not-allowed' : 'pointer', opacity: index === qrGallery.length - 1 ? 0.5 : 1}}>⬇️</button>
                <button onClick={() => downloadQr(qr)} style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #28a745', background: '#28a745', color: 'white', cursor: 'pointer'}}>💾</button>
                <button onClick={() => deleteQr(index)} style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #dc3545', background: '#dc3545', color: 'white', cursor: 'pointer'}}>🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{border: '2px dashed #007bff', borderRadius: '8px', padding: '1.5rem', background: '#f8f9fa'}}>
          <h4 style={{marginBottom: '1rem'}}>➕ {t('add_new_qr') || 'הוסף QR חדש'}</h4>
          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>{t('qr_type') || 'סוג QR'}:</label>
            <select value={newQr.type} onChange={(e) => setNewQr({type: e.target.value, data: {}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}}>
              <option value="website">🌐 {t('qr_website') || 'אתר'}</option>
              <option value="video">🎥 {t('qr_video') || 'וידאו Drive'}</option>
              <option value="pdf">📄 {t('qr_pdf') || 'קובץ PDF'}</option>
              <option value="phone">📞 {t('qr_phone') || 'טלפון'}</option>
              <option value="email">📧 {t('qr_email') || 'אימייל'}</option>
              <option value="whatsapp">💬 {t('qr_whatsapp') || 'וואטסאפ'}</option>
              <option value="wifi">📶 {t('qr_wifi') || 'WiFi'}</option>
              <option value="text">📝 {t('qr_text') || 'טקסט חופשי'}</option>
            </select>
          </div>
          <div style={{marginBottom: '1rem'}}>
            {newQr.type === 'website' && <input type="url" placeholder="https://www.world-secure.com" value={newQr.data.url || ''} onChange={(e) => setNewQr({...newQr, data: {url: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'video' && <input type="url" placeholder="https://drive.google.com/file/d/ABC123/view" value={newQr.data.url || ''} onChange={(e) => setNewQr({...newQr, data: {url: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'pdf' && <input type="url" placeholder="https://example.com/document.pdf" value={newQr.data.url || ''} onChange={(e) => setNewQr({...newQr, data: {url: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'phone' && <input type="tel" placeholder="+972501234567" value={newQr.data.phone || ''} onChange={(e) => setNewQr({...newQr, data: {phone: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'email' && <input type="email" placeholder="contact@world-secure.com" value={newQr.data.email || ''} onChange={(e) => setNewQr({...newQr, data: {email: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'whatsapp' && <input type="tel" placeholder="+972501234567" value={newQr.data.phone || ''} onChange={(e) => setNewQr({...newQr, data: {phone: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
            {newQr.type === 'wifi' && <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}><input type="text" placeholder={t('network_name') || 'שם רשת'} value={newQr.data.ssid || ''} onChange={(e) => setNewQr({...newQr, data: {...newQr.data, ssid: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} /><input type="password" placeholder={t('password') || 'סיסמה'} value={newQr.data.password || ''} onChange={(e) => setNewQr({...newQr, data: {...newQr.data, password: e.target.value}})} style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} /></div>}
            {newQr.type === 'text' && <textarea placeholder={(t('free_text') || 'טקסט חופשי') + '...'} value={newQr.data.text || ''} onChange={(e) => setNewQr({...newQr, data: {text: e.target.value}})} rows="3" style={{width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd'}} />}
          </div>
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button onClick={createQrCode} disabled={qrGallery.length >= 10} style={{padding: '0.6rem 1.2rem', borderRadius: '6px', border: 'none', background: qrGallery.length >= 10 ? '#ccc' : '#28a745', color: 'white', fontWeight: 600, cursor: qrGallery.length >= 10 ? 'not-allowed' : 'pointer'}}>✅ {t('create_qr') || 'צור QR'}</button>
            <button onClick={clearAllQr} disabled={qrGallery.length === 0} style={{padding: '0.6rem 1.2rem', borderRadius: '6px', border: 'none', background: qrGallery.length === 0 ? '#ccc' : '#dc3545', color: 'white', fontWeight: 600, cursor: qrGallery.length === 0 ? 'not-allowed' : 'pointer'}}>🗑️ {t('clear_all') || 'נקה הכל'}</button>
          </div>
        </div>
      </div>}

{/* גיבוי DB */}
      {activeSection === 'backup' && <BackupSection />}

      {/* SMTP */}
      {activeSection === 'smtp' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">✉️ {t('smtp_settings') || 'הגדרות SMTP'}</h3>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">SMTP Host</label>
                <input type="text" className="form-input" value={companyData.smtp_host || ''}
                  onChange={(e) => setCompanyData({...companyData, smtp_host: e.target.value})}
                  placeholder="smtp.gmail.com" />
              </div>
              <div className="form-group">
                <label className="form-label">SMTP Port</label>
                <input type="number" className="form-input" value={companyData.smtp_port || '587'}
                  onChange={(e) => setCompanyData({...companyData, smtp_port: e.target.value})}
                  placeholder="587" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('smtp_user') || 'שם משתמש'}</label>
                <input type="email" className="form-input" value={companyData.smtp_user || ''}
                  onChange={(e) => setCompanyData({...companyData, smtp_user: e.target.value})}
                  placeholder="your@email.com" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('smtp_pass') || 'סיסמה'}</label>
                <input type="password" className="form-input" value={companyData.smtp_pass || ''}
                  onChange={(e) => setCompanyData({...companyData, smtp_pass: e.target.value})}
                  placeholder="••••••••" />
                <div style={{ marginTop: '0.4rem', padding: '0.75rem', background: '#e8f4fd', borderRadius: '6px', border: '1px solid #bee5eb', fontSize: '0.85rem' }}>
                  <strong>📧 Brevo - {t('brevo_title') || 'חינמי, 300 מיילים/יום, עובד מיד'}</strong>
                  <ol style={{ margin: '0.5rem 0 0 1.2rem', padding: 0, lineHeight: 1.9 }}>
                    <li>{t('brevo_step1') || 'הירשם ב:'} <a href="https://app.brevo.com" target="_blank" rel="noreferrer" style={{ color: '#0066cc', fontWeight: 600 }}>app.brevo.com</a></li>
                    <li>{t('brevo_step2') || 'לאחר הכניסה: לחץ על שמך למעלה →'} <strong>SMTP & API</strong></li>
                    <li>{t('brevo_step3') || 'לחץ'} <strong>"Generate a new SMTP key"</strong> → {t('brevo_step3b') || 'תן שם →'} <strong>Generate</strong></li>
                    <li>{t('brevo_step4') || 'הכנס בשדות מעלה:'}
                      <div style={{ background: '#fff', padding: '0.5rem 0.8rem', borderRadius: '4px', marginTop: '0.4rem', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 2, border: '1px solid #dee2e6' }}>
                        <b>Host:</b> smtp-relay.brevo.com<br/>
                        <b>Port:</b> 587<br/>
                        <b>User:</b> {t('brevo_user_hint') || 'המספר מהשדה "Login" (לא המייל!)'}<br/>
                        <b>Password:</b> {t('brevo_pass_hint') || 'המפתח שנוצר (xsmtpsib-...)'}
                      </div>
                    </li>
                  </ol>
                  <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: '#d4edda', borderRadius: '4px', color: '#155724', fontSize: '0.82rem' }}>
                    ✅ {t('brevo_note') || 'לא דורש אישור אדמין, עובד עם כל חשבון מייל'}
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">{t('smtp_from') || 'כתובת שולח'} (From) <span style={{ color: '#888', fontWeight: 'normal', fontSize: '0.85rem' }}>({t('optional') || 'אופציונלי'})</span></label>
                <input type="email" className="form-input" value={companyData.smtp_from || ''}
                  onChange={(e) => setCompanyData({...companyData, smtp_from: e.target.value})}
                  placeholder="noreply@company.com" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleCompanySubmit}>{t('save')}</button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={smtpTesting}
                onClick={async () => {
                  setSmtpTesting(true);
                  setSmtpTestResult(null);
                  try {
                    const res = await axios.post('/api/test-smtp');
                    const sender = res.data.sender || '';
                    setSmtpTestResult({ ok: true, msg: (t('smtp_success') || 'החיבור הצליח! שולח:') + (sender ? ' ' + sender : '') });
                  } catch (err) {
                    setSmtpTestResult({ ok: false, msg: err.response?.data?.error || err.message });
                  } finally {
                    setSmtpTesting(false);
                  }
                }}
              >
                {smtpTesting ? `⏳ ${t('testing') || 'בודק...'}` : `🔌 ${t('test_smtp') || 'בדוק חיבור SMTP'}`}
              </button>
              {smtpTestResult && (
                <div style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.9rem',
                  background: smtpTestResult.ok ? '#d4edda' : '#f8d7da',
                  color: smtpTestResult.ok ? '#155724' : '#721c24',
                  border: `1px solid ${smtpTestResult.ok ? '#c3e6cb' : '#f5c6cb'}`,
                  maxWidth: '500px'
                }}>
                  {smtpTestResult.msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== EMAIL SIGNATURE SECTION ===== */}
      {activeSection === 'signature' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">✍️ {t('email_signature') || 'חתימות מייל'}</h3>
            <button className="btn btn-primary" onClick={() => {
              setEditingSig(null); setSigName(''); setSigContent(''); sigInitializedRef.current = false; setShowSigEditor(true);
            }}>+ {t('add_signature') || 'חתימה חדשה'}</button>
          </div>
          <div style={{ padding: '1rem' }}>

            {/* רשימת חתימות */}
            {signatures.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                {t('no_signatures') || 'אין חתימות עדיין. צור חתימה חדשה!'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {signatures.map(sig => (
                  <div key={sig.id} style={{
                    border: `2px solid ${sig.is_active ? '#28a745' : '#dee2e6'}`,
                    borderRadius: '8px', padding: '1rem', background: sig.is_active ? '#f0fff4' : 'white'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{sig.name}</strong>
                        {sig.is_active && <span className="badge badge-success">✓ {t('active') || 'פעילה'}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!sig.is_active && (
                          <button className="btn btn-success" onClick={() => setActiveSignature(sig.id)}
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                            ☑️ {t('set_active') || 'הגדר כפעילה'}
                          </button>
                        )}
                        <button className="btn btn-secondary" onClick={() => {
                          setEditingSig(sig); setSigName(sig.name); setSigContent(sig.content); sigInitializedRef.current = false; setShowSigEditor(true);
                        }} style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>✏️</button>
                        <button className="btn btn-danger" onClick={() => deleteSignature(sig.id)}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>🗑️</button>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', maxHeight: '60px', overflow: 'hidden' }}
                      dangerouslySetInnerHTML={{ __html: sig.content }} />
                  </div>
                ))}
              </div>
            )}

            {/* עורך חתימה */}
            {showSigEditor && (
              <div style={{ border: '2px solid #007bff', borderRadius: '8px', padding: '1rem', background: '#f8f9ff' }}>
                <h4 style={{ marginBottom: '1rem' }}>
                  {editingSig ? (t('edit_signature') || 'עריכת חתימה') : (t('new_signature') || 'חתימה חדשה')}
                </h4>

                {/* שם החתימה */}
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">{t('signature_name') || 'שם החתימה'} *</label>
                  <input type="text" className="form-input" value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    placeholder={t('signature_name_placeholder') || 'לדוגמה: חתימה ראשית, חתימה רשמית...'} />
                </div>

                {/* סרגל עיצוב */}
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', padding: '0.5rem', background: '#f8f9fa', border: '1px solid #dee2e6', borderBottom: 'none', borderRadius: '6px 6px 0 0' }}>
                  <button type="button" title="Bold" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('bold'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', fontWeight: 'bold', cursor: 'pointer' }}>B</button>
                  <button type="button" title="Italic" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('italic'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', fontStyle: 'italic', cursor: 'pointer' }}>I</button>
                  <button type="button" title="Underline" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('underline'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', textDecoration: 'underline', cursor: 'pointer' }}>U</button>
                  <div style={{ width: '1px', background: '#ccc', margin: '0 0.2rem' }} />
                  <select onMouseDown={(e) => e.preventDefault()} onChange={(e) => { document.getElementById('sig-frame')?.contentDocument?.execCommand('fontSize', false, e.target.value); e.target.value = ''; }}
                    style={{ padding: '0.3rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <option value="">גודל</option>
                    <option value="1">10px</option><option value="2">13px</option><option value="3">16px</option>
                    <option value="4">18px</option><option value="5">24px</option><option value="6">32px</option>
                  </select>
                  <label style={{ padding: '0.3rem 0.4rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    A <input type="color" defaultValue="#000000" style={{ width: '20px', height: '18px', border: 'none', padding: 0 }}
                      onChange={(e) => document.getElementById('sig-frame')?.contentDocument?.execCommand('foreColor', false, e.target.value)} />
                  </label>
                  <div style={{ width: '1px', background: '#ccc', margin: '0 0.2rem' }} />
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('justifyLeft'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>⬅</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('justifyCenter'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>☰</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('justifyRight'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>➡</button>
                  <div style={{ width: '1px', background: '#ccc', margin: '0 0.2rem' }} />
                  <button type="button" onMouseDown={(e) => {
                    e.preventDefault();
                    const url = prompt('הכנס כתובת URL:');
                    if (url) document.getElementById('sig-frame')?.contentDocument?.execCommand('createLink', false, url);
                  }} style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>🔗</button>
                  <label style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    🖼️ תמונה
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = () => document.getElementById('sig-frame')?.contentDocument?.execCommand('insertHTML', false, `<img src="${reader.result}" style="max-height:80px;max-width:200px;object-fit:contain;" />`);
                        reader.readAsDataURL(file); e.target.value = '';
                      }} />
                  </label>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.getElementById('sig-frame')?.contentDocument?.execCommand('insertHorizontalRule'); }}
                    style={{ padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>─</button>
                </div>

                {/* iframe עורך */}
                <iframe
                  ref={(el) => {
                    sigFrameRef.current = el;
                    if (el && !sigInitializedRef.current) {
                      sigInitializedRef.current = true;
                      // מאתחל את ה-iframe פעם אחת בלבד — לא תלוי ב-state
                      el.onload = () => {
                        const doc = el.contentDocument;
                        if (!doc) return;
                        doc.open();
                        doc.write(`<!DOCTYPE html><html dir="ltr"><head><style>body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;direction:ltr;text-align:left;outline:none;min-height:160px;}</style></head><body contenteditable="true">${sigContent}</body></html>`);
                        doc.close();
                        doc.body.focus();
                        doc.body.addEventListener('input', () => {
                          setSigContent(doc.body.innerHTML);
                        });
                      };
                      el.src = 'about:blank';
                    }
                  }}
                  id="sig-frame"
                  title="sig editor"
                  style={{ width: '100%', height: '200px', border: '1px solid #dee2e6', borderRadius: '0 0 6px 6px', background: 'white', display: 'block' }}
                />

                {/* כפתורי שמירה */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button className="btn btn-primary" onClick={saveSignature}>💾 {t('save') || 'שמור'}</button>
                  <button className="btn btn-secondary" onClick={() => { sigInitializedRef.current = false; setShowSigEditor(false); setEditingSig(null); setSigName(''); setSigContent(''); }}>
                    {t('cancel') || 'ביטול'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSignaturePreview(!signaturePreview)}>
                    {signaturePreview ? '🙈' : '👁️'} {t('preview') || 'תצוגה מקדימה'}
                  </button>
                </div>

                {/* תצוגה מקדימה */}
                {signaturePreview && sigContent && (
                  <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #dee2e6', borderRadius: '6px', background: 'white', maxWidth: '600px' }}>
                    <p style={{ color: '#555', marginBottom: '1rem', fontSize: '0.9rem' }}>מצורף מסמך לעיונך.</p>
                    <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '1rem 0' }} />
                    <div dangerouslySetInnerHTML={{ __html: sigContent }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BackupSection() {
  const { t } = useLanguage();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [msg, setMsg] = useState(null);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/backup/list');
      setBackups(res.data);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => { loadBackups(); }, []);

  const handleRestore = async (filename) => {
    if (!window.confirm(`${t('restore_confirm') || 'שחזור מ-'}${filename}?\n${t('restore_warning') || 'המצב הנוכחי יישמר כגיבוי אוטומטי לפני השחזור.'}`)) return;
    setRestoring(filename);
    try {
      const res = await axios.post(`/api/backup/restore/${filename}`);
      setMsg({ ok: true, text: res.data.message });
    } catch(e) {
      setMsg({ ok: false, text: e.response?.data?.error || e.message });
    }
    setRestoring(null);
  };

  const handleDownload = async () => {
    try {
      const res = await axios.get('/api/backup/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'warehouse.db';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setTimeout(loadBackups, 500); // רענן טבלה
    } catch(e) {
      setMsg({ ok: false, text: e.response?.data?.error || e.message });
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('backup', file);
    
    try {
      const res = await axios.post('/api/backup/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMsg({ ok: true, text: res.data.message });
      loadBackups(); // Refresh list
    } catch(e) {
      setMsg({ ok: false, text: e.response?.data?.error || e.message });
    }
    e.target.value = ''; // Reset input
  };

  const formatSize = (bytes) => bytes > 1024*1024 ? (bytes/1024/1024).toFixed(1)+' MB' : (bytes/1024).toFixed(0)+' KB';
  const formatDate = (d) => new Date(d).toLocaleString('he-IL');

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem' }}>🗄️ {t('backup_restore') || 'גיבוי ושחזור'}</div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#555' }}>
        {t('backup_description') || 'גיבוי אוטומטי נשמר מדי יום בתיקיית backend/backups (7 גיבויים אחרונים).'}
      </p>

      {msg && (
        <div style={{ padding: '0.6rem 1rem', borderRadius: '6px', marginBottom: '1rem',
          background: msg.ok ? '#d4edda' : '#f8d7da',
          color: msg.ok ? '#155724' : '#721c24',
          border: `1px solid ${msg.ok ? '#c3e6cb' : '#f5c6cb'}`,
          fontSize: '0.88rem' }}>
          {msg.ok ? '✅' : '❌'} {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleDownload}>
          ⬇️ {t('download_backup') || 'הורד גיבוי עכשיו'}
        </button>
        <label className="btn btn-success" style={{ cursor: 'pointer', margin: 0 }}>
          ⬆️ {t('upload_backup') || 'העלאת גיבוי'}
          <input 
            type="file" 
            accept=".sql,.mdf,.bak,.db" 
            onChange={handleUpload} 
            style={{ display: 'none' }}
          />
        </label>
        <button className="btn btn-secondary" onClick={loadBackups} disabled={loading}>
          🔄 {loading ? (t('loading') || 'טוען...') : (t('refresh') || 'רענן רשימה')}
        </button>
      </div>

      {backups.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: 'white', borderRadius: '6px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('file') || 'קובץ'}</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('date') || 'תאריך'}</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('size') || 'גודל'}</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{t('files') || 'קבצים'}</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{t('action') || 'פעולה'}</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.name}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{formatDate(b.date)}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{formatSize(b.size)}</td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                  {b.hasUploads ? '✅' : '—'}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <button
                    onClick={() => handleRestore(b.name)}
                    disabled={restoring === b.name}
                    style={{ background: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {restoring === b.name ? '⏳...' : '↩️ ' + (t('restore') || 'שחזר')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {backups.length === 0 && !loading && (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>{t('no_backups') || 'אין גיבויים עדיין'}</p>
      )}
    </div>
  );
}

export default Settings;
