@echo off
echo ========================================
echo Installing CRM Dependencies
echo ========================================
echo.

echo [1/2] Installing Backend packages...
cd backend
call npm install
if errorlevel 1 (
    echo ERROR: Backend installation failed!
    pause
    exit /b 1
)
echo Backend packages installed successfully!
echo.

echo [2/2] Installing Frontend packages...
cd ..\frontend
call npm install
if errorlevel 1 (
    echo ERROR: Frontend installation failed!
    pause
    exit /b 1
)
echo Frontend packages installed successfully!
echo.

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo You can now run: start-crm.bat
echo.
pause
