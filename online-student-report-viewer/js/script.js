document.addEventListener('DOMContentLoaded', function() {
    const studentSearchInput = document.getElementById('studentSearch');
    const studentDropdown = document.getElementById('studentDropdown');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const teacherFilter = document.getElementById('teacherFilter');
    const subjectFilter = document.getElementById('subjectFilter');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const reportsList = document.getElementById('reportsList');
    const analyticsSection = document.getElementById('analyticsSection');
    const reportCount = document.getElementById('reportCount');
    const chartsSection = document.getElementById('chartsSection');
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    const generateAiAnalysisBtn = document.getElementById('generateAiAnalysis');
    const aiLoadingState = document.getElementById('aiLoadingState');
    const aiContent = document.getElementById('aiContent');

    let studentsData = [];
    let filteredStudents = [];
    let selectedStudent = null;
    let isDropdownOpen = false;

    // Chart instances
    let radarChart = null;
    let lineChart = null;
    let barChart = null;
    let scoresChart = null;
    let skillFocusChart = null;
    let subjectChart = null;

    // Helper function to parse SF Met field (handles both old YES/NO and new JSON format)
    function parseSfMet(sfMetValue, skillFocusValue) {
        const result = {
            overallMet: false,
            allMet: true,
            anyMet: false,
            perSkill: {},
            metCount: 0,
            notMetCount: 0,
            totalCount: 0,
            displayHtml: ''
        };

        if (!sfMetValue) {
            result.displayHtml = '<span class="sf-met no">N/A</span>';
            return result;
        }

        // Try to parse as JSON first (new format)
        if (sfMetValue.startsWith('{') && sfMetValue.endsWith('}')) {
            try {
                const parsed = JSON.parse(sfMetValue);
                const tags = [];
                for (const [skill, met] of Object.entries(parsed)) {
                    result.perSkill[skill] = met === true;
                    result.totalCount++;
                    if (met === true) {
                        result.metCount++;
                        result.anyMet = true;
                        tags.push(`<span class="sf-tag sf-met-tag">${skill} ✓</span>`);
                    } else {
                        result.notMetCount++;
                        result.allMet = false;
                        tags.push(`<span class="sf-tag sf-not-met-tag">${skill} ✗</span>`);
                    }
                }
                result.overallMet = result.anyMet;
                result.displayHtml = `<div class="sf-tags-container">${tags.join('')}</div>`;
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
        result.displayHtml = `<span class="sf-met ${isMet ? 'yes' : 'no'}">${sfMetValue}</span>`;

        return result;
    }

    // Helper function to normalize and deduplicate materials (handles minor differences)
    function normalizeAndDeduplicateMaterials(materials) {
        if (!materials || materials.length === 0) return [];

        // Normalize: lowercase, trim, remove extra spaces
        const normalized = materials
            .filter(m => m && m.trim() !== '' && m !== 'N/A')
            .map(m => m.trim().replace(/\s+/g, ' '));

        // Group similar materials (case-insensitive, ignoring minor punctuation)
        const groups = {};
        normalized.forEach(material => {
            // Create a key for grouping: lowercase, remove punctuation
            const key = material.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            if (!groups[key]) {
                groups[key] = material; // Keep the first occurrence (original case)
            }
        });

        return Object.values(groups);
    }

    // Display materials for filtered subject
    function displayFilteredMaterials(reports, filteredSubject) {
        const materialsDisplay = document.getElementById('filteredMaterialsDisplay');
        if (!materialsDisplay) return;

        if (!filteredSubject || !reports || reports.length === 0) {
            materialsDisplay.style.display = 'none';
            return;
        }

        // Extract materials from reports (ensure strings only)
        const allMaterials = reports
            .filter(r => r.Subject === filteredSubject)
            .map(r => typeof r.Materials === 'string' ? r.Materials : '')
            .filter(m => m && m.trim() !== '');

        const uniqueMaterials = normalizeAndDeduplicateMaterials(allMaterials);

        if (uniqueMaterials.length === 0) {
            materialsDisplay.innerHTML = `<span class="materials-label">📚 Materials:</span> <span class="no-materials-inline">No materials recorded yet</span>`;
        } else {
            materialsDisplay.innerHTML = `<span class="materials-label">📚 Materials:</span> ${uniqueMaterials.map(m => `<span class="material-tag">${m}</span>`).join('')}`;
        }
        materialsDisplay.style.display = 'flex';
    }

    // Load initial data
    loadStudents().then(() => {
        // Check URL for student parameter (for returning from persona page)
        const urlParams = new URLSearchParams(window.location.search);
        const studentParam = urlParams.get('student');
        if (studentParam) {
            const decodedStudent = decodeURIComponent(studentParam);
            // Check if student exists in our data
            if (studentsData.includes(decodedStudent)) {
                selectStudent(decodedStudent);
                // Clear the URL parameter
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    });
    loadTeachers();
    loadSubjects();

    // Student search functionality
    studentSearchInput.addEventListener('input', handleSearch);
    studentSearchInput.addEventListener('focus', showDropdown);

    // Click outside to close dropdown
    document.addEventListener('click', function(e) {
        if (!studentSearchInput.contains(e.target) && !studentDropdown.contains(e.target)) {
            hideDropdown();
        }
    });

    // Filter buttons
    applyFiltersBtn.addEventListener('click', applyFilters);
    clearFiltersBtn.addEventListener('click', clearFilters);

    // AI Analysis button
    generateAiAnalysisBtn.addEventListener('click', generateAiAnalysis);

    // Download buttons
    const downloadChartsBtn = document.getElementById('downloadChartsBtn');
    const downloadAiBtn = document.getElementById('downloadAiBtn');
    const downloadAnalyticsBtn = document.getElementById('downloadAnalyticsBtn');
    const downloadReportsBtn = document.getElementById('downloadReportsBtn');

    if (downloadChartsBtn) {
        downloadChartsBtn.addEventListener('click', downloadPerformanceAnalytics);
    }

    if (downloadAiBtn) {
        downloadAiBtn.addEventListener('click', downloadAiAnalysis);
    }

    const downloadFrameworkBtn = document.getElementById('downloadFrameworkBtn');
    if (downloadFrameworkBtn) {
        downloadFrameworkBtn.addEventListener('click', downloadFrameworkAnalysis);
    }

    if (downloadAnalyticsBtn) {
        downloadAnalyticsBtn.addEventListener('click', downloadStudentAnalytics);
    }

    if (downloadReportsBtn) {
        downloadReportsBtn.addEventListener('click', downloadAllReports);
    }

    // View Student Persona button
    const viewPersonaBtn = document.getElementById('viewPersonaBtn');
    if (viewPersonaBtn) {
        viewPersonaBtn.addEventListener('click', () => {
            if (selectedStudent) {
                window.location.href = `persona.html?student=${encodeURIComponent(selectedStudent)}`;
            }
        });
    }

    // Helper function to extract first name from brackets
    function extractFirstName(fullName) {
        const match = fullName.match(/^\[([^\]]+)\]/);
        return match ? match[1] : fullName;
    }

    async function loadStudents() {
        try {
            const response = await fetch('/api/students');
            if (response.ok) {
                studentsData = await response.json();
                filteredStudents = studentsData;
            }
        } catch (error) {
            console.error('Error loading students:', error);
        }
    }

    async function loadTeachers() {
        try {
            const response = await fetch('/api/teachers');
            if (response.ok) {
                const teachers = await response.json();
                teachers.forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher;
                    option.textContent = teacher;
                    teacherFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading teachers:', error);
        }
    }

    async function loadSubjects() {
        try {
            const response = await fetch('/api/subjects');
            if (response.ok) {
                const subjects = await response.json();
                subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading subjects:', error);
        }
    }

    function handleSearch() {
        const searchTerm = studentSearchInput.value.toLowerCase();
        filteredStudents = studentsData.filter(student =>
            student.toLowerCase().includes(searchTerm)
        );
        renderDropdown();
        showDropdown();
    }

    function renderDropdown() {
        studentDropdown.innerHTML = '';

        if (filteredStudents.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-item no-results';
            noResults.textContent = 'No students found';
            studentDropdown.appendChild(noResults);
        } else {
            filteredStudents.forEach(student => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = student;
                item.addEventListener('click', () => selectStudent(student));
                studentDropdown.appendChild(item);
            });
        }
    }

    async function selectStudent(student) {
        selectedStudent = student;
        studentSearchInput.value = student;
        hideDropdown();

        // Show the View Persona button
        const viewPersonaBtn = document.getElementById('viewPersonaBtn');
        if (viewPersonaBtn) {
            viewPersonaBtn.style.display = 'inline-block';
        }

        // Load teachers and subjects specific to this student
        await loadStudentFilters(student);

        applyFilters();
    }

    async function loadStudentFilters(student) {
        try {
            // Get all reports for this student to find their teachers and subjects
            const response = await fetch(`/api/reports?student=${encodeURIComponent(student)}`);
            if (response.ok) {
                const reports = await response.json();

                // Extract unique teachers and subjects
                const teachers = new Set();
                const subjects = new Set();

                reports.forEach(report => {
                    if (report['Teacher Name']) teachers.add(report['Teacher Name']);
                    if (report.Subject) subjects.add(report.Subject);
                });

                // Update teacher filter
                teacherFilter.innerHTML = '<option value="">All Teachers</option>';
                Array.from(teachers).sort().forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher;
                    option.textContent = extractFirstName(teacher);
                    teacherFilter.appendChild(option);
                });

                // Update subject filter
                subjectFilter.innerHTML = '<option value="">All Subjects</option>';
                Array.from(subjects).sort().forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading student filters:', error);
        }
    }

    function showDropdown() {
        if (filteredStudents.length > 0 || studentSearchInput.value.length > 0) {
            renderDropdown();
            studentDropdown.classList.add('show');
            isDropdownOpen = true;
        }
    }

    function hideDropdown() {
        studentDropdown.classList.remove('show');
        isDropdownOpen = false;
    }

    async function applyFilters() {
        if (!selectedStudent) {
            alert('Please select a student first');
            return;
        }

        const params = new URLSearchParams({
            student: selectedStudent
        });

        if (startDateInput.value) params.append('startDate', startDateInput.value);
        if (endDateInput.value) params.append('endDate', endDateInput.value);
        if (teacherFilter.value) params.append('teacher', teacherFilter.value);
        if (subjectFilter.value) params.append('subject', subjectFilter.value);

        try {
            // Load reports
            const reportsResponse = await fetch(`/api/reports?${params.toString()}`);
            let reports = [];
            if (reportsResponse.ok) {
                reports = await reportsResponse.json();
                displayReports(reports);

                // Display materials for filtered subject
                displayFilteredMaterials(reports, subjectFilter.value);
            }

            // Load analytics (use same params as reports)
            const analyticsResponse = await fetch(`/api/analytics?${params.toString()}`);
            if (analyticsResponse.ok) {
                const analytics = await analyticsResponse.json();
                displayAnalytics(analytics);
            }

            // Load and display chart data immediately
            await loadAndDisplayCharts();

            // Show Academic Development Framework section (but empty until AI generates it)
            const academicFrameworkSection = document.getElementById('academicFrameworkSection');
            if (academicFrameworkSection) {
                academicFrameworkSection.style.display = 'block';
            }

            // Show AI analysis section
            aiAnalysisSection.style.display = 'block';
        } catch (error) {
            console.error('Error loading data:', error);
            reportsList.innerHTML = '<div class="error-state"><p>Error loading reports. Please try again.</p></div>';
        }
    }

    function clearFilters() {
        selectedStudent = null;
        studentSearchInput.value = '';
        startDateInput.value = '';
        endDateInput.value = '';
        teacherFilter.value = '';
        subjectFilter.value = '';
        reportsList.innerHTML = '<div class="empty-state"><p>👆 Select a student to view their reports</p></div>';
        analyticsSection.style.display = 'none';
        chartsSection.style.display = 'none';
        const academicFrameworkSection = document.getElementById('academicFrameworkSection');
        if (academicFrameworkSection) {
            academicFrameworkSection.style.display = 'none';
        }
        aiAnalysisSection.style.display = 'none';
        reportCount.textContent = '';

        // Hide the View Persona button
        const viewPersonaBtn = document.getElementById('viewPersonaBtn');
        if (viewPersonaBtn) {
            viewPersonaBtn.style.display = 'none';
        }
    }

    // Load and display charts (non-AI)
    async function loadAndDisplayCharts() {
        if (!selectedStudent) {
            return;
        }

        // Build params with same filters as reports
        const params = new URLSearchParams({
            student: selectedStudent
        });

        if (startDateInput.value) params.append('startDate', startDateInput.value);
        if (endDateInput.value) params.append('endDate', endDateInput.value);
        if (teacherFilter.value) params.append('teacher', teacherFilter.value);
        if (subjectFilter.value) params.append('subject', subjectFilter.value);

        // Show filter description
        const filterInfo = document.getElementById('filterInfo');
        const filterDescription = document.getElementById('filterDescription');
        let filters = [];

        if (startDateInput.value || endDateInput.value) {
            const dateRange = `${startDateInput.value || 'earliest'} to ${endDateInput.value || 'latest'}`;
            filters.push(`Date range: ${dateRange}`);
        }
        if (teacherFilter.value) {
            filters.push(`Teacher: ${extractFirstName(teacherFilter.value)}`);
        }
        if (subjectFilter.value) {
            filters.push(`Subject: ${subjectFilter.value}`);
        }

        if (filters.length > 0) {
            filterDescription.textContent = filters.join(' • ');
            filterInfo.style.display = 'block';
        } else {
            filterDescription.textContent = 'All available reports for this student';
            filterInfo.style.display = 'block';
        }

        try {
            const response = await fetch(`/api/chart-data?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();

                // Render charts only
                renderRadarChart(data.averageRatings);
                renderLineChart(data.ratingsOverTime);
                renderBarChart(data.weaknessFrequency);

                // Render scores chart if data exists
                if (data.scoresOverTime && data.scoresOverTime.length > 0) {
                    renderScoresChart(data.scoresOverTime, data.scoresCategoryStats);
                    displayScoresInsights(data.scoresCategoryStats);
                }

                // Render skill focus breakdown chart if data exists
                if (data.skillFocusBreakdown && data.skillFocusBreakdown.length > 0) {
                    renderSkillFocusChart(data.skillFocusBreakdown);
                }

                // Render subject comparison chart if data exists
                if (data.subjectComparison && data.subjectComparison.length > 0) {
                    renderSubjectComparisonChart(data.subjectComparison);
                }

                // Show charts section
                chartsSection.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    function displayAnalytics(analytics) {
        analyticsSection.style.display = 'block';

        // Show download button
        const downloadAnalyticsBtn = document.getElementById('downloadAnalyticsBtn');
        if (downloadAnalyticsBtn) {
            downloadAnalyticsBtn.style.display = 'inline-block';
        }

        document.getElementById('totalReports').textContent = analytics.totalReports;
        document.getElementById('avgAttention').textContent = analytics.averageRatings.attention;
        document.getElementById('avgRetention').textContent = analytics.averageRatings.retention;
        document.getElementById('avgComprehension').textContent = analytics.averageRatings.comprehension;
        document.getElementById('avgCooperation').textContent = analytics.averageRatings.cooperation;
        document.getElementById('avgEngagement').textContent = analytics.averageRatings.engagement;

        // Display stars
        document.getElementById('starsAttention').textContent = getStars(Math.round(analytics.averageRatings.attention));
        document.getElementById('starsRetention').textContent = getStars(Math.round(analytics.averageRatings.retention));
        document.getElementById('starsComprehension').textContent = getStars(Math.round(analytics.averageRatings.comprehension));
        document.getElementById('starsCooperation').textContent = getStars(Math.round(analytics.averageRatings.cooperation));
        document.getElementById('starsEngagement').textContent = getStars(Math.round(analytics.averageRatings.engagement));

        // Skill focus met percentage (gracefully handle null/missing data)
        const skillFocusMetEl = document.getElementById('skillFocusMet');
        if (skillFocusMetEl && analytics.skillFocusMet) {
            const total = analytics.skillFocusMet.yes + analytics.skillFocusMet.no;
            const percentage = total > 0 ? Math.round((analytics.skillFocusMet.yes / total) * 100) : 0;
            skillFocusMetEl.textContent = `${percentage}% (${analytics.skillFocusMet.yes}/${total})`;
        }

        // Subjects breakdown
        const subjectsBreakdown = document.getElementById('subjectsBreakdown');
        subjectsBreakdown.innerHTML = '';
        Object.entries(analytics.subjectsCount).forEach(([subject, count]) => {
            const item = document.createElement('div');
            item.className = 'breakdown-item';
            item.innerHTML = `<span>${subject}</span><span class="count">${count}</span>`;
            subjectsBreakdown.appendChild(item);
        });

        // Teachers breakdown
        const teachersBreakdown = document.getElementById('teachersBreakdown');
        teachersBreakdown.innerHTML = '';
        Object.entries(analytics.teachersCount).forEach(([teacher, count]) => {
            const item = document.createElement('div');
            item.className = 'breakdown-item';
            item.innerHTML = `<span>${extractFirstName(teacher)}</span><span class="count">${count}</span>`;
            teachersBreakdown.appendChild(item);
        });

        // Materials by Subject breakdown
        const materialsBySubject = document.getElementById('materialsBySubject');
        if (materialsBySubject && analytics.materialsBySubject) {
            materialsBySubject.innerHTML = '';
            Object.entries(analytics.materialsBySubject).forEach(([subject, materials]) => {
                const card = document.createElement('div');
                card.className = 'materials-card';
                // Ensure materials are strings (handle objects gracefully)
                const uniqueMaterials = [...new Set(materials)]
                    .map(m => typeof m === 'object' ? (m?.name || m?.title || JSON.stringify(m)) : m)
                    .filter(m => m && typeof m === 'string' && m !== 'N/A' && m !== '{}' && m.trim() !== '');
                card.innerHTML = `
                    <div class="materials-subject">${subject}</div>
                    <div class="materials-list">
                        ${uniqueMaterials.length > 0
                            ? uniqueMaterials.map(m => `<span class="material-item">📕 ${m}</span>`).join('')
                            : '<span class="no-materials">No textbooks recorded yet</span>'}
                    </div>
                `;
                materialsBySubject.appendChild(card);
            });
        }

        // Learning Progress by Subject
        const learningProgressBySubject = document.getElementById('learningProgressBySubject');
        if (learningProgressBySubject && analytics.lessonsBySubject) {
            learningProgressBySubject.innerHTML = '';
            Object.entries(analytics.lessonsBySubject).forEach(([subject, lessons]) => {
                if (lessons.length === 0) return;

                const card = document.createElement('div');
                card.className = 'learning-progress-card';
                card.innerHTML = `
                    <div class="progress-card-header">
                        <span class="progress-subject">${subject}</span>
                        <span class="progress-count">${lessons.length} lesson theme${lessons.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="progress-lessons">
                        ${lessons.map((lesson, index) => `
                            <div class="lesson-item">
                                <span class="lesson-number">${index + 1}</span>
                                <span class="lesson-text">${lesson}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                learningProgressBySubject.appendChild(card);
            });

            // Show message if no lesson themes recorded
            if (Object.keys(analytics.lessonsBySubject).length === 0 ||
                Object.values(analytics.lessonsBySubject).every(arr => arr.length === 0)) {
                learningProgressBySubject.innerHTML = '<p class="no-data">No lesson theme data recorded yet</p>';
            }
        }

        // Learning Timeline (show last 10 entries)
        const learningTimeline = document.getElementById('learningTimeline');
        const timelineSection = document.querySelector('.learning-timeline-section');
        if (learningTimeline && analytics.learningTimeline && analytics.learningTimeline.length > 0) {
            timelineSection.style.display = 'block';
            const recentLessons = analytics.learningTimeline.slice(-10).reverse();
            learningTimeline.innerHTML = recentLessons.map(item => `
                <div class="timeline-item ${item.sfMet ? 'sf-met' : ''}">
                    <div class="timeline-date">${item.date}</div>
                    <div class="timeline-content">
                        <span class="timeline-subject">${item.subject}</span>
                        <span class="timeline-lesson">${item.lesson}</span>
                        ${item.skillFocus ? `<span class="timeline-skill">Focus: ${item.skillFocus} ${item.sfMet ? '✓' : '✗'}</span>` : ''}
                    </div>
                </div>
            `).join('');
        } else if (timelineSection) {
            timelineSection.style.display = 'none';
        }

        // Textbook Performance Analysis
        const textbookPerformanceDiv = document.getElementById('textbookPerformance');
        if (textbookPerformanceDiv && analytics.textbookPerformance) {
            const textbooks = Object.entries(analytics.textbookPerformance);
            if (textbooks.length > 0) {
                textbookPerformanceDiv.innerHTML = textbooks.map(([name, data]) => {
                    // Determine effectiveness level
                    const ratingLevel = data.avgRating >= 4 ? 'excellent' : data.avgRating >= 3 ? 'good' : data.avgRating >= 2 ? 'developing' : 'needs-attention';
                    const scoreLevel = data.avgScorePercent !== null ? (data.avgScorePercent >= 80 ? 'excellent' : data.avgScorePercent >= 60 ? 'good' : data.avgScorePercent >= 40 ? 'developing' : 'needs-attention') : '';

                    return `
                        <div class="textbook-card ${ratingLevel}">
                            <div class="textbook-header">
                                <span class="textbook-name">📕 ${name}</span>
                                <span class="textbook-subject">${data.subject}</span>
                            </div>
                            <div class="textbook-stats">
                                <div class="stat-row">
                                    <span class="stat-label">Sessions:</span>
                                    <span class="stat-value">${data.sessions}</span>
                                </div>
                                <div class="stat-row">
                                    <span class="stat-label">Lesson Themes Covered:</span>
                                    <span class="stat-value">${data.lessonCount}</span>
                                </div>
                                <div class="stat-row">
                                    <span class="stat-label">Avg Participation:</span>
                                    <span class="stat-value rating-${ratingLevel}">${data.avgRating}/5 ${getEffectivenessEmoji(data.avgRating, 5)}</span>
                                </div>
                                ${data.avgScorePercent !== null ? `
                                <div class="stat-row">
                                    <span class="stat-label">Avg Score:</span>
                                    <span class="stat-value score-${scoreLevel}">${data.avgScorePercent}% ${getEffectivenessEmoji(data.avgScorePercent, 100)}</span>
                                </div>
                                ` : ''}
                                ${data.sfMetPercent !== null ? `
                                <div class="stat-row">
                                    <span class="stat-label">Skill Focus Met:</span>
                                    <span class="stat-value">${data.sfMetPercent}%</span>
                                </div>
                                ` : ''}
                            </div>
                            <div class="textbook-lessons">
                                <span class="lessons-label">Lesson Themes:</span>
                                <div class="lessons-list">${data.lessons.slice(0, 5).map(l => `<span class="lesson-tag">${l}</span>`).join('')}${data.lessons.length > 5 ? `<span class="more-lessons">+${data.lessons.length - 5} more</span>` : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                textbookPerformanceDiv.innerHTML = '<p class="no-data">No textbook performance data available yet. Ensure teachers fill in the Textbook/Materials field.</p>';
            }
        }

        // Lesson Performance Table
        const lessonPerformanceTable = document.getElementById('lessonPerformanceTable');
        if (lessonPerformanceTable && analytics.lessonPerformance && analytics.lessonPerformance.length > 0) {
            const recentLessons = analytics.lessonPerformance.slice(-20).reverse();
            lessonPerformanceTable.innerHTML = `
                <table class="lesson-perf-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Subject</th>
                            <th>Textbook</th>
                            <th>Lesson Theme</th>
                            <th>Participation</th>
                            <th>Score</th>
                            <th>Skill Focus</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentLessons.map(l => {
                            const ratingClass = l.avgRating >= 4 ? 'excellent' : l.avgRating >= 3 ? 'good' : l.avgRating >= 2 ? 'developing' : 'needs-attention';
                            const scoreClass = l.scorePercent !== null ? (l.scorePercent >= 80 ? 'excellent' : l.scorePercent >= 60 ? 'good' : l.scorePercent >= 40 ? 'developing' : 'needs-attention') : '';
                            return `
                                <tr>
                                    <td>${l.date}</td>
                                    <td><span class="subject-tag">${l.subject}</span></td>
                                    <td class="textbook-cell">${l.textbook}</td>
                                    <td class="lesson-cell">${l.lesson}</td>
                                    <td class="rating-cell ${ratingClass}">${l.avgRating}/5</td>
                                    <td class="score-cell ${scoreClass}">${l.scorePercent !== null ? l.scorePercent + '%' : '-'}</td>
                                    <td class="sf-cell ${l.sfMet ? 'met' : 'not-met'}">${l.skillFocus ? `${l.skillFocus} ${l.sfMet ? '✓' : '✗'}` : '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } else if (lessonPerformanceTable) {
            lessonPerformanceTable.innerHTML = '<p class="no-data">No lesson theme performance data available yet.</p>';
        }
    }

    // Helper function to get effectiveness emoji
    function getEffectivenessEmoji(value, max) {
        const percent = (value / max) * 100;
        if (percent >= 80) return '🌟';
        if (percent >= 60) return '👍';
        if (percent >= 40) return '📈';
        return '⚠️';
    }

    function displayReports(reports) {
        reportCount.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''} found`;

        // Show download button if there are reports
        const downloadReportsBtn = document.getElementById('downloadReportsBtn');
        if (downloadReportsBtn) {
            downloadReportsBtn.style.display = reports.length > 0 ? 'inline-block' : 'none';
        }

        if (reports.length === 0) {
            reportsList.innerHTML = '<div class="empty-state"><p>No reports found for the selected filters</p></div>';
            return;
        }

        reportsList.innerHTML = '';

        reports.forEach(report => {
            const reportCard = document.createElement('div');
            reportCard.className = 'report-card';

            // Get skills table (with subject and skill focus for difficulty ordering and status)
            const skillsTable = getSkillsTable(report.Skills, report['Skill Focus'], report.Subject);
            const scoresTable = getScoresTable(report.Scores);

            reportCard.innerHTML = `
                <div class="report-header-info">
                    <div class="report-date">
                        <span class="date-badge">${report.Date}</span>
                        <span class="day-badge">${report['Day of Week']}</span>
                    </div>
                    <div class="report-meta">
                        <span class="subject-badge">${report.Subject}</span>
                    </div>
                </div>

                <div class="report-body">
                    <div class="info-grid-compact">
                        ${report['Student ID'] && report['Student ID'] !== 'N/A' ? `
                        <div class="info-item">
                            <span class="label">Student ID:</span>
                            <span class="value id-badge">${report['Student ID']}</span>
                        </div>
                        ` : ''}
                        <div class="info-item">
                            <span class="label">Teacher:</span>
                            <span class="value">${extractFirstName(report['Teacher Name'])}${report['Is Substitute'] === 'YES' ? ' <span style="background-color: #fbbf24; color: #78350f; padding: 2px 5px; border-radius: 3px; font-size: 0.7em; font-weight: 600; margin-left: 3px;">(SUB)</span>' : ''}</span>
                        </div>
                        ${report['Teacher ID'] && report['Teacher ID'] !== 'N/A' ? `
                        <div class="info-item">
                            <span class="label">Teacher ID:</span>
                            <span class="value id-badge">${report['Teacher ID']}</span>
                        </div>
                        ` : ''}
                    </div>

                    <div class="learning-materials-section">
                        <h3>📚 Learning Materials & Progress</h3>
                        <div class="materials-content">
                            <div class="material-item primary">
                                <span class="material-icon">📕</span>
                                <div class="material-details">
                                    <span class="material-label">Textbook/Materials:</span>
                                    <span class="material-value">${report['Materials'] && report['Materials'].trim() ? report['Materials'] : 'N/A'}</span>
                                </div>
                            </div>
                            <div class="material-item">
                                <span class="material-icon">📖</span>
                                <div class="material-details">
                                    <span class="material-label">Current Lesson Theme:</span>
                                    <span class="material-value">${report['Current Lesson'] || 'N/A'}</span>
                                </div>
                            </div>
                            <div class="material-item">
                                <span class="material-icon">📋</span>
                                <div class="material-details">
                                    <span class="material-label">Homework Assigned:</span>
                                    <span class="material-value">${report['Homework'] || 'N/A'}</span>
                                </div>
                            </div>
                            ${report['Next Lesson'] && report['Next Lesson'].trim() && report['Next Lesson'] !== '-' ? `
                            <div class="material-item">
                                <span class="material-icon">➡️</span>
                                <div class="material-details">
                                    <span class="material-label">Next Lesson Theme:</span>
                                    <span class="material-value">${report['Next Lesson']}</span>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="ratings-section">
                        <h3>Online Class Participation</h3>
                        <div class="ratings-grid-compact">
                            <div class="rating-item">
                                <span class="rating-label">Attention</span>
                                <span class="rating-value">${report.Attention}/5</span>
                                <span class="rating-stars">${getStars(report.Attention)}</span>
                            </div>
                            <div class="rating-item">
                                <span class="rating-label">Retention</span>
                                <span class="rating-value">${report.Retention}/5</span>
                                <span class="rating-stars">${getStars(report.Retention)}</span>
                            </div>
                            <div class="rating-item">
                                <span class="rating-label">Comprehension</span>
                                <span class="rating-value">${report.Comprehension}/5</span>
                                <span class="rating-stars">${getStars(report.Comprehension)}</span>
                            </div>
                            <div class="rating-item">
                                <span class="rating-label">Cooperation</span>
                                <span class="rating-value">${report.Cooperation}/5</span>
                                <span class="rating-stars">${getStars(report.Cooperation)}</span>
                            </div>
                            <div class="rating-item">
                                <span class="rating-label">Engagement</span>
                                <span class="rating-value">${report.Engagement}/5</span>
                                <span class="rating-stars">${getStars(report.Engagement)}</span>
                            </div>
                            <div class="rating-item">
                                <span class="rating-label">Conversation</span>
                                <span class="rating-value">${report.Conversation}/5</span>
                                <span class="rating-stars">${getStars(report.Conversation)}</span>
                            </div>
                        </div>
                    </div>

                    ${skillsTable}
                    ${scoresTable}

                    <div class="narrative-section">
                        <h3>Written Report</h3>
                        <p class="narrative-text">${report.Narrative}</p>
                    </div>

                    <div class="activities-section">
                        <div class="activity-item">
                            <strong>Activities Finished:</strong> ${report['Activities Finished'] || 'N/A'}
                        </div>
                        <div class="activity-item">
                            <strong>Activities Not Finished:</strong> ${report['Activities Not Finished'] || 'N/A'}
                        </div>
                        <div class="activity-item">
                            <strong>Homework:</strong> ${report.Homework || 'N/A'}
                        </div>
                    </div>
                </div>
            `;

            reportsList.appendChild(reportCard);
        });
    }

    function getSkillsTable(skills, skillFocus, subject) {
        if (!skills || Object.keys(skills).length === 0) {
            return '';
        }

        // Define difficulty order per subject (easier/foundational first, harder/advanced at bottom)
        const skillDifficulty = {
            'EduSpace': ['Technology', 'Communication', 'Creativity', 'Inquiry', 'Analysis', 'Application'],
            'Comprehensive Writing': ['Idea Development', 'Structure', 'Clarity & Style', 'Argumentation', 'Revision', 'Publishing'],
            'TED Kids': ['Practice & Fun', 'Creativity', 'Teamwork', 'Storytelling', 'Delivery', 'Confidence'],
            'Reading': ['Phonics', 'Fluency', 'Vocabulary', 'Comprehension', 'Analysis', 'Critical Thinking'],
            'Math': ['Number Sense', 'Operations', 'Patterns', 'Geometry', 'Problem Solving', 'Reasoning'],
            'Science': ['Observation', 'Inquiry', 'Experimentation', 'Analysis', 'Application', 'Synthesis'],
            // Default order for subjects not listed (alphabetical by score - assessed first)
        };

        // Parse current focus areas from skillFocus field (e.g., "5-Speaking", "Grammar, Vocabulary")
        const focusAreas = skillFocus ? skillFocus.toLowerCase().split(/[,&]/).map(s => s.trim()) : [];

        // Sort skills by difficulty (easier first, harder at bottom)
        const subjectOrder = skillDifficulty[subject] || [];
        const sortedSkills = Object.entries(skills).sort((a, b) => {
            const skillNameA = a[0].toLowerCase().trim();
            const skillNameB = b[0].toLowerCase().trim();

            // Find index in difficulty order
            const indexA = subjectOrder.findIndex(s => s.toLowerCase().includes(skillNameA) || skillNameA.includes(s.toLowerCase()));
            const indexB = subjectOrder.findIndex(s => s.toLowerCase().includes(skillNameB) || skillNameB.includes(s.toLowerCase()));

            // If both found in order, sort by that
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            // If only one found, that one comes first
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;

            // Otherwise, put assessed skills (with scores) before NA skills
            const scoreA = a[1].score;
            const scoreB = b[1].score;
            if (scoreA !== 'NA' && scoreA !== '' && (scoreB === 'NA' || scoreB === '')) return -1;
            if (scoreB !== 'NA' && scoreB !== '' && (scoreA === 'NA' || scoreA === '')) return 1;

            return 0;
        });

        let html = `
            <div class="skills-section">
                <h3>Skills Assessment</h3>
                <p class="skills-note">📊 Arranged by difficulty: Foundational skills at top → Advanced skills at bottom</p>
                <table class="skills-table">
                    <thead>
                        <tr>
                            <th>Skill</th>
                            <th>Score</th>
                            <th>Weaknesses</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>`;

        sortedSkills.forEach(([skill, data]) => {
            const weaknesses = data.weaknesses && data.weaknesses.length > 0
                ? data.weaknesses.join(', ')
                : 'None';

            // Determine skill status for notes column
            let status = '';
            let statusClass = '';
            const skillLower = skill.toLowerCase().trim();

            // Check if this is a current focus area
            const isFocus = focusAreas.some(f => {
                const fClean = f.replace(/^\d+-/, '').trim(); // Remove number prefix like "5-Speaking" -> "Speaking"
                return skillLower.includes(fClean) || fClean.includes(skillLower);
            });

            if (data.score === 'NA' || data.score === '') {
                // Connected skill - cannot be assessed yet
                status = '🔗 Connected Skill (upcoming)';
                statusClass = 'status-connected';
            } else if (isFocus) {
                status = '🎯 Current Focus';
                statusClass = 'status-focus';
            } else if (data.weaknesses && data.weaknesses.length >= 2) {
                status = '⚠️ Struggling';
                statusClass = 'status-struggling';
            } else if (parseInt(data.score) >= 4) {
                status = '✅ Proficient';
                statusClass = 'status-proficient';
            } else if (parseInt(data.score) <= 2) {
                status = '🔄 In Progress';
                statusClass = 'status-progress';
            } else {
                status = '📈 Developing';
                statusClass = 'status-developing';
            }

            const scoreDisplay = (data.score === 'NA' || data.score === '') ? 'N/A' : `${data.score}/5`;

            html += `
                <tr class="${statusClass}">
                    <td>${skill.trim()}</td>
                    <td>${scoreDisplay}</td>
                    <td>${weaknesses}</td>
                    <td class="status-cell">${status}</td>
                </tr>`;
        });

        html += '</tbody></table></div>';
        return html;
    }

    function getScoresTable(scores) {
        if (!scores || Object.keys(scores).length === 0) {
            return '';
        }

        // Enhanced labels with test type specification
        const scoreConfig = {
            bookMaterials: {
                label: 'Book/Materials Assessment',
                type: 'Skill & Content-Building Test',
                typeClass: 'type-skill-test',
                icon: '📚'
            },
            vocabulary: {
                label: 'VOCAB Enhancement Test',
                type: 'Quiz',
                typeClass: 'type-quiz',
                icon: '📝'
            },
            classVideo: {
                label: 'Video Summary',
                type: 'Skill & Content-Building Test',
                typeClass: 'type-skill-test',
                icon: '🎬'
            },
            homework: {
                label: 'Homework Completion',
                type: 'Assignment',
                typeClass: 'type-assignment',
                icon: '📋'
            },
            homeworkVocab: {
                label: 'Homework: VOCAB Enhancement',
                type: 'Quiz',
                typeClass: 'type-quiz',
                icon: '📖'
            },
            weeklyTest: {
                label: 'Weekly Assessment',
                type: 'Skill & Content-Building Test',
                typeClass: 'type-skill-test',
                icon: '📊'
            }
        };

        let hasScores = false;
        let html = `
            <div class="scores-section">
                <h3>Scores</h3>
                <table class="scores-table">
                    <thead>
                        <tr>
                            <th>Assessment</th>
                            <th>Type</th>
                            <th>Score</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>`;

        Object.entries(scoreConfig).forEach(([key, config]) => {
            if (scores[key] && (scores[key].score !== '' || scores[key].total !== '')) {
                hasScores = true;
                const score = scores[key].score || '-';
                const total = scores[key].total || '-';
                let percentage = '';
                let percentClass = '';

                if (score !== '-' && total !== '-' && parseInt(total) > 0) {
                    const pct = Math.round((parseInt(score) / parseInt(total)) * 100);
                    percentage = pct + '%';
                    percentClass = pct >= 80 ? 'score-high' : pct >= 60 ? 'score-medium' : 'score-low';
                }

                html += `
                    <tr>
                        <td>${config.icon} ${config.label}</td>
                        <td><span class="test-type-badge ${config.typeClass}">${config.type}</span></td>
                        <td>${score}/${total}</td>
                        <td class="${percentClass}">${percentage}</td>
                    </tr>`;
            }
        });

        html += '</tbody></table></div>';
        return hasScores ? html : '';
    }

    function getStars(rating) {
        const num = parseInt(rating);
        if (isNaN(num) || num === 0) return '☆☆☆☆☆';
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += i <= num ? '★' : '☆';
        }
        return stars;
    }

    // AI Analysis Functions
    async function generateAiAnalysis() {
        if (!selectedStudent) {
            alert('Please select a student first');
            return;
        }

        // Build params with same filters as reports
        const params = new URLSearchParams({
            student: selectedStudent
        });

        if (startDateInput.value) params.append('startDate', startDateInput.value);
        if (endDateInput.value) params.append('endDate', endDateInput.value);
        if (teacherFilter.value) params.append('teacher', teacherFilter.value);
        if (subjectFilter.value) params.append('subject', subjectFilter.value);

        // Show filter description
        const filterInfo = document.getElementById('filterInfo');
        const filterDescription = document.getElementById('filterDescription');
        let filters = [];

        if (startDateInput.value || endDateInput.value) {
            const dateRange = `${startDateInput.value || 'earliest'} to ${endDateInput.value || 'latest'}`;
            filters.push(`Date range: ${dateRange}`);
        }
        if (teacherFilter.value) {
            filters.push(`Teacher: ${extractFirstName(teacherFilter.value)}`);
        }
        if (subjectFilter.value) {
            filters.push(`Subject: ${subjectFilter.value}`);
        }

        if (filters.length > 0) {
            filterDescription.textContent = filters.join(' • ');
            filterInfo.style.display = 'block';
        } else {
            filterDescription.textContent = 'All available reports for this student';
            filterInfo.style.display = 'block';
        }

        // Show loading state
        aiLoadingState.style.display = 'block';
        aiContent.style.display = 'none';

        try {
            const response = await fetch(`/api/ai-analysis?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                displayAiAnalysis(data);
            } else {
                throw new Error('Failed to generate AI analysis');
            }
        } catch (error) {
            console.error('Error:', error);
            aiLoadingState.innerHTML = '<p class="error-text">Failed to generate AI analysis. Please try again.</p>';
        }
    }

    function displayAiAnalysis(data) {
        // Hide loading, show content
        aiLoadingState.style.display = 'none';
        aiContent.style.display = 'block';

        // Show download button
        const downloadAiBtn = document.getElementById('downloadAiBtn');
        if (downloadAiBtn) {
            downloadAiBtn.style.display = 'inline-block';
        }

        // Display strengths with keyword highlighting
        const strengthsList = document.getElementById('strengthsList');
        strengthsList.innerHTML = '';
        data.strengths.forEach(strength => {
            const li = document.createElement('li');
            li.innerHTML = highlightKeywords(strength);
            strengthsList.appendChild(li);
        });

        // Display weakness patterns with keyword highlighting
        const weaknessesList = document.getElementById('weaknessesList');
        weaknessesList.innerHTML = '';
        data.weaknessPatterns.forEach(pattern => {
            const weaknessItem = document.createElement('div');
            weaknessItem.className = 'weakness-item';
            weaknessItem.innerHTML = `
                <div class="weakness-header">
                    <span class="weakness-name">${highlightKeywords(pattern.weakness)}</span>
                    <span class="weakness-count">${pattern.frequency}x</span>
                </div>
                <p class="weakness-context">${highlightKeywords(pattern.context)}</p>
            `;
            weaknessesList.appendChild(weaknessItem);
        });

        // Display recommendations with keyword highlighting
        const recommendationsList = document.getElementById('recommendationsList');
        recommendationsList.innerHTML = '';
        data.recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.innerHTML = highlightKeywords(rec);
            recommendationsList.appendChild(li);
        });

        // Display insights and trend with keyword highlighting
        document.getElementById('insightsText').innerHTML = highlightKeywords(data.insights);

        const trendBadge = document.getElementById('trendBadge');
        trendBadge.textContent = data.progressTrend.toUpperCase();
        trendBadge.className = 'trend-badge trend-' + data.progressTrend;

        // Render charts
        renderRadarChart(data.chartData.averageRatings);
        renderLineChart(data.chartData.ratingsOverTime);
        renderBarChart(data.chartData.weaknessFrequency);

        // Render scores chart if data exists
        if (data.chartData.scoresOverTime && data.chartData.scoresOverTime.length > 0) {
            renderScoresChart(data.chartData.scoresOverTime, data.chartData.scoresCategoryStats);
            displayScoresInsights(data.chartData.scoresCategoryStats);
        }

        // Generate lesson plan prompt
        generateLessonPrompt(data);
    }

    function highlightKeywords(text) {
        if (!text) return '';

        // Positive keywords
        const positiveWords = [
            'excellent', 'great', 'good', 'strong', 'improved', 'improving', 'better',
            'progress', 'consistent', 'focused', 'attentive', 'engaged', 'active',
            'participates', 'confident', 'mastered', 'understanding', 'enthusiasm',
            'well', 'success', 'outstanding', 'exceptional', 'proficient'
        ];

        // Negative keywords
        const negativeWords = [
            'poor', 'weak', 'struggling', 'difficulty', 'challenges', 'concerning',
            'declined', 'declining', 'worse', 'distracted', 'unfocused', 'inattentive',
            'disengaged', 'passive', 'reluctant', 'confused', 'incomplete', 'lacking',
            'needs improvement', 'below', 'inconsistent', 'absent', 'missed'
        ];

        // Neutral/important keywords
        const neutralWords = [
            'attention', 'retention', 'comprehension', 'cooperation', 'engagement',
            'conversation', 'homework', 'lesson', 'activities', 'skills'
        ];

        let highlighted = text;

        // Highlight positive words (green)
        positiveWords.forEach(word => {
            const regex = new RegExp(`\\b(${word})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="keyword-positive">$1</span>');
        });

        // Highlight negative words (red)
        negativeWords.forEach(word => {
            const regex = new RegExp(`\\b(${word})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="keyword-negative">$1</span>');
        });

        // Highlight neutral words (blue)
        neutralWords.forEach(word => {
            const regex = new RegExp(`\\b(${word})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="keyword-neutral">$1</span>');
        });

        return highlighted;
    }

    function generateLessonPrompt(data) {
        const lessonPromptCard = document.getElementById('lessonPromptCard');
        const promptText = document.getElementById('lessonPromptText');
        const copyBtn = document.getElementById('copyPromptBtn');

        if (!lessonPromptCard || !promptText) {
            return;
        }

        lessonPromptCard.style.display = 'block';

        // Build comprehensive prompt
        const skillWeaknesses = data.weaknessPatterns.slice(0, 5).map(w => `- ${w.weakness} (mentioned ${w.frequency}x): ${w.context}`).join('\n');
        const strengths = data.strengths.slice(0, 3).map(s => `- ${s}`).join('\n');
        const recommendations = data.recommendations.slice(0, 3).map(r => `- ${r}`).join('\n');

        // Build performance weaknesses section
        const avgRatings = data.chartData?.averageRatings || {};
        const performanceWeaknesses = [];

        if (avgRatings.attention && avgRatings.attention < 3) {
            performanceWeaknesses.push(`- Attention: ${avgRatings.attention}/5 - Student struggles to maintain focus during lessons`);
        }
        if (avgRatings.retention && avgRatings.retention < 3) {
            performanceWeaknesses.push(`- Retention: ${avgRatings.retention}/5 - Difficulty retaining information from previous lessons`);
        }
        if (avgRatings.comprehension && avgRatings.comprehension < 3) {
            performanceWeaknesses.push(`- Comprehension: ${avgRatings.comprehension}/5 - Challenges understanding new concepts`);
        }
        if (avgRatings.cooperation && avgRatings.cooperation < 3) {
            performanceWeaknesses.push(`- Cooperation: ${avgRatings.cooperation}/5 - Cooperation issues affecting learning`);
        }
        if (avgRatings.engagement && avgRatings.engagement < 3) {
            performanceWeaknesses.push(`- Engagement: ${avgRatings.engagement}/5 - Screen engagement needs improvement`);
        }
        if (avgRatings.conversation && avgRatings.conversation < 3) {
            performanceWeaknesses.push(`- Conversation: ${avgRatings.conversation}/5 - Limited conversational fluency`);
        }

        const performanceWeaknessesText = performanceWeaknesses.length > 0
            ? performanceWeaknesses.join('\n')
            : '- No significant performance weaknesses identified';

        // Get gender info for proper pronouns
        const studentGender = data.studentGender || 'Unknown';
        const genderPronoun = data.genderPronoun || 'they/them/their';

        const prompt = `Create a personalized lesson plan for an ESL student with the following profile:

STUDENT CONTEXT:
• Gender: ${studentGender} (use pronouns: ${genderPronoun})
• Current Performance Level: Based on ${data.chartData?.ratingsOverTime?.length || 0} recent observations
• Average Attention: ${data.chartData?.averageRatings?.attention || 'N/A'}/5
• Average Retention: ${data.chartData?.averageRatings?.retention || 'N/A'}/5
• Average Comprehension: ${data.chartData?.averageRatings?.comprehension || 'N/A'}/5
• Overall Trend: ${data.progressTrend}

IMPORTANT: When referring to this student in the lesson plan, use ${genderPronoun.split('/')[0]}/${genderPronoun.split('/')[1]} pronouns.

TOP STRENGTHS:
${strengths}

PERFORMANCE WEAKNESSES (Low Rating Categories):
${performanceWeaknessesText}

SPECIFIC SKILL WEAKNESSES (From Teacher Observations):
${skillWeaknesses}

CURRENT RECOMMENDATIONS FROM TEACHERS:
${recommendations}

LESSON PLAN REQUIREMENTS:
Please create a 45-60 minute lesson plan that:

1. OBJECTIVES: Define 2-3 specific, measurable learning objectives that directly address BOTH the performance weaknesses and specific skill weaknesses above

2. WARM-UP (5-10 min): Design an engaging activity that leverages the student's strengths to build confidence

3. MAIN ACTIVITIES (30-40 min):
   - Activity 1: Target the #1 skill weakness with a scaffolded, interactive exercise
   - Activity 2: Address performance weaknesses (e.g., attention, retention) while reinforcing 2-3 skill weaknesses simultaneously
   - Include differentiation strategies for when the student struggles or excels

4. ASSESSMENT (5 min): Create a quick formative assessment to measure progress on the objectives

5. HOMEWORK: Assign 15-20 minutes of practice that reinforces the lesson and can be monitored

6. TEACHER NOTES: Include specific tips for maintaining attention, checking comprehension, and providing feedback based on this student's profile

FORMAT: Provide the lesson plan in a clear, structured format with time allocations and all necessary materials listed.`;

        promptText.textContent = prompt;

        // Copy to clipboard functionality
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(prompt);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                copyBtn.style.background = '#28a745';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            } catch (err) {
                alert('Failed to copy. Please select and copy manually.');
            }
        };
    }

    function generateWordMap(narratives) {
        console.log('generateWordMap called with', narratives.length, 'narratives');

        const wordmapCard = document.getElementById('wordmapCard');
        const container = document.getElementById('wordmapContainer');

        if (!wordmapCard || !container) {
            console.error('Word map elements not found');
            return;
        }

        wordmapCard.style.display = 'block';

        // Clear previous visualization
        container.innerHTML = '';

        // Stop words
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
            'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
            'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
            'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
            'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'her', 'his'
        ]);

        // Sentiment classification
        const positiveWords = new Set(['excellent', 'great', 'good', 'strong', 'improved', 'improving', 'better', 'progress', 'consistent', 'focused', 'attentive', 'engaged', 'active', 'well', 'participates']);
        const negativeWords = new Set(['poor', 'weak', 'struggling', 'difficulty', 'challenges', 'concerning', 'declined', 'distracted', 'unfocused', 'inattentive', 'passive']);

        // Process narratives - extract words from each narrative
        const wordFreq = {};
        const coOccurrence = {}; // Track which words appear together

        narratives.forEach(narrative => {
            const words = narrative.toLowerCase().match(/\b[a-z]+\b/g) || [];
            const filteredWords = words.filter(w => w.length > 3 && !stopWords.has(w));

            // Count frequency
            filteredWords.forEach(word => {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            });

            // Track co-occurrence (words in same narrative)
            for (let i = 0; i < filteredWords.length; i++) {
                for (let j = i + 1; j < filteredWords.length; j++) {
                    const pair = [filteredWords[i], filteredWords[j]].sort().join('|');
                    coOccurrence[pair] = (coOccurrence[pair] || 0) + 1;
                }
            }
        });

        // Get top 30 words
        const topWords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([word, freq]) => ({
                id: word,
                freq,
                color: positiveWords.has(word) ? '#28a745' : negativeWords.has(word) ? '#dc3545' : '#667eea'
            }));

        if (topWords.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:100px 0;">No keywords found</p>';
            return;
        }

        // Create links between words that co-occur
        const wordSet = new Set(topWords.map(w => w.id));
        const links = [];

        Object.entries(coOccurrence).forEach(([pair, count]) => {
            const [source, target] = pair.split('|');
            if (wordSet.has(source) && wordSet.has(target) && count >= 2) {
                links.push({ source, target, value: count });
            }
        });

        // Create D3 force-directed graph
        const width = container.clientWidth;
        const height = 500;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const simulation = d3.forceSimulation(topWords)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.freq) * 5 + 10));

        // Draw links
        const link = svg.append('g')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('class', 'word-link')
            .attr('stroke-width', d => Math.sqrt(d.value));

        // Draw nodes
        const node = svg.append('g')
            .selectAll('g')
            .data(topWords)
            .enter().append('g')
            .attr('class', 'word-node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

        node.append('circle')
            .attr('r', d => Math.sqrt(d.freq) * 5 + 5)
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        node.append('text')
            .attr('class', 'word-label')
            .attr('text-anchor', 'middle')
            .attr('dy', '.35em')
            .text(d => d.id)
            .attr('font-size', d => Math.max(10, Math.sqrt(d.freq) * 3))
            .attr('fill', '#fff')
            .attr('font-weight', 'bold');

        // Update positions on simulation tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Drag functions
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        console.log('Word map generated with', topWords.length, 'nodes and', links.length, 'links');
    }

    function renderRadarChart(averageRatings) {
        const ctx = document.getElementById('radarChart').getContext('2d');

        if (radarChart) {
            radarChart.destroy();
        }

        radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Attention', 'Retention', 'Comprehension', 'Cooperation', 'Engagement', 'Conversation'],
                datasets: [{
                    label: 'Average Performance',
                    data: [
                        averageRatings.attention,
                        averageRatings.retention,
                        averageRatings.comprehension,
                        averageRatings.cooperation,
                        averageRatings.engagement,
                        averageRatings.conversation
                    ],
                    backgroundColor: 'rgba(5, 150, 105, 0.2)',
                    borderColor: 'rgba(5, 150, 105, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(5, 150, 105, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(5, 150, 105, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, /* Allow chart to fill container height */
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 5,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    function renderLineChart(ratingsOverTime) {
        const ctx = document.getElementById('lineChart').getContext('2d');

        if (lineChart) {
            lineChart.destroy();
        }

        const dates = ratingsOverTime.map(r => r.date);

        lineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Attention',
                        data: ratingsOverTime.map(r => r.attention),
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Retention',
                        data: ratingsOverTime.map(r => r.retention),
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Comprehension',
                        data: ratingsOverTime.map(r => r.comprehension),
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Cooperation',
                        data: ratingsOverTime.map(r => r.behavior),
                        borderColor: 'rgba(153, 102, 255, 1)',
                        backgroundColor: 'rgba(153, 102, 255, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Engagement',
                        data: ratingsOverTime.map(r => r.handwriting),
                        borderColor: 'rgba(255, 159, 64, 1)',
                        backgroundColor: 'rgba(255, 159, 64, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Conversation',
                        data: ratingsOverTime.map(r => r.conversation),
                        borderColor: 'rgba(255, 205, 86, 1)',
                        backgroundColor: 'rgba(255, 205, 86, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, /* Allow chart to fill container height */
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    }

    function renderBarChart(weaknessFrequency) {
        // Destroy old chart if exists
        if (barChart) {
            barChart.destroy();
            barChart = null;
        }

        const canvas = document.getElementById('barChart');
        const container = canvas.parentElement;
        canvas.style.display = 'none';

        // Remove any existing custom chart
        const existingCustomChart = container.querySelector('.custom-weakness-chart');
        if (existingCustomChart) {
            existingCustomChart.remove();
        }

        const customChart = document.createElement('div');
        customChart.className = 'custom-weakness-chart weakness-grouped';

        if (!weaknessFrequency || weaknessFrequency.length === 0) {
            customChart.innerHTML = '<div class="weakness-empty">No weakness data available</div>';
            container.appendChild(customChart);
            return;
        }

        // Group by priority sections
        const needsAttention = weaknessFrequency.filter(w => w.trend === 'worsening' || (w.trend === 'stable' && w.count >= 3));
        const improving = weaknessFrequency.filter(w => w.trend === 'improving');
        const monitor = weaknessFrequency.filter(w => w.trend === 'stable' && w.count < 3);

        // Calculate max count for progress bar scaling
        const maxCount = Math.max(...weaknessFrequency.map(w => Math.max(w.earlyCount, w.recentCount, 1)));

        let html = '';

        // Focus Areas section (was "Needs Attention")
        if (needsAttention.length > 0) {
            html += `
                <div class="weakness-section attention">
                    <div class="weakness-section-header">
                        <span class="section-icon">🚨</span>
                        <span class="section-title">Focus Areas</span>
                        <span class="section-count">${needsAttention.length}</span>
                    </div>
                    <div class="weakness-cards">
            `;
            needsAttention.forEach(item => {
                html += renderWeaknessCard(item, maxCount, 'attention');
            });
            html += '</div></div>';
        }

        // Getting Better section (was "Improving")
        if (improving.length > 0) {
            html += `
                <div class="weakness-section improving">
                    <div class="weakness-section-header">
                        <span class="section-icon">✅</span>
                        <span class="section-title">Getting Better</span>
                        <span class="section-count">${improving.length}</span>
                    </div>
                    <div class="weakness-cards">
            `;
            improving.forEach(item => {
                html += renderWeaknessCard(item, maxCount, 'improving');
            });
            html += '</div></div>';
        }

        // Keep an Eye On section (was "Monitor")
        if (monitor.length > 0) {
            html += `
                <div class="weakness-section monitor">
                    <div class="weakness-section-header">
                        <span class="section-icon">👁️</span>
                        <span class="section-title">Keep an Eye On</span>
                        <span class="section-count">${monitor.length}</span>
                    </div>
                    <div class="weakness-cards">
            `;
            monitor.forEach(item => {
                html += renderWeaknessCard(item, maxCount, 'monitor');
            });
            html += '</div></div>';
        }

        customChart.innerHTML = html;
        container.appendChild(customChart);

        // Helper: Get plain language trend description
        function getTrendDescription(item) {
            if (item.trend === 'worsening') {
                return 'Appearing MORE often in recent lessons';
            } else if (item.trend === 'improving') {
                return 'Appearing LESS often recently';
            } else if (item.earlyCount === item.recentCount && item.count >= 3) {
                return 'Consistent issue throughout';
            } else {
                return 'Minor issue, not frequent';
            }
        }

        // Helper: Get trend icon and label
        function getTrendBadge(item) {
            if (item.trend === 'worsening') {
                return '<span class="weakness-trend-badge trend-worse">🔺 Worse</span>';
            } else if (item.trend === 'improving') {
                return '<span class="weakness-trend-badge trend-better">🔻 Better</span>';
            } else {
                return '<span class="weakness-trend-badge trend-same">➖ Same</span>';
            }
        }

        // Helper: Render progress bar
        function renderProgressBar(count, maxCount, label, sectionType) {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return `
                <div class="weakness-progress-row">
                    <span class="progress-label">${label} (${count}x)</span>
                    <div class="weakness-progress-bar">
                        <div class="weakness-progress-fill ${sectionType}" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        }

        // Main card renderer
        function renderWeaknessCard(item, maxCount, sectionType) {
            const showProgressBars = item.earlyCount > 0 || item.recentCount > 0;

            return `
                <div class="weakness-card">
                    <div class="weakness-card-header">
                        <span class="weakness-card-name">${item.weakness}</span>
                        ${getTrendBadge(item)}
                    </div>
                    <div class="weakness-card-body">
                        <div class="weakness-mention-count">Mentioned ${item.count} time${item.count !== 1 ? 's' : ''}</div>
                        <div class="weakness-description">${getTrendDescription(item)}</div>
                        ${showProgressBars ? `
                            <div class="weakness-progress-container">
                                ${renderProgressBar(item.earlyCount, maxCount, 'Earlier', sectionType)}
                                ${renderProgressBar(item.recentCount, maxCount, 'Recently', sectionType)}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }

    function renderScoresChart(scoresOverTime, categoryStats) {
        const ctx = document.getElementById('scoresChart').getContext('2d');

        if (scoresChart) {
            scoresChart.destroy();
        }

        // Show the chart card
        document.getElementById('scoresChartCard').style.display = 'block';

        const dates = scoresOverTime.map(s => s.date);
        const scoreLabels = {
            bookMaterials: 'Book/Materials',
            vocabulary: 'Vocabulary',
            classVideo: 'Class Video',
            homework: 'Homework',
            homeworkVocab: 'Homework Vocab',
            weeklyTest: 'Weekly Test'
        };

        // Create datasets only for categories that have data
        const datasets = [];
        const colors = [
            { border: 'rgba(255, 99, 132, 1)', bg: 'rgba(255, 99, 132, 0.1)' },
            { border: 'rgba(54, 162, 235, 1)', bg: 'rgba(54, 162, 235, 0.1)' },
            { border: 'rgba(75, 192, 192, 1)', bg: 'rgba(75, 192, 192, 0.1)' },
            { border: 'rgba(153, 102, 255, 1)', bg: 'rgba(153, 102, 255, 0.1)' },
            { border: 'rgba(255, 159, 64, 1)', bg: 'rgba(255, 159, 64, 0.1)' },
            { border: 'rgba(255, 205, 86, 1)', bg: 'rgba(255, 205, 86, 0.1)' }
        ];

        let colorIndex = 0;
        Object.entries(scoreLabels).forEach(([key, label]) => {
            if (categoryStats[key]) {
                datasets.push({
                    label: label,
                    data: scoresOverTime.map(s => s[key] || null),
                    borderColor: colors[colorIndex].border,
                    backgroundColor: colors[colorIndex].bg,
                    tension: 0.4,
                    spanGaps: true  // Connect points even if there are gaps
                });
                colorIndex++;
            }
        });

        scoresChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, /* Allow chart to fill container height */
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        title: {
                            display: true,
                            text: 'Score Percentage'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(1) + '%';
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderSkillFocusChart(skillFocusBreakdown) {
        const container = document.getElementById('skillFocusGroupedContainer');

        // Show the chart card
        document.getElementById('skillFocusChartCard').style.display = 'block';

        // Sort all topics by percentage (descending)
        const sortedTopics = [...skillFocusBreakdown].sort((a, b) => b.percentage - a.percentage);

        let html = '';

        if (sortedTopics.length === 0) {
            html = '<div class="skill-focus-empty">No skill focus data available</div>';
        } else {
            html = '<div class="skill-focus-cards">';

            sortedTopics.forEach(item => {
                html += renderSkillFocusCard(item);
            });

            html += '</div>';
        }

        container.innerHTML = html;

        // Helper: Get status badge based on percentage
        function getStatusBadge(percentage) {
            if (percentage >= 70) {
                return '<span class="skill-focus-status-badge status-strong">✅ Strong</span>';
            } else if (percentage >= 50) {
                return '<span class="skill-focus-status-badge status-developing">⚠️ Developing</span>';
            } else {
                return '<span class="skill-focus-status-badge status-needs-work">❌ Needs Work</span>';
            }
        }

        // Helper: Get plain language description
        function getStatusDescription(item) {
            if (item.percentage >= 70) {
                return 'Student consistently achieves this skill';
            } else if (item.percentage >= 50) {
                return 'Student sometimes achieves this skill';
            } else {
                return 'Student struggles with this skill';
            }
        }

        // Helper: Get progress bar class
        function getProgressClass(percentage) {
            if (percentage >= 70) return 'progress-strong';
            if (percentage >= 50) return 'progress-developing';
            return 'progress-needs-work';
        }

        // Main card renderer
        function renderSkillFocusCard(item) {
            const subject = item.subject || '';

            return `
                <div class="skill-focus-card">
                    <div class="skill-focus-card-header">
                        <span class="skill-focus-card-name">${item.topic}</span>
                        <div class="skill-focus-card-meta">
                            ${subject ? `<span class="skill-focus-subject-badge">${subject}</span>` : ''}
                            ${getStatusBadge(item.percentage)}
                        </div>
                    </div>
                    <div class="skill-focus-card-body">
                        <div class="skill-focus-achievement">
                            Achieved <strong>${item.met}</strong> out of <strong>${item.total}</strong> sessions (${item.percentage}%)
                        </div>
                        <div class="skill-focus-status-text">${getStatusDescription(item)}</div>
                        <div class="skill-focus-progress-container">
                            <div class="skill-focus-progress-bar">
                                <div class="skill-focus-progress-fill ${getProgressClass(item.percentage)}" style="width: ${item.percentage}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    function renderSubjectComparisonChart(subjectComparison) {
        const ctx = document.getElementById('subjectChart').getContext('2d');

        if (subjectChart) {
            subjectChart.destroy();
        }

        // Show the chart card
        document.getElementById('subjectChartCard').style.display = 'block';

        const subjects = subjectComparison.map(s => s.subject);
        const averages = subjectComparison.map(s => s.averageRating);

        subjectChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: subjects,
                datasets: [{
                    label: 'Average Rating',
                    data: averages,
                    backgroundColor: 'rgba(5, 150, 105, 0.6)',
                    borderColor: 'rgba(5, 150, 105, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false, /* Allow chart to fill container height */
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 5,
                        ticks: {
                            stepSize: 0.5
                        },
                        title: {
                            display: true,
                            text: 'Average Rating (out of 5)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const dataPoint = subjectComparison[context.dataIndex];
                                return `${dataPoint.averageRating.toFixed(2)}/5 (${dataPoint.reportCount} reports)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function displayScoresInsights(categoryStats) {
        const scoresInsightsCard = document.getElementById('scoresInsightsCard');
        const scoresInsightsList = document.getElementById('scoresInsightsList');

        scoresInsightsCard.style.display = 'block';
        scoresInsightsList.innerHTML = '';

        // Sort by average percentage
        const sortedStats = Object.entries(categoryStats).sort((a, b) => {
            const avgA = a[1].totalPercentage / a[1].count;
            const avgB = b[1].totalPercentage / b[1].count;
            return avgB - avgA;
        });

        sortedStats.forEach(([key, stats]) => {
            const avgPercentage = (stats.totalPercentage / stats.count).toFixed(1);
            const item = document.createElement('div');
            item.className = 'score-insight-item';

            let performanceClass = 'low';
            if (avgPercentage >= 80) performanceClass = 'high';
            else if (avgPercentage >= 60) performanceClass = 'medium';

            item.innerHTML = `
                <div class="score-insight-header">
                    <span class="score-label">${stats.label}</span>
                    <span class="score-percentage ${performanceClass}">${avgPercentage}%</span>
                </div>
                <div class="score-insight-meta">
                    Appeared in ${stats.count} report${stats.count > 1 ? 's' : ''}
                </div>
            `;
            scoresInsightsList.appendChild(item);
        });
    }

    // Download Performance Analytics as PNG
    async function downloadPerformanceAnalytics() {
        const chartsSection = document.getElementById('chartsSection');
        if (!chartsSection || chartsSection.style.display === 'none') {
            alert('No performance analytics to download');
            return;
        }

        try {
            // Get student name and date range
            const studentName = selectedStudent || 'Student';
            const dateRange = getDateRangeText();

            // Create a wrapper with header for download
            const wrapper = document.createElement('div');
            wrapper.style.padding = '30px';
            wrapper.style.backgroundColor = '#fff';
            wrapper.style.width = '1400px';

            // Add header
            const header = document.createElement('div');
            header.style.marginBottom = '30px';
            header.style.textAlign = 'center';
            header.innerHTML = `
                <h1 style="color: #333; margin-bottom: 10px; font-family: Arial, sans-serif;">📊 Performance Analytics Report</h1>
                <h2 style="color: #667eea; margin-bottom: 5px; font-family: Arial, sans-serif;">${studentName}</h2>
                <p style="color: #666; font-size: 16px; font-family: Arial, sans-serif;">${dateRange}</p>
                <p style="color: #999; font-size: 14px; margin-top: 10px; font-family: Arial, sans-serif;">Generated on ${new Date().toLocaleDateString()}</p>
            `;
            wrapper.appendChild(header);

            // Clone the charts section
            const clonedCharts = chartsSection.cloneNode(true);
            clonedCharts.style.display = 'block';

            // Remove the download button from clone
            const cloneDownloadBtn = clonedCharts.querySelector('#downloadChartsBtn');
            if (cloneDownloadBtn) {
                cloneDownloadBtn.remove();
            }

            // Convert all canvas charts to images before capturing
            const canvases = clonedCharts.querySelectorAll('canvas');
            const originalCanvases = chartsSection.querySelectorAll('canvas');

            canvases.forEach((canvas, index) => {
                if (originalCanvases[index]) {
                    // Create an image from the original canvas
                    const img = document.createElement('img');
                    img.src = originalCanvases[index].toDataURL('image/png');
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    // Replace canvas with image
                    canvas.parentNode.replaceChild(img, canvas);
                }
            });

            wrapper.appendChild(clonedCharts);

            // Temporarily add to body (off-screen)
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            document.body.appendChild(wrapper);

            // Wait a bit for images to load
            await new Promise(resolve => setTimeout(resolve, 300));

            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff',
                allowTaint: true
            });

            // Remove wrapper
            document.body.removeChild(wrapper);

            // Convert canvas to blob and download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const filename = `Performance_Analytics_${studentName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
                link.download = filename;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });

        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        }
    }

    // Download AI Analysis as PNG
    async function downloadAiAnalysis() {
        const aiContent = document.getElementById('aiContent');
        if (!aiContent || aiContent.style.display === 'none') {
            alert('No AI analysis to download. Please generate AI analysis first.');
            return;
        }

        try {
            // Get student name and date range
            const studentName = selectedStudent || 'Student';
            const dateRange = getDateRangeText();

            // Create a wrapper with header for download
            const wrapper = document.createElement('div');
            wrapper.style.padding = '30px';
            wrapper.style.backgroundColor = '#fff';
            wrapper.style.width = '1400px';

            // Add header
            const header = document.createElement('div');
            header.style.marginBottom = '30px';
            header.style.textAlign = 'center';
            header.innerHTML = `
                <h1 style="color: #333; margin-bottom: 10px; font-family: Arial, sans-serif;">🤖 AI-Powered Analysis Report</h1>
                <h2 style="color: #667eea; margin-bottom: 5px; font-family: Arial, sans-serif;">${studentName}</h2>
                <p style="color: #666; font-size: 16px; font-family: Arial, sans-serif;">${dateRange}</p>
                <p style="color: #999; font-size: 14px; margin-top: 10px; font-family: Arial, sans-serif;">Generated on ${new Date().toLocaleDateString()}</p>
            `;
            wrapper.appendChild(header);

            // Clone the AI content
            const clonedAiContent = aiContent.cloneNode(true);
            clonedAiContent.style.display = 'block';

            // Remove the download button from clone
            const cloneDownloadBtn = clonedAiContent.querySelector('#downloadAiBtn');
            if (cloneDownloadBtn) {
                cloneDownloadBtn.remove();
            }

            wrapper.appendChild(clonedAiContent);

            // Temporarily add to body (off-screen)
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            document.body.appendChild(wrapper);

            // Wait a bit for content to render
            await new Promise(resolve => setTimeout(resolve, 500));

            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff',
                allowTaint: true,
                foreignObjectRendering: false
            });

            // Remove wrapper
            document.body.removeChild(wrapper);

            // Convert canvas to blob and download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const filename = `AI_Analysis_${studentName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
                link.download = filename;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });

        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        }
    }

    // Download Framework Analysis as PNG
    async function downloadFrameworkAnalysis() {
        const frameworkContent = document.getElementById('frameworkContent');
        if (!frameworkContent || frameworkContent.style.display === 'none') {
            alert('No framework analysis to download. Please generate framework analysis first.');
            return;
        }

        try {
            // Get student name and date range
            const studentName = selectedStudent || 'Student';
            const dateRange = getDateRangeText();

            // Create a wrapper with header for download
            const wrapper = document.createElement('div');
            wrapper.style.padding = '30px';
            wrapper.style.backgroundColor = '#fff';
            wrapper.style.width = '1400px';

            // Add header
            const header = document.createElement('div');
            header.innerHTML = `
                <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4A90E2;">
                    <h1 style="margin: 0; color: #2c3e50; font-size: 32px;">🎓 Academic Development Framework</h1>
                    <h2 style="margin: 10px 0 0 0; color: #34495e; font-size: 24px;">${studentName}</h2>
                    <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 16px;">${dateRange}</p>
                    <p style="margin: 5px 0 0 0; color: #95a5a6; font-size: 14px;">Generated ${new Date().toLocaleDateString()}</p>
                </div>
            `;
            wrapper.appendChild(header);

            // Clone the framework content
            const clone = frameworkContent.cloneNode(true);
            clone.style.display = 'block';
            clone.style.visibility = 'visible';
            wrapper.appendChild(clone);

            // Temporarily add to body (hidden)
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            wrapper.style.top = '0';
            document.body.appendChild(wrapper);

            // Wait a bit for content to render
            await new Promise(resolve => setTimeout(resolve, 500));

            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff',
                allowTaint: true,
                foreignObjectRendering: false
            });

            // Remove wrapper
            document.body.removeChild(wrapper);

            // Convert canvas to blob and download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const filename = `Framework_Analysis_${studentName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
                link.download = filename;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });

        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        }
    }

    // Download Student Analytics as PNG
    async function downloadStudentAnalytics() {
        const analyticsSection = document.getElementById('analyticsSection');
        if (!analyticsSection || analyticsSection.style.display === 'none') {
            alert('No student analytics to download');
            return;
        }

        try {
            // Get student name and date range
            const studentName = selectedStudent || 'Student';
            const dateRange = getDateRangeText();

            // Create a wrapper with header for download
            const wrapper = document.createElement('div');
            wrapper.style.padding = '30px';
            wrapper.style.backgroundColor = '#fff';
            wrapper.style.width = '1400px';

            // Add header
            const header = document.createElement('div');
            header.style.marginBottom = '30px';
            header.style.textAlign = 'center';
            header.innerHTML = `
                <h1 style="color: #333; margin-bottom: 10px; font-family: Arial, sans-serif;">📈 Student Analytics Report</h1>
                <h2 style="color: #667eea; margin-bottom: 5px; font-family: Arial, sans-serif;">${studentName}</h2>
                <p style="color: #666; font-size: 16px; font-family: Arial, sans-serif;">${dateRange}</p>
                <p style="color: #999; font-size: 14px; margin-top: 10px; font-family: Arial, sans-serif;">Generated on ${new Date().toLocaleDateString()}</p>
            `;
            wrapper.appendChild(header);

            // Clone the analytics section
            const clonedAnalytics = analyticsSection.cloneNode(true);
            clonedAnalytics.style.display = 'block';

            // Remove the download button from clone
            const cloneDownloadBtn = clonedAnalytics.querySelector('#downloadAnalyticsBtn');
            if (cloneDownloadBtn) {
                cloneDownloadBtn.remove();
            }

            wrapper.appendChild(clonedAnalytics);

            // Temporarily add to body (off-screen)
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            document.body.appendChild(wrapper);

            // Wait a bit for content to render
            await new Promise(resolve => setTimeout(resolve, 300));

            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff',
                allowTaint: true
            });

            // Remove wrapper
            document.body.removeChild(wrapper);

            // Convert canvas to blob and download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const filename = `Student_Analytics_${studentName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
                link.download = filename;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });

        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        }
    }

    // Helper function to get date range text
    function getDateRangeText() {
        const startDate = startDateInput.value || 'earliest';
        const endDate = endDateInput.value || 'latest';
        return `Date Range: ${startDate} to ${endDate}`;
    }

    // Download all reports as PDF
    async function downloadAllReports() {
        try {
            // Get all report cards
            const reportCards = reportsList.querySelectorAll('.report-card');
            if (reportCards.length === 0) {
                alert('No reports to download');
                return;
            }

            // Get student name and date range
            const studentName = selectedStudent || 'Student';
            const dateRange = getDateRangeText();

            // Initialize jsPDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const contentWidth = pageWidth - (2 * margin);

            let isFirstPage = true;

            // Process each report card
            for (let i = 0; i < reportCards.length; i++) {
                const reportCard = reportCards[i];

                // Add new page for each report (except first)
                if (!isFirstPage) {
                    pdf.addPage();
                } else {
                    isFirstPage = false;
                }

                // Create a wrapper for the report with header
                const wrapper = document.createElement('div');
                wrapper.style.padding = '15px';
                wrapper.style.backgroundColor = '#fff';
                wrapper.style.width = '750px';
                wrapper.style.fontFamily = 'Arial, sans-serif';

                // Add header as HTML
                const header = document.createElement('div');
                header.style.marginBottom = '15px';
                header.style.paddingBottom = '10px';
                header.style.borderBottom = '2px solid #667eea';
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                header.innerHTML = `
                    <div style="font-size: 11px; color: #333;">
                        <div style="font-weight: bold; margin-bottom: 3px;">${studentName}</div>
                        <div style="font-size: 9px; color: #666;">${dateRange}</div>
                    </div>
                    <div style="font-size: 9px; color: #666;">
                        Page ${i + 1} of ${reportCards.length}
                    </div>
                `;
                wrapper.appendChild(header);

                // Clone the report
                const clonedReport = reportCard.cloneNode(true);
                wrapper.appendChild(clonedReport);

                // Temporarily add to body (off-screen)
                wrapper.style.position = 'absolute';
                wrapper.style.left = '-9999px';
                document.body.appendChild(wrapper);

                // Wait a bit for content to render
                await new Promise(resolve => setTimeout(resolve, 300));

                // Capture with html2canvas
                const canvas = await html2canvas(wrapper, {
                    scale: 1.5,
                    logging: false,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    allowTaint: true
                });

                // Remove wrapper
                document.body.removeChild(wrapper);

                // Convert canvas to image
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = contentWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                // Calculate if image needs to be scaled down to fit page
                const maxHeight = pageHeight - (2 * margin);
                let finalWidth = imgWidth;
                let finalHeight = imgHeight;

                if (finalHeight > maxHeight) {
                    finalHeight = maxHeight;
                    finalWidth = (canvas.width * finalHeight) / canvas.height;
                }

                // Center the image horizontally
                const xPosition = (pageWidth - finalWidth) / 2;

                // Add image to PDF
                pdf.addImage(imgData, 'PNG', xPosition, margin, finalWidth, finalHeight);

                // Add a small delay between reports
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            // Download the PDF
            const filename = `All_Reports_${studentName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        }
    }

    // ========================================
    // Academic Development Framework
    // ========================================

    function calculateAcademicFramework(reports) {
        if (!reports || reports.length === 0) {
            return null;
        }

        // Calculate average ratings
        let totalAttention = 0, totalRetention = 0, totalComprehension = 0;
        let totalCooperation = 0, totalEngagement = 0, totalConversation = 0;
        let skillFocusMetCount = 0;
        let skillFocusTotalCount = 0;
        let totalScorePercentage = 0;
        let scoreCount = 0;

        reports.forEach(report => {
            totalAttention += parseFloat(report.Attention) || 0;
            totalRetention += parseFloat(report.Retention) || 0;
            totalComprehension += parseFloat(report.Comprehension) || 0;
            totalCooperation += parseFloat(report.Cooperation) || 0;
            totalEngagement += parseFloat(report.Engagement) || 0;
            totalConversation += parseFloat(report.Conversation) || 0;

            // Parse SF Met (handles both old YES/NO and new JSON format)
            const sfMetParsed = parseSfMet(report['SF Met'], report['Skill Focus']);
            skillFocusMetCount += sfMetParsed.metCount;
            skillFocusTotalCount += sfMetParsed.totalCount || 1;

            // Calculate score percentages
            if (report.Scores) {
                const scores = report.Scores;
                Object.values(scores).forEach(scoreData => {
                    if (scoreData && scoreData.score && scoreData.total) {
                        const score = parseFloat(scoreData.score);
                        const total = parseFloat(scoreData.total);
                        if (!isNaN(score) && !isNaN(total) && total > 0) {
                            totalScorePercentage += (score / total) * 100;
                            scoreCount++;
                        }
                    }
                });
            }
        });

        const count = reports.length;
        const avgAttention = totalAttention / count;
        const avgRetention = totalRetention / count;
        const avgComprehension = totalComprehension / count;
        const avgCooperation = totalCooperation / count;
        const avgEngagement = totalEngagement / count;
        const avgConversation = totalConversation / count;
        const avgSkillFocusMet = skillFocusTotalCount > 0 ? (skillFocusMetCount / skillFocusTotalCount) * 100 : 0;
        const avgScore = scoreCount > 0 ? totalScorePercentage / scoreCount : 0;

        // Calculate framework scores (0-100)
        // Balancing (Weaving): Input (Attention) + Output (Retention)
        const balancing = ((avgAttention + avgRetention) / 10) * 100;

        // Nurturing: Logic (Comprehension + Conversation)
        const nurturing = ((avgComprehension + avgConversation) / 10) * 100;

        // Polishing: Quality (Engagement + Scores + SF Met)
        const polishing = ((avgEngagement / 5) * 100 * 0.4) + (avgScore * 0.4) + (avgSkillFocusMet * 0.2);

        // Higher-minds: Metacognition (Cooperation - higher cooperation = better metacognition)
        const higherminds = (avgCooperation / 5) * 100;

        // Calculate overall performance (average of all 6 ratings)
        const overallPerformance = (avgAttention + avgRetention + avgComprehension + avgCooperation + avgEngagement + avgConversation) / 6;

        return {
            balancing: Math.round(balancing),
            nurturing: Math.round(nurturing),
            polishing: Math.round(polishing),
            higherminds: Math.round(higherminds),
            overallPerformance: overallPerformance.toFixed(1),
            // Include raw data for academic performance calculation
            avgScore: avgScore,
            avgSkillFocusMet: avgSkillFocusMet
        };
    }

    // ========================================
    // ACADEMIC PERFORMANCE LEVEL CALCULATION
    // Uses actual academic indicators, not just participation
    // ========================================

    // Grade-level benchmarks for WPM (Words Per Minute)
    const WPM_BENCHMARKS = {
        1: { min: 30, expected: 60, advanced: 80 },
        2: { min: 50, expected: 90, advanced: 110 },
        3: { min: 70, expected: 110, advanced: 130 },
        4: { min: 90, expected: 130, advanced: 150 },
        5: { min: 110, expected: 150, advanced: 170 },
        6: { min: 130, expected: 165, advanced: 185 },
        7: { min: 145, expected: 175, advanced: 195 },
        8: { min: 155, expected: 185, advanced: 205 },
        9: { min: 165, expected: 195, advanced: 215 },
        10: { min: 175, expected: 205, advanced: 225 },
        11: { min: 180, expected: 210, advanced: 230 },
        12: { min: 185, expected: 215, advanced: 235 }
    };

    // Parse reading level to a numeric grade equivalent
    function parseReadingLevel(readingLevel) {
        if (!readingLevel || readingLevel === 'TBD' || readingLevel === 'N/A') {
            return null;
        }

        const levelStr = String(readingLevel).toLowerCase().trim();

        // Handle formats like "Grade 3", "3rd grade", "Level 3", "3", etc.
        const gradeMatch = levelStr.match(/(?:grade|level|gr\.?)?\s*(\d+)/i);
        if (gradeMatch) {
            return parseInt(gradeMatch[1]);
        }

        // Handle ordinal formats: "3rd", "5th"
        const ordinalMatch = levelStr.match(/(\d+)(?:st|nd|rd|th)/i);
        if (ordinalMatch) {
            return parseInt(ordinalMatch[1]);
        }

        // Handle letter levels (A-Z mapped to grades)
        const letterMap = { 'a': 0, 'b': 1, 'c': 1, 'd': 2, 'e': 2, 'f': 3, 'g': 3, 'h': 3, 'i': 4, 'j': 4, 'k': 4, 'l': 5, 'm': 5, 'n': 5, 'o': 6, 'p': 6, 'q': 7, 'r': 7, 's': 8, 't': 8, 'u': 9, 'v': 9, 'w': 10, 'x': 10, 'y': 11, 'z': 12 };
        if (letterMap.hasOwnProperty(levelStr)) {
            return letterMap[levelStr];
        }

        return null;
    }

    // Calculate academic performance level based on REAL academic indicators
    function calculateAcademicPerformanceLevel(reports, actualGrade) {
        if (!reports || reports.length === 0 || !actualGrade) {
            return null;
        }

        const actualGradeNum = normalizeGradeToNumber(actualGrade) || 5;
        const wpmBenchmark = WPM_BENCHMARKS[actualGradeNum] || WPM_BENCHMARKS[5];

        // Collect academic data from reports
        let wpmValues = [];
        let readingLevels = [];
        let testScores = [];
        let skillFocusMetCount = 0;
        let skillFocusTotalCount = 0;
        let totalReports = reports.length;

        reports.forEach(report => {
            // WPM
            const wpm = parseFloat(report['WPM Initial']);
            if (!isNaN(wpm) && wpm > 0) {
                wpmValues.push(wpm);
            }

            // Reading Level
            const readingLevel = parseReadingLevel(report['Reading Level Initial']);
            if (readingLevel !== null) {
                readingLevels.push(readingLevel);
            }

            // Test Scores
            if (report.Scores && typeof report.Scores === 'object') {
                Object.values(report.Scores).forEach(scoreData => {
                    if (scoreData && scoreData.score && scoreData.total) {
                        const score = parseFloat(scoreData.score);
                        const total = parseFloat(scoreData.total);
                        if (!isNaN(score) && !isNaN(total) && total > 0) {
                            testScores.push((score / total) * 100);
                        }
                    }
                });
            }

            // Skill Focus Met (handles both old YES/NO and new JSON format)
            const sfMetParsed = parseSfMet(report['SF Met'], report['Skill Focus']);
            skillFocusMetCount += sfMetParsed.metCount;
            skillFocusTotalCount += sfMetParsed.totalCount || 1;
        });

        // Calculate component scores (0-100 scale)
        let readingLevelScore = 50; // Default if no data
        let wpmScore = 50; // Default if no data
        let testScoreAvg = 50; // Default if no data
        let sfMetRate = skillFocusTotalCount > 0 ? (skillFocusMetCount / skillFocusTotalCount) * 100 : 0;

        // 1. Reading Level Score (30% weight)
        if (readingLevels.length > 0) {
            const avgReadingLevel = readingLevels.reduce((a, b) => a + b, 0) / readingLevels.length;
            const levelDiff = avgReadingLevel - actualGradeNum;

            if (levelDiff >= 2) {
                readingLevelScore = 100; // 2+ grades above
            } else if (levelDiff >= 1) {
                readingLevelScore = 90; // 1 grade above
            } else if (levelDiff >= 0) {
                readingLevelScore = 75; // At grade level
            } else if (levelDiff >= -1) {
                readingLevelScore = 55; // 1 grade below
            } else {
                readingLevelScore = 35; // 2+ grades below
            }
        }

        // 2. WPM Score (25% weight)
        if (wpmValues.length > 0) {
            const avgWPM = wpmValues.reduce((a, b) => a + b, 0) / wpmValues.length;

            if (avgWPM >= wpmBenchmark.advanced) {
                wpmScore = 100; // Advanced
            } else if (avgWPM >= wpmBenchmark.expected) {
                wpmScore = 80; // At expected level
            } else if (avgWPM >= wpmBenchmark.min) {
                wpmScore = 60; // Approaching
            } else {
                wpmScore = 40; // Below minimum
            }
        }

        // 3. Test Score Average (25% weight)
        if (testScores.length > 0) {
            testScoreAvg = testScores.reduce((a, b) => a + b, 0) / testScores.length;
        }

        // 4. Skill Focus Met Rate (10% weight) - already calculated

        // 5. Participation bonus (10% weight) - from framework scores
        // This is a small bonus, not the main driver
        const participationBonus = 50; // Will be updated with framework data

        // Calculate weighted academic performance score
        const academicScore = (
            (readingLevelScore * 0.30) +
            (wpmScore * 0.25) +
            (testScoreAvg * 0.25) +
            (sfMetRate * 0.10) +
            (participationBonus * 0.10)
        );

        // Determine performance level relative to actual grade
        let performanceLevel, performanceDescription, gradeComparison, performanceGrade;

        if (academicScore >= 85) {
            performanceGrade = Math.min(actualGradeNum + 1, 12);
            performanceLevel = `Grade ${performanceGrade}`;
            performanceDescription = 'Above Grade Level';
            gradeComparison = 'above';
        } else if (academicScore >= 70) {
            performanceGrade = actualGradeNum;
            performanceLevel = `Grade ${performanceGrade}`;
            performanceDescription = 'At Grade Level';
            gradeComparison = 'at';
        } else if (academicScore >= 55) {
            performanceGrade = actualGradeNum;
            performanceLevel = `Grade ${performanceGrade}`;
            performanceDescription = 'Approaching Grade Level';
            gradeComparison = 'approaching';
        } else {
            performanceGrade = Math.max(actualGradeNum - 1, 1);
            performanceLevel = `Grade ${performanceGrade}`;
            performanceDescription = 'Below Grade Level';
            gradeComparison = 'below';
        }

        return {
            academicScore: Math.round(academicScore),
            performanceLevel,
            performanceDescription,
            gradeComparison,
            performanceGrade,
            actualGrade: actualGradeNum,
            components: {
                readingLevel: {
                    score: Math.round(readingLevelScore),
                    weight: '30%',
                    dataPoints: readingLevels.length,
                    avgLevel: readingLevels.length > 0 ? (readingLevels.reduce((a, b) => a + b, 0) / readingLevels.length).toFixed(1) : 'N/A'
                },
                wpm: {
                    score: Math.round(wpmScore),
                    weight: '25%',
                    dataPoints: wpmValues.length,
                    avgWPM: wpmValues.length > 0 ? Math.round(wpmValues.reduce((a, b) => a + b, 0) / wpmValues.length) : 'N/A',
                    benchmark: wpmBenchmark
                },
                testScores: {
                    score: Math.round(testScoreAvg),
                    weight: '25%',
                    dataPoints: testScores.length,
                    avgScore: testScores.length > 0 ? Math.round(testScoreAvg) + '%' : 'N/A'
                },
                skillFocusMet: {
                    score: Math.round(sfMetRate),
                    weight: '10%',
                    met: skillFocusMetCount,
                    total: skillFocusTotalCount
                },
                participation: {
                    score: participationBonus,
                    weight: '10%',
                    note: 'From framework scores'
                }
            }
        };
    }

    // Map US grade number to international standards
    function mapGradeToInternationalStandards(gradeNum) {
        const grade = parseInt(gradeNum);
        let ib, uscc, cambridge;

        if (grade >= 12) {
            ib = { level: 'DP 2', sublabel: 'Diploma Programme Year 2' };
            uscc = { level: 'Grade 12', sublabel: 'Advanced' };
            cambridge = { level: 'A2', sublabel: 'A-Level Year 2' };
        } else if (grade === 11) {
            ib = { level: 'DP 1', sublabel: 'Diploma Programme Year 1' };
            uscc = { level: 'Grade 11', sublabel: 'Proficient' };
            cambridge = { level: 'AS', sublabel: 'A-Level Year 1' };
        } else if (grade === 10) {
            ib = { level: 'MYP 5', sublabel: 'Middle Years Year 5' };
            uscc = { level: 'Grade 10', sublabel: 'Proficient' };
            cambridge = { level: 'IGCSE 2', sublabel: 'Year 11' };
        } else if (grade === 9) {
            ib = { level: 'MYP 4', sublabel: 'Middle Years Year 4' };
            uscc = { level: 'Grade 9', sublabel: 'Developing' };
            cambridge = { level: 'IGCSE 1', sublabel: 'Year 10' };
        } else if (grade === 8) {
            ib = { level: 'MYP 3', sublabel: 'Middle Years Year 3' };
            uscc = { level: 'Grade 8', sublabel: 'Developing' };
            cambridge = { level: 'Stage 9', sublabel: 'Lower Secondary' };
        } else if (grade === 7) {
            ib = { level: 'MYP 2', sublabel: 'Middle Years Year 2' };
            uscc = { level: 'Grade 7', sublabel: 'Developing' };
            cambridge = { level: 'Stage 8', sublabel: 'Lower Secondary' };
        } else if (grade === 6) {
            ib = { level: 'MYP 1', sublabel: 'Middle Years Year 1' };
            uscc = { level: 'Grade 6', sublabel: 'Beginning' };
            cambridge = { level: 'Stage 7', sublabel: 'Lower Secondary' };
        } else if (grade === 5) {
            ib = { level: 'PYP 5', sublabel: 'Primary Years Year 5' };
            uscc = { level: 'Grade 5', sublabel: 'Elementary' };
            cambridge = { level: 'Stage 6', sublabel: 'Primary' };
        } else if (grade === 4) {
            ib = { level: 'PYP 4', sublabel: 'Primary Years Year 4' };
            uscc = { level: 'Grade 4', sublabel: 'Elementary' };
            cambridge = { level: 'Stage 5', sublabel: 'Primary' };
        } else if (grade === 3) {
            ib = { level: 'PYP 3', sublabel: 'Primary Years Year 3' };
            uscc = { level: 'Grade 3', sublabel: 'Elementary' };
            cambridge = { level: 'Stage 4', sublabel: 'Primary' };
        } else if (grade === 2) {
            ib = { level: 'PYP 2', sublabel: 'Primary Years Year 2' };
            uscc = { level: 'Grade 2', sublabel: 'Elementary' };
            cambridge = { level: 'Stage 3', sublabel: 'Primary' };
        } else {
            ib = { level: 'PYP 1', sublabel: 'Primary Years Year 1' };
            uscc = { level: 'Grade 1', sublabel: 'Elementary' };
            cambridge = { level: 'Stage 2', sublabel: 'Primary' };
        }

        return { ib, uscc, cambridge };
    }

    function determineGradeLevel(overallPerformance) {
        // Overall performance is out of 5
        // Map to grade levels (simplified K-12 + High School)
        const performance = parseFloat(overallPerformance);

        // IB Levels: PYP (K-5), MYP (6-10), DP (11-12)
        // US Common Core: K-12
        // Cambridge: Primary (K-6), Lower Secondary (7-9), IGCSE (10-11), A-Level (12)

        let ib, uscc, cambridge;

        if (performance >= 4.5) {
            // Advanced High School
            ib = { level: 'DP 2', sublabel: 'Diploma Programme Year 2' };
            uscc = { level: 'Grade 12', sublabel: 'Advanced' };
            cambridge = { level: 'A2', sublabel: 'A-Level Year 2' };
        } else if (performance >= 4.0) {
            // High School Upper
            ib = { level: 'DP 1', sublabel: 'Diploma Programme Year 1' };
            uscc = { level: 'Grade 11', sublabel: 'Proficient' };
            cambridge = { level: 'AS', sublabel: 'A-Level Year 1' };
        } else if (performance >= 3.5) {
            // High School Lower
            ib = { level: 'MYP 5', sublabel: 'Middle Years Year 5' };
            uscc = { level: 'Grade 10', sublabel: 'Proficient' };
            cambridge = { level: 'IGCSE 2', sublabel: 'Year 11' };
        } else if (performance >= 3.0) {
            // Middle School Upper
            ib = { level: 'MYP 4', sublabel: 'Middle Years Year 4' };
            uscc = { level: 'Grade 9', sublabel: 'Developing' };
            cambridge = { level: 'IGCSE 1', sublabel: 'Year 10' };
        } else if (performance >= 2.5) {
            // Middle School Middle
            ib = { level: 'MYP 3', sublabel: 'Middle Years Year 3' };
            uscc = { level: 'Grade 8', sublabel: 'Developing' };
            cambridge = { level: 'Stage 9', sublabel: 'Lower Secondary' };
        } else if (performance >= 2.0) {
            // Middle School Lower
            ib = { level: 'MYP 2', sublabel: 'Middle Years Year 2' };
            uscc = { level: 'Grade 7', sublabel: 'Developing' };
            cambridge = { level: 'Stage 8', sublabel: 'Lower Secondary' };
        } else if (performance >= 1.5) {
            // Elementary Upper
            ib = { level: 'PYP 5', sublabel: 'Primary Years Year 5' };
            uscc = { level: 'Grade 6', sublabel: 'Beginning' };
            cambridge = { level: 'Stage 6', sublabel: 'Primary' };
        } else {
            // Elementary Lower
            ib = { level: 'PYP 3', sublabel: 'Primary Years Year 3' };
            uscc = { level: 'Grade 4', sublabel: 'Beginning' };
            cambridge = { level: 'Stage 4', sublabel: 'Primary' };
        }

        return { ib, uscc, cambridge };
    }


    let frameworkRadarChart = null;

    function createFrameworkRadarChart(framework) {
        const ctx = document.getElementById('frameworkRadarChart');
        if (!ctx) return;

        // Destroy existing chart
        if (frameworkRadarChart) {
            frameworkRadarChart.destroy();
        }

        frameworkRadarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Balancing (Weaving)', 'Nurturing', 'Polishing', 'Higher-minds'],
                datasets: [{
                    label: 'Framework Scores',
                    data: [framework.balancing, framework.nurturing, framework.polishing, framework.higherminds],
                    backgroundColor: 'rgba(5, 150, 105, 0.2)',
                    borderColor: 'rgb(5, 150, 105)',
                    pointBackgroundColor: 'rgb(5, 150, 105)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(5, 150, 105)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20
                        },
                        pointLabels: {
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Generate Framework AI Analysis
    async function generateFrameworkAiAnalysis() {
        if (!selectedStudent) {
            alert('Please select a student first');
            return;
        }

        const loadingState = document.getElementById('frameworkAiLoadingState');
        const frameworkContent = document.getElementById('frameworkContent');
        const generateBtn = document.getElementById('generateFrameworkAnalysis');

        try {
            // Get filtered reports
            const params = new URLSearchParams({
                student: selectedStudent
            });
            if (startDateInput.value) params.append('startDate', startDateInput.value);
            if (endDateInput.value) params.append('endDate', endDateInput.value);
            if (teacherFilter.value) params.append('teacher', teacherFilter.value);
            if (subjectFilter.value) params.append('subject', subjectFilter.value);

            const reportsResponse = await fetch(`/api/reports?${params.toString()}`);
            const reports = await reportsResponse.json();

            if (!reports || reports.length === 0) {
                alert('No reports found for this student');
                return;
            }

            // Show loading state
            loadingState.style.display = 'block';
            frameworkContent.style.display = 'none';
            generateBtn.disabled = true;

            // Calculate framework data (participation metrics)
            const framework = calculateAcademicFramework(reports);

            // Extract actual student grade from reports (use most recent)
            const actualGrade = reports[0]['Grade Level'] || 'N/A';

            // Calculate ACADEMIC performance level using real indicators
            const academicPerformance = calculateAcademicPerformanceLevel(reports, actualGrade);

            // Update participation component with framework data
            if (academicPerformance && framework) {
                const avgParticipation = (framework.balancing + framework.nurturing + framework.polishing + framework.higherminds) / 4;
                academicPerformance.components.participation.score = Math.round(avgParticipation);
            }

            // Get student gender from most recent report
            const studentGender = reports[0]['Student Gender'] || 'Unknown';

            // Prepare framework data with grade levels
            const frameworkWithGrades = {
                ...framework,
                actualGrade: actualGrade,
                studentGender: studentGender,
                academicPerformance: academicPerformance // Include the new academic calculation
            };

            // Call API
            const response = await fetch(`/api/framework-ai-analysis?student=${encodeURIComponent(selectedStudent)}&framework=${encodeURIComponent(JSON.stringify(frameworkWithGrades))}`);
            const result = await response.json();

            // Add academic performance to result for display
            result.academicPerformance = academicPerformance;
            result.reports = reports; // Pass reports for display function

            if (result.error) {
                alert(result.error);
                return;
            }

            // Display everything from AI response
            displayCompleteFramework(result);

            // Hide loading, show content
            loadingState.style.display = 'none';
            frameworkContent.style.display = 'block';
            generateBtn.disabled = false;

            // Show download button
            const downloadFrameworkBtn = document.getElementById('downloadFrameworkBtn');
            if (downloadFrameworkBtn) {
                downloadFrameworkBtn.style.display = 'inline-block';
            }

        } catch (error) {
            console.error('Error generating framework AI analysis:', error);
            alert('Failed to generate framework AI analysis');
            loadingState.style.display = 'none';
            generateBtn.disabled = false;
        }
    }

    // Helper function to normalize grade levels to numbers
    function normalizeGradeToNumber(grade) {
        // Handle null/undefined/empty
        if (!grade || grade === 'N/A' || grade === 'TBD') {
            return null;
        }

        // Convert to string and trim
        const gradeStr = String(grade).trim().toLowerCase();

        // Map text grades to numbers
        const gradeMap = {
            'pre-k': -1,
            'prek': -1,
            'pre k': -1,
            'preschool': -1,
            'kindergarten': 0,
            'kinder': 0,
            'k': 0,
            '1st': 1,
            '2nd': 2,
            '3rd': 3,
            '4th': 4,
            '5th': 5,
            '6th': 6,
            '7th': 7,
            '8th': 8,
            '9th': 9,
            '10th': 10,
            '11th': 11,
            '12th': 12
        };

        // Check if it's in our map
        if (gradeMap.hasOwnProperty(gradeStr)) {
            return gradeMap[gradeStr];
        }

        // Try to parse as number
        const parsed = parseInt(gradeStr);
        if (!isNaN(parsed) && parsed >= -1 && parsed <= 12) {
            return parsed;
        }

        // If we can't parse it, return null
        return null;
    }

    function determineDevelopmentStage(framework, actualGrade) {
        // Determine appropriate development stage based on grade level and performance
        const gradeNum = normalizeGradeToNumber(actualGrade);

        // Grade-appropriate stage mapping:
        // Pre-K/K-2: Balancing (foundational skills)
        // 3-5: Nurturing (logical thinking and comprehension)
        // 6-8: Polishing (quality, creativity, refinement)
        // 9-12: Higher-minds (metacognition and advanced thinking)

        let expectedStage;
        let stageThreshold = 60; // Minimum score to be considered "in" that stage

        // Default to Balancing if grade is unknown
        if (gradeNum === null) {
            expectedStage = 'Balancing';
        } else if (gradeNum <= 2) {
            expectedStage = 'Balancing';
        } else if (gradeNum <= 5) {
            expectedStage = 'Nurturing';
        } else if (gradeNum <= 8) {
            expectedStage = 'Polishing';
        } else {
            expectedStage = 'Higher-minds';
        }

        // Check if student is performing well enough to be in expected stage
        const scores = {
            'Balancing': framework.balancing,
            'Nurturing': framework.nurturing,
            'Polishing': framework.polishing,
            'Higher-minds': framework.higherminds
        };

        // If they're scoring below threshold in their expected stage,
        // they might be in an earlier stage
        const stageOrder = ['Balancing', 'Nurturing', 'Polishing', 'Higher-minds'];
        const expectedStageIndex = stageOrder.indexOf(expectedStage);

        let actualStage = expectedStage;

        // If performing poorly in expected stage, check if they're stronger in earlier stages
        if (scores[expectedStage] < stageThreshold) {
            // Find which stage they're actually strongest in, but cap at their grade-appropriate level
            let strongestStage = expectedStage;
            let highestScore = scores[expectedStage];

            for (let i = 0; i <= expectedStageIndex; i++) {
                const stage = stageOrder[i];
                if (scores[stage] > highestScore) {
                    highestScore = scores[stage];
                    strongestStage = stage;
                }
            }
            actualStage = strongestStage;
        }

        // Provide descriptions for each stage
        const descriptions = {
            'Balancing': 'Building foundational skills and input-output balance',
            'Nurturing': 'Developing logical explanation and comprehension',
            'Polishing': 'Refining quality, creativity, and presentation',
            'Higher-minds': 'Advancing metacognition and self-awareness'
        };

        return {
            stage: actualStage,
            description: descriptions[actualStage],
            icon: {
                'Balancing': '⚖️',
                'Nurturing': '🌱',
                'Polishing': '💎',
                'Higher-minds': '🧠'
            }[actualStage]
        };
    }

    function generateDataDrivenRubric(framework, currentStageName) {
        // Generate rubric showing developmental progression through stages
        // The currentStageName is passed from determineDevelopmentStage() to ensure consistency
        const stages = [
            {
                name: 'Balancing',
                displayName: 'Balancing (Weaving)',
                key: 'balancing',
                icon: '⚖️',
                class: 'balancing-rubric',
                level: 1,
                description: 'Foundational stage: Building input-output balance and basic attention',
                characteristics: [
                    'Developing basic attention and retention skills',
                    'Learning to balance input (listening) with output (responding)',
                    'Building foundational online learning habits',
                    'Focus on following instructions and staying on task'
                ]
            },
            {
                name: 'Nurturing',
                displayName: 'Nurturing',
                key: 'nurturing',
                icon: '🌱',
                class: 'nurturing-rubric',
                level: 2,
                description: 'Growth stage: Developing comprehension and conversational abilities',
                characteristics: [
                    'Growing comprehension and analytical thinking',
                    'Developing conversational and explanation skills',
                    'Building logical reasoning abilities',
                    'Expanding vocabulary and expression'
                ]
            },
            {
                name: 'Polishing',
                displayName: 'Polishing',
                key: 'polishing',
                icon: '💎',
                class: 'polishing-rubric',
                level: 3,
                description: 'Refinement stage: Enhancing quality, creativity, and presentation',
                characteristics: [
                    'Refining quality of work and presentation',
                    'Developing creative problem-solving skills',
                    'Improving screen engagement and digital participation',
                    'Meeting skill-focused learning objectives consistently'
                ]
            },
            {
                name: 'Higher-minds',
                displayName: 'Higher-minds',
                key: 'higherminds',
                icon: '🧠',
                class: 'higherminds-rubric',
                level: 4,
                description: 'Advanced stage: Demonstrating metacognition and self-awareness',
                characteristics: [
                    'Demonstrating metacognitive awareness',
                    'Self-regulating cooperation and learning independently',
                    'Applying advanced critical thinking',
                    'Exhibiting academic maturity and independence'
                ]
            }
        ];

        const rubricStagesContainer = document.getElementById('rubricStages');
        if (!rubricStagesContainer) return;

        rubricStagesContainer.innerHTML = '';

        // Find the current stage level based on the stage name passed in
        const currentStage = stages.find(s => s.name === currentStageName);
        const currentStageLevel = currentStage ? currentStage.level : 1;

        // Generate rubric cards
        stages.forEach(stage => {
            let cardStatus;

            // Determine if this stage is current or not
            if (stage.level === currentStageLevel) {
                cardStatus = 'current-stage';
            } else if (stage.level < currentStageLevel) {
                cardStatus = 'completed-stage';
            } else {
                cardStatus = 'future-stage';
            }

            const card = document.createElement('div');
            card.className = `stage-rubric-card ${stage.class} ${cardStatus}`;
            card.innerHTML = `
                <div class="stage-rubric-header">
                    <div class="framework-icon">${stage.icon}</div>
                    <div class="stage-title">
                        <h4>${stage.displayName}</h4>
                        <span class="stage-level">Level ${stage.level}</span>
                    </div>
                    ${cardStatus === 'current-stage' ? '<span class="current-indicator">● Current Level</span>' : ''}
                </div>
                <p class="stage-rubric-description">${stage.description}</p>
                <ul class="stage-characteristics">
                    ${stage.characteristics.map(c => `<li>${c}</li>`).join('')}
                </ul>
            `;

            rubricStagesContainer.appendChild(card);
        });
    }

    function displayCompleteFramework(result) {
        // Display actual grade vs performance analysis
        const actualGrade = result.framework.actualGrade || 'N/A';
        const actualGradeNum = normalizeGradeToNumber(actualGrade);

        document.getElementById('actualGradeLevel').textContent = `Grade ${actualGrade}`;

        // Use the NEW academic performance calculation (based on real academic indicators)
        const academicPerf = result.academicPerformance;

        // Determine development stage based on grade and performance
        const devStage = determineDevelopmentStage(result.framework, actualGrade);
        document.getElementById('currentDevelopmentStage').textContent = `${devStage.icon} ${devStage.stage}`;
        document.getElementById('developmentStageDescription').textContent = devStage.description;

        // Generate data-driven rubric, passing the current stage name for consistency
        generateDataDrivenRubric(result.framework, devStage.stage);

        // Determine performance status using NEW academic performance calculation
        // This is based on: Reading Level (30%), WPM (25%), Test Scores (25%), SF Met (10%), Participation (10%)
        const gradeStatusBadge = document.getElementById('gradeStatusBadge');
        let performanceText = '';

        // Helper to format grade display (handle Pre-K and Kindergarten specially)
        const formatGradeDisplay = (gradeNum) => {
            if (gradeNum === -1) return 'Pre-K';
            if (gradeNum === 0) return 'Kindergarten';
            return `Grade ${gradeNum}`;
        };

        if (academicPerf && actualGradeNum !== null) {
            // Use the academic performance calculation results
            performanceText = formatGradeDisplay(academicPerf.performanceGrade);

            if (academicPerf.gradeComparison === 'above') {
                gradeStatusBadge.textContent = '✓ Above Grade Level';
                gradeStatusBadge.className = 'grade-status above-level';
            } else if (academicPerf.gradeComparison === 'at') {
                gradeStatusBadge.textContent = '✓ At Grade Level';
                gradeStatusBadge.className = 'grade-status at-level';
            } else if (academicPerf.gradeComparison === 'approaching') {
                gradeStatusBadge.textContent = '⚠ Approaching Grade Level';
                gradeStatusBadge.className = 'grade-status approaching-level';
            } else {
                gradeStatusBadge.textContent = '⚠ Below Grade Level';
                gradeStatusBadge.className = 'grade-status below-level';
            }
            document.getElementById('performanceGradeLevel').textContent = performanceText;

            // Display the academic score breakdown (if element exists)
            const academicBreakdown = document.getElementById('academicScoreBreakdown');
            if (academicBreakdown) {
                academicBreakdown.innerHTML = `
                    <div class="academic-score-summary">
                        <strong>Academic Score: ${academicPerf.academicScore}/100</strong>
                        <div class="score-components">
                            <span title="Reading Level vs Grade ${actualGradeNum}">📚 Reading: ${academicPerf.components.readingLevel.score}%</span>
                            <span title="WPM: ${academicPerf.components.wpm.avgWPM} (Expected: ${academicPerf.components.wpm.benchmark?.expected || 'N/A'})">⚡ WPM: ${academicPerf.components.wpm.score}%</span>
                            <span title="Average Test Score">📝 Tests: ${academicPerf.components.testScores.score}%</span>
                            <span title="Skill Focus Met Rate">🎯 SF Met: ${academicPerf.components.skillFocusMet.score}%</span>
                            <span title="Participation (from framework)">👤 Participation: ${academicPerf.components.participation.score}%</span>
                        </div>
                    </div>
                `;
                academicBreakdown.style.display = 'block';
            }
        } else if (actualGradeNum !== null) {
            // Fallback to framework-based calculation if academic data not available
            const avgFrameworkScore = (
                result.framework.balancing +
                result.framework.nurturing +
                result.framework.polishing +
                result.framework.higherminds
            ) / 4;

            performanceText = formatGradeDisplay(actualGradeNum);
            gradeStatusBadge.textContent = avgFrameworkScore >= 70 ? '✓ At Grade Level' : '⚠ Approaching Grade Level';
            gradeStatusBadge.className = avgFrameworkScore >= 70 ? 'grade-status at-level' : 'grade-status approaching-level';
            document.getElementById('performanceGradeLevel').textContent = performanceText;
        } else {
            gradeStatusBadge.textContent = 'Grade Unknown';
            gradeStatusBadge.className = 'grade-status';
            document.getElementById('performanceGradeLevel').textContent = 'N/A';
        }

        // Display international grade level benchmarks based on academic performance
        const performanceGradeNum = academicPerf ? academicPerf.performanceGrade : (actualGradeNum || 5);

        const realisticBenchmarks = mapGradeToInternationalStandards(performanceGradeNum);

        // Store framework data and benchmarks for modal
        window.currentFrameworkData = {
            framework: result.framework,
            benchmarks: realisticBenchmarks
        };

        // Populate modal data (will be shown when button is clicked)
        document.getElementById('ibLevelModal').textContent = realisticBenchmarks.ib.level;
        document.getElementById('ibSublabelModal').textContent = realisticBenchmarks.ib.sublabel;
        document.getElementById('usccLevelModal').textContent = realisticBenchmarks.uscc.level;
        document.getElementById('usccSublabelModal').textContent = realisticBenchmarks.uscc.sublabel;
        document.getElementById('cambridgeLevelModal').textContent = realisticBenchmarks.cambridge.level;
        document.getElementById('cambridgeSublabelModal').textContent = realisticBenchmarks.cambridge.sublabel;
    }

    // Event listener for Generate Framework Analysis button
    const generateFrameworkAnalysisBtn = document.getElementById('generateFrameworkAnalysis');
    if (generateFrameworkAnalysisBtn) {
        generateFrameworkAnalysisBtn.addEventListener('click', generateFrameworkAiAnalysis);
    }

    // Modal functionality for International Benchmarks
    const benchmarksModal = document.getElementById('benchmarksModal');
    const showBenchmarksBtn = document.getElementById('showBenchmarksBtn');
    const closeBenchmarksModal = document.getElementById('closeBenchmarksModal');

    if (showBenchmarksBtn) {
        showBenchmarksBtn.addEventListener('click', function() {
            benchmarksModal.style.display = 'block';
        });
    }

    if (closeBenchmarksModal) {
        closeBenchmarksModal.addEventListener('click', function() {
            benchmarksModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', function(event) {
        if (event.target === benchmarksModal) {
            benchmarksModal.style.display = 'none';
        }
    });
});
