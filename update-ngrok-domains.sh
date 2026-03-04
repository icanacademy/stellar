#!/bin/bash

# Update ngrok configuration with your reserved domains

echo "🔧 Updating ngrok configuration with reserved domains..."
echo ""

# Load domain names from DOMAINS.txt
if [ ! -f "DOMAINS.txt" ]; then
    echo "❌ DOMAINS.txt not found!"
    echo "Please create DOMAINS.txt with your reserved domain names"
    exit 1
fi

source DOMAINS.txt

# Validate domains are set
if [[ "$TEACHER_DOMAIN" == "your-teacher-domain.ngrok.io" ]] || [[ -z "$TEACHER_DOMAIN" ]]; then
    echo "❌ Please update DOMAINS.txt with your actual reserved domain names"
    echo ""
    echo "Edit DOMAINS.txt and replace:"
    echo "  TEACHER_DOMAIN=your-teacher-domain.ngrok.io"
    echo "  STUDENT_DOMAIN=your-student-domain.ngrok.io"
    echo "  REPORT_CARD_DOMAIN=your-report-card-domain.ngrok.io"
    echo ""
    echo "With your actual ngrok domains from: https://dashboard.ngrok.com/domains"
    exit 1
fi

echo "📝 Using domains:"
echo "  Teacher Report:    https://$TEACHER_DOMAIN"
echo "  Student Viewer:    https://$STUDENT_DOMAIN"
echo "  Report Card:       https://$REPORT_CARD_DOMAIN"
echo ""

# Backup existing config
NGROK_CONFIG="$HOME/Library/Application Support/ngrok/ngrok.yml"
cp "$NGROK_CONFIG" "$NGROK_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backed up existing config"

# Read current authtoken
AUTHTOKEN=$(grep "authtoken:" "$NGROK_CONFIG" | awk '{print $2}')

# Write new config with static domains
cat > "$NGROK_CONFIG" << EOF
version: "2"
authtoken: $AUTHTOKEN

tunnels:
  teacher-report:
    proto: http
    addr: 1441
    domain: $TEACHER_DOMAIN
    inspect: true

  student-viewer:
    proto: http
    addr: 1442
    domain: $STUDENT_DOMAIN
    inspect: true

  report-card:
    proto: http
    addr: 1443
    domain: $REPORT_CARD_DOMAIN
    inspect: true
EOF

echo "✅ Updated ngrok configuration"
echo ""
echo "🎉 All set! Your permanent URLs will be:"
echo "  📝 Teacher Report:    https://$TEACHER_DOMAIN"
echo "  📊 Student Viewer:    https://$STUDENT_DOMAIN"
echo "  🎓 Report Card:       https://$REPORT_CARD_DOMAIN"
echo ""
echo "🚀 Restart your ngrok tunnels to use the new domains:"
echo "  ./start-with-ngrok.sh"
echo ""
