# 🔧 תוקן! עדכון נתוני PL בתעודת משלוח

## ❌ הבעיה:

```
הוצאה → עריכת שורה → עדכון קרטונים/משקלים
↓
תעודת משלוח → נתונים נמחקו! ✗
```

**סיבה:** 
ה-UPDATE של outbound_items לא שמר את נתוני האריזה (packaging).

---

## ✅ התיקון:

### לפני (שורה 882):
```javascript
INSERT INTO outbound_items 
  (transaction_id, product_id, quantity) 
VALUES (?, ?, ?)
```

❌ **חסרים כל נתוני ה-PL!**

---

### אחרי:
```javascript
INSERT INTO outbound_items (
  transaction_id, product_id, quantity,
  use_packaging, items_per_carton, carton_weight, num_cartons,
  use_pallets, cartons_per_pallet, pallet_dimensions, 
  pallet_weight, num_pallets
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

✅ **כל נתוני ה-PL נשמרים!**

---

## 📊 נתונים שנשמרים עכשיו:

### קרטונים:
- ✅ `use_packaging` - האם יש אריזה
- ✅ `items_per_carton` - יחידות לקרטון
- ✅ `carton_weight` - משקל קרטון
- ✅ `num_cartons` - מספר קרטונים

### משטחים:
- ✅ `use_pallets` - האם יש משטחים
- ✅ `cartons_per_pallet` - קרטונים למשטח
- ✅ `pallet_dimensions` - מידות משטח
- ✅ `pallet_weight` - משקל משטח
- ✅ `num_pallets` - מספר משטחים

---

## 🔄 עדכון:

**קובץ אחד:**
```
backend/server.js
```

**שלבים:**
1. עצור Backend (Ctrl+C)
2. החלף server.js
3. הפעל Backend (`npm start`)

---

## ✅ בדיקה:

### 1. ערוך הוצאה קיימת:
```
הוצאה → בחר עסקה → "ערוך"
↓
לחץ 📦 ליד פריט
↓
שנה: 15 יח'/קרטון → 20 יח'/קרטון
↓
שמור
```

### 2. צור תעודת משלוח:
```
הוצאה → "📄 תעודת משלוח"
↓
בחר שפה
↓
בדוק בטבלה:
- 20 יח'/קרטון ✓ (מעודכן!)
- משקל נכון ✓
- מספר קרטונים נכון ✓
```

---

## 🎯 תוצאה:

**לפני:**
```
עריכה → PL מתעדכן ב-Frontend ✓
       → PL לא נשמר ב-DB ✗
       → תעודה ריקה ✗
```

**אחרי:**
```
עריכה → PL מתעדכן ב-Frontend ✓
       → PL נשמר ב-DB ✓
       → תעודה מעודכנת ✓
```

---

## 💡 הערה:

**רק עריכות חדשות יעבדו!**

עסקאות שנערכו לפני התיקון עדיין יהיו ללא נתוני PL.

**פתרון:**
לחזור לעסקה → ערוך → 📦 → שמור שוב

---

**עכשיו תעודת המשלוח תתעדכן כמו שצריך!** 🎉
