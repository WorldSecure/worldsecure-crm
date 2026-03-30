import React, { useState, useEffect, useRef } from 'react';

/**
 * ProductPicker — קומפוננט בחירת מוצר עם עץ מוצרי אב/דגמים וחיפוש
 * Desktop: dropdown | Mobile: Bottom Sheet עם swipe-to-close
 */
function ProductPicker({ products = [], value, onChange, placeholder = 'Select product', showStock = true, language = 'en', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedParents, setExpandedParents] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [sheetY, setSheetY] = useState(0);       // מיקום Y של Bottom Sheet בגרירה
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // סגור בלחיצה מחוץ (desktop בלבד)
  useEffect(() => {
    if (isMobile) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isMobile]);

  // מניעת גלילת body כשה-sheet פתוח
  useEffect(() => {
    if (isMobile && open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, open]);

  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  const handleOpen = () => { if (!disabled) { setSheetY(0); setOpen(true); } };
  const handleClose = () => { setOpen(false); setSearch(''); setSheetY(0); };

  // Swipe down לסגירה
  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    setIsDragging(true);
  };
  const handleTouchMove = (e) => {
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) { // רק למטה
      dragCurrentY.current = dy;
      setSheetY(dy);
    }
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragCurrentY.current > 80) {
      handleClose(); // סגור אם גלל >80px למטה
    } else {
      setSheetY(0); // חזור למקום
    }
  };

  const getName = (p) => {
    if (language === 'he' && p.name_he) return p.name_he;
    if (language === 'pt' && p.name_pt) return p.name_pt;
    return p.name;
  };

  const isActive = (p) => p.is_active === 1 || p.is_active === true || p.is_active == null;
  const selected = value ? products.find(p => String(p.id) === String(value)) : null;
  const parents = products.filter(p => p.is_parent && !p.parent_id && isActive(p));
  const standalone = products.filter(p => !p.is_parent && !p.parent_id && isActive(p));

  const variantsByParent = {};
  products.forEach(p => {
    if (p.parent_id && !p.is_parent && isActive(p)) {
      if (!variantsByParent[p.parent_id]) variantsByParent[p.parent_id] = [];
      variantsByParent[p.parent_id].push(p);
    }
  });

  const q = search.trim().toLowerCase();
  const matchesSearch = (p) => !q || getName(p).toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  const parentHasMatch = (parentId) => (variantsByParent[parentId] || []).some(v => matchesSearch(v));
  const isExpanded = (parentId) => q ? parentHasMatch(parentId) : !!expandedParents[parentId];
  const toggleParent = (parentId) => setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  const handleSelect = (product) => { onChange(product); handleClose(); };
  const handleClear = (e) => { e.stopPropagation(); onChange(null); setSearch(''); };

  const stockBadge = (p) => showStock
    ? (p.quantity > 0
      ? <span style={{ color: '#27ae60', fontSize: '0.78rem' }}>🟢 {p.quantity}</span>
      : <span style={{ color: '#e74c3c', fontSize: '0.78rem' }}>🔴 {p.quantity}</span>)
    : null;

  const filteredParents = parents.filter(p => matchesSearch(p) || parentHasMatch(p.id));
  const filteredStandalone = standalone.filter(p => matchesSearch(p));
  const hasResults = filteredParents.length > 0 || filteredStandalone.length > 0;

  // ── רשימת המוצרים (משותף לdropdown ולbottom sheet) ──
  const productList = (
    <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
      {!hasResults && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>No products found</div>
      )}
      {filteredParents.map(parent => {
        const variants = (variantsByParent[parent.id] || []).filter(v => q ? matchesSearch(v) : true);
        const expanded = isExpanded(parent.id);
        const totalVariants = (variantsByParent[parent.id] || []).length;
        const rowPad = isMobile ? '0.75rem 1rem' : '0.5rem 0.75rem';
        const varPad = isMobile ? '0.65rem 1rem 0.65rem 2.5rem' : '0.45rem 0.75rem 0.45rem 2rem';
        return (
          <div key={parent.id}>
            <div onClick={() => toggleParent(parent.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: rowPad, cursor: 'pointer', background: '#fffbf0', borderBottom: '1px solid #f5f0e0', fontSize: isMobile ? '1rem' : '0.88rem', fontWeight: 600, color: '#444', minHeight: isMobile ? '52px' : 'auto' }}>
              <span style={{ fontSize: '0.75rem', color: '#f59e0b', minWidth: '14px' }}>{expanded ? '▼' : '▶'}</span>
              <span>⭐</span>
              <span style={{ flex: 1 }}>{getName(parent)}</span>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 400 }}>{totalVariants} variants</span>
            </div>
            {expanded && variants.map(variant => (
              <div key={variant.id} onClick={() => handleSelect(variant)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: varPad, cursor: 'pointer', borderBottom: '1px solid #fafafa', fontSize: isMobile ? '0.95rem' : '0.85rem', background: String(variant.id) === String(value) ? '#e8f5e9' : 'white', minHeight: isMobile ? '48px' : 'auto' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>└</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280', minWidth: isMobile ? '90px' : '110px' }}>{variant.sku}</span>
                <span style={{ flex: 1, color: '#374151' }}>{getName(variant)}</span>
                {showStock && stockBadge(variant)}
              </div>
            ))}
          </div>
        );
      })}
      {filteredStandalone.length > 0 && (
        <>
          {filteredParents.length > 0 && (
            <div style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', color: '#9ca3af', background: '#f9fafb', borderTop: '1px solid #f0f0f0' }}>Other products</div>
          )}
          {filteredStandalone.map(product => (
            <div key={product.id} onClick={() => handleSelect(product)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: isMobile ? '0.75rem 1rem' : '0.45rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #fafafa', fontSize: isMobile ? '0.95rem' : '0.85rem', background: String(product.id) === String(value) ? '#e8f5e9' : 'white', minHeight: isMobile ? '48px' : 'auto' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280', minWidth: isMobile ? '90px' : '110px' }}>{product.sku}</span>
              <span style={{ flex: 1, color: '#374151' }}>{getName(product)}</span>
              {showStock && stockBadge(product)}
            </div>
          ))}
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: disabled ? '#f3f4f6' : 'white', cursor: disabled ? 'default' : 'pointer', fontSize: '0.9rem', minHeight: isMobile ? '48px' : '38px', userSelect: 'none' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#111' : '#9ca3af' }}>
          {selected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {showStock && stockBadge(selected)}
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>{selected.sku}</span>
              <span>{getName(selected)}</span>
            </span>
          ) : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {selected && !disabled && (
            <span onClick={handleClear} style={{ color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '0 4px' }}>×</span>
          )}
          <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {/* ── DESKTOP: Dropdown ── */}
      {!isMobile && open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'white', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', display: 'flex', flexDirection: 'column', marginTop: '2px' }}>
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search name or SKU..."
              style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {productList}
        </div>
      )}

      {/* ── MOBILE: Bottom Sheet ── */}
      {isMobile && open && (
        <>
          {/* Backdrop */}
          <div onClick={handleClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998, backdropFilter: 'blur(2px)' }} />

          {/* Sheet */}
          <div ref={sheetRef}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
              background: 'white', borderRadius: '20px 20px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
              height: '70vh', display: 'flex', flexDirection: 'column',
              transform: `translateY(${sheetY}px)`,
              transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0, cursor: 'grab' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#d1d5db' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem 0.75rem', flexShrink: 0, borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111' }}>📦 {placeholder}</span>
              <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>

            {/* Search */}
            <div style={{ padding: '0.6rem 1rem', flexShrink: 0 }}>
              <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search name or SKU..."
                style={{ width: '100%', padding: '0.6rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }} />
            </div>

            {/* List */}
            {productList}
          </div>
        </>
      )}
    </div>
  );
}

export default ProductPicker;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedParents, setExpandedParents] = useState({});
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const getName = (p) => {
    if (language === 'he' && p.name_he) return p.name_he;
    if (language === 'pt' && p.name_pt) return p.name_pt;
    return p.name;
  };

  const isActive = (p) => p.is_active === 1 || p.is_active === true || p.is_active == null;
  const selected = value ? products.find(p => String(p.id) === String(value)) : null;
  const parents = products.filter(p => p.is_parent && !p.parent_id && isActive(p));
  const standalone = products.filter(p => !p.is_parent && !p.parent_id && isActive(p));

  const variantsByParent = {};
  products.forEach(p => {
    if (p.parent_id && !p.is_parent && isActive(p)) {
      if (!variantsByParent[p.parent_id]) variantsByParent[p.parent_id] = [];
      variantsByParent[p.parent_id].push(p);
    }
  });

  const q = search.trim().toLowerCase();
  const matchesSearch = (p) => !q || getName(p).toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  const parentHasMatch = (parentId) => (variantsByParent[parentId] || []).some(v => matchesSearch(v));
  const isExpanded = (parentId) => q ? parentHasMatch(parentId) : !!expandedParents[parentId];
  const toggleParent = (parentId) => setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  const handleSelect = (product) => { onChange(product); setOpen(false); setSearch(''); };
  const handleClear = (e) => { e.stopPropagation(); onChange(null); setSearch(''); };

  const stockBadge = (p) => showStock
    ? (p.quantity > 0
      ? <span style={{ color: '#27ae60', fontSize: '0.78rem' }}>🟢 {p.quantity}</span>
      : <span style={{ color: '#e74c3c', fontSize: '0.78rem' }}>🔴 {p.quantity}</span>)
    : null;

  const filteredParents = parents.filter(p => matchesSearch(p) || parentHasMatch(p.id));
  const filteredStandalone = standalone.filter(p => matchesSearch(p));
  const hasResults = filteredParents.length > 0 || filteredStandalone.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: disabled ? '#f3f4f6' : 'white', cursor: disabled ? 'default' : 'pointer', fontSize: '0.9rem', minHeight: '38px', userSelect: 'none' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#111' : '#9ca3af' }}>
          {selected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {showStock && stockBadge(selected)}
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>{selected.sku}</span>
              <span>{getName(selected)}</span>
            </span>
          ) : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {selected && !disabled && (
            <span onClick={handleClear} style={{ color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</span>
          )}
          <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'white', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', display: 'flex', flexDirection: 'column', marginTop: '2px' }}>
          {/* Search */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search name or SKU..."
              style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!hasResults && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No products found</div>
            )}

            {/* Parents + Variants */}
            {filteredParents.map(parent => {
              const variants = (variantsByParent[parent.id] || []).filter(v => q ? matchesSearch(v) : true);
              const expanded = isExpanded(parent.id);
              const totalVariants = (variantsByParent[parent.id] || []).length;
              return (
                <div key={parent.id}>
                  <div onClick={() => toggleParent(parent.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer', background: '#fffbf0', borderBottom: '1px solid #f5f0e0', fontSize: '0.88rem', fontWeight: 600, color: '#444' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fff3cd'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fffbf0'}>
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b', minWidth: '12px' }}>{expanded ? '▼' : '▶'}</span>
                    <span>⭐</span>
                    <span style={{ flex: 1 }}>{getName(parent)}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>{totalVariants} variants</span>
                  </div>
                  {expanded && variants.map(variant => (
                    <div key={variant.id} onClick={() => handleSelect(variant)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem 0.45rem 2rem', cursor: 'pointer', borderBottom: '1px solid #fafafa', fontSize: '0.85rem', background: String(variant.id) === String(value) ? '#e8f5e9' : 'white' }}
                      onMouseEnter={e => e.currentTarget.style.background = String(variant.id) === String(value) ? '#e8f5e9' : '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = String(variant.id) === String(value) ? '#e8f5e9' : 'white'}>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>└</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#6b7280', minWidth: '110px' }}>{variant.sku}</span>
                      <span style={{ flex: 1, color: '#374151' }}>{getName(variant)}</span>
                      {showStock && stockBadge(variant)}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Standalone products */}
            {filteredStandalone.length > 0 && (
              <>
                {filteredParents.length > 0 && (
                  <div style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', color: '#9ca3af', background: '#f9fafb', borderTop: '1px solid #f0f0f0' }}>Other products</div>
                )}
                {filteredStandalone.map(product => (
                  <div key={product.id} onClick={() => handleSelect(product)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #fafafa', fontSize: '0.85rem', background: String(product.id) === String(value) ? '#e8f5e9' : 'white' }}
                    onMouseEnter={e => e.currentTarget.style.background = String(product.id) === String(value) ? '#e8f5e9' : '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = String(product.id) === String(value) ? '#e8f5e9' : 'white'}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#6b7280', minWidth: '110px' }}>{product.sku}</span>
                    <span style={{ flex: 1, color: '#374151' }}>{getName(product)}</span>
                    {showStock && stockBadge(product)}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductPicker;
