#!/bin/bash

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
    echo "🔧 Setting up configuration with your API keys..."
    node setup.js
    echo "✅ Configuration complete - your API keys are pre-configured!"
    echo ""
else
    echo "✅ Configuration file found"
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
npm start