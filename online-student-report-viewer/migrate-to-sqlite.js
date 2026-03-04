#!/usr/bin/env node
/**
 * Migration script: CSV/JSON → SQLite
 * Imports all existing data and computes historical persona snapshots.
 *
 * Usage: node migrate-to-sqlite.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('./lib/db');
const engine = require('./lib/persona-engine');

const CSV_PATH = path.join(__dirname, '../online-report-generator/online-reports.csv');
const PERSONALITY_DATA_PATH = path.join(__dirname, 'data', 'personality-data.json');
const ACADEMIC_ENABLER_PATH = path.join(__dirname, '../report-card-data-generator/academic-enabler.json');
const OVERRIDES_PATH = path.join(__dirname, '../submission-tracker/overrides.json');

// ============================================
// Reinforcement templates seed data
// ============================================

const REINFORCEMENT_TEMPLATES = [
  // Attention & Focus
  { weakness_area: 'Attention & Focus', severity: 'critical', title: 'Focused Attention Training', description: 'Start with 5-minute focused work intervals, gradually increasing to 15 minutes. Use a timer and reward completion.', activity_type: 'exercise', estimated_duration: '15 min/day', dimension_impact_json: JSON.stringify({ AD: -3, EI: 0 }) },
  { weakness_area: 'Attention & Focus', severity: 'critical', title: 'Distraction-Free Zone Setup', description: 'Create a dedicated study area with minimal distractions. Remove phone, close unnecessary tabs, use noise-canceling if needed.', activity_type: 'environment', estimated_duration: 'ongoing', dimension_impact_json: JSON.stringify({ AD: -2 }) },
  { weakness_area: 'Attention & Focus', severity: 'significant', title: 'Pomodoro Technique Introduction', description: 'Work in 25-minute blocks with 5-minute breaks. Track completed pomodoros to build awareness of focus capacity.', activity_type: 'technique', estimated_duration: '25 min blocks', dimension_impact_json: JSON.stringify({ AD: -3, RN: -2 }) },
  { weakness_area: 'Attention & Focus', severity: 'moderate', title: 'Active Note-Taking Practice', description: 'Take Cornell-style notes during lessons. Write questions in the margin to maintain engagement.', activity_type: 'technique', estimated_duration: 'during class', dimension_impact_json: JSON.stringify({ AD: -2, LG: -2 }) },

  // Information Retention
  { weakness_area: 'Information Retention', severity: 'critical', title: 'Spaced Repetition System', description: 'Use flashcards with spaced repetition (Anki or physical cards). Review daily, then every 3 days, then weekly.', activity_type: 'technique', estimated_duration: '15 min/day', dimension_impact_json: JSON.stringify({ RN: -3, LG: -2 }) },
  { weakness_area: 'Information Retention', severity: 'critical', title: 'Teach-Back Method', description: 'After each lesson, explain the key concepts to a partner or family member. Teaching reinforces memory.', activity_type: 'exercise', estimated_duration: '10 min/lesson', dimension_impact_json: JSON.stringify({ SC: -3, EI: 2 }) },
  { weakness_area: 'Information Retention', severity: 'significant', title: 'Mind Mapping Sessions', description: 'Create visual mind maps connecting new concepts to known ones. Use colors and images for better recall.', activity_type: 'exercise', estimated_duration: '15 min/topic', dimension_impact_json: JSON.stringify({ LG: 3, PT: -2 }) },
  { weakness_area: 'Information Retention', severity: 'moderate', title: 'Daily Review Journal', description: 'Spend 5 minutes at end of day writing 3 key things learned. Weekly review of all entries.', activity_type: 'exercise', estimated_duration: '5 min/day', dimension_impact_json: JSON.stringify({ RN: -2, LG: -1 }) },

  // Comprehension
  { weakness_area: 'Comprehension', severity: 'critical', title: 'Scaffolded Reading Strategy', description: 'Pre-read headings and summaries before deep reading. Break complex texts into smaller chunks with comprehension checks.', activity_type: 'technique', estimated_duration: '20 min/session', dimension_impact_json: JSON.stringify({ PT: 3, LG: 2 }) },
  { weakness_area: 'Comprehension', severity: 'critical', title: 'Question-Answer Relationship (QAR)', description: 'Practice categorizing questions as "Right There," "Think & Search," "Author & Me," or "On My Own" to build comprehension strategies.', activity_type: 'technique', estimated_duration: '15 min/session', dimension_impact_json: JSON.stringify({ PT: 2, AD: -2 }) },
  { weakness_area: 'Comprehension', severity: 'significant', title: 'Socratic Discussion Practice', description: 'Engage in guided questioning sessions. Ask "why" and "how" after each concept is introduced.', activity_type: 'discussion', estimated_duration: '10 min/lesson', dimension_impact_json: JSON.stringify({ SC: -3, PT: 2 }) },
  { weakness_area: 'Comprehension', severity: 'moderate', title: 'Summarize in Own Words', description: 'After each paragraph or section, write a 1-2 sentence summary using own vocabulary. Compare with original.', activity_type: 'exercise', estimated_duration: 'during reading', dimension_impact_json: JSON.stringify({ PT: 2, LG: 1 }) },

  // Behavior & Self-Regulation (Cooperation in online context)
  { weakness_area: 'Behavior & Self-Regulation', severity: 'critical', title: 'Online Cooperation Goals', description: 'Set 3 specific, measurable cooperation goals per week for online sessions. Track daily with simple checkmarks. Reward achievement.', activity_type: 'management', estimated_duration: '5 min/day', dimension_impact_json: JSON.stringify({ RN: -3, AD: -2 }) },
  { weakness_area: 'Behavior & Self-Regulation', severity: 'critical', title: 'Self-Regulation Toolkit', description: 'Learn and practice 3 calming techniques: deep breathing, counting, and positive self-talk. Use when feeling dysregulated during online class.', activity_type: 'exercise', estimated_duration: '5 min as needed', dimension_impact_json: JSON.stringify({ AD: -3, SC: 1 }) },
  { weakness_area: 'Behavior & Self-Regulation', severity: 'significant', title: 'Online Class Expectations Review', description: 'Start each online session reviewing participation rules. End each session self-evaluating cooperation with 1-5 rating.', activity_type: 'management', estimated_duration: '5 min/day', dimension_impact_json: JSON.stringify({ RN: -2 }) },
  { weakness_area: 'Behavior & Self-Regulation', severity: 'moderate', title: 'Positive Reinforcement Chart', description: 'Track good cooperation moments in online classes. After accumulating 10 stars, earn a small reward. Focus on catching positive behaviors.', activity_type: 'management', estimated_duration: 'ongoing', dimension_impact_json: JSON.stringify({ RN: -1 }) },

  // Written Expression (Engagement in online context)
  { weakness_area: 'Written Expression', severity: 'critical', title: 'Active Screen Engagement Practice', description: 'Practice maintaining active engagement during online lessons for 10 minutes at a time. Use interactive tools and respond to prompts.', activity_type: 'exercise', estimated_duration: '10 min/day', dimension_impact_json: JSON.stringify({ LG: -3, PT: -2 }) },
  { weakness_area: 'Written Expression', severity: 'critical', title: 'Ergonomic Online Setup', description: 'Ensure proper screen distance, desk height, good lighting, and minimal distractions in the online learning environment.', activity_type: 'environment', estimated_duration: 'ongoing', dimension_impact_json: JSON.stringify({ PT: -2 }) },
  { weakness_area: 'Written Expression', severity: 'significant', title: 'Interactive Response Practice', description: 'Practice typing responses and using digital tools during online lessons. Engage with chat, polls, and shared documents actively.', activity_type: 'exercise', estimated_duration: '10 min/day', dimension_impact_json: JSON.stringify({ LG: -2, RN: -1 }) },
  { weakness_area: 'Written Expression', severity: 'moderate', title: 'Engagement Quality Focus', description: 'Focus on quality of online participation rather than speed. Practice thoughtful responses and active listening during virtual sessions.', activity_type: 'exercise', estimated_duration: '10 min/day', dimension_impact_json: JSON.stringify({ AD: -2 }) },

  // Verbal Communication
  { weakness_area: 'Verbal Communication', severity: 'critical', title: 'Daily Conversation Starter', description: 'Begin each class with a simple prompted discussion. Use sentence frames: "I think... because..." to build confidence.', activity_type: 'discussion', estimated_duration: '5 min/class', dimension_impact_json: JSON.stringify({ SC: -5, EI: -2 }) },
  { weakness_area: 'Verbal Communication', severity: 'critical', title: 'Paired Discussion Practice', description: 'Start with 1-on-1 discussions before whole class. Practice with a supportive partner. Gradually expand audience.', activity_type: 'discussion', estimated_duration: '10 min/session', dimension_impact_json: JSON.stringify({ SC: -4, AD: 2 }) },
  { weakness_area: 'Verbal Communication', severity: 'significant', title: 'Prepared Participation', description: 'Write 2-3 thoughts before discussion starts. Having prepared notes reduces anxiety and increases contribution quality.', activity_type: 'technique', estimated_duration: '5 min prep', dimension_impact_json: JSON.stringify({ SC: -3, AD: -2 }) },
  { weakness_area: 'Verbal Communication', severity: 'moderate', title: 'Show-and-Tell Style Sharing', description: 'Share something interesting each week with the class. Start with topics the student is passionate about.', activity_type: 'exercise', estimated_duration: '5 min/week', dimension_impact_json: JSON.stringify({ SC: -2, EI: -1, RN: 1 }) },

  // Cross-dimension templates
  { weakness_area: 'Attention & Focus', severity: 'significant', title: 'Physical Movement Breaks', description: 'Incorporate 2-3 minute movement breaks every 20 minutes. Stretching, walking, or simple exercises to reset focus.', activity_type: 'exercise', estimated_duration: '3 min/break', dimension_impact_json: JSON.stringify({ PT: -2, RN: 1 }) },
  { weakness_area: 'Information Retention', severity: 'significant', title: 'Multi-Sensory Learning', description: 'Combine reading with drawing, acting out, or building. Engage multiple senses to strengthen memory pathways.', activity_type: 'technique', estimated_duration: '20 min/session', dimension_impact_json: JSON.stringify({ PT: -3, EI: -1 }) },
  { weakness_area: 'Comprehension', severity: 'significant', title: 'Visual Organizer Templates', description: 'Use graphic organizers (Venn diagrams, flowcharts, T-charts) to structure understanding of complex topics.', activity_type: 'technique', estimated_duration: '15 min/topic', dimension_impact_json: JSON.stringify({ LG: 2, PT: -1 }) },
  { weakness_area: 'Behavior & Self-Regulation', severity: 'significant', title: 'Mindfulness Minute', description: 'Practice 1-minute mindfulness exercises at the start of each class. Focus on breathing and body awareness.', activity_type: 'exercise', estimated_duration: '1 min/class', dimension_impact_json: JSON.stringify({ AD: -2, RN: -1 }) },
  { weakness_area: 'Written Expression', severity: 'significant', title: 'Digital-to-Paper Bridge', description: 'Type thoughts first, then practice writing them by hand. Reduces cognitive load while building writing skills.', activity_type: 'technique', estimated_duration: '15 min/session', dimension_impact_json: JSON.stringify({ PT: -2, LG: -1 }) },
  { weakness_area: 'Verbal Communication', severity: 'significant', title: 'Recording & Review', description: 'Record short verbal responses (30 seconds) and listen back. Self-evaluate clarity and completeness. Practice improving.', activity_type: 'exercise', estimated_duration: '5 min/session', dimension_impact_json: JSON.stringify({ SC: -2, AD: -1 }) },
];

// ============================================
// Migration functions
// ============================================

function migrateCSV(database) {
  return new Promise((resolve, reject) => {
    console.log('  Reading CSV from:', CSV_PATH);
    if (!fs.existsSync(CSV_PATH)) {
      console.log('  WARNING: CSV file not found, skipping');
      resolve(0);
      return;
    }

    const rows = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => {
        console.log(`  Parsed ${rows.length} CSV rows`);

        // Deduplicate: keep latest entry for each Student+Date+Subject
        const seen = new Map();
        rows.forEach((row, index) => {
          const key = `${row['Student Name']}|${row['Date']}|${row['Subject']}`;
          seen.set(key, { row, index });
        });
        const deduped = Array.from(seen.values()).sort((a, b) => a.index - b.index).map(i => i.row);
        console.log(`  After dedup: ${deduped.length} unique reports`);

        // Insert in a transaction
        const insertMany = database.transaction((reports) => {
          let studentCount = 0;
          let reportCount = 0;
          const studentCache = {};

          for (const row of reports) {
            const studentName = row['Student Name'];
            if (!studentName) continue;

            // Upsert student
            if (!studentCache[studentName]) {
              const result = db.upsertStudent(database, studentName, row['Student ID'], row['Grade Level'], row['Student Gender']);
              studentCache[studentName] = result.id;
              studentCount++;
            }

            const studentId = studentCache[studentName];

            db.insertDailyReport(database, {
              student_id: studentId,
              report_date: row['Date'] || null,
              day_of_week: row['Day of Week'] || null,
              teacher_name: row['Teacher Name'] || null,
              teacher_id: row['Teacher ID'] || null,
              subject: row['Subject'] || null,
              is_substitute: null,
              skill_focus: null,
              sf_met: null,
              current_lesson: row['Current Lesson'] || null,
              materials: row['Materials'] || null,
              homework: row['Homework'] || null,
              next_lesson: null,
              activities_finished: row['Activities Finished'] || null,
              activities_not_finished: row['Activities Not Finished'] || null,
              attention: parseFloat(row['Attention']) || null,
              retention: parseFloat(row['Retention']) || null,
              comprehension: parseFloat(row['Comprehension']) || null,
              behavior: parseFloat(row['Cooperation']) || null,
              handwriting: parseFloat(row['Engagement']) || null,
              conversation: parseFloat(row['Conversation']) || null,
              skills_json: row['Skills'] || null,
              scores_json: null,
              narrative: row['Narrative'] || null,
              wpm_initial: null,
              gbwt_initial: null,
              reading_level_initial: null,
              interview_score: null
            });
            reportCount++;
          }
          return { studentCount, reportCount };
        });

        const result = insertMany(deduped);
        console.log(`  Imported ${result.studentCount} students, ${result.reportCount} reports`);
        resolve(result.reportCount);
      })
      .on('error', reject);
  });
}

function migratePersonalityData(database) {
  console.log('  Reading personality data from:', PERSONALITY_DATA_PATH);
  if (!fs.existsSync(PERSONALITY_DATA_PATH)) {
    console.log('  WARNING: personality-data.json not found, skipping');
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(PERSONALITY_DATA_PATH, 'utf8'));
  let count = 0;

  const insertAll = database.transaction(() => {
    for (const [studentName, studentData] of Object.entries(data)) {
      const student = db.getStudentByName(database, studentName);
      if (!student) {
        // Student might not have reports yet, create them
        const result = db.upsertStudent(database, studentName, null, null, null);
        const studentId = result.id;
        if (studentData.quizData) {
          db.upsertQuizData(database, studentId,
            studentData.quizData.taken,
            studentData.quizData.takenAt,
            JSON.stringify(studentData.quizData.answers),
            JSON.stringify(studentData.quizData.scores)
          );
          count++;
        }
      } else {
        if (studentData.quizData) {
          db.upsertQuizData(database, student.id,
            studentData.quizData.taken,
            studentData.quizData.takenAt,
            JSON.stringify(studentData.quizData.answers),
            JSON.stringify(studentData.quizData.scores)
          );
          count++;
        }
      }
    }
  });

  insertAll();
  console.log(`  Imported ${count} quiz records`);
  return count;
}

function migrateAcademicEnabler(database) {
  console.log('  Reading academic enabler from:', ACADEMIC_ENABLER_PATH);
  if (!fs.existsSync(ACADEMIC_ENABLER_PATH)) {
    console.log('  WARNING: academic-enabler.json not found, skipping');
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(ACADEMIC_ENABLER_PATH, 'utf8'));
  let count = 0;

  const insertAll = database.transaction(() => {
    for (const entry of data) {
      const studentName = entry.student;
      if (!studentName) continue;

      let student = db.getStudentByName(database, studentName);
      if (!student) {
        const result = db.upsertStudent(database, studentName, null, null, null);
        student = { id: result.id };
      }

      db.upsertAcademicEnabler(database,
        student.id,
        entry.type || 'initial',
        entry.season || '',
        JSON.stringify(entry.teachers || []),
        JSON.stringify(entry.ratings || {}),
        entry.createdAt || null,
        entry.updatedAt || null
      );
      count++;
    }
  });

  insertAll();
  console.log(`  Imported ${count} academic enabler records`);
  return count;
}

function migrateOverrides(database) {
  console.log('  Reading overrides from:', OVERRIDES_PATH);
  if (!fs.existsSync(OVERRIDES_PATH)) {
    console.log('  WARNING: overrides.json not found, skipping');
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  let count = 0;

  const insertAll = database.transaction(() => {
    for (const key of Object.keys(data)) {
      if (key === 'test') continue; // skip test entry

      const parts = key.split('|');
      if (parts.length >= 4) {
        const [overrideDate, studentName, teacherName, timeSlot] = parts;
        db.insertAttendanceOverride(database, overrideDate, studentName, teacherName, timeSlot, 'absent');
        count++;
      }
    }
  });

  insertAll();
  console.log(`  Imported ${count} attendance override records`);
  return count;
}

function seedReinforcementTemplates(database) {
  const insertAll = database.transaction(() => {
    for (const template of REINFORCEMENT_TEMPLATES) {
      db.insertReinforcementTemplate(database, template);
    }
  });

  insertAll();
  console.log(`  Seeded ${REINFORCEMENT_TEMPLATES.length} reinforcement templates`);
}

// ============================================
// Phase 2: Historical persona snapshots
// ============================================

function computeHistoricalSnapshots(database) {
  const students = db.getAllStudents(database);
  console.log(`  Computing snapshots for ${students.length} students...`);

  let totalSnapshots = 0;
  let totalWeaknesses = 0;
  let totalRecommendations = 0;

  const allTemplates = db.getAllTemplates(database);

  const processAll = database.transaction(() => {
    for (const student of students) {
      const dates = db.getUniqueReportDates(database, student.id);
      if (dates.length === 0) continue;

      // Get quiz data for this student
      const quizRow = db.getQuizData(database, student.id);
      let quizData = null;
      if (quizRow && quizRow.taken) {
        quizData = {
          taken: true,
          scores: JSON.parse(quizRow.scores_json)
        };
      }

      // For each date, check if cumulative reports >= 3
      let snapshotsForStudent = 0;
      for (const date of dates) {
        const reportsUpToDate = db.getReportsUpToDate(database, student.id, date);
        if (reportsUpToDate.length < engine.MIN_REPORTS_FOR_PERSONALITY) continue;

        // Get subject comparison for reports up to this date
        const subjectMap = {};
        for (const r of reportsUpToDate) {
          if (!r.subject) continue;
          if (!subjectMap[r.subject]) {
            subjectMap[r.subject] = { totalRating: 0, count: 0 };
          }
          const avg = [r.attention, r.retention, r.comprehension, r.behavior, r.handwriting, r.conversation]
            .map(v => parseFloat(v)).filter(v => !isNaN(v));
          if (avg.length > 0) {
            subjectMap[r.subject].totalRating += avg.reduce((a, b) => a + b, 0) / avg.length;
            subjectMap[r.subject].count++;
          }
        }
        const subjectComparison = Object.entries(subjectMap).map(([subject, data]) => ({
          subject,
          averageRating: parseFloat((data.totalRating / data.count).toFixed(2)),
          reportCount: data.count
        }));

        const result = engine.computeSnapshot(reportsUpToDate, quizData, subjectComparison);
        if (!result) continue;

        // Insert snapshot
        const snapshotData = {
          ...result.snapshot,
          student_id: student.id,
          snapshot_date: date
        };
        const insertResult = db.insertPersonaSnapshot(database, snapshotData);
        const snapshotId = insertResult.lastInsertRowid;
        totalSnapshots++;
        snapshotsForStudent++;

        // Insert weaknesses
        for (const weakness of result.weaknesses) {
          const weaknessResult = db.insertSnapshotWeakness(database, {
            ...weakness,
            snapshot_id: snapshotId
          });
          totalWeaknesses++;

          // Match templates to this weakness
          const matchingTemplates = allTemplates.filter(t =>
            t.weakness_area === weakness.area &&
            (t.severity === weakness.severity || !weakness.severity)
          );
          for (const template of matchingTemplates.slice(0, 2)) {
            db.insertRecommendation(database, {
              snapshot_id: snapshotId,
              weakness_id: weaknessResult.lastInsertRowid,
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
            totalRecommendations++;
          }
        }
      }

      if (snapshotsForStudent > 0) {
        process.stdout.write(`    ${student.full_name}: ${snapshotsForStudent} snapshots\n`);
      }
    }
  });

  processAll();
  console.log(`  Total: ${totalSnapshots} snapshots, ${totalWeaknesses} weaknesses, ${totalRecommendations} recommendations`);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('=== STELLAR Data Migration to SQLite ===\n');

  // Initialize schema
  console.log('[1/7] Creating database schema...');
  const database = db.initSchema();
  console.log('  Database created at:', db.DB_PATH);

  // Phase 1: Import data sources
  console.log('\n[2/7] Importing CSV reports...');
  await migrateCSV(database);

  console.log('\n[3/7] Importing personality quiz data...');
  migratePersonalityData(database);

  console.log('\n[4/7] Importing academic enabler data...');
  migrateAcademicEnabler(database);

  console.log('\n[5/7] Importing attendance overrides...');
  migrateOverrides(database);

  console.log('\n[6/7] Seeding reinforcement templates...');
  seedReinforcementTemplates(database);

  // Phase 2: Compute historical snapshots
  console.log('\n[7/7] Computing historical persona snapshots...');
  computeHistoricalSnapshots(database);

  // Summary
  console.log('\n=== Migration Complete ===');
  const counts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM students) as students,
      (SELECT COUNT(*) FROM daily_reports) as reports,
      (SELECT COUNT(*) FROM quiz_data) as quizzes,
      (SELECT COUNT(*) FROM academic_enabler) as enablers,
      (SELECT COUNT(*) FROM attendance_overrides) as overrides,
      (SELECT COUNT(*) FROM persona_snapshots) as snapshots,
      (SELECT COUNT(*) FROM snapshot_weaknesses) as weaknesses,
      (SELECT COUNT(*) FROM reinforcement_templates) as templates,
      (SELECT COUNT(*) FROM reinforcement_recommendations) as recommendations
  `).get();

  console.log('  Students:', counts.students);
  console.log('  Daily Reports:', counts.reports);
  console.log('  Quiz Records:', counts.quizzes);
  console.log('  Academic Enabler Records:', counts.enablers);
  console.log('  Attendance Overrides:', counts.overrides);
  console.log('  Persona Snapshots:', counts.snapshots);
  console.log('  Snapshot Weaknesses:', counts.weaknesses);
  console.log('  Reinforcement Templates:', counts.templates);
  console.log('  Reinforcement Recommendations:', counts.recommendations);

  db.closeDb();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  db.closeDb();
  process.exit(1);
});
