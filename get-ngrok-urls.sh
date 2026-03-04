#!/bin/bash

# Display ngrok public URLs in a nice format

echo ""
echo "🌍 ICAN Stellar - Public URLs (via ngrok)"
echo "=========================================="
echo ""

# Check if ngrok is running
if ! curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
    echo "❌ ngrok is not running or not accessible on port 4040"
    echo ""
    echo "Start ngrok with: ./start-with-ngrok.sh"
    echo ""
    exit 1
fi

# Fetch tunnels from ngrok API and parse with Python
curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)['tunnels']

labels = {
    'teacher-report': '📝 Teacher Report Generator',
    'teacher-attendance': '👥 Teacher Attendance Checker',
    'report-card': '🎓 Report Card Data Generator'
}

for tunnel in tunnels:
    name = tunnel['name']
    url = tunnel['public_url']
    label = labels.get(name, name)
    print(f'{label}:')
    print(f'   {url}')
    print()
"

echo ""
echo "💡 Tips:"
echo "   - Share these URLs with anyone on the internet"
echo "   - URLs are valid as long as ngrok is running"
echo "   - View ngrok dashboard: http://localhost:4040"
echo ""
