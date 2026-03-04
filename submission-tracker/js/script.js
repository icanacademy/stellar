// Stellar Submission Tracker - Frontend JavaScript

const API_BASE = '';

// DOM Elements
const datePicker = document.getElementById('datePicker');
const todayBtn = document.getElementById('todayBtn');
const refreshBtn = document.getElementById('refreshBtn');
const demoBtn = document.getElementById('demoBtn');
const demoBanner = document.getElementById('demoBanner');
const studentFilter = document.getElementById('studentFilter');
const teacherFilter = document.getElementById('teacherFilter');
const statusFilter = document.getElementById('statusFilter');
const summaryBar = document.getElementById('summaryBar');
const errorMessage = document.getElementById('errorMessage');
const noDataMessage = document.getElementById('noDataMessage');
const trackerTable = document.getElementById('trackerTable');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const printMissingBtn = document.getElementById('printMissingBtn');
const exportBtn = document.getElementById('exportBtn');
const clearOverridesBtn = document.getElementById('clearOverridesBtn');
const dateDisplay = document.getElementById('dateDisplay');
const displayDate = document.getElementById('displayDate');

// State
let currentData = null;
let allTeachers = [];
let demoMode = false;

// Manual overrides stored on server (syncs across all devices)
// Format: { "date|studentName|teacherName|timeSlot": { value: true/false, reason: "...", timestamp: "..." } }
// (Also supports legacy format: { "key": true/false } for backward compatibility)
let cachedOverrides = {};

// Absent students cache (from attendance checker)
// Format: { "studentName": { reason: "...", studentId: "..." } }
let cachedAbsences = {};

// Missed classes cache - for late arrivals and early departures
// Format: { "studentName": { "timeSlot": { type: "late"|"early_out", reason: "...", minutes: N } } }
let cachedMissedClasses = {};

// Late students cache - for inferring missed classes when no specific classes assigned
// Format: { "studentName": { startTime: "8AM", minutes: N, reason: "..." } }
let cachedLateStudents = {};

// Undertime students cache - for inferring missed classes when no specific classes assigned
// Format: { "studentName": { endTime: "5PM", minutes: N, reason: "..." } }
let cachedUndertimeStudents = {};

// Override reason options
const OVERRIDE_REASONS = [
    { value: 'student_absent', label: 'Student Absent' },
    { value: 'student_absent_sick', label: 'Student Absent (Sick)' },
    { value: 'student_absent_vacation', label: 'Student Absent (Vacation)' },
    { value: 'student_absent_noshow', label: 'Student Absent (No Show)' },
    { value: 'class_cancelled', label: 'Class Cancelled' },
    { value: 'system_glitch', label: 'System Glitch / Stellar Down' },
    { value: 'teacher_error', label: 'Teacher Error (Wrong Entry)' },
    { value: 'duplicate_entry', label: 'Duplicate Entry' },
    { value: 'schedule_change', label: 'Schedule Change' },
    { value: 'holiday', label: 'Holiday' },
    { value: 'other', label: 'Other' }
];

// Admin password for protected actions (overrides, analytics)
let adminPassword = sessionStorage.getItem('adminPassword') || '';
let isAuthenticated = false;

function promptForPassword() {
    const password = prompt('Enter admin password:');
    if (password) {
        adminPassword = password;
        sessionStorage.setItem('adminPassword', password);
        return true;
    }
    return false;
}

function clearAuthOnFailure() {
    isAuthenticated = false;
    adminPassword = '';
    sessionStorage.removeItem('adminPassword');
}

async function fetchOverrides() {
    try {
        const response = await fetch(`${API_BASE}/api/overrides`);
        if (response.ok) {
            cachedOverrides = await response.json();
        }
    } catch (error) {
        console.error('Failed to fetch overrides:', error);
    }
    return cachedOverrides;
}

async function fetchAbsences(date) {
    try {
        const response = await fetch(`${API_BASE}/api/absences/${date}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Convert absences to lookup object by student name
                cachedAbsences = {};
                if (data.absences) {
                    data.absences.forEach(absence => {
                        cachedAbsences[absence.studentName] = {
                            reason: absence.reason,
                            studentId: absence.studentId
                        };
                    });
                }
                // Store missed classes (late arrivals / early departures)
                cachedMissedClasses = data.missedClasses || {};
                // Store late students for inference
                cachedLateStudents = data.lateStudents || {};
                // Store undertime students for inference
                cachedUndertimeStudents = data.undertimeStudents || {};
            }
        }
    } catch (error) {
        console.error('Failed to fetch absences:', error);
        cachedAbsences = {};
        cachedMissedClasses = {};
        cachedLateStudents = {};
        cachedUndertimeStudents = {};
    }
    return cachedAbsences;
}

function isStudentAbsent(studentName) {
    return studentName in cachedAbsences;
}

function getAbsenceReason(studentName) {
    return cachedAbsences[studentName]?.reason || 'Absent';
}

// Parse time string like "5PM", "4:30PM", "16:00" to minutes since midnight
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;

    // Handle formats like "5PM", "4PM", "4:30PM"
    const ampmMatch = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = parseInt(ampmMatch[2] || '0');
        const period = ampmMatch[3].toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return hours * 60 + minutes;
    }

    // Handle 24-hour format like "16:00"
    const militaryMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (militaryMatch) {
        return parseInt(militaryMatch[1]) * 60 + parseInt(militaryMatch[2]);
    }

    return null;
}

// Parse time slot to get start and end times in minutes
// Handles formats like "3PM to 5PM", "4:00-4:50", "8AM to 10AM"
function parseTimeSlot(timeSlot) {
    if (!timeSlot) return null;

    // Handle format like "3PM to 5PM" or "8AM to 10AM"
    const toMatch = timeSlot.match(/^(\d{1,2})(AM|PM)\s*to\s*(\d{1,2})(AM|PM)$/i);
    if (toMatch) {
        let startHours = parseInt(toMatch[1]);
        const startPeriod = toMatch[2].toUpperCase();
        let endHours = parseInt(toMatch[3]);
        const endPeriod = toMatch[4].toUpperCase();

        if (startPeriod === 'PM' && startHours !== 12) startHours += 12;
        if (startPeriod === 'AM' && startHours === 12) startHours = 0;
        if (endPeriod === 'PM' && endHours !== 12) endHours += 12;
        if (endPeriod === 'AM' && endHours === 12) endHours = 0;

        return {
            start: startHours * 60,
            end: endHours * 60
        };
    }

    // Handle format like "4:00-4:50" or "16:00-16:50"
    const dashMatch = timeSlot.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (dashMatch) {
        let startHours = parseInt(dashMatch[1]);
        const startMins = parseInt(dashMatch[2]);
        let endHours = parseInt(dashMatch[3]);
        const endMins = parseInt(dashMatch[4]);

        // Assume times between 1-6 are PM (afternoon classes)
        if (startHours >= 1 && startHours <= 6) startHours += 12;
        if (endHours >= 1 && endHours <= 6) endHours += 12;

        return {
            start: startHours * 60 + startMins,
            end: endHours * 60 + endMins
        };
    }

    return null;
}

// Check if a student missed a specific class due to late arrival or early departure
function getMissedClassInfo(studentName, timeSlot) {
    // First check explicitly assigned missed classes
    if (cachedMissedClasses[studentName] && cachedMissedClasses[studentName][timeSlot]) {
        return cachedMissedClasses[studentName][timeSlot];
    }

    const classTimes = parseTimeSlot(timeSlot);
    if (!classTimes) return null;

    // Check if we can infer from late arrival data
    const lateInfo = cachedLateStudents[studentName];
    if (lateInfo && lateInfo.minutes > 0) {
        const startTimeMinutes = parseTimeToMinutes(lateInfo.startTime);

        if (startTimeMinutes !== null) {
            // Calculate when they actually arrived
            const arrivalTime = startTimeMinutes + lateInfo.minutes;

            // Mark as missed if class starts before they arrived
            // (they missed all or most of the class)
            if (classTimes.start < arrivalTime) {
                return {
                    type: 'late',
                    reason: lateInfo.reason,
                    minutes: lateInfo.minutes,
                    inferred: true
                };
            }
        }
    }

    // Check if we can infer from undertime (early departure) data
    const undertimeInfo = cachedUndertimeStudents[studentName];
    if (undertimeInfo && undertimeInfo.minutes > 0) {
        const endTimeMinutes = parseTimeToMinutes(undertimeInfo.endTime);

        if (endTimeMinutes !== null) {
            // Calculate when they actually left
            const departureTime = endTimeMinutes - undertimeInfo.minutes;

            // Mark as missed if class ends after they left
            // (they didn't complete the class)
            if (classTimes.end > departureTime) {
                return {
                    type: 'early_out',
                    reason: undertimeInfo.reason,
                    minutes: undertimeInfo.minutes,
                    inferred: true
                };
            }
        }
    }

    return null;
}

function getOverrideKey(date, studentName, teacherName, timeSlot) {
    return `${date}|${studentName}|${teacherName}|${timeSlot}`;
}

// Show override reason modal and return user's selection
function showOverrideReasonModal(studentName, teacherName, isRemoving) {
    return new Promise((resolve) => {
        // If removing override, no need for reason
        if (isRemoving) {
            resolve({ confirmed: true, reason: null });
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'override-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'override-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        `;

        modal.innerHTML = `
            <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px;">Override Submission</h3>
            <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px;">
                <strong>${studentName}</strong> - ${teacherName}
            </p>
            <label style="display: block; margin-bottom: 8px; color: #475569; font-weight: 500;">
                Reason for override:
            </label>
            <select id="overrideReasonSelect" style="
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 14px;
                margin-bottom: 16px;
                background: white;
                cursor: pointer;
            ">
                <option value="">-- Select a reason --</option>
                ${OVERRIDE_REASONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
            <div id="otherReasonContainer" style="display: none; margin-bottom: 16px;">
                <input type="text" id="otherReasonInput" placeholder="Please specify..." style="
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="overrideCancelBtn" style="
                    padding: 10px 20px;
                    border: 1px solid #cbd5e1;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    color: #475569;
                ">Cancel</button>
                <button id="overrideConfirmBtn" style="
                    padding: 10px 20px;
                    border: none;
                    background: #3b82f6;
                    color: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                " disabled>Confirm Override</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Get elements
        const select = modal.querySelector('#overrideReasonSelect');
        const otherContainer = modal.querySelector('#otherReasonContainer');
        const otherInput = modal.querySelector('#otherReasonInput');
        const cancelBtn = modal.querySelector('#overrideCancelBtn');
        const confirmBtn = modal.querySelector('#overrideConfirmBtn');

        // Handle reason selection
        select.addEventListener('change', () => {
            const value = select.value;
            otherContainer.style.display = value === 'other' ? 'block' : 'none';
            confirmBtn.disabled = !value || (value === 'other' && !otherInput.value.trim());
        });

        otherInput.addEventListener('input', () => {
            confirmBtn.disabled = !otherInput.value.trim();
        });

        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve({ confirmed: false });
        });

        // Handle click outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve({ confirmed: false });
            }
        });

        // Handle confirm
        confirmBtn.addEventListener('click', () => {
            const selectedReason = select.value;
            let reasonText = OVERRIDE_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;

            if (selectedReason === 'other') {
                reasonText = otherInput.value.trim() || 'Other';
            }

            overlay.remove();
            resolve({ confirmed: true, reason: reasonText, reasonCode: selectedReason });
        });

        // Focus the select
        select.focus();
    });
}

async function toggleOverride(date, studentName, teacherName, timeSlot, originalStatus) {
    // Require password for overrides
    if (!adminPassword) {
        if (!promptForPassword()) {
            return; // User cancelled
        }
    }

    const key = getOverrideKey(date, studentName, teacherName, timeSlot);

    // Get current effective status
    const currentOverride = cachedOverrides[key];
    const hasOverride = currentOverride !== undefined;

    // Determine if we're removing or adding an override
    const isRemoving = hasOverride;

    // Show modal to get reason (only when adding override)
    const { confirmed, reason, reasonCode } = await showOverrideReasonModal(studentName, teacherName, isRemoving);

    if (!confirmed) {
        return; // User cancelled
    }

    // Determine new value:
    // - If already overridden, remove the override (restore to original)
    // - If not overridden, toggle to opposite of original
    let newValue;
    if (hasOverride) {
        // Remove override - restore to original
        newValue = null;
    } else {
        // Add override - set to opposite of original
        newValue = !originalStatus;
    }

    console.log('Toggle override:', { key, originalStatus, hasOverride, currentOverride, newValue, reason });

    try {
        const response = await fetch(`${API_BASE}/api/overrides`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key,
                value: newValue,
                reason: reason,
                reasonCode: reasonCode,
                password: adminPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.requiresAuth) {
                clearAuthOnFailure();
                alert('Invalid password. Please try again.');
                return;
            }
            throw new Error(data.error || 'Failed to save override');
        }

        isAuthenticated = true;
        cachedOverrides = data.overrides;
        console.log('Updated overrides:', cachedOverrides);
    } catch (error) {
        console.error('Failed to save override:', error);
    }

    // Re-render to show changes
    renderTable(currentData);
    updateSummaryWithOverrides();
}

function getEffectiveStatus(date, studentName, teacherName, timeSlot, originalStatus) {
    const key = getOverrideKey(date, studentName, teacherName, timeSlot);

    // Use 'in' operator to properly check for existence (handles false values)
    if (key in cachedOverrides) {
        const override = cachedOverrides[key];

        // Handle both legacy format (boolean) and new format (object)
        let overrideValue, reason;
        if (typeof override === 'object' && override !== null) {
            overrideValue = override.value;
            reason = override.reason;
        } else {
            // Legacy boolean format
            overrideValue = override;
            reason = null;
        }

        // Override value is what we want to display (true=submitted, false=missing)
        return { submitted: overrideValue === true, isOverridden: true, reason };
    }
    return { submitted: originalStatus, isOverridden: false, reason: null };
}

// Find the most recent override date where this student+teacher was marked as submitted
// Helper to get override value (handles both legacy boolean and new object format)
function getOverrideValue(override) {
    if (typeof override === 'object' && override !== null) {
        return override.value;
    }
    return override; // Legacy boolean format
}

function getLastOverrideDate(studentName, teacherName, beforeDate) {
    let lastDate = null;

    for (const key in cachedOverrides) {
        // Only consider overrides that marked as submitted (true)
        const overrideValue = getOverrideValue(cachedOverrides[key]);
        if (overrideValue !== true) continue;

        // Parse the key: "date|studentName|teacherName|timeSlot"
        const parts = key.split('|');
        if (parts.length < 3) continue;

        const overrideDate = parts[0];
        const overrideStudent = parts[1];
        const overrideTeacher = parts[2];

        // Check if this is for the same student and teacher
        if (overrideStudent === studentName && overrideTeacher === teacherName) {
            // Only consider dates before the current date
            if (overrideDate < beforeDate) {
                if (!lastDate || overrideDate > lastDate) {
                    lastDate = overrideDate;
                }
            }
        }
    }

    return lastDate;
}

// Check if a specific date was overridden to "missing" for this student+teacher
function wasOverriddenToMissing(studentName, teacherName, dateToCheck) {
    for (const key in cachedOverrides) {
        // Only consider overrides that marked as missing (false)
        const overrideValue = getOverrideValue(cachedOverrides[key]);
        if (overrideValue !== false) continue;

        // Parse the key: "date|studentName|teacherName|timeSlot"
        const parts = key.split('|');
        if (parts.length < 3) continue;

        const overrideDate = parts[0];
        const overrideStudent = parts[1];
        const overrideTeacher = parts[2];

        // Check if this date was marked as missing for this student+teacher
        if (overrideDate === dateToCheck &&
            overrideStudent === studentName &&
            overrideTeacher === teacherName) {
            return true;
        }
    }
    return false;
}

// Get effective last report date considering both CSV data and overrides
function getEffectiveLastReportDate(studentName, teacherName, originalLastReport, currentDate) {
    const lastOverride = getLastOverrideDate(studentName, teacherName, currentDate);

    // Check if the original last report date was overridden to "missing"
    let effectiveOriginal = originalLastReport;
    if (originalLastReport && wasOverriddenToMissing(studentName, teacherName, originalLastReport)) {
        // The original last report was overridden to missing, so don't count it
        effectiveOriginal = null;
    }

    // Return the most recent date between effective original and override
    if (!effectiveOriginal && !lastOverride) return null;
    if (!effectiveOriginal) return lastOverride;
    if (!lastOverride) return effectiveOriginal;

    return effectiveOriginal > lastOverride ? effectiveOriginal : lastOverride;
}

async function clearAllOverrides() {
    // Require password
    if (!adminPassword) {
        if (!promptForPassword()) {
            return;
        }
    }

    if (confirm('Clear all manual overrides for all dates?')) {
        try {
            const response = await fetch(`${API_BASE}/api/overrides?password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' });
            const data = await response.json();

            if (!response.ok) {
                if (data.requiresAuth) {
                    clearAuthOnFailure();
                    alert('Invalid password. Please try again.');
                    return;
                }
                throw new Error(data.error || 'Failed to clear overrides');
            }

            isAuthenticated = true;
            cachedOverrides = {};
        } catch (error) {
            console.error('Failed to clear overrides:', error);
        }
        renderTable(currentData);
        updateSummaryWithOverrides();
    }
}

async function clearTodayOverrides() {
    // Require password
    if (!adminPassword) {
        if (!promptForPassword()) {
            return;
        }
    }

    const date = datePicker.value;
    if (!confirm(`Clear all overrides for ${date}?`)) return;

    try {
        const response = await fetch(`${API_BASE}/api/overrides/${date}?password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok) {
            if (data.requiresAuth) {
                clearAuthOnFailure();
                alert('Invalid password. Please try again.');
                return;
            }
            throw new Error(data.error || 'Failed to clear overrides');
        }

        isAuthenticated = true;
        cachedOverrides = data.overrides;
    } catch (error) {
        console.error('Failed to clear overrides:', error);
    }
    renderTable(currentData);
    updateSummaryWithOverrides();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Set date picker to today
    setToday();

    // Load teachers for filter
    await loadTeachers();

    // Load initial data
    await loadTrackerData();

    // Event listeners
    datePicker.addEventListener('change', loadTrackerData);
    todayBtn.addEventListener('click', () => {
        setToday();
        loadTrackerData();
    });
    refreshBtn.addEventListener('click', loadTrackerData);
    demoBtn.addEventListener('click', toggleDemoMode);
    studentFilter.addEventListener('change', applyFilters);
    teacherFilter.addEventListener('change', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    printMissingBtn.addEventListener('click', printMissing);
    exportBtn.addEventListener('click', exportToCSV);
    clearOverridesBtn?.addEventListener('click', clearTodayOverrides);
});

function toggleDemoMode() {
    demoMode = !demoMode;
    demoBtn.classList.toggle('active', demoMode);
    demoBtn.textContent = demoMode ? 'Exit Demo' : 'Demo Mode';
    demoBanner.classList.toggle('show', demoMode);
    loadTrackerData();
}

function setToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    datePicker.value = `${yyyy}-${mm}-${dd}`;
}

function formatDateForDisplay(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function updateDateDisplay(dateStr) {
    displayDate.textContent = formatDateForDisplay(dateStr);
}

function formatShortDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
}

function getDaysDifference(date1Str, date2Str) {
    const [y1, m1, d1] = date1Str.split('-').map(Number);
    const [y2, m2, d2] = date2Str.split('-').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    const diffTime = date2 - date1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

async function loadTeachers() {
    try {
        const response = await fetch(`${API_BASE}/api/teachers`);
        if (response.ok) {
            allTeachers = await response.json();
            updateTeacherFilter();
        }
    } catch (error) {
        console.error('Failed to load teachers:', error);
    }
}

function updateStudentFilter() {
    // Clear existing options except "All Students"
    studentFilter.innerHTML = '<option value="">All Students</option>';

    // Get unique students from current data
    if (currentData && currentData.students) {
        currentData.students.forEach(student => {
            const option = document.createElement('option');
            const displayName = student.studentEnglishName || student.studentName.split('[')[0].trim();
            option.value = student.studentName;
            option.textContent = displayName;
            studentFilter.appendChild(option);
        });
    }
}

function updateTeacherFilter() {
    // Clear existing options except "All Teachers"
    teacherFilter.innerHTML = '<option value="">All Teachers</option>';

    // Get unique teachers from current data
    if (currentData && currentData.students) {
        const teacherSet = new Set();
        currentData.students.forEach(student => {
            student.classes.forEach(cls => {
                if (cls.teacherName) teacherSet.add(cls.teacherName);
            });
        });
        const teachers = [...teacherSet].sort();
        teachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher;
            option.textContent = teacher;
            teacherFilter.appendChild(option);
        });
    }
}

async function loadTrackerData() {
    const date = datePicker.value;
    if (!date) {
        showError('Please select a date');
        return;
    }

    document.body.classList.add('loading');
    hideError();
    noDataMessage.style.display = 'none';
    trackerTable.style.display = 'table';

    try {
        // Fetch overrides, absences, and tracker data in parallel
        const demoParam = demoMode ? '&demo=true' : '';
        const [trackerResponse, _, __] = await Promise.all([
            fetch(`${API_BASE}/api/tracker?date=${date}${demoParam}`),
            fetchOverrides(),
            fetchAbsences(date)
        ]);
        const data = await trackerResponse.json();
        const response = trackerResponse;

        if (!response.ok) {
            throw new Error(data.message || data.error || 'Failed to load data');
        }

        currentData = data;

        // Update date display
        updateDateDisplay(date);

        // Update filters
        updateStudentFilter();
        updateTeacherFilter();

        // Check if no data
        if (!data.students || data.students.length === 0) {
            noDataMessage.style.display = 'block';
            trackerTable.style.display = 'none';
            updateSummary(data.summary);
            return;
        }

        // Render table
        renderTable(data);

        // Update summary with overrides applied
        updateSummaryWithOverrides();

    } catch (error) {
        console.error('Error loading tracker data:', error);
        showError(error.message);
        trackerTable.style.display = 'none';
    } finally {
        document.body.classList.remove('loading');
    }
}

function updateSummary(summary) {
    const { total, submitted, missing, percentage } = summary;

    // Update summary bar class based on status
    summaryBar.classList.remove('has-missing', 'all-missing');
    if (missing > 0 && submitted > 0) {
        summaryBar.classList.add('has-missing');
    } else if (missing > 0 && submitted === 0) {
        summaryBar.classList.add('all-missing');
    }

    // Update summary text
    const summaryText = summaryBar.querySelector('.summary-text');
    summaryText.innerHTML = `
        <span class="submitted-count">${submitted}</span>/<span class="total-count">${total}</span> Reports Submitted
        <span class="percentage">(${percentage}%)</span>
    `;

    // Update progress bar
    const progressFill = summaryBar.querySelector('.progress-fill');
    progressFill.style.width = `${percentage}%`;
    progressFill.classList.remove('medium', 'low');
    if (percentage < 50) {
        progressFill.classList.add('low');
    } else if (percentage < 80) {
        progressFill.classList.add('medium');
    }
}

function updateSummaryWithOverrides() {
    if (!currentData || !currentData.students) return;

    let total = 0;
    let submitted = 0;
    let absentCount = 0;
    let missedClassCount = 0;
    const absentStudents = new Set();

    currentData.students.forEach(student => {
        // Check if this student is fully absent
        const studentIsAbsent = isStudentAbsent(student.studentName);
        if (studentIsAbsent) {
            absentStudents.add(student.studentName);
        }

        student.classes.forEach(cls => {
            // Only count slots that have passed
            if (cls.teacherName && cls.slotHasPassed !== false) {
                if (studentIsAbsent) {
                    // Don't count fully absent students in total or submitted
                    absentCount++;
                } else {
                    // Check if this specific class was missed due to late/early out
                    const missedClassInfo = getMissedClassInfo(student.studentName, cls.timeSlot);
                    if (missedClassInfo) {
                        // Don't count missed classes in total or submitted
                        missedClassCount++;
                    } else {
                        total++;
                        const { submitted: effectiveSubmitted } = getEffectiveStatus(
                            currentData.date,
                            student.studentName,
                            cls.teacherName,
                            cls.timeSlot,
                            cls.submitted
                        );
                        if (effectiveSubmitted) submitted++;
                    }
                }
            }
        });
    });

    const missing = total - submitted;
    const percentage = total > 0 ? Math.round((submitted / total) * 100) : 0;

    // Update summary bar class based on status
    summaryBar.classList.remove('has-missing', 'all-missing');
    if (missing > 0 && submitted > 0) {
        summaryBar.classList.add('has-missing');
    } else if (missing > 0 && submitted === 0) {
        summaryBar.classList.add('all-missing');
    }

    // Check if there are any overrides for this date
    const hasOverrides = Object.keys(cachedOverrides).some(key => key.startsWith(currentData.date + '|'));
    const overrideNote = hasOverrides ? ' <span class="override-note">(with overrides)</span>' : '';

    // Show absent count if any
    const absentNote = absentStudents.size > 0
        ? ` <span class="absent-note">(${absentStudents.size} absent)</span>`
        : '';

    // Show missed class count (late arrivals / early departures) if any
    const missedNote = missedClassCount > 0
        ? ` <span class="missed-class-note">(${missedClassCount} late/early)</span>`
        : '';

    // Update summary text
    const summaryText = summaryBar.querySelector('.summary-text');
    summaryText.innerHTML = `
        <span class="submitted-count">${submitted}</span>/<span class="total-count">${total}</span> Reports Submitted
        <span class="percentage">(${percentage}%)</span>${absentNote}${missedNote}${overrideNote}
    `;

    // Update progress bar
    const progressFill = summaryBar.querySelector('.progress-fill');
    progressFill.style.width = `${percentage}%`;
    progressFill.classList.remove('medium', 'low');
    if (percentage < 50) {
        progressFill.classList.add('low');
    } else if (percentage < 80) {
        progressFill.classList.add('medium');
    }
}

function renderTable(data) {
    const { timeSlots, students } = data;

    // Build table header with all time slots
    tableHead.innerHTML = `
        <tr>
            <th class="student-col">Student</th>
            ${timeSlots.map(slot => `<th class="time-col">${formatTimeSlotHeader(slot)}</th>`).join('')}
        </tr>
    `;

    // Filter students
    const filteredStudents = filterStudents(students);

    // Build table body
    tableBody.innerHTML = '';

    if (filteredStudents.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="${timeSlots.length + 1}" style="text-align: center; padding: 30px; color: #64748b;">No results match your filters</td>`;
        tableBody.appendChild(row);
        return;
    }

    filteredStudents.forEach(student => {
        const row = document.createElement('tr');

        // Check if student has any missing reports
        const hasMissing = student.classes.some(cls => cls.teacherName && !cls.submitted);
        if (hasMissing) {
            row.classList.add('row-has-missing');
        }

        // Student name cell
        const studentCell = document.createElement('td');
        studentCell.className = 'student-cell';

        // Format last report date
        let lastReportDisplay = '';
        if (student.lastReportDate) {
            const daysDiff = getDaysDifference(student.lastReportDate, currentData.date);
            const dateFormatted = formatShortDate(student.lastReportDate);
            let daysClass = 'recent';
            if (daysDiff > 7) daysClass = 'old';
            else if (daysDiff > 3) daysClass = 'moderate';

            if (daysDiff === 0) {
                lastReportDisplay = `<span class="last-report ${daysClass}">Last: Today</span>`;
            } else if (daysDiff === 1) {
                lastReportDisplay = `<span class="last-report ${daysClass}">Last: Yesterday</span>`;
            } else {
                lastReportDisplay = `<span class="last-report ${daysClass}">Last: ${dateFormatted} (${daysDiff}d ago)</span>`;
            }
        } else {
            lastReportDisplay = `<span class="last-report none">No reports</span>`;
        }

        // Parse the full name - format is usually "Park Si Yeon [박시연]" or "Park Si Yeon (Angela) [박시연]"
        const englishNickname = student.studentEnglishName || '';
        const fullName = student.studentName || '';

        // Get romanized name (remove parentheses and brackets content)
        const romanizedName = fullName.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim();

        // Display: Romanized Korean name on top, English nickname below (no student-level last report)
        studentCell.innerHTML = `
            <div class="student-name">${romanizedName}</div>
            <div class="student-english">${englishNickname}</div>
        `;
        row.appendChild(studentCell);

        // Class cells with colspan for merged consecutive same-teacher slots
        student.classes.forEach(cls => {
            const slotCount = cls.slotCount || 1;
            const cell = document.createElement('td');
            cell.className = 'class-cell';

            if (slotCount > 1) {
                cell.colSpan = slotCount;
                cell.classList.add('merged-cell');
            }

            if (cls.teacherName) {
                // Check if slot has passed yet (for today's date)
                const slotHasPassed = cls.slotHasPassed !== false;

                // Check for manual override (only if slot has passed)
                const { submitted: effectiveSubmitted, isOverridden, reason: overrideReason } = slotHasPassed
                    ? getEffectiveStatus(
                        currentData.date,
                        student.studentName,
                        cls.teacherName,
                        cls.timeSlot,
                        cls.submitted
                    )
                    : { submitted: null, isOverridden: false, reason: null };

                // Check if student is absent today
                const studentIsAbsent = isStudentAbsent(student.studentName);
                const absenceReason = studentIsAbsent ? getAbsenceReason(student.studentName) : null;

                // Check if student missed this specific class due to late arrival or early departure
                const missedClassInfo = getMissedClassInfo(student.studentName, cls.timeSlot);
                const classMissed = studentIsAbsent || missedClassInfo !== null;

                // Determine status class and icon
                let statusClass, statusIcon;
                if (studentIsAbsent) {
                    statusClass = 'absent';
                    statusIcon = '&#128564;'; // sleeping face emoji
                } else if (missedClassInfo) {
                    statusClass = 'absent'; // Use same styling as absent
                    statusIcon = missedClassInfo.type === 'late' ? '&#8986;' : '&#128682;'; // watch for late, door for early out
                } else if (!slotHasPassed) {
                    statusClass = 'pending';
                    statusIcon = '&#8987;'; // hourglass
                } else if (effectiveSubmitted) {
                    statusClass = 'submitted';
                    statusIcon = '&#10003;'; // checkmark
                } else {
                    statusClass = 'missing';
                    statusIcon = '&#10007;'; // X
                }

                const subTag = cls.isSubstitute ? ' <span class="sub-tag">Sub</span>' : '';

                // Get full override info for tooltip
                let overrideIndicator = '';
                if (isOverridden) {
                    const overrideKey = getOverrideKey(currentData.date, student.studentName, cls.teacherName, cls.timeSlot);
                    const overrideData = cachedOverrides[overrideKey];
                    let tooltipContent = 'Manual override';

                    if (overrideData && typeof overrideData === 'object') {
                        const reason = overrideData.reason || 'No reason specified';
                        const timestamp = overrideData.timestamp ? new Date(overrideData.timestamp).toLocaleString() : '';
                        tooltipContent = `${reason}${timestamp ? '\\n' + timestamp : ''}`;
                    }

                    overrideIndicator = `<span class="override-tag" data-tooltip="${tooltipContent.replace(/"/g, '&quot;')}">M</span>`;
                }

                // If submitted by a different teacher (substitute covered for absent teacher)
                const subByTag = (slotHasPassed && cls.submittedBySubstitute && cls.actualTeacher)
                    ? ` <span class="sub-by-tag">by ${cls.actualTeacher}</span>`
                    : '';

                // Format last report date for this teacher
                // If slot hasn't passed, show "Pending"
                // If overridden to submitted TODAY, show "Today (M)"
                // If overridden to missing, show "Marked missing (M)"
                // Otherwise, consider both CSV data and past overrides
                let lastReportDisplay = '';
                if (!slotHasPassed) {
                    // Slot hasn't happened yet
                    lastReportDisplay = `<span class="last-report-teacher pending">Pending</span>`;
                } else if (isOverridden && effectiveSubmitted) {
                    // Overridden to submitted today - show today
                    lastReportDisplay = `<span class="last-report-teacher recent">Today (M)</span>`;
                } else if (isOverridden && !effectiveSubmitted) {
                    // Overridden to missing - show that it was marked as not submitted
                    lastReportDisplay = `<span class="last-report-teacher none">Marked missing (M)</span>`;
                } else {
                    // Get effective last report considering both CSV and past overrides
                    const effectiveLastReport = getEffectiveLastReportDate(
                        student.studentName,
                        cls.teacherName,
                        cls.lastReportByTeacher,
                        currentData.date
                    );

                    if (effectiveLastReport) {
                        const daysDiff = getDaysDifference(effectiveLastReport, currentData.date);
                        let daysClass = 'recent';
                        if (daysDiff > 7) daysClass = 'old';
                        else if (daysDiff > 3) daysClass = 'moderate';

                        // Check if this date came from an override
                        const lastOverride = getLastOverrideDate(student.studentName, cls.teacherName, currentData.date);
                        const isFromOverride = lastOverride === effectiveLastReport;
                        const suffix = isFromOverride ? ' (M)' : '';

                        let lastText = '';
                        if (daysDiff === 0) {
                            lastText = 'Today';
                        } else if (daysDiff === 1) {
                            lastText = 'Yesterday';
                        } else {
                            lastText = `${daysDiff}d ago`;
                        }
                        lastReportDisplay = `<span class="last-report-teacher ${daysClass}">${lastText}${suffix}</span>`;
                    } else {
                        lastReportDisplay = `<span class="last-report-teacher none">No history</span>`;
                    }
                }

                const classInfoDiv = document.createElement('div');
                classInfoDiv.className = `class-info ${statusClass}${isOverridden ? ' overridden' : ''}${classMissed ? ' student-absent' : ''}`;

                if (studentIsAbsent) {
                    // When student is fully absent, show teacher name with clear student absent indicator
                    classInfoDiv.innerHTML = `
                        <span class="teacher-name">${cls.teacherName}${subTag}</span>
                        <span class="student-absent-tag">Student Absent</span>
                        <span class="status-icon">${statusIcon}</span>
                        <span class="absent-reason">${absenceReason}</span>
                    `;
                } else if (missedClassInfo) {
                    // When student missed this specific class due to late arrival or early departure
                    const tagLabel = missedClassInfo.type === 'late' ? 'Arrived Late' : 'Left Early';
                    const tagClass = missedClassInfo.type === 'late' ? 'student-late-tag' : 'student-early-tag';
                    classInfoDiv.innerHTML = `
                        <span class="teacher-name">${cls.teacherName}${subTag}</span>
                        <span class="${tagClass}">${tagLabel}</span>
                        <span class="status-icon">${statusIcon}</span>
                        <span class="absent-reason">${missedClassInfo.reason}</span>
                    `;
                } else {
                    classInfoDiv.innerHTML = `
                        <span class="teacher-name clickable">${cls.teacherName}${subTag}${subByTag}${overrideIndicator}</span>
                        <span class="status-icon">${statusIcon}</span>
                        ${lastReportDisplay}
                    `;
                }

                // Add click handler to toggle override (only if class was not missed)
                if (!classMissed) {
                    classInfoDiv.querySelector('.teacher-name').addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleOverride(
                            currentData.date,
                            student.studentName,
                            cls.teacherName,
                            cls.timeSlot,
                            cls.submitted // original status
                        );
                    });
                }

                cell.appendChild(classInfoDiv);
            } else {
                cell.innerHTML = `<div class="no-class">-</div>`;
            }

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });
}

// Format time slot header to be more compact (e.g., "8AM to 9AM" -> "8-9")
function formatTimeSlotHeader(slot) {
    const match = slot.match(/(\d+)([AP]M)\s*to\s*(\d+)([AP]M)/i);
    if (match) {
        const startHour = match[1];
        const startPeriod = match[2].toUpperCase();
        const endHour = match[3];
        const endPeriod = match[4].toUpperCase();

        // If same period, just show "8-9A" or "3-4P"
        if (startPeriod === endPeriod) {
            return `${startHour}-${endHour}${startPeriod[0]}`;
        }
        return `${startHour}${startPeriod[0]}-${endHour}${endPeriod[0]}`;
    }
    return slot;
}

function filterStudents(students) {
    let filtered = students;

    const selectedStudent = studentFilter.value;
    const selectedTeacher = teacherFilter.value;
    const selectedStatus = statusFilter.value;

    if (selectedStudent) {
        filtered = filtered.filter(student => student.studentName === selectedStudent);
    }

    if (selectedTeacher) {
        filtered = filtered.filter(student =>
            student.classes.some(cls => cls.teacherName === selectedTeacher)
        );
    }

    if (selectedStatus === 'submitted') {
        filtered = filtered.filter(student =>
            student.classes.some(cls => cls.teacherName && cls.submitted)
        );
    } else if (selectedStatus === 'missing') {
        filtered = filtered.filter(student =>
            student.classes.some(cls => cls.teacherName && !cls.submitted)
        );
    }

    return filtered;
}

function applyFilters() {
    if (currentData && currentData.students) {
        renderTable(currentData);
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function printMissing() {
    if (!currentData || !currentData.students) {
        alert('No data to print');
        return;
    }

    // Temporarily filter to show only missing
    const originalStatus = statusFilter.value;
    statusFilter.value = 'missing';
    applyFilters();

    // Print
    window.print();

    // Restore filter
    statusFilter.value = originalStatus;
    applyFilters();
}

function exportToCSV() {
    if (!currentData || !currentData.students) {
        alert('No data to export');
        return;
    }

    const { students } = currentData;
    const filtered = filterStudents(students);

    // CSV header for merged classes
    let csv = `Student,Korean Name,Time Slot,Teacher,Status\n`;

    // CSV rows - one row per class block
    filtered.forEach(student => {
        const englishName = student.studentEnglishName || student.studentName.split('[')[0].trim();
        const koreanName = student.studentName.match(/\[([^\]]+)\]/)?.[1] || '';

        student.classes.forEach(cls => {
            if (cls.teacherName) {
                const status = cls.submitted ? 'Submitted' : 'Missing';
                csv += `"${englishName}","${koreanName}","${cls.timeSlot}","${cls.teacherName}","${status}"\n`;
            }
        });
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `submission-tracker-${currentData.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================
// ANALYTICS TAB FUNCTIONALITY
// ============================================

// Analytics DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const trackerTab = document.getElementById('trackerTab');
const analyticsTab = document.getElementById('analyticsTab');
const analyticsStartDate = document.getElementById('analyticsStartDate');
const analyticsEndDate = document.getElementById('analyticsEndDate');
const loadAnalyticsBtn = document.getElementById('loadAnalyticsBtn');
const lastWeekBtn = document.getElementById('lastWeekBtn');
const lastMonthBtn = document.getElementById('lastMonthBtn');
const analyticsError = document.getElementById('analyticsError');
const analyticsLoading = document.getElementById('analyticsLoading');
const analyticsSummary = document.getElementById('analyticsSummary');
const needsAttentionSection = document.getElementById('needsAttentionSection');
const topPerformersSection = document.getElementById('topPerformersSection');
const allTeachersSection = document.getElementById('allTeachersSection');
const exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');

// Analytics State
let analyticsData = null;
let sortColumn = 'performanceScore';
let sortDirection = 'asc';

// Initialize Analytics
document.addEventListener('DOMContentLoaded', () => {
    // Set default date range to last 7 days
    setLastWeek();

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Analytics event listeners
    loadAnalyticsBtn?.addEventListener('click', loadAnalytics);
    lastWeekBtn?.addEventListener('click', () => { setLastWeek(); loadAnalytics(); });
    lastMonthBtn?.addEventListener('click', () => { setLastMonth(); loadAnalytics(); });
    exportAnalyticsBtn?.addEventListener('click', exportAnalyticsToCSV);

    // Table sorting
    document.querySelectorAll('.analytics-table.sortable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
        th.style.cursor = 'pointer';
    });
});

function switchTab(tabName) {
    if (tabName === 'analytics' && !isAuthenticated) {
        // Prompt for password if not already authenticated
        if (!adminPassword) {
            if (!promptForPassword()) {
                return; // User cancelled
            }
        }
    }

    tabBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'tracker') {
        trackerTab.classList.add('active');
        analyticsTab.classList.remove('active');
    } else {
        trackerTab.classList.remove('active');
        analyticsTab.classList.add('active');
    }
}

function setLastWeek() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    analyticsStartDate.value = formatDateForInput(start);
    analyticsEndDate.value = formatDateForInput(end);
}

function setLastMonth() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    analyticsStartDate.value = formatDateForInput(start);
    analyticsEndDate.value = formatDateForInput(end);
}

function formatDateForInput(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function loadAnalytics() {
    const startDate = analyticsStartDate.value;
    const endDate = analyticsEndDate.value;

    if (!startDate || !endDate) {
        showAnalyticsError('Please select both start and end dates');
        return;
    }

    if (startDate > endDate) {
        showAnalyticsError('Start date must be before end date');
        return;
    }

    hideAnalyticsError();
    analyticsLoading.style.display = 'block';
    analyticsSummary.style.display = 'none';
    needsAttentionSection.style.display = 'none';
    topPerformersSection.style.display = 'none';
    allTeachersSection.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/analytics?startDate=${startDate}&endDate=${endDate}&password=${encodeURIComponent(adminPassword)}`);
        const data = await response.json();

        if (!response.ok) {
            if (data.requiresAuth) {
                // Password was wrong - clear it and prompt again
                clearAuthOnFailure();
                showAnalyticsError('Invalid password. Please try again.');
                // Switch back to tracker tab
                switchTab('tracker');
                return;
            }
            throw new Error(data.message || data.error || 'Failed to load analytics');
        }

        // Password was correct
        isAuthenticated = true;
        analyticsData = data;
        renderAnalytics(data);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showAnalyticsError(error.message);
    } finally {
        analyticsLoading.style.display = 'none';
    }
}

function renderAnalytics(data) {
    // Summary Cards
    document.getElementById('totalReportsCard').textContent = data.summary.totalExpectedReports.toLocaleString();
    document.getElementById('submissionRateCard').textContent = `${data.summary.overallSubmissionRate}%`;
    document.getElementById('onTimeRateCard').textContent = `${data.summary.overallOnTimeRate}%`;
    document.getElementById('missedReportsCard').textContent = data.summary.totalMissedReports.toLocaleString();

    // Color code submission rate
    const submissionCard = document.getElementById('submissionRateCard').parentElement;
    submissionCard.classList.remove('success', 'warning', 'danger');
    if (data.summary.overallSubmissionRate >= 90) submissionCard.classList.add('success');
    else if (data.summary.overallSubmissionRate >= 70) submissionCard.classList.add('warning');
    else submissionCard.classList.add('danger');

    analyticsSummary.style.display = 'flex';

    // Needs Attention Table
    if (data.needsAttention && data.needsAttention.length > 0) {
        renderNeedsAttentionTable(data.needsAttention);
        needsAttentionSection.style.display = 'block';
    }

    // Top Performers Table
    if (data.topPerformers && data.topPerformers.length > 0) {
        renderTopPerformersTable(data.topPerformers);
        topPerformersSection.style.display = 'block';
    }

    // All Teachers Table
    if (data.allTeachers && data.allTeachers.length > 0) {
        renderAllTeachersTable(data.allTeachers);
        allTeachersSection.style.display = 'block';
    }
}

function renderNeedsAttentionTable(teachers) {
    const tbody = document.getElementById('needsAttentionBody');
    tbody.innerHTML = teachers.map(t => `
        <tr class="attention-row">
            <td><strong>${t.teacherName}</strong></td>
            <td>${t.expectedReports}</td>
            <td>${t.actualReports}</td>
            <td class="missed-cell">${t.missedReports}</td>
            <td class="${getRateClass(t.submissionRate)}">${t.submissionRate}%</td>
            <td class="${getRateClass(t.onTimeRate)}">${t.onTimeRate}%</td>
            <td class="${getScoreClass(t.performanceScore)}">${t.performanceScore}</td>
        </tr>
    `).join('');
}

function renderTopPerformersTable(teachers) {
    const tbody = document.getElementById('topPerformersBody');
    tbody.innerHTML = teachers.map(t => `
        <tr class="performer-row">
            <td><strong>${t.teacherName}</strong></td>
            <td>${t.expectedReports}</td>
            <td>${t.actualReports}</td>
            <td class="${getRateClass(t.submissionRate)}">${t.submissionRate}%</td>
            <td class="${getRateClass(t.onTimeRate)}">${t.onTimeRate}%</td>
            <td class="${getScoreClass(t.performanceScore)}">${t.performanceScore}</td>
        </tr>
    `).join('');
}

function renderAllTeachersTable(teachers) {
    // Sort if needed
    const sorted = [...teachers].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (typeof aVal === 'string') {
            return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const tbody = document.getElementById('allTeachersBody');
    tbody.innerHTML = sorted.map(t => `
        <tr>
            <td><strong>${t.teacherName}</strong></td>
            <td>${t.expectedReports}</td>
            <td>${t.actualReports}</td>
            <td class="${t.missedReports > 0 ? 'missed-cell' : ''}">${t.missedReports}</td>
            <td class="${getRateClass(t.submissionRate)}">${t.submissionRate}%</td>
            <td class="${getRateClass(t.onTimeRate)}">${t.onTimeRate}%</td>
            <td>${t.avgDelay} days</td>
            <td class="${getScoreClass(t.performanceScore)}"><strong>${t.performanceScore}</strong></td>
        </tr>
    `).join('');

    // Update sort indicators
    document.querySelectorAll('.analytics-table.sortable th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortColumn) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    if (analyticsData) {
        renderAllTeachersTable(analyticsData.allTeachers);
    }
}

function getRateClass(rate) {
    if (rate >= 90) return 'rate-good';
    if (rate >= 70) return 'rate-ok';
    return 'rate-bad';
}

function getScoreClass(score) {
    if (score >= 90) return 'score-good';
    if (score >= 70) return 'score-ok';
    return 'score-bad';
}

function showAnalyticsError(message) {
    analyticsError.textContent = message;
    analyticsError.style.display = 'block';
}

function hideAnalyticsError() {
    analyticsError.style.display = 'none';
}

function exportAnalyticsToCSV() {
    if (!analyticsData || !analyticsData.allTeachers) {
        alert('No analytics data to export');
        return;
    }

    const { summary, allTeachers } = analyticsData;

    // Build CSV
    let csv = `Teacher Analytics Report\n`;
    csv += `Date Range,${summary.dateRange.startDate} to ${summary.dateRange.endDate}\n`;
    csv += `Total Days,${summary.totalDays}\n`;
    csv += `Overall Submission Rate,${summary.overallSubmissionRate}%\n`;
    csv += `Overall On-Time Rate,${summary.overallOnTimeRate}%\n\n`;

    csv += `Teacher,Expected Reports,Submitted Reports,Missed Reports,Submission Rate,On-Time Rate,Avg Delay (days),Performance Score\n`;

    allTeachers.forEach(t => {
        csv += `"${t.teacherName}",${t.expectedReports},${t.actualReports},${t.missedReports},${t.submissionRate}%,${t.onTimeRate}%,${t.avgDelay},${t.performanceScore}\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `teacher-analytics-${summary.dateRange.startDate}-to-${summary.dateRange.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
