const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 1444;
const SCHEDULING_APP_URL = process.env.SCHEDULING_APP_URL || 'http://localhost:5555';
const ATTENDANCE_CHECKER_URL = process.env.ATTENDANCE_CHECKER_URL || 'http://localhost:3002';
const REPORTS_CSV_PATH = path.resolve(__dirname, process.env.REPORTS_CSV_PATH || '../teacher-report-generator/reports.csv');
const OVERRIDES_FILE = path.resolve(__dirname, 'overrides.json');
const OVERRIDES_LOG_FILE = path.resolve(__dirname, 'overrides-log.json');

// Load override log
function loadOverrideLog() {
  try {
    if (fs.existsSync(OVERRIDES_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_LOG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading override log:', error.message);
  }
  return [];
}

// Append to override log
function appendToOverrideLog(entry) {
  try {
    const log = loadOverrideLog();
    log.push(entry);
    fs.writeFileSync(OVERRIDES_LOG_FILE, JSON.stringify(log, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving override log:', error.message);
    return false;
  }
}

// Load overrides from file
function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      const data = fs.readFileSync(OVERRIDES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading overrides:', error.message);
  }
  return {};
}

// Save overrides to file
function saveOverrides(overrides) {
  try {
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving overrides:', error.message);
    return false;
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Helper function to normalize student names for comparison
function normalizeStudentName(name) {
  if (!name) return '';
  // Remove extra whitespace, convert to lowercase
  return name.trim().toLowerCase()
    // Remove Korean characters in brackets [한글]
    .replace(/\s*\[.*?\]\s*/g, '')
    // Remove English name in parentheses (Name)
    .replace(/\s*\(.*?\)\s*/g, '')
    // Remove inline Korean characters (not in brackets)
    .replace(/[\u3131-\u318E\uAC00-\uD7A3]+/g, '')
    // Remove extra spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to normalize romanization variants
function normalizeRomanization(name) {
  if (!name) return '';
  return name.toLowerCase()
    // Common Korean romanization variants
    .replace(/oo/g, 'u')      // Yoon → Yun, Woon → Wun
    .replace(/ee/g, 'i')      // Lee → Li, Hee → Hi
    .replace(/eu/g, 'u')      // Eun → Un
    .replace(/ae/g, 'e')      // Jae → Je, Hae → He
    .replace(/wo/g, 'o')      // Won → On
    .replace(/woo/g, 'u')     // Woo → U
    .replace(/young/g, 'yung') // Young → Yung
    .replace(/hyun/g, 'hyun')  // Keep hyun
    .replace(/jun/g, 'jun')    // Keep jun
    .trim();
}

// Extract English name from parentheses in a string
function extractEnglishName(name) {
  if (!name) return null;
  const match = name.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    const extracted = match[1].trim();
    // Filter out Korean characters - only return if it's an English name
    if (!/[\u3131-\u318E\uAC00-\uD7A3]/.test(extracted)) {
      return extracted.toLowerCase();
    }
  }
  return null;
}

// Extract Korean name from brackets in a string
function extractKoreanName(name) {
  if (!name) return null;
  const match = name.match(/\[([^\]]+)\]/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

// Helper function to extract teacher short name from full name
// CSV format: "[Delene] Mylene Bilon" -> "delene"
// Scheduling format: "Delene" -> "delene"
function extractTeacherShortName(name) {
  if (!name) return '';
  // Try to extract from brackets first [Name]
  const bracketMatch = name.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim().toLowerCase();
  }

  // Split into words and skip common titles
  const words = name.trim().toLowerCase().split(/\s+/);
  const titles = ['mr.', 'mr', 'ms.', 'ms', 'mrs.', 'mrs', 'miss', 'dr.', 'dr', 'prof.', 'prof', 'teacher', 't.'];

  // Find first word that's not a title
  for (const word of words) {
    if (!titles.includes(word) && word.length > 1) {
      return word;
    }
  }

  // Fallback: return first word if no non-title found
  return words[0] || '';
}

// Helper function to check if two teacher names match
function teacherNamesMatch(csvTeacher, schedTeacher) {
  if (!csvTeacher || !schedTeacher) return false;

  const csvShort = extractTeacherShortName(csvTeacher);
  const schedShort = extractTeacherShortName(schedTeacher);

  if (csvShort === schedShort) return true;

  // Also check if one contains the other
  if (csvShort.includes(schedShort) || schedShort.includes(csvShort)) return true;

  return false;
}

// Helper function to check if two student names match (improved fuzzy matching)
function studentNamesMatch(name1, name2) {
  if (!name1 || !name2) return false;

  const norm1 = normalizeStudentName(name1);
  const norm2 = normalizeStudentName(name2);

  // Strategy 1: Exact match after normalization
  if (norm1 && norm2 && norm1 === norm2) return true;

  // Strategy 2: Romanization-normalized match (handles Yoon/Yun, Lee/Li, etc.)
  const roman1 = normalizeRomanization(norm1);
  const roman2 = normalizeRomanization(norm2);
  if (roman1 && roman2 && roman1 === roman2) return true;

  // Strategy 3: Contains check (for partial matches)
  if (norm1 && norm2) {
    if (norm1.length >= 3 && norm2.length >= 3) {
      if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    }
  }

  // Strategy 4: Korean name matching (if both have Korean in brackets)
  const korean1 = extractKoreanName(name1);
  const korean2 = extractKoreanName(name2);
  if (korean1 && korean2) {
    // If both have Korean names, they MUST match - don't fall through to English matching
    // This prevents "Kim Jo Han (John) [김조한]" from matching "Han Dong Yun (John) [한동윤]"
    return korean1 === korean2;
  }

  // Strategy 5: English name matching (extract from parentheses and compare)
  // Only used when at least one name doesn't have a Korean portion
  const english1 = extractEnglishName(name1);
  const english2 = extractEnglishName(name2);
  if (english1 && english2 && english1 === english2) return true;

  // Strategy 6: Direct English name comparison
  // This handles when scheduling app provides english_name directly (no parentheses)
  // e.g., name1 = "Kim Ji Yun (Annabeth) [김지윤]", name2 = "Annabeth"
  // But only if name1 doesn't have a Korean name that could be used for stricter matching
  const name2Lower = name2.trim().toLowerCase();
  if (english1 && name2Lower === english1 && !korean1) return true;

  // Reverse: name1 might be the plain English name
  const name1Lower = name1.trim().toLowerCase();
  if (english2 && name1Lower === english2 && !korean2) return true;

  // Strategy 7: Check if plain name2 appears in name1's English portion or vice versa
  // This catches cases where english_name is provided without parentheses
  // But only if the name with Korean portion doesn't have one to match against
  if (name2Lower.length >= 3 && !name2Lower.includes(' ') && !korean1) {
    // name2 looks like a single English name (e.g., "Annabeth")
    if (name1.toLowerCase().includes(`(${name2Lower})`) ||
        name1.toLowerCase().includes(name2Lower)) {
      return true;
    }
  }
  if (name1Lower.length >= 3 && !name1Lower.includes(' ') && !korean2) {
    if (name2.toLowerCase().includes(`(${name1Lower})`) ||
        name2.toLowerCase().includes(name1Lower)) {
      return true;
    }
  }

  return false;
}

// Helper function to parse reports.csv
async function parseReportsCSV() {
  return new Promise((resolve, reject) => {
    const reports = [];

    if (!fs.existsSync(REPORTS_CSV_PATH)) {
      console.warn(`Reports CSV not found at: ${REPORTS_CSV_PATH}`);
      resolve([]);
      return;
    }

    fs.createReadStream(REPORTS_CSV_PATH)
      .pipe(csvParser())
      .on('data', (row) => {
        reports.push({
          date: row['Date'],
          dayOfWeek: row['Day of Week'],
          studentName: row['Student Name'],
          teacherName: row['Teacher Name'],
          subject: row['Subject'],
          isSubstitute: row['Is Substitute'] === 'YES'
        });
      })
      .on('end', () => {
        resolve(reports);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Helper function to fetch assignments from scheduling app
async function fetchAssignments(date) {
  try {
    const response = await fetch(`${SCHEDULING_APP_URL}/api/assignments?date=${date}`);
    if (!response.ok) {
      throw new Error(`Scheduling app returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching assignments:', error.message);
    throw error;
  }
}

// Helper function to fetch timeslots from scheduling app
async function fetchTimeslots() {
  try {
    const response = await fetch(`${SCHEDULING_APP_URL}/api/timeslots`);
    if (!response.ok) {
      throw new Error(`Scheduling app returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching timeslots:', error.message);
    throw error;
  }
}

// Helper function to fetch rooms from scheduling app
async function fetchRooms() {
  try {
    const response = await fetch(`${SCHEDULING_APP_URL}/api/rooms`);
    if (!response.ok) {
      throw new Error(`Scheduling app returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching rooms:', error.message);
    throw error;
  }
}

// Sample data for demo mode
function getSampleData(date) {
  const sampleStudents = [
    {
      studentName: 'Yeon Soo Been [연수빈]',
      studentEnglishName: 'Clara',
      lastReportDate: '2026-01-27',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Edward', isSubstitute: false, submitted: true },
        { timeSlot: '3PM - 4PM', teacherName: 'Argel', isSubstitute: true, submitted: true },
        { timeSlot: '4PM - 5PM', teacherName: null, isSubstitute: false, submitted: null }
      ]
    },
    {
      studentName: 'Lee Ji Wan [이지완]',
      studentEnglishName: 'Ji Wan',
      lastReportDate: '2026-01-26',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Luis', isSubstitute: false, submitted: false },
        { timeSlot: '3PM - 4PM', teacherName: 'Delene', isSubstitute: false, submitted: true },
        { timeSlot: '4PM - 5PM', teacherName: 'Mari', isSubstitute: false, submitted: true }
      ]
    },
    {
      studentName: 'Lee Seo Eun [이서은]',
      studentEnglishName: 'Amy',
      lastReportDate: '2026-01-27',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Iann', isSubstitute: false, submitted: true },
        { timeSlot: '3PM - 4PM', teacherName: 'Paula', isSubstitute: false, submitted: false },
        { timeSlot: '4PM - 5PM', teacherName: 'Janice', isSubstitute: false, submitted: true }
      ]
    },
    {
      studentName: 'Hong Seo Yoo [홍서유]',
      studentEnglishName: 'Seo Yoo',
      lastReportDate: '2026-01-25',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Raf', isSubstitute: false, submitted: true },
        { timeSlot: '3PM - 4PM', teacherName: 'Cha', isSubstitute: false, submitted: false },
        { timeSlot: '4PM - 5PM', teacherName: null, isSubstitute: false, submitted: null }
      ]
    },
    {
      studentName: 'Yoo Ayoung [유아영]',
      studentEnglishName: 'Ayoung',
      lastReportDate: '2026-01-20',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Ezra', isSubstitute: false, submitted: false },
        { timeSlot: '3PM - 4PM', teacherName: null, isSubstitute: false, submitted: null },
        { timeSlot: '4PM - 5PM', teacherName: 'Ada', isSubstitute: false, submitted: false }
      ]
    },
    {
      studentName: 'Kim Min Jun [김민준]',
      studentEnglishName: 'Daniel',
      lastReportDate: '2026-01-27',
      classes: [
        { timeSlot: '2PM - 3PM', teacherName: 'Edward', isSubstitute: false, submitted: true },
        { timeSlot: '3PM - 4PM', teacherName: 'Luis', isSubstitute: false, submitted: true },
        { timeSlot: '4PM - 5PM', teacherName: 'Iann', isSubstitute: false, submitted: true }
      ]
    }
  ];

  const timeSlots = ['2PM - 3PM', '3PM - 4PM', '4PM - 5PM'];

  // Count totals
  let total = 0;
  let submitted = 0;
  sampleStudents.forEach(student => {
    student.classes.forEach(cls => {
      if (cls.teacherName) {
        total++;
        if (cls.submitted) submitted++;
      }
    });
  });
  const missing = total - submitted;
  const percentage = Math.round((submitted / total) * 100);

  return {
    date,
    demo: true,
    summary: { total, submitted, missing, percentage },
    timeSlots,
    students: sampleStudents
  };
}

// Main tracker endpoint
app.get('/api/tracker', async (req, res) => {
  try {
    const { date, demo } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
    }

    // Demo mode - return sample data
    if (demo === 'true') {
      return res.json(getSampleData(date));
    }

    // Fetch assignments from scheduling app
    let assignments;
    try {
      assignments = await fetchAssignments(date);
    } catch (error) {
      return res.status(503).json({
        error: 'Unable to connect to scheduling app',
        message: `Make sure the scheduling app is running at ${SCHEDULING_APP_URL}`,
        details: error.message
      });
    }

    // If no assignments, return early
    if (!assignments || assignments.length === 0) {
      return res.json({
        date,
        summary: { total: 0, submitted: 0, missing: 0, percentage: 0 },
        assignments: [],
        message: 'No classes scheduled for this date'
      });
    }

    // Fetch timeslots and rooms for display names
    const [timeslots, rooms] = await Promise.all([
      fetchTimeslots(),
      fetchRooms()
    ]);

    // Create lookup maps
    const timeslotMap = new Map(timeslots.map(ts => [ts.id, ts]));
    const roomMap = new Map(rooms.map(r => [r.id, r]));

    // Parse reports CSV
    const allReports = await parseReportsCSV();

    // Filter reports for the selected date
    const dateReports = allReports.filter(r => r.date === date);

    // Build a map of last report dates per student+teacher combination (from ALL reports)
    const lastReportByTeacherMap = new Map();
    allReports.forEach(report => {
      const studentName = report.studentName;
      const teacherName = report.teacherName;
      const reportDate = report.date;

      if (studentName && teacherName && reportDate) {
        const teacherShort = extractTeacherShortName(teacherName);
        const key = `${studentName.toLowerCase()}|${teacherShort}`;

        const existing = lastReportByTeacherMap.get(key);
        if (!existing || reportDate > existing.date) {
          lastReportByTeacherMap.set(key, {
            date: reportDate,
            studentName: studentName,
            teacherName: teacherName
          });
        }
      }
    });

    // Helper to find last report date for a student+teacher combination
    function findLastReportByTeacher(studentName, englishName, teacherName) {
      const teacherShort = extractTeacherShortName(teacherName);
      let latestDate = null;

      // Search ALL matching entries (student names may vary slightly in CSV)
      // and return the most recent date
      for (const [key, data] of lastReportByTeacherMap.entries()) {
        const [, storedTeacher] = key.split('|');
        if (storedTeacher === teacherShort) {
          if (studentNamesMatch(data.studentName, studentName) ||
              (englishName && studentNamesMatch(data.studentName, englishName))) {
            // Keep track of the latest date found
            if (!latestDate || data.date > latestDate) {
              latestDate = data.date;
            }
          }
        }
      }

      return latestDate;
    }

    // Helper function to check if an entry is a real student (not a placeholder)
    function isRealStudent(student) {
      const name = student.name || '';
      const nameLower = name.toLowerCase().trim();

      // Known placeholders to exclude
      const placeholders = ['ap chem', 'ap chemistry', 'online 1', 'online 2', 'online', 'test', 'n/a', 'tbd', 'vacant', 'empty'];
      if (placeholders.includes(nameLower)) return false;

      // Exclude if starts with common placeholder prefixes
      if (nameLower.startsWith('online') || nameLower.startsWith('ap ') || nameLower.startsWith('test')) return false;

      // A real student name should have:
      // - At least 2 characters
      // - Either Korean characters OR a space (for "First Last" format)
      if (name.length < 2) return false;

      const hasKorean = /[\u3131-\u318E\uAC00-\uD7A3]/.test(name);
      const hasSpace = name.includes(' ');
      const hasEnglishName = student.english_name && student.english_name.trim().length > 0;

      // Valid if has Korean, or has space in name, or has separate english_name
      return hasKorean || hasSpace || hasEnglishName;
    }

    // Build the tracker data
    const trackerData = [];

    // Track substitute assignments: Map<"studentName|scheduledTeacher", substituteReport>
    // This allows one substitute report to cover ALL slots of the same scheduled teacher
    const substituteAssignments = new Map();

    for (const assignment of assignments) {
      const timeslot = timeslotMap.get(assignment.time_slot_id);
      const room = roomMap.get(assignment.room_id);

      // For each student in the assignment (filter out placeholders)
      for (const student of (assignment.students || []).filter(isRealStudent)) {
        // For each teacher in the assignment
        for (const teacher of assignment.teachers || []) {
          // Check if a report exists for this student + teacher combination on this date
          const studentMatches = (report) =>
            studentNamesMatch(report.studentName, student.name) ||
            (student.english_name && studentNamesMatch(report.studentName, student.english_name));

          // Check for exact teacher match
          const exactMatch = dateReports.find(report =>
            studentMatches(report) && teacherNamesMatch(report.teacherName, teacher.name)
          );

          // Check for substitute match if no exact match
          let substituteMatch = null;
          let submittedBySubstitute = false;
          let actualTeacher = null;

          if (!exactMatch) {
            // Key for tracking substitute assignment per student+teacher
            const subKey = `${student.name}|${teacher.name}`;

            // Check if we already assigned a substitute for this student+teacher combo
            if (substituteAssignments.has(subKey)) {
              // Reuse the same substitute for all slots of this teacher
              substituteMatch = substituteAssignments.get(subKey);
              submittedBySubstitute = true;
              actualTeacher = extractTeacherShortName(substituteMatch.teacherName);
            } else {
              // Find substitute reports for this student that haven't been assigned yet
              const usedReports = new Set(substituteAssignments.values());
              const availableSubReports = dateReports.filter(report =>
                studentMatches(report) &&
                report.isSubstitute === true &&
                !usedReports.has(report)
              );

              if (availableSubReports.length > 0) {
                // Assign this substitute to cover ALL slots of this scheduled teacher
                substituteMatch = availableSubReports[0];
                substituteAssignments.set(subKey, substituteMatch);
                submittedBySubstitute = true;
                actualTeacher = extractTeacherShortName(substituteMatch.teacherName);
              }
            }
          }

          const reportExists = !!(exactMatch || substituteMatch);
          const matchingReport = exactMatch || substituteMatch;

          // Check if this time slot has already passed (only for today)
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const isToday = date === todayStr;

          let slotHasPassed = true; // Default: slot has passed (for past dates)
          if (isToday && timeslot) {
            // Parse the end time from the timeslot name (e.g., "8AM to 9AM" -> 9AM)
            const slotName = timeslot.name || timeslot.label || '';
            const endTimeMatch = slotName.match(/to\s+(\d+)(AM|PM)/i);
            if (endTimeMatch) {
              let endHour = parseInt(endTimeMatch[1]);
              const period = endTimeMatch[2].toUpperCase();

              // Convert to 24-hour format
              if (period === 'PM' && endHour !== 12) endHour += 12;
              if (period === 'AM' && endHour === 12) endHour = 0;

              const currentHour = now.getHours();
              slotHasPassed = currentHour >= endHour;
            }
          }

          // For last report date: if substitute submitted, use substitute's report date
          // Otherwise, use the scheduled teacher's last report date
          let lastReportDate;
          if (submittedBySubstitute && substituteMatch) {
            // Use the substitute report's date
            lastReportDate = substituteMatch.date;
          } else {
            lastReportDate = findLastReportByTeacher(student.name, student.english_name, teacher.name);
          }

          trackerData.push({
            studentName: student.name,
            studentEnglishName: student.english_name || '',
            teacherName: teacher.name,
            isSubstitute: teacher.is_substitute || false,
            room: room?.name || `Room ${assignment.room_id}`,
            timeSlot: timeslot?.name || timeslot?.label || `Slot ${assignment.time_slot_id}`,
            timeSlotOrder: timeslot?.order_index || assignment.time_slot_id,
            submitted: slotHasPassed ? reportExists : null, // null = not yet
            submittedBySubstitute: slotHasPassed ? submittedBySubstitute : false,
            actualTeacher: slotHasPassed ? actualTeacher : null,
            reportSubject: matchingReport?.subject || null,
            lastReportByTeacher: lastReportDate,
            slotHasPassed: slotHasPassed
          });
        }
      }
    }

    // Get unique time slots sorted by order
    const timeSlotSet = new Map();
    trackerData.forEach(item => {
      if (!timeSlotSet.has(item.timeSlot)) {
        timeSlotSet.set(item.timeSlot, item.timeSlotOrder);
      }
    });
    const timeSlots = [...timeSlotSet.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);

    // Group by student
    const studentMap = new Map();
    trackerData.forEach(item => {
      const key = item.studentName;
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentName: item.studentName,
          studentEnglishName: item.studentEnglishName,
          classes: []
        });
      }
      studentMap.get(key).classes.push({
        timeSlot: item.timeSlot,
        teacherName: item.teacherName ? item.teacherName.match(/\[([^\]]+)\]/)?.[1] || item.teacherName : null,
        isSubstitute: item.isSubstitute,
        submitted: item.submitted,
        submittedBySubstitute: item.submittedBySubstitute,
        actualTeacher: item.actualTeacher,
        lastReportByTeacher: item.lastReportByTeacher
      });
    });

    // Convert to array and sort classes by time slot
    const students = [...studentMap.values()].map(student => {
      // Create a class entry for each time slot
      const classMap = new Map(student.classes.map(c => [c.timeSlot, c]));
      student.classes = timeSlots.map(slot => classMap.get(slot) || {
        timeSlot: slot,
        teacherName: null,
        isSubstitute: false,
        submitted: null,
        lastReportByTeacher: null
      });
      return student;
    });

    // Merge consecutive time slots with the same teacher for cleaner display
    function mergeConsecutiveClasses(classes) {
      if (!classes || classes.length === 0) return [];

      const merged = [];
      let current = null;

      // Helper to normalize teacher name for comparison
      const normalizeTeacher = (name) => (name || '').trim().toLowerCase();

      // Helper to normalize submitted status (treat null and false as same for merge purposes)
      const normalizeSubmitted = (val) => val === true ? true : false;

      for (const cls of classes) {
        if (!current) {
          // Start a new merged entry
          current = {
            ...cls,
            startSlot: cls.timeSlot,
            endSlot: cls.timeSlot,
            slotCount: 1
          };
        } else if (
          cls.teacherName &&
          current.teacherName &&
          normalizeTeacher(cls.teacherName) === normalizeTeacher(current.teacherName) &&
          normalizeSubmitted(cls.submitted) === normalizeSubmitted(current.submitted)
        ) {
          // Same teacher and same status - extend the current merged entry
          current.endSlot = cls.timeSlot;
          current.slotCount++;
          // Update timeSlot to show range
          current.timeSlot = formatTimeRange(current.startSlot, current.endSlot);
          // Keep the most recent lastReportByTeacher
          if (cls.lastReportByTeacher && (!current.lastReportByTeacher || cls.lastReportByTeacher > current.lastReportByTeacher)) {
            current.lastReportByTeacher = cls.lastReportByTeacher;
          }
        } else {
          // Different teacher or status - save current and start new
          if (current.slotCount > 1) {
            current.timeSlot = formatTimeRange(current.startSlot, current.endSlot);
          }
          merged.push(current);
          current = {
            ...cls,
            startSlot: cls.timeSlot,
            endSlot: cls.timeSlot,
            slotCount: 1
          };
        }
      }

      // Don't forget the last entry
      if (current) {
        if (current.slotCount > 1) {
          current.timeSlot = formatTimeRange(current.startSlot, current.endSlot);
        }
        merged.push(current);
      }

      return merged;
    }

    // Helper to format time range (e.g., "8AM to 9AM" + "9AM to 10AM" => "8AM to 10AM")
    function formatTimeRange(startSlot, endSlot) {
      // Extract start time from first slot (e.g., "8AM" from "8AM to 9AM")
      const startMatch = startSlot.match(/^(\d+[AP]M)/i);
      // Extract end time from last slot (e.g., "10AM" from "9AM to 10AM")
      const endMatch = endSlot.match(/to\s+(\d+[AP]M)/i);

      if (startMatch && endMatch) {
        return `${startMatch[1]} to ${endMatch[1]}`;
      }
      return `${startSlot} - ${endSlot}`;
    }

    // Apply merging to each student's classes
    students.forEach(student => {
      student.classes = mergeConsecutiveClasses(student.classes);
    });

    // Sort students by name
    students.sort((a, b) => (a.studentEnglishName || a.studentName).localeCompare(b.studentEnglishName || b.studentName));

    // Calculate summary
    const total = trackerData.length;
    const submitted = trackerData.filter(t => t.submitted).length;
    const missing = total - submitted;
    const percentage = total > 0 ? Math.round((submitted / total) * 100) : 0;

    res.json({
      date,
      summary: { total, submitted, missing, percentage },
      timeSlots,
      students
    });

  } catch (error) {
    console.error('Tracker error:', error);
    res.status(500).json({ error: 'Failed to fetch tracker data', message: error.message });
  }
});

// Get list of unique teachers
app.get('/api/teachers', async (req, res) => {
  try {
    const allReports = await parseReportsCSV();
    const teachers = [...new Set(allReports.map(r => r.teacherName).filter(Boolean))];
    teachers.sort();
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teachers', message: error.message });
  }
});

// Get dates that have data (from reports.csv)
app.get('/api/dates-with-data', async (req, res) => {
  try {
    const allReports = await parseReportsCSV();
    const dates = [...new Set(allReports.map(r => r.date).filter(Boolean))];
    // Sort dates in descending order (newest first)
    dates.sort((a, b) => new Date(b) - new Date(a));
    res.json(dates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dates', message: error.message });
  }
});

// Analytics password
const ANALYTICS_PASSWORD = '14411441';

// Analytics endpoint - Teacher performance metrics (password protected)
app.get('/api/analytics', async (req, res) => {
  try {
    const { startDate, endDate, password } = req.query;

    // Check password
    if (password !== ANALYTICS_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password', requiresAuth: true });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate parameters required (YYYY-MM-DD)' });
    }

    // Helper to capitalize teacher name for display
    const capitalizeTeacherName = (name) => {
      if (!name) return '';
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };

    // Teachers to exclude from analytics (not using Stellar)
    const excludedTeachers = ['choi'];
    const isExcludedTeacher = (name) => {
      const short = extractTeacherShortName(name);
      return excludedTeachers.includes(short);
    };

    // Parse all reports from CSV
    const allReports = await parseReportsCSV();

    // Filter reports within date range and deduplicate by student+teacher+date
    // This prevents double-counting if a teacher submits multiple reports for same student
    const seenReports = new Set();
    const reportsInRange = allReports.filter(r => {
      if (r.date < startDate || r.date > endDate) return false;

      // Create unique key for deduplication
      const teacherShort = extractTeacherShortName(r.teacherName);
      const studentNorm = (r.studentName || '').toLowerCase().trim();
      const dedupeKey = `${r.date}|${studentNorm}|${teacherShort}`;

      if (seenReports.has(dedupeKey)) {
        return false; // Skip duplicate
      }
      seenReports.add(dedupeKey);
      return true;
    });

    // Get all dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const datesInRange = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      datesInRange.push(dateStr);
    }

    // Fetch assignments for each date in range to get expected reports
    const assignmentsByDate = new Map();
    const teacherExpected = new Map(); // teacher -> { total: 0, dates: Set }
    const teacherActual = new Map();   // teacher -> { total: 0, onTime: 0, delays: [] }

    // Track unique student+teacher+date combinations to avoid double-counting
    // (e.g., 2-hour classes should only count as 1 expected report)
    const seenExpected = new Set();

    for (const date of datesInRange) {
      try {
        const assignments = await fetchAssignments(date);
        assignmentsByDate.set(date, assignments);

        // Count expected reports per teacher for this date
        for (const assignment of assignments || []) {
          for (const teacher of assignment.teachers || []) {
            const teacherShort = extractTeacherShortName(teacher.name);
            if (!teacherShort) continue;

            // Skip excluded teachers
            if (excludedTeachers.includes(teacherShort)) continue;

            // Filter out placeholder students
            const realStudents = (assignment.students || []).filter(s => {
              const name = s.name || '';
              const nameLower = name.toLowerCase().trim();
              const placeholders = ['ap chem', 'online 1', 'online 2', 'online', 'test', 'n/a'];
              if (placeholders.includes(nameLower)) return false;
              if (nameLower.startsWith('online') || nameLower.startsWith('ap ')) return false;
              return true;
            });

            // Count only unique student+teacher+date combinations
            for (const student of realStudents) {
              const studentNorm = (student.name || '').toLowerCase().trim();
              const expectedKey = `${date}|${studentNorm}|${teacherShort}`;

              if (seenExpected.has(expectedKey)) continue; // Skip duplicate
              seenExpected.add(expectedKey);

              if (!teacherExpected.has(teacherShort)) {
                teacherExpected.set(teacherShort, { total: 0, dates: new Set(), fullName: teacher.name });
              }
              const data = teacherExpected.get(teacherShort);
              data.total++;
              data.dates.add(date);
            }
          }
        }
      } catch (error) {
        // Skip dates where scheduling app doesn't have data
        console.log(`No assignment data for ${date}`);
      }
    }

    // Count actual reports per teacher
    for (const report of reportsInRange) {
      const teacherShort = extractTeacherShortName(report.teacherName);
      if (!teacherShort) continue;

      // Skip excluded teachers
      if (excludedTeachers.includes(teacherShort)) continue;

      if (!teacherActual.has(teacherShort)) {
        teacherActual.set(teacherShort, { total: 0, onTime: 0, delays: [], fullName: report.teacherName });
      }
      const data = teacherActual.get(teacherShort);
      data.total++;

      // Check if on-time (same day) - we consider the report date as the submission date
      // Since we don't have class date in CSV, we assume report.date is submission date
      // and it's on-time if it matches expected dates
      const expected = teacherExpected.get(teacherShort);
      if (expected && expected.dates.has(report.date)) {
        data.onTime++;
        data.delays.push(0);
      } else {
        // Try to find the closest expected date before the report date
        if (expected) {
          const sortedDates = [...expected.dates].sort();
          let closestDate = null;
          for (const expDate of sortedDates) {
            if (expDate <= report.date) {
              closestDate = expDate;
            }
          }
          if (closestDate) {
            const delay = Math.floor((new Date(report.date) - new Date(closestDate)) / (1000 * 60 * 60 * 24));
            data.delays.push(delay);
          }
        }
      }
    }

    // Calculate metrics per teacher
    const teacherMetrics = [];
    const allTeachers = new Set([...teacherExpected.keys(), ...teacherActual.keys()]);

    for (const teacherShort of allTeachers) {
      const expected = teacherExpected.get(teacherShort) || { total: 0, dates: new Set(), fullName: teacherShort };
      const actual = teacherActual.get(teacherShort) || { total: 0, onTime: 0, delays: [], fullName: teacherShort };

      const submissionRate = expected.total > 0 ? Math.round((actual.total / expected.total) * 100) : 0;
      const onTimeRate = actual.total > 0 ? Math.round((actual.onTime / actual.total) * 100) : 0;
      const avgDelay = actual.delays.length > 0
        ? Math.round((actual.delays.reduce((a, b) => a + b, 0) / actual.delays.length) * 10) / 10
        : 0;
      const missedReports = Math.max(0, expected.total - actual.total);

      teacherMetrics.push({
        teacherName: capitalizeTeacherName(teacherShort),
        teacherFullName: expected.fullName || actual.fullName,
        expectedReports: expected.total,
        actualReports: actual.total,
        missedReports,
        submissionRate,
        onTimeReports: actual.onTime,
        onTimeRate,
        avgDelay,
        daysActive: expected.dates.size,
        performanceScore: Math.round((submissionRate * 0.6 + onTimeRate * 0.4)) // Weighted score
      });
    }

    // Sort by performance score (ascending = worst first)
    teacherMetrics.sort((a, b) => a.performanceScore - b.performanceScore);

    // Calculate overall summary
    const totalExpected = teacherMetrics.reduce((sum, t) => sum + t.expectedReports, 0);
    const totalActual = teacherMetrics.reduce((sum, t) => sum + t.actualReports, 0);
    const totalOnTime = teacherMetrics.reduce((sum, t) => sum + t.onTimeReports, 0);
    const totalMissed = teacherMetrics.reduce((sum, t) => sum + t.missedReports, 0);

    const summary = {
      dateRange: { startDate, endDate },
      totalDays: datesInRange.length,
      totalExpectedReports: totalExpected,
      totalActualReports: totalActual,
      totalMissedReports: totalMissed,
      overallSubmissionRate: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
      overallOnTimeRate: totalActual > 0 ? Math.round((totalOnTime / totalActual) * 100) : 0,
      teacherCount: teacherMetrics.length
    };

    // Top 5 needing attention (lowest performance scores with expected reports)
    const needsAttention = teacherMetrics
      .filter(t => t.expectedReports > 0)
      .slice(0, 5);

    // Top 5 performers (highest performance scores)
    const topPerformers = [...teacherMetrics]
      .filter(t => t.expectedReports > 0)
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5);

    res.json({
      summary,
      needsAttention,
      topPerformers,
      allTeachers: teacherMetrics
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to generate analytics', message: error.message });
  }
});

// Get absent students for a date (from attendance checker)
// Also includes students who were late enough or left early enough to miss specific classes
app.get('/api/absences/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const response = await fetch(`${ATTENDANCE_CHECKER_URL}/api/attendance/${date}`);

    if (!response.ok) {
      return res.json({ success: true, absences: [], missedClasses: {} });
    }

    const data = await response.json();

    if (!data.success || !data.attendance) {
      return res.json({ success: true, absences: [], missedClasses: {} });
    }

    // Fully absent students - all their classes are missed
    const absences = data.attendance
      .filter(record => record.status === 'absent')
      .map(record => ({
        studentName: record.student_name,
        studentId: record.student_id,
        reason: record.absent_reason || 'No reason specified',
        date: date
      }));

    // Track missed classes for late arrivals and early departures
    // Format: { "studentName": { "timeSlot": { type: "late"|"early_out", reason: "...", minutes: N } } }
    const missedClasses = {};

    // Track late students for inference (when no specific classes assigned)
    // Format: { "studentName": { startTime: "8AM", minutes: N, reason: "..." } }
    const lateStudents = {};

    // Track undertime students for inference (when no specific classes assigned)
    // Format: { "studentName": { endTime: "5PM", minutes: N, reason: "..." } }
    const undertimeStudents = {};

    data.attendance.forEach(record => {
      // Handle late arrivals
      if (record.status === 'late') {
        if (record.classAssignments && record.classAssignments.length > 0) {
          // Specific classes were assigned
          if (!missedClasses[record.student_name]) {
            missedClasses[record.student_name] = {};
          }
          record.classAssignments.forEach(assignment => {
            missedClasses[record.student_name][assignment.classSlot] = {
              type: 'late',
              reason: record.late_reason || `Late ${record.minutes_late || ''} min`,
              minutes: record.minutes_late
            };
          });
        } else if (record.minutes_late > 0) {
          // No specific classes assigned - pass info for frontend to infer
          lateStudents[record.student_name] = {
            startTime: record.start_time,
            minutes: record.minutes_late,
            reason: record.late_reason || `Late ${record.minutes_late} min`
          };
        }
      }

      // Handle early departures (undertime)
      if (record.has_undertime === 1) {
        if (record.undertimeClassAssignments && record.undertimeClassAssignments.length > 0) {
          // Specific classes were assigned
          if (!missedClasses[record.student_name]) {
            missedClasses[record.student_name] = {};
          }
          record.undertimeClassAssignments.forEach(assignment => {
            missedClasses[record.student_name][assignment.classSlot] = {
              type: 'early_out',
              reason: record.undertime_reason || `Left ${record.undertime_minutes || ''} min early`,
              minutes: record.undertime_minutes
            };
          });
        } else if (record.undertime_minutes > 0) {
          // No specific classes assigned - pass info for frontend to infer
          undertimeStudents[record.student_name] = {
            endTime: record.end_time,
            minutes: record.undertime_minutes,
            reason: record.undertime_reason || `Left ${record.undertime_minutes} min early`
          };
        }
      }
    });

    res.json({ success: true, absences, missedClasses, lateStudents, undertimeStudents });
  } catch (error) {
    console.error('Error fetching absences:', error.message);
    // Return empty array if attendance checker is not available
    res.json({ success: true, absences: [], missedClasses: {}, error: 'Attendance checker not available' });
  }
});

// Get overrides
app.get('/api/overrides', (req, res) => {
  const overrides = loadOverrides();
  res.json(overrides);
});

// Set/toggle a single override (password protected)
app.post('/api/overrides', (req, res) => {
  const { key, value, reason, reasonCode, password } = req.body;

  // Check password
  if (password !== ANALYTICS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password', requiresAuth: true });
  }

  if (!key) {
    return res.status(400).json({ error: 'key is required' });
  }

  const overrides = loadOverrides();

  const timestamp = new Date().toISOString();
  const [date, studentName, teacherName, timeSlot] = key.split('|');

  if (value === null || value === undefined) {
    // Remove override
    delete overrides[key];

    // Log the removal
    appendToOverrideLog({
      action: 'remove',
      key,
      date,
      studentName,
      teacherName,
      timeSlot,
      timestamp
    });
  } else {
    // Set override with reason and timestamp
    overrides[key] = {
      value: value,
      reason: reason || null,
      reasonCode: reasonCode || null,
      timestamp: timestamp
    };

    // Log the override
    appendToOverrideLog({
      action: 'add',
      key,
      date,
      studentName,
      teacherName,
      timeSlot,
      value,
      reason: reason || null,
      reasonCode: reasonCode || null,
      timestamp
    });
  }

  if (saveOverrides(overrides)) {
    res.json({ success: true, overrides });
  } else {
    res.status(500).json({ error: 'Failed to save overrides' });
  }
});

// Clear overrides for a specific date (password protected)
app.delete('/api/overrides/:date', (req, res) => {
  const { password } = req.query;

  // Check password
  if (password !== ANALYTICS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password', requiresAuth: true });
  }

  const { date } = req.params;
  const overrides = loadOverrides();

  const newOverrides = {};
  for (const key in overrides) {
    if (!key.startsWith(date + '|')) {
      newOverrides[key] = overrides[key];
    }
  }

  if (saveOverrides(newOverrides)) {
    res.json({ success: true, overrides: newOverrides });
  } else {
    res.status(500).json({ error: 'Failed to save overrides' });
  }
});

// Clear all overrides (password protected)
app.delete('/api/overrides', (req, res) => {
  const { password } = req.query;

  // Check password
  if (password !== ANALYTICS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password', requiresAuth: true });
  }

  if (saveOverrides({})) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to clear overrides' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  const status = {
    app: 'ok',
    timestamp: new Date().toISOString(),
    schedulingApp: 'unknown',
    reportsCSV: fs.existsSync(REPORTS_CSV_PATH) ? 'ok' : 'not found'
  };

  try {
    const response = await fetch(`${SCHEDULING_APP_URL}/api/health`);
    status.schedulingApp = response.ok ? 'ok' : 'error';
  } catch (error) {
    status.schedulingApp = 'unreachable';
  }

  res.json(status);
});

// Debug endpoint to diagnose matching issues
app.get('/api/debug/matching', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date parameter required' });
    }

    // Get scheduling app data
    let assignments = [];
    try {
      assignments = await fetchAssignments(date);
    } catch (error) {
      return res.json({
        error: 'Could not fetch from scheduling app',
        schedulingAppUrl: SCHEDULING_APP_URL,
        message: error.message
      });
    }

    // Get CSV data
    const allReports = await parseReportsCSV();
    const dateReports = allReports.filter(r => r.date === date);

    // Extract unique student names from each source
    const schedulingStudents = [];
    for (const assignment of assignments) {
      for (const student of assignment.students || []) {
        schedulingStudents.push({
          name: student.name,
          english_name: student.english_name || null,
          normalized: normalizeStudentName(student.name),
          normalizedEnglish: student.english_name ? normalizeStudentName(student.english_name) : null
        });
      }
    }

    const csvStudents = [...new Set(dateReports.map(r => r.studentName))].map(name => ({
      name: name,
      normalized: normalizeStudentName(name),
      extractedEnglish: extractEnglishName(name),
      extractedKorean: extractKoreanName(name)
    }));

    // Test matching for each scheduling student
    const matchingResults = schedulingStudents.map(schedStudent => {
      const matches = dateReports.filter(report =>
        studentNamesMatch(report.studentName, schedStudent.name) ||
        (schedStudent.english_name && studentNamesMatch(report.studentName, schedStudent.english_name))
      );
      return {
        schedulingName: schedStudent.name,
        schedulingEnglishName: schedStudent.english_name,
        matchedReports: matches.map(r => ({
          csvName: r.studentName,
          teacher: r.teacherName,
          subject: r.subject
        })),
        matchCount: matches.length
      };
    });

    // Find unmatched students from CSV
    const matchedCsvNames = new Set();
    matchingResults.forEach(result => {
      result.matchedReports.forEach(r => matchedCsvNames.add(r.csvName));
    });
    const unmatchedCsvStudents = csvStudents.filter(s => !matchedCsvNames.has(s.name));

    res.json({
      date,
      schedulingAppUrl: SCHEDULING_APP_URL,
      csvPath: REPORTS_CSV_PATH,
      stats: {
        schedulingStudentCount: schedulingStudents.length,
        csvReportCount: dateReports.length,
        uniqueCsvStudents: csvStudents.length,
        matchedCount: matchingResults.filter(r => r.matchCount > 0).length,
        unmatchedSchedulingCount: matchingResults.filter(r => r.matchCount === 0).length,
        unmatchedCsvCount: unmatchedCsvStudents.length
      },
      matchingResults,
      unmatchedCsvStudents: unmatchedCsvStudents.slice(0, 20), // Limit output
      sampleCsvStudents: csvStudents.slice(0, 10) // Show sample of CSV names
    });
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Get override log (password protected)
app.get('/api/overrides/log', (req, res) => {
  const { password, limit, date } = req.query;

  // Check password
  if (password !== ANALYTICS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password', requiresAuth: true });
  }

  let log = loadOverrideLog();

  // Filter by date if provided
  if (date) {
    log = log.filter(entry => entry.date === date);
  }

  // Sort by timestamp descending (most recent first)
  log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Limit results if specified
  if (limit) {
    log = log.slice(0, parseInt(limit));
  }

  res.json({ success: true, log, total: log.length });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  // Get network IP for display
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let networkIP = 'unknown';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        networkIP = net.address;
        break;
      }
    }
    if (networkIP !== 'unknown') break;
  }

  console.log(`\n========================================`);
  console.log(`  Stellar Submission Tracker`);
  console.log(`========================================`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${networkIP}:${PORT}`);
  console.log(`========================================`);
  console.log(`\nConfiguration:`);
  console.log(`  Scheduling App: ${SCHEDULING_APP_URL}`);
  console.log(`  Reports CSV: ${REPORTS_CSV_PATH}`);
  console.log(`  CSV Exists: ${fs.existsSync(REPORTS_CSV_PATH)}`);
  console.log(`\nReady for connections on all interfaces (0.0.0.0)`);
});
