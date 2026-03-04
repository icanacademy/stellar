const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building standalone one-click apps...\n');

// Create standalone executable scripts
const createStandaloneScripts = () => {
    // Windows batch file
    const windowsBatch = `@echo off
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

pause`;

    // macOS shell script
    const macosScript = `#!/bin/bash

# ICAN Stellar Report Generator - One-Click Launcher
# Make sure this file is executable: chmod +x start-mac.command

clear
echo "🌟 ICAN Stellar Report Generator 🌟"
echo "===================================="
echo ""
echo "Starting application..."
echo ""

# Change to the directory containing this script
cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Then run this file again."
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies!"
        read -p "Press Enter to exit..."
        exit 1
    fi
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "🔧 Setting up configuration..."
    node setup.js
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file with your API keys!"
    echo "Then run this file again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Start the application
echo "🚀 Launching ICAN Stellar Report Generator..."
echo ""
echo "📱 The app will open in your default browser at:"
echo "http://localhost:3000"
echo ""
echo "🔴 To stop the app, press Ctrl+C"
echo ""

# Open in default browser
open "http://localhost:3000"

# Start the server
npm start`;

    // Write the files
    fs.writeFileSync('./start-windows.bat', windowsBatch);
    fs.writeFileSync('./start-mac.command', macosScript);
    
    // Make Mac script executable
    try {
        execSync('chmod +x start-mac.command');
        console.log('✅ Mac launcher created and made executable');
    } catch (error) {
        console.log('✅ Mac launcher created (you may need to make it executable)');
    }
    
    console.log('✅ Windows launcher created');
};

// Create app icons and shortcuts
const createAppBundle = () => {
    console.log('\n📦 Creating app bundles...\n');
    
    // Create Windows app wrapper
    const windowsApp = `@echo off
cd /d "%~dp0"
call start-windows.bat`;
    
    fs.writeFileSync('./ICAN-Stellar-Report-Generator.bat', windowsApp);
    console.log('✅ Windows app bundle created: ICAN-Stellar-Report-Generator.bat');
    
    // Create Mac app wrapper (will be made into .app later)
    const macInfo = `#!/bin/bash
cd "$(dirname "$0")"
./start-mac.command`;
    
    fs.writeFileSync('./ICAN-Stellar-Report-Generator-Mac.command', macInfo);
    try {
        execSync('chmod +x ICAN-Stellar-Report-Generator-Mac.command');
        console.log('✅ Mac app bundle created: ICAN-Stellar-Report-Generator-Mac.command');
    } catch (error) {
        console.log('✅ Mac app bundle created (you may need to make it executable)');
    }
};

// Create installer instructions
const createInstructions = () => {
    const instructions = `# 🚀 ONE-CLICK APP INSTRUCTIONS

## 📋 What You Get
- **Windows**: ICAN-Stellar-Report-Generator.bat
- **Mac**: ICAN-Stellar-Report-Generator-Mac.command

## 🎯 How to Use

### Windows Users:
1. Double-click: ICAN-Stellar-Report-Generator.bat
2. First time: It will install dependencies and create .env file
3. Edit .env file with your API keys
4. Run the .bat file again
5. App opens in your browser automatically!

### Mac Users:
1. Double-click: ICAN-Stellar-Report-Generator-Mac.command
2. First time: It will install dependencies and create .env file
3. Edit .env file with your API keys
4. Run the .command file again
5. App opens in your browser automatically!

## 🔧 Requirements
- Node.js installed (download from https://nodejs.org/)
- Internet connection for first setup
- Your API keys (OpenAI, Notion)

## 🌟 Features
- ✅ One-click startup
- ✅ Automatic dependency installation
- ✅ Automatic browser opening
- ✅ Error checking and helpful messages
- ✅ No technical knowledge required

## 📞 Troubleshooting
If you get permission errors on Mac:
1. Right-click the .command file
2. Select "Open" from context menu
3. Click "Open" in the security dialog

That's it! The app will run with a simple double-click!
`;
    
    fs.writeFileSync('./ONE-CLICK-INSTRUCTIONS.md', instructions);
    console.log('✅ Instructions created: ONE-CLICK-INSTRUCTIONS.md');
};

// Run the build process
console.log('Creating one-click launchers...\n');
createStandaloneScripts();
createAppBundle();
createInstructions();

console.log('\n🎉 One-click apps created successfully!\n');
console.log('📁 Files created:');
console.log('   • ICAN-Stellar-Report-Generator.bat (Windows)');
console.log('   • ICAN-Stellar-Report-Generator-Mac.command (Mac)');
console.log('   • ONE-CLICK-INSTRUCTIONS.md (Instructions)');
console.log('\n🚀 Users can now run the app with just a double-click!');