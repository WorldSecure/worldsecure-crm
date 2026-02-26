# 🔧 תיקון שגיאת DB - contact_person

## ❌ השגיאה:

```
SQLITE_ERROR: no such column: contact_person
```

**סיבה:**  
הטבלה `suppliers` לא מכילה את העמודה `contact_person`.

---

## ✅ התיקון:

### הוספנו ב-database.js:

```javascript
// Add contact_person column to existing suppliers table
db.run(`ALTER TABLE suppliers ADD COLUMN contact_person TEXT`, () => {});
```

**זה ירוץ אוטומטית בהפעלה הבאה!**

---

## 🔄 עדכון:

**קבצים (3):**
```
backend/database.js      ← חדש!
backend/server.js
frontend/src/pages/Suppliers.js
```

**שלבים:**
1. **עצור Backend** (Ctrl+C)
2. **החלף 3 קבצים:**
   - database.js
   - server.js  
   - Suppliers.js
3. **הפעל Backend** (`npm start`)
4. **רענן דפדפן**

---

## ⚠️ חשוב:

כשה-Backend יתחיל, הוא **אוטומטית** יוסיף את העמודה `contact_person` לטבלה.

זה בטוח - אם העמודה כבר קיימת, זה לא יעשה כלום.

---

## ✅ אחרי העדכון:

```
ספקים → הוסף ספק
שם: ABC Ltd
איש קשר: John Smith ← עובד!
שמור → הצלחה! ✓
```

---

## 🗄️ מבנה הטבלה:

**suppliers:**
```sql
- id
- name
- address
- phone
- email
- tax_id
- country
- contact_person  ← חדש!
- notes
- created_at
```

---

**הפעל מחדש ויעבוד!** 🎉
