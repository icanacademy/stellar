document.addEventListener('DOMContentLoaded', function () {
    const searchForm = document.getElementById('searchForm');
    const clearSearchBtn = document.getElementById('clearSearch');
    const resultsSection = document.getElementById('resultsSection');
    const resultsBody = document.getElementById('resultsBody');
    const resultsCount = document.getElementById('resultsCount');
    const paginationDiv = document.getElementById('pagination');
    const modal = document.getElementById('reportModal');
    const modalClose = document.getElementById('modalClose');
    const modalContainer = document.getElementById('modalReportContainer');
    const modalDownload = document.getElementById('modalDownload');

    const studentSearchInput = document.getElementById('searchStudent');
    const studentDropdown = document.getElementById('studentDropdown');
    const studentDropdownArrow = document.getElementById('studentDropdownArrow');
    const teacherSearchInput = document.getElementById('searchTeacher');
    const teacherDropdown = document.getElementById('teacherDropdown');
    const teacherDropdownArrow = document.getElementById('teacherDropdownArrow');

    let currentPage = 1;
    const PAGE_LIMIT = 20;

    let allStudentsData = [];   // full unfiltered list
    let allTeachersData = [];   // full unfiltered list
    let studentsData = [];
    let filteredStudents = [];
    let selectedStudentIndex = -1;

    let teachersData = [];
    let filteredTeachers = [];
    let selectedTeacherIndex = -1;

    // ── Load students and teachers for dropdowns ──

    async function loadStudents(filterByTeacher) {
        try {
            let url = '/api/reports/students';
            if (filterByTeacher) url += '?teacher=' + encodeURIComponent(filterByTeacher);
            const response = await fetch(url);
            if (response.ok) {
                const names = await response.json();
                studentsData = names.map(n => ({ fullName: n }));
                if (!filterByTeacher) allStudentsData = studentsData.slice();
                studentSearchInput.placeholder = `Search ${studentsData.length} students...`;
            } else {
                studentSearchInput.placeholder = 'Failed to load students';
            }
        } catch (e) {
            studentSearchInput.placeholder = 'Error loading students';
        }
    }

    async function loadTeachers(filterByStudent) {
        try {
            let url = '/api/reports/teachers';
            if (filterByStudent) url += '?student=' + encodeURIComponent(filterByStudent);
            const response = await fetch(url);
            if (response.ok) {
                const names = await response.json();
                teachersData = names.map(n => ({ fullName: n }));
                if (!filterByStudent) allTeachersData = teachersData.slice();
                teacherSearchInput.placeholder = `Search ${teachersData.length} teachers...`;
            } else {
                teacherSearchInput.placeholder = 'Failed to load teachers';
            }
        } catch (e) {
            teacherSearchInput.placeholder = 'Error loading teachers';
        }
    }

    loadStudents();
    loadTeachers();

    // ── Student dropdown ──

    studentSearchInput.addEventListener('input', function () {
        const term = this.value.toLowerCase();
        // If the student field is cleared, reset teacher dropdown to full list
        if (term === '' && teachersData.length !== allTeachersData.length) {
            teachersData = allTeachersData.slice();
            teacherSearchInput.placeholder = `Search ${teachersData.length} teachers...`;
        }
        filteredStudents = studentsData.filter(s => s.fullName.toLowerCase().includes(term));
        selectedStudentIndex = -1;
        renderStudentDropdown();
        showDropdown(studentDropdown);
    });

    studentSearchInput.addEventListener('focus', function () {
        if (this.value === '') filteredStudents = studentsData;
        else {
            const term = this.value.toLowerCase();
            filteredStudents = studentsData.filter(s => s.fullName.toLowerCase().includes(term));
        }
        renderStudentDropdown();
        showDropdown(studentDropdown);
    });

    studentSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedStudentIndex = Math.min(selectedStudentIndex + 1, filteredStudents.length - 1);
            renderStudentDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedStudentIndex = Math.max(selectedStudentIndex - 1, -1);
            renderStudentDropdown();
        } else if (e.key === 'Enter' && selectedStudentIndex >= 0) {
            e.preventDefault();
            selectStudent(filteredStudents[selectedStudentIndex]);
        } else if (e.key === 'Escape') {
            hideDropdown(studentDropdown);
        }
    });

    studentDropdownArrow.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (studentDropdown.classList.contains('show')) {
            hideDropdown(studentDropdown);
        } else {
            filteredStudents = studentsData;
            selectedStudentIndex = -1;
            renderStudentDropdown();
            showDropdown(studentDropdown);
            studentSearchInput.focus();
        }
    });

    function renderStudentDropdown() {
        studentDropdown.innerHTML = '';
        if (filteredStudents.length === 0) {
            studentDropdown.innerHTML = '<div class="dropdown-item no-results">No students found</div>';
        } else {
            filteredStudents.forEach((s, i) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item' + (i === selectedStudentIndex ? ' selected' : '');
                item.textContent = s.fullName;
                item.addEventListener('click', () => selectStudent(s));
                studentDropdown.appendChild(item);
            });
        }
    }

    function selectStudent(student) {
        studentSearchInput.value = student.fullName;
        hideDropdown(studentDropdown);
        // Filter teachers dropdown to only those with records for this student
        loadTeachers(student.fullName);
    }

    // ── Teacher dropdown ──

    teacherSearchInput.addEventListener('input', function () {
        const term = this.value.toLowerCase();
        // If the teacher field is cleared, reset student dropdown to full list
        if (term === '' && studentsData.length !== allStudentsData.length) {
            studentsData = allStudentsData.slice();
            studentSearchInput.placeholder = `Search ${studentsData.length} students...`;
        }
        filteredTeachers = teachersData.filter(t => t.fullName.toLowerCase().includes(term));
        selectedTeacherIndex = -1;
        renderTeacherDropdown();
        showDropdown(teacherDropdown);
    });

    teacherSearchInput.addEventListener('focus', function () {
        if (this.value === '') filteredTeachers = teachersData;
        else {
            const term = this.value.toLowerCase();
            filteredTeachers = teachersData.filter(t => t.fullName.toLowerCase().includes(term));
        }
        renderTeacherDropdown();
        showDropdown(teacherDropdown);
    });

    teacherSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedTeacherIndex = Math.min(selectedTeacherIndex + 1, filteredTeachers.length - 1);
            renderTeacherDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedTeacherIndex = Math.max(selectedTeacherIndex - 1, -1);
            renderTeacherDropdown();
        } else if (e.key === 'Enter' && selectedTeacherIndex >= 0) {
            e.preventDefault();
            selectTeacher(filteredTeachers[selectedTeacherIndex]);
        } else if (e.key === 'Escape') {
            hideDropdown(teacherDropdown);
        }
    });

    teacherDropdownArrow.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (teacherDropdown.classList.contains('show')) {
            hideDropdown(teacherDropdown);
        } else {
            filteredTeachers = teachersData;
            selectedTeacherIndex = -1;
            renderTeacherDropdown();
            showDropdown(teacherDropdown);
            teacherSearchInput.focus();
        }
    });

    function renderTeacherDropdown() {
        teacherDropdown.innerHTML = '';
        if (filteredTeachers.length === 0) {
            teacherDropdown.innerHTML = '<div class="dropdown-item no-results">No teachers found</div>';
        } else {
            filteredTeachers.forEach((t, i) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item' + (i === selectedTeacherIndex ? ' selected' : '');
                item.textContent = t.fullName;
                item.addEventListener('click', () => selectTeacher(t));
                teacherDropdown.appendChild(item);
            });
        }
    }

    function selectTeacher(teacher) {
        teacherSearchInput.value = teacher.fullName;
        hideDropdown(teacherDropdown);
        // Filter students dropdown to only those with records for this teacher
        loadStudents(teacher.fullName);
    }

    // ── Shared dropdown helpers ──

    function showDropdown(el) { el.classList.add('show'); }
    function hideDropdown(el) { el.classList.remove('show'); }

    document.addEventListener('click', function (e) {
        if (!studentSearchInput.contains(e.target) && !studentDropdown.contains(e.target) && !studentDropdownArrow.contains(e.target)) {
            hideDropdown(studentDropdown);
        }
        if (!teacherSearchInput.contains(e.target) && !teacherDropdown.contains(e.target) && !teacherDropdownArrow.contains(e.target)) {
            hideDropdown(teacherDropdown);
        }
    });

    // ── Helper functions (mirrored from script.js) ──

    function extractFirstName(fullName) {
        const match = fullName.match(/^\[([^\]]+)\]/);
        return match ? match[1] : fullName;
    }

    function getStars(rating) {
        const num = parseInt(rating) || 0;
        if (num === 0) return '<span style="color:#cbd5e1">☆☆☆☆☆</span>';
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= num) {
                stars += '<span style="color:#fbbf24">★</span>';
            } else {
                stars += '<span style="color:#cbd5e1">☆</span>';
            }
        }
        return stars;
    }

    function getSkillsTable(skills) {
        if (!skills || Object.keys(skills).length === 0) return '';
        let html = '<div class="report-skills-section"><h3 class="section-title">Skills Assessment</h3><div class="skills-table"><table><thead><tr><th>Skill</th><th>Score</th><th>Weaknesses</th></tr></thead><tbody>';
        for (const [skill, data] of Object.entries(skills)) {
            const weaknesses = (data.weaknesses || []).join(', ');
            html += `<tr><td>${skill}</td><td>${data.score}</td><td>${weaknesses || 'N/A'}</td></tr>`;
        }
        html += '</tbody></table></div></div>';
        return html;
    }

    function getScoresTable(scores) {
        if (!scores) return '';
        const scoreItems = [
            { label: 'Book/Materials', key: 'bookMaterials' },
            { label: 'Vocab Quiz', key: 'vocabulary' },
            { label: 'Class Video', key: 'classVideo' },
            { label: 'Homework', key: 'homework' },
            { label: 'HW Vocab/Journal', key: 'homeworkVocab' },
            { label: 'Weekly Test', key: 'weeklyTest' }
        ];
        const hasScores = scoreItems.some(item =>
            scores[item.key] && (scores[item.key].score !== '' || scores[item.key].total !== '')
        );
        if (!hasScores) return '';

        let html = '<div class="scores-table"><table><thead><tr><th>Item</th><th>Score</th><th>Performance</th></tr></thead><tbody>';
        scoreItems.forEach(item => {
            if (!scores[item.key]) return;
            const score = scores[item.key].score;
            const total = scores[item.key].total;
            if (score !== '' || total !== '') {
                const displayScore = score !== '' ? score : '-';
                const displayTotal = total !== '' ? total : '-';
                let barHTML = '<span style="color: #94a3b8;">N/A</span>';
                if (score !== '' && total !== '' && !isNaN(score) && !isNaN(total) && parseFloat(total) > 0) {
                    const percentage = (parseFloat(score) / parseFloat(total)) * 100;
                    let barClass = 'low';
                    if (percentage >= 80) barClass = 'high';
                    else if (percentage >= 50) barClass = 'medium';
                    barHTML = `<div class="score-bar-container"><div class="score-bar-fill ${barClass}" style="width: ${percentage}%"></div><div class="score-bar-percentage">${percentage.toFixed(0)}%</div></div>`;
                }
                html += `<tr><td>${item.label}</td><td>${displayScore}/${displayTotal}</td><td>${barHTML}</td></tr>`;
            }
        });
        html += '</tbody></table></div>';
        return `<div class="report-scores-section"><h3 class="section-title">Scores</h3>${html}</div>`;
    }

    function renderSFMet(sfMet, skillFocus) {
        // sfMet can be: "YES", "NO", or an object like {"Reading": true, "Grammar": false}
        if (typeof sfMet === 'object' && sfMet !== null) {
            const entries = Object.entries(sfMet);
            return entries.map(([skill, met]) => {
                const isMet = met === true;
                return `<span class="sf-tag ${isMet ? 'sf-met' : 'sf-not-met'}">${escapeHTML(skill)} ${isMet ? '✓' : '✗'}</span>`;
            }).join(' ');
        }
        // Legacy YES/NO format - show skill focus name with status
        if (sfMet === 'YES') {
            return skillFocus ? `<span class="sf-tag sf-met">${escapeHTML(skillFocus)} ✓</span>` : 'YES';
        }
        return skillFocus ? `<span class="sf-tag sf-not-met">${escapeHTML(skillFocus)} ✗</span>` : 'NO';
    }

    function getSfMetClass(sfMet) {
        if (typeof sfMet === 'object' && sfMet !== null) {
            const values = Object.values(sfMet);
            const allMet = values.every(v => v === true);
            const allNotMet = values.every(v => v !== true);
            if (allMet) return 'sf-met-yes';
            if (allNotMet) return 'sf-met-no';
            return 'sf-met-mixed';
        }
        return sfMet === 'YES' ? 'sf-met-yes' : 'sf-met-no';
    }

    function getSfMetLabel(sfMet) {
        if (typeof sfMet === 'object' && sfMet !== null) {
            const values = Object.values(sfMet);
            const metCount = values.filter(v => v === true).length;
            return `${metCount}/${values.length}`;
        }
        return sfMet === 'YES' ? 'YES' : 'NO';
    }

    function buildReportHTML(data) {
        const sfMetDisplay = renderSFMet(data.sfMet, data.skillFocus);

        return `
            <div class="report-card">
                <div class="report-header">
                    <img src="assets/ican-logo.png" alt="ICAN Logo" class="report-logo">
                    <h2 class="report-title">ICAN STELLAR DAILY REPORT</h2>
                </div>
                <div class="report-body">
                    <div class="report-main">
                        <div class="report-info-section">
                            <h3 class="section-title">Student Profile</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Date:</span>
                                    <span class="info-value">${data.date || ''}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Day:</span>
                                    <span class="info-value">${data.dayOfWeek || ''}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Student:</span>
                                    <span class="info-value">${(data.studentName || '').toUpperCase()}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">ID:</span>
                                    <span class="info-value">${data.studentId || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Grade Level:</span>
                                    <span class="info-value">${data.gradeLevel || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Gender:</span>
                                    <span class="info-value">${data.studentGender || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">WPM Initial:</span>
                                    <span class="info-value">${data.wpmInitial || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">GBWT Initial:</span>
                                    <span class="info-value">${data.gbwtInitial || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Reading Level Initial:</span>
                                    <span class="info-value">${data.readingLevelInitial || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Interview Score:</span>
                                    <span class="info-value">${data.interviewScore || 'TBD'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="report-info-section">
                            <h3 class="section-title">Class Details</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Teacher:</span>
                                    <span class="info-value">${extractFirstName(data.teacherName || '')}${data.isSubstitute === 'YES' ? ' <span style="background-color: #fbbf24; color: #78350f; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; font-weight: 600; margin-left: 4px;">SUB</span>' : ''}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Teacher ID:</span>
                                    <span class="info-value">${data.teacherId || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Subject:</span>
                                    <span class="info-value">${data.subject || ''}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Materials:</span>
                                    <span class="info-value">${data.materials || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Current Lesson:</span>
                                    <span class="info-value">${data.currentLesson || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Homework:</span>
                                    <span class="info-value">${data.homework || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Next Lesson:</span>
                                    <span class="info-value">${data.nextLesson || 'N/A'}</span>
                                </div>
                                <div class="info-item skill-focus-display">
                                    <span class="info-label">Skill Focus (SF):</span>
                                    <div class="sf-tags-display">${sfMetDisplay}</div>
                                </div>
                            </div>
                        </div>
                        <div class="report-ratings-section">
                            <h3 class="section-title">Class Participation</h3>
                            <div class="ratings-grid">
                                <div class="rating-item"><span class="rating-label">Attention</span><span class="rating-stars">${getStars(data.attention)}</span></div>
                                <div class="rating-item"><span class="rating-label">Retention</span><span class="rating-stars">${getStars(data.retention)}</span></div>
                                <div class="rating-item"><span class="rating-label">Comprehension</span><span class="rating-stars">${getStars(data.comprehension)}</span></div>
                                <div class="rating-item"><span class="rating-label">Behavior</span><span class="rating-stars">${getStars(data.behavior)}</span></div>
                                <div class="rating-item"><span class="rating-label">Handwriting</span><span class="rating-stars">${getStars(data.handwriting)}</span></div>
                                <div class="rating-item"><span class="rating-label">Conversation</span><span class="rating-stars">${getStars(data.conversation)}</span></div>
                            </div>
                        </div>
                        ${getSkillsTable(data.skills)}
                        ${getScoresTable(data.scores)}
                        <div class="report-comments-section">
                            <h3 class="section-title">Written Report</h3>
                            <div class="narrative-container">
                                <div class="narrative-text">${data.narrative || '<em>No narrative available.</em>'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // ── Search ──

    searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        currentPage = 1;
        doSearch();
    });

    clearSearchBtn.addEventListener('click', function () {
        searchForm.reset();
        studentSearchInput.value = '';
        teacherSearchInput.value = '';
        resultsSection.style.display = 'none';
        // Reset dropdowns to full unfiltered lists
        studentsData = allStudentsData.slice();
        teachersData = allTeachersData.slice();
        studentSearchInput.placeholder = `Search ${studentsData.length} students...`;
        teacherSearchInput.placeholder = `Search ${teachersData.length} teachers...`;
    });

    function doSearch() {
        const params = new URLSearchParams();
        const student = document.getElementById('searchStudent').value.trim();
        const teacher = document.getElementById('searchTeacher').value.trim();
        const dateFrom = document.getElementById('searchDateFrom').value;
        const dateTo = document.getElementById('searchDateTo').value;

        if (student) params.set('student', student);
        if (teacher) params.set('teacher', teacher);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        params.set('page', currentPage);
        params.set('limit', PAGE_LIMIT);

        resultsSection.style.display = 'block';
        resultsBody.innerHTML = '<tr><td colspan="6"><div class="loading-msg"><div class="spinner"></div>Searching...</div></td></tr>';
        paginationDiv.innerHTML = '';

        fetch('/api/reports/search?' + params.toString())
            .then(r => r.json())
            .then(data => renderResults(data))
            .catch(err => {
                console.error(err);
                resultsBody.innerHTML = '<tr><td colspan="6" class="no-results-msg">Error loading results.</td></tr>';
            });
    }

    function renderResults(data) {
        resultsCount.textContent = `(${data.total} report${data.total !== 1 ? 's' : ''} found)`;

        if (data.results.length === 0) {
            resultsBody.innerHTML = '<tr><td colspan="6" class="no-results-msg">No reports found matching your search.</td></tr>';
            paginationDiv.innerHTML = '';
            return;
        }

        resultsBody.innerHTML = data.results.map(r => {
            // For the table, parse sfMet if it looks like JSON
            let sfMetVal = r.sfMet;
            try {
                const parsed = JSON.parse(r.sfMet);
                if (typeof parsed === 'object' && parsed !== null) sfMetVal = parsed;
            } catch (e) { /* keep as string */ }

            return `
            <tr>
                <td>${r.date}<br><small style="color:#8892b0">${r.dayOfWeek}</small></td>
                <td>${escapeHTML(r.studentName)}</td>
                <td>${escapeHTML(extractFirstName(r.teacherName))}</td>
                <td>${escapeHTML(r.subject)}</td>
                <td class="${getSfMetClass(sfMetVal)}">${getSfMetLabel(sfMetVal)}</td>
                <td><button class="view-btn" data-row="${r.rowIndex}">View</button></td>
            </tr>`;
        }).join('');

        // Attach view handlers
        resultsBody.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                openReport(parseInt(this.dataset.row));
            });
        });

        renderPagination(data.page, data.totalPages);
    }

    function renderPagination(page, totalPages) {
        if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }

        let html = '';
        html += `<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">Prev</button>`;

        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);

        if (startPage > 1) {
            html += `<button data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="page-info">...</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            html += `<button data-page="${i}" ${i === page ? 'class="active"' : ''}>${i}</button>`;
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-info">...</span>`;
            html += `<button data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `<button ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next</button>`;
        paginationDiv.innerHTML = html;

        paginationDiv.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function () {
                if (this.disabled) return;
                currentPage = parseInt(this.dataset.page);
                doSearch();
            });
        });
    }

    // ── Report Preview Modal ──

    function openReport(rowIndex) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        modalContainer.innerHTML = '<div class="loading-msg"><div class="spinner"></div>Loading report...</div>';

        fetch('/api/reports/' + rowIndex)
            .then(r => {
                if (!r.ok) throw new Error('Report not found');
                return r.json();
            })
            .then(data => {
                modalContainer.innerHTML = buildReportHTML(data);
                modalContainer._reportData = data;
            })
            .catch(err => {
                console.error(err);
                modalContainer.innerHTML = '<div class="no-results-msg">Failed to load report.</div>';
            });
    }

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });

    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        modalContainer.innerHTML = '';
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeModal();
    });

    // ── Download ──

    modalDownload.addEventListener('click', async function () {
        const reportEl = modalContainer.querySelector('.report-card');
        if (!reportEl) { alert('No report to download'); return; }

        try {
            const originalOverflow = reportEl.style.overflow;
            const originalWidth = reportEl.style.width;
            reportEl.style.overflow = 'hidden';
            reportEl.style.width = reportEl.offsetWidth + 'px';
            reportEl.offsetHeight; // force reflow

            const canvas = await html2canvas(reportEl, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                scrollX: 0,
                scrollY: 0,
                width: reportEl.offsetWidth,
                height: reportEl.offsetHeight
            });

            reportEl.style.overflow = originalOverflow;
            reportEl.style.width = originalWidth;

            const link = document.createElement('a');
            const data = modalContainer._reportData || {};
            const studentSlug = (data.studentName || 'student').replace(/\s+/g, '-');
            const dateSlug = data.date || new Date().toISOString().split('T')[0];
            link.download = `ican-stellar-report-${studentSlug}-${dateSlug}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Error generating image:', err);
            alert('Error generating report image. Please try again.');
        }
    });

    // ── Utility ──

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Run initial search on page load (show all recent reports)
    doSearch();
});
