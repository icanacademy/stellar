# Stellar Submission Tracker

Track daily report submission status for teachers. Shows which teachers have/haven't submitted Stellar reports for their assigned students on any given day.

## Overview

This app **reads data from two sources** (does not modify them):

1. **Scheduling App** (PostgreSQL database via API) - Gets student-teacher assignments
2. **Teacher Report Generator** (`reports.csv`) - Gets submitted reports

It compares these two data sources to show submission status.

## Prerequisites

- Node.js v18+ installed
- **Scheduling App** running (provides assignment data)
- **Teacher Report Generator** folder with `reports.csv` (provides submission data)

## Folder Structure

```
/Stellar/
├── submission-tracker/      ← This app (port 1444)
│   ├── app.js               # Express server
│   ├── index.html           # Main UI
│   ├── css/styles.css       # Styling
│   ├── js/script.js         # Frontend logic
│   ├── package.json         # Dependencies
│   ├── .env                  # Configuration
│   └── README.md            # This file
│
├── teacher-report-generator/ # Required - contains reports.csv
│   └── reports.csv          # READ ONLY - submission data
│
├── scheduling-app 2/        # Required - provides API
│   └── server/              # Must be running on configured port
│
├── start-all-apps.sh        # Starts all Stellar apps
└── open-apps.html           # Quick links to all apps
```

## Installation

1. **Navigate to this folder:**
   ```bash
   cd /path/to/Stellar/submission-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure `.env` file** (create if missing):
   ```env
   # Submission Tracker Configuration
   PORT=1444

   # Scheduling App API URL
   # Change port if your scheduling app runs on a different port
   SCHEDULING_APP_URL=http://localhost:5555

   # Path to reports.csv (relative to this folder)
   REPORTS_CSV_PATH=../teacher-report-generator/reports.csv
   ```

## Configuration

### `.env` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `1444` | Port this app runs on |
| `SCHEDULING_APP_URL` | `http://localhost:5555` | URL of the scheduling app API |
| `REPORTS_CSV_PATH` | `../teacher-report-generator/reports.csv` | Path to reports CSV file |

### Finding Your Scheduling App Port

Check the scheduling app's `.env` file:
```bash
cat "../scheduling-app 2/server/.env" | grep PORT
```

## Running the App

### Option 1: Standalone
```bash
# Make sure scheduling app is running first!
cd /path/to/Stellar/submission-tracker
npm start
```

### Option 2: With All Stellar Apps
```bash
cd /path/to/Stellar
./start-all-apps.sh
```

### Access
Open http://localhost:1444 in your browser

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                  Submission Tracker (Port 1444)             │
│                                                             │
│  1. User selects a date                                     │
│  2. App fetches assignments from Scheduling App API         │
│  3. App reads reports.csv for that date                     │
│  4. App compares and shows submission status                │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ GET /api/assignments         │ READ FILE
         │ (HTTP request)               │ (fs.readFile)
         ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────────┐
│  Scheduling App     │    │  teacher-report-generator/      │
│  (Port 5555)        │    │  reports.csv                    │
│                     │    │                                 │
│  NOT MODIFIED       │    │  NOT MODIFIED                   │
└─────────────────────┘    └─────────────────────────────────┘
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Main UI |
| `GET /api/tracker?date=YYYY-MM-DD` | Get submission status for a date |
| `GET /api/tracker?date=YYYY-MM-DD&demo=true` | Demo mode with sample data |
| `GET /api/teachers` | List of teachers from reports |
| `GET /api/dates-with-data` | Dates that have report data |
| `GET /api/health` | Health check |

## Features

- **Date picker** - Select any date to view
- **Student filter** - Filter by specific student
- **Teacher filter** - Filter by specific teacher
- **Status filter** - Show All/Submitted/Missing
- **Last Report indicator** - Shows when each student's last report was submitted
- **Summary bar** - Shows X/Y submitted with progress bar
- **Print Missing** - Print-friendly view of missing reports
- **Export CSV** - Download filtered data as CSV
- **Demo Mode** - Preview with sample data (no scheduling app needed)

## Troubleshooting

### "Unable to connect to scheduling app"
- Make sure the scheduling app is running
- Check the `SCHEDULING_APP_URL` in `.env` matches the scheduling app's port
- Test: `curl http://localhost:5555/api/health`

### "No classes scheduled for this date"
- The scheduling app has no assignments for that date
- Try a different date or use Demo Mode to preview the UI

### "reports.csv not found"
- Check `REPORTS_CSV_PATH` in `.env` is correct
- Make sure the teacher-report-generator folder exists with reports.csv

### PostgreSQL errors on scheduling app
- The scheduling app needs PostgreSQL running
- Check scheduling app's `.env` for DB_USER - may need to match your system username

## Dependencies

```json
{
  "cors": "^2.8.5",
  "csv-parser": "^3.0.0",
  "dotenv": "^16.3.1",
  "express": "^4.18.2"
}
```

## Data Flow (Read Only)

This app **ONLY READS** data from:

1. **Scheduling App API** - HTTP GET requests only
   - `/api/assignments?date=YYYY-MM-DD`
   - `/api/timeslots`
   - `/api/rooms`

2. **reports.csv** - File read only, never written

**No data is modified** in other apps or databases.
