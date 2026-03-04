@echo off
title ICAN Stellar Report Generator
echo.
echo 🌟 ICAN Stellar Report Generator 🌟
echo ====================================
echo.
echo Starting application...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Then run this file again.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist ".env" (
    echo 🔧 Setting up configuration...
    node setup.js
    echo.
    echo ⚠️  IMPORTANT: Please edit .env file with your API keys!
    echo Then run this file again.
    echo.
    pause
    exit /b 1
)

REM Start the application
echo 🚀 Launching ICAN Stellar Report Generator...
echo.
echo 📱 The app will open in your default browser at:
echo http://localhost:3000
echo.
echo 🔴 To stop the app, press Ctrl+C
echo.
start "" "http://localhost:3000"
npm start

pause