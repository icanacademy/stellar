const fs = require('fs');
const path = require('path');

console.log('🪟 Creating Windows executable wrapper...\n');

const createWindowsExe = () => {
    // Create an advanced batch file that looks more like a real app
    const advancedBatch = `@echo off
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
    echo     🔧 Creating configuration file...
    node setup.js
    echo.
    echo     ⚠️  CONFIGURATION REQUIRED
    echo     ═══════════════════════════
    echo.
    echo     A configuration file (.env) has been created.
    echo     You need to add your API keys to this file.
    echo.
    echo     The file will open automatically when you press any key.
    echo     After editing, save the file and run this application again.
    echo.
    pause
    start notepad ".env"
    echo.
    echo     After saving your API keys, run this application again.
    echo.
    pause
    exit /b 1
)
echo     ✅ Configuration file found

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
pause`;

    // Create the batch file
    fs.writeFileSync('./ICAN-Stellar-Report-Generator.bat', advancedBatch);
    
    // Create a VBS script to run the batch file without showing console (optional)
    const vbsScript = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "ICAN-Stellar-Report-Generator.bat" & Chr(34), 0
Set WshShell = Nothing`;
    
    fs.writeFileSync('./ICAN-Stellar-Report-Generator-Silent.vbs', vbsScript);
    
    // Create a PowerShell version for more advanced users
    const powershellScript = `# ICAN Stellar Report Generator - PowerShell Launcher
param(
    [switch]$Silent
)

# Set console colors and title
$Host.UI.RawUI.WindowTitle = "ICAN Stellar Report Generator"
if (-not $Silent) {
    Clear-Host
    Write-Host "🌟 ICAN STELLAR REPORT GENERATOR 🌟" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Starting application..." -ForegroundColor Green
    Write-Host ""
}

# Change to script directory
Set-Location $PSScriptRoot

# Check Node.js
Write-Host "[1/4] Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js is installed ($nodeVersion)" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor White
    Write-Host "Press any key to open the download page..." -ForegroundColor White
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Start-Process "https://nodejs.org/"
    exit 1
}

# Check dependencies
Write-Host "[2/4] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
}

# Check configuration
Write-Host "[3/4] Checking configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "🔧 Creating configuration file..." -ForegroundColor Blue
    node setup.js
    Write-Host ""
    Write-Host "⚠️  CONFIGURATION REQUIRED" -ForegroundColor Yellow
    Write-Host "═══════════════════════════" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Opening configuration file for editing..." -ForegroundColor White
    Write-Host "Please add your API keys, save, and run this app again." -ForegroundColor White
    Write-Host ""
    notepad ".env"
    Read-Host "Press Enter after saving your API keys"
    exit 1
}
Write-Host "✅ Configuration file found" -ForegroundColor Green

# Start application
Write-Host "[4/4] Starting ICAN Stellar Report Generator..." -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 LAUNCHING APPLICATION" -ForegroundColor Cyan
Write-Host "═══════════════════════════" -ForegroundColor Blue
Write-Host ""
Write-Host "• Server starting at: http://localhost:3000" -ForegroundColor White
Write-Host "• Opening in your default browser..." -ForegroundColor White
Write-Host "• Keep this window open while using the app" -ForegroundColor White
Write-Host ""
Write-Host "🔴 To stop the application, close this window or press Ctrl+C" -ForegroundColor Red
Write-Host ""

# Open browser
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

# Start server
npm start`;
    
    fs.writeFileSync('./ICAN-Stellar-Report-Generator.ps1', powershellScript);
    
    console.log('✅ Windows launchers created:');
    console.log('   • ICAN-Stellar-Report-Generator.bat (Main launcher)');
    console.log('   • ICAN-Stellar-Report-Generator-Silent.vbs (Silent mode)');
    console.log('   • ICAN-Stellar-Report-Generator.ps1 (PowerShell version)');
    
    return true;
};

// Create the Windows executable
createWindowsExe();

console.log('\n🎉 Windows executable wrappers created successfully!');
console.log('\n📋 Usage options:');
console.log('1. Double-click: ICAN-Stellar-Report-Generator.bat (recommended)');
console.log('2. Double-click: ICAN-Stellar-Report-Generator-Silent.vbs (no console)');
console.log('3. Right-click PowerShell file → Run with PowerShell');
console.log('\n🌟 The app will work with a simple double-click!');