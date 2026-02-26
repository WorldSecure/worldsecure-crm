# ⚡ תיקון מהיר - isAdmin חסר!

## ❌ השגיאה:

```
ERROR [eslint]
src\pages\Suppliers.js
Line 192:24: 'isAdmin' is not defined
```

---

## ✅ התיקון:

### הוספנו ב-Suppliers.js:

```javascript
import { useAuth } from '../utils/AuthContext';  // ← חדש!

function Suppliers() {
  const { t } = useLanguage();
  const { user } = useAuth();                    // ← חדש!
  
  const isAdmin = user?.role === 'admin';       // ← חדש!
  
  // ... rest of code
}
```

---

## 🔄 עדכון:

**קובץ אחד:**
```
frontend/src/pages/Suppliers.js
```

**שלבים:**
1. החלף את Suppliers.js
2. שמור
3. רענן דפדפן

**אין צורך להפעיל מחדש!**

---

## ✅ תוצאה:

```
Compiled successfully! ✓
```

---

**הכל עובד!** 🎉
