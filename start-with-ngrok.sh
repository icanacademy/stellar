#!/bin/bash

# ICAN Stellar - Launch All Applications with ngrok
# This script starts all three Stellar applications and creates ngrok tunnels

echo "🚀 Starting ICAN Stellar Applications with ngrok..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Teacher Report Generator (Port 1441)
echo "📝 Starting Teacher Report Generator on http://localhost:1441"
cd "$SCRIPT_DIR/teacher-report-generator"
node api.js &
PID1=$!

# Start Student Report Viewer (Port 1442) - LOCAL ONLY
echo "📊 Starting Student Report Viewer on http://localhost:1442 (Local Only)"
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

# Wait for servers to start
echo ""
echo "⏳ Waiting for servers to start..."
sleep 3

# Start ngrok with all three tunnels
echo ""
echo "🌐 Starting ngrok tunnels..."
ngrok start teacher-report teacher-attendance report-card &
NGROK_PID=$!

# Wait a moment for ngrok to establish tunnels
sleep 2

echo ""
echo "✅ All applications and ngrok tunnels started successfully!"
echo ""
echo "📱 Local Access:"
echo "   Teacher Report Generator:    http://localhost:1441"
echo "   Student Report Viewer:       http://localhost:1442  ⭐ LOCAL ONLY"
echo "   Teacher Attendance Checker:  http://localhost:3001"
echo "   Report Card Data Generator:  http://localhost:1443"
echo "   Submission Tracker:          http://localhost:1444"
echo ""
echo "🌍 Public URLs (via ngrok):"
echo "   Check ngrok dashboard at: http://localhost:4040"
echo "   Or run: ./get-ngrok-urls.sh"
echo ""
echo "⏹️  To stop all applications and ngrok, press Ctrl+C"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all applications and ngrok..."
    kill $PID1 $PID2 $PID3 $PID4 $PID5 $NGROK_PID 2>/dev/null
    echo "✅ All applications stopped"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

# Wait for all background processes
wait
