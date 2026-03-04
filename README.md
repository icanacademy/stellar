# 🚀 ICAN Stellar - Complete System

A comprehensive student report management system with three integrated applications.

## 🎯 Quick Start

### Option 1: Double-Click Launcher (Mac)
1. Double-click `START-STELLAR.command` to start all servers
2. Open `open-apps.html` in your browser to access all applications

### Option 2: Terminal Launch
```bash
# Navigate to the Stellar directory
cd /Users/icanacademy/Stellar

# Run the launcher script
./start-all-apps.sh
```

### Option 3: Manual Launch
Open three separate terminal windows and run:
```bash
# Terminal 1 - Teacher Report Generator
cd teacher-report-generator && node api.js

# Terminal 2 - Student Report Viewer
cd student-report-viewer && node app.js

# Terminal 3 - Report Card Data Generator
cd report-card-data-generator && node app.js
```

## 📱 Applications

### 1. Teacher Report Generator (Port 1441)
**URL:** http://localhost:1441

Create daily monitoring reports with:
- AI-powered narrative generation
- Notion database integration
- Star-based ratings (Attention, Retention, Comprehension, Behavior, Handwriting, Conversation)
- Skills assessment with weakness tracking
- Print and PNG download capabilities

### 2. Student Report Viewer (Port 1442)
**URL:** http://localhost:1442

View and analyze student performance with:
- Advanced filtering (date range, teacher, subject)
- Analytics dashboard with performance metrics
- AI-powered comprehensive analysis
- Chart visualizations and trends
- Framework analysis (Balancing, Nurturing, Polishing, Higher-minds)

### 3. Report Card Data Generator (Port 1443)
**URL:** http://localhost:1443

Generate final report cards with:
- Tabular score display across dates
- Subject-specific filtering
- AI-generated final reports
- Three sections: Strengths, Improvements, Recommendations

## 🌐 Network Access

### Option 1: Local Network Access
To access from other devices on your network:

1. Find your IP address:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Share these URLs with other devices:
   - Teacher Report: `http://YOUR_IP:1441`
   - Student Viewer: `http://YOUR_IP:1442`
   - Report Card: `http://YOUR_IP:1443`

### Option 2: Internet Access (via ngrok)
Access your applications from anywhere on the internet:

#### Quick Start with ngrok:
1. **Double-click launcher (Mac):**
   - Double-click `START-STELLAR-NGROK.command`

2. **Terminal launch:**
   ```bash
   cd /Users/icanacademy/Stellar
   ./start-with-ngrok.sh
   ```

3. **Get your public URLs:**
   ```bash
   # Run this in a new terminal while ngrok is running
   ./get-ngrok-urls.sh
   ```

   Or visit the ngrok dashboard: http://localhost:4040

#### What you get:
- Three public HTTPS URLs (one for each app)
- Accessible from anywhere on the internet
- Automatically secured with SSL/TLS
- Inspect traffic via ngrok dashboard

#### Example URLs:
- Teacher Report: `https://abc123.ngrok.io`
- Student Viewer: `https://def456.ngrok.io`
- Report Card: `https://ghi789.ngrok.io`

**Note:** ngrok URLs change each time you restart ngrok (unless you have a paid plan with reserved domains)

## 🛑 Stopping Applications

If you started with `START-STELLAR.command` or `start-all-apps.sh`:
- Press `Ctrl+C` in the terminal to stop all applications

If you started manually:
- Press `Ctrl+C` in each terminal window

## ⚙️ Configuration

Each application requires a `.env` file with:
```env
OPENAI_API_KEY=your_openai_api_key_here
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_student_database_id_here
NOTION_TEACHERS_DATABASE_ID=your_teachers_database_id_here
NOTION_SKILLS_DATABASE_ID=your_skills_database_id_here
NOTION_FOCUSSKILL_DATABASE_ID=your_focusskill_database_id_here
```

## 📊 Data Flow

1. **Teacher Report Generator** creates reports → saves to `reports.csv`
2. **Student Report Viewer** reads `reports.csv` → provides analytics
3. **Report Card Generator** reads `reports.csv` → generates final reports

## 🆘 Troubleshooting

### Servers won't start
- Make sure ports 1441, 1442, 1443 are not in use
- Check that all dependencies are installed: `npm install` in each directory
- Verify `.env` files exist with valid API keys

### Can't access applications
- Ensure servers are running (check terminal output)
- Try accessing with `http://localhost:PORT` instead of `127.0.0.1`
- Check your firewall settings for network access

### Data not showing
- Verify `teacher-report-generator/reports.csv` exists
- Check that reports have been created in the Teacher Report Generator
- Ensure proper CSV format (headers must match expected format)

## 📂 File Structure

```
Stellar/
├── START-STELLAR.command          # Mac double-click launcher
├── START-STELLAR-NGROK.command    # Mac launcher with ngrok
├── start-all-apps.sh              # Shell script launcher
├── start-with-ngrok.sh            # Shell script with ngrok
├── get-ngrok-urls.sh              # Display ngrok public URLs
├── open-apps.html                 # Browser launcher page
├── teacher-report-generator/      # Main report creation app
│   ├── api.js
│   ├── index.html
│   └── reports.csv                # Shared data file
├── student-report-viewer/         # Analytics and viewing app
│   ├── app.js
│   └── index.html
└── report-card-data-generator/    # Final report generation app
    ├── app.js
    └── index.html
```

## 🎓 Support

For issues or questions:
1. Check server logs in the terminal
2. Verify API keys are correct in `.env` files
3. Ensure Notion databases are properly shared with integration
4. Check network connectivity for API calls

---

**Made with ❤️ for ICAN Academy**
