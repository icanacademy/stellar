#!/bin/bash
cd "$(dirname "$0")"

echo "🚀 Starting ICAN Stellar with Cloudflare Tunnel..."
echo ""

# Start all apps and Cloudflare tunnel
./start-all-apps.sh &
STELLAR_PID=$!

# Wait for servers to start
echo "⏳ Waiting for servers to initialize..."
sleep 8

# Open the Cloudflare URLs in browser
echo "🌐 Opening your Stellar apps in browser..."
echo ""

open "https://stellar.icanacademy.work"
sleep 1
open "https://teachattendance.icanacademy.work"
sleep 1
open "https://scores.icanacademy.work"
sleep 1
open "https://stellartrack.icanacademy.work"
sleep 1
open "https://studentanalysis.icanacademy.work"

echo "✅ All apps opened!"
echo ""
echo "Your Permanent URLs:"
echo "  📝 Teacher Report:       https://stellar.icanacademy.work"
echo "  👥 Attendance Checker:   https://teachattendance.icanacademy.work"
echo "  🎓 Report Card:          https://scores.icanacademy.work"
echo "  📋 Submission Tracker:   https://stellartrack.icanacademy.work"
echo "  📊 Student Viewer:       https://studentanalysis.icanacademy.work"
echo ""
echo "⏹️  Press Ctrl+C to stop all apps and tunnel"
echo ""

# Wait for the background process
wait $STELLAR_PID
