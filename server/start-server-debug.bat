@echo off
echo ========================================
echo   Starting Backend Server (Debug Mode)
echo ========================================
echo.

cd /d "%~dp0"

echo Current directory: %CD%
echo.

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)
echo.

echo Checking .env file...
if exist .env (
    echo .env file found
) else (
    echo ERROR: .env file not found!
    echo Please create .env file with DATABASE_URL and PORT
    pause
    exit /b 1
)
echo.

echo Checking node_modules...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server on port 3001...
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

npm run dev

pause

