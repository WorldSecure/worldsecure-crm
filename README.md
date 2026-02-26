# מערכת CRM לניהול מחסן

מערכת ניהול מחסן מלאה עם ממשק אינטרנטי, תומכת בעברית, אנגלית ופורטוגזית.

## תכונות

✅ ניהול עד 500 מוצרים
✅ ניהול ספקים ולקוחות
✅ קליטה והוצאה ממחסן
✅ התראות מלאי נמוך
✅ תעודות משלוח (PDF + Email)
✅ לוגו ופרטי חברה מותאמים
✅ 3 משתמשים עם הרשאות
✅ יומן פעולות ודוחות
✅ תמיכה ב-3 שפות

## דרישות מערכת

- Node.js (גרסה 14 ומעלה)
- npm או yarn
- Windows 10/11

## התקנה

### שלב 1: התקנת Node.js

1. הורד Node.js מ: https://nodejs.org/
2. התקן את Node.js (בחר "Add to PATH")
3. פתח CMD/PowerShell ובדוק:
```bash
node --version
npm --version
```

### שלב 2: התקנת המערכת

1. פתח CMD/PowerShell
2. נווט לתיקיית הפרויקט:
```bash
cd C:\Users\amit\crm-project
```

3. התקן את ה-Backend:
```bash
cd backend
npm install
```

4. התקן את ה-Frontend:
```bash
cd ..\frontend
npm install
```

## הפעלת המערכת

### אופציה 1: הפעלה ידנית (2 חלונות)

**חלון 1 - Backend:**
```bash
cd C:\Users\amit\crm-project\backend
npm start
```
השרת יתחיל על: http://localhost:3001

**חלון 2 - Frontend:**
```bash
cd C:\Users\amit\crm-project\frontend
npm start
```
הדפדפן ייפתח אוטומטית על: http://localhost:3000

### אופציה 2: יצירת קובץ Batch להפעלה מהירה

צור קובץ בשם `start-crm.bat` בתיקיית הראשית:

```batch
@echo off
echo Starting Warehouse CRM System...
echo.

start "CRM Backend" cmd /k "cd /d C:\Users\amit\crm-project\backend && npm start"
timeout /t 5
start "CRM Frontend" cmd /k "cd /d C:\Users\amit\crm-project\frontend && npm start"

echo.
echo System is starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo.
pause
```

לאחר מכן, פשוט לחץ פעמיים על `start-crm.bat` להפעלת המערכת.

## שימוש ראשוני

1. פתח את הדפדפן ב: http://localhost:3000
2. לחץ על "הרשם" ליצירת משתמש ראשון
3. התחבר עם המשתמש שיצרת
4. התחל להגדיר את המערכת:
   - הגדרות חברה (לוגו, פרטים)
   - קטגוריות
   - מוצרים
   - ספקים
   - לקוחות

## גישה ממחשבים אחרים ברשת

1. מצא את כתובת ה-IP של המחשב:
```bash
ipconfig
```
חפש את "IPv4 Address" (למשל: 192.168.1.100)

2. במחשבים אחרים ברשת, פתח דפדפן:
```
http://192.168.1.100:3000
```

## פתרון בעיות

### הפורט תפוס
אם הפורט 3000 או 3001 תפוס:
- Backend: ערוך את `backend/server.js` ושנה את `PORT`
- Frontend: ערוך את `frontend/package.json` ושנה את `proxy`

### בעיות התקנה
נסה לרוץ כ-Administrator:
```bash
npm cache clean --force
npm install
```

### אין גישה מרחוק
- בדוק firewall
- וודא שהמחשבים באותה רשת
- השתמש בכתובת ה-IP הנכונה

## מבנה תיקיות

```
crm-project/
├── backend/              # שרת Node.js
│   ├── server.js        # קובץ ראשי
│   ├── database.js      # הגדרת SQLite
│   └── warehouse.db     # בסיס נתונים (נוצר אוטומטית)
├── frontend/            # ממשק React
│   ├── src/
│   │   ├── pages/      # דפים
│   │   ├── components/ # קומפוננטות
│   │   └── utils/      # כלי עזר
│   └── public/
└── README.md
```

## גיבוי

בסיס הנתונים נמצא ב:
```
C:\Users\amit\crm-project\backend\warehouse.db
```

גבה קובץ זה באופן קבוע!

## תמיכה

לשאלות או בעיות, פנה למפתח המערכת.

---
פותח עם ❤️ עבור ניהול מחסן יעיל
