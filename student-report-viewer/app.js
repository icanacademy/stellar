const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const OpenAI = require('openai');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.join(__dirname, '../teacher-report-generator/.env') });

const dbModule = require('./lib/db');
const engine = require('./lib/persona-engine');

const app = express();
const port = 1442;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Path to the CSV file in the parent app (kept for fallback)
const CSV_PATH = path.join(__dirname, '../teacher-report-generator/reports.csv');

// Initialize SQLite database
let USE_SQLITE = false;
let sqliteDb = null;
try {
    sqliteDb = dbModule.initSchema();
    // Check if we have data in SQLite
    const count = sqliteDb.prepare('SELECT COUNT(*) as c FROM daily_reports').get();
    if (count.c > 0) {
        USE_SQLITE = true;
        console.log(`SQLite enabled: ${count.c} reports in database`);
    } else {
        console.log('SQLite database empty, falling back to CSV');
    }
} catch (e) {
    console.log('SQLite not available, using CSV fallback:', e.message);
}

// Helper function to parse SF Met field (handles both old YES/NO and new JSON format)
function parseSfMet(sfMetValue, skillFocusValue) {
    const result = {
        overallMet: false,
        allMet: true,
        anyMet: false,
        perSkill: {},
        metCount: 0,
        notMetCount: 0,
        totalCount: 0
    };

    if (!sfMetValue) {
        return result;
    }

    // Try to parse as JSON first (new format)
    if (sfMetValue.startsWith('{') && sfMetValue.endsWith('}')) {
        try {
            const parsed = JSON.parse(sfMetValue);
            for (const [skill, met] of Object.entries(parsed)) {
                result.perSkill[skill] = met === true;
                result.totalCount++;
                if (met === true) {
                    result.metCount++;
                    result.anyMet = true;
                } else {
                    result.notMetCount++;
                    result.allMet = false;
                }
            }
            result.overallMet = result.anyMet;
            return result;
        } catch (e) {
            // Fall through to old format handling
        }
    }

    // Old format: YES/NO
    const isMet = sfMetValue === 'YES';
    result.overallMet = isMet;
    result.allMet = isMet;
    result.anyMet = isMet;
    result.metCount = isMet ? 1 : 0;
    result.notMetCount = isMet ? 0 : 1;
    result.totalCount = 1;

    // If we have skill focus values, create per-skill entries with same met status
    if (skillFocusValue && skillFocusValue.trim()) {
        const skills = skillFocusValue.split(',').map(s => s.trim()).filter(s => s);
        result.totalCount = skills.length || 1;
        result.metCount = isMet ? result.totalCount : 0;
        result.notMetCount = isMet ? 0 : result.totalCount;
        skills.forEach(skill => {
            result.perSkill[skill] = isMet;
        });
    }

    return result;
}

// Helper function to deduplicate reports
// Keeps only the latest entry for each Student + Date + Subject combination
// Assumes later rows in CSV are corrections/updates to earlier ones
function deduplicateReports(reports) {
    const seen = new Map();

    // Process in order - later entries override earlier ones
    reports.forEach((report, index) => {
        const key = `${report['Student Name']}|${report['Date']}|${report['Subject']}`;
        // Store the report with its original index to maintain order
        seen.set(key, { report, index });
    });

    // Convert back to array and sort by original index to maintain chronological order
    return Array.from(seen.values())
        .sort((a, b) => a.index - b.index)
        .map(item => item.report);
}

// Endpoint to get all unique students
app.get('/api/students', async (req, res) => {
    try {
        if (USE_SQLITE) {
            const students = dbModule.getAllStudents(sqliteDb).map(s => s.full_name);
            return res.json(students);
        }

        const students = new Set();

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                if (row['Student Name']) {
                    students.add(row['Student Name']);
                }
            })
            .on('end', () => {
                res.json(Array.from(students).sort());
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get all teachers
app.get('/api/teachers', async (req, res) => {
    try {
        if (USE_SQLITE) {
            const teachers = sqliteDb.prepare('SELECT DISTINCT teacher_name FROM daily_reports WHERE teacher_name IS NOT NULL ORDER BY teacher_name').all().map(r => r.teacher_name);
            return res.json(teachers);
        }

        const teachers = new Set();

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                if (row['Teacher Name']) {
                    teachers.add(row['Teacher Name']);
                }
            })
            .on('end', () => {
                res.json(Array.from(teachers).sort());
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get all subjects
app.get('/api/subjects', async (req, res) => {
    try {
        if (USE_SQLITE) {
            const subjects = sqliteDb.prepare('SELECT DISTINCT subject FROM daily_reports WHERE subject IS NOT NULL ORDER BY subject').all().map(r => r.subject);
            return res.json(subjects);
        }

        const subjects = new Set();

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                if (row['Subject']) {
                    subjects.add(row['Subject']);
                }
            })
            .on('end', () => {
                res.json(Array.from(subjects).sort());
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get reports with filters
app.get('/api/reports', async (req, res) => {
    try {
        const { student, teacher, subject, startDate, endDate } = req.query;

        if (USE_SQLITE) {
            let sql = `SELECT dr.*, s.full_name as "Student Name", s.student_id_ext as "Student ID",
                        s.grade_level as "Grade Level", s.gender as "Student Gender"
                        FROM daily_reports dr JOIN students s ON dr.student_id = s.id WHERE 1=1`;
            const params = [];
            if (student) { sql += ' AND s.full_name = ?'; params.push(student); }
            if (teacher) { sql += ' AND dr.teacher_name = ?'; params.push(teacher); }
            if (subject) { sql += ' AND dr.subject = ?'; params.push(subject); }
            if (startDate) { sql += ' AND dr.report_date >= ?'; params.push(startDate); }
            if (endDate) { sql += ' AND dr.report_date <= ?'; params.push(endDate); }
            sql += ' ORDER BY dr.report_date ASC';

            const rows = sqliteDb.prepare(sql).all(...params);
            const mapped = rows.map(r => ({
                Date: r.report_date,
                'Day of Week': r.day_of_week,
                'Student Name': r['Student Name'],
                'Student ID': r['Student ID'],
                'Grade Level': r['Grade Level'],
                'Student Gender': r['Student Gender'],
                'Teacher Name': r.teacher_name,
                'Teacher ID': r.teacher_id,
                Subject: r.subject,
                'Is Substitute': r.is_substitute,
                'Skill Focus': r.skill_focus,
                'SF Met': r.sf_met,
                'Current Lesson': r.current_lesson,
                Materials: r.materials,
                Homework: r.homework,
                'Next Lesson': r.next_lesson,
                'Activities Finished': r.activities_finished,
                'Activities Not Finished': r.activities_not_finished,
                Attention: r.attention ? String(r.attention) : '',
                Retention: r.retention ? String(r.retention) : '',
                Comprehension: r.comprehension ? String(r.comprehension) : '',
                Behavior: r.behavior ? String(r.behavior) : '',
                Handwriting: r.handwriting ? String(r.handwriting) : '',
                Conversation: r.conversation ? String(r.conversation) : '',
                Skills: r.skills_json ? JSON.parse(r.skills_json) : {},
                Scores: r.scores_json ? JSON.parse(r.scores_json) : {},
                Narrative: r.narrative,
                'WPM Initial': r.wpm_initial,
                'GBWT Initial': r.gbwt_initial,
                'Reading Level Initial': r.reading_level_initial,
                'Interview Score': r.interview_score
            }));
            return res.json(mapped);
        }

        const reports = [];

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                // Apply filters
                let include = true;

                if (student && row['Student Name'] !== student) include = false;
                if (teacher && row['Teacher Name'] !== teacher) include = false;
                if (subject && row['Subject'] !== subject) include = false;
                if (startDate && row['Date'] < startDate) include = false;
                if (endDate && row['Date'] > endDate) include = false;

                if (include) {
                    // Parse JSON fields
                    try {
                        row.Skills = row.Skills ? JSON.parse(row.Skills) : {};
                        row.Scores = row.Scores ? JSON.parse(row.Scores) : {};
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                        row.Skills = {};
                        row.Scores = {};
                    }
                    reports.push(row);
                }
            })
            .on('end', () => {
                // Deduplicate reports (keep latest entry for each Student+Date+Subject)
                const deduped = deduplicateReports(reports);

                // Sort by date (oldest first)
                deduped.sort((a, b) => new Date(a.Date) - new Date(b.Date));
                res.json(deduped);
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get analytics for a student
app.get('/api/analytics', async (req, res) => {
    try {
        const { student, teacher, subject, startDate, endDate } = req.query;
        if (!student) {
            return res.status(400).json({ error: 'Student name required' });
        }

        const reports = [];

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                // Apply same filters as /api/reports
                let include = row['Student Name'] === student;

                if (include && teacher && row['Teacher Name'] !== teacher) include = false;
                if (include && subject && row['Subject'] !== subject) include = false;
                if (include && startDate && row['Date'] < startDate) include = false;
                if (include && endDate && row['Date'] > endDate) include = false;

                if (include) {
                    reports.push(row);
                }
            })
            .on('end', () => {
                // Deduplicate reports (keep latest entry for each Student+Date+Subject)
                const dedupedReports = deduplicateReports(reports);

                // Calculate analytics
                const analytics = {
                    totalReports: dedupedReports.length,
                    dateRange: {
                        earliest: dedupedReports.length > 0 ? dedupedReports[dedupedReports.length - 1].Date : null,
                        latest: dedupedReports.length > 0 ? dedupedReports[0].Date : null
                    },
                    averageRatings: {
                        attention: 0,
                        retention: 0,
                        comprehension: 0,
                        behavior: 0,
                        handwriting: 0,
                        conversation: 0
                    },
                    subjectsCount: {},
                    teachersCount: {},
                    materialsBySubject: {},
                    lessonsBySubject: {},  // Learning progress tracking
                    learningTimeline: [],   // Chronological lesson history
                    textbookPerformance: {},  // Performance metrics per textbook
                    lessonPerformance: [],    // Performance metrics per lesson
                    skillFocusMet: { yes: 0, no: 0 }
                };

                if (dedupedReports.length === 0) {
                    return res.json(analytics);
                }

                // Calculate averages
                let sum = {
                    attention: 0,
                    retention: 0,
                    comprehension: 0,
                    behavior: 0,
                    handwriting: 0,
                    conversation: 0
                };

                dedupedReports.forEach(report => {
                    // Ratings
                    sum.attention += parseInt(report.Attention) || 0;
                    sum.retention += parseInt(report.Retention) || 0;
                    sum.comprehension += parseInt(report.Comprehension) || 0;
                    sum.behavior += parseInt(report.Behavior) || 0;
                    sum.handwriting += parseInt(report.Handwriting) || 0;
                    sum.conversation += parseInt(report.Conversation) || 0;

                    // Subject counts
                    analytics.subjectsCount[report.Subject] = (analytics.subjectsCount[report.Subject] || 0) + 1;

                    // Teacher counts
                    analytics.teachersCount[report['Teacher Name']] = (analytics.teachersCount[report['Teacher Name']] || 0) + 1;

                    // Materials by Subject
                    if (report.Subject) {
                        if (!analytics.materialsBySubject[report.Subject]) {
                            analytics.materialsBySubject[report.Subject] = [];
                        }
                        // Ensure Materials is a string before adding
                        const material = typeof report.Materials === 'string' ? report.Materials : '';
                        if (material && material.trim() !== '' && material !== 'N/A') {
                            analytics.materialsBySubject[report.Subject].push(material.trim());
                        }
                    }

                    // Lessons by Subject (track learning progress)
                    if (report.Subject && report['Current Lesson']) {
                        if (!analytics.lessonsBySubject[report.Subject]) {
                            analytics.lessonsBySubject[report.Subject] = [];
                        }
                        const lesson = report['Current Lesson'].trim();
                        if (lesson && lesson !== 'N/A' && lesson !== '-') {
                            // Add unique lessons only
                            if (!analytics.lessonsBySubject[report.Subject].includes(lesson)) {
                                analytics.lessonsBySubject[report.Subject].push(lesson);
                            }
                        }
                    }

                    // Parse SF Met (handles both old YES/NO and new JSON format)
                    const sfMetParsed = parseSfMet(report['SF Met'], report['Skill Focus']);

                    // Learning Timeline (chronological)
                    if (report['Current Lesson'] && report['Current Lesson'].trim()) {
                        analytics.learningTimeline.push({
                            date: report.Date,
                            subject: report.Subject,
                            lesson: report['Current Lesson'].trim(),
                            skillFocus: report['Skill Focus'] || '',
                            sfMet: sfMetParsed.overallMet,
                            sfMetDetails: sfMetParsed.perSkill,
                            homework: report.Homework || ''
                        });
                    }

                    // Calculate performance metrics for this report
                    const avgRating = (
                        (parseInt(report.Attention) || 0) +
                        (parseInt(report.Retention) || 0) +
                        (parseInt(report.Comprehension) || 0) +
                        (parseInt(report.Behavior) || 0) +
                        (parseInt(report.Handwriting) || 0) +
                        (parseInt(report.Conversation) || 0)
                    ) / 6;

                    // Calculate score percentage if scores exist
                    let scorePercent = null;
                    try {
                        const scores = report.Scores ? (typeof report.Scores === 'string' ? JSON.parse(report.Scores) : report.Scores) : {};
                        let totalScore = 0, totalPossible = 0;
                        Object.values(scores).forEach(s => {
                            if (s && s.score && s.total && parseInt(s.total) > 0) {
                                totalScore += parseInt(s.score) || 0;
                                totalPossible += parseInt(s.total) || 0;
                            }
                        });
                        if (totalPossible > 0) {
                            scorePercent = Math.round((totalScore / totalPossible) * 100);
                        }
                    } catch (e) {}

                    // Textbook Performance tracking
                    const textbook = typeof report.Materials === 'string' ? report.Materials.trim() : '';
                    if (textbook && textbook !== '' && textbook !== 'N/A') {
                        if (!analytics.textbookPerformance[textbook]) {
                            analytics.textbookPerformance[textbook] = {
                                subject: report.Subject,
                                sessions: 0,
                                totalRating: 0,
                                totalScorePercent: 0,
                                scoreCount: 0,
                                sfMetCount: 0,
                                sfTotalCount: 0,
                                lessons: []
                            };
                        }
                        const tp = analytics.textbookPerformance[textbook];
                        tp.sessions++;
                        tp.totalRating += avgRating;
                        if (scorePercent !== null) {
                            tp.totalScorePercent += scorePercent;
                            tp.scoreCount++;
                        }
                        tp.sfMetCount += sfMetParsed.metCount;
                        tp.sfTotalCount += sfMetParsed.totalCount;
                        if (report['Current Lesson'] && !tp.lessons.includes(report['Current Lesson'].trim())) {
                            tp.lessons.push(report['Current Lesson'].trim());
                        }
                    }

                    // Lesson Performance tracking
                    const lesson = report['Current Lesson'] ? report['Current Lesson'].trim() : '';
                    if (lesson && lesson !== '' && lesson !== 'N/A' && lesson !== '-') {
                        analytics.lessonPerformance.push({
                            date: report.Date,
                            subject: report.Subject,
                            textbook: textbook || 'Not specified',
                            lesson: lesson,
                            avgRating: Math.round(avgRating * 10) / 10,
                            scorePercent: scorePercent,
                            sfMet: sfMetParsed.overallMet,
                            sfMetDetails: sfMetParsed.perSkill,
                            skillFocus: report['Skill Focus'] || ''
                        });
                    }

                    // Skill focus met (count per-skill for accurate tracking)
                    analytics.skillFocusMet.yes += sfMetParsed.metCount;
                    analytics.skillFocusMet.no += sfMetParsed.notMetCount;
                });

                // Calculate averages
                Object.keys(sum).forEach(key => {
                    analytics.averageRatings[key] = (sum[key] / dedupedReports.length).toFixed(2);
                });

                // Finalize textbook performance averages
                Object.keys(analytics.textbookPerformance).forEach(textbook => {
                    const tp = analytics.textbookPerformance[textbook];
                    tp.avgRating = Math.round((tp.totalRating / tp.sessions) * 10) / 10;
                    tp.avgScorePercent = tp.scoreCount > 0 ? Math.round(tp.totalScorePercent / tp.scoreCount) : null;
                    tp.sfMetPercent = tp.sfTotalCount > 0 ? Math.round((tp.sfMetCount / tp.sfTotalCount) * 100) : null;
                    tp.lessonCount = tp.lessons.length;
                    // Clean up intermediate values
                    delete tp.totalRating;
                    delete tp.totalScorePercent;
                    delete tp.scoreCount;
                    delete tp.sfMetCount;
                    delete tp.sfTotalCount;
                });

                res.json(analytics);
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get chart data (fast, no AI processing)
app.get('/api/chart-data', async (req, res) => {
    try {
        const { student, teacher, subject, startDate, endDate } = req.query;
        if (!student) {
            return res.status(400).json({ error: 'Student name required' });
        }

        const reports = [];

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                // Apply same filters as /api/reports
                let include = row['Student Name'] === student;

                if (include && teacher && row['Teacher Name'] !== teacher) include = false;
                if (include && subject && row['Subject'] !== subject) include = false;
                if (include && startDate && row['Date'] < startDate) include = false;
                if (include && endDate && row['Date'] > endDate) include = false;

                if (include) {
                    try {
                        row.Skills = row.Skills ? JSON.parse(row.Skills) : {};
                        row.Scores = row.Scores ? JSON.parse(row.Scores) : {};
                    } catch (e) {
                        row.Skills = {};
                        row.Scores = {};
                    }
                    reports.push(row);
                }
            })
            .on('end', () => {
                // Deduplicate reports (keep latest entry for each Student+Date+Subject)
                const dedupedReports = deduplicateReports(reports);

                if (dedupedReports.length === 0) {
                    return res.json({
                        averageRatings: {},
                        ratingsOverTime: [],
                        weaknessFrequency: [],
                        scoresOverTime: [],
                        scoresCategoryStats: {}
                    });
                }

                // Calculate chart data (same logic as AI analysis, but no OpenAI call)
                let ratingSum = { attention: 0, retention: 0, comprehension: 0, behavior: 0, handwriting: 0, conversation: 0 };
                const reportsByDate = {};
                const skillsWeaknesses = {};
                let scoresData = { overTime: [], categoryStats: {}, rawScoresByDate: {} };
                const skillFocusByDate = {};
                const skillFocusByTopic = {}; // Track skill focus success by topic name
                const subjectPerformance = {};

                dedupedReports.forEach(report => {
                    // Ratings
                    const ratings = {
                        date: report.Date,
                        attention: parseInt(report.Attention) || 0,
                        retention: parseInt(report.Retention) || 0,
                        comprehension: parseInt(report.Comprehension) || 0,
                        behavior: parseInt(report.Behavior) || 0,
                        handwriting: parseInt(report.Handwriting) || 0,
                        conversation: parseInt(report.Conversation) || 0
                    };

                    if (!reportsByDate[report.Date]) reportsByDate[report.Date] = [];
                    reportsByDate[report.Date].push(ratings);

                    Object.keys(ratingSum).forEach(key => ratingSum[key] += ratings[key]);

                    // Skills weaknesses (track dates for trend analysis) - split by keywords
                    if (report.Skills && typeof report.Skills === 'object') {
                        Object.entries(report.Skills).forEach(([skill, data]) => {
                            if (data.weaknesses && Array.isArray(data.weaknesses)) {
                                data.weaknesses.forEach(weaknessEntry => {
                                    // Split by comma and "and" to get individual keywords
                                    const keywords = weaknessEntry
                                        .split(/,|\band\b/i)
                                        .map(k => k.trim())
                                        .filter(k => k.length > 0);

                                    keywords.forEach(keyword => {
                                        // Normalize: capitalize first letter
                                        const displayName = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase();
                                        const normalizedKey = keyword.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

                                        if (normalizedKey.length === 0) return;

                                        if (!skillsWeaknesses[normalizedKey]) {
                                            skillsWeaknesses[normalizedKey] = { count: 0, dates: [], displayName: displayName };
                                        }
                                        skillsWeaknesses[normalizedKey].count++;
                                        skillsWeaknesses[normalizedKey].dates.push(report.Date);
                                    });
                                });
                            }
                        });
                    }

                    // Score tracking
                    if (report.Scores && typeof report.Scores === 'object') {
                        const scoreLabels = { bookMaterials: 'Book/Materials', vocabulary: 'Vocabulary', classVideo: 'Class Video', homework: 'Homework', homeworkVocab: 'Homework Vocab', weeklyTest: 'Weekly Test' };

                        if (!scoresData.rawScoresByDate[report.Date]) scoresData.rawScoresByDate[report.Date] = {};

                        Object.entries(scoreLabels).forEach(([key, label]) => {
                            if (report.Scores[key]) {
                                const score = parseInt(report.Scores[key].score);
                                const total = parseInt(report.Scores[key].total);

                                if (!isNaN(score) && !isNaN(total) && total > 0) {
                                    const percentage = (score / total) * 100;

                                    if (!scoresData.rawScoresByDate[report.Date][key]) scoresData.rawScoresByDate[report.Date][key] = [];
                                    scoresData.rawScoresByDate[report.Date][key].push(percentage);

                                    if (!scoresData.categoryStats[key]) scoresData.categoryStats[key] = { label, count: 0, totalPercentage: 0 };
                                    scoresData.categoryStats[key].count++;
                                    scoresData.categoryStats[key].totalPercentage += percentage;
                                }
                            }
                        });
                    }

                    // Parse SF Met (handles both old YES/NO and new JSON format)
                    const sfMetParsed = parseSfMet(report['SF Met'], report['Skill Focus']);

                    // Track Skill Focus Met by date
                    if (!skillFocusByDate[report.Date]) {
                        skillFocusByDate[report.Date] = { met: 0, total: 0 };
                    }
                    skillFocusByDate[report.Date].total += sfMetParsed.totalCount || 1;
                    skillFocusByDate[report.Date].met += sfMetParsed.metCount;

                    // Track Skill Focus by individual keywords with per-skill met status
                    const skillFocusName = report['Skill Focus'];
                    if (skillFocusName && skillFocusName.trim() !== '') {
                        // Split by commas and "and" to get individual keywords
                        const keywords = skillFocusName
                            .split(/,|\band\b/i)
                            .map(k => k.trim())
                            .filter(k => k.length > 0);

                        keywords.forEach(keyword => {
                            // Clean display name: capitalize first letter
                            const displayName = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase();

                            // Normalize key for grouping
                            const normalizedKey = keyword.toLowerCase()
                                .replace(/[^a-z0-9\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();

                            if (normalizedKey.length === 0) return;

                            if (!skillFocusByTopic[normalizedKey]) {
                                skillFocusByTopic[normalizedKey] = {
                                    met: 0,
                                    total: 0,
                                    subject: report.Subject,
                                    displayName: displayName,
                                    displayNameCounts: {}
                                };
                            }

                            // Track display name variations
                            if (!skillFocusByTopic[normalizedKey].displayNameCounts[displayName]) {
                                skillFocusByTopic[normalizedKey].displayNameCounts[displayName] = 0;
                            }
                            skillFocusByTopic[normalizedKey].displayNameCounts[displayName]++;

                            // Check per-skill met status (new format) or use overall (old format)
                            const isThisSkillMet = sfMetParsed.perSkill[keyword] !== undefined
                                ? sfMetParsed.perSkill[keyword]
                                : sfMetParsed.overallMet;

                            skillFocusByTopic[normalizedKey].total++;
                            if (isThisSkillMet) {
                                skillFocusByTopic[normalizedKey].met++;
                            }
                        });
                    }

                    // Track Subject Performance
                    if (report.Subject) {
                        if (!subjectPerformance[report.Subject]) {
                            subjectPerformance[report.Subject] = {
                                count: 0,
                                ratingSum: { attention: 0, retention: 0, comprehension: 0, behavior: 0, handwriting: 0, conversation: 0 }
                            };
                        }
                        subjectPerformance[report.Subject].count++;
                        subjectPerformance[report.Subject].ratingSum.attention += ratings.attention;
                        subjectPerformance[report.Subject].ratingSum.retention += ratings.retention;
                        subjectPerformance[report.Subject].ratingSum.comprehension += ratings.comprehension;
                        subjectPerformance[report.Subject].ratingSum.behavior += ratings.behavior;
                        subjectPerformance[report.Subject].ratingSum.handwriting += ratings.handwriting;
                        subjectPerformance[report.Subject].ratingSum.conversation += ratings.conversation;
                    }
                });

                // Calculate daily averages for ratingsOverTime
                const ratingsOverTime = [];
                Object.keys(reportsByDate).forEach(date => {
                    const dateReports = reportsByDate[date];
                    const dailyAverage = { date, attention: 0, retention: 0, comprehension: 0, behavior: 0, handwriting: 0, conversation: 0 };

                    dateReports.forEach(r => Object.keys(dailyAverage).forEach(k => { if (k !== 'date') dailyAverage[k] += r[k]; }));

                    const count = dateReports.length;
                    Object.keys(dailyAverage).forEach(k => { if (k !== 'date') dailyAverage[k] = parseFloat((dailyAverage[k] / count).toFixed(2)); });

                    ratingsOverTime.push(dailyAverage);
                });
                ratingsOverTime.sort((a, b) => new Date(a.date) - new Date(b.date));

                // Calculate daily averages for scores
                Object.keys(scoresData.rawScoresByDate).forEach(date => {
                    const dateScores = scoresData.rawScoresByDate[date];
                    const dailyScoreEntry = { date };

                    Object.keys(dateScores).forEach(category => {
                        const scores = dateScores[category];
                        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                        dailyScoreEntry[category] = parseFloat(average.toFixed(2));
                    });

                    scoresData.overTime.push(dailyScoreEntry);
                });
                scoresData.overTime.sort((a, b) => new Date(a.date) - new Date(b.date));

                // Calculate averages
                const averageRatings = {};
                Object.keys(ratingSum).forEach(key => averageRatings[key] = (ratingSum[key] / dedupedReports.length).toFixed(2));

                // Weakness frequency with trend analysis
                // Get all dates and find the midpoint to split early vs recent
                const allDates = dedupedReports.map(r => new Date(r.Date)).sort((a, b) => a - b);
                const midpointDate = allDates.length > 1 ? allDates[Math.floor(allDates.length / 2)] : allDates[0];

                const weaknessFrequency = Object.entries(skillsWeaknesses)
                    .map(([normalizedKey, data]) => {
                        // Count occurrences in early vs recent period
                        const earlyCount = data.dates.filter(d => new Date(d) <= midpointDate).length;
                        const recentCount = data.dates.filter(d => new Date(d) > midpointDate).length;

                        // Determine trend
                        let trend = 'stable';
                        if (recentCount > earlyCount) {
                            trend = 'worsening';
                        } else if (recentCount < earlyCount) {
                            trend = 'improving';
                        }

                        // Calculate priority score (higher = needs more attention)
                        // Worsening = high priority, Frequent + stable = medium, Improving = low
                        let priorityScore = data.count;
                        if (trend === 'worsening') {
                            priorityScore = data.count * 3 + recentCount * 2; // Boost worsening items
                        } else if (trend === 'improving') {
                            priorityScore = data.count * 0.5; // Lower priority for improving
                        }

                        // Calculate percentage change
                        const totalPeriods = earlyCount + recentCount;
                        const changePercent = totalPeriods > 0
                            ? Math.round(((recentCount - earlyCount) / Math.max(earlyCount, 1)) * 100)
                            : 0;

                        return {
                            weakness: data.displayName || normalizedKey,
                            count: data.count,
                            earlyCount,
                            recentCount,
                            trend,
                            priorityScore,
                            changePercent
                        };
                    })
                    .sort((a, b) => b.priorityScore - a.priorityScore) // Sort by priority
                    .slice(0, 15);

                // Skill Focus Met Over Time
                const skillFocusOverTime = Object.keys(skillFocusByDate)
                    .sort((a, b) => new Date(a) - new Date(b))
                    .map(date => ({
                        date,
                        percentage: (skillFocusByDate[date].met / skillFocusByDate[date].total * 100).toFixed(1),
                        met: skillFocusByDate[date].met,
                        total: skillFocusByDate[date].total
                    }));

                // Skill Focus Success Rate by Topic (sorted by success rate)
                // Use the most common display name variation for each topic
                const skillFocusBreakdown = Object.entries(skillFocusByTopic)
                    .map(([normalizedKey, data]) => {
                        // Find the most common display name variation
                        let bestDisplayName = data.displayName;
                        let maxCount = 0;
                        if (data.displayNameCounts) {
                            Object.entries(data.displayNameCounts).forEach(([name, count]) => {
                                if (count > maxCount) {
                                    maxCount = count;
                                    bestDisplayName = name;
                                }
                            });
                        }
                        return {
                            topic: bestDisplayName,  // Use most common display name
                            percentage: parseFloat((data.met / data.total * 100).toFixed(1)),
                            met: data.met,
                            total: data.total,
                            subject: data.subject
                        };
                    })
                    .sort((a, b) => b.percentage - a.percentage); // Sort by success rate descending

                // Subject Performance Comparison
                const subjectComparison = Object.keys(subjectPerformance).map(subject => {
                    const data = subjectPerformance[subject];
                    const avgRating = (
                        data.ratingSum.attention +
                        data.ratingSum.retention +
                        data.ratingSum.comprehension +
                        data.ratingSum.behavior +
                        data.ratingSum.handwriting +
                        data.ratingSum.conversation
                    ) / (data.count * 6);

                    return {
                        subject,
                        averageRating: parseFloat(avgRating.toFixed(2)),
                        reportCount: data.count
                    };
                }).sort((a, b) => b.averageRating - a.averageRating);

                res.json({
                    averageRatings,
                    ratingsOverTime,
                    weaknessFrequency,
                    scoresOverTime: scoresData.overTime,
                    scoresCategoryStats: scoresData.categoryStats,
                    skillFocusOverTime,
                    skillFocusBreakdown,
                    subjectComparison
                });
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get AI-powered analysis
app.get('/api/ai-analysis', async (req, res) => {
    try {
        const { student, teacher, subject, startDate, endDate } = req.query;
        if (!student) {
            return res.status(400).json({ error: 'Student name required' });
        }

        const reports = [];

        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                // Apply same filters as /api/reports
                let include = row['Student Name'] === student;

                if (include && teacher && row['Teacher Name'] !== teacher) include = false;
                if (include && subject && row['Subject'] !== subject) include = false;
                if (include && startDate && row['Date'] < startDate) include = false;
                if (include && endDate && row['Date'] > endDate) include = false;

                if (include) {
                    try {
                        row.Skills = row.Skills ? JSON.parse(row.Skills) : {};
                        row.Scores = row.Scores ? JSON.parse(row.Scores) : {};
                    } catch (e) {
                        row.Skills = {};
                        row.Scores = {};
                    }
                    reports.push(row);
                }
            })
            .on('end', async () => {
                // Deduplicate reports (keep latest entry for each Student+Date+Subject)
                const dedupedReports = deduplicateReports(reports);

                if (dedupedReports.length === 0) {
                    return res.json({
                        strengths: [],
                        weaknessPatterns: [],
                        recommendations: [],
                        insights: 'No reports available for analysis.',
                        progressTrend: 'insufficient_data'
                    });
                }

                // Aggregate data for AI analysis
                // Get student gender from the first report (should be consistent)
                const studentGender = dedupedReports[0]['Student Gender'] || 'Unknown';
                const genderPronoun = studentGender === 'Male' ? 'he/him/his' :
                                      studentGender === 'Female' ? 'she/her/her' : 'they/them/their';

                const aggregatedData = {
                    studentName: student,
                    studentGender: studentGender,
                    genderPronoun: genderPronoun,
                    totalReports: dedupedReports.length,
                    dateRange: {
                        start: dedupedReports[dedupedReports.length - 1].Date,
                        end: dedupedReports[0].Date
                    },
                    averageRatings: {},
                    ratingsOverTime: [],
                    skillsWeaknesses: {},
                    subjects: {},
                    teachers: {},
                    skillFocusMet: { yes: 0, no: 0 },
                    narrativeSummaries: []
                };

                // Calculate metrics
                let ratingSum = {
                    attention: 0, retention: 0, comprehension: 0,
                    behavior: 0, handwriting: 0, conversation: 0
                };

                // Group reports by date for daily averages
                const reportsByDate = {};

                dedupedReports.forEach((report, index) => {
                    // Ratings
                    const ratings = {
                        date: report.Date,
                        attention: parseInt(report.Attention) || 0,
                        retention: parseInt(report.Retention) || 0,
                        comprehension: parseInt(report.Comprehension) || 0,
                        behavior: parseInt(report.Behavior) || 0,
                        handwriting: parseInt(report.Handwriting) || 0,
                        conversation: parseInt(report.Conversation) || 0
                    };

                    // Group by date for daily averages
                    if (!reportsByDate[report.Date]) {
                        reportsByDate[report.Date] = [];
                    }
                    reportsByDate[report.Date].push(ratings);

                    Object.keys(ratingSum).forEach(key => {
                        ratingSum[key] += ratings[key];
                    });

                    // Skills weaknesses
                    if (report.Skills && typeof report.Skills === 'object') {
                        Object.entries(report.Skills).forEach(([skill, data]) => {
                            if (data.weaknesses && Array.isArray(data.weaknesses)) {
                                data.weaknesses.forEach(weakness => {
                                    if (!aggregatedData.skillsWeaknesses[weakness]) {
                                        aggregatedData.skillsWeaknesses[weakness] = {
                                            count: 0,
                                            skills: new Set(),
                                            subjects: new Set()
                                        };
                                    }
                                    aggregatedData.skillsWeaknesses[weakness].count++;
                                    aggregatedData.skillsWeaknesses[weakness].skills.add(skill);
                                    aggregatedData.skillsWeaknesses[weakness].subjects.add(report.Subject);
                                });
                            }
                        });
                    }

                    // Subject tracking
                    aggregatedData.subjects[report.Subject] = (aggregatedData.subjects[report.Subject] || 0) + 1;

                    // Teacher tracking
                    aggregatedData.teachers[report['Teacher Name']] = (aggregatedData.teachers[report['Teacher Name']] || 0) + 1;

                    // Skill focus met (handles both old YES/NO and new JSON format)
                    const sfMetParsed = parseSfMet(report['SF Met'], report['Skill Focus']);
                    aggregatedData.skillFocusMet.yes += sfMetParsed.metCount;
                    aggregatedData.skillFocusMet.no += sfMetParsed.notMetCount;

                    // Narratives (last 5 for context)
                    if (index < 5 && report.Narrative) {
                        aggregatedData.narrativeSummaries.push(report.Narrative);
                    }

                    // Score tracking - collect all scores for later daily averaging
                    if (report.Scores && typeof report.Scores === 'object') {
                        if (!aggregatedData.scoresData) {
                            aggregatedData.scoresData = {
                                overTime: [],
                                categoryStats: {},
                                rawScoresByDate: {}
                            };
                        }

                        const scoreLabels = {
                            bookMaterials: 'Book/Materials',
                            vocabulary: 'Vocabulary',
                            classVideo: 'Class Video',
                            homework: 'Homework',
                            homeworkVocab: 'Homework Vocab',
                            weeklyTest: 'Weekly Test'
                        };

                        // Initialize date entry if needed
                        if (!aggregatedData.scoresData.rawScoresByDate[report.Date]) {
                            aggregatedData.scoresData.rawScoresByDate[report.Date] = {};
                        }

                        Object.entries(scoreLabels).forEach(([key, label]) => {
                            if (report.Scores[key]) {
                                const score = parseInt(report.Scores[key].score);
                                const total = parseInt(report.Scores[key].total);

                                if (!isNaN(score) && !isNaN(total) && total > 0) {
                                    const percentage = (score / total) * 100;

                                    // Store for daily averaging
                                    if (!aggregatedData.scoresData.rawScoresByDate[report.Date][key]) {
                                        aggregatedData.scoresData.rawScoresByDate[report.Date][key] = [];
                                    }
                                    aggregatedData.scoresData.rawScoresByDate[report.Date][key].push(percentage);

                                    // Track category stats
                                    if (!aggregatedData.scoresData.categoryStats[key]) {
                                        aggregatedData.scoresData.categoryStats[key] = {
                                            label: label,
                                            count: 0,
                                            totalPercentage: 0
                                        };
                                    }

                                    aggregatedData.scoresData.categoryStats[key].count++;
                                    aggregatedData.scoresData.categoryStats[key].totalPercentage += percentage;
                                }
                            }
                        });
                    }
                });

                // Calculate daily averages for ratingsOverTime
                Object.keys(reportsByDate).forEach(date => {
                    const dateReports = reportsByDate[date];
                    const dailyAverage = {
                        date: date,
                        attention: 0,
                        retention: 0,
                        comprehension: 0,
                        behavior: 0,
                        handwriting: 0,
                        conversation: 0
                    };

                    // Sum all ratings for this date
                    dateReports.forEach(report => {
                        dailyAverage.attention += report.attention;
                        dailyAverage.retention += report.retention;
                        dailyAverage.comprehension += report.comprehension;
                        dailyAverage.behavior += report.behavior;
                        dailyAverage.handwriting += report.handwriting;
                        dailyAverage.conversation += report.conversation;
                    });

                    // Calculate averages
                    const count = dateReports.length;
                    dailyAverage.attention = parseFloat((dailyAverage.attention / count).toFixed(2));
                    dailyAverage.retention = parseFloat((dailyAverage.retention / count).toFixed(2));
                    dailyAverage.comprehension = parseFloat((dailyAverage.comprehension / count).toFixed(2));
                    dailyAverage.behavior = parseFloat((dailyAverage.behavior / count).toFixed(2));
                    dailyAverage.handwriting = parseFloat((dailyAverage.handwriting / count).toFixed(2));
                    dailyAverage.conversation = parseFloat((dailyAverage.conversation / count).toFixed(2));

                    aggregatedData.ratingsOverTime.push(dailyAverage);
                });

                // Sort ratingsOverTime by date (oldest first, for chronological line chart)
                aggregatedData.ratingsOverTime.sort((a, b) => new Date(a.date) - new Date(b.date));

                // Calculate daily averages for scores
                if (aggregatedData.scoresData && aggregatedData.scoresData.rawScoresByDate) {
                    Object.keys(aggregatedData.scoresData.rawScoresByDate).forEach(date => {
                        const dateScores = aggregatedData.scoresData.rawScoresByDate[date];
                        const dailyScoreEntry = { date: date };

                        // Calculate average for each category on this date
                        Object.keys(dateScores).forEach(category => {
                            const scores = dateScores[category];
                            const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                            dailyScoreEntry[category] = parseFloat(average.toFixed(2));
                        });

                        aggregatedData.scoresData.overTime.push(dailyScoreEntry);
                    });

                    // Sort scoresData.overTime by date (oldest first)
                    aggregatedData.scoresData.overTime.sort((a, b) => new Date(a.date) - new Date(b.date));

                    // Clean up temporary data
                    delete aggregatedData.scoresData.rawScoresByDate;
                }

                // Calculate averages
                Object.keys(ratingSum).forEach(key => {
                    aggregatedData.averageRatings[key] = (ratingSum[key] / dedupedReports.length).toFixed(2);
                });

                // Convert Sets to Arrays for JSON
                Object.keys(aggregatedData.skillsWeaknesses).forEach(weakness => {
                    aggregatedData.skillsWeaknesses[weakness].skills = Array.from(aggregatedData.skillsWeaknesses[weakness].skills);
                    aggregatedData.skillsWeaknesses[weakness].subjects = Array.from(aggregatedData.skillsWeaknesses[weakness].subjects);
                });

                // Sort weaknesses by frequency
                const sortedWeaknesses = Object.entries(aggregatedData.skillsWeaknesses)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 10); // Top 10 weaknesses

                // Build AI prompt
                const prompt = `You are an educational analyst. Analyze this student's performance data and provide actionable insights.

Student: ${aggregatedData.studentName}
Gender: ${aggregatedData.studentGender} (use pronouns: ${aggregatedData.genderPronoun})
Total Reports: ${aggregatedData.totalReports}
Date Range: ${aggregatedData.dateRange.start} to ${aggregatedData.dateRange.end}

IMPORTANT: When referring to this student, use the appropriate pronouns (${aggregatedData.genderPronoun}).

Average Ratings (out of 5):
- Attention: ${aggregatedData.averageRatings.attention}
- Retention: ${aggregatedData.averageRatings.retention}
- Comprehension: ${aggregatedData.averageRatings.comprehension}
- Behavior: ${aggregatedData.averageRatings.behavior}
- Handwriting: ${aggregatedData.averageRatings.handwriting}
- Conversation: ${aggregatedData.averageRatings.conversation}

Top Skill Weaknesses (frequency):
${sortedWeaknesses.map(([weakness, data]) => `- ${weakness}: ${data.count} times (in ${data.subjects.join(', ')})`).join('\n')}

Skill Focus Met: ${aggregatedData.skillFocusMet.yes} times YES, ${aggregatedData.skillFocusMet.no} times NO

Subjects Studied: ${Object.keys(aggregatedData.subjects).join(', ')}

${aggregatedData.scoresData ? `
Score Performance Summary:
${Object.entries(aggregatedData.scoresData.categoryStats).map(([key, stats]) => {
    const avgPercentage = (stats.totalPercentage / stats.count).toFixed(1);
    return `- ${stats.label}: ${avgPercentage}% average (appears in ${stats.count}/${aggregatedData.totalReports} reports)`;
}).join('\n')}
` : ''}

Recent Teacher Notes:
${aggregatedData.narrativeSummaries.slice(0, 3).join('\n\n')}

Please provide:
1. Top 3-5 STRENGTHS (what the student excels at)
2. Top 5-7 WEAKNESS PATTERNS (specific recurring issues with context)
3. 5-7 ACTIONABLE RECOMMENDATIONS (specific strategies for improvement)
4. PROGRESS INSIGHTS (overall trend, what's working, what needs attention)

Format your response as JSON:
{
  "strengths": ["strength 1", "strength 2", ...],
  "weaknessPatterns": [
    {"weakness": "name", "frequency": number, "context": "brief explanation"},
    ...
  ],
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "insights": "2-3 sentences about overall progress and key observations",
  "progressTrend": "improving|stable|declining"
}`;

                // Call OpenAI
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert educational analyst specializing in student performance analysis. Provide specific, actionable insights based on data."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                });

                const aiAnalysis = JSON.parse(response.choices[0].message.content);

                // Add raw data for charts
                aiAnalysis.chartData = {
                    ratingsOverTime: aggregatedData.ratingsOverTime,
                    averageRatings: aggregatedData.averageRatings,
                    weaknessFrequency: sortedWeaknesses.map(([name, data]) => ({
                        name,
                        count: data.count
                    })),
                    subjectDistribution: aggregatedData.subjects,
                    skillFocusSuccess: {
                        met: aggregatedData.skillFocusMet.yes,
                        notMet: aggregatedData.skillFocusMet.no
                    },
                    scoresOverTime: aggregatedData.scoresData ? aggregatedData.scoresData.overTime : [],
                    scoresCategoryStats: aggregatedData.scoresData ? aggregatedData.scoresData.categoryStats : {}
                };

                // Add narratives at top level for word cloud
                aiAnalysis.narratives = dedupedReports.map(r => r.Narrative).filter(n => n && n.trim() !== '');

                // Add student gender for lesson prompt generation
                aiAnalysis.studentGender = aggregatedData.studentGender;
                aiAnalysis.genderPronoun = aggregatedData.genderPronoun;

                res.json(aiAnalysis);
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                res.status(500).json({ error: 'Failed to read reports' });
            });
    } catch (error) {
        console.error('Error generating AI analysis:', error);
        res.status(500).json({ error: 'Failed to generate AI analysis' });
    }
});

// Helper function to determine performance level RELATIVE to student's actual enrolled grade
// This compares framework scores (0-100) to determine if student is above/at/below their actual grade level
function determinePerformanceLevel(frameworkScores, actualGrade) {
    // Calculate average framework score (0-100 scale)
    const avgScore = (
        (frameworkScores.balancing || 0) +
        (frameworkScores.nurturing || 0) +
        (frameworkScores.polishing || 0) +
        (frameworkScores.higherminds || 0)
    ) / 4;

    const actualGradeNum = parseInt(actualGrade) || 5; // Default to Grade 5 if not specified

    // Determine performance relative to actual grade
    // CONSERVATIVE thresholds - participation scores don't directly indicate grade-level academic performance
    // 90+ = Above grade level (truly exceptional)
    // 70-89 = At grade level (good participation does NOT mean above-grade academics)
    // 60-69 = Approaching grade level
    // <60 = Needs support
    let performanceLevel, performanceDescription, gradeComparison;

    if (avgScore >= 90) {
        // Only truly exceptional performance shows as above grade
        const performanceGrade = Math.min(actualGradeNum + 1, 12);
        performanceLevel = `Grade ${performanceGrade}`;
        performanceDescription = 'Above Grade Level';
        gradeComparison = 'above';
    } else if (avgScore >= 70) {
        // Good participation = At grade level (NOT above)
        performanceLevel = `Grade ${actualGradeNum}`;
        performanceDescription = 'At Grade Level';
        gradeComparison = 'at';
    } else if (avgScore >= 60) {
        // Developing - still at their grade, just needs support
        performanceLevel = `Grade ${actualGradeNum}`;
        performanceDescription = 'Approaching Grade Level';
        gradeComparison = 'approaching';
    } else {
        // Needs significant support - still at their enrolled grade level
        performanceLevel = `Grade ${actualGradeNum}`;
        performanceDescription = 'Needs Support';
        gradeComparison = 'below';
    }

    // Map to international frameworks based on ACTUAL grade, not inflated performance
    const ibMapping = {
        1: { level: 'PYP 1', sublabel: 'Primary Years Year 1' },
        2: { level: 'PYP 2', sublabel: 'Primary Years Year 2' },
        3: { level: 'PYP 3', sublabel: 'Primary Years Year 3' },
        4: { level: 'PYP 4', sublabel: 'Primary Years Year 4' },
        5: { level: 'PYP 5', sublabel: 'Primary Years Year 5' },
        6: { level: 'MYP 1', sublabel: 'Middle Years Year 1' },
        7: { level: 'MYP 2', sublabel: 'Middle Years Year 2' },
        8: { level: 'MYP 3', sublabel: 'Middle Years Year 3' },
        9: { level: 'MYP 4', sublabel: 'Middle Years Year 4' },
        10: { level: 'MYP 5', sublabel: 'Middle Years Year 5' },
        11: { level: 'DP 1', sublabel: 'Diploma Programme Year 1' },
        12: { level: 'DP 2', sublabel: 'Diploma Programme Year 2' }
    };

    const cambridgeMapping = {
        1: { level: 'Stage 1', sublabel: 'Primary' },
        2: { level: 'Stage 2', sublabel: 'Primary' },
        3: { level: 'Stage 3', sublabel: 'Primary' },
        4: { level: 'Stage 4', sublabel: 'Primary' },
        5: { level: 'Stage 5', sublabel: 'Primary' },
        6: { level: 'Stage 6', sublabel: 'Primary' },
        7: { level: 'Stage 7', sublabel: 'Lower Secondary' },
        8: { level: 'Stage 8', sublabel: 'Lower Secondary' },
        9: { level: 'Stage 9', sublabel: 'Lower Secondary' },
        10: { level: 'IGCSE 1', sublabel: 'Year 10' },
        11: { level: 'IGCSE 2', sublabel: 'Year 11' },
        12: { level: 'A-Level', sublabel: 'Year 12-13' }
    };

    // Use the ACTUAL grade for international benchmarks, not inflated performance
    const ib = ibMapping[actualGradeNum] || ibMapping[5];
    const cambridge = cambridgeMapping[actualGradeNum] || cambridgeMapping[5];
    const uscc = { level: `Grade ${actualGradeNum}`, sublabel: performanceDescription };

    return {
        ib,
        uscc,
        cambridge,
        performanceLevel,
        performanceDescription,
        gradeComparison,
        avgScore: avgScore.toFixed(1),
        actualGrade: actualGradeNum
    };
}

// Legacy function - kept for backward compatibility but now uses the new logic
function determineGradeLevel(overallPerformance, actualGrade = 5) {
    // Convert 0-5 scale to 0-100 for the new function
    const frameworkScores = {
        balancing: overallPerformance * 20,
        nurturing: overallPerformance * 20,
        polishing: overallPerformance * 20,
        higherminds: overallPerformance * 20
    };
    return determinePerformanceLevel(frameworkScores, actualGrade);
}

// Framework AI Analysis endpoint
app.get('/api/framework-ai-analysis', async (req, res) => {
    try {
        const { student, framework } = req.query;

        if (!student || !framework) {
            return res.status(400).json({ error: 'Student and framework data are required' });
        }

        // Parse framework data
        const frameworkData = JSON.parse(framework);

        // Get student gender for proper pronouns
        const studentGender = frameworkData.studentGender || 'Unknown';
        const genderPronoun = studentGender === 'Male' ? 'he/him/his' :
                              studentGender === 'Female' ? 'she/her/her' : 'they/them/their';

        // CRITICAL: Get the student's ACTUAL enrolled grade - this is the baseline
        const actualGrade = frameworkData.actualGrade || 5; // Default to Grade 5 if not specified

        // Calculate performance level RELATIVE to actual grade (not inflated)
        const performanceData = determinePerformanceLevel({
            balancing: frameworkData.balancing || 0,
            nurturing: frameworkData.nurturing || 0,
            polishing: frameworkData.polishing || 0,
            higherminds: frameworkData.higherminds || 0
        }, actualGrade);

        // Store the corrected grade level data
        frameworkData.gradeLevel = performanceData;
        frameworkData.performanceDescription = performanceData.performanceDescription;
        frameworkData.gradeComparison = performanceData.gradeComparison;

        // Extract academic performance data if provided by frontend
        const academicPerf = frameworkData.academicPerformance;

        // Build academic performance section for prompt
        let academicSection = '';
        if (academicPerf && academicPerf.components) {
            academicSection = `
=== ACADEMIC PERFORMANCE INDICATORS (PRIMARY ASSESSMENT) ===
Overall Academic Score: ${academicPerf.academicScore}/100
Performance Level: ${academicPerf.performanceDescription}

Component Breakdown:
1. Reading Level (30% weight): ${academicPerf.components.readingLevel.score}/100
   - Average Reading Level: ${academicPerf.components.readingLevel.avgLevel}
   - Expected for Grade ${actualGrade}: Grade ${actualGrade}
   - Data points: ${academicPerf.components.readingLevel.dataPoints} reports

2. Words Per Minute (25% weight): ${academicPerf.components.wpm.score}/100
   - Average WPM: ${academicPerf.components.wpm.avgWPM}
   - Expected for Grade ${actualGrade}: ${academicPerf.components.wpm.benchmark ? academicPerf.components.wpm.benchmark.expected : 'N/A'} WPM
   - Minimum for Grade ${actualGrade}: ${academicPerf.components.wpm.benchmark ? academicPerf.components.wpm.benchmark.min : 'N/A'} WPM
   - Data points: ${academicPerf.components.wpm.dataPoints} reports

3. Test Scores (25% weight): ${academicPerf.components.testScores.score}/100
   - Average Score: ${academicPerf.components.testScores.avgScore}
   - Data points: ${academicPerf.components.testScores.dataPoints} assessments

4. Skill Focus Met Rate (10% weight): ${academicPerf.components.skillFocusMet.score}/100
   - Met ${academicPerf.components.skillFocusMet.met} out of ${academicPerf.components.skillFocusMet.total} sessions

5. Classroom Participation (10% weight): ${academicPerf.components.participation.score}/100
   - This is from the framework scores (Attention, Retention, etc.)
`;
        }

        const prompt = `You are an educational development specialist analyzing a student's performance data.

STUDENT: ${student}
GENDER: ${studentGender} (use pronouns: ${genderPronoun})
ENROLLED GRADE: Grade ${actualGrade}
${academicPerf ? `ACADEMIC PERFORMANCE: ${academicPerf.performanceDescription} (Score: ${academicPerf.academicScore}/100)` : `PERFORMANCE STATUS: ${performanceData.performanceDescription}`}

IMPORTANT: When referring to this student, use the appropriate pronouns (${genderPronoun}).
${academicSection}

=== CLASSROOM PARTICIPATION SCORES (SECONDARY - 10% of overall) ===
- Balancing (Weaving): ${frameworkData.balancing}/100 - Input-Output balance (Attention + Retention)
- Nurturing: ${frameworkData.nurturing}/100 - Logical explanation ability (Comprehension + Conversation)
- Polishing: ${frameworkData.polishing}/100 - Quality & creativity (Handwriting + Test Scores + Skill Focus Met)
- Higher-minds: ${frameworkData.higherminds}/100 - Metacognition (Behavior & self-regulation)

=== INTERPRETATION GUIDE ===
Academic Score Thresholds:
- 85+ = Above grade level (reading/WPM/tests all exceed Grade ${actualGrade} expectations)
- 70-84 = At grade level (meeting Grade ${actualGrade} expectations)
- 55-69 = Approaching grade level (some gaps in Grade ${actualGrade} skills)
- Below 55 = Below grade level (significant gaps requiring intervention)

STUDENT'S CURRENT STATUS: ${academicPerf ? academicPerf.performanceDescription : performanceData.performanceDescription}
${academicPerf ? `Based on ACTUAL academic indicators (reading level, WPM, test scores), this student is performing ${academicPerf.gradeComparison === 'above' ? 'ABOVE' : academicPerf.gradeComparison === 'at' ? 'AT' : academicPerf.gradeComparison === 'approaching' ? 'SLIGHTLY BELOW' : 'BELOW'} Grade ${actualGrade} expectations.` : ''}

CRITICAL INSTRUCTIONS:
- Use the ACADEMIC PERFORMANCE INDICATORS as your primary assessment (if available)
- Classroom participation scores are SECONDARY - good attention doesn't mean above-grade academics
- ALL analysis must be relative to Grade ${actualGrade} expectations
- DO NOT inflate or exaggerate performance levels
- If Reading Level is below Grade ${actualGrade}, the student is NOT "above grade level" regardless of participation
- If WPM is below the expected benchmark, acknowledge this gap
- Be realistic and honest about where the student stands
- Recommendations should target the WEAKEST academic components first

Please provide a comprehensive analysis with FOUR sections:

1. FRAMEWORK INTERPRETATION:
   - Explain what these scores reveal about the student's developmental profile FOR A GRADE ${actualGrade} STUDENT
   - Current status: ${performanceData.performanceDescription} - explain what this means practically
   - How do the four dimensions interact? What does the pattern suggest about their learning style?
   - Be honest: if scores are in the 60s, they need support - don't sugarcoat it

2. DEVELOPMENTAL STRENGTHS:
   - Identify which framework dimensions show relative strength (highest scores)
   - Explain what these strengths enable the student to do AT THEIR GRADE ${actualGrade} LEVEL
   - Be realistic - a score of 70 is "meeting expectations", not "exceptional"
   - Only describe as "above grade level" if scores are 80+

3. GROWTH OPPORTUNITIES:
   - Identify which dimensions need the most development (lowest scores)
   - Be specific about what skills need work for a Grade ${actualGrade} student
   - How might these gaps affect their academic progress?
   - Prioritize: what's most critical to address first?

4. TARGETED INTERVENTIONS:
   - Provide 3-4 specific, actionable recommendations appropriate for Grade ${actualGrade}
   - Each recommendation should:
     * Target a specific framework dimension with the lowest score
     * Include concrete strategies a Grade ${actualGrade} student can actually do
     * Be achievable within a few weeks, not months
     * Focus on foundational skills appropriate for their grade level
   - DO NOT suggest advanced techniques for a student who needs foundational support

Write in a professional, educator-to-educator tone. Be honest and realistic - avoid inflating the student's performance. A Grade ${actualGrade} student with scores in the 60s needs support, not praise.

Format your response as JSON with this structure:
{
  "interpretation": "2-3 paragraphs...",
  "strengths": "2-3 paragraphs...",
  "growth": "2-3 paragraphs...",
  "interventions": "2-3 paragraphs with 3-4 numbered interventions..."
}`;

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `You are an educational development specialist for the ICAN STELLAR program. CRITICAL: Always base your analysis on the student's ACTUAL enrolled grade level. Do NOT inflate performance assessments. A score of 65-75 means "developing/approaching grade level" - NOT "excelling". Be honest and realistic in your assessments. Recommendations must be grade-appropriate and achievable.` },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7
        });

        const analysis = JSON.parse(completion.choices[0].message.content);

        res.json({
            student,
            framework: frameworkData,
            performanceLevel: performanceData.performanceLevel,
            performanceDescription: performanceData.performanceDescription,
            gradeComparison: performanceData.gradeComparison,
            actualGrade: actualGrade,
            avgScore: performanceData.avgScore,
            analysis
        });

    } catch (error) {
        console.error('Error generating framework AI analysis:', error);
        res.status(500).json({ error: 'Failed to generate framework AI analysis' });
    }
});

// ============================================
// STUDENT PERSONA FEATURE - Subject Categories
// ============================================

const SUBJECT_CATEGORIES = {
  'language_arts': {
    keywords: ['reading', 'vocab', 'vocabulary', 'book club', 'fiction', 'literature', 'grammar', 'phonics', 'spelling'],
    name: 'Language Arts',
    icon: '📚'
  },
  'writing': {
    keywords: ['essay', 'writing', 'creative writing', 'composition', 'journal'],
    name: 'Writing & Composition',
    icon: '✍️'
  },
  'stem': {
    keywords: ['math', 'science', 'stem', 'physics', 'chemistry', 'biology', 'algebra', 'geometry', 'calculus'],
    name: 'STEM',
    icon: '🔬'
  },
  'social_sciences': {
    keywords: ['social', 'history', 'geography', 'civics', 'economics', 'trinity', 'current events'],
    name: 'Social Sciences',
    icon: '🌍'
  },
  'media_communication': {
    keywords: ['ted', 'documentary', 'video', 'presentation', 'speech', 'debate', 'public speaking'],
    name: 'Media & Communication',
    icon: '🎬'
  },
  'arts': {
    keywords: ['art', 'music', 'drama', 'theater', 'dance', 'creative'],
    name: 'Arts',
    icon: '🎨'
  }
};

// ============================================
// STUDENT PERSONA FEATURE - Career Mappings
// ============================================

const CAREER_MAPPINGS = {
  language_arts: [
    { title: 'AI Language Model Trainer', field: 'AI & Technology', skills: ['Linguistic expertise', 'Pattern recognition', 'Cultural nuance understanding'] },
    { title: 'Cross-Cultural AI Communication Specialist', field: 'Global Tech', skills: ['Multilingual fluency', 'AI systems knowledge', 'Cultural bridge-building'] },
    { title: 'Neural Translation Architect', field: 'Language Tech', skills: ['Deep learning concepts', 'Linguistic analysis', 'Real-time processing'] },
    { title: 'Digital Heritage Preservationist', field: 'Cultural Tech', skills: ['Archival expertise', 'Language documentation', 'VR/AR integration'] },
    { title: 'Human-AI Communication Designer', field: 'UX & AI', skills: ['Conversational design', 'Empathy mapping', 'Natural language processing'] },
    { title: 'Personalized Learning Architect', field: 'EdTech', skills: ['Adaptive curriculum design', 'Learning analytics', 'Neuroscience basics'] },
    { title: 'Virtual World Linguist', field: 'Metaverse', skills: ['World-building language', 'Digital culture creation', 'Immersive storytelling'] },
    { title: 'Cognitive Accessibility Designer', field: 'Inclusive Tech', skills: ['Neurodiversity understanding', 'Adaptive communication', 'Assistive AI'] },
    { title: 'Global Content Localization Strategist', field: 'International Media', skills: ['Cultural adaptation', 'Market analysis', 'AI-assisted translation'] },
    { title: 'Voice Interface Personality Designer', field: 'Voice Tech', skills: ['Character development', 'Emotional intelligence', 'Speech pattern design'] },
    { title: 'Synthetic Media Ethicist', field: 'AI Ethics', skills: ['Critical analysis', 'Policy knowledge', 'Communication ethics'] },
    { title: 'Knowledge Graph Curator', field: 'Information Systems', skills: ['Semantic analysis', 'Data organization', 'Ontology design'] }
  ],
  writing: [
    { title: 'AI-Human Co-Author', field: 'Creative Tech', skills: ['Creative direction', 'AI prompt engineering', 'Narrative integration'] },
    { title: 'Interactive Narrative Designer', field: 'Immersive Media', skills: ['Branching storylines', 'User psychology', 'Adaptive writing'] },
    { title: 'Synthetic Content Authenticator', field: 'Digital Trust', skills: ['Deepfake detection', 'Content verification', 'Digital forensics'] },
    { title: 'Metaverse Experience Writer', field: 'Virtual Worlds', skills: ['Spatial storytelling', '3D narrative design', 'Immersive dialogue'] },
    { title: 'AI Ethics & Policy Writer', field: 'Tech Policy', skills: ['Technical understanding', 'Policy writing', 'Ethical frameworks'] },
    { title: 'Personalized Content Strategist', field: 'Adaptive Media', skills: ['User data analysis', 'Dynamic content creation', 'Personalization algorithms'] },
    { title: 'Quantum Computing Documentation Specialist', field: 'Quantum Tech', skills: ['Complex concept simplification', 'Technical writing', 'Scientific literacy'] },
    { title: 'Climate Communication Specialist', field: 'Sustainability', skills: ['Scientific translation', 'Persuasive writing', 'Data visualization narratives'] },
    { title: 'Biotech Communications Director', field: 'Life Sciences', skills: ['Scientific literacy', 'Public engagement', 'Regulatory communication'] },
    { title: 'Neural Interface Content Creator', field: 'BCI Tech', skills: ['Sensory writing', 'Cognitive experience design', 'Multi-modal storytelling'] },
    { title: 'Digital Legacy Planner', field: 'Personal Tech', skills: ['Life documentation', 'Digital archiving', 'Memory preservation'] },
    { title: 'Space Mission Communications Lead', field: 'Space Industry', skills: ['Technical storytelling', 'Public engagement', 'Crisis communication'] }
  ],
  stem: [
    { title: 'Quantum Algorithm Developer', field: 'Quantum Computing', skills: ['Quantum mechanics', 'Algorithm design', 'Complex problem-solving'] },
    { title: 'AGI Safety Researcher', field: 'AI Safety', skills: ['Machine learning', 'Ethics', 'Systems thinking'] },
    { title: 'Synthetic Biology Engineer', field: 'Biotech', skills: ['Genetic engineering', 'Bioinformatics', 'Lab automation'] },
    { title: 'Space Habitat Engineer', field: 'Space Industry', skills: ['Life support systems', 'Materials science', 'Closed-loop engineering'] },
    { title: 'Neural Interface Developer', field: 'BCI Technology', skills: ['Neuroscience', 'Hardware engineering', 'Signal processing'] },
    { title: 'Climate Restoration Engineer', field: 'Climate Tech', skills: ['Environmental science', 'Carbon capture tech', 'Ecosystem modeling'] },
    { title: 'Longevity Biotechnologist', field: 'Anti-Aging Research', skills: ['Cellular biology', 'Gene therapy', 'Clinical trials'] },
    { title: 'Autonomous Systems Architect', field: 'Robotics', skills: ['AI integration', 'Safety systems', 'Sensor fusion'] },
    { title: 'Fusion Energy Engineer', field: 'Clean Energy', skills: ['Plasma physics', 'Magnetic confinement', 'Power systems'] },
    { title: 'Precision Medicine Geneticist', field: 'Healthcare', skills: ['Genomics', 'Data analysis', 'Personalized treatment design'] },
    { title: 'Asteroid Mining Engineer', field: 'Space Resources', skills: ['Extraction technology', 'Remote operations', 'Materials processing'] },
    { title: 'Digital Twin Architect', field: 'Simulation Tech', skills: ['Systems modeling', 'Real-time data integration', 'Predictive analytics'] },
    { title: 'Cybersecurity AI Specialist', field: 'Security', skills: ['Threat modeling', 'AI defense systems', 'Zero-trust architecture'] },
    { title: 'Vertical Farming Systems Engineer', field: 'AgriTech', skills: ['Hydroponics', 'Automation', 'Sustainable agriculture'] },
    { title: 'Human Augmentation Specialist', field: 'BioTech', skills: ['Prosthetics design', 'Biocompatible materials', 'Neural integration'] }
  ],
  social_sciences: [
    { title: 'AI Ethics Governance Officer', field: 'Tech Policy', skills: ['Ethical frameworks', 'Stakeholder management', 'Policy development'] },
    { title: 'Digital Society Researcher', field: 'Social Tech', skills: ['Behavioral analysis', 'Platform dynamics', 'Digital anthropology'] },
    { title: 'Human-Robot Interaction Psychologist', field: 'Robotics & Psychology', skills: ['Behavioral psychology', 'Trust dynamics', 'Social robotics'] },
    { title: 'Climate Migration Policy Analyst', field: 'Environmental Policy', skills: ['Geopolitics', 'Climate modeling', 'Humanitarian systems'] },
    { title: 'Algorithmic Fairness Auditor', field: 'Tech Accountability', skills: ['Statistical analysis', 'Bias detection', 'Social justice frameworks'] },
    { title: 'Virtual Economy Regulator', field: 'Digital Governance', skills: ['Cryptocurrency knowledge', 'Economic theory', 'International regulation'] },
    { title: 'Neurorights Advocate', field: 'Digital Rights', skills: ['Neuroscience literacy', 'Human rights law', 'Privacy advocacy'] },
    { title: 'Space Law Attorney', field: 'Space Governance', skills: ['International law', 'Treaty negotiation', 'Resource rights'] },
    { title: 'Longevity Society Planner', field: 'Future Planning', skills: ['Demographics', 'Social systems design', 'Healthcare economics'] },
    { title: 'Cross-Reality Community Manager', field: 'Metaverse Governance', skills: ['Community building', 'Conflict resolution', 'Platform moderation'] },
    { title: 'Genetic Privacy Counselor', field: 'Bioethics', skills: ['Genetics literacy', 'Privacy law', 'Family counseling'] },
    { title: 'Universal Basic Income Administrator', field: 'Social Policy', skills: ['Economic modeling', 'Social welfare systems', 'Implementation logistics'] }
  ],
  media_communication: [
    { title: 'Holographic Experience Producer', field: 'Immersive Media', skills: ['3D production', 'Spatial audio', 'Audience engagement'] },
    { title: 'AI-Generated Content Curator', field: 'Digital Media', skills: ['Content quality assessment', 'Trend analysis', 'Audience matching'] },
    { title: 'Virtual Influencer Manager', field: 'Digital Marketing', skills: ['AI persona management', 'Brand partnerships', 'Audience analytics'] },
    { title: 'Deepfake Detection Journalist', field: 'Truth & Media', skills: ['Digital forensics', 'Investigative techniques', 'Media literacy'] },
    { title: 'Immersive Documentary Creator', field: 'VR/AR Media', skills: ['360° storytelling', 'Empathy-driven design', 'Technical production'] },
    { title: 'Neural Marketing Strategist', field: 'NeuroTech Marketing', skills: ['Consumer neuroscience', 'Ethical marketing', 'Biometric analysis'] },
    { title: 'Metaverse Event Architect', field: 'Virtual Events', skills: ['Virtual venue design', 'Cross-platform coordination', 'Hybrid experiences'] },
    { title: 'Personal AI Brand Consultant', field: 'Personal Branding', skills: ['AI avatar creation', 'Digital identity management', 'Platform strategy'] },
    { title: 'Space Tourism Marketing Director', field: 'Space Industry', skills: ['Experiential marketing', 'High-value client relations', 'Adventure branding'] },
    { title: 'Synthetic Media Producer', field: 'AI Entertainment', skills: ['AI content generation', 'Quality control', 'Ethical production'] },
    { title: 'Real-Time Translation Broadcaster', field: 'Global Media', skills: ['Multilingual presentation', 'AI tool mastery', 'Cross-cultural communication'] },
    { title: 'Attention Economy Ethicist', field: 'Media Ethics', skills: ['Behavioral design critique', 'Platform accountability', 'User wellbeing advocacy'] }
  ],
  arts: [
    { title: 'AI Art Director', field: 'Creative AI', skills: ['Generative AI mastery', 'Aesthetic curation', 'Human-AI collaboration'] },
    { title: 'Virtual World Designer', field: 'Metaverse', skills: ['3D environment creation', 'User experience', 'Digital architecture'] },
    { title: 'Haptic Experience Designer', field: 'Sensory Tech', skills: ['Touch feedback design', 'Multi-sensory integration', 'Physical computing'] },
    { title: 'Generative Fashion Designer', field: 'FashionTech', skills: ['AI design tools', 'Sustainable materials', 'Digital-to-physical production'] },
    { title: 'Biometric Art Creator', field: 'BioArt', skills: ['Biological materials', 'Living systems art', 'Ethical bioart practices'] },
    { title: 'Spatial Computing Artist', field: 'AR/VR Art', skills: ['Mixed reality creation', 'Interactive installations', 'Embodied experience design'] },
    { title: 'Digital Fashion Architect', field: 'Virtual Fashion', skills: ['3D garment design', 'NFT creation', 'Avatar styling'] },
    { title: 'Emotion-Responsive Environment Designer', field: 'Adaptive Spaces', skills: ['Biometric integration', 'Ambient computing', 'Mood-responsive design'] },
    { title: 'Neural Art Therapist', field: 'Mental Health Tech', skills: ['Art therapy', 'BCI integration', 'Therapeutic experience design'] },
    { title: 'Procedural World Artist', field: 'Gaming & Simulation', skills: ['Algorithmic design', 'Infinite content creation', 'Style consistency'] },
    { title: 'Sensory Augmentation Designer', field: 'Human Enhancement', skills: ['Synesthesia design', 'Perception expansion', 'Assistive creativity'] },
    { title: 'Cultural Heritage Reconstructionist', field: 'Digital Preservation', skills: ['Historical research', '3D reconstruction', 'VR archaeology'] }
  ],
  business: [
    { title: 'AI Transformation Strategist', field: 'Business Consulting', skills: ['AI implementation', 'Change management', 'Workforce transition'] },
    { title: 'Decentralized Organization Architect', field: 'Web3 Business', skills: ['DAO governance', 'Token economics', 'Community building'] },
    { title: 'Circular Economy Consultant', field: 'Sustainability', skills: ['Waste elimination', 'Supply chain redesign', 'Regenerative business models'] },
    { title: 'Human-AI Workforce Coordinator', field: 'Future of Work', skills: ['Task allocation', 'AI capability assessment', 'Human skill development'] },
    { title: 'Space Commerce Specialist', field: 'Space Industry', skills: ['Microgravity manufacturing', 'Orbital logistics', 'Space law compliance'] },
    { title: 'Algorithmic Business Auditor', field: 'Tech Compliance', skills: ['AI decision auditing', 'Transparency reporting', 'Regulatory compliance'] },
    { title: 'Carbon Credit Portfolio Manager', field: 'Climate Finance', skills: ['Carbon markets', 'Sustainability metrics', 'Impact verification'] },
    { title: 'Quantum-Ready Business Strategist', field: 'Future Tech', skills: ['Quantum computing implications', 'Cryptography transition', 'Competitive analysis'] },
    { title: 'Personal Data Broker', field: 'Data Economy', skills: ['Privacy-preserving tech', 'Data monetization', 'Consent management'] },
    { title: 'Autonomous Fleet Manager', field: 'Transportation', skills: ['Self-driving logistics', 'Route optimization', 'Regulatory navigation'] }
  ],
  trades: [
    { title: 'Robotics Maintenance Technician', field: 'Automation', skills: ['Robot repair', 'Preventive maintenance', 'AI diagnostics interpretation'] },
    { title: 'Vertical Farm Technician', field: 'AgriTech', skills: ['Hydroponic systems', 'LED optimization', 'Automated harvest management'] },
    { title: 'Electric Aviation Mechanic', field: 'Green Aviation', skills: ['Battery systems', 'Electric motors', 'eVTOL maintenance'] },
    { title: 'Smart Building Systems Specialist', field: 'PropTech', skills: ['IoT integration', 'Energy optimization', 'Building automation'] },
    { title: 'Drone Fleet Operator', field: 'Aerial Services', skills: ['Multi-drone coordination', 'Airspace management', 'Delivery logistics'] },
    { title: '3D Printing Fabricator', field: 'Manufacturing', skills: ['Additive manufacturing', 'Material science', 'Design interpretation'] },
    { title: 'EV Charging Infrastructure Installer', field: 'Clean Energy', skills: ['High-voltage systems', 'Grid integration', 'Smart charging networks'] },
    { title: 'Home Automation Integrator', field: 'Smart Home', skills: ['IoT ecosystems', 'Voice assistant setup', 'Security integration'] },
    { title: 'Renewable Energy System Installer', field: 'Clean Energy', skills: ['Solar/wind installation', 'Battery storage', 'Grid connection'] },
    { title: 'Lab-Grown Meat Production Technician', field: 'Food Tech', skills: ['Cell culture', 'Bioreactor operation', 'Food safety'] }
  ],
  public_service: [
    { title: 'AI-Assisted Emergency Responder', field: 'Public Safety', skills: ['AI tool operation', 'Rapid decision-making', 'Tech-enhanced rescue'] },
    { title: 'Cyber Threat Response Specialist', field: 'Digital Security', skills: ['Incident response', 'Digital forensics', 'Critical infrastructure protection'] },
    { title: 'Climate Resilience Coordinator', field: 'Disaster Management', skills: ['Climate adaptation', 'Community preparedness', 'Resource allocation'] },
    { title: 'Digital Public Services Designer', field: 'GovTech', skills: ['Citizen experience', 'Accessible design', 'E-government systems'] },
    { title: 'Mental Health AI Support Specialist', field: 'Healthcare', skills: ['AI therapy tools', 'Crisis intervention', 'Digital wellness'] },
    { title: 'Algorithmic Accountability Officer', field: 'Government Oversight', skills: ['AI auditing', 'Public interest advocacy', 'Technical policy'] },
    { title: 'Smart City Systems Manager', field: 'Urban Tech', skills: ['IoT city infrastructure', 'Data-driven governance', 'Citizen privacy'] },
    { title: 'Space Traffic Controller', field: 'Space Operations', skills: ['Orbital mechanics', 'Collision avoidance', 'Multi-agency coordination'] },
    { title: 'Universal Healthcare Navigator', field: 'Healthcare Access', skills: ['Health system literacy', 'Patient advocacy', 'Digital health tools'] },
    { title: 'Autonomous Vehicle Safety Inspector', field: 'Transportation Safety', skills: ['AV systems knowledge', 'Safety protocols', 'Incident investigation'] }
  ]
};

// ============================================
// STUDENT PERSONA FEATURE - Learning Profiles
// ============================================

const LEARNING_PROFILES = {
  engaged_communicator: {
    id: 'engaged_communicator',
    name: 'Engaged Communicator',
    emoji: '💬',
    description: 'Thrives in discussion-based learning. Excellent at verbal expression and understanding complex concepts through dialogue.',
    primaryMetrics: ['conversation', 'comprehension'],
    traits: ['Articulate', 'Collaborative', 'Empathetic', 'Quick-thinking'],
    idealEnvironment: 'Group discussions, debates, presentations, peer learning',
    careerStrengths: ['Public speaking', 'Team collaboration', 'Client relations', 'Teaching']
  },
  disciplined_executor: {
    id: 'disciplined_executor',
    name: 'Disciplined Executor',
    emoji: '🎯',
    description: 'Self-motivated with excellent focus. Excels in structured environments with clear goals and expectations.',
    primaryMetrics: ['attention', 'behavior'],
    traits: ['Focused', 'Reliable', 'Goal-oriented', 'Self-regulated'],
    idealEnvironment: 'Independent study, structured tasks, clear objectives',
    careerStrengths: ['Project management', 'Deadline-driven work', 'Quality control', 'Operations']
  },
  meticulous_documenter: {
    id: 'meticulous_documenter',
    name: 'Meticulous Documenter',
    emoji: '📝',
    description: 'Detail-oriented learner with strong memory. Produces high-quality written work and retains information well.',
    primaryMetrics: ['handwriting', 'retention'],
    traits: ['Precise', 'Organized', 'Thorough', 'Patient'],
    idealEnvironment: 'Note-taking, written assignments, research projects',
    careerStrengths: ['Documentation', 'Research', 'Data entry', 'Archival work']
  },
  analytical_absorber: {
    id: 'analytical_absorber',
    name: 'Analytical Absorber',
    emoji: '🧠',
    description: 'Deep thinker who processes and retains complex information. Strong at understanding underlying concepts.',
    primaryMetrics: ['retention', 'comprehension'],
    traits: ['Logical', 'Curious', 'Systematic', 'Reflective'],
    idealEnvironment: 'Reading, analysis, problem-solving, independent research',
    careerStrengths: ['Data analysis', 'Research', 'Strategy', 'Problem-solving']
  },
  expressive_performer: {
    id: 'expressive_performer',
    name: 'Expressive Performer',
    emoji: '🌟',
    description: 'Creative communicator who brings energy and personality to learning. Strong verbal and written expression.',
    primaryMetrics: ['conversation', 'handwriting'],
    traits: ['Creative', 'Confident', 'Expressive', 'Imaginative'],
    idealEnvironment: 'Creative projects, presentations, storytelling, performance',
    careerStrengths: ['Creative work', 'Performance', 'Content creation', 'Design']
  },
  quiet_reflector: {
    id: 'quiet_reflector',
    name: 'Quiet Reflector',
    emoji: '🔮',
    description: 'Thoughtful observer who learns through careful observation and internal processing. Retains information deeply.',
    primaryMetrics: ['retention', 'behavior'],
    traits: ['Observant', 'Thoughtful', 'Independent', 'Deep-thinking'],
    idealEnvironment: 'Individual work, reading, written reflection, quiet study spaces',
    careerStrengths: ['Research', 'Writing', 'Analysis', 'Backend work']
  },
  active_collaborator: {
    id: 'active_collaborator',
    name: 'Active Collaborator',
    emoji: '🤝',
    description: 'Energized by working with others. Excellent at coordinating group efforts and maintaining positive dynamics.',
    primaryMetrics: ['behavior', 'conversation', 'attention'],
    traits: ['Team-oriented', 'Energetic', 'Inclusive', 'Motivating'],
    idealEnvironment: 'Group projects, team activities, collaborative problem-solving',
    careerStrengths: ['Team leadership', 'Coordination', 'Facilitation', 'HR']
  },
  visual_processor: {
    id: 'visual_processor',
    name: 'Visual Processor',
    emoji: '👁️',
    description: 'Learns best through visual information. Strong at creating and interpreting diagrams, charts, and visual content.',
    primaryMetrics: ['comprehension', 'handwriting'],
    traits: ['Visual-minded', 'Creative', 'Spatial-aware', 'Detail-oriented'],
    idealEnvironment: 'Diagrams, mind maps, visual projects, graphic organizers',
    careerStrengths: ['Design', 'Data visualization', 'Architecture', 'Visual arts']
  },
  kinesthetic_learner: {
    id: 'kinesthetic_learner',
    name: 'Hands-On Learner',
    emoji: '🛠️',
    description: 'Learns best through doing and physical engagement. May find traditional desk work challenging but excels in practical applications.',
    primaryMetrics: ['behavior', 'attention'],
    traits: ['Practical', 'Action-oriented', 'Experimental', 'Physical'],
    idealEnvironment: 'Labs, workshops, hands-on projects, physical activities',
    careerStrengths: ['Technical work', 'Engineering', 'Healthcare', 'Trades']
  },
  steady_achiever: {
    id: 'steady_achiever',
    name: 'Steady Achiever',
    emoji: '🐢',
    description: 'Consistent and reliable learner who makes gradual but steady progress. Values routine and predictability.',
    primaryMetrics: ['behavior', 'retention'],
    traits: ['Consistent', 'Reliable', 'Methodical', 'Persistent'],
    idealEnvironment: 'Structured routines, incremental challenges, clear expectations',
    careerStrengths: ['Administrative work', 'Accounting', 'Quality assurance', 'Process management']
  },
  balanced_achiever: {
    id: 'balanced_achiever',
    name: 'Balanced Achiever',
    emoji: '⭐',
    description: 'Well-rounded learner with consistent performance across all areas. Adapts easily to different learning situations.',
    primaryMetrics: ['all'],
    traits: ['Versatile', 'Adaptable', 'Consistent', 'Well-rounded'],
    idealEnvironment: 'Varied activities, mixed learning approaches',
    careerStrengths: ['Management', 'Consulting', 'Entrepreneurship', 'General leadership']
  },
  emerging_learner: {
    id: 'emerging_learner',
    name: 'Emerging Learner',
    emoji: '🌱',
    description: 'Currently building foundational skills with great potential for growth. Benefits from supportive, encouraging environment.',
    primaryMetrics: ['developing'],
    traits: ['Growing', 'Curious', 'Resilient', 'Open-minded'],
    idealEnvironment: 'Supportive guidance, scaffolded learning, encouragement',
    careerStrengths: ['Entry-level positions', 'Apprenticeships', 'Training programs']
  }
};

// ============================================
// STELLAR PERSONALITY SYSTEM - Constants
// ============================================

const PERSONALITY_DIMENSIONS = {
  EI: {
    code: 'EI',
    name: 'Breadth vs Depth',
    leftPole: { code: 'E', name: 'Wide Learner', description: 'Enjoys variety and breadth of interests' },
    rightPole: { code: 'I', name: 'Deep Learner', description: 'Prefers depth and mastery of specific areas' }
  },
  SC: {
    code: 'SC',
    name: 'Team vs Solo',
    leftPole: { code: 'S', name: 'Team Player', description: 'Energized by collaboration and discussion' },
    rightPole: { code: 'C', name: 'Solo Worker', description: 'Prefers independent, focused work' }
  },
  PT: {
    code: 'PT',
    name: 'Hands-on vs Conceptual',
    leftPole: { code: 'P', name: 'Hands-on', description: 'Learns best through hands-on activities' },
    rightPole: { code: 'T', name: 'Conceptual', description: 'Learns best through concepts and ideas' }
  },
  RN: {
    code: 'RN',
    name: 'Routine vs Adventure',
    leftPole: { code: 'R', name: 'Routine Lover', description: 'Values consistency and predictability' },
    rightPole: { code: 'N', name: 'Adventure Seeker', description: 'Embraces change and new experiences' }
  },
  AD: {
    code: 'AD',
    name: 'Think First vs Act Fast',
    leftPole: { code: 'A', name: 'Careful Thinker', description: 'Deliberate and thorough in decisions' },
    rightPole: { code: 'D', name: 'Quick Decider', description: 'Quick and action-oriented in decisions' }
  },
  LG: {
    code: 'LG',
    name: 'Details vs Big Picture',
    leftPole: { code: 'L', name: 'Detail Focused', description: 'Detail-oriented, focuses on specifics' },
    rightPole: { code: 'G', name: 'Big Picture', description: 'Big-picture thinker, sees patterns' }
  }
};

const PERSONALITY_SCORE_THRESHOLDS = {
  STRONG_LEFT: 35,
  MODERATE_LEFT: 44,
  BALANCED_LOW: 45,
  BALANCED_HIGH: 55,
  MODERATE_RIGHT: 65,
  STRONG_RIGHT: 100
};

const PERSONALITY_WEIGHTS = {
  QUIZ: 0.65,
  INFERRED: 0.35
};

const MIN_REPORTS_FOR_PERSONALITY = 3;

// ============================================
// PERSONA TYPES - Load named learner archetypes
// ============================================
const PERSONA_TYPES_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data/persona-types.json'), 'utf8')
);
const PERSONA_TYPES = PERSONA_TYPES_DATA.types;

const QUIZ_QUESTIONS = [
  {
    number: 1,
    dimension: 'EI',
    text: "When you have free time to learn something new, you prefer to...",
    optionA: { text: "Try out many different topics to see what's interesting", points: -25 },
    optionB: { text: "Pick one topic and learn everything you can about it", points: 25 }
  },
  {
    number: 2,
    dimension: 'EI',
    text: "If you could choose your school schedule, you would...",
    optionA: { text: "Take many different subjects, even if you're not expert in any", points: -25 },
    optionB: { text: "Focus on fewer subjects but become really good at them", points: 25 }
  },
  {
    number: 3,
    dimension: 'SC',
    text: "You understand new ideas better when you...",
    optionA: { text: "Discuss them with classmates or friends", points: -25 },
    optionB: { text: "Think about them quietly by yourself", points: 25 }
  },
  {
    number: 4,
    dimension: 'SC',
    text: "For a big project, you would rather...",
    optionA: { text: "Work with a group and share ideas", points: -25 },
    optionB: { text: "Work alone and create your own vision", points: 25 }
  },
  {
    number: 5,
    dimension: 'PT',
    text: "You find it more exciting to...",
    optionA: { text: "Build, create, or make something with your hands", points: -25 },
    optionB: { text: "Think about ideas, theories, or possibilities", points: 25 }
  },
  {
    number: 6,
    dimension: 'PT',
    text: "When learning about a topic, you prefer...",
    optionA: { text: "Doing experiments or real-world activities", points: -25 },
    optionB: { text: "Reading, watching videos, or hearing explanations", points: 25 }
  },
  {
    number: 7,
    dimension: 'RN',
    text: "You feel most comfortable when...",
    optionA: { text: "You know what to expect and have a clear plan", points: -25 },
    optionB: { text: "Things are new, different, and surprising", points: 25 }
  },
  {
    number: 8,
    dimension: 'RN',
    text: "If your teacher suddenly changed the lesson plan, you would...",
    optionA: { text: "Feel a bit frustrated and prefer sticking to the plan", points: -25 },
    optionB: { text: "Feel excited about trying something different", points: 25 }
  },
  {
    number: 9,
    dimension: 'AD',
    text: "When making a decision, you usually...",
    optionA: { text: "Think carefully about all options before choosing", points: -25 },
    optionB: { text: "Go with your gut feeling and decide quickly", points: 25 }
  },
  {
    number: 10,
    dimension: 'AD',
    text: "When solving a problem, you prefer to...",
    optionA: { text: "Take your time and consider every detail", points: -25 },
    optionB: { text: "Jump in and figure it out as you go", points: 25 }
  },
  {
    number: 11,
    dimension: 'LG',
    text: "When reading instructions, you usually...",
    optionA: { text: "Follow each step carefully, one at a time", points: -25 },
    optionB: { text: "Skim to get the big picture, then figure out details", points: 25 }
  },
  {
    number: 12,
    dimension: 'LG',
    text: "You're more interested in understanding...",
    optionA: { text: "How the small parts work in detail", points: -25 },
    optionB: { text: "How everything connects together as a whole", points: 25 }
  }
];

// Career-Personality Mappings for futuristic jobs
const CAREER_PERSONALITY_MAPPINGS = {
  "Quantum Algorithm Developer": {
    field: "Quantum Computing", emergingBy: "2030",
    skills: ["Quantum mechanics", "Algorithm design", "Complex math", "Problem-solving"],
    idealTraits: { EI: 75, SC: 70, PT: 80, RN: 45, AD: 20, LG: 65 },
    traitWeights: { EI: 2, SC: 1, PT: 3, RN: 1, AD: 3, LG: 2 },
    traitFit: {
      EI: { good: "Your deep focus suits mastering quantum mechanics", challenge: "Requires deep specialization in quantum physics" },
      AD: { good: "Your analytical nature ensures rigorous algorithm verification", challenge: "Requires patient, methodical development" }
    }
  },
  "AGI Safety Researcher": {
    field: "AI Safety", emergingBy: "2030",
    skills: ["Machine learning", "Ethics", "Systems thinking", "Risk analysis"],
    idealTraits: { EI: 55, SC: 60, PT: 85, RN: 60, AD: 15, LG: 85 },
    traitWeights: { EI: 1, SC: 2, PT: 2, RN: 2, AD: 3, LG: 3 },
    traitFit: {
      AD: { good: "Your careful analysis is crucial for safety research", challenge: "Must resist pressure to move fast" },
      LG: { good: "Your big-picture thinking sees how AI systems affect society", challenge: "Must understand broad implications" }
    }
  },
  "Synthetic Biology Engineer": {
    field: "Biotechnology", emergingBy: "2028",
    skills: ["Genetic engineering", "Lab techniques", "Bioinformatics", "Research methods"],
    idealTraits: { EI: 60, SC: 50, PT: 35, RN: 55, AD: 35, LG: 50 },
    traitWeights: { EI: 1, SC: 1, PT: 2, RN: 1, AD: 2, LG: 2 },
    traitFit: {
      PT: { good: "Your hands-on approach suits laboratory work", challenge: "Requires comfort with physical lab techniques" }
    }
  },
  "Space Habitat Engineer": {
    field: "Space Industry", emergingBy: "2035",
    skills: ["Life support systems", "Aerospace engineering", "Materials science", "Safety design"],
    idealTraits: { EI: 45, SC: 45, PT: 20, RN: 30, AD: 40, LG: 55 },
    traitWeights: { EI: 1, SC: 1, PT: 3, RN: 2, AD: 2, LG: 2 },
    traitFit: {
      PT: { good: "Your practical skills build life-sustaining systems", challenge: "Must design physical habitat systems" },
      RN: { good: "Your routine orientation ensures reliable operations", challenge: "Life support requires absolute consistency" }
    }
  },
  "Neural Interface Developer": {
    field: "BCI Technology", emergingBy: "2032",
    skills: ["Neuroscience", "Signal processing", "Hardware design", "Software development"],
    idealTraits: { EI: 65, SC: 55, PT: 40, RN: 65, AD: 30, LG: 45 },
    traitWeights: { EI: 2, SC: 1, PT: 2, RN: 2, AD: 2, LG: 1 },
    traitFit: {
      EI: { good: "Your investigative depth suits this specialized field", challenge: "Requires deep neuroscience knowledge" },
      RN: { good: "Your openness to novelty fits this emerging technology", challenge: "Field is rapidly evolving" }
    }
  },
  "Climate Restoration Engineer": {
    field: "Climate Tech", emergingBy: "2028",
    skills: ["Environmental science", "Carbon capture", "Ecosystem modeling", "Sustainable design"],
    idealTraits: { EI: 40, SC: 40, PT: 30, RN: 50, AD: 45, LG: 75 },
    traitWeights: { EI: 1, SC: 1, PT: 2, RN: 1, AD: 1, LG: 3 },
    traitFit: {
      PT: { good: "Your practical focus implements real climate solutions", challenge: "Requires hands-on engineering" },
      LG: { good: "Your big-picture view sees planetary-scale impacts", challenge: "Must think at ecosystem scales" }
    }
  },
  "Human-AI Collaboration Facilitator": {
    field: "Future of Work", emergingBy: "2027",
    skills: ["Team dynamics", "AI literacy", "Communication", "Change management"],
    idealTraits: { EI: 45, SC: 20, PT: 50, RN: 55, AD: 50, LG: 55 },
    traitWeights: { EI: 1, SC: 3, PT: 1, RN: 1, AD: 1, LG: 2 },
    traitFit: {
      SC: { good: "Your social nature is perfect for facilitating human-AI teams", challenge: "Must bridge human and AI communication" }
    }
  },
  "AI Art Director": {
    field: "Creative AI", emergingBy: "2026",
    skills: ["Visual design", "AI tools mastery", "Creative direction", "Brand storytelling"],
    idealTraits: { EI: 40, SC: 45, PT: 50, RN: 75, AD: 65, LG: 70 },
    traitWeights: { EI: 1, SC: 1, PT: 1, RN: 2, AD: 2, LG: 2 },
    traitFit: {
      RN: { good: "Your creativity harnesses AI as a creative tool", challenge: "Must embrace rapidly changing AI capabilities" },
      AD: { good: "Your decisiveness guides AI toward your vision", challenge: "Must make quick creative choices" }
    }
  },
  "Virtual World Designer": {
    field: "Metaverse", emergingBy: "2027",
    skills: ["3D design", "User experience", "World-building", "Interactive storytelling"],
    idealTraits: { EI: 40, SC: 50, PT: 35, RN: 70, AD: 55, LG: 75 },
    traitWeights: { EI: 1, SC: 1, PT: 2, RN: 2, AD: 1, LG: 3 },
    traitFit: {
      PT: { good: "Your practical skills build immersive environments", challenge: "Requires 3D design execution" },
      LG: { good: "Your systems view creates coherent virtual worlds", challenge: "Must maintain world consistency" }
    }
  },
  "AI Ethics Governance Officer": {
    field: "Tech Policy", emergingBy: "2027",
    skills: ["Policy development", "Stakeholder management", "Ethics frameworks", "Tech literacy"],
    idealTraits: { EI: 45, SC: 40, PT: 70, RN: 50, AD: 35, LG: 75 },
    traitWeights: { EI: 1, SC: 2, PT: 2, RN: 1, AD: 2, LG: 3 },
    traitFit: {
      SC: { good: "Your social skills navigate diverse stakeholders", challenge: "Must balance competing interests" },
      LG: { good: "Your big-picture view sees societal AI impacts", challenge: "Must consider broad implications" }
    }
  },
  "Holographic Experience Producer": {
    field: "Immersive Media", emergingBy: "2030",
    skills: ["3D production", "Spatial audio", "Storytelling", "Team leadership"],
    idealTraits: { EI: 40, SC: 40, PT: 35, RN: 75, AD: 60, LG: 70 },
    traitWeights: { EI: 1, SC: 2, PT: 2, RN: 2, AD: 1, LG: 2 },
    traitFit: {
      RN: { good: "Your creativity pioneers holographic storytelling", challenge: "Must adapt to new medium" },
      SC: { good: "Your social skills coordinate production teams", challenge: "Requires team leadership" }
    }
  },
  "Robotics Maintenance Technician": {
    field: "Automation", emergingBy: "2026",
    skills: ["Robot repair", "Diagnostics", "Preventive maintenance", "Technical troubleshooting"],
    idealTraits: { EI: 55, SC: 60, PT: 20, RN: 40, AD: 50, LG: 35 },
    traitWeights: { EI: 1, SC: 1, PT: 3, RN: 2, AD: 1, LG: 2 },
    traitFit: {
      PT: { good: "Your hands-on skills repair complex robotic systems", challenge: "Requires physical technical work" },
      LG: { good: "Your detail focus diagnoses component failures", challenge: "Must trace issues to specific parts" }
    }
  },
  "Digital Twin Architect": {
    field: "Simulation Tech", emergingBy: "2028",
    idealTraits: { EI: 45, SC: 55, PT: 50, RN: 55, AD: 40, LG: 80 },
    traitWeights: { EI: 1, SC: 1, PT: 1, RN: 1, AD: 2, LG: 3 },
    traitFit: {
      LG: { good: "Your systems view creates accurate digital replicas", challenge: "Must model entire systems" },
      AD: { good: "Your analytical approach ensures model accuracy", challenge: "Requires thorough verification" }
    }
  },
  "Smart City Systems Manager": {
    field: "Urban Tech", emergingBy: "2028",
    idealTraits: { EI: 40, SC: 45, PT: 45, RN: 45, AD: 45, LG: 80 },
    traitWeights: { EI: 1, SC: 1, PT: 1, RN: 1, AD: 1, LG: 3 },
    traitFit: {
      LG: { good: "Your systems view manages city-wide infrastructure", challenge: "Must see how all urban systems connect" }
    }
  },
  "Precision Medicine Geneticist": {
    field: "Healthcare", emergingBy: "2028",
    idealTraits: { EI: 65, SC: 45, PT: 60, RN: 50, AD: 25, LG: 55 },
    traitWeights: { EI: 2, SC: 1, PT: 2, RN: 1, AD: 3, LG: 2 },
    traitFit: {
      AD: { good: "Your thorough analysis ensures accurate genetic diagnosis", challenge: "Must be meticulous with patient data" },
      EI: { good: "Your specialized knowledge masters complex genomics", challenge: "Requires deep domain expertise" }
    }
  },
  "AI-Assisted Emergency Responder": {
    field: "Public Safety", emergingBy: "2027",
    skills: ["AI tool operation", "Rapid decision-making", "Tech-enhanced rescue", "Crisis management"],
    idealTraits: { EI: 45, SC: 35, PT: 25, RN: 60, AD: 75, LG: 50 },
    traitWeights: { EI: 1, SC: 2, PT: 2, RN: 1, AD: 3, LG: 1 },
    traitFit: {
      AD: { good: "Your quick decisions save lives in emergencies", challenge: "Must act fast under pressure" },
      SC: { good: "Your teamwork coordinates multi-agency response", challenge: "Requires clear communication" }
    }
  },
  "Metaverse Experience Writer": {
    field: "Virtual Worlds", emergingBy: "2028",
    skills: ["Spatial storytelling", "3D narrative design", "Immersive dialogue", "World-building"],
    idealTraits: { EI: 40, SC: 45, PT: 55, RN: 75, AD: 55, LG: 70 },
    traitWeights: { EI: 1, SC: 1, PT: 1, RN: 2, AD: 1, LG: 2 },
    traitFit: {
      RN: { good: "Your creativity suits immersive world-building", challenge: "Must embrace new storytelling formats" },
      LG: { good: "Your big-picture view creates coherent virtual narratives", challenge: "Must maintain story consistency" }
    }
  },
  "Vertical Farm Technician": {
    field: "AgriTech", emergingBy: "2026",
    skills: ["Hydroponic systems", "LED optimization", "Automated harvest management", "Plant biology"],
    idealTraits: { EI: 50, SC: 55, PT: 25, RN: 35, AD: 50, LG: 45 },
    traitWeights: { EI: 1, SC: 1, PT: 3, RN: 2, AD: 1, LG: 1 },
    traitFit: {
      PT: { good: "Your practical skills tend automated growing systems", challenge: "Requires hands-on plant care" },
      RN: { good: "Your consistency ensures reliable crop production", challenge: "Must maintain regular schedules" }
    }
  }
};

// Personality data storage with file persistence
const PERSONALITY_DATA_PATH = path.join(__dirname, 'data', 'personality-data.json');

// Load personality data from file
function loadPersonalityData() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(PERSONALITY_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(PERSONALITY_DATA_PATH)) {
      const data = fs.readFileSync(PERSONALITY_DATA_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading personality data:', error);
  }
  return {};
}

// Save personality data to file
function savePersonalityData() {
  try {
    const dataDir = path.dirname(PERSONALITY_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(PERSONALITY_DATA_PATH, JSON.stringify(personalityDataStore, null, 2));
  } catch (error) {
    console.error('Error saving personality data:', error);
  }
}

// Initialize from file
let personalityDataStore = loadPersonalityData();

// ============================================
// STELLAR PERSONALITY SYSTEM - Core Functions
// ============================================

function calculateInferredPersonality(reports, metrics, academicOrientation) {
  if (!reports || reports.length < MIN_REPORTS_FOR_PERSONALITY) {
    return null;
  }

  // Analyze subject patterns
  const uniqueSubjects = new Set(reports.map(r => r.subject)).size;
  const totalReports = reports.length;

  // Count subject switches
  let switches = 0;
  const sortedReports = [...reports].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (let i = 1; i < sortedReports.length; i++) {
    if (sortedReports[i].subject !== sortedReports[i-1].subject) {
      switches++;
    }
  }

  // Calculate metric variance over time
  const recentReports = sortedReports.slice(-10);
  const avgMetrics = recentReports.map(r => {
    const vals = [r.attention, r.retention, r.comprehension, r.behavior, r.handwriting, r.conversation].filter(v => v);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const avgMean = avgMetrics.reduce((a, b) => a + b, 0) / avgMetrics.length;
  const variance = avgMetrics.reduce((sum, val) => sum + Math.pow(val - avgMean, 2), 0) / avgMetrics.length;

  // Calculate orientation spread
  let topCategoryWeight = 0;
  let totalWeight = 0;
  if (academicOrientation?.allOrientations) {
    academicOrientation.allOrientations.forEach(cat => {
      if (cat.weight > topCategoryWeight) topCategoryWeight = cat.weight;
      totalWeight += cat.weight;
    });
  }
  const concentration = totalWeight > 0 ? topCategoryWeight / totalWeight : 0.5;

  // Infer EI: Explorer (0) vs Investigator (100)
  const varietyRatio = uniqueSubjects / Math.min(totalReports, 20);
  const switchRate = switches / Math.max(totalReports - 1, 1);
  const explorerScore = (varietyRatio * 40) + (switchRate * 30) + ((1 - concentration) * 30);
  const EI = Math.round(Math.max(0, Math.min(100, 100 - (explorerScore * 100))));

  // Infer SC: Social (0) vs Concentrated (100)
  const conversationNorm = (metrics.conversation / 5) * 100;
  const socialBehavior = ((metrics.behavior + metrics.conversation) / 10) * 100;
  const socialScore = (conversationNorm * 0.5) + (socialBehavior * 0.3);
  const concentrationIndicator = ((metrics.retention - metrics.conversation + 5) / 10) * 100;
  const SC = Math.round(Math.max(0, Math.min(100, 100 - socialScore + (concentrationIndicator * 0.2))));

  // Infer PT: Practical (0) vs Theoretical (100)
  const practicalCategories = ['stem', 'trades', 'arts'];
  const theoreticalCategories = ['language_arts', 'social_sciences', 'writing'];
  let practicalWeight = 0, theoreticalWeight = 0;
  academicOrientation?.allOrientations?.forEach(cat => {
    if (practicalCategories.includes(cat.category)) practicalWeight += cat.weight;
    if (theoreticalCategories.includes(cat.category)) theoreticalWeight += cat.weight;
  });
  const ptTotal = (practicalWeight + theoreticalWeight) || 1;
  const categoryScore = (theoreticalWeight / ptTotal) * 100;
  const executionVsConcept = ((metrics.comprehension - metrics.handwriting + 5) / 10) * 100;
  const PT = Math.round(Math.max(0, Math.min(100, (categoryScore * 0.5) + (executionVsConcept * 0.3) + ((metrics.retention / 5) * 20))));

  // Infer RN: Routine (0) vs Novel (100)
  const varianceScore = Math.min(variance * 30, 100);
  const newSubjectsRate = uniqueSubjects / Math.max(totalReports / 5, 1);
  const experimentScore = Math.min(newSubjectsRate * 25, 100);
  const RN = Math.round(Math.max(0, Math.min(100, (varianceScore * 0.6) + (experimentScore * 0.4))));

  // Infer AD: Analytical (0) vs Decisive (100)
  const comprehensionScore = (metrics.comprehension / 5) * 100;
  const retentionScore = (metrics.retention / 5) * 100;
  const analyticalIndicator = (comprehensionScore * 0.4) + (retentionScore * 0.3);
  const actionScore = ((metrics.behavior + metrics.conversation) / 10) * 100;
  const deliberateScore = ((metrics.attention + metrics.retention) / 10) * 100;
  const balanceScore = actionScore - deliberateScore + 50;
  const AD = Math.round(Math.max(0, Math.min(100, 100 - analyticalIndicator + (balanceScore * 0.3))));

  // Infer LG: Local/Detail (0) vs Global/Big Picture (100)
  const handwritingScore = (metrics.handwriting / 5) * 100;
  const localIndicator = handwritingScore * 0.4;
  const globalIndicator = (comprehensionScore * 0.35) + (50 * 0.25);
  const LG = Math.round(Math.max(0, Math.min(100, globalIndicator + (50 - localIndicator * 0.5))));

  // Calculate confidence
  let confidence = 0.5;
  if (totalReports >= 20) confidence += 0.15;
  else if (totalReports >= 10) confidence += 0.1;
  else if (totalReports >= 5) confidence += 0.05;
  if (uniqueSubjects >= 5) confidence += 0.05;
  confidence = Math.min(confidence, 0.7);

  return {
    scores: { EI, SC, PT, RN, AD, LG },
    confidence,
    dataPoints: { reportCount: totalReports, subjectsCount: uniqueSubjects }
  };
}

function calculateQuizScores(answers) {
  const scores = { EI: 50, SC: 50, PT: 50, RN: 50, AD: 50, LG: 50 };

  answers.forEach((answer, index) => {
    const question = QUIZ_QUESTIONS[index];
    if (question) {
      const points = answer === 'A' ? question.optionA.points : question.optionB.points;
      scores[question.dimension] += points;
    }
  });

  // Clamp all scores
  Object.keys(scores).forEach(key => {
    scores[key] = Math.max(0, Math.min(100, scores[key]));
  });

  return scores;
}

function combinePersonalityScores(inferredScores, quizScores) {
  const combined = {};
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  dimensions.forEach(dim => {
    combined[dim] = Math.round(
      (inferredScores[dim] * PERSONALITY_WEIGHTS.INFERRED) +
      (quizScores[dim] * PERSONALITY_WEIGHTS.QUIZ)
    );
    combined[dim] = Math.max(0, Math.min(100, combined[dim]));
  });

  return combined;
}

function generatePersonalityCode(scores) {
  const codeMap = {
    EI: { left: 'E', right: 'I' },
    SC: { left: 'S', right: 'C' },
    PT: { left: 'P', right: 'T' },
    RN: { left: 'R', right: 'N' },
    AD: { left: 'A', right: 'D' },
    LG: { left: 'L', right: 'G' }
  };

  let code = '';
  const details = [];

  Object.entries(codeMap).forEach(([dimension, map]) => {
    const score = scores[dimension];
    let letter, pole, strength;

    if (score <= PERSONALITY_SCORE_THRESHOLDS.STRONG_LEFT) {
      letter = map.left; pole = 'left'; strength = 'strong';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.MODERATE_LEFT) {
      letter = map.left; pole = 'left'; strength = 'moderate';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.BALANCED_HIGH) {
      letter = map.left.toLowerCase(); pole = 'balanced'; strength = 'balanced';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.MODERATE_RIGHT) {
      letter = map.right; pole = 'right'; strength = 'moderate';
    } else {
      letter = map.right; pole = 'right'; strength = 'strong';
    }

    code += letter;
    details.push({
      dimension,
      dimensionName: PERSONALITY_DIMENSIONS[dimension].name,
      score,
      letter,
      pole,
      strength,
      leftLabel: PERSONALITY_DIMENSIONS[dimension].leftPole.name,
      rightLabel: PERSONALITY_DIMENSIONS[dimension].rightPole.name,
      leftDesc: PERSONALITY_DIMENSIONS[dimension].leftPole.description,
      rightDesc: PERSONALITY_DIMENSIONS[dimension].rightPole.description
    });
  });

  return { code, details };
}

function generatePersonalityDescriptions(scores, codeResult) {
  const descriptions = [];

  codeResult.details.forEach(detail => {
    let description;
    if (detail.pole === 'left') {
      description = `You tend to be ${detail.leftLabel.toLowerCase()} - ${detail.leftDesc.toLowerCase()}`;
    } else if (detail.pole === 'right') {
      description = `You tend to be ${detail.rightLabel.toLowerCase()} - ${detail.rightDesc.toLowerCase()}`;
    } else {
      description = `You balance ${detail.leftLabel.toLowerCase()} and ${detail.rightLabel.toLowerCase()} approaches`;
    }
    descriptions.push({
      dimension: detail.dimension,
      name: detail.dimensionName,
      description,
      strength: detail.strength
    });
  });

  return descriptions;
}

function matchPersonaType(scores, confidence) {
  if (!scores) return null;

  // If confidence is too low, return Rising Phoenix
  if (confidence !== undefined && confidence < 0.4) {
    const phoenix = PERSONA_TYPES['rising_phoenix'];
    return {
      primary: { ...phoenix, matchScore: 100 },
      secondary: null,
      tertiary: null,
      lowConfidence: true
    };
  }

  const results = [];
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  Object.values(PERSONA_TYPES).forEach(persona => {
    if (persona.id === 'rising_phoenix') return; // skip fallback from normal matching

    let weightedDistSq = 0;
    let totalWeight = 0;

    dimensions.forEach(dim => {
      const raw = scores[dim];
      const studentScore = (raw != null && !Number.isNaN(raw)) ? raw : 50;
      const archetypeScore = persona.archetypeScores[dim];
      const weight = persona.dominantDimensions.includes(dim) ? 3 : 1;
      const diff = studentScore - archetypeScore;
      weightedDistSq += weight * diff * diff;
      totalWeight += weight;
    });

    const avgDist = Math.sqrt(weightedDistSq / totalWeight);
    const matchScore = Math.max(0, Math.round(100 - avgDist));

    results.push(Object.assign({}, persona, { matchScore }));
  });

  results.sort((a, b) => b.matchScore - a.matchScore);

  return {
    primary: results[0] || null,
    secondary: results[1] || null,
    tertiary: results[2] || null,
    lowConfidence: false
  };
}

function calculateCareerPersonalityMatch(studentScores, careerMapping) {
  let totalScore = 0;
  let totalWeight = 0;
  const fitAnalysis = [];
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  dimensions.forEach(dim => {
    // Default to 50 (neutral) if score is null/undefined/NaN
    let studentScore = studentScores?.[dim];
    if (studentScore === null || studentScore === undefined || Number.isNaN(studentScore)) {
      studentScore = 50;
    }
    let idealScore = careerMapping?.idealTraits?.[dim];
    if (idealScore === null || idealScore === undefined || Number.isNaN(idealScore)) {
      idealScore = 50;
    }
    const weight = careerMapping?.traitWeights?.[dim] || 1;

    const distance = Math.abs(studentScore - idealScore);
    const dimensionMatch = 100 - distance;

    totalScore += dimensionMatch * weight;
    totalWeight += weight;

    const isGoodFit = distance <= 25;
    const isChallenge = distance >= 40;

    fitAnalysis.push({
      dimension: dim,
      studentScore,
      idealScore,
      distance,
      match: dimensionMatch,
      weight,
      isGoodFit,
      isChallenge,
      feedback: isGoodFit
        ? careerMapping.traitFit?.[dim]?.good
        : (isChallenge ? careerMapping.traitFit?.[dim]?.challenge : null)
    });
  });

  let overallMatch = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
  if (Number.isNaN(overallMatch)) overallMatch = 50;
  const strengths = fitAnalysis.filter(f => f.isGoodFit && f.feedback).sort((a, b) => b.weight - a.weight).slice(0, 2);
  const challenges = fitAnalysis.filter(f => f.isChallenge && f.feedback).sort((a, b) => b.weight - a.weight).slice(0, 1);

  return {
    overallMatch,
    fitAnalysis,
    strengths,
    challenges,
    recommendation: overallMatch >= 70 ? 'strong' : (overallMatch >= 50 ? 'moderate' : 'developing')
  };
}

function getPersonalityBasedCareers(personalityScores, academicOrientation, limit = 6) {
  const matches = [];

  Object.entries(CAREER_PERSONALITY_MAPPINGS).forEach(([title, mapping]) => {
    const fitResult = calculateCareerPersonalityMatch(personalityScores, mapping);

    // Academic orientation boost
    let academicBoost = 0;
    if (academicOrientation?.primary?.category) {
      const careerField = mapping.field.toLowerCase();
      const category = academicOrientation.primary.category;
      if (
        (careerField.includes('tech') && category === 'stem') ||
        (careerField.includes('ai') && category === 'stem') ||
        (careerField.includes('creative') && category === 'arts') ||
        (careerField.includes('media') && category === 'media_communication') ||
        (careerField.includes('policy') && category === 'social_sciences')
      ) {
        academicBoost = 5;
      }
    }

    matches.push({
      title,
      field: mapping.field,
      emergingBy: mapping.emergingBy,
      skills: mapping.skills || [],
      matchScore: Math.min(100, fitResult.overallMatch + academicBoost),
      recommendation: fitResult.recommendation,
      personalityFit: {
        strengths: fitResult.strengths.map(s => ({ dimension: s.dimension, feedback: s.feedback })),
        challenges: fitResult.challenges.map(c => ({ dimension: c.dimension, feedback: c.feedback }))
      }
    });
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, limit);
}

// ============================================
// STUDENT PERSONA FEATURE - Analysis Functions
// ============================================

function categorizeSubjectPersona(subjectName) {
  const lowerName = subjectName.toLowerCase();
  for (const [category, config] of Object.entries(SUBJECT_CATEGORIES)) {
    if (config.keywords.some(kw => lowerName.includes(kw))) {
      return category;
    }
  }
  return 'general';
}

function analyzeAcademicOrientation(subjectComparison) {
  if (!subjectComparison || subjectComparison.length === 0) {
    return { primary: null, breakdown: {}, details: [] };
  }

  const categoryScores = {};

  for (const subject of subjectComparison) {
    const category = categorizeSubjectPersona(subject.subject);
    if (!categoryScores[category]) {
      categoryScores[category] = { totalScore: 0, totalReports: 0, subjects: [] };
    }
    categoryScores[category].totalScore += subject.averageRating * subject.reportCount;
    categoryScores[category].totalReports += subject.reportCount;
    categoryScores[category].subjects.push({
      name: subject.subject,
      rating: subject.averageRating,
      reports: subject.reportCount
    });
  }

  const orientations = [];
  for (const [category, data] of Object.entries(categoryScores)) {
    if (category === 'general') continue;
    const avgRating = data.totalReports > 0 ? data.totalScore / data.totalReports : 0;
    const config = SUBJECT_CATEGORIES[category];
    orientations.push({
      category,
      name: config?.name || category,
      icon: config?.icon || '📖',
      avgRating: parseFloat(avgRating.toFixed(2)),
      totalReports: data.totalReports,
      subjects: data.subjects,
      weight: data.totalReports * avgRating
    });
  }

  orientations.sort((a, b) => b.weight - a.weight);

  return {
    primary: orientations[0] || null,
    secondary: orientations[1] || null,
    all: orientations,
    isSpecialized: orientations.length > 0 && orientations[0].weight > (orientations[1]?.weight || 0) * 1.5
  };
}

function analyzeLearningProfile(metrics) {
  const { attention, retention, comprehension, behavior, handwriting, conversation } = metrics;
  const avg = (attention + retention + comprehension + behavior + handwriting + conversation) / 6;

  if (attention >= 4 && retention >= 4 && comprehension >= 4 &&
      behavior >= 4 && handwriting >= 4 && conversation >= 4) {
    return LEARNING_PROFILES.balanced_achiever;
  }

  if (avg < 2.5) {
    return LEARNING_PROFILES.emerging_learner;
  }

  const variance = [attention, retention, comprehension, behavior, handwriting, conversation]
    .map(m => Math.abs(m - avg))
    .reduce((a, b) => a + b, 0) / 6;
  if (variance < 0.4 && behavior >= 3.5 && avg >= 3.0 && avg < 4.0) {
    return LEARNING_PROFILES.steady_achiever;
  }

  const metricPairs = [
    { profile: 'engaged_communicator', metrics: [conversation, comprehension], sum: conversation + comprehension },
    { profile: 'disciplined_executor', metrics: [attention, behavior], sum: attention + behavior },
    { profile: 'meticulous_documenter', metrics: [handwriting, retention], sum: handwriting + retention },
    { profile: 'analytical_absorber', metrics: [retention, comprehension], sum: retention + comprehension },
    { profile: 'expressive_performer', metrics: [conversation, handwriting], sum: conversation + handwriting },
    { profile: 'quiet_reflector', metrics: [retention, behavior], sum: retention + behavior, condition: conversation < 3.5 },
    { profile: 'active_collaborator', metrics: [behavior, conversation, attention], sum: (behavior + conversation + attention) / 1.5, condition: behavior >= 4 && conversation >= 3.5 },
    { profile: 'visual_processor', metrics: [comprehension, handwriting], sum: comprehension + handwriting, condition: handwriting >= 4 && comprehension >= 4 },
    { profile: 'kinesthetic_learner', metrics: [behavior, attention], sum: behavior + attention, condition: handwriting < 3.5 && behavior >= 3.5 }
  ];

  const validPairs = metricPairs.filter(p => p.condition === undefined || p.condition);
  validPairs.sort((a, b) => b.sum - a.sum);

  return LEARNING_PROFILES[validPairs[0].profile];
}

function analyzePersonaPerformanceTier(analytics, chartData) {
  const sfMet = analytics.skillFocusMet || { yes: 0, no: 0 };
  const sfMetRate = sfMet.yes + sfMet.no > 0
    ? (sfMet.yes / (sfMet.yes + sfMet.no)) * 100
    : null;

  let avgTestScore = null;
  const scoreStats = chartData.scoresCategoryStats || {};
  if (Object.keys(scoreStats).length > 0) {
    let totalPercent = 0;
    let count = 0;
    for (const [key, stat] of Object.entries(scoreStats)) {
      if (stat.count > 0) {
        totalPercent += stat.totalPercentage / stat.count;
        count++;
      }
    }
    avgTestScore = count > 0 ? totalPercent / count : null;
  }

  const avgRatings = analytics.averageRatings || {};
  const metricsAvg = ['attention', 'retention', 'comprehension', 'behavior', 'handwriting', 'conversation']
    .map(m => parseFloat(avgRatings[m]) || 0)
    .reduce((a, b) => a + b, 0) / 6;

  const lowestMetric = Math.min(
    parseFloat(avgRatings.attention) || 5,
    parseFloat(avgRatings.retention) || 5,
    parseFloat(avgRatings.comprehension) || 5,
    parseFloat(avgRatings.behavior) || 5,
    parseFloat(avgRatings.handwriting) || 5,
    parseFloat(avgRatings.conversation) || 5
  );

  let tier, tierName, tierColor, honestAssessment;

  if (metricsAvg >= 4.5 && lowestMetric >= 4.2 && (sfMetRate || 0) >= 95) {
    tier = 'exceptional';
    tierName = 'Excellent';
    tierColor = '#10b981';
    honestAssessment = 'Performing at a high level. Continue pushing for mastery in weaker areas.';
  } else if (metricsAvg >= 4.0 && lowestMetric >= 3.5 && (sfMetRate || 0) >= 85) {
    tier = 'solid';
    tierName = 'Solid Progress';
    tierColor = '#3b82f6';
    honestAssessment = 'Good foundation with clear areas for growth. Focus on improving weakest metrics.';
  } else if (metricsAvg >= 3.5 && lowestMetric >= 3.0 && (sfMetRate || 0) >= 70) {
    tier = 'developing';
    tierName = 'Developing';
    tierColor = '#f59e0b';
    honestAssessment = 'Making progress but needs consistent effort. Multiple areas require attention.';
  } else if (metricsAvg >= 3.0) {
    tier = 'emerging';
    tierName = 'Building Foundation';
    tierColor = '#f97316';
    honestAssessment = 'Foundational skills need strengthening. Requires dedicated support and practice.';
  } else {
    tier = 'struggling';
    tierName = 'Needs Intervention';
    tierColor = '#ef4444';
    honestAssessment = 'Significant support needed. Consider additional resources and personalized attention.';
  }

  return {
    tier,
    tierName,
    tierColor,
    honestAssessment,
    skillFocusMetRate: sfMetRate ? parseFloat(sfMetRate.toFixed(1)) : null,
    avgTestScore: avgTestScore ? parseFloat(avgTestScore.toFixed(1)) : null,
    metricsAverage: parseFloat(metricsAvg.toFixed(2)),
    lowestMetric: parseFloat(lowestMetric.toFixed(2)),
    totalSkillsFocused: sfMet.yes + sfMet.no
  };
}

function analyzeSkillProfile(chartData) {
  const strengths = [];
  const weaknesses = [];

  const skillFocus = chartData.skillFocusBreakdown || [];
  for (const skill of skillFocus) {
    if (skill.percentage >= 80 && skill.total >= 2) {
      strengths.push({
        skill: skill.topic,
        subject: skill.subject,
        successRate: skill.percentage,
        instances: skill.total
      });
    }
  }

  const weaknessData = chartData.weaknessFrequency || [];
  for (const w of weaknessData.slice(0, 10)) {
    weaknesses.push({
      skill: w.weakness,
      frequency: w.count,
      trend: w.trend,
      priority: w.priorityScore
    });
  }

  return { strengths, weaknesses };
}

function generateCareerMatches(academicOrientation, learningProfile, performanceTier, skillProfile) {
  const careers = [];
  const seenTitles = new Set();

  const weaknessCount = skillProfile.weaknesses?.length || 0;
  const weaknessAdjustment = Math.min(10, weaknessCount * 2);
  const lowestMetric = performanceTier.lowestMetric || 3;

  const getRealisticScore = (baseScore, avgRating) => {
    let score = 55 + ((avgRating - 3) * 10);
    score -= weaknessAdjustment;
    if (avgRating >= 4.5) score += 5;
    if (lowestMetric < 3.5) score -= 5;
    return Math.max(50, Math.min(78, Math.round(score)));
  };

  if (academicOrientation.primary) {
    const primaryCareers = CAREER_MAPPINGS[academicOrientation.primary.category] || [];
    for (const career of primaryCareers.slice(0, 3)) {
      if (!seenTitles.has(career.title)) {
        const score = getRealisticScore(55, academicOrientation.primary.avgRating);
        careers.push({
          ...career,
          matchReason: `Aligned with ${academicOrientation.primary.name} focus`,
          matchScore: score,
          gapWarning: weaknessCount >= 3 ? 'Address skill weaknesses to improve fit' : null
        });
        seenTitles.add(career.title);
      }
    }
  }

  if (academicOrientation.secondary) {
    const secondaryCareers = CAREER_MAPPINGS[academicOrientation.secondary.category] || [];
    for (const career of secondaryCareers.slice(0, 2)) {
      if (!seenTitles.has(career.title)) {
        const score = getRealisticScore(50, academicOrientation.secondary.avgRating) - 3;
        careers.push({
          ...career,
          matchReason: `Secondary strength in ${academicOrientation.secondary.name}`,
          matchScore: score,
          gapWarning: score < 58 ? 'Would benefit from more focus in this area' : null
        });
        seenTitles.add(career.title);
      }
    }
  }

  const profileCareers = {
    engaged_communicator: [
      { title: 'Human-AI Collaboration Facilitator', field: 'Future of Work', skills: ['Interpersonal intelligence', 'AI communication', 'Team dynamics'] },
      { title: 'Virtual Community Experience Director', field: 'Metaverse', skills: ['Community building', 'Cross-cultural communication', 'Digital empathy'] }
    ],
    disciplined_executor: [
      { title: 'Autonomous Systems Operations Manager', field: 'Robotics', skills: ['Process optimization', 'AI oversight', 'Quality assurance'] },
      { title: 'Space Mission Coordinator', field: 'Space Industry', skills: ['Precision planning', 'Risk management', 'Multi-system coordination'] }
    ],
    meticulous_documenter: [
      { title: 'AI Training Data Curator', field: 'AI Development', skills: ['Data quality assurance', 'Pattern documentation', 'Systematic organization'] },
      { title: 'Digital Compliance Archivist', field: 'Regulatory Tech', skills: ['Record integrity', 'Audit trails', 'Regulatory knowledge'] }
    ],
    analytical_absorber: [
      { title: 'AGI Research Scientist', field: 'AI Research', skills: ['Deep analysis', 'Pattern recognition', 'Theoretical modeling'] },
      { title: 'Quantum Computing Researcher', field: 'Quantum Tech', skills: ['Abstract thinking', 'Complex problem-solving', 'Mathematical analysis'] }
    ],
    expressive_performer: [
      { title: 'Holographic Performance Artist', field: 'Immersive Entertainment', skills: ['Creative expression', 'Technology integration', 'Audience captivation'] },
      { title: 'AI-Collaborative Content Creator', field: 'Creative AI', skills: ['Human-AI synergy', 'Unique voice development', 'Multi-platform presence'] }
    ],
    quiet_reflector: [
      { title: 'Deep Learning Ethics Researcher', field: 'AI Ethics', skills: ['Philosophical analysis', 'Independent research', 'Written communication'] },
      { title: 'Long-term Futures Analyst', field: 'Strategic Foresight', skills: ['Pattern synthesis', 'Scenario modeling', 'Thoughtful documentation'] }
    ],
    active_collaborator: [
      { title: 'Cross-Functional Innovation Lead', field: 'R&D', skills: ['Team orchestration', 'Diverse perspective integration', 'Collaborative problem-solving'] },
      { title: 'Global Remote Team Conductor', field: 'Distributed Work', skills: ['Virtual collaboration', 'Cross-timezone coordination', 'Inclusive facilitation'] }
    ],
    visual_processor: [
      { title: 'Spatial Computing Interface Designer', field: 'AR/VR', skills: ['3D visualization', 'Intuitive design', 'Visual problem-solving'] },
      { title: 'Data Visualization Architect', field: 'Analytics', skills: ['Complex data translation', 'Visual storytelling', 'Interactive design'] }
    ],
    kinesthetic_learner: [
      { title: 'Robotics Integration Specialist', field: 'Automation', skills: ['Hands-on calibration', 'Physical-digital bridging', 'Practical problem-solving'] },
      { title: 'Exoskeleton Training Coordinator', field: 'Human Augmentation', skills: ['Physical adaptation', 'User training', 'Biomechanical understanding'] }
    ],
    steady_achiever: [
      { title: 'AI Quality Assurance Lead', field: 'Tech Quality', skills: ['Consistent evaluation', 'Incremental improvement', 'Reliable testing'] },
      { title: 'Sustainable Systems Maintainer', field: 'Green Tech', skills: ['Long-term thinking', 'Steady optimization', 'Reliable operations'] }
    ],
    balanced_achiever: [
      { title: 'Chief AI Integration Officer', field: 'Executive Leadership', skills: ['Cross-domain knowledge', 'Strategic versatility', 'Adaptive leadership'] },
      { title: 'Future Ventures Founder', field: 'Entrepreneurship', skills: ['Holistic vision', 'Multi-disciplinary thinking', 'Opportunity synthesis'] }
    ],
    emerging_learner: [
      { title: 'Digital Skills Development Trainee', field: 'Career Development', skills: ['Growth mindset', 'Foundational tech literacy', 'Learning agility'] },
      { title: 'Apprentice in Emerging Technologies', field: 'Tech Training', skills: ['Curiosity', 'Guided learning', 'Skill building'] }
    ]
  };

  const profileSpecificCareers = profileCareers[learningProfile.id] || [];
  for (const career of profileSpecificCareers) {
    if (!seenTitles.has(career.title)) {
      careers.push({
        ...career,
        matchReason: `Compatible with ${learningProfile.name} style`,
        matchScore: Math.max(52, 60 - weaknessAdjustment),
        gapWarning: 'Requires domain-specific knowledge development'
      });
      seenTitles.add(career.title);
    }
  }

  careers.sort((a, b) => b.matchScore - a.matchScore);
  return careers.slice(0, 6);
}

function analyzeGaps(metrics, skillProfile, performanceTier) {
  const gaps = [];

  const metricLabels = {
    attention: 'Attention & Focus',
    retention: 'Information Retention',
    comprehension: 'Comprehension',
    behavior: 'Behavior & Self-Regulation',
    handwriting: 'Written Expression',
    conversation: 'Verbal Communication'
  };

  const impacts = {
    attention: 'Affects ability to absorb new information and stay engaged',
    retention: 'Limits long-term learning and knowledge building',
    comprehension: 'Impacts understanding of complex concepts',
    behavior: 'May affect classroom participation and peer relationships',
    handwriting: 'Can impact written assessments and note-taking effectiveness',
    conversation: 'Limits verbal participation and collaborative learning'
  };

  for (const [key, label] of Object.entries(metricLabels)) {
    const value = metrics[key];
    if (value < 4.0) {
      gaps.push({
        area: label,
        currentLevel: value.toFixed(1),
        targetLevel: '4.0+',
        severity: value < 3.0 ? 'critical' : value < 3.5 ? 'significant' : 'moderate',
        impact: impacts[key] || 'Area needs development'
      });
    }
  }

  const severityOrder = { critical: 0, significant: 1, moderate: 2 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const persistentWeaknesses = (skillProfile.weaknesses || [])
    .filter(w => w.trend === 'worsening' || w.frequency >= 5)
    .slice(0, 3)
    .map(w => ({
      area: w.skill,
      severity: w.trend === 'worsening' ? 'significant' : 'moderate',
      impact: `Recurring issue (${w.frequency} occurrences, trend: ${w.trend})`,
      isSkillGap: true
    }));

  return {
    metricGaps: gaps,
    skillGaps: persistentWeaknesses,
    totalGaps: gaps.length + persistentWeaknesses.length,
    overallAssessment: gaps.length === 0 && persistentWeaknesses.length === 0
      ? 'On track - maintain current effort'
      : gaps.length >= 3 || persistentWeaknesses.length >= 2
        ? 'Multiple areas need focused attention'
        : 'Specific areas identified for improvement'
  };
}

function getImprovementTips(metric, gap) {
  const tips = {
    attention: [
      'Practice focused work in 25-minute intervals (Pomodoro technique)',
      'Remove distractions during study time',
      'Use active engagement strategies like note-taking'
    ],
    retention: [
      'Use spaced repetition when reviewing material',
      'Create mind maps to connect concepts',
      'Teach what you learn to others'
    ],
    comprehension: [
      'Ask "why" and "how" questions while learning',
      'Summarize concepts in your own words',
      'Connect new information to what you already know'
    ],
    behavior: [
      'Set personal goals for each class',
      'Practice self-regulation techniques',
      'Develop consistent routines'
    ],
    handwriting: [
      'Practice letter formation with purpose',
      'Use proper posture and grip',
      'Slow down to focus on quality'
    ],
    conversation: [
      'Start by contributing one thought per class',
      'Prepare questions beforehand',
      'Practice explaining ideas to family/friends'
    ]
  };
  return tips[metric]?.slice(0, gap > 1.5 ? 3 : 2) || [];
}

// ============================================
// STUDENT PERSONA API ENDPOINTS
// ============================================

// Get comprehensive student persona analysis
app.get('/api/student-persona/:studentName', async (req, res) => {
  try {
    const studentName = decodeURIComponent(req.params.studentName);

    // Fetch analytics and chart data
    const analyticsUrl = `http://localhost:${port}/api/analytics?student=${encodeURIComponent(studentName)}`;
    const chartUrl = `http://localhost:${port}/api/chart-data?student=${encodeURIComponent(studentName)}`;

    const [analyticsResponse, chartResponse] = await Promise.all([
      fetch(analyticsUrl),
      fetch(chartUrl)
    ]);

    const analytics = await analyticsResponse.json();
    const chartData = await chartResponse.json();

    const metrics = {
      attention: parseFloat(analytics.averageRatings?.attention) || 3,
      retention: parseFloat(analytics.averageRatings?.retention) || 3,
      comprehension: parseFloat(analytics.averageRatings?.comprehension) || 3,
      behavior: parseFloat(analytics.averageRatings?.behavior) || 3,
      handwriting: parseFloat(analytics.averageRatings?.handwriting) || 3,
      conversation: parseFloat(analytics.averageRatings?.conversation) || 3
    };

    const academicOrientation = analyzeAcademicOrientation(chartData.subjectComparison);
    const learningProfile = analyzeLearningProfile(metrics);
    const performanceTier = analyzePersonaPerformanceTier(analytics, chartData);
    const skillProfile = analyzeSkillProfile(chartData);
    const gapsAnalysis = analyzeGaps(metrics, skillProfile, performanceTier);

    // Fetch reports for personality calculation
    const reportsUrl = `http://localhost:${port}/api/reports?student=${encodeURIComponent(studentName)}`;
    const reportsResponse = await fetch(reportsUrl);
    const reports = await reportsResponse.json();

    // Calculate personality profile
    let personalityProfile = null;
    let personalityCareerMatches = [];
    if (reports.length >= MIN_REPORTS_FOR_PERSONALITY) {
      const inferredResult = calculateInferredPersonality(reports, metrics, academicOrientation);
      const quizData = personalityDataStore[studentName]?.quizData || null;

      let finalScores, source, confidence;
      if (quizData && quizData.taken) {
        finalScores = combinePersonalityScores(inferredResult.scores, quizData.scores);
        source = 'combined';
        confidence = Math.min(0.95, inferredResult.confidence + 0.25);
      } else {
        finalScores = inferredResult.scores;
        source = 'inferred';
        confidence = inferredResult.confidence;
      }

      const codeResult = generatePersonalityCode(finalScores);
      const descriptions = generatePersonalityDescriptions(finalScores, codeResult);

      personalityProfile = {
        scores: finalScores,
        code: codeResult.code,
        codeDetails: codeResult.details,
        descriptions,
        source,
        confidence,
        quizTaken: quizData?.taken || false
      };

      // Get personality-based career matches
      personalityCareerMatches = getPersonalityBasedCareers(finalScores, academicOrientation, 6);
    }

    // Match persona type
    const personaType = personalityProfile
      ? matchPersonaType(personalityProfile.scores, personalityProfile.confidence)
      : null;

    // Use personality-based careers if available, otherwise fall back to original
    const careerMatches = personalityCareerMatches.length > 0
      ? personalityCareerMatches
      : generateCareerMatches(academicOrientation, learningProfile, performanceTier, skillProfile);

    const persona = {
      academicOrientation: {
        primary: academicOrientation.primary,
        secondary: academicOrientation.secondary,
        isSpecialized: academicOrientation.isSpecialized,
        allOrientations: academicOrientation.all
      },
      learningProfile: {
        ...learningProfile,
        metricsBreakdown: metrics
      },
      performanceTier,
      skillProfile: {
        strengths: skillProfile.strengths.slice(0, 8),
        weaknesses: skillProfile.weaknesses.slice(0, 5),
        strengthCount: skillProfile.strengths.length,
        weaknessCount: skillProfile.weaknesses.length
      },
      gapsAnalysis,
      careerMatches,
      personalityProfile,
      personaType,
      metrics,
      totalReports: analytics.totalReports,
      subjectsCount: analytics.subjectsCount,
      dateRange: analytics.dateRange
    };

    res.json({ studentName, persona });
  } catch (error) {
    console.error('Error fetching student persona:', error);
    res.status(500).json({ error: 'Failed to fetch student data', details: error.message });
  }
});

// ============================================
// PERSONALITY SYSTEM API ENDPOINTS
// ============================================

// Get quiz questions
app.get('/api/personality/quiz/questions', (req, res) => {
  const questionsForClient = QUIZ_QUESTIONS.map(q => ({
    number: q.number,
    dimension: q.dimension,
    text: q.text,
    optionA: { text: q.optionA.text },
    optionB: { text: q.optionB.text }
  }));

  res.json({
    totalQuestions: questionsForClient.length,
    estimatedTime: '3-5 minutes',
    questions: questionsForClient
  });
});

// Get personality profile for a student
app.get('/api/personality/:studentName', async (req, res) => {
  try {
    const studentName = decodeURIComponent(req.params.studentName);

    // Fetch student data
    const analyticsUrl = `http://localhost:${port}/api/analytics?student=${encodeURIComponent(studentName)}`;
    const chartUrl = `http://localhost:${port}/api/chart-data?student=${encodeURIComponent(studentName)}`;
    const reportsUrl = `http://localhost:${port}/api/reports?student=${encodeURIComponent(studentName)}`;

    const [analyticsResponse, chartResponse, reportsResponse] = await Promise.all([
      fetch(analyticsUrl),
      fetch(chartUrl),
      fetch(reportsUrl)
    ]);

    const analytics = await analyticsResponse.json();
    const chartData = await chartResponse.json();
    const reports = await reportsResponse.json();

    if (reports.length < MIN_REPORTS_FOR_PERSONALITY) {
      return res.json({
        studentName,
        hasProfile: false,
        message: `Need at least ${MIN_REPORTS_FOR_PERSONALITY} reports to generate personality profile`,
        reportCount: reports.length
      });
    }

    const metrics = {
      attention: parseFloat(analytics.averageRatings?.attention) || 3,
      retention: parseFloat(analytics.averageRatings?.retention) || 3,
      comprehension: parseFloat(analytics.averageRatings?.comprehension) || 3,
      behavior: parseFloat(analytics.averageRatings?.behavior) || 3,
      handwriting: parseFloat(analytics.averageRatings?.handwriting) || 3,
      conversation: parseFloat(analytics.averageRatings?.conversation) || 3
    };

    const academicOrientation = analyzeAcademicOrientation(chartData.subjectComparison);

    // Calculate inferred personality
    const inferredResult = calculateInferredPersonality(reports, metrics, academicOrientation);

    // Check for existing quiz data
    const quizData = personalityDataStore[studentName]?.quizData || null;

    // Calculate final scores
    let finalScores, source, confidence;
    if (quizData && quizData.taken) {
      finalScores = combinePersonalityScores(inferredResult.scores, quizData.scores);
      source = 'combined';
      confidence = Math.min(0.95, inferredResult.confidence + 0.25);
    } else {
      finalScores = inferredResult.scores;
      source = 'inferred';
      confidence = inferredResult.confidence;
    }

    // Generate code and descriptions
    const codeResult = generatePersonalityCode(finalScores);
    const descriptions = generatePersonalityDescriptions(finalScores, codeResult);

    // Get personality-based career matches
    const careerMatches = getPersonalityBasedCareers(finalScores, academicOrientation, 6);

    res.json({
      studentName,
      hasProfile: true,
      inferredScores: inferredResult.scores,
      quizData: quizData,
      finalProfile: {
        scores: finalScores,
        code: codeResult.code,
        codeDetails: codeResult.details,
        source,
        confidence,
        generatedAt: new Date().toISOString()
      },
      descriptions,
      careerMatches,
      dataPoints: {
        reportCount: reports.length,
        subjectsCount: new Set(reports.map(r => r.subject)).size
      }
    });

  } catch (error) {
    console.error('Error getting personality profile:', error);
    res.status(500).json({ error: 'Failed to get personality profile', details: error.message });
  }
});

// Submit quiz answers
app.post('/api/personality/quiz/:studentName', async (req, res) => {
  try {
    const studentName = decodeURIComponent(req.params.studentName);
    const { answers } = req.body;

    // Validate answers
    if (!answers || !Array.isArray(answers) || answers.length !== 12) {
      return res.status(400).json({
        error: 'Invalid answers',
        message: 'Must provide exactly 12 answers (A or B)'
      });
    }

    const validAnswers = answers.every(a => a === 'A' || a === 'B');
    if (!validAnswers) {
      return res.status(400).json({
        error: 'Invalid answer format',
        message: 'Each answer must be either "A" or "B"'
      });
    }

    // Calculate quiz scores
    const quizScores = calculateQuizScores(answers);

    // Store quiz data
    if (!personalityDataStore[studentName]) {
      personalityDataStore[studentName] = {};
    }
    personalityDataStore[studentName].quizData = {
      taken: true,
      takenAt: new Date().toISOString(),
      answers,
      scores: quizScores
    };

    // Save to file for persistence
    savePersonalityData();

    // Get inferred scores to combine
    const analyticsUrl = `http://localhost:${port}/api/analytics?student=${encodeURIComponent(studentName)}`;
    const chartUrl = `http://localhost:${port}/api/chart-data?student=${encodeURIComponent(studentName)}`;
    const reportsUrl = `http://localhost:${port}/api/reports?student=${encodeURIComponent(studentName)}`;

    const [analyticsResponse, chartResponse, reportsResponse] = await Promise.all([
      fetch(analyticsUrl),
      fetch(chartUrl),
      fetch(reportsUrl)
    ]);

    const analytics = await analyticsResponse.json();
    const chartData = await chartResponse.json();
    const reports = await reportsResponse.json();

    let finalScores, source, confidence;

    if (reports.length >= MIN_REPORTS_FOR_PERSONALITY) {
      const metrics = {
        attention: parseFloat(analytics.averageRatings?.attention) || 3,
        retention: parseFloat(analytics.averageRatings?.retention) || 3,
        comprehension: parseFloat(analytics.averageRatings?.comprehension) || 3,
        behavior: parseFloat(analytics.averageRatings?.behavior) || 3,
        handwriting: parseFloat(analytics.averageRatings?.handwriting) || 3,
        conversation: parseFloat(analytics.averageRatings?.conversation) || 3
      };
      const academicOrientation = analyzeAcademicOrientation(chartData.subjectComparison);
      const inferredResult = calculateInferredPersonality(reports, metrics, academicOrientation);

      finalScores = combinePersonalityScores(inferredResult.scores, quizScores);
      source = 'combined';
      confidence = Math.min(0.95, inferredResult.confidence + 0.25);
    } else {
      finalScores = quizScores;
      source = 'quiz';
      confidence = 0.75;
    }

    const codeResult = generatePersonalityCode(finalScores);
    const descriptions = generatePersonalityDescriptions(finalScores, codeResult);
    const personaType = matchPersonaType(finalScores, confidence);

    res.json({
      studentName,
      quizScores,
      combinedProfile: {
        scores: finalScores,
        code: codeResult.code,
        codeDetails: codeResult.details,
        source,
        confidence
      },
      descriptions,
      personaType,
      message: 'Quiz completed successfully'
    });

  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to submit quiz', details: error.message });
  }
});

// Get personality dimensions info
app.get('/api/personality/dimensions', (req, res) => {
  res.json(PERSONALITY_DIMENSIONS);
});

// Get all persona types (summary)
app.get('/api/persona-types', (req, res) => {
  const summaries = Object.values(PERSONA_TYPES).map(t => ({
    id: t.id, name: t.name, emoji: t.emoji, tagline: t.tagline, group: t.group
  }));
  res.json({ types: summaries, groups: PERSONA_TYPES_DATA.groups });
});

// Get a specific persona type (full detail)
app.get('/api/persona-types/:typeId', (req, res) => {
  const type = PERSONA_TYPES[req.params.typeId];
  if (!type) return res.status(404).json({ error: 'Persona type not found' });
  res.json(type);
});

// AI-enhanced career recommendations
app.post('/api/ai-career-analysis', async (req, res) => {
  try {
    const { studentName, persona } = req.body;

    const prompt = `You are a futuristic career counselor analyzing a K-12 student's learning profile. These students will enter the workforce around 2035 and beyond, so focus on EMERGING and FUTURISTIC careers that will exist in the next 10-20 years.

IMPORTANT: Recommend careers in emerging fields like:
- AI/AGI development, AI ethics, human-AI collaboration
- Quantum computing and quantum applications
- Space industry (tourism, mining, habitation, commerce)
- Biotechnology (longevity, synthetic biology, gene therapy)
- Climate tech and sustainability
- Metaverse, virtual worlds, and immersive experiences
- Brain-computer interfaces and neural technology
- Autonomous systems and robotics
- Personalized medicine and digital health
- Clean energy (fusion, advanced solar, hydrogen)
- Digital governance and algorithmic accountability

STUDENT: ${studentName}

ACADEMIC ORIENTATION:
- Primary Focus: ${persona.academicOrientation.primary?.name || 'General'} (avg rating: ${persona.academicOrientation.primary?.avgRating || 'N/A'}/5)
${persona.academicOrientation.secondary ? `- Secondary Focus: ${persona.academicOrientation.secondary.name}` : ''}

LEARNING PROFILE: ${persona.learningProfile.name}
- Description: ${persona.learningProfile.description}
- Traits: ${persona.learningProfile.traits.join(', ')}

PERFORMANCE METRICS (1-5 scale):
- Attention: ${persona.metrics.attention.toFixed(1)}
- Retention: ${persona.metrics.retention.toFixed(1)}
- Comprehension: ${persona.metrics.comprehension.toFixed(1)}
- Behavior: ${persona.metrics.behavior.toFixed(1)}
- Handwriting: ${persona.metrics.handwriting.toFixed(1)}
- Conversation: ${persona.metrics.conversation.toFixed(1)}

PERFORMANCE TIER: ${persona.performanceTier.tierName}

Based on this profile, provide detailed FUTURISTIC career guidance in this JSON format:
{
  "careerPaths": [
    {
      "title": "Futuristic Career Title",
      "field": "Emerging Industry/Field",
      "emoji": "relevant emoji",
      "matchScore": 85,
      "whyGoodFit": "2-3 sentences explaining why this futuristic career matches their specific strengths",
      "keySkillsNeeded": ["skill1", "skill2", "skill3"],
      "howToGetThere": "Brief education/career path to prepare for this future role",
      "potentialChallenges": "1 sentence about what might be challenging",
      "emergingBy": "Year this career will be mainstream (e.g., 2030, 2035, 2040)"
    }
  ],
  "overallInsights": "2-3 sentences summarizing their career potential in the future workforce",
  "developmentAdvice": "Specific advice for developing skills needed for the future"
}

Provide exactly 6 FUTURISTIC career paths (jobs that will exist in 2035+) that genuinely match this student's demonstrated strengths. Be creative but realistic about emerging technologies and industries.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    res.json(result);
  } catch (error) {
    console.error('Error generating AI career analysis:', error);
    res.status(500).json({ error: 'Failed to generate AI analysis', details: error.message });
  }
});

// Persona shift analysis
app.post('/api/persona-shift', async (req, res) => {
  try {
    const { studentName, currentProfile, targetProfileId } = req.body;

    const targetProfile = LEARNING_PROFILES[targetProfileId];
    if (!targetProfile) {
      return res.status(400).json({ error: 'Invalid target profile' });
    }

    const currentMetrics = currentProfile.metricsBreakdown;

    const metricTargets = {
      engaged_communicator: { conversation: 4.5, comprehension: 4.5 },
      disciplined_executor: { attention: 4.5, behavior: 4.5 },
      meticulous_documenter: { handwriting: 4.5, retention: 4.5 },
      analytical_absorber: { retention: 4.5, comprehension: 4.5 },
      expressive_performer: { conversation: 4.5, handwriting: 4.5 },
      quiet_reflector: { retention: 4.5, behavior: 4.0, conversation: 3.0 },
      active_collaborator: { behavior: 4.5, conversation: 4.0, attention: 4.0 },
      visual_processor: { comprehension: 4.5, handwriting: 4.5 },
      kinesthetic_learner: { behavior: 4.0, attention: 4.0 },
      steady_achiever: { behavior: 4.0, retention: 4.0, attention: 3.5 },
      balanced_achiever: { attention: 4, retention: 4, comprehension: 4, behavior: 4, handwriting: 4, conversation: 4 },
      emerging_learner: { attention: 3.0, behavior: 3.0, comprehension: 3.0 }
    };

    const targets = metricTargets[targetProfileId] || {};
    const recommendations = [];

    for (const [metric, targetValue] of Object.entries(targets)) {
      const currentValue = currentMetrics[metric] || 3;
      const gap = targetValue - currentValue;

      if (gap > 0) {
        recommendations.push({
          metric: metric.charAt(0).toUpperCase() + metric.slice(1),
          currentValue: currentValue.toFixed(1),
          targetValue: targetValue.toFixed(1),
          gap: gap.toFixed(1),
          tips: getImprovementTips(metric, gap)
        });
      }
    }

    const totalGap = recommendations.reduce((sum, r) => sum + parseFloat(r.gap), 0);

    res.json({
      targetProfile,
      recommendations,
      difficulty: recommendations.length === 0 ? 'Already aligned!' :
        totalGap > 3 ? 'Big change needed (many areas to improve)' :
        totalGap > 1.5 ? 'Some effort needed (a few areas to improve)' : 'Almost there (small adjustments needed)',
      estimatedTimeframe: recommendations.length === 0 ? 'N/A' :
        totalGap > 3 ? '6+ months of focused effort' :
        totalGap > 1.5 ? '3-6 months of consistent practice' : '1-3 months with dedication'
    });
  } catch (error) {
    console.error('Error analyzing persona shift:', error);
    res.status(500).json({ error: 'Failed to analyze shift' });
  }
});

// Get all learning profiles
app.get('/api/learning-profiles', (req, res) => {
  res.json(LEARNING_PROFILES);
});

// ============================================
// PHASE 4: PERSONA TIMELINE & SNAPSHOT ENDPOINTS
// ============================================

// Get persona timeline (all snapshots for a student)
app.get('/api/persona-timeline/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const snapshots = dbModule.getSnapshotTimeline(sqliteDb, student.id);
    res.json({
      studentName,
      studentId: student.id,
      snapshotCount: snapshots.length,
      snapshots: snapshots.map(s => ({
        id: s.id,
        date: s.snapshot_date,
        reportCount: s.report_count,
        personalityCode: s.personality_code,
        personaTypeId: s.persona_type_id,
        personaTypeName: s.persona_type_name,
        personaMatchScore: s.persona_match_score,
        learningProfileId: s.learning_profile_id,
        performanceTier: s.performance_tier,
        metricsAverage: s.metrics_average,
        scores: {
          EI: s.score_ei, SC: s.score_sc, PT: s.score_pt,
          RN: s.score_rn, AD: s.score_ad, LG: s.score_lg
        },
        metrics: {
          attention: s.avg_attention, retention: s.avg_retention,
          comprehension: s.avg_comprehension, behavior: s.avg_behavior,
          handwriting: s.avg_handwriting, conversation: s.avg_conversation
        },
        confidence: s.confidence,
        source: s.score_source
      }))
    });
  } catch (error) {
    console.error('Error fetching persona timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Get specific snapshot by date
app.get('/api/persona-snapshot/:studentName/:date', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const date = req.params.date;
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const snapshot = date === 'latest'
      ? dbModule.getLatestSnapshot(sqliteDb, student.id)
      : dbModule.getSnapshotByDate(sqliteDb, student.id, date);

    if (!snapshot) return res.status(404).json({ error: 'No snapshot found for this date' });

    const weaknesses = dbModule.getWeaknessesForSnapshot(sqliteDb, snapshot.id);
    const recommendations = dbModule.getRecommendationsForSnapshot(sqliteDb, snapshot.id);
    const projected = dbModule.getProjectedPersona(sqliteDb, snapshot.id);

    res.json({
      studentName,
      snapshot: {
        id: snapshot.id,
        date: snapshot.snapshot_date,
        reportCount: snapshot.report_count,
        personalityCode: snapshot.personality_code,
        personaTypeId: snapshot.persona_type_id,
        personaTypeName: snapshot.persona_type_name,
        personaMatchScore: snapshot.persona_match_score,
        learningProfileId: snapshot.learning_profile_id,
        performanceTier: snapshot.performance_tier,
        metricsAverage: snapshot.metrics_average,
        scores: {
          EI: snapshot.score_ei, SC: snapshot.score_sc, PT: snapshot.score_pt,
          RN: snapshot.score_rn, AD: snapshot.score_ad, LG: snapshot.score_lg
        },
        metrics: {
          attention: snapshot.avg_attention, retention: snapshot.avg_retention,
          comprehension: snapshot.avg_comprehension, behavior: snapshot.avg_behavior,
          handwriting: snapshot.avg_handwriting, conversation: snapshot.avg_conversation
        },
        confidence: snapshot.confidence,
        source: snapshot.score_source
      },
      weaknesses,
      recommendations,
      projectedPersona: projected
    });
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// Force recompute snapshot for a student
app.post('/api/persona-snapshot/:studentName/recompute', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const reports = dbModule.getReportsForStudent(sqliteDb, student.id);
    if (reports.length < engine.MIN_REPORTS_FOR_PERSONALITY) {
      return res.status(400).json({ error: 'Not enough reports', reportCount: reports.length });
    }

    const quizRow = dbModule.getQuizData(sqliteDb, student.id);
    let quizData = null;
    if (quizRow && quizRow.taken) {
      quizData = { taken: true, scores: JSON.parse(quizRow.scores_json) };
    }

    const subjectComparison = dbModule.getSubjectComparison(sqliteDb, student.id);
    const latestDate = reports[reports.length - 1].report_date;

    const result = engine.computeSnapshot(reports, quizData, subjectComparison);
    if (!result) return res.status(500).json({ error: 'Snapshot computation failed' });

    const snapshotData = { ...result.snapshot, student_id: student.id, snapshot_date: latestDate };
    const insertResult = dbModule.insertPersonaSnapshot(sqliteDb, snapshotData);
    const snapshotId = insertResult.lastInsertRowid;

    // Insert weaknesses and match templates
    const allTemplates = dbModule.getAllTemplates(sqliteDb);
    for (const weakness of result.weaknesses) {
      const wResult = dbModule.insertSnapshotWeakness(sqliteDb, { ...weakness, snapshot_id: snapshotId });
      const matchingTemplates = allTemplates.filter(t =>
        t.weakness_area === weakness.area && t.severity === weakness.severity
      );
      for (const template of matchingTemplates.slice(0, 2)) {
        dbModule.insertRecommendation(sqliteDb, {
          snapshot_id: snapshotId,
          weakness_id: wResult.lastInsertRowid,
          source: 'template',
          template_id: template.id,
          title: template.title,
          description: template.description,
          activity_type: template.activity_type,
          estimated_duration: template.estimated_duration,
          projected_impact_json: template.dimension_impact_json,
          priority: weakness.severity === 'critical' ? 3 : weakness.severity === 'significant' ? 2 : 1,
          status: 'pending'
        });
      }
    }

    // Compute projected persona
    computeAndStoreProjectedPersona(snapshotId, result.snapshot);

    res.json({ success: true, snapshotId, date: latestDate, reportCount: reports.length });
  } catch (error) {
    console.error('Error recomputing snapshot:', error);
    res.status(500).json({ error: 'Failed to recompute snapshot' });
  }
});

// ============================================
// PHASE 4b: DATE PICKER / PERIOD COMPARISON ENDPOINTS
// ============================================

// Compute persona as of a specific date (all reports up to that date)
app.get('/api/persona-as-of/:studentName/:date', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const date = req.params.date;
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check if a pre-computed snapshot exists for this exact date
    const existing = dbModule.getSnapshotByDate(sqliteDb, student.id, date);
    if (existing) {
      const weaknesses = dbModule.getWeaknessesForSnapshot(sqliteDb, existing.id);
      return res.json({
        studentName,
        cached: true,
        snapshot: {
          date: existing.snapshot_date,
          reportCount: existing.report_count,
          personalityCode: existing.personality_code,
          personaTypeId: existing.persona_type_id,
          personaTypeName: existing.persona_type_name,
          personaMatchScore: existing.persona_match_score,
          learningProfileId: existing.learning_profile_id,
          performanceTier: existing.performance_tier,
          metricsAverage: existing.metrics_average,
          scores: {
            EI: existing.score_ei, SC: existing.score_sc, PT: existing.score_pt,
            RN: existing.score_rn, AD: existing.score_ad, LG: existing.score_lg
          },
          metrics: {
            attention: existing.avg_attention, retention: existing.avg_retention,
            comprehension: existing.avg_comprehension, behavior: existing.avg_behavior,
            handwriting: existing.avg_handwriting, conversation: existing.avg_conversation
          },
          confidence: existing.confidence,
          source: existing.score_source
        },
        weaknesses
      });
    }

    // No cached snapshot — compute on the fly
    const reports = dbModule.getReportsUpToDate(sqliteDb, student.id, date);
    if (reports.length < engine.MIN_REPORTS_FOR_PERSONALITY) {
      return res.status(400).json({
        error: 'Not enough reports',
        reportCount: reports.length,
        minRequired: engine.MIN_REPORTS_FOR_PERSONALITY
      });
    }

    const quizRow = dbModule.getQuizData(sqliteDb, student.id);
    let quizData = null;
    if (quizRow && quizRow.taken) {
      quizData = { taken: true, scores: JSON.parse(quizRow.scores_json) };
    }
    const subjectComparison = dbModule.getSubjectComparison(sqliteDb, student.id);

    const result = engine.computeSnapshot(reports, quizData, subjectComparison);
    if (!result) return res.status(500).json({ error: 'Snapshot computation failed' });

    res.json({
      studentName,
      cached: false,
      snapshot: {
        date,
        reportCount: result.snapshot.report_count,
        personalityCode: result.snapshot.personality_code,
        personaTypeId: result.snapshot.persona_type_id,
        personaTypeName: result.snapshot.persona_type_name,
        personaMatchScore: result.snapshot.persona_match_score,
        learningProfileId: result.snapshot.learning_profile_id,
        performanceTier: result.snapshot.performance_tier,
        metricsAverage: result.snapshot.metrics_average,
        scores: {
          EI: result.snapshot.score_ei, SC: result.snapshot.score_sc, PT: result.snapshot.score_pt,
          RN: result.snapshot.score_rn, AD: result.snapshot.score_ad, LG: result.snapshot.score_lg
        },
        metrics: {
          attention: result.snapshot.avg_attention, retention: result.snapshot.avg_retention,
          comprehension: result.snapshot.avg_comprehension, behavior: result.snapshot.avg_behavior,
          handwriting: result.snapshot.avg_handwriting, conversation: result.snapshot.avg_conversation
        },
        confidence: result.snapshot.confidence,
        source: result.snapshot.score_source
      },
      weaknesses: result.weaknesses
    });
  } catch (error) {
    console.error('Error computing persona as-of:', error);
    res.status(500).json({ error: 'Failed to compute persona' });
  }
});

// Compute persona from reports within a specific date range
app.get('/api/persona-period/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to query parameters' });

    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const reports = dbModule.getReportsForStudent(sqliteDb, student.id, { startDate: from, endDate: to });
    if (reports.length < engine.MIN_REPORTS_FOR_PERSONALITY) {
      return res.status(400).json({
        error: 'Not enough reports in this period',
        reportCount: reports.length,
        minRequired: engine.MIN_REPORTS_FOR_PERSONALITY
      });
    }

    const quizRow = dbModule.getQuizData(sqliteDb, student.id);
    let quizData = null;
    if (quizRow && quizRow.taken) {
      quizData = { taken: true, scores: JSON.parse(quizRow.scores_json) };
    }
    const subjectComparison = dbModule.getSubjectComparison(sqliteDb, student.id);

    const result = engine.computeSnapshot(reports, quizData, subjectComparison);
    if (!result) return res.status(500).json({ error: 'Snapshot computation failed' });

    res.json({
      studentName,
      period: { from, to },
      snapshot: {
        reportCount: result.snapshot.report_count,
        personalityCode: result.snapshot.personality_code,
        personaTypeId: result.snapshot.persona_type_id,
        personaTypeName: result.snapshot.persona_type_name,
        personaMatchScore: result.snapshot.persona_match_score,
        learningProfileId: result.snapshot.learning_profile_id,
        performanceTier: result.snapshot.performance_tier,
        metricsAverage: result.snapshot.metrics_average,
        scores: {
          EI: result.snapshot.score_ei, SC: result.snapshot.score_sc, PT: result.snapshot.score_pt,
          RN: result.snapshot.score_rn, AD: result.snapshot.score_ad, LG: result.snapshot.score_lg
        },
        metrics: {
          attention: result.snapshot.avg_attention, retention: result.snapshot.avg_retention,
          comprehension: result.snapshot.avg_comprehension, behavior: result.snapshot.avg_behavior,
          handwriting: result.snapshot.avg_handwriting, conversation: result.snapshot.avg_conversation
        },
        confidence: result.snapshot.confidence,
        source: result.snapshot.score_source
      },
      weaknesses: result.weaknesses
    });
  } catch (error) {
    console.error('Error computing persona for period:', error);
    res.status(500).json({ error: 'Failed to compute persona for period' });
  }
});

// ============================================
// PHASE 5: REINFORCEMENT SYSTEM ENDPOINTS
// ============================================

// Get reinforcement recommendations for latest snapshot
app.get('/api/reinforcement/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const snapshot = dbModule.getLatestSnapshot(sqliteDb, student.id);
    if (!snapshot) return res.status(404).json({ error: 'No snapshot found' });

    const recommendations = dbModule.getRecommendationsForSnapshot(sqliteDb, snapshot.id);
    const projected = dbModule.getProjectedPersona(sqliteDb, snapshot.id);

    res.json({
      studentName,
      snapshotId: snapshot.id,
      snapshotDate: snapshot.snapshot_date,
      recommendations,
      projectedPersona: projected,
      currentScores: {
        EI: snapshot.score_ei, SC: snapshot.score_sc, PT: snapshot.score_pt,
        RN: snapshot.score_rn, AD: snapshot.score_ad, LG: snapshot.score_lg
      }
    });
  } catch (error) {
    console.error('Error fetching reinforcement:', error);
    res.status(500).json({ error: 'Failed to fetch reinforcement data' });
  }
});

// AI-generate personalized recommendations
app.post('/api/reinforcement/:studentName/generate-ai', async (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const snapshot = dbModule.getLatestSnapshot(sqliteDb, student.id);
    if (!snapshot) return res.status(404).json({ error: 'No snapshot found' });

    const weaknesses = dbModule.getWeaknessesForSnapshot(sqliteDb, snapshot.id);
    const learningProfile = engine.LEARNING_PROFILES[snapshot.learning_profile_id] || {};

    const prompt = `You are an expert ESL education specialist creating personalized intervention recommendations for a student.

STUDENT: ${studentName}
PERSONA TYPE: ${snapshot.persona_type_name || 'Unknown'}
LEARNING PROFILE: ${learningProfile.name || snapshot.learning_profile_id}
PERFORMANCE TIER: ${snapshot.performance_tier}
PERSONALITY CODE: ${snapshot.personality_code}

CURRENT METRICS (1-5 scale):
- Attention: ${snapshot.avg_attention}
- Retention: ${snapshot.avg_retention}
- Comprehension: ${snapshot.avg_comprehension}
- Behavior: ${snapshot.avg_behavior}
- Handwriting: ${snapshot.avg_handwriting}
- Conversation: ${snapshot.avg_conversation}

PERSONALITY SCORES (0-100):
- EI (Breadth vs Depth): ${snapshot.score_ei}
- SC (Team vs Solo): ${snapshot.score_sc}
- PT (Hands-on vs Conceptual): ${snapshot.score_pt}
- RN (Routine vs Adventure): ${snapshot.score_rn}
- AD (Think First vs Act Fast): ${snapshot.score_ad}
- LG (Details vs Big Picture): ${snapshot.score_lg}

WEAKNESSES:
${weaknesses.map(w => `- ${w.area}: ${w.current_level}/5 (severity: ${w.severity})`).join('\n')}

Generate 3 personalized intervention activities. For each, provide:
1. A specific, actionable activity title
2. Detailed description of how to implement it
3. Activity type (exercise, technique, discussion, management, environment)
4. Estimated duration
5. Which personality dimensions this would shift and by how much (-5 to +5)

Format as JSON:
{
  "recommendations": [
    {
      "title": "Activity Title",
      "description": "Detailed description",
      "activity_type": "exercise",
      "estimated_duration": "15 min/day",
      "projected_impact": {"EI": 0, "SC": -3, "PT": 0, "RN": 0, "AD": -2, "LG": 0}
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7
    });

    const result = JSON.parse(response.choices[0].message.content);
    const insertedIds = [];

    for (const rec of result.recommendations) {
      const insertResult = dbModule.insertRecommendation(sqliteDb, {
        snapshot_id: snapshot.id,
        weakness_id: weaknesses[0]?.id || null,
        source: 'ai_generated',
        template_id: null,
        title: rec.title,
        description: rec.description,
        activity_type: rec.activity_type,
        estimated_duration: rec.estimated_duration,
        projected_impact_json: JSON.stringify(rec.projected_impact),
        priority: 2,
        status: 'pending'
      });
      insertedIds.push(insertResult.lastInsertRowid);
    }

    // Recompute projected persona
    computeAndStoreProjectedPersona(snapshot.id, snapshot);

    const allRecs = dbModule.getRecommendationsForSnapshot(sqliteDb, snapshot.id);
    const projected = dbModule.getProjectedPersona(sqliteDb, snapshot.id);

    res.json({
      success: true,
      generatedCount: result.recommendations.length,
      recommendations: allRecs,
      projectedPersona: projected
    });
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Update recommendation status
app.patch('/api/reinforcement/:recommendationId', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const recId = parseInt(req.params.recommendationId);
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    dbModule.updateRecommendationStatus(sqliteDb, recId, status);

    // Get the recommendation to find its snapshot
    const rec = sqliteDb.prepare('SELECT snapshot_id FROM reinforcement_recommendations WHERE id = ?').get(recId);
    if (rec) {
      const snapshot = sqliteDb.prepare('SELECT * FROM persona_snapshots WHERE id = ?').get(rec.snapshot_id);
      if (snapshot) {
        computeAndStoreProjectedPersona(snapshot.id, snapshot);
      }
    }

    res.json({ success: true, id: recId, status });
  } catch (error) {
    console.error('Error updating recommendation:', error);
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

// Helper: compute and store projected persona based on pending/in_progress recommendations
function computeAndStoreProjectedPersona(snapshotId, snapshot) {
  const recs = dbModule.getRecommendationsForSnapshot(sqliteDb, snapshotId);
  const activeRecs = recs.filter(r => r.status === 'pending' || r.status === 'in_progress');

  let projected = {
    EI: snapshot.score_ei || 50,
    SC: snapshot.score_sc || 50,
    PT: snapshot.score_pt || 50,
    RN: snapshot.score_rn || 50,
    AD: snapshot.score_ad || 50,
    LG: snapshot.score_lg || 50
  };

  for (const rec of activeRecs) {
    if (rec.projected_impact_json) {
      try {
        const impact = JSON.parse(rec.projected_impact_json);
        for (const [dim, shift] of Object.entries(impact)) {
          if (projected[dim] !== undefined) {
            projected[dim] = Math.max(0, Math.min(100, projected[dim] + shift));
          }
        }
      } catch (e) { /* ignore bad json */ }
    }
  }

  const projectedType = engine.matchPersonaType(projected, 0.7);

  dbModule.upsertProjectedPersona(sqliteDb, snapshotId, {
    projected_ei: projected.EI,
    projected_sc: projected.SC,
    projected_pt: projected.PT,
    projected_rn: projected.RN,
    projected_ad: projected.AD,
    projected_lg: projected.LG,
    projected_type_id: projectedType?.primary?.id || null,
    projected_type_name: projectedType?.primary?.name || null
  });
}

// ============================================
// PHASE 6: DESIRED PERSONA & GAP ANALYSIS
// ============================================

// Set desired persona
app.post('/api/desired-persona', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const { studentName, personaTypeId, setBy, setByName, reason } = req.body;
    if (!studentName || !personaTypeId || !setBy) {
      return res.status(400).json({ error: 'studentName, personaTypeId, and setBy are required' });
    }

    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const personaType = engine.PERSONA_TYPES[personaTypeId];
    if (!personaType) return res.status(400).json({ error: 'Invalid persona type ID' });

    dbModule.upsertDesiredPersona(sqliteDb, student.id, personaTypeId, setBy, setByName, reason);

    res.json({ success: true, studentName, personaTypeId, personaTypeName: personaType.name });
  } catch (error) {
    console.error('Error setting desired persona:', error);
    res.status(500).json({ error: 'Failed to set desired persona' });
  }
});

// Get desired persona
app.get('/api/desired-persona/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const desired = dbModule.getDesiredPersona(sqliteDb, student.id);
    if (!desired) return res.json({ studentName, hasDesired: false });

    const personaType = engine.PERSONA_TYPES[desired.persona_type_id];

    res.json({
      studentName,
      hasDesired: true,
      personaTypeId: desired.persona_type_id,
      personaType: personaType || null,
      setBy: desired.set_by,
      setByName: desired.set_by_name,
      reason: desired.reason,
      setAt: desired.set_at
    });
  } catch (error) {
    console.error('Error getting desired persona:', error);
    res.status(500).json({ error: 'Failed to get desired persona' });
  }
});

// Delete desired persona
app.delete('/api/desired-persona/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    dbModule.deleteDesiredPersona(sqliteDb, student.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting desired persona:', error);
    res.status(500).json({ error: 'Failed to delete desired persona' });
  }
});

// Gap analysis: current → desired
app.get('/api/desired-persona-gap/:studentName', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const studentName = decodeURIComponent(req.params.studentName);
    const student = dbModule.getStudentByName(sqliteDb, studentName);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const snapshot = dbModule.getLatestSnapshot(sqliteDb, student.id);
    if (!snapshot) return res.status(404).json({ error: 'No snapshot found' });

    const desired = dbModule.getDesiredPersona(sqliteDb, student.id);
    if (!desired) return res.status(404).json({ error: 'No desired persona set' });

    const personaType = engine.PERSONA_TYPES[desired.persona_type_id];
    if (!personaType) return res.status(404).json({ error: 'Desired persona type not found' });

    const desiredScores = personaType.archetypeScores;
    const currentScores = {
      EI: snapshot.score_ei, SC: snapshot.score_sc, PT: snapshot.score_pt,
      RN: snapshot.score_rn, AD: snapshot.score_ad, LG: snapshot.score_lg
    };

    const gaps = [];
    const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
    let totalGap = 0;

    for (const dim of dimensions) {
      const current = currentScores[dim] || 50;
      const target = desiredScores[dim] || 50;
      const gap = target - current;
      totalGap += Math.abs(gap);

      const dimInfo = engine.PERSONALITY_DIMENSIONS[dim];
      gaps.push({
        dimension: dim,
        dimensionName: dimInfo.name,
        current,
        target,
        gap,
        direction: gap > 0 ? 'increase' : gap < 0 ? 'decrease' : 'on_target',
        magnitude: Math.abs(gap) > 20 ? 'large' : Math.abs(gap) > 10 ? 'moderate' : 'small'
      });
    }

    // Match reinforcement templates that push scores in the right direction
    const allTemplates = dbModule.getAllTemplates(sqliteDb);
    const suggestedTemplates = [];
    for (const template of allTemplates) {
      if (!template.dimension_impact_json) continue;
      try {
        const impact = JSON.parse(template.dimension_impact_json);
        let helpfulness = 0;
        for (const [dim, shift] of Object.entries(impact)) {
          const gapForDim = gaps.find(g => g.dimension === dim);
          if (gapForDim && gapForDim.gap !== 0) {
            if ((gapForDim.gap > 0 && shift > 0) || (gapForDim.gap < 0 && shift < 0)) {
              helpfulness += Math.min(Math.abs(shift), Math.abs(gapForDim.gap));
            }
          }
        }
        if (helpfulness > 0) {
          suggestedTemplates.push({ ...template, helpfulness });
        }
      } catch (e) { /* skip */ }
    }
    suggestedTemplates.sort((a, b) => b.helpfulness - a.helpfulness);

    // Estimate difficulty
    const difficulty = totalGap > 100 ? 'Very challenging' :
      totalGap > 60 ? 'Challenging' :
      totalGap > 30 ? 'Moderate' : 'Achievable';

    const timeframe = totalGap > 100 ? '6+ months' :
      totalGap > 60 ? '3-6 months' :
      totalGap > 30 ? '1-3 months' : '2-4 weeks';

    res.json({
      studentName,
      currentPersona: {
        typeId: snapshot.persona_type_id,
        typeName: snapshot.persona_type_name,
        scores: currentScores
      },
      desiredPersona: {
        typeId: desired.persona_type_id,
        typeName: personaType.name,
        emoji: personaType.emoji,
        scores: desiredScores
      },
      gaps,
      totalGap,
      difficulty,
      estimatedTimeframe: timeframe,
      suggestedTemplates: suggestedTemplates.slice(0, 6)
    });
  } catch (error) {
    console.error('Error computing gap analysis:', error);
    res.status(500).json({ error: 'Failed to compute gap analysis' });
  }
});

// ============================================
// PHASE 7: LIVE SYNC - Import single report
// ============================================

app.post('/api/reports/import', (req, res) => {
  try {
    if (!USE_SQLITE) return res.status(503).json({ error: 'SQLite not available' });

    const report = req.body;
    if (!report['Student Name'] || !report['Date']) {
      return res.status(400).json({ error: 'Student Name and Date are required' });
    }

    // Upsert student
    const studentResult = dbModule.upsertStudent(sqliteDb,
      report['Student Name'],
      report['Student ID'],
      report['Grade Level'],
      report['Student Gender']
    );
    const studentId = studentResult.id;

    // Insert report
    dbModule.insertDailyReport(sqliteDb, {
      student_id: studentId,
      report_date: report['Date'],
      day_of_week: report['Day of Week'],
      teacher_name: report['Teacher Name'],
      teacher_id: report['Teacher ID'],
      subject: report['Subject'],
      is_substitute: report['Is Substitute'],
      skill_focus: report['Skill Focus'],
      sf_met: report['SF Met'],
      current_lesson: report['Current Lesson'],
      materials: report['Materials'],
      homework: report['Homework'],
      next_lesson: report['Next Lesson'],
      activities_finished: report['Activities Finished'],
      activities_not_finished: report['Activities Not Finished'],
      attention: parseFloat(report['Attention']) || null,
      retention: parseFloat(report['Retention']) || null,
      comprehension: parseFloat(report['Comprehension']) || null,
      behavior: parseFloat(report['Behavior']) || null,
      handwriting: parseFloat(report['Handwriting']) || null,
      conversation: parseFloat(report['Conversation']) || null,
      skills_json: typeof report['Skills'] === 'string' ? report['Skills'] : JSON.stringify(report['Skills'] || {}),
      scores_json: typeof report['Scores'] === 'string' ? report['Scores'] : JSON.stringify(report['Scores'] || {}),
      narrative: report['Narrative'],
      wpm_initial: report['WPM Initial'],
      gbwt_initial: report['GBWT Initial'],
      reading_level_initial: report['Reading Level Initial'],
      interview_score: report['Interview Score']
    });

    // Trigger snapshot recompute
    const allReports = dbModule.getReportsForStudent(sqliteDb, studentId);
    if (allReports.length >= engine.MIN_REPORTS_FOR_PERSONALITY) {
      const quizRow = dbModule.getQuizData(sqliteDb, studentId);
      let quizData = null;
      if (quizRow && quizRow.taken) {
        quizData = { taken: true, scores: JSON.parse(quizRow.scores_json) };
      }
      const subjectComparison = dbModule.getSubjectComparison(sqliteDb, studentId);
      const result = engine.computeSnapshot(allReports, quizData, subjectComparison);

      if (result) {
        const snapshotData = { ...result.snapshot, student_id: studentId, snapshot_date: report['Date'] };
        const insertResult = dbModule.insertPersonaSnapshot(sqliteDb, snapshotData);
        const snapshotId = insertResult.lastInsertRowid;

        const allTemplates = dbModule.getAllTemplates(sqliteDb);
        for (const weakness of result.weaknesses) {
          const wResult = dbModule.insertSnapshotWeakness(sqliteDb, { ...weakness, snapshot_id: snapshotId });
          const matchingTemplates = allTemplates.filter(t =>
            t.weakness_area === weakness.area && t.severity === weakness.severity
          );
          for (const template of matchingTemplates.slice(0, 2)) {
            dbModule.insertRecommendation(sqliteDb, {
              snapshot_id: snapshotId,
              weakness_id: wResult.lastInsertRowid,
              source: 'template',
              template_id: template.id,
              title: template.title,
              description: template.description,
              activity_type: template.activity_type,
              estimated_duration: template.estimated_duration,
              projected_impact_json: template.dimension_impact_json,
              priority: weakness.severity === 'critical' ? 3 : weakness.severity === 'significant' ? 2 : 1,
              status: 'pending'
            });
          }
        }

        computeAndStoreProjectedPersona(snapshotId, result.snapshot);
      }
    }

    res.json({ success: true, studentId, date: report['Date'] });
  } catch (error) {
    console.error('Error importing report:', error);
    res.status(500).json({ error: 'Failed to import report' });
  }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Student Report Viewer running at http://localhost:${port}`);
    console.log(`Reading reports from: ${CSV_PATH}`);
    if (USE_SQLITE) {
        console.log('SQLite database: ACTIVE');
    }
});
