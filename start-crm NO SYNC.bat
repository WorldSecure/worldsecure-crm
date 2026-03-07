@echo off
title Warehouse CRM System Startup
color 0A

echo ================================================
echo    Warehouse CRM System
echo    Starting Backend and Frontend...
echo ================================================
echo.

REM Start Backend Server
echo [1/2] Starting Backend Server...
start "CRM Backend Server" cmd /k "cd /d %~dp0backend && echo Backend Server Starting... && npm start"

REM Wait 5 seconds for backend to initialize
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

REM Start Frontend
echo [2/2] Starting Frontend Application...
start "CRM Frontend" cmd /k "cd /d %~dp0frontend && echo Frontend Starting... && npm start"

echo.
echo ================================================
echo System Started Successfully!
echo ================================================
echo.
echo Backend API: http://localhost:3001
echo Frontend UI: http://localhost:3000
echo.
echo The browser will open automatically in a moment...
echo.
echo To stop the system, close both console windows
echo or press Ctrl+C in each window.
echo ================================================
echo.
pause
