@echo off
setlocal enabledelayedexpansion

:: ICAN Stellar Report Generator - One-Click Launcher
:: This file makes the app run like a real Windows application

title ICAN Stellar Report Generator

:: Hide the console window after startup (optional)
:: if "%1"=="hideConsole" (
::     powershell -windowstyle hidden -command "start-process '%~f0' -argumentlist 'showConsole'"
::     exit /b
:: )

:: Set colors for a better experience
color 0B

:: Clear screen and show logo
cls
echo.
echo     ╔═══════════════════════════════════════════════════════════╗
echo     ║                                                           ║
echo     ║        🌟 ICAN STELLAR REPORT GENERATOR 🌟                ║
echo     ║                                                           ║
echo     ║              One-Click Desktop Application                ║
echo     ║                                                           ║
echo     ╚═══════════════════════════════════════════════════════════╝
echo.
echo     Starting application...
echo.

:: Change to the directory containing this script
cd /d "%~dp0"

:: Check if Node.js is installed
echo     [1/4] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo     ❌ Node.js is not installed!
    echo.
    echo     Please install Node.js from: https://nodejs.org/
    echo     Then run this application again.
    echo.
    echo     Press any key to open the Node.js download page...
    pause >nul
    start "" "https://nodejs.org/"
    exit /b 1
)
echo     ✅ Node.js is installed

:: Check if dependencies are installed
echo     [2/4] Checking dependencies...
if not exist "node_modules" (
    echo     📦 Installing dependencies (this may take a few minutes)...
    npm install --silent
    if %errorlevel% neq 0 (
        echo     ❌ Failed to install dependencies!
        echo     Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo     ✅ Dependencies installed successfully
) else (
    echo     ✅ Dependencies already installed
)

:: Check if .env file exists
echo     [3/4] Checking configuration...
if not exist ".env" (
    echo     🔧 Creating configuration file with your API keys...
    node setup.js
    echo     ✅ Configuration complete - your API keys are pre-configured!
) else (
    echo     ✅ Configuration file found
)

:: Start the application
echo     [4/4] Starting ICAN Stellar Report Generator...
echo.
echo     🚀 LAUNCHING APPLICATION
echo     ═══════════════════════════
echo.
echo     • Server starting at: http://localhost:3000
echo     • Opening in your default browser...
echo     • Keep this window open while using the app
echo.
echo     💡 TIP: Bookmark http://localhost:3000 for quick access
echo.
echo     🔴 To stop the application, close this window or press Ctrl+C
echo.

:: Wait a moment then open browser
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

:: Start the server
npm start

:: If we get here, the server stopped
echo.
echo     Application stopped.
pause