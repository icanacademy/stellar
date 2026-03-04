const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = 1443;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());

// AI analysis cache: keyed by "student|subject", value = { data, timestamp }
const aiCache = new Map();
const AI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedAI(student, subject) {
    const key = `${student}|${subject}`;
    const entry = aiCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < AI_CACHE_TTL) {
        return entry.data;
    }
    if (entry) aiCache.delete(key);
    return null;
}

function setCachedAI(student, subject, data) {
    aiCache.set(`${student}|${subject}`, { data, timestamp: Date.now() });
}

// Serve static files - specific routes first before general
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
// Serve root directory files (index.html, etc)
app.use(express.static(__dirname));

// Path to the CSV file
const CSV_PATH = path.join(__dirname, '..', 'teacher-report-generator', 'reports.csv');

// Academic Enabler JSON helpers
const AE_PATH = path.join(__dirname, 'academic-enabler.json');

function readAE() {
    try {
        if (!fs.existsSync(AE_PATH)) {
            fs.writeFileSync(AE_PATH, '[]', 'utf8');
            return [];
        }
        return JSON.parse(fs.readFileSync(AE_PATH, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeAE(data) {
    fs.writeFileSync(AE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Reading Assessment JSON helpers
const RA_PATH = path.join(__dirname, 'reading-assessment.json');

function readRA() {
    try {
        if (!fs.existsSync(RA_PATH)) {
            fs.writeFileSync(RA_PATH, '[]', 'utf8');
            return [];
        }
        return JSON.parse(fs.readFileSync(RA_PATH, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeRA(data) {
    fs.writeFileSync(RA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── CSV Data Manager Infrastructure ──

const BACKUP_DIR = path.join(path.dirname(CSV_PATH), 'backups');

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}
ensureBackupDir();

function createBackup(label) {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `reports_${timestamp}_${label}.csv`;
    const dest = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(CSV_PATH, dest);

    // Auto-prune: keep only last 50 backups
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('reports_') && f.endsWith('.csv'))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
    if (files.length > 50) {
        files.slice(50).forEach(f => {
            try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch (e) { /* ignore */ }
        });
    }
    return filename;
}

// Simple write lock to prevent concurrent CSV mutations
let csvWriteLock = false;

async function safeCSVWrite(label, mutator) {
    if (csvWriteLock) {
        throw new Error('Another write operation is in progress. Please try again.');
    }
    csvWriteLock = true;
    try {
        const rawRows = readCSVRaw();
        createBackup(label);
        const result = mutator(rawRows);
        const rowsToWrite = result.rows !== undefined ? result.rows : rawRows;
        writeCSV(rowsToWrite);
        return result;
    } finally {
        csvWriteLock = false;
    }
}

// Read CSV columns dynamically from header
let CSV_COLUMNS = null;

function getCSVColumns() {
    if (CSV_COLUMNS) return CSV_COLUMNS;
    if (!fs.existsSync(CSV_PATH)) return [];
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const firstNewline = content.indexOf('\n');
    if (firstNewline === -1) return [];
    const headerLine = content.slice(0, firstNewline).replace(/\r$/, '');
    CSV_COLUMNS = parseCSVLineRaw(headerLine);
    return CSV_COLUMNS;
}

function parseCSVLineRaw(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function splitCSVLinesRaw(content) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            currentLine += char;
        } else if (char === '\n' && !inQuotes) {
            if (currentLine.replace(/\r$/, '').trim()) lines.push(currentLine.replace(/\r$/, ''));
            currentLine = '';
        } else if (char === '\r') {
            // skip
        } else {
            currentLine += char;
        }
    }
    if (currentLine.replace(/\r$/, '').trim()) lines.push(currentLine.replace(/\r$/, ''));
    return lines;
}

// Read CSV without JSON-parsing Skills/Scores (preserves original strings for write-back)
function readCSVRaw() {
    if (!fs.existsSync(CSV_PATH)) return [];
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = splitCSVLinesRaw(content);
    if (lines.length < 2) return [];

    const headers = parseCSVLineRaw(lines[0]);
    CSV_COLUMNS = headers; // cache
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLineRaw(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : ''; });
        rows.push(row);
    }
    return rows;
}

function escapeCSVField(value) {
    const str = String(value == null ? '' : value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function writeCSV(rows) {
    const columns = getCSVColumns();
    if (columns.length === 0) throw new Error('No CSV columns found');
    const headerLine = columns.join(',');
    const dataLines = rows.map(row =>
        columns.map(col => escapeCSVField(row[col])).join(',')
    );
    fs.writeFileSync(CSV_PATH, headerLine + '\n' + dataLines.join('\n') + '\n', 'utf-8');
    // Invalidate column cache so it re-reads on next access
    CSV_COLUMNS = null;
}

// Function to read and parse CSV
function readCSV() {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (data) => {
                // Parse Skills JSON if it exists
                if (data.Skills) {
                    try {
                        data.Skills = JSON.parse(data.Skills);
                    } catch (e) {
                        data.Skills = {};
                    }
                }

                // Parse Scores JSON if it exists
                if (data.Scores) {
                    try {
                        data.Scores = JSON.parse(data.Scores);
                    } catch (e) {
                        data.Scores = {};
                    }
                }

                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Get unique students
app.get('/api/students', async (req, res) => {
    try {
        const reports = await readCSV();
        const students = [...new Set(reports.map(r => r['Student Name']))].filter(Boolean).sort();
        res.json(students);
    } catch (error) {
        console.error('Error reading students:', error);
        res.status(500).json({ error: 'Failed to read student data' });
    }
});

// Get unique teachers (optionally filtered by student and date range)
app.get('/api/teachers', async (req, res) => {
    try {
        const reports = await readCSV();
        const { student, from, to } = req.query;
        let filtered = student
            ? reports.filter(r => r['Student Name'] === student)
            : reports;
        if (from) filtered = filtered.filter(r => r.Date >= from);
        if (to) filtered = filtered.filter(r => r.Date <= to);
        const raw = [...new Set(filtered.map(r => r['Teacher Name']).filter(Boolean))];
        const teachers = raw.map(t => {
            const match = t.match(/\[([^\]]+)\]\s*(.*)/);
            return match
                ? { nickname: match[1], fullName: match[2].trim(), raw: t }
                : { nickname: '', fullName: t.trim(), raw: t };
        });
        teachers.sort((a, b) => a.fullName.localeCompare(b.fullName));
        res.json(teachers);
    } catch (error) {
        console.error('Error reading teachers:', error);
        res.status(500).json({ error: 'Failed to read teacher data' });
    }
});

// Get unique subjects (optionally filtered by student)
app.get('/api/subjects', async (req, res) => {
    try {
        const reports = await readCSV();
        const { student } = req.query;

        let filtered = reports;
        if (student) {
            filtered = reports.filter(r => r['Student Name'] === student);
        }

        const subjects = [...new Set(filtered.map(r => r.Subject))].filter(Boolean).sort();
        res.json(subjects);
    } catch (error) {
        console.error('Error reading subjects:', error);
        res.status(500).json({ error: 'Failed to read subject data' });
    }
});

// Get all reports (optionally filtered by student)
app.get('/api/reports', async (req, res) => {
    try {
        const reports = await readCSV();
        const { student } = req.query;

        if (student) {
            const filtered = reports.filter(r => r['Student Name'] === student);
            res.json(filtered);
        } else {
            res.json(reports);
        }
    } catch (error) {
        console.error('Error reading reports:', error);
        res.status(500).json({ error: 'Failed to read reports' });
    }
});

// Get filtered report card data
app.get('/api/report-card-data', async (req, res) => {
    try {
        const { student, subject } = req.query;

        if (!student || !subject) {
            return res.status(400).json({ error: 'Student and subject are required' });
        }

        const reports = await readCSV();

        // Filter by student and subject
        const filteredReports = reports.filter(r =>
            r['Student Name'] === student && r.Subject === subject
        );

        // Sort by date (oldest first)
        filteredReports.sort((a, b) => new Date(a.Date) - new Date(b.Date));

        // Format the data for table display
        const tableData = filteredReports.map(report => {
            const scores = report.Scores || {};

            // Helper function to handle empty strings and missing values
            const getValue = (value) => {
                if (value === null || value === undefined || value === '') {
                    return '';
                }
                return value;
            };

            // Extract name from brackets [Name] format
            let teacherName = report['Teacher Name'] || '-';
            if (teacherName !== '-') {
                const match = teacherName.match(/\[([^\]]+)\]/);
                if (match) {
                    teacherName = match[1];
                }
            }

            return {
                date: report.Date || '-',
                bookMaterialsScore: getValue(scores.bookMaterials?.score),
                bookMaterialsTotal: getValue(scores.bookMaterials?.total),
                vocabularyScore: getValue(scores.vocabulary?.score),
                vocabularyTotal: getValue(scores.vocabulary?.total),
                classVideoScore: getValue(scores.classVideo?.score),
                classVideoTotal: getValue(scores.classVideo?.total),
                homeworkScore: getValue(scores.homework?.score),
                homeworkTotal: getValue(scores.homework?.total),
                homeworkVocabScore: getValue(scores.homeworkVocab?.score),
                homeworkVocabTotal: getValue(scores.homeworkVocab?.total),
                weeklyTestScore: getValue(scores.weeklyTest?.score),
                weeklyTestTotal: getValue(scores.weeklyTest?.total),
                teacherName: teacherName
            };
        });

        res.json({
            student,
            subject,
            count: tableData.length,
            data: tableData
        });
    } catch (error) {
        console.error('Error generating report card data:', error);
        res.status(500).json({ error: 'Failed to generate report card data' });
    }
});

// AI Analysis endpoint
app.get('/api/ai-analysis', async (req, res) => {
    try {
        const { student, subject } = req.query;

        if (!student || !subject) {
            return res.status(400).json({ error: 'Student and subject are required' });
        }

        // Check AI cache first
        const cached = getCachedAI(student, subject);
        if (cached) {
            return res.json(cached);
        }

        const reports = await readCSV();

        // Filter by student and subject
        const filteredReports = reports.filter(r =>
            r['Student Name'] === student && r.Subject === subject
        );

        if (filteredReports.length === 0) {
            return res.status(404).json({ error: 'No reports found for this combination' });
        }

        // Aggregate all data for analysis
        let totalAttention = 0, totalRetention = 0, totalComprehension = 0;
        let totalBehavior = 0, totalHandwriting = 0, totalConversation = 0;
        let skillFocusMetCount = 0;
        let allWeaknesses = {};
        let allScores = {
            bookMaterials: [], vocabulary: [], classVideo: [],
            homework: [], homeworkVocab: [], weeklyTest: []
        };
        let allNarratives = [];

        filteredReports.forEach(report => {
            // Aggregate ratings
            totalAttention += parseInt(report.Attention) || 0;
            totalRetention += parseInt(report.Retention) || 0;
            totalComprehension += parseInt(report.Comprehension) || 0;
            totalBehavior += parseInt(report.Behavior) || 0;
            totalHandwriting += parseInt(report.Handwriting) || 0;
            totalConversation += parseInt(report.Conversation) || 0;

            // Count skill focus met
            if (report['SF Met'] === 'YES') skillFocusMetCount++;

            // Collect narratives
            if (report.Narrative) {
                allNarratives.push({
                    date: report.Date,
                    narrative: report.Narrative
                });
            }

            // Aggregate weaknesses from skills
            if (report.Skills && typeof report.Skills === 'object') {
                Object.entries(report.Skills).forEach(([skill, data]) => {
                    if (data.weaknesses && Array.isArray(data.weaknesses)) {
                        data.weaknesses.forEach(weakness => {
                            allWeaknesses[weakness] = (allWeaknesses[weakness] || 0) + 1;
                        });
                    }
                });
            }

            // Aggregate scores
            if (report.Scores && typeof report.Scores === 'object') {
                Object.entries(allScores).forEach(([key, arr]) => {
                    if (report.Scores[key]?.score && report.Scores[key]?.total) {
                        const score = parseInt(report.Scores[key].score);
                        const total = parseInt(report.Scores[key].total);
                        if (!isNaN(score) && !isNaN(total) && total > 0) {
                            arr.push({ score, total, percentage: (score / total) * 100 });
                        }
                    }
                });
            }
        });

        const reportCount = filteredReports.length;

        // Calculate averages
        const avgAttention = (totalAttention / reportCount).toFixed(1);
        const avgRetention = (totalRetention / reportCount).toFixed(1);
        const avgComprehension = (totalComprehension / reportCount).toFixed(1);
        const avgBehavior = (totalBehavior / reportCount).toFixed(1);
        const avgHandwriting = (totalHandwriting / reportCount).toFixed(1);
        const avgConversation = (totalConversation / reportCount).toFixed(1);
        const skillFocusMetPercentage = ((skillFocusMetCount / reportCount) * 100).toFixed(1);

        // Top weaknesses
        const topWeaknesses = Object.entries(allWeaknesses)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([weakness, count]) => ({ weakness, count }));

        // Score summaries
        const scoreSummaries = {};
        Object.entries(allScores).forEach(([key, arr]) => {
            if (arr.length > 0) {
                const avgPercentage = arr.reduce((sum, item) => sum + item.percentage, 0) / arr.length;
                scoreSummaries[key] = {
                    average: avgPercentage.toFixed(1),
                    count: arr.length
                };
            }
        });

        // Build prompt for OpenAI - Focus on narratives for final report
        const narrativeSection = allNarratives.length > 0
            ? `\n\nTeacher Narrative Reports (${allNarratives.length} reports):\n${allNarratives.map((n, i) => `\nReport ${i + 1} (${n.date}):\n${n.narrative}`).join('\n')}\n`
            : '';

        const prompt = `You are an educational analyst creating a comprehensive FINAL REPORT for ${student} in ${subject} class based on ${reportCount} reports.

IMPORTANT: Your analysis should PRIMARILY focus on the teacher's narrative reports below, which contain detailed observations and insights about the student's performance, participation, and development over time. Use the quantitative data as supporting evidence to back up the patterns and trends identified in the narratives.

${narrativeSection}

Supporting Quantitative Data:
- Average Attention: ${avgAttention}/5
- Average Retention: ${avgRetention}/5
- Average Comprehension: ${avgComprehension}/5
- Average Behavior: ${avgBehavior}/5
- Average Handwriting: ${avgHandwriting}/5
- Average Conversation: ${avgConversation}/5
- Skill Focus Met: ${skillFocusMetPercentage}% of the time

Top Weaknesses Identified:
${topWeaknesses.map(w => `- ${w.weakness} (appeared ${w.count} times)`).join('\n')}

Score Performance:
${Object.entries(scoreSummaries).map(([key, data]) => `- ${key}: ${data.average}% average (${data.count} assessments)`).join('\n')}

Create a FINAL REPORT with THREE sections (each exactly 2 paragraphs) written AS THE TEACHER:

1. STRENGTHS: Write as the teacher reflecting on the student's key strengths observed throughout the reporting period. Highlight consistent positive patterns in participation, skill development, and achievements. Speak naturally about what you've observed in class.

2. POINTS FOR IMPROVEMENT: Write as the teacher identifying recurring challenges and areas where the student needs development. Discuss patterns you've noticed in participation, skill gaps, and areas where the student has struggled. Be direct and specific about what needs work.

3. RECOMMENDATIONS: Write as the teacher providing concrete, actionable recommendations for the student and parents. Base these on your observations and make them practical and specific to this student's needs. Use "I recommend" or "I suggest" language.

IMPORTANT: Write in first person as the teacher who has been working with this student. DO NOT reference "the narratives" or "the reports" - write as if YOU are the teacher making these observations directly. Write naturally and personally, as if speaking to parents about their child. Avoid meta-references like "based on the narratives" or "according to the data."

Format your response as JSON with this structure:
{
  "strengths": "Two paragraphs synthesizing strengths from narratives...",
  "improvements": "Two paragraphs identifying improvement areas from narratives...",
  "recommendations": "Two paragraphs with actionable recommendations based on narratives..."
}`;

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a thoughtful, experienced teacher writing a comprehensive final report for a student. Write naturally and personally, as if speaking directly to the student\'s parents. Use first-person perspective ("I have observed", "I recommend", etc.) and avoid any meta-references to data or analysis.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7
        });

        const analysis = JSON.parse(completion.choices[0].message.content);

        const aiResult = {
            student,
            subject,
            reportCount,
            analysis
        };

        // Cache the result
        setCachedAI(student, subject, aiResult);

        res.json(aiResult);

    } catch (error) {
        console.error('Error generating AI analysis:', error);
        res.status(500).json({ error: 'Failed to generate AI analysis' });
    }
});

// Full Report Card endpoint - computes weekly grades for all subjects
// Get date range for a student's reports
app.get('/api/student-date-range', async (req, res) => {
    try {
        const { student } = req.query;
        if (!student) {
            return res.status(400).json({ error: 'Student is required' });
        }
        const reports = await readCSV();
        const studentReports = reports.filter(r => r['Student Name'] === student);
        if (studentReports.length === 0) {
            return res.status(404).json({ error: 'No reports found' });
        }
        const dates = studentReports.map(r => r.Date).filter(Boolean).sort();
        res.json({ min: dates[0], max: dates[dates.length - 1] });
    } catch (error) {
        console.error('Error getting date range:', error);
        res.status(500).json({ error: 'Failed to get date range' });
    }
});

app.get('/api/full-report-card', async (req, res) => {
    try {
        const { student, from, to } = req.query;
        if (!student) {
            return res.status(400).json({ error: 'Student is required' });
        }

        const reports = await readCSV();
        let studentReports = reports.filter(r => r['Student Name'] === student);

        if (studentReports.length === 0) {
            return res.status(404).json({ error: 'No reports found for this student' });
        }

        // Apply date range filter if provided
        if (from) {
            const fromDate = new Date(from);
            fromDate.setHours(0, 0, 0, 0);
            studentReports = studentReports.filter(r => new Date(r.Date) >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            studentReports = studentReports.filter(r => new Date(r.Date) <= toDate);
        }

        if (studentReports.length === 0) {
            return res.status(404).json({ error: 'No reports found for this student in the selected date range' });
        }

        // Extract metadata
        const gradeLevel = studentReports[0]['Grade Level'] || '';
        const dates = studentReports.map(r => new Date(r.Date)).sort((a, b) => a - b);
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];

        // Compute week boundaries: anchor = Monday on or before first date
        const anchorDay = firstDate.getDay(); // 0=Sun, 1=Mon, ...
        const anchor = new Date(firstDate);
        // Move back to Monday (day 1). If Sunday (0), go back 6 days
        const daysToMonday = anchorDay === 0 ? 6 : anchorDay - 1;
        anchor.setDate(anchor.getDate() - daysToMonday);
        anchor.setHours(0, 0, 0, 0);

        // Determine week number for a given date
        function getWeekNumber(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const diff = d - anchor;
            return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
        }

        // Find max week
        const maxWeek = getWeekNumber(lastDate);

        // Build week labels
        const weeks = [];
        for (let w = 1; w <= maxWeek; w++) {
            const startDate = new Date(anchor);
            startDate.setDate(startDate.getDate() + (w - 1) * 7);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            weeks.push({
                number: w,
                label: `Week ${w}`,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            });
        }

        // Group reports by subject
        const subjectMap = {};
        studentReports.forEach(report => {
            const subj = report.Subject;
            if (!subj) return;
            if (!subjectMap[subj]) subjectMap[subj] = [];
            subjectMap[subj].push(report);
        });

        // Helper: extract teacher name from "[Name] Full Name" format
        function extractTeacher(teacherStr) {
            if (!teacherStr) return '';
            const match = teacherStr.match(/\[([^\]]+)\]/);
            return match ? match[1] : teacherStr;
        }

        // Letter grade from percentage
        function getLetterGrade(pct) {
            if (pct >= 90) return 'A';
            if (pct >= 85) return 'P';
            if (pct >= 80) return 'AP';
            if (pct >= 75) return 'D';
            return 'B';
        }

        // Compute weekly grades for a subject
        function computeWeeklyGrades(subjectReports) {
            const weeklyGrades = {};
            const weekBuckets = {};

            // Bucket reports by week
            subjectReports.forEach(report => {
                const w = getWeekNumber(new Date(report.Date));
                if (!weekBuckets[w]) weekBuckets[w] = [];
                weekBuckets[w].push(report);
            });

            for (let w = 1; w <= maxWeek; w++) {
                const bucket = weekBuckets[w];
                if (!bucket || bucket.length === 0) continue;

                // Sum scores/totals per category
                const categories = {
                    bookMaterials: { score: 0, total: 0 },
                    vocabulary: { score: 0, total: 0 },
                    classVideo: { score: 0, total: 0 },
                    homework: { score: 0, total: 0 },
                    homeworkVocab: { score: 0, total: 0 },
                    weeklyTest: { score: 0, total: 0 }
                };

                bucket.forEach(report => {
                    const scores = report.Scores || {};
                    Object.keys(categories).forEach(cat => {
                        const s = scores[cat];
                        if (s && s.score !== '' && s.score !== null && s.score !== undefined &&
                            s.total !== '' && s.total !== null && s.total !== undefined) {
                            const scoreVal = parseFloat(s.score);
                            const totalVal = parseFloat(s.total);
                            if (!isNaN(scoreVal) && !isNaN(totalVal) && totalVal > 0) {
                                categories[cat].score += scoreVal;
                                categories[cat].total += totalVal;
                            }
                        }
                    });
                });

                // Calculate percentage per category
                const catPct = {};
                Object.keys(categories).forEach(cat => {
                    if (categories[cat].total > 0) {
                        catPct[cat] = (categories[cat].score / categories[cat].total) * 100;
                    }
                });

                // Group into 4 components
                const components = {};

                // In-Class = avg(bookMaterials%, vocabulary%) if both; else whichever exists
                const hasBook = catPct.bookMaterials !== undefined;
                const hasVocab = catPct.vocabulary !== undefined;
                if (hasBook && hasVocab) {
                    components.inClass = (catPct.bookMaterials + catPct.vocabulary) / 2;
                } else if (hasBook) {
                    components.inClass = catPct.bookMaterials;
                } else if (hasVocab) {
                    components.inClass = catPct.vocabulary;
                }

                // Video
                if (catPct.classVideo !== undefined) {
                    components.video = catPct.classVideo;
                }

                // Homework = avg(homework%, homeworkVocab%) if both; else whichever exists
                const hasHw = catPct.homework !== undefined;
                const hasHwVocab = catPct.homeworkVocab !== undefined;
                if (hasHw && hasHwVocab) {
                    components.homework = (catPct.homework + catPct.homeworkVocab) / 2;
                } else if (hasHw) {
                    components.homework = catPct.homework;
                } else if (hasHwVocab) {
                    components.homework = catPct.homeworkVocab;
                }

                // Weekly Test
                if (catPct.weeklyTest !== undefined) {
                    components.weeklyTest = catPct.weeklyTest;
                }

                // Weighted average with redistribution
                const baseWeights = {
                    inClass: 50,
                    video: 10,
                    homework: 20,
                    weeklyTest: 20
                };

                const presentComponents = Object.keys(components);
                if (presentComponents.length === 0) continue;

                const totalBaseWeight = presentComponents.reduce((sum, c) => sum + baseWeights[c], 0);
                let weightedSum = 0;
                presentComponents.forEach(c => {
                    const redistributedWeight = baseWeights[c] / totalBaseWeight;
                    weightedSum += components[c] * redistributedWeight;
                });

                const percentage = Math.round(weightedSum * 10) / 10;
                weeklyGrades[w] = {
                    letterGrade: getLetterGrade(percentage),
                    percentage
                };
            }

            return weeklyGrades;
        }

        // Build subjects array
        const subjects = Object.keys(subjectMap).sort().map(subjectName => {
            const subjectReports = subjectMap[subjectName];
            // Primary teacher(s): non-substitutes, sorted by report count
            const teacherCounts = {};
            subjectReports.forEach(r => {
                if (r['Is Substitute'] === 'YES') return;
                const t = extractTeacher(r['Teacher Name']);
                if (t) teacherCounts[t] = (teacherCounts[t] || 0) + 1;
            });
            // Fallback to all teachers if every report is a substitute
            if (Object.keys(teacherCounts).length === 0) {
                subjectReports.forEach(r => {
                    const t = extractTeacher(r['Teacher Name']);
                    if (t) teacherCounts[t] = (teacherCounts[t] || 0) + 1;
                });
            }
            const teacher = Object.entries(teacherCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name]) => name)
                .join(' / ');
            const weeklyGrades = computeWeeklyGrades(subjectReports);

            // Average of weekly percentages
            const weekPcts = Object.values(weeklyGrades).map(g => g.percentage);
            let average = null;
            if (weekPcts.length > 0) {
                const avgPct = Math.round((weekPcts.reduce((a, b) => a + b, 0) / weekPcts.length) * 10) / 10;
                average = { letterGrade: getLetterGrade(avgPct), percentage: avgPct };
            }

            return {
                name: subjectName,
                teacher,
                weeklyGrades,
                average
            };
        });

        // Integrated Vocabulary: sum all vocabulary scores/totals across ALL subjects per week
        const integratedVocab = {};
        for (let w = 1; w <= maxWeek; w++) {
            let totalScore = 0, totalTotal = 0;
            studentReports.forEach(report => {
                const rw = getWeekNumber(new Date(report.Date));
                if (rw !== w) return;
                const scores = report.Scores || {};
                const v = scores.vocabulary;
                if (v && v.score !== '' && v.score !== null && v.score !== undefined &&
                    v.total !== '' && v.total !== null && v.total !== undefined) {
                    const s = parseFloat(v.score);
                    const t = parseFloat(v.total);
                    if (!isNaN(s) && !isNaN(t) && t > 0) {
                        totalScore += s;
                        totalTotal += t;
                    }
                }
            });
            if (totalTotal > 0) {
                const pct = Math.round((totalScore / totalTotal) * 1000) / 10;
                integratedVocab[w] = { letterGrade: getLetterGrade(pct), percentage: pct };
            }
        }

        // Integrated vocab average
        const vocabPcts = Object.values(integratedVocab).map(g => g.percentage);
        let vocabAverage = null;
        if (vocabPcts.length > 0) {
            const avgPct = Math.round((vocabPcts.reduce((a, b) => a + b, 0) / vocabPcts.length) * 10) / 10;
            vocabAverage = { letterGrade: getLetterGrade(avgPct), percentage: avgPct };
        }

        // Format dates
        const formatDate = (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        res.json({
            student,
            gradeLevel,
            duration: {
                from: firstDate.toISOString().split('T')[0],
                to: lastDate.toISOString().split('T')[0],
                fromFormatted: formatDate(firstDate),
                toFormatted: formatDate(lastDate)
            },
            weeks,
            subjects,
            integratedVocabulary: {
                weeklyGrades: integratedVocab,
                average: vocabAverage
            }
        });

    } catch (error) {
        console.error('Error generating full report card:', error);
        res.status(500).json({ error: 'Failed to generate full report card' });
    }
});

// ── Season Detection ──

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function detectSeasons(dates) {
    if (!dates.length) return [];
    const sorted = [...new Set(dates)].filter(Boolean).sort();
    if (!sorted.length) return [];
    const seasons = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        const gap = (new Date(sorted[i]) - new Date(end)) / (1000 * 60 * 60 * 24);
        if (gap > 28) {
            seasons.push({ from: start, to: end });
            start = sorted[i];
        }
        end = sorted[i];
    }
    seasons.push({ from: start, to: end });
    return seasons.map(s => {
        const d1 = new Date(s.from), d2 = new Date(s.to);
        const m1 = MONTH_NAMES[d1.getMonth()], m2 = MONTH_NAMES[d2.getMonth()];
        const y1 = d1.getFullYear(), y2 = d2.getFullYear();
        let label;
        if (m1 === m2 && y1 === y2) label = `${m1} ${y1}`;
        else if (y1 === y2) label = `${m1}–${m2} ${y1}`;
        else label = `${m1} ${y1} – ${m2} ${y2}`;
        return { id: `${s.from}_${s.to}`, label, from: s.from, to: s.to };
    });
}

app.get('/api/student-seasons', async (req, res) => {
    try {
        const { student } = req.query;
        if (!student) return res.status(400).json({ error: 'Student is required' });
        const reports = await readCSV();
        const dates = reports
            .filter(r => r['Student Name'] === student)
            .map(r => r.Date)
            .filter(Boolean);
        res.json(detectSeasons(dates));
    } catch (error) {
        console.error('Error detecting seasons:', error);
        res.status(500).json({ error: 'Failed to detect seasons' });
    }
});

// Academic Enabler API endpoints
app.get('/api/academic-enabler', (req, res) => {
    const { student, season } = req.query;
    const data = readAE();
    let filtered = data;
    if (student) filtered = filtered.filter(e => e.student === student);
    if (season) filtered = filtered.filter(e => e.season === season);
    res.json(filtered);
});

app.get('/api/academic-enabler/:id', (req, res) => {
    const data = readAE();
    const entry = data.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
});

app.post('/api/academic-enabler', (req, res) => {
    const data = readAE();
    const entry = {
        id: require('crypto').randomUUID(),
        ...req.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    data.push(entry);
    writeAE(data);
    res.status(201).json(entry);
});

app.put('/api/academic-enabler/:id', (req, res) => {
    const data = readAE();
    const idx = data.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    data[idx] = { ...data[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeAE(data);
    res.json(data[idx]);
});

app.delete('/api/academic-enabler/:id', (req, res) => {
    const data = readAE();
    const idx = data.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    data.splice(idx, 1);
    writeAE(data);
    res.json({ success: true });
});

// Reading Assessment API endpoints
app.get('/api/reading-assessment', (req, res) => {
    const { student, season } = req.query;
    const data = readRA();
    let filtered = data;
    if (student) filtered = filtered.filter(e => e.student === student);
    if (season) filtered = filtered.filter(e => e.season === season);
    res.json(filtered);
});

app.get('/api/reading-assessment/:id', (req, res) => {
    const data = readRA();
    const entry = data.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
});

app.post('/api/reading-assessment', (req, res) => {
    const data = readRA();
    const entry = {
        id: require('crypto').randomUUID(),
        ...req.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    data.push(entry);
    writeRA(data);
    res.status(201).json(entry);
});

app.put('/api/reading-assessment/:id', (req, res) => {
    const data = readRA();
    const idx = data.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    data[idx] = { ...data[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeRA(data);
    res.json(data[idx]);
});

app.delete('/api/reading-assessment/:id', (req, res) => {
    const data = readRA();
    const idx = data.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    data.splice(idx, 1);
    writeRA(data);
    res.json({ success: true });
});

// ── CSV Data Manager Auth ──

const DM_PASSWORD = 'wecaninican';
const DM_TOKEN = require('crypto').randomUUID();

app.post('/api/dm-auth', (req, res) => {
    const { password } = req.body;
    if (password === DM_PASSWORD) {
        res.json({ success: true, token: DM_TOKEN });
    } else {
        res.status(401).json({ success: false, error: 'Incorrect password' });
    }
});

function requireDMAuth(req, res, next) {
    const token = req.headers['x-dm-token'];
    if (token === DM_TOKEN) return next();
    res.status(401).json({ error: 'Unauthorized — Data Manager login required' });
}

// ── CSV Data Manager API Endpoints ──

// GET /api/csv-stats — total rows, duplicate count, subject/student lists
app.get('/api/csv-stats', requireDMAuth, (req, res) => {
    try {
        const rows = readCSVRaw();

        // Count duplicates (same Date + Student Name + Teacher Name + Subject)
        const seen = new Map();
        let dupCount = 0;
        rows.forEach(r => {
            const key = `${r.Date}|${r['Student Name']}|${r['Teacher Name']}|${r.Subject}`;
            seen.set(key, (seen.get(key) || 0) + 1);
        });
        seen.forEach(count => { if (count > 1) dupCount += count - 1; });

        // Subject list with counts
        const subjectCounts = {};
        rows.forEach(r => {
            const s = r.Subject || '(empty)';
            subjectCounts[s] = (subjectCounts[s] || 0) + 1;
        });
        const subjects = Object.entries(subjectCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));

        // Student list with counts
        const studentCounts = {};
        rows.forEach(r => {
            const s = r['Student Name'] || '(empty)';
            studentCounts[s] = (studentCounts[s] || 0) + 1;
        });
        const students = Object.entries(studentCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            totalRows: rows.length,
            duplicateCount: dupCount,
            subjectCount: subjects.length,
            studentCount: students.length,
            subjects,
            students
        });
    } catch (error) {
        console.error('Error getting CSV stats:', error);
        res.status(500).json({ error: 'Failed to get CSV stats' });
    }
});

// GET /api/csv-data — paginated browse with filters
app.get('/api/csv-data', requireDMAuth, (req, res) => {
    try {
        const { page = 1, limit = 50, search, student, subject, dateFrom, dateTo } = req.query;
        let rows = readCSVRaw();

        // Add _index to each row (position in the CSV file)
        rows = rows.map((r, i) => ({ ...r, _index: i }));

        // Apply filters
        if (search) {
            const s = search.toLowerCase();
            rows = rows.filter(r =>
                Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(s))
            );
        }
        if (student) {
            rows = rows.filter(r => r['Student Name'] === student);
        }
        if (subject) {
            rows = rows.filter(r => r.Subject === subject);
        }
        if (dateFrom) {
            rows = rows.filter(r => r.Date >= dateFrom);
        }
        if (dateTo) {
            rows = rows.filter(r => r.Date <= dateTo);
        }

        const total = rows.length;
        const pageNum = Math.max(1, parseInt(page));
        const lim = Math.max(1, Math.min(200, parseInt(limit)));
        const totalPages = Math.ceil(total / lim) || 1;
        const start = (pageNum - 1) * lim;
        const paged = rows.slice(start, start + lim);

        res.json({ rows: paged, total, page: pageNum, totalPages, limit: lim });
    } catch (error) {
        console.error('Error getting CSV data:', error);
        res.status(500).json({ error: 'Failed to get CSV data' });
    }
});

// PUT /api/csv-row/:index — edit single row fields by index
app.put('/api/csv-row/:index', requireDMAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const updates = req.body;

        if (isNaN(index) || index < 0) {
            return res.status(400).json({ error: 'Invalid row index' });
        }

        const result = await safeCSVWrite('edit-row', (rows) => {
            if (index >= rows.length) {
                throw new Error('Row index out of range');
            }
            Object.entries(updates).forEach(([key, value]) => {
                if (key !== '_index' && rows[index].hasOwnProperty(key)) {
                    rows[index][key] = value;
                }
            });
            return { rows, updated: true };
        });

        res.json({ success: true, message: 'Row updated' });
    } catch (error) {
        console.error('Error editing CSV row:', error);
        res.status(500).json({ error: error.message || 'Failed to edit row' });
    }
});

// PATCH /api/csv-rows — bulk edit: set one field to a value across multiple rows
app.patch('/api/csv-rows', requireDMAuth, async (req, res) => {
    try {
        const { indices, field, value } = req.body;
        if (!Array.isArray(indices) || indices.length === 0) {
            return res.status(400).json({ error: 'indices array is required' });
        }
        if (typeof field !== 'string' || !field) {
            return res.status(400).json({ error: 'field is required' });
        }

        const result = await safeCSVWrite('bulk-edit', (rows) => {
            // Validate field exists on at least the first row
            if (rows.length > 0 && !rows[0].hasOwnProperty(field)) {
                throw new Error('Field "' + field + '" does not exist');
            }
            let updated = 0;
            const indexSet = new Set(indices.map(Number));
            rows.forEach((row, i) => {
                if (indexSet.has(i)) {
                    row[field] = value;
                    updated++;
                }
            });
            return { rows, updated };
        });

        res.json({ success: true, updated: result.updated });
    } catch (error) {
        console.error('Error bulk editing CSV rows:', error);
        res.status(500).json({ error: error.message || 'Failed to bulk edit rows' });
    }
});

// DELETE /api/csv-rows — delete rows by indices array
app.delete('/api/csv-rows', requireDMAuth, async (req, res) => {
    try {
        const { indices } = req.body;
        if (!Array.isArray(indices) || indices.length === 0) {
            return res.status(400).json({ error: 'indices array is required' });
        }

        const indexSet = new Set(indices.map(Number));

        const result = await safeCSVWrite('delete-rows', (rows) => {
            const newRows = rows.filter((_, i) => !indexSet.has(i));
            const deleted = rows.length - newRows.length;
            return { rows: newRows, deleted };
        });

        res.json({ success: true, deleted: result.deleted });
    } catch (error) {
        console.error('Error deleting CSV rows:', error);
        res.status(500).json({ error: error.message || 'Failed to delete rows' });
    }
});

// POST /api/csv-merge-subject — rename subject in all rows
app.post('/api/csv-merge-subject', requireDMAuth, async (req, res) => {
    try {
        const { from, to } = req.body;
        if (!from || !to) {
            return res.status(400).json({ error: 'from and to are required' });
        }

        const result = await safeCSVWrite('merge-subject', (rows) => {
            let count = 0;
            rows.forEach(row => {
                if (row.Subject === from) {
                    row.Subject = to;
                    count++;
                }
            });
            return { rows, merged: count };
        });

        res.json({ success: true, merged: result.merged });
    } catch (error) {
        console.error('Error merging subjects:', error);
        res.status(500).json({ error: error.message || 'Failed to merge subjects' });
    }
});

// GET /api/csv-duplicates — find duplicate groups
app.get('/api/csv-duplicates', requireDMAuth, (req, res) => {
    try {
        const rows = readCSVRaw();
        const groups = new Map();

        rows.forEach((r, i) => {
            const key = `${r.Date}|${r['Student Name']}|${r['Teacher Name']}|${r.Subject}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ ...r, _index: i });
        });

        // Only keep groups with duplicates
        const duplicateGroups = [];
        groups.forEach((group, key) => {
            if (group.length > 1) {
                const [date, student, teacher, subject] = key.split('|');
                duplicateGroups.push({ date, student, teacher, subject, rows: group });
            }
        });

        // Sort by date descending
        duplicateGroups.sort((a, b) => b.date.localeCompare(a.date));

        const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.rows.length - 1, 0);

        res.json({ groups: duplicateGroups, totalDuplicates, groupCount: duplicateGroups.length });
    } catch (error) {
        console.error('Error finding duplicates:', error);
        res.status(500).json({ error: 'Failed to find duplicates' });
    }
});

// DELETE /api/csv-duplicates — auto-remove duplicates, keeping last occurrence (most recent/corrected)
app.delete('/api/csv-duplicates', requireDMAuth, async (req, res) => {
    try {
        const result = await safeCSVWrite('dedup', (rows) => {
            const lastSeen = new Map();
            rows.forEach((r, i) => {
                const key = `${r.Date}|${r['Student Name']}|${r['Teacher Name']}|${r.Subject}`;
                lastSeen.set(key, i);
            });
            const keepSet = new Set(lastSeen.values());
            const newRows = rows.filter((_, i) => keepSet.has(i));
            const removed = rows.length - newRows.length;
            return { rows: newRows, removed };
        });

        res.json({ success: true, removed: result.removed });
    } catch (error) {
        console.error('Error removing duplicates:', error);
        res.status(500).json({ error: error.message || 'Failed to remove duplicates' });
    }
});

// GET /api/csv-backups — list backup files
app.get('/api/csv-backups', requireDMAuth, (req, res) => {
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('reports_') && f.endsWith('.csv'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    filename: f,
                    size: stat.size,
                    sizeFormatted: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
                    date: stat.mtime.toISOString(),
                    dateFormatted: stat.mtime.toLocaleString()
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ backups: files, count: files.length });
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// POST /api/csv-backups — create manual backup
app.post('/api/csv-backups', requireDMAuth, (req, res) => {
    try {
        const filename = createBackup('manual');
        res.json({ success: true, filename });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// POST /api/csv-backups/:filename/restore — restore from backup
app.post('/api/csv-backups/:filename/restore', requireDMAuth, (req, res) => {
    try {
        const filename = req.params.filename;
        // Path traversal prevention
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const backupPath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }

        // Backup current before restoring
        createBackup('pre-restore');
        fs.copyFileSync(backupPath, CSV_PATH);
        // Invalidate column cache
        CSV_COLUMNS = null;

        res.json({ success: true, message: `Restored from ${filename}` });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// Serve data manager page
app.get('/data-manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'data-manager.html'));
});

// Serve academic enabler page
app.get('/academic-enabler', (req, res) => {
    res.sendFile(path.join(__dirname, 'academic-enabler.html'));
});

// Serve report card page
app.get('/report-card', (req, res) => {
    res.sendFile(path.join(__dirname, 'report-card.html'));
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🎓 Report Card Data Generator running on http://localhost:${PORT}`);
});
