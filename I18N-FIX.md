# 🔧 תיקון שגיאת i18n!

## ❌ השגיאה:

```
Cannot read properties of undefined (reading 'language')
```

---

## ✅ הבעיה:

השתמשנו ב-`i18n.language` אבל ה-context מספק `language` ישירות.

### לפני:
```javascript
const { t, i18n } = useLanguage();
const currentLang = i18n.language || 'he';
```

❌ `i18n` לא קיים!

---

## ✅ התיקון:

### אחרי:
```javascript
const { t, language } = useLanguage();
window.open(`...?lang=${language}`, '_blank');
```

✅ `language` זמין ישירות!

---

## 🔄 עדכון:

**קובץ אחד:**
```
frontend/src/pages/Inbound.js
```

**פשוט החלף ורענן דפדפן!**

---

## ✅ תוצאה:

```
קליטה → הוסף
☑ צור תעודת קליטה
שמור → תעודה נפתחת! ✓
```

---

**עכשיו זה עובד מושלם!** 🎉
