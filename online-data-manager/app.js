const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 1446;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// ── Paths ──
const CSV_PATH = path.join(__dirname, '../online-report-generator/online-reports.csv');
const BACKUP_DIR = path.join(path.dirname(CSV_PATH), 'backups');
const BACKUP_PREFIX = 'online-reports_';

// ── CSV Data Manager Infrastructure ──

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}
ensureBackupDir();

function createBackup(label) {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `${BACKUP_PREFIX}${timestamp}_${label}.csv`;
    const dest = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(CSV_PATH, dest);

    // Auto-prune: keep only last 50 backups
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.csv'))
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
        triggerSQLiteResync();
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

// Read CSV without JSON-parsing (preserves original strings for write-back)
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

// ── SQLite Resync (fire-and-forget) ──
function triggerSQLiteResync() {
    fetch('http://localhost:1445/api/reports/resync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                console.log(`Resync OK: imported ${data.imported}, deduped ${data.deduped}`);
            } else {
                console.log('Resync response:', data);
            }
        })
        .catch(err => {
            console.log('Resync fire-and-forget failed (viewer may be down):', err.message);
        });
}

// ── CSV Data Manager Auth ──

const DM_PASSWORD = 'wecaninican';
const DM_TOKEN = crypto.randomUUID();

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
            .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.csv'))
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
        triggerSQLiteResync();

        res.json({ success: true, message: `Restored from ${filename}` });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Online Data Manager running at http://localhost:${port}`);
    console.log(`Managing CSV: ${CSV_PATH}`);
    console.log(`Backups dir: ${BACKUP_DIR}`);
});
