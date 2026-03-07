@echo off
title Warehouse CRM System Startup
color 0A

echo ================================================
echo    WorldSecure CRM System
echo    Starting Backend, Frontend and Cloud Sync...
echo ================================================
echo.

REM Start Backend Server
echo [1/3] Starting Backend Server...
start "CRM Backend Server" cmd /k "cd /d %~dp0backend && echo Backend Server Starting... && npm start"

REM Wait 5 seconds for backend to initialize
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

REM Start Frontend
echo [2/3] Starting Frontend Application...
start "CRM Frontend" cmd /k "cd /d %~dp0frontend && echo Frontend Starting... && npm start"

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM Start Cloud Sync Service
echo [3/3] Starting Cloud Sync Service...
start "CRM Cloud Sync" cmd /k "cd /d %~dp0backend && echo Cloud Sync Service Starting... && node sync-to-cloud.js"

echo.
echo ================================================
echo System Started Successfully!
echo ================================================
echo.
echo Backend API:  http://localhost:3001
echo Frontend UI:  http://localhost:3000
echo Cloud Sync:   Running every 5 minutes
echo.
echo Cloud URL: https://worldsecure-frontend.onrender.com
echo.
echo To stop the system, close all three console windows.
echo ================================================
echo.
pause
