# ✅ תיבת V לתעודת משלוח - בתוך הטופס!

## ❌ לפני:

```
שמירת הוצאה
↓
Alert: "צור תעודת משלוח?"
[אישור] [ביטול]
```

❌ מפריע לזרימה!

---

## ✅ אחרי:

```
┌─────────────────────────────────┐
│  הוצאה חדשה                     │
│                                  │
│  לקוח: [___________]            │
│  פריטים: [________]             │
│  הערות: [__________]            │
│                                  │
│  ┌────────────────────┐         │
│  │ ✓ צור תעודת משלוח  │         │
│  │   לאחר השמירה      │         │
│  └────────────────────┘         │
│                                  │
│  [ביטול]  [שמור]                │
└─────────────────────────────────┘
```

✅ נוח ומסודר!

---

## 🔧 מה השתנה:

### 1. הוספנו checkbox ל-formData:
```javascript
const [formData, setFormData] = useState({
  customer_id: '',
  items: [],
  generate_delivery_note: false  // ← חדש!
});
```

### 2. הסרנו את ה-confirm:
```javascript
// לפני
if (window.confirm('צור תעודת משלוח?')) {
  handleGenerateDeliveryNote(id);
}

// אחרי
if (formData.generate_delivery_note) {
  handleGenerateDeliveryNote(id);
}
```

### 3. הוספנו checkbox בטופס:
```jsx
{!editingTransaction && (
  <div className="form-group">
    <label>
      <input
        type="checkbox"
        checked={formData.generate_delivery_note}
        onChange={(e) => setFormData({
          ...formData, 
          generate_delivery_note: e.target.checked
        })}
      />
      ✓ צור תעודת משלוח לאחר השמירה
    </label>
  </div>
)}
```

---

## 🌐 תרגומים:

### עברית:
```
✓ צור תעודת משלוח לאחר השמירה
```

### English:
```
✓ Generate delivery note after saving
```

### Português:
```
✓ Gerar nota de entrega após salvar
```

---

## 📍 מיקום:

הcheckbox מופיע:
- **מעל** כפתורי ביטול/שמור
- **רק בהוצאה חדשה** (לא בעריכה)
- **ברקע אפור** להבלטה

---

## 🔄 עדכון:

**קבצים (4):**
```
frontend/src/pages/Outbound.js
frontend/src/translations/he.js
frontend/src/translations/en.js
frontend/src/translations/pt.js
```

**שלבים:**
1. החלף 4 קבצים
2. רענן דפדפן

---

## ✅ בדיקה:

### 1. פתח הוצאה חדשה:
```
הוצאה → "הוסף הוצאה"
```

### 2. מלא פרטים:
```
לקוח: WorldSecure
פריטים: Product 1, qty 5
```

### 3. סמן checkbox:
```
☑ צור תעודת משלוח לאחר השמירה
```

### 4. שמור:
```
לחץ "שמור"
↓
תעודה נפתחת אוטומטית! ✓
```

### 5. ללא סימון:
```
☐ צור תעודת משלוח לאחר השמירה
↓
לחץ "שמור"
↓
רק שמירה, ללא תעודה ✓
```

---

## 💡 יתרונות:

✅ **לא מפריע** - אין alert
✅ **גלוי** - רואים את האפשרות מראש
✅ **ברירת מחדל** - לא מסומן (אפשר לשנות)
✅ **רק בחדש** - לא מופיע בעריכה
✅ **נוח** - סימון/ביטול קל

---

## 🎯 תוצאה:

**לפני:**
```
שמירה → Alert מפריע → בחירה
```

**אחרי:**
```
סימון בטופס → שמירה → תעודה אוטומטית
```

---

**הרבה יותר נוח ומקצועי!** 🎉
