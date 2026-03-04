const fs = require('fs');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { Client } = require('@notionhq/client');
require('dotenv').config();

const app = express();
const port = 1441;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const TEACHERS_DATABASE_ID = process.env.NOTION_TEACHERS_DATABASE_ID;
const SKILLS_DATABASE_ID = process.env.NOTION_SKILLS_DATABASE_ID;
const FOCUSSKILL_DATABASE_ID = process.env.NOTION_FOCUSSKILL_DATABASE_ID;

// Endpoint to fetch ALL students from Notion (with pagination)
app.get('/api/students', async (req, res) => {
    try {
        console.log('Attempting to fetch ALL students from database ID:', DATABASE_ID);

        let allStudents = [];
        let hasMore = true;
        let nextCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: DATABASE_ID,
                filter: {
                    property: 'Status',
                    select: {
                        equals: 'Active'
                    }
                },
                sorts: [
                    {
                        property: 'Full Name',
                        direction: 'ascending',
                    },
                ],
                start_cursor: nextCursor,
                page_size: 100
            });

            console.log(`Fetched ${response.results.length} students in this batch`);

            const students = response.results.map(page => {
                const properties = page.properties;

                let studentId = 'N/A';
                const possibleIdFields = ['Student ID', 'student id', 'ID', 'StudentID', 'student_id'];
                let studentIdProp = null;

                for (const fieldName of possibleIdFields) {
                    if (properties[fieldName]) {
                        studentIdProp = properties[fieldName];
                        break;
                    }
                }

                if (studentIdProp) {
                    if (studentIdProp.unique_id) {
                        const prefix = studentIdProp.unique_id.prefix || '';
                        const number = studentIdProp.unique_id.number || '';
                        studentId = prefix + '-' + number;
                    } else if (studentIdProp.rich_text && studentIdProp.rich_text.length > 0) {
                        studentId = studentIdProp.rich_text[0].plain_text;
                    } else if (studentIdProp.title && studentIdProp.title.length > 0) {
                        studentId = studentIdProp.title[0].plain_text;
                    } else if (studentIdProp.number !== null && studentIdProp.number !== undefined) {
                        studentId = studentIdProp.number.toString();
                    } else if (studentIdProp.select) {
                        studentId = studentIdProp.select.name;
                    } else if (studentIdProp.formula && studentIdProp.formula.string) {
                        studentId = studentIdProp.formula.string;
                    }
                }

                // Helper function to get number value
                const getNumber = (prop) => {
                    if (prop?.number !== null && prop?.number !== undefined) {
                        return prop.number;
                    }
                    return null;
                };

                // Helper function to get text value
                const getText = (prop) => {
                    if (prop?.rich_text?.length > 0) {
                        return prop.rich_text[0].plain_text;
                    }
                    if (prop?.title?.length > 0) {
                        return prop.title[0].plain_text;
                    }
                    if (prop?.select?.name) {
                        return prop.select.name;
                    }
                    return null;
                };

                // Debug logging for Interview Score
                const interviewScoreProp = properties['Interview Score'];
                console.log('Interview Score property:', JSON.stringify(interviewScoreProp, null, 2));

                return {
                    id: page.id,
                    fullName: properties['Full Name']?.title?.[0]?.plain_text || 'Unknown',
                    studentId: studentId,
                    wpmInitial: getNumber(properties['WPM Initial']),
                    gbwtInitial: getText(properties['GBWT Initial']),
                    readingLevelInitial: getText(properties['Reading Level Initial']),
                    interviewScore: getText(properties['Interview Score']),
                    gradeLevel: getText(properties['Grade']),
                    gender: getText(properties['Gender'])
                };
            });

            allStudents = allStudents.concat(students);

            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        console.log(`Total students fetched: ${allStudents.length}`);
        if (allStudents.length > 0) {
            console.log('Sample student:', allStudents[0]);
        }

        res.json(allStudents);
    } catch (error) {
        console.error('Error fetching students from Notion:', error);
        let errorMessage = 'Failed to fetch students from Notion';
        if (error.code === 'object_not_found') {
            errorMessage = 'Database not found or not shared with integration. Please share the database with your Notion integration.';
        } else if (error.code === 'unauthorized') {
            errorMessage = 'Invalid API token. Please check your Notion integration token.';
        }
        res.status(500).json({
            error: errorMessage,
            details: error.message
        });
    }
});

// Endpoint to fetch ALL teachers from Notion (with pagination)
app.get('/api/teachers', async (req, res) => {
    try {
        console.log('Attempting to fetch ALL teachers from database ID:', TEACHERS_DATABASE_ID);

        let allTeachers = [];
        let hasMore = true;
        let nextCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: TEACHERS_DATABASE_ID,
                filter: {
                    property: 'Status',
                    select: {
                        equals: 'Active'
                    }
                },
                sorts: [
                    {
                        property: 'Full Name',
                        direction: 'ascending',
                    },
                ],
                start_cursor: nextCursor,
                page_size: 100
            });

            console.log(`Fetched ${response.results.length} teachers in this batch`);

            const teachers = response.results.map(page => {
                const properties = page.properties;

                let teacherId = 'N/A';
                const possibleIdFields = ['ID', 'Teacher ID', 'teacher id', 'TeacherID', 'teacher_id', 'ID Number'];
                let teacherIdProp = null;

                for (const fieldName of possibleIdFields) {
                    if (properties[fieldName]) {
                        teacherIdProp = properties[fieldName];
                        break;
                    }
                }

                if (teacherIdProp) {
                    if (teacherIdProp.unique_id) {
                        const prefix = teacherIdProp.unique_id.prefix || '';
                        const number = teacherIdProp.unique_id.number || '';
                        teacherId = prefix + '-' + number;
                    } else if (teacherIdProp.rich_text && teacherIdProp.rich_text.length > 0) {
                        teacherId = teacherIdProp.rich_text[0].plain_text;
                    } else if (teacherIdProp.title && teacherIdProp.title.length > 0) {
                        teacherId = teacherIdProp.title[0].plain_text;
                    } else if (teacherIdProp.number !== null && teacherIdProp.number !== undefined) {
                        teacherId = teacherIdProp.number.toString();
                    } else if (teacherIdProp.select) {
                        teacherId = teacherIdProp.select.name;
                    } else if (teacherIdProp.formula && teacherIdProp.formula.string) {
                        teacherId = teacherIdProp.formula.string;
                    }
                }

                return {
                    id: page.id,
                    fullName: properties['Full Name']?.title?.[0]?.plain_text || 'Unknown',
                    teacherId: teacherId,
                };
            });

            allTeachers = allTeachers.concat(teachers);

            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        console.log(`Total teachers fetched: ${allTeachers.length}`);
        if (allTeachers.length > 0) {
            console.log('Sample teacher:', allTeachers[0]);
        }

        res.json(allTeachers);
    } catch (error) {
        console.error('Error fetching teachers from Notion:', error);
        let errorMessage = 'Failed to fetch teachers from Notion';
        if (error.code === 'object_not_found') {
            errorMessage = 'Teacher database not found or not shared with integration. Please share the database with your Notion integration.';
        } else if (error.code === 'unauthorized') {
            errorMessage = 'Invalid API token. Please check your Notion integration token.';
        }
        res.status(500).json({
            error: errorMessage,
            details: error.message
        });
    }
});

app.get('/api/skills', async (req, res) => {
    try {
        console.log('Attempting to fetch skills from database ID:', SKILLS_DATABASE_ID);
        let allSkills = [];
        let hasMore = true;
        let nextCursor = undefined;

        const getPlainText = (prop) => {
            if (prop?.rich_text?.length > 0) {
                return prop.rich_text[0].plain_text;
            }
            if (prop?.title?.length > 0) {
                return prop.title[0].plain_text;
            }
            return '';
        };

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: SKILLS_DATABASE_ID,
                start_cursor: nextCursor,
                page_size: 100,
            });

            const skills = response.results.map(page => {
                const properties = page.properties;

                return {
                    subject: getPlainText(properties.SUBJECT),
                    skill: getPlainText(properties.SKILL),
                    microskills: [
                        getPlainText(properties['MICROSKILLS 1']),
                        getPlainText(properties['MICROSKILLS 2']),
                        getPlainText(properties['MICROSKILLS 3']),
                        getPlainText(properties['MICROSKILLS 4']),
                        getPlainText(properties['MICROSKILLS 5']),
                    ].filter(ms => ms),
                };
            });

            allSkills = allSkills.concat(skills);
            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        const skillsBySubject = allSkills.reduce((acc, item) => {
            if (!acc[item.subject]) {
                acc[item.subject] = [];
            }
            acc[item.subject].push({
                skill: item.skill,
                microskills: item.microskills,
            });
            return acc;
        }, {});

        res.json(skillsBySubject);
    } catch (error) {
        console.error('Error fetching skills from Notion:', error);
        res.status(500).json({ error: 'Failed to fetch skills from Notion' });
    }
});

// Endpoint to fetch FocusSkill data from Notion
app.get('/api/focusskills', async (req, res) => {
    try {
        console.log('Attempting to fetch focus skills from database ID:', FOCUSSKILL_DATABASE_ID);
        let allFocusSkills = [];
        let hasMore = true;
        let nextCursor = undefined;

        const getPlainText = (prop) => {
            if (prop?.rich_text?.length > 0) {
                return prop.rich_text[0].plain_text;
            }
            if (prop?.title?.length > 0) {
                return prop.title[0].plain_text;
            }
            return '';
        };

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: FOCUSSKILL_DATABASE_ID,
                sorts: [
                    {
                        property: 'FocusSkill',
                        direction: 'ascending',
                    },
                ],
                start_cursor: nextCursor,
                page_size: 100,
            });

            console.log(`Fetched ${response.results.length} focus skills in this batch`);

            const focusSkills = response.results.map(page => {
                const properties = page.properties;
                return getPlainText(properties.FocusSkill);
            }).filter(skill => skill); // Remove empty values

            allFocusSkills = allFocusSkills.concat(focusSkills);
            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        console.log(`Total focus skills fetched: ${allFocusSkills.length}`);
        res.json(allFocusSkills);
    } catch (error) {
        console.error('Error fetching focus skills from Notion:', error);
        let errorMessage = 'Failed to fetch focus skills from Notion';
        if (error.code === 'object_not_found') {
            errorMessage = 'FocusSkill database not found or not shared with integration. Please share the database with your Notion integration.';
        } else if (error.code === 'unauthorized') {
            errorMessage = 'Invalid API token. Please check your Notion integration token.';
        }
        res.status(500).json({
            error: errorMessage,
            details: error.message
        });
    }
});

// ==========================================
// DRAFT SAVING ENDPOINTS (Server-side)
// ==========================================
const DRAFTS_FILE = 'drafts.json';

// Helper function to read drafts file
function readDrafts() {
    try {
        if (fs.existsSync(DRAFTS_FILE)) {
            const data = fs.readFileSync(DRAFTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading drafts:', e);
    }
    return {};
}

// Helper function to write drafts file
function writeDrafts(drafts) {
    try {
        fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing drafts:', e);
        return false;
    }
}

// Save draft for a teacher+student combination
app.post('/api/draft/save', (req, res) => {
    try {
        const { teacherName, studentName, draftData } = req.body;

        if (!teacherName || !studentName) {
            return res.status(400).json({ error: 'Teacher and student name required' });
        }

        // Use teacher+student as the unique key
        const draftKey = `${teacherName}|||${studentName}`;

        const drafts = readDrafts();
        drafts[draftKey] = {
            timestamp: Date.now(),
            teacherName,
            studentName,
            data: draftData
        };

        // Clean up old drafts (older than 48 hours)
        const cutoff = Date.now() - (48 * 60 * 60 * 1000);
        Object.keys(drafts).forEach(key => {
            if (drafts[key].timestamp < cutoff) {
                delete drafts[key];
            }
        });

        if (writeDrafts(drafts)) {
            res.json({ success: true, message: 'Draft saved' });
        } else {
            res.status(500).json({ error: 'Failed to save draft' });
        }
    } catch (error) {
        console.error('Error saving draft:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Load draft for a teacher+student combination
app.get('/api/draft/load/:teacherName/:studentName', (req, res) => {
    try {
        const teacherName = decodeURIComponent(req.params.teacherName);
        const studentName = decodeURIComponent(req.params.studentName);
        const draftKey = `${teacherName}|||${studentName}`;
        const drafts = readDrafts();

        if (drafts[draftKey]) {
            // Check if draft is not too old (48 hours)
            const ageInHours = (Date.now() - drafts[draftKey].timestamp) / (1000 * 60 * 60);
            if (ageInHours <= 48) {
                res.json({
                    success: true,
                    draft: drafts[draftKey].data,
                    savedAt: drafts[draftKey].timestamp
                });
            } else {
                // Draft too old, delete it
                delete drafts[draftKey];
                writeDrafts(drafts);
                res.json({ success: false, message: 'Draft expired' });
            }
        } else {
            res.json({ success: false, message: 'No draft found' });
        }
    } catch (error) {
        console.error('Error loading draft:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all drafts for a specific teacher (to show pending work)
app.get('/api/drafts/teacher/:teacherName', (req, res) => {
    try {
        const teacherName = decodeURIComponent(req.params.teacherName);
        const drafts = readDrafts();
        const cutoff = Date.now() - (48 * 60 * 60 * 1000);

        const teacherDrafts = Object.entries(drafts)
            .filter(([key, value]) => value.teacherName === teacherName && value.timestamp > cutoff)
            .map(([key, value]) => ({
                studentName: value.studentName,
                savedAt: value.timestamp,
                savedAtFormatted: new Date(value.timestamp).toLocaleString(),
                ageHours: ((Date.now() - value.timestamp) / (1000 * 60 * 60)).toFixed(1)
            }));

        res.json({ success: true, drafts: teacherDrafts });
    } catch (error) {
        console.error('Error getting teacher drafts:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete draft for a teacher+student combination
app.delete('/api/draft/delete/:teacherName/:studentName', (req, res) => {
    try {
        const teacherName = decodeURIComponent(req.params.teacherName);
        const studentName = decodeURIComponent(req.params.studentName);
        const draftKey = `${teacherName}|||${studentName}`;
        const drafts = readDrafts();

        if (drafts[draftKey]) {
            delete drafts[draftKey];
            writeDrafts(drafts);
        }

        res.json({ success: true, message: 'Draft deleted' });
    } catch (error) {
        console.error('Error deleting draft:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// List all drafts (for admin/debugging)
app.get('/api/drafts', (req, res) => {
    try {
        const drafts = readDrafts();
        const summary = Object.keys(drafts).map(key => ({
            teacher: drafts[key].teacherName,
            student: drafts[key].studentName,
            savedAt: new Date(drafts[key].timestamp).toLocaleString(),
            ageHours: ((Date.now() - drafts[key].timestamp) / (1000 * 60 * 60)).toFixed(1)
        }));
        res.json({ drafts: summary });
    } catch (error) {
        console.error('Error listing drafts:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── CSV Cache System for Report History ──
const CSV_FILE_PATH = './reports.csv';
let csvCache = null;
let csvMtime = null;


const CSV_HEADERS = [
    'Date', 'Day of Week', 'Student Name', 'Student ID', 'Grade Level', 'WPM Initial', 'GBWT Initial',
    'Reading Level Initial', 'Interview Score', 'Teacher Name', 'Teacher ID', 'Subject', 'Is Substitute',
    'Skill Focus', 'SF Met', 'Current Lesson', 'Materials', 'Homework', 'Next Lesson', 'Activities Finished',
    'Activities Not Finished', 'Student Gender', 'Attention', 'Retention',
    'Comprehension', 'Behavior', 'Handwriting', 'Conversation',
    'Skills', 'Scores', 'Narrative'
];

function parseCSVLine(line) {
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

function splitCSVLines(content) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            currentLine += char;
        } else if (char === '\n' && !inQuotes) {
            if (currentLine.trim()) lines.push(currentLine);
            currentLine = '';
        } else if (char === '\r') {
            // skip
        } else {
            currentLine += char;
        }
    }
    if (currentLine.trim()) lines.push(currentLine);
    return lines;
}

function loadCSV() {
    if (!fs.existsSync(CSV_FILE_PATH)) return [];
    const stat = fs.statSync(CSV_FILE_PATH);
    if (csvCache && csvMtime && stat.mtimeMs === csvMtime) return csvCache;

    const content = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    const lines = splitCSVLines(content);
    if (lines.length < 2) { csvCache = []; csvMtime = stat.mtimeMs; return []; }

    const headerFields = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headerFields.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
        row._rowIndex = i;
        rows.push(row);
    }
    csvCache = rows;
    csvMtime = stat.mtimeMs;
    return rows;
}

function invalidateCSVCache() {
    csvCache = null;
    csvMtime = null;
}

// Unique student names from CSV (all who have reports, active or not)
// Optional query param: ?teacher=Name — filters to students who have records with that teacher
app.get('/api/reports/students', (req, res) => {
    try {
        let rows = loadCSV();
        const { teacher } = req.query;
        if (teacher) {
            const t = teacher.toLowerCase();
            rows = rows.filter(r => (r['Teacher Name'] || '').toLowerCase() === t);
        }
        const names = [...new Set(rows.map(r => r['Student Name']).filter(Boolean))];
        names.sort((a, b) => a.localeCompare(b));
        res.json(names);
    } catch (error) {
        console.error('Error fetching report students:', error);
        res.status(500).json({ error: 'Failed to fetch student names' });
    }
});

// Unique teacher names from CSV (all who have reports, active or not)
// Optional query param: ?student=Name — filters to teachers who have records with that student
app.get('/api/reports/teachers', (req, res) => {
    try {
        let rows = loadCSV();
        const { student } = req.query;
        if (student) {
            const s = student.toLowerCase();
            rows = rows.filter(r => (r['Student Name'] || '').toLowerCase() === s);
        }
        const names = [...new Set(rows.map(r => r['Teacher Name']).filter(Boolean))];
        names.sort((a, b) => a.localeCompare(b));
        res.json(names);
    } catch (error) {
        console.error('Error fetching report teachers:', error);
        res.status(500).json({ error: 'Failed to fetch teacher names' });
    }
});

// Search reports endpoint
app.get('/api/reports/search', (req, res) => {
    try {
        const { student, teacher, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
        let rows = loadCSV();

        if (student) {
            const s = student.toLowerCase();
            rows = rows.filter(r => (r['Student Name'] || '').toLowerCase().includes(s));
        }
        if (teacher) {
            const t = teacher.toLowerCase();
            rows = rows.filter(r => (r['Teacher Name'] || '').toLowerCase().includes(t));
        }
        if (dateFrom) {
            rows = rows.filter(r => r['Date'] >= dateFrom);
        }
        if (dateTo) {
            rows = rows.filter(r => r['Date'] <= dateTo);
        }

        // Sort newest first
        rows.sort((a, b) => (b['Date'] || '').localeCompare(a['Date'] || ''));

        const total = rows.length;
        const pageNum = Math.max(1, parseInt(page));
        const lim = Math.max(1, Math.min(100, parseInt(limit)));
        const totalPages = Math.ceil(total / lim) || 1;
        const start = (pageNum - 1) * lim;
        const paged = rows.slice(start, start + lim);

        const results = paged.map(r => ({
            rowIndex: r._rowIndex,
            date: r['Date'] || '',
            dayOfWeek: r['Day of Week'] || '',
            studentName: r['Student Name'] || '',
            teacherName: r['Teacher Name'] || '',
            subject: r['Subject'] || '',
            skillFocus: r['Skill Focus'] || '',
            sfMet: r['SF Met'] || ''
        }));

        res.json({ results, total, page: pageNum, totalPages });
    } catch (error) {
        console.error('Error searching reports:', error);
        res.status(500).json({ error: 'Failed to search reports' });
    }
});

// Get single report by row index
app.get('/api/reports/:rowIndex', (req, res) => {
    try {
        const rowIndex = parseInt(req.params.rowIndex);
        const rows = loadCSV();
        const row = rows.find(r => r._rowIndex === rowIndex);
        if (!row) return res.status(404).json({ error: 'Report not found' });

        // Parse JSON fields
        let skills = {};
        let scores = {};
        let sfMet = row['SF Met'] || 'NO';
        try { skills = JSON.parse(row['Skills'] || '{}'); } catch (e) { /* ignore */ }
        try { scores = JSON.parse(row['Scores'] || '{}'); } catch (e) { /* ignore */ }

        // Try parsing SF Met as JSON (per-skill tracking), fall back to string
        let sfMetParsed = sfMet;
        try {
            const parsed = JSON.parse(sfMet);
            if (typeof parsed === 'object' && parsed !== null) sfMetParsed = parsed;
        } catch (e) { /* keep as string */ }

        res.json({
            date: row['Date'] || '',
            dayOfWeek: row['Day of Week'] || '',
            studentName: row['Student Name'] || '',
            studentId: row['Student ID'] || 'N/A',
            gradeLevel: row['Grade Level'] || 'TBD',
            wpmInitial: row['WPM Initial'] || 'TBD',
            gbwtInitial: row['GBWT Initial'] || 'TBD',
            readingLevelInitial: row['Reading Level Initial'] || 'TBD',
            interviewScore: row['Interview Score'] || 'TBD',
            teacherName: row['Teacher Name'] || '',
            teacherId: row['Teacher ID'] || 'N/A',
            subject: row['Subject'] || '',
            isSubstitute: row['Is Substitute'] || 'NO',
            skillFocus: row['Skill Focus'] || '',
            sfMet: sfMetParsed,
            currentLesson: row['Current Lesson'] || '',
            materials: row['Materials'] || '',
            homework: row['Homework'] || '',
            nextLesson: row['Next Lesson'] || '',
            activitiesFinished: row['Activities Finished'] || '',
            activitiesNotFinished: row['Activities Not Finished'] || '',
            studentGender: row['Student Gender'] || '',
            attention: row['Attention'] || '0',
            retention: row['Retention'] || '0',
            comprehension: row['Comprehension'] || '0',
            behavior: row['Behavior'] || '0',
            handwriting: row['Handwriting'] || '0',
            conversation: row['Conversation'] || '0',
            skills,
            scores,
            narrative: row['Narrative'] || ''
        });
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

app.post('/api/generate-narrative', async (req, res) => {
    try {
        const {
            studentName,
            ratings,
            subject,
            skills,
            skillFocus: skillFocusLegacy,
            skillFocusArray,
            skillFocusMet,
            currentLesson,
            materials,
            homework,
            nextLesson,
            activitiesFinished,
            activitiesNotFinished,
            studentGender,
            scores,
            date,
            dayOfWeek
        } = req.body;

        // Handle both new array format and legacy string format for skillFocus
        let skillFocusDisplay = '';
        if (skillFocusArray && Array.isArray(skillFocusArray) && skillFocusArray.length > 0) {
            skillFocusDisplay = skillFocusArray.join(', ');
        } else if (skillFocusLegacy) {
            skillFocusDisplay = skillFocusLegacy;
        }

        // Safety check: ensure text fields are strings (prevent [object Object])
        const safeString = (val) => {
            if (typeof val === 'string') return val;
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') {
                // Try to extract a meaningful string from objects
                return val.name || val.title || val.value || val.text || '';
            }
            return String(val);
        };
        const safeMaterials = safeString(materials);
        const safeHomework = safeString(homework);
        const safeNextLesson = safeString(nextLesson);
        const safeCurrentLesson = safeString(currentLesson);

        const skillsSummary = Object.entries(skills).map(([skill, data]) => {
            if (data.score === 'NA') {
                return `${skill}: NA`;
            }
            const weaknesses = data.weaknesses.length > 0 ? `Weaknesses: ${data.weaknesses.join(', ')}` : 'No weaknesses noted';
            return `${skill}: ${data.score}/5 (${weaknesses})`;
        }).join('\n- ');

        // Format scores for narrative
        const scoresList = [];
        const scoreLabels = {
            bookMaterials: 'Book/Materials',
            vocabulary: 'Vocab Quiz',
            classVideo: 'Class Video',
            homework: 'Homework',
            homeworkVocab: 'HW Vocab/Journal',
            weeklyTest: 'Weekly Test'
        };

        for (const [key, label] of Object.entries(scoreLabels)) {
            if (scores[key].score !== '' || scores[key].total !== '') {
                const score = scores[key].score !== '' ? scores[key].score : '-';
                const total = scores[key].total !== '' ? scores[key].total : '-';
                scoresList.push(`${label}: ${score}/${total}`);
            }
        }

        const scoresText = scoresList.length > 0 ? `\nScores:\n- ${scoresList.join('\n- ')}` : '';

        // Parse skillFocusMet - can be JSON object, boolean, or string
        let sfMetStatus = {};
        let sfMetSummary = '';
        let allMet = true;
        let allNotMet = true;

        if (typeof skillFocusMet === 'object' && skillFocusMet !== null && !Array.isArray(skillFocusMet)) {
            // JSON object format: {"Reading": true, "Grammar": false}
            sfMetStatus = skillFocusMet;
            const metSkills = [];
            const notMetSkills = [];
            for (const [skill, met] of Object.entries(skillFocusMet)) {
                if (met === true) {
                    metSkills.push(skill);
                    allNotMet = false;
                } else {
                    notMetSkills.push(skill);
                    allMet = false;
                }
            }
            if (metSkills.length > 0 && notMetSkills.length > 0) {
                sfMetSummary = `Skills MET: ${metSkills.join(', ')}. Skills NOT MET: ${notMetSkills.join(', ')}.`;
            } else if (metSkills.length > 0) {
                sfMetSummary = `All skills MET: ${metSkills.join(', ')}.`;
            } else if (notMetSkills.length > 0) {
                sfMetSummary = `Skills NOT MET: ${notMetSkills.join(', ')}.`;
            }
        } else if (typeof skillFocusMet === 'boolean') {
            // Legacy boolean format
            allMet = skillFocusMet;
            allNotMet = !skillFocusMet;
            sfMetSummary = skillFocusMet ? 'Skill Focus MET' : 'Skill Focus NOT MET';
        } else {
            // Legacy string format (YES/NO)
            const metBool = skillFocusMet === 'YES' || skillFocusMet === true;
            allMet = metBool;
            allNotMet = !metBool;
            sfMetSummary = metBool ? 'Skill Focus MET' : 'Skill Focus NOT MET';
        }

        let sfPromptNote = '';
        if (allMet) {
            sfPromptNote = 'Note that ALL skill focuses were MET today - acknowledge this achievement.';
        } else if (allNotMet) {
            sfPromptNote = 'Note that the skill focuses were NOT MET today - provide constructive recommendations for improvement.';
        } else {
            sfPromptNote = 'Note that SOME skill focuses were met while others were not - acknowledge the achievements and provide recommendations for the skills still needing work.';
        }

        const prompt = `Instructions for AI: Generate a paragraph overall of the feedback based on the data below. First discuss the activities today. Then, in the report, generate an deep analysis of participation and its relationship with the outcome of the general skills with microskills. ${sfPromptNote} Do not restate the data already provided. If the goals are not achieved, then provide an action or recommendation methodology for the following day. Only based on the provided info but you may provide suggestions based on general knowledge. Use the student's first name to make it more personal. Make it one paragraph only AND AVOID BULLETS. use simple vocabulary. The student is a ${studentGender}.

the data:
Daily Monitoring Report
Student:${studentName}
Date:${date} ${dayOfWeek}
Teacher:${req.body.teacherName}
Class:${subject}
Skill Focus (SF):${skillFocusDisplay}
Skill Focus Status: ${sfMetSummary}
Current Lesson:${safeCurrentLesson}
Homework:${safeHomework}
Activities finished today: ${activitiesFinished}
Activities did NOT finish today: ${activitiesNotFinished}
Class Participation Ratings:
- Attention: ${ratings.attention}/5
- Retention: ${ratings.retention}/5
- Comprehension: ${ratings.comprehension}/5
- Behavior: ${ratings.behavior}/5
- Handwriting: ${ratings.handwriting}/5
- Conversation: ${ratings.conversation}/5
Skills Assessment:
- ${skillsSummary}${scoresText}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an AI assistant that generates personalized student reports for teachers. Follow the user's instructions carefully."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 250
        });

        let narrative = response.choices?.[0]?.message?.content ?? '';
        narrative = narrative.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

        // Use AI to identify the strongest positive and weakest negative phrases
        const sentimentPrompt = `Analyze this teacher's report and identify:
1. The ONE strongest positive phrase (3-15 words) about the student
2. The ONE weakest/most concerning phrase (3-15 words) about the student

Return ONLY a JSON object with this exact format:
{
  "positive": "the exact phrase from the text",
  "negative": "the exact phrase from the text"
}

If there are no clearly positive aspects, use "positive": null
If there are no clearly negative aspects, use "negative": null

Report text: ${narrative}`;

        let sentimentData = { positive: null, negative: null };
        try {
            const sentimentResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a sentiment analysis assistant. Return only valid JSON."
                    },
                    {
                        role: "user",
                        content: sentimentPrompt
                    }
                ],
                response_format: { type: "json_object" },
                temperature: 0.3,
                max_tokens: 150
            });

            sentimentData = JSON.parse(sentimentResponse.choices?.[0]?.message?.content ?? '{}');
        } catch (sentimentError) {
            console.error('Sentiment analysis error:', sentimentError);
            // Continue without sentiment highlighting if it fails
        }

        // Save report data to CSV
        const csvFilePath = 'reports.csv';
        const headers = [
            'Date', 'Day of Week', 'Student Name', 'Student ID', 'Grade Level', 'WPM Initial', 'GBWT Initial',
            'Reading Level Initial', 'Interview Score', 'Teacher Name', 'Teacher ID', 'Subject', 'Is Substitute',
            'Skill Focus', 'SF Met', 'Current Lesson', 'Materials', 'Homework', 'Next Lesson', 'Activities Finished',
            'Activities Not Finished', 'Student Gender', 'Attention', 'Retention',
            'Comprehension', 'Behavior', 'Handwriting', 'Conversation',
            'Skills', 'Scores', 'Narrative'
        ];
        const skillsJSON = JSON.stringify(skills);
        const scoresJSON = JSON.stringify(scores);

        // Get student initial data from request body
        const gradeLevel = req.body.gradeLevel || 'TBD';
        const wpmInitial = req.body.wpmInitial || 'TBD';
        const gbwtInitial = req.body.gbwtInitial || 'TBD';
        const readingLevelInitial = req.body.readingLevelInitial || 'TBD';
        const interviewScore = req.body.interviewScore || 'TBD';
        const studentId = req.body.studentId || 'N/A';
        const teacherId = req.body.teacherId || 'N/A';

        // Store SF Met as JSON string for per-skill tracking (backward compatible with old YES/NO)
        let sfMetValue;
        if (typeof skillFocusMet === 'object' && skillFocusMet !== null && !Array.isArray(skillFocusMet)) {
            sfMetValue = JSON.stringify(skillFocusMet);
        } else if (typeof skillFocusMet === 'boolean') {
            sfMetValue = skillFocusMet ? 'YES' : 'NO';
        } else {
            sfMetValue = skillFocusMet || 'NO';
        }

        const row = [
            date, dayOfWeek, studentName, studentId, gradeLevel, wpmInitial, gbwtInitial,
            readingLevelInitial, interviewScore, req.body.teacherName, teacherId, subject, req.body.isSubstitute || 'NO',
            skillFocusDisplay, sfMetValue, safeCurrentLesson, safeMaterials, safeHomework, safeNextLesson, activitiesFinished,
            activitiesNotFinished, studentGender, ratings.attention, ratings.retention,
            ratings.comprehension, ratings.behavior, ratings.handwriting, ratings.conversation,
            skillsJSON, scoresJSON, narrative
        ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',');

        if (!fs.existsSync(csvFilePath)) {
            fs.writeFileSync(csvFilePath, headers.join(',') + '\n');
        }
        fs.appendFileSync(csvFilePath, row + '\n');
        invalidateCSVCache();

        // Webhook: sync to student-report-viewer SQLite database
        try {
            const reportData = {
                'Date': date, 'Day of Week': dayOfWeek,
                'Student Name': studentName, 'Student ID': studentId,
                'Grade Level': gradeLevel, 'Student Gender': studentGender,
                'WPM Initial': wpmInitial, 'GBWT Initial': gbwtInitial,
                'Reading Level Initial': readingLevelInitial,
                'Interview Score': interviewScore,
                'Teacher Name': req.body.teacherName, 'Teacher ID': teacherId,
                'Subject': subject, 'Is Substitute': req.body.isSubstitute || 'NO',
                'Skill Focus': skillFocusDisplay, 'SF Met': sfMetValue,
                'Current Lesson': req.body.currentLesson || '',
                'Materials': req.body.materials || '',
                'Homework': req.body.homework || '',
                'Next Lesson': req.body.nextLesson || '',
                'Activities Finished': req.body.activitiesFinished || '',
                'Activities Not Finished': req.body.activitiesNotFinished || '',
                'Attention': ratings.attention, 'Retention': ratings.retention,
                'Comprehension': ratings.comprehension, 'Behavior': ratings.behavior,
                'Handwriting': ratings.handwriting, 'Conversation': ratings.conversation,
                'Skills': skillsJSON, 'Scores': scoresJSON,
                'Narrative': narrative
            };
            fetch('http://localhost:1442/api/reports/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportData)
            }).catch(e => console.log('SQLite sync skipped:', e.message));
        } catch (webhookErr) {
            // Non-blocking - don't fail the report submission
            console.log('Webhook error (non-blocking):', webhookErr.message);
        }

        res.json({
            narrative,
            sentiment: sentimentData
        });

    } catch (error) {
        console.error('Error generating narrative:', error);
        res.status(500).json({ error: 'Failed to generate narrative report' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Network access: Find your IP with 'ifconfig | grep inet' and share http://YOUR_IP:${port}`);
});