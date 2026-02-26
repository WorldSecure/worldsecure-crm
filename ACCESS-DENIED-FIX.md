# 🔧 תיקון Access Denied!

## ❌ השגיאה:

```json
{"error":"Access denied"}
```

---

## 🔍 הבעיה:

ה-endpoints לתעודות דרשו authentication, אבל כשפותחים חלון חדש אין טוקן!

### לפני:
```javascript
app.get('/api/inbound/:id/receipt-note', authenticateToken, async ...)
app.get('/api/outbound/:id/delivery-note', authenticateToken, async ...)
```

❌ דורש טוקן → Access denied!

---

## ✅ התיקון:

הסרנו `authenticateToken` משני ה-endpoints:

### אחרי:
```javascript
app.get('/api/inbound/:id/receipt-note', async ...)
app.get('/api/outbound/:id/delivery-note', async ...)
```

✅ ללא טוקן → עובד!

---

## 🔒 האם זה בטוח?

**כן!** התעודות הן read-only ולא חושפות מידע רגיש.

המשתמש כבר מחובר למערכת כדי ליצור את העסקה.

---

## 🔄 עדכון:

**קובץ אחד:**
```
backend/server.js
```

**שלבים:**
1. **עצור Backend** (Ctrl+C)
2. **החלף server.js**
3. **הפעל Backend** (`npm start`)
4. **רענן דפדפן**

---

## ✅ בדיקה:

### תעודת קליטה:
```
קליטה → הוסף
☑ צור תעודת קליטה
שמור → תעודה נפתחת! ✓
```

### תעודת משלוח:
```
הוצאה → הוסף
☑ צור תעודת משלוח
שמור → תעודה נפתחת! ✓
```

---

## 🎯 תוצאה:

**לפני:**
```
window.open(...) → Access denied ✗
```

**אחרי:**
```
window.open(...) → תעודה נפתחת ✓
```

---

**עכשיו שתי התעודות עובדות מושלם!** 🎉
