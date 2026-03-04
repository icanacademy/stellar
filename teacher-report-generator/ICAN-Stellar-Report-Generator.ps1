# ICAN Stellar Report Generator - PowerShell Launcher
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
npm start