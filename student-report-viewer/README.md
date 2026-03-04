# 📊 Student Report Viewer

A comprehensive web application for viewing and analyzing ICAN STELLAR daily monitoring reports.

## Features

### 📋 Report Viewing
- **Student Selection**: Searchable dropdown to select any student
- **Advanced Filters**: Filter by date range, teacher, and subject
- **Timeline View**: See all reports in chronological order
- **Detailed Reports**: View complete report cards with all assessments

### 📈 Analytics Dashboard
- **Average Ratings**: Track student performance across 6 participation metrics
- **Skill Focus Analysis**: See how often skill focus goals are met
- **Subject Breakdown**: Visual breakdown of subjects studied
- **Teacher Insights**: See which teachers worked with the student

### 🎯 Key Metrics Tracked
- Attention
- Retention
- Comprehension
- Behavior
- Handwriting
- Conversation
- Skills Assessment
- Test Scores

## Quick Start

### Prerequisites
- Node.js installed
- The main `teacher-report-generator` app must be in the same parent directory

### Installation

```bash
# 1. Navigate to the app directory
cd student-report-viewer

# 2. Install dependencies (already done)
npm install

# 3. Start the application
npm start

# 4. Open browser to http://localhost:3001
```

## Usage

1. **Select a Student**: Use the searchable dropdown at the top
2. **Apply Filters** (Optional):
   - Choose date range
   - Filter by teacher
   - Filter by subject
3. **View Analytics**: See comprehensive statistics about the student
4. **Browse Reports**: Scroll through all reports in timeline order
5. **Print/Export**: Use browser print function (Cmd/Ctrl + P)

## File Structure

```
student-report-viewer/
├── app.js              # Express server with API endpoints
├── index.html          # Main interface
├── css/
│   └── styles.css     # Responsive styling
├── js/
│   └── script.js      # Frontend logic and data handling
├── package.json        # Dependencies
└── README.md          # This file
```

## API Endpoints

- `GET /api/students` - Get list of all unique students
- `GET /api/teachers` - Get list of all teachers
- `GET /api/subjects` - Get list of all subjects
- `GET /api/reports?student=X&startDate=Y&endDate=Z` - Get filtered reports
- `GET /api/analytics?student=X` - Get analytics for a student

## Data Source

The app reads data from: `../teacher-report-generator/reports.csv`

Make sure the CSV file exists and is accessible.

## Features in Detail

### Analytics Dashboard
- **Total Reports**: Count of all reports for the student
- **Average Ratings**: Calculated average for each participation metric
- **Star Visualization**: Visual representation of ratings
- **Skill Focus Success Rate**: Percentage of times skill focus was met
- **Subject Distribution**: How many reports per subject
- **Teacher Distribution**: How many sessions with each teacher

### Report Cards
Each report card displays:
- Date and day of week
- Subject and teacher (first name only)
- Skill focus and whether it was met
- Current lesson and homework
- 6 participation ratings with star visualization
- Skills assessment table with weaknesses
- Test scores and percentages
- AI-generated narrative
- Activities completed/not completed

## Customization

### Change Port
Edit `app.js` line 7:
```javascript
const port = 3001; // Change to your preferred port
```

### Change CSV Path
Edit `app.js` line 13:
```javascript
const CSV_PATH = path.join(__dirname, '../teacher-report-generator/reports.csv');
```

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Responsive Design

The app is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones

## Print Functionality

The app includes print-optimized CSS:
- Filters and analytics hidden when printing
- Reports formatted for paper
- Page breaks handled appropriately

## Troubleshooting

### "No students found"
- Check that `reports.csv` exists in the teacher-report-generator folder
- Verify the CSV has data

### Server won't start
- Make sure port 3001 is not already in use
- Check that all dependencies are installed

### Reports not loading
- Verify the CSV file path is correct
- Check browser console for errors
- Ensure the CSV format matches expected structure

## Future Enhancements

Potential features to add:
- Export reports to PDF
- Email reports functionality
- Charts and graphs for analytics
- Compare multiple students
- Progress tracking over time
- Custom report templates

## Support

For issues or questions, check the server logs in the terminal where you ran `npm start`.

---

**Built with ❤️ for ICAN STELLAR**
