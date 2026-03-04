// Academic Enabler - Frontend Logic

const DOMAINS = [
    {
        name: 'Study Habits',
        number: 'I',
        skills: [
            { name: 'Note-taking', desc: 'Takes complete, organized notes in legible form that can later serve as a study guide' },
            { name: 'Reviewing', desc: 'Reviews class notes frequently to ensure understanding' },
            { name: 'Annotating', desc: 'Uses highlighters, margin notes, or other strategies to identify key information when reading' },
            { name: 'Study Time', desc: 'Allocates enough time to study for tests and quizzes' },
            { name: 'Asking for Teacher Assistance', desc: 'Is willing to seek help from the teacher when he/she has difficulty understanding a topic' }
        ]
    },
    {
        name: 'Organization',
        number: 'II',
        skills: [
            { name: 'Punctuality', desc: 'Arrives to class on time' },
            { name: 'Orderliness', desc: 'Maintains organization of backpack or book bag so that the student can quickly find needed supplies' },
            { name: 'Work Materials', desc: 'Brings the necessary work materials expected for the class' },
            { name: 'Learning Transition', desc: 'Is efficient in switching work materials when transitioning from one learning activity to the next' }
        ]
    },
    {
        name: 'Homework Accomplishment',
        number: 'III',
        skills: [
            { name: 'Homework Completion', desc: 'Writes down homework assignments accurately and completely' },
            { name: 'Time Management', desc: 'Makes use of available time to work on homework and complete it on time' },
            { name: 'Homework Annotations', desc: 'Uses highlighters, margin notes to note questions for further review during class' }
        ]
    },
    {
        name: 'Cooperative Learning Skill',
        number: 'IV',
        skills: [
            { name: 'Discussion Participation', desc: 'Participates in class discussion' },
            { name: 'Group Activity Cooperation', desc: 'Gets along with others during group/pair activities' },
            { name: 'Class Activities Participation', desc: 'Cooperates with the teacher during class activities' },
            { name: 'Group Task Distribution', desc: 'Does his/her fair share of work during group/pair activities' },
            { name: 'Leadership', desc: 'Is willing to take a leadership position during group/pair activities' }
        ]
    },
    {
        name: 'Independent Seat Work',
        number: 'V',
        skills: [
            { name: 'Classroom Behaviour', desc: 'Refrains from distracting behaviours that interrupt the learning of self and others' },
            { name: 'Asking for Teacher Assistance', desc: 'Requests teacher assistance in an appropriate manner' },
            { name: 'Efficiency', desc: 'Uses remaining time to check work or engage in academic activity when classroom work is completed early' },
            { name: 'Output Quality', desc: 'Takes care in completing quality work' },
            { name: 'Dependability', desc: 'Is reliable in turning in assignments done in class' }
        ]
    },
    {
        name: 'Motivation',
        number: 'VI',
        skills: [
            { name: 'Self-Efficacy', desc: 'Has a positive sense of self-efficacy about the class' },
            { name: 'Intrinsic Motivation', desc: 'Displays some apparent intrinsic motivation' },
            { name: 'Extrinsic Motivation', desc: 'Displays some apparent extrinsic motivation' }
        ]
    }
];

// State
let teachers = [];
let initialEntryId = null;
let finalEntryId = null;
let currentSeason = null; // { id, label, from, to }
let autoSaveTimer = null;

// Teacher participation state
let activeTeachersInitial = new Set();
let activeTeachersFinal = new Set();
let loadedInitialEntry = null;
let loadedFinalEntry = null;

// DOM refs
const studentSelect = document.getElementById('studentSelect');
const seasonSelect = document.getElementById('seasonSelect');
const saveBtn = document.getElementById('saveBtn');
const domainSections = document.getElementById('domainSections');
const formContainer = document.getElementById('formContainer');
const emptyState = document.getElementById('emptyState');
const summaryContent = document.getElementById('summaryContent');
const studentNameDisplay = document.getElementById('studentNameDisplay');
const teacherListDisplay = document.getElementById('teacherListDisplay');
const loadingState = document.getElementById('loadingState');
const teacherMgmtBar = document.getElementById('teacherMgmtBar');
const toast = document.getElementById('toast');

// Teacher participation helpers
function isTeacherActive(fullName, phase) {
    const set = phase === 'initial' ? activeTeachersInitial : activeTeachersFinal;
    return set.has(fullName);
}

function getSavedScore(phase, domain, skill, teacher) {
    const entry = phase === 'initial' ? loadedInitialEntry : loadedFinalEntry;
    if (!entry || !entry.ratings) return undefined;
    return entry.ratings[domain]?.[skill]?.[teacher];
}

function collectAllScores() {
    const scores = {};
    document.querySelectorAll('.score-input').forEach(inp => {
        if (inp.value !== '') {
            const key = `${inp.dataset.phase}|${inp.dataset.domain}|${inp.dataset.skill}|${inp.dataset.teacher}`;
            scores[key] = inp.value;
        }
    });
    return scores;
}

function restoreAllScores(scores) {
    document.querySelectorAll('.score-input').forEach(inp => {
        const key = `${inp.dataset.phase}|${inp.dataset.domain}|${inp.dataset.skill}|${inp.dataset.teacher}`;
        if (scores[key] !== undefined) {
            inp.value = scores[key];
            colorInput(inp);
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await loadStudents(studentSelect);
    setActiveNav();
    updateNavLinks(studentSelect.value);

    studentSelect.addEventListener('change', async () => {
        updateNavLinks(studentSelect.value);
        const student = studentSelect.value;
        if (student) {
            await loadSeasons(student);
        } else {
            resetSeasonSelect();
            clearForm();
        }
    });

    seasonSelect.addEventListener('change', () => {
        const student = studentSelect.value;
        const seasonId = seasonSelect.value;
        if (student && seasonId) {
            const option = seasonSelect.options[seasonSelect.selectedIndex];
            currentSeason = {
                id: seasonId,
                label: option.textContent,
                from: option.dataset.from,
                to: option.dataset.to
            };
            loadSeasonData(student, currentSeason);
        } else {
            clearForm();
        }
    });

    saveBtn.addEventListener('click', saveEntries);

    // Restore student from URL param (after listeners are attached)
    restoreStudentFromURL(studentSelect);
});

async function loadSeasons(student) {
    resetSeasonSelect();
    clearForm();
    try {
        const res = await fetch(`/api/student-seasons?student=${encodeURIComponent(student)}`);
        const seasons = await res.json();
        if (seasons.length === 0) {
            emptyState.querySelector('p').textContent = 'No class data found for this student';
            return;
        }
        seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.label;
            opt.dataset.from = s.from;
            opt.dataset.to = s.to;
            seasonSelect.appendChild(opt);
        });
        seasonSelect.disabled = false;
        // Auto-select if only one season
        if (seasons.length === 1) {
            seasonSelect.value = seasons[0].id;
            seasonSelect.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        showToast('Failed to load seasons', 'error');
    }
}

function resetSeasonSelect() {
    seasonSelect.innerHTML = '<option value="">-- Select Season --</option>';
    seasonSelect.disabled = true;
    currentSeason = null;
}

async function loadSeasonData(student, season) {
    loadingState.style.display = 'flex';
    formContainer.style.display = 'none';
    emptyState.style.display = 'none';

    try {
        const [teachersRes, entriesRes] = await Promise.all([
            fetch(`/api/teachers?student=${encodeURIComponent(student)}&from=${season.from}&to=${season.to}`),
            fetch(`/api/academic-enabler?student=${encodeURIComponent(student)}&season=${encodeURIComponent(season.id)}`)
        ]);

        teachers = await teachersRes.json();
        const entries = await entriesRes.json();
        const initialEntry = entries.find(e => e.type === 'initial');
        const finalEntry = entries.find(e => e.type === 'final');

        initialEntryId = initialEntry ? initialEntry.id : null;
        finalEntryId = finalEntry ? finalEntry.id : null;

        // Store loaded entries for preserving inactive teacher scores
        loadedInitialEntry = initialEntry || null;
        loadedFinalEntry = finalEntry || null;

        if (teachers.length === 0) {
            loadingState.style.display = 'none';
            emptyState.style.display = '';
            emptyState.querySelector('p').textContent = 'No teachers found for this season';
            return;
        }

        // Initialize active teacher sets from saved data (or default to all active)
        const teacherNames = teachers.map(t => t.fullName);
        activeTeachersInitial = new Set(
            initialEntry && initialEntry.activeTeachers
                ? initialEntry.activeTeachers
                : teacherNames
        );
        activeTeachersFinal = new Set(
            finalEntry && finalEntry.activeTeachers
                ? finalEntry.activeTeachers
                : teacherNames
        );

        studentNameDisplay.textContent = student;
        teacherListDisplay.innerHTML =
            `<span class="season-tag">${season.label}</span>` +
            teachers.map(t =>
                `<span class="teacher-tag">T. ${t.nickname || t.fullName}</span>`
            ).join('');

        buildTeacherMgmtBar();
        buildRatingTables();

        if (initialEntry) populateScores(initialEntry, 'initial');
        if (finalEntry) populateScores(finalEntry, 'final');

        updateAverages();
        saveBtn.disabled = false;
        loadingState.style.display = 'none';
        formContainer.style.display = '';

    } catch (e) {
        loadingState.style.display = 'none';
        emptyState.style.display = '';
        showToast('Failed to load data', 'error');
    }
}

function clearForm() {
    formContainer.style.display = 'none';
    emptyState.style.display = '';
    emptyState.querySelector('p').textContent = 'Select a student and season to view and edit their Academic Enabler assessment';
    teachers = [];
    initialEntryId = null;
    finalEntryId = null;
    activeTeachersInitial = new Set();
    activeTeachersFinal = new Set();
    loadedInitialEntry = null;
    loadedFinalEntry = null;
    teacherMgmtBar.style.display = 'none';
    teacherMgmtBar.innerHTML = '';
    saveBtn.disabled = true;
}

function buildTeacherMgmtBar() {
    if (teachers.length === 0) {
        teacherMgmtBar.style.display = 'none';
        return;
    }

    const rows = teachers.map(t => {
        const iChecked = activeTeachersInitial.has(t.fullName) ? 'checked' : '';
        const fChecked = activeTeachersFinal.has(t.fullName) ? 'checked' : '';
        const fullyInactive = !iChecked && !fChecked ? 'fully-inactive' : '';
        return `<div class="teacher-mgmt-row ${fullyInactive}" data-teacher="${t.fullName}">
            <span class="teacher-mgmt-name">T. ${t.nickname || t.fullName}</span>
            <div class="teacher-mgmt-phases">
                <label class="phase-initial"><input type="checkbox" data-teacher="${t.fullName}" data-phase="initial" ${iChecked}> I</label>
                <label class="phase-final"><input type="checkbox" data-teacher="${t.fullName}" data-phase="final" ${fChecked}> F</label>
            </div>
        </div>`;
    }).join('');

    teacherMgmtBar.innerHTML = `
        <div class="teacher-mgmt-header">
            <span>Teacher Participation</span>
            <span class="teacher-mgmt-chevron">&#9660;</span>
        </div>
        <div class="teacher-mgmt-body">${rows}</div>
    `;

    teacherMgmtBar.style.display = '';
    teacherMgmtBar.classList.remove('collapsed');

    teacherMgmtBar.querySelector('.teacher-mgmt-header').addEventListener('click', () => {
        teacherMgmtBar.classList.toggle('collapsed');
    });

    teacherMgmtBar.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => onTeacherToggle(cb));
    });
}

function onTeacherToggle(checkbox) {
    const teacher = checkbox.dataset.teacher;
    const phase = checkbox.dataset.phase;
    const set = phase === 'initial' ? activeTeachersInitial : activeTeachersFinal;

    if (checkbox.checked) {
        set.add(teacher);
    } else {
        set.delete(teacher);
    }

    // Update fully-inactive visual state
    const row = teacherMgmtBar.querySelector(`.teacher-mgmt-row[data-teacher="${teacher}"]`);
    if (row) {
        const bothOff = !activeTeachersInitial.has(teacher) && !activeTeachersFinal.has(teacher);
        row.classList.toggle('fully-inactive', bothOff);
    }

    const scores = collectAllScores();
    buildRatingTables();
    restoreAllScores(scores);
    updateAverages();
    scheduleAutoSave();
}

function teacherLabel(t) {
    return 'T. ' + (t.nickname || t.fullName);
}

// Layout: Sub-skill | [T1: I F] | [T2: I F] | ... | [Avg: I F] | [Grade: I F]
function buildRatingTables() {
    domainSections.innerHTML = '';

    // Visible teachers: show if at least one phase is active
    const visibleTeachers = teachers.filter(t =>
        activeTeachersInitial.has(t.fullName) || activeTeachersFinal.has(t.fullName)
    );

    DOMAINS.forEach(domain => {
        const section = document.createElement('div');
        section.className = 'domain-section';

        // Row 1: per-teacher group headers + Avg + Grade
        let headerRow1 = '';
        visibleTeachers.forEach(t => {
            headerRow1 += `<th colspan="2" class="teacher-group-header">${teacherLabel(t)}</th>`;
        });
        headerRow1 += `<th colspan="2" class="avg-group-header">Average</th>`;
        headerRow1 += `<th colspan="2" class="grade-group-header">Grade</th>`;

        // Row 2: I/F under each teacher + I/F under Avg/Grade
        let subHeader = '';
        visibleTeachers.forEach(t => {
            subHeader += `<th class="sub-col sub-initial teacher-group-first">I</th>`;
            subHeader += `<th class="sub-col sub-final">F</th>`;
        });
        subHeader += `<th class="sub-col sub-initial">I</th><th class="sub-col sub-final">F</th>`;
        subHeader += `<th class="sub-col sub-initial">I</th><th class="sub-col sub-final">F</th>`;

        // Skill rows
        const skillRows = domain.skills.map(skill => {
            let cells = '';
            visibleTeachers.forEach(t => {
                const iActive = activeTeachersInitial.has(t.fullName);
                const fActive = activeTeachersFinal.has(t.fullName);

                // Initial cell
                const iDisabledAttr = iActive ? '' : ' disabled';
                const iDisabledClass = iActive ? '' : ' phase-disabled';
                cells += `<td class="cell-initial teacher-group-first${iDisabledClass}">
                    <input type="number" min="0" max="100" class="score-input"
                        data-phase="initial" data-domain="${domain.name}"
                        data-skill="${skill.name}" data-teacher="${t.fullName}"${iDisabledAttr}>
                </td>`;

                // Final cell
                const fDisabledAttr = fActive ? '' : ' disabled';
                const fDisabledClass = fActive ? '' : ' phase-disabled';
                cells += `<td class="cell-final${fDisabledClass}">
                    <input type="number" min="0" max="100" class="score-input"
                        data-phase="final" data-domain="${domain.name}"
                        data-skill="${skill.name}" data-teacher="${t.fullName}"${fDisabledAttr}>
                </td>`;
            });

            return `<tr>
                <td><div class="skill-name">${skill.name}<span class="tooltip-trigger" data-tooltip="${skill.desc}">?</span></div></td>
                ${cells}
                <td class="avg-value cell-initial" data-avg="initial-${domain.name}-${skill.name}">-</td>
                <td class="avg-value cell-final" data-avg="final-${domain.name}-${skill.name}">-</td>
                <td class="cell-initial" data-grade="initial-${domain.name}-${skill.name}"><span class="grade-badge grade-none">-</span></td>
                <td class="cell-final" data-grade="final-${domain.name}-${skill.name}"><span class="grade-badge grade-none">-</span></td>
            </tr>`;
        }).join('');

        // Domain avg row - two empty cells per visible teacher
        let emptyTeacherCells = '';
        visibleTeachers.forEach(t => {
            emptyTeacherCells += `<td class="cell-initial teacher-group-first"></td>`;
            emptyTeacherCells += `<td class="cell-final"></td>`;
        });

        section.innerHTML = `
            <div class="domain-header">
                <span class="domain-number">${domain.number}</span>
                ${domain.name}
            </div>
            <div class="table-scroll">
            <table class="domain-table">
                <thead>
                    <tr>
                        <th rowspan="2" class="skill-col">Sub-skill</th>
                        ${headerRow1}
                    </tr>
                    <tr>${subHeader}</tr>
                </thead>
                <tbody>
                    ${skillRows}
                    <tr class="domain-avg-row">
                        <td><strong>Domain Average</strong></td>
                        ${emptyTeacherCells}
                        <td class="avg-value cell-initial" data-domain-avg-val="initial-${domain.name}">-</td>
                        <td class="avg-value cell-final" data-domain-avg-val="final-${domain.name}">-</td>
                        <td class="cell-initial" data-domain-avg-grade="initial-${domain.name}"><span class="grade-badge grade-none">-</span></td>
                        <td class="cell-final" data-domain-avg-grade="final-${domain.name}"><span class="grade-badge grade-none">-</span></td>
                    </tr>
                </tbody>
            </table>
            </div>
        `;
        domainSections.appendChild(section);
    });

    // Summary
    summaryContent.innerHTML = DOMAINS.map(d =>
        `<div class="summary-card">
            <div class="domain-name">${d.name}</div>
            <div class="summary-pair">
                <div class="summary-phase">
                    <div class="phase-label">Initial</div>
                    <div class="domain-avg" data-summary-avg="initial-${d.name}">-</div>
                    <div data-summary-grade="initial-${d.name}"><span class="grade-badge grade-none">-</span></div>
                </div>
                <div class="summary-phase">
                    <div class="phase-label">Final</div>
                    <div class="domain-avg" data-summary-avg="final-${d.name}">-</div>
                    <div data-summary-grade="final-${d.name}"><span class="grade-badge grade-none">-</span></div>
                </div>
            </div>
        </div>`
    ).join('');

    document.querySelectorAll('.score-input').forEach(input => {
        input.addEventListener('input', () => {
            colorInput(input);
            updateAverages();
            scheduleAutoSave();
        });
    });
}

function populateScores(entry, phase) {
    if (!entry.ratings) return;
    Object.entries(entry.ratings).forEach(([domName, skills]) => {
        Object.entries(skills).forEach(([skillName, teacherScores]) => {
            Object.entries(teacherScores).forEach(([teacher, score]) => {
                const input = document.querySelector(
                    `.score-input[data-phase="${phase}"][data-domain="${domName}"][data-skill="${skillName}"][data-teacher="${teacher}"]`
                );
                if (input) {
                    input.value = score;
                    colorInput(input);
                }
            });
        });
    });
}

function colorInput(input) {
    input.classList.remove('grade-e', 'grade-g', 'grade-p', 'grade-vp');
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    const grade = getGrade(val);
    if (grade) input.classList.add('grade-' + grade.key);
}

function getGrade(score) {
    if (score >= 90) return { letter: 'E', label: 'Excellent', key: 'e' };
    if (score >= 80) return { letter: 'G', label: 'Good', key: 'g' };
    if (score >= 70) return { letter: 'P', label: 'Poor', key: 'p' };
    return { letter: 'VP', label: 'Very Poor', key: 'vp' };
}

function updateAverages() {
    ['initial', 'final'].forEach(phase => {
        DOMAINS.forEach(domain => {
            let domainTotal = 0;
            let domainCount = 0;

            domain.skills.forEach(skill => {
                const inputs = document.querySelectorAll(
                    `.score-input[data-phase="${phase}"][data-domain="${domain.name}"][data-skill="${skill.name}"]`
                );
                let sum = 0, count = 0;
                inputs.forEach(inp => {
                    if (inp.disabled) return;
                    const v = parseFloat(inp.value);
                    if (!isNaN(v)) { sum += v; count++; }
                });

                const avgEl = document.querySelector(`[data-avg="${phase}-${domain.name}-${skill.name}"]`);
                const gradeEl = document.querySelector(`[data-grade="${phase}-${domain.name}-${skill.name}"]`);

                if (count > 0) {
                    const avg = sum / count;
                    avgEl.textContent = avg.toFixed(1);
                    const grade = getGrade(avg);
                    gradeEl.innerHTML = `<span class="grade-badge grade-${grade.key}">${grade.letter}</span>`;
                    domainTotal += avg;
                    domainCount++;
                } else {
                    avgEl.textContent = '-';
                    gradeEl.innerHTML = '<span class="grade-badge grade-none">-</span>';
                }
            });

            const domAvgEl = document.querySelector(`[data-domain-avg-val="${phase}-${domain.name}"]`);
            const domGradeEl = document.querySelector(`[data-domain-avg-grade="${phase}-${domain.name}"]`);
            const sumAvgEl = document.querySelector(`[data-summary-avg="${phase}-${domain.name}"]`);
            const sumGradeEl = document.querySelector(`[data-summary-grade="${phase}-${domain.name}"]`);

            if (domainCount > 0) {
                const domAvg = domainTotal / domainCount;
                const grade = getGrade(domAvg);
                domAvgEl.textContent = domAvg.toFixed(1);
                domGradeEl.innerHTML = `<span class="grade-badge grade-${grade.key}">${grade.letter}</span>`;
                sumAvgEl.textContent = domAvg.toFixed(1);
                sumGradeEl.innerHTML = `<span class="grade-badge grade-${grade.key}">${grade.letter}</span>`;
            } else {
                domAvgEl.textContent = '-';
                domGradeEl.innerHTML = '<span class="grade-badge grade-none">-</span>';
                sumAvgEl.textContent = '-';
                sumGradeEl.innerHTML = '<span class="grade-badge grade-none">-</span>';
            }
        });
    });
}

function collectPhaseData(phase) {
    const ratings = {};
    let hasData = false;
    DOMAINS.forEach(domain => {
        ratings[domain.name] = {};
        domain.skills.forEach(skill => {
            ratings[domain.name][skill.name] = {};
            teachers.forEach(t => {
                if (isTeacherActive(t.fullName, phase)) {
                    // Active teacher: read from DOM
                    const input = document.querySelector(
                        `.score-input[data-phase="${phase}"][data-domain="${domain.name}"][data-skill="${skill.name}"][data-teacher="${t.fullName}"]`
                    );
                    if (input && input.value !== '') {
                        ratings[domain.name][skill.name][t.fullName] = parseFloat(input.value);
                        hasData = true;
                    }
                } else {
                    // Inactive teacher: preserve previously saved score
                    const saved = getSavedScore(phase, domain.name, skill.name, t.fullName);
                    if (saved !== undefined) {
                        ratings[domain.name][skill.name][t.fullName] = saved;
                        hasData = true;
                    }
                }
            });
        });
    });
    return hasData ? ratings : null;
}

async function saveEntries(silent) {
    const student = studentSelect.value;
    if (!student || !currentSeason) return;

    const teacherNames = teachers.map(t => t.fullName);
    let saved = 0;

    for (const phase of ['initial', 'final']) {
        const ratings = collectPhaseData(phase);
        if (!ratings) continue;

        const entryId = phase === 'initial' ? initialEntryId : finalEntryId;
        const activeSet = phase === 'initial' ? activeTeachersInitial : activeTeachersFinal;
        const activeTeachers = teacherNames.filter(n => activeSet.has(n));
        const body = { student, type: phase, season: currentSeason.id, teachers: teacherNames, activeTeachers, ratings };

        try {
            let res;
            if (entryId) {
                res = await fetch(`/api/academic-enabler/${entryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch('/api/academic-enabler', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
            const result = await res.json();
            if (res.ok) {
                if (phase === 'initial') {
                    initialEntryId = result.id;
                    loadedInitialEntry = result;
                } else {
                    finalEntryId = result.id;
                    loadedFinalEntry = result;
                }
                saved++;
            }
        } catch (e) { /* continue */ }
    }

    if (!silent) {
        if (saved > 0) {
            showToast('Saved successfully', 'success');
        } else {
            showToast('Nothing to save — enter some scores first', 'error');
        }
    }
}

function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async function () {
        autoSaveTimer = null;
        await saveEntries(true);
    }, 800);
}

function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 3000);
}
