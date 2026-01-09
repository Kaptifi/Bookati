@echo off
echo ========================================
echo Starting Bookati Server...
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server on port 3001...
echo.
call npm run dev

pause
