import React, { useState, useEffect, useRef } from 'react';

/**
 * ProductPicker — קומפוננט בחירת מוצר עם עץ מוצרי אב/דגמים וחיפוש
 * Props:
 *   products   — מערך כל המוצרים
 *   value      — product_id נוכחי
 *   onChange   — (product) => void
 *   placeholder, showStock, language, disabled
 */
function ProductPicker({ products = [], value, onChange, placeholder = 'Select product', showStock = true, language = 'en', disabled = false }) {
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
