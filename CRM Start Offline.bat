@echo off
title Warehouse CRM System - OFFLINE READY
color 0A

echo ================================================
echo    Warehouse CRM - Offline Ready!
echo ================================================
echo.

REM === BACKEND (תמיד עובד) ===
echo [1/2] Starting Backend (localhost:3001)...
cd /d "%~dp0backend"
start "CRM Backend" cmd /k "node server.js"

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM === FRONTEND (תמיד עובד) ===
echo [2/2] Starting Frontend (localhost:3000)...
start "CRM Frontend" cmd /k "cd /d %~dp0frontend && npx live-server . --port=3000 --no-browser"

echo.
echo ================================================
echo Backend: http://localhost:3001  
echo Frontend: http://localhost:3000
echo ================================================
echo.
pause
