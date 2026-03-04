#!/bin/bash

# ICAN Stellar - Launch All Applications + Cloudflare Tunnel
# This script starts all Stellar applications and exposes them via Cloudflare Tunnel

echo "🚀 Starting ICAN Stellar Applications..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Teacher Report Generator (Port 1441)
echo "📝 Starting Teacher Report Generator on http://localhost:1441"
cd "$SCRIPT_DIR/teacher-report-generator"
node api.js &
PID1=$!

# Start Student Report Viewer (Port 1442)
echo "📊 Starting Student Report Viewer on http://localhost:1442"
cd "$SCRIPT_DIR/student-report-viewer"
node app.js &
PID2=$!

# Start Teacher Attendance Checker (Port 3001)
echo "👥 Starting Teacher Attendance Checker on http://localhost:3001"
cd "$SCRIPT_DIR/../attendance-checker"
node server.js &
PID3=$!

# Start Report Card Data Generator (Port 1443)
echo "🎓 Starting Report Card Data Generator on http://localhost:1443"
cd "$SCRIPT_DIR/report-card-data-generator"
node app.js &
PID4=$!

# Start Submission Tracker (Port 1444)
echo "📋 Starting Submission Tracker on http://localhost:1444"
cd "$SCRIPT_DIR/submission-tracker"
node app.js &
PID5=$!

# Start Online Student Report Viewer (Port 1445)
echo "🌐 Starting Online Student Report Viewer on http://localhost:1445"
cd "$SCRIPT_DIR/online-student-report-viewer"
node app.js &
PID6=$!

# Start Online Data Manager (Port 1446)
echo "🗂️  Starting Online Data Manager on http://localhost:1446"
cd "$SCRIPT_DIR/online-data-manager"
node app.js &
PID7=$!

# Wait for servers to start
sleep 3

# Start Cloudflare Tunnel
echo ""
echo "🌐 Starting Cloudflare Tunnel..."
cloudflared tunnel run cosmodrive &
TUNNEL_PID=$!

sleep 2

echo ""
echo "✅ All applications and Cloudflare Tunnel started!"
echo ""
echo "📱 Local Access:"
echo "   Teacher Report Generator:    http://localhost:1441"
echo "   Student Report Viewer:       http://localhost:1442"
echo "   Teacher Attendance Checker:  http://localhost:3001"
echo "   Report Card Data Generator:  http://localhost:1443"
echo "   Submission Tracker:          http://localhost:1444"
echo "   Online Student Viewer:      http://localhost:1445"
echo "   Online Data Manager:        http://localhost:1446"
echo ""
echo "🌍 Public URLs (via Cloudflare):"
echo "   📝 Teacher Report:       https://stellar.icanacademy.work"
echo "   👥 Attendance Checker:   https://teachattendance.icanacademy.work"
echo "   🎓 Report Card:          https://scores.icanacademy.work"
echo "   📋 Submission Tracker:   https://stellartrack.icanacademy.work"
echo "   📊 Student Viewer:       https://studentanalysis.icanacademy.work"
echo ""
echo "⏹️  To stop all applications, press Ctrl+C"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all applications and Cloudflare Tunnel..."
    kill $PID1 $PID2 $PID3 $PID4 $PID5 $PID6 $PID7 $TUNNEL_PID 2>/dev/null
    echo "✅ All applications stopped"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

# Wait for all background processes
wait
