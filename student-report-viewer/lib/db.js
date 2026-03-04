const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'stellar.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

function initSchema() {
  const db = getDb();

  db.exec(`
    -- Master student list
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL UNIQUE,
      student_id_ext TEXT,
      grade_level TEXT,
      gender TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Every daily report (replaces CSV reads)
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      report_date TEXT NOT NULL,
      day_of_week TEXT,
      teacher_name TEXT,
      teacher_id TEXT,
      subject TEXT,
      is_substitute TEXT,
      skill_focus TEXT,
      sf_met TEXT,
      current_lesson TEXT,
      materials TEXT,
      homework TEXT,
      next_lesson TEXT,
      activities_finished TEXT,
      activities_not_finished TEXT,
      attention REAL,
      retention REAL,
      comprehension REAL,
      behavior REAL,
      handwriting REAL,
      conversation REAL,
      skills_json TEXT,
      scores_json TEXT,
      narrative TEXT,
      wpm_initial TEXT,
      gbwt_initial TEXT,
      reading_level_initial TEXT,
      interview_score TEXT,
      UNIQUE(student_id, report_date, subject)
    );

    -- Quiz data (replaces personality-data.json)
    CREATE TABLE IF NOT EXISTS quiz_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
      taken INTEGER NOT NULL DEFAULT 0,
      taken_at TEXT,
      answers_json TEXT,
      scores_json TEXT
    );

    -- Behavior ratings (replaces academic-enabler.json)
    CREATE TABLE IF NOT EXISTS academic_enabler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      eval_type TEXT NOT NULL,
      season TEXT NOT NULL,
      teachers_json TEXT,
      ratings_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(student_id, eval_type, season)
    );

    -- Attendance overrides (replaces overrides.json)
    CREATE TABLE IF NOT EXISTS attendance_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      override_date TEXT,
      student_name TEXT,
      teacher_name TEXT,
      time_slot TEXT,
      reason_code TEXT DEFAULT 'absent',
      UNIQUE(override_date, student_name, teacher_name, time_slot)
    );

    -- Daily persona snapshot (THE CORE)
    CREATE TABLE IF NOT EXISTS persona_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      snapshot_date TEXT NOT NULL,
      report_count INTEGER NOT NULL,
      score_ei REAL,
      score_sc REAL,
      score_pt REAL,
      score_rn REAL,
      score_ad REAL,
      score_lg REAL,
      score_source TEXT,
      confidence REAL,
      personality_code TEXT,
      persona_type_id TEXT,
      persona_type_name TEXT,
      persona_match_score REAL,
      learning_profile_id TEXT,
      performance_tier TEXT,
      metrics_average REAL,
      avg_attention REAL,
      avg_retention REAL,
      avg_comprehension REAL,
      avg_behavior REAL,
      avg_handwriting REAL,
      avg_conversation REAL,
      computed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, snapshot_date)
    );

    -- Weaknesses per snapshot
    CREATE TABLE IF NOT EXISTS snapshot_weaknesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES persona_snapshots(id),
      weakness_type TEXT NOT NULL,
      area TEXT NOT NULL,
      current_level REAL,
      target_level REAL,
      severity TEXT,
      frequency INTEGER,
      trend TEXT,
      impact TEXT
    );

    -- Predefined intervention templates (seeded)
    CREATE TABLE IF NOT EXISTS reinforcement_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weakness_area TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      activity_type TEXT,
      estimated_duration TEXT,
      dimension_impact_json TEXT
    );

    -- Per-snapshot recommendations (template-matched + AI-generated)
    CREATE TABLE IF NOT EXISTS reinforcement_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES persona_snapshots(id),
      weakness_id INTEGER REFERENCES snapshot_weaknesses(id),
      source TEXT NOT NULL CHECK(source IN ('template', 'ai_generated')),
      template_id INTEGER REFERENCES reinforcement_templates(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      activity_type TEXT,
      estimated_duration TEXT,
      projected_impact_json TEXT,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'skipped'))
    );

    -- Student/teacher-set target persona
    CREATE TABLE IF NOT EXISTS desired_persona (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
      persona_type_id TEXT NOT NULL,
      set_by TEXT NOT NULL CHECK(set_by IN ('student', 'teacher')),
      set_by_name TEXT,
      reason TEXT,
      set_at TEXT DEFAULT (datetime('now'))
    );

    -- Projected persona if recommendations are followed
    CREATE TABLE IF NOT EXISTS projected_persona (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL UNIQUE REFERENCES persona_snapshots(id),
      projected_ei REAL,
      projected_sc REAL,
      projected_pt REAL,
      projected_rn REAL,
      projected_ad REAL,
      projected_lg REAL,
      projected_type_id TEXT,
      projected_type_name TEXT
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_daily_reports_student ON daily_reports(student_id);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_student_date ON daily_reports(student_id, report_date);
    CREATE INDEX IF NOT EXISTS idx_persona_snapshots_student ON persona_snapshots(student_id);
    CREATE INDEX IF NOT EXISTS idx_persona_snapshots_date ON persona_snapshots(student_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_snapshot_weaknesses_snapshot ON snapshot_weaknesses(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_reinforcement_recommendations_snapshot ON reinforcement_recommendations(snapshot_id);
  `);

  return db;
}

// Prepared statement cache
const _stmts = {};

function getStmt(db, name, sql) {
  if (!_stmts[name]) {
    _stmts[name] = db.prepare(sql);
  }
  return _stmts[name];
}

// ===========================================
// Student queries
// ===========================================

function upsertStudent(db, fullName, studentIdExt, gradeLevel, gender) {
  const stmt = getStmt(db, 'upsertStudent', `
    INSERT INTO students (full_name, student_id_ext, grade_level, gender)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(full_name) DO UPDATE SET
      student_id_ext = COALESCE(excluded.student_id_ext, students.student_id_ext),
      grade_level = COALESCE(excluded.grade_level, students.grade_level),
      gender = COALESCE(excluded.gender, students.gender)
  `);
  stmt.run(fullName, studentIdExt || null, gradeLevel || null, gender || null);
  return db.prepare('SELECT id FROM students WHERE full_name = ?').get(fullName);
}

function getAllStudents(db) {
  return db.prepare('SELECT * FROM students ORDER BY full_name').all();
}

function getStudentByName(db, name) {
  return db.prepare('SELECT * FROM students WHERE full_name = ?').get(name);
}

// ===========================================
// Daily report queries
// ===========================================

function insertDailyReport(db, report) {
  const stmt = getStmt(db, 'insertDailyReport', `
    INSERT OR REPLACE INTO daily_reports (
      student_id, report_date, day_of_week, teacher_name, teacher_id,
      subject, is_substitute, skill_focus, sf_met, current_lesson,
      materials, homework, next_lesson, activities_finished, activities_not_finished,
      attention, retention, comprehension, behavior, handwriting, conversation,
      skills_json, scores_json, narrative,
      wpm_initial, gbwt_initial, reading_level_initial, interview_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    report.student_id, report.report_date, report.day_of_week,
    report.teacher_name, report.teacher_id, report.subject,
    report.is_substitute, report.skill_focus, report.sf_met,
    report.current_lesson, report.materials, report.homework,
    report.next_lesson, report.activities_finished, report.activities_not_finished,
    report.attention, report.retention, report.comprehension,
    report.behavior, report.handwriting, report.conversation,
    report.skills_json, report.scores_json, report.narrative,
    report.wpm_initial, report.gbwt_initial, report.reading_level_initial,
    report.interview_score
  );
}

function getReportsForStudent(db, studentId, opts = {}) {
  let sql = 'SELECT * FROM daily_reports WHERE student_id = ?';
  const params = [studentId];

  if (opts.startDate) {
    sql += ' AND report_date >= ?';
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    sql += ' AND report_date <= ?';
    params.push(opts.endDate);
  }
  if (opts.subject) {
    sql += ' AND subject = ?';
    params.push(opts.subject);
  }
  if (opts.teacher) {
    sql += ' AND teacher_name = ?';
    params.push(opts.teacher);
  }

  sql += ' ORDER BY report_date ASC';
  return db.prepare(sql).all(...params);
}

function getReportsUpToDate(db, studentId, date) {
  return db.prepare(`
    SELECT * FROM daily_reports
    WHERE student_id = ? AND report_date <= ?
    ORDER BY report_date ASC
  `).all(studentId, date);
}

function getUniqueReportDates(db, studentId) {
  return db.prepare(`
    SELECT DISTINCT report_date FROM daily_reports
    WHERE student_id = ?
    ORDER BY report_date ASC
  `).all(studentId).map(r => r.report_date);
}

// ===========================================
// Quiz data queries
// ===========================================

function upsertQuizData(db, studentId, taken, takenAt, answersJson, scoresJson) {
  const stmt = getStmt(db, 'upsertQuizData', `
    INSERT INTO quiz_data (student_id, taken, taken_at, answers_json, scores_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id) DO UPDATE SET
      taken = excluded.taken,
      taken_at = excluded.taken_at,
      answers_json = excluded.answers_json,
      scores_json = excluded.scores_json
  `);
  return stmt.run(studentId, taken ? 1 : 0, takenAt, answersJson, scoresJson);
}

function getQuizData(db, studentId) {
  return db.prepare('SELECT * FROM quiz_data WHERE student_id = ?').get(studentId);
}

// ===========================================
// Academic enabler queries
// ===========================================

function upsertAcademicEnabler(db, studentId, evalType, season, teachersJson, ratingsJson, createdAt, updatedAt) {
  const stmt = getStmt(db, 'upsertAcademicEnabler', `
    INSERT INTO academic_enabler (student_id, eval_type, season, teachers_json, ratings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, eval_type, season) DO UPDATE SET
      teachers_json = excluded.teachers_json,
      ratings_json = excluded.ratings_json,
      updated_at = excluded.updated_at
  `);
  return stmt.run(studentId, evalType, season, teachersJson, ratingsJson, createdAt, updatedAt);
}

// ===========================================
// Attendance override queries
// ===========================================

function insertAttendanceOverride(db, overrideDate, studentName, teacherName, timeSlot, reasonCode) {
  const stmt = getStmt(db, 'insertOverride', `
    INSERT OR IGNORE INTO attendance_overrides (override_date, student_name, teacher_name, time_slot, reason_code)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(overrideDate, studentName, teacherName, timeSlot, reasonCode || 'absent');
}

// ===========================================
// Persona snapshot queries
// ===========================================

function insertPersonaSnapshot(db, snapshot) {
  const stmt = getStmt(db, 'insertSnapshot', `
    INSERT OR REPLACE INTO persona_snapshots (
      student_id, snapshot_date, report_count,
      score_ei, score_sc, score_pt, score_rn, score_ad, score_lg,
      score_source, confidence, personality_code,
      persona_type_id, persona_type_name, persona_match_score,
      learning_profile_id, performance_tier, metrics_average,
      avg_attention, avg_retention, avg_comprehension,
      avg_behavior, avg_handwriting, avg_conversation,
      computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const result = stmt.run(
    snapshot.student_id, snapshot.snapshot_date, snapshot.report_count,
    snapshot.score_ei, snapshot.score_sc, snapshot.score_pt,
    snapshot.score_rn, snapshot.score_ad, snapshot.score_lg,
    snapshot.score_source, snapshot.confidence, snapshot.personality_code,
    snapshot.persona_type_id, snapshot.persona_type_name, snapshot.persona_match_score,
    snapshot.learning_profile_id, snapshot.performance_tier, snapshot.metrics_average,
    snapshot.avg_attention, snapshot.avg_retention, snapshot.avg_comprehension,
    snapshot.avg_behavior, snapshot.avg_handwriting, snapshot.avg_conversation
  );
  return result;
}

function getLatestSnapshot(db, studentId) {
  return db.prepare(`
    SELECT * FROM persona_snapshots
    WHERE student_id = ?
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(studentId);
}

function getSnapshotByDate(db, studentId, date) {
  return db.prepare(`
    SELECT * FROM persona_snapshots
    WHERE student_id = ? AND snapshot_date = ?
  `).get(studentId, date);
}

function getSnapshotTimeline(db, studentId) {
  return db.prepare(`
    SELECT * FROM persona_snapshots
    WHERE student_id = ?
    ORDER BY snapshot_date ASC
  `).all(studentId);
}

// ===========================================
// Snapshot weakness queries
// ===========================================

function insertSnapshotWeakness(db, weakness) {
  const stmt = getStmt(db, 'insertWeakness', `
    INSERT INTO snapshot_weaknesses (
      snapshot_id, weakness_type, area, current_level, target_level,
      severity, frequency, trend, impact
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    weakness.snapshot_id, weakness.weakness_type, weakness.area,
    weakness.current_level, weakness.target_level,
    weakness.severity, weakness.frequency, weakness.trend, weakness.impact
  );
}

function getWeaknessesForSnapshot(db, snapshotId) {
  return db.prepare('SELECT * FROM snapshot_weaknesses WHERE snapshot_id = ?').all(snapshotId);
}

// ===========================================
// Reinforcement template queries
// ===========================================

function insertReinforcementTemplate(db, template) {
  const stmt = getStmt(db, 'insertTemplate', `
    INSERT OR IGNORE INTO reinforcement_templates (
      weakness_area, severity, title, description,
      activity_type, estimated_duration, dimension_impact_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    template.weakness_area, template.severity, template.title,
    template.description, template.activity_type, template.estimated_duration,
    template.dimension_impact_json
  );
}

function getTemplatesForWeakness(db, weaknessArea, severity) {
  let sql = 'SELECT * FROM reinforcement_templates WHERE weakness_area = ?';
  const params = [weaknessArea];
  if (severity) {
    sql += ' AND severity = ?';
    params.push(severity);
  }
  return db.prepare(sql).all(...params);
}

function getAllTemplates(db) {
  return db.prepare('SELECT * FROM reinforcement_templates ORDER BY weakness_area, severity').all();
}

// ===========================================
// Reinforcement recommendation queries
// ===========================================

function insertRecommendation(db, rec) {
  const stmt = getStmt(db, 'insertRecommendation', `
    INSERT INTO reinforcement_recommendations (
      snapshot_id, weakness_id, source, template_id,
      title, description, activity_type, estimated_duration,
      projected_impact_json, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    rec.snapshot_id, rec.weakness_id || null, rec.source,
    rec.template_id || null, rec.title, rec.description,
    rec.activity_type, rec.estimated_duration,
    rec.projected_impact_json || null, rec.priority || 0,
    rec.status || 'pending'
  );
}

function getRecommendationsForSnapshot(db, snapshotId) {
  return db.prepare(`
    SELECT r.*, sw.area as weakness_area, sw.severity as weakness_severity
    FROM reinforcement_recommendations r
    LEFT JOIN snapshot_weaknesses sw ON r.weakness_id = sw.id
    WHERE r.snapshot_id = ?
    ORDER BY r.priority DESC
  `).all(snapshotId);
}

function updateRecommendationStatus(db, recId, status) {
  return db.prepare(`
    UPDATE reinforcement_recommendations SET status = ? WHERE id = ?
  `).run(status, recId);
}

// ===========================================
// Desired persona queries
// ===========================================

function upsertDesiredPersona(db, studentId, personaTypeId, setBy, setByName, reason) {
  const stmt = getStmt(db, 'upsertDesired', `
    INSERT INTO desired_persona (student_id, persona_type_id, set_by, set_by_name, reason)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id) DO UPDATE SET
      persona_type_id = excluded.persona_type_id,
      set_by = excluded.set_by,
      set_by_name = excluded.set_by_name,
      reason = excluded.reason,
      set_at = datetime('now')
  `);
  return stmt.run(studentId, personaTypeId, setBy, setByName || null, reason || null);
}

function getDesiredPersona(db, studentId) {
  return db.prepare('SELECT * FROM desired_persona WHERE student_id = ?').get(studentId);
}

function deleteDesiredPersona(db, studentId) {
  return db.prepare('DELETE FROM desired_persona WHERE student_id = ?').run(studentId);
}

// ===========================================
// Projected persona queries
// ===========================================

function upsertProjectedPersona(db, snapshotId, projected) {
  const stmt = getStmt(db, 'upsertProjected', `
    INSERT INTO projected_persona (
      snapshot_id, projected_ei, projected_sc, projected_pt,
      projected_rn, projected_ad, projected_lg,
      projected_type_id, projected_type_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id) DO UPDATE SET
      projected_ei = excluded.projected_ei,
      projected_sc = excluded.projected_sc,
      projected_pt = excluded.projected_pt,
      projected_rn = excluded.projected_rn,
      projected_ad = excluded.projected_ad,
      projected_lg = excluded.projected_lg,
      projected_type_id = excluded.projected_type_id,
      projected_type_name = excluded.projected_type_name
  `);
  return stmt.run(
    snapshotId,
    projected.projected_ei, projected.projected_sc, projected.projected_pt,
    projected.projected_rn, projected.projected_ad, projected.projected_lg,
    projected.projected_type_id, projected.projected_type_name
  );
}

function getProjectedPersona(db, snapshotId) {
  return db.prepare('SELECT * FROM projected_persona WHERE snapshot_id = ?').get(snapshotId);
}

// ===========================================
// Aggregation helpers for API endpoints
// ===========================================

function getStudentReportStats(db, studentId) {
  return db.prepare(`
    SELECT
      COUNT(*) as total_reports,
      MIN(report_date) as earliest_date,
      MAX(report_date) as latest_date,
      AVG(attention) as avg_attention,
      AVG(retention) as avg_retention,
      AVG(comprehension) as avg_comprehension,
      AVG(behavior) as avg_behavior,
      AVG(handwriting) as avg_handwriting,
      AVG(conversation) as avg_conversation
    FROM daily_reports
    WHERE student_id = ?
  `).get(studentId);
}

function getSubjectComparison(db, studentId) {
  return db.prepare(`
    SELECT
      subject,
      COUNT(*) as report_count,
      ROUND(AVG(
        (COALESCE(attention,0) + COALESCE(retention,0) + COALESCE(comprehension,0) +
         COALESCE(behavior,0) + COALESCE(handwriting,0) + COALESCE(conversation,0)) / 6.0
      ), 2) as average_rating
    FROM daily_reports
    WHERE student_id = ?
    GROUP BY subject
    ORDER BY average_rating DESC
  `).all(studentId);
}

function getStudentTeachers(db, studentId) {
  return db.prepare(`
    SELECT DISTINCT teacher_name FROM daily_reports WHERE student_id = ? ORDER BY teacher_name
  `).all(studentId).map(r => r.teacher_name);
}

function getStudentSubjects(db, studentId) {
  return db.prepare(`
    SELECT DISTINCT subject FROM daily_reports WHERE student_id = ? ORDER BY subject
  `).all(studentId).map(r => r.subject);
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
  // Clear prepared statements cache
  Object.keys(_stmts).forEach(k => delete _stmts[k]);
}

module.exports = {
  getDb,
  initSchema,
  closeDb,
  DB_PATH,
  // Students
  upsertStudent,
  getAllStudents,
  getStudentByName,
  // Daily reports
  insertDailyReport,
  getReportsForStudent,
  getReportsUpToDate,
  getUniqueReportDates,
  // Quiz data
  upsertQuizData,
  getQuizData,
  // Academic enabler
  upsertAcademicEnabler,
  // Attendance overrides
  insertAttendanceOverride,
  // Persona snapshots
  insertPersonaSnapshot,
  getLatestSnapshot,
  getSnapshotByDate,
  getSnapshotTimeline,
  // Snapshot weaknesses
  insertSnapshotWeakness,
  getWeaknessesForSnapshot,
  // Reinforcement templates
  insertReinforcementTemplate,
  getTemplatesForWeakness,
  getAllTemplates,
  // Reinforcement recommendations
  insertRecommendation,
  getRecommendationsForSnapshot,
  updateRecommendationStatus,
  // Desired persona
  upsertDesiredPersona,
  getDesiredPersona,
  deleteDesiredPersona,
  // Projected persona
  upsertProjectedPersona,
  getProjectedPersona,
  // Aggregation helpers
  getStudentReportStats,
  getSubjectComparison,
  getStudentTeachers,
  getStudentSubjects
};
