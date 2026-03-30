import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * MobilePicker — Bottom Sheet במובייל, Dropdown בדסקטופ
 * Props:
 *   options      — [{ value, label }] או [string]
 *   value        — הערך הנוכחי
 *   onChange     — (value) => void
 *   placeholder  — טקסט ברירת מחדל
 *   disabled     — האם מושבת
 *   label        — כותרת ב-Bottom Sheet (אופציונלי)
 */
function MobilePicker({ options = [], value, onChange, placeholder = 'Select...', disabled = false, label = '' }) {
  const [open, setOpen] = useState(false);
  const [sheetY, setSheetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  useEffect(() => {
    if (isMobile && open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, open]);

  const handleOpen = () => {
    if (disabled) return;
    if (!isMobile && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + window.scrollY + 2, left: rect.left + window.scrollX, width: rect.width });
    }
    setSheetY(0);
    setOpen(true);
  };
  const handleClose = () => { setOpen(false); setSheetY(0); };
  const handleSelect = (val) => { onChange(val); handleClose(); };

  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    setIsDragging(true);
  };
  const handleTouchMove = (e) => {
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) { dragCurrentY.current = dy; setSheetY(dy); }
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragCurrentY.current > 80) handleClose(); else setSheetY(0);
  };

  // נרמל options ל-[{ value, label }]
  const normalizedOptions = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selectedLabel = normalizedOptions.find(o => String(o.value) === String(value))?.label || '';

  const optionList = (
    <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
      {normalizedOptions.map((opt, i) => (
        <div key={i} onClick={() => handleSelect(opt.value)}
          style={{
            padding: isMobile ? '0.9rem 1.2rem' : '0.5rem 0.75rem',
            cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
            fontSize: isMobile ? '1rem' : '0.9rem',
            background: String(opt.value) === String(value) ? '#e8f5e9' : 'white',
            color: String(opt.value) === String(value) ? '#1a7a3c' : '#374151',
            fontWeight: String(opt.value) === String(value) ? 600 : 400,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: isMobile ? '52px' : 'auto',
          }}
          onMouseEnter={e => { if (!isMobile) e.currentTarget.style.background = String(opt.value) === String(value) ? '#e8f5e9' : '#f9fafb'; }}
          onMouseLeave={e => { if (!isMobile) e.currentTarget.style.background = String(opt.value) === String(value) ? '#e8f5e9' : 'white'; }}
        >
          <span>{opt.label}</span>
          {String(opt.value) === String(value) && <span style={{ color: '#27ae60', fontSize: '1rem' }}>✓</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: disabled ? '#f3f4f6' : 'white', cursor: disabled ? 'default' : 'pointer', fontSize: '0.9rem', minHeight: isMobile ? '48px' : '38px', userSelect: 'none' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedLabel ? '#111' : '#9ca3af' }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.7rem', marginLeft: '0.5rem' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* DESKTOP: Dropdown — position absolute בתוך הקונטיינר */}
      {!isMobile && open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'white', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '280px', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: '2px' }}>
          {optionList}
        </div>
      )}

      {/* MOBILE: Bottom Sheet */}
      {isMobile && open && ReactDOM.createPortal(
        <div>
          <div onClick={handleClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'white', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.2)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', transform: `translateY(${sheetY}px)`, transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)' }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0, cursor: 'grab' }}
              onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#d1d5db' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem 0.75rem', flexShrink: 0, borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111' }}>{label || placeholder}</span>
              <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {optionList}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MobilePicker;
