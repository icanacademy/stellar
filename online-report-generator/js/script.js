document.addEventListener('DOMContentLoaded', function() {
    const reportForm = document.getElementById('reportForm');
    const clearFormBtn = document.getElementById('clearForm');
    const reportOutput = document.getElementById('reportOutput');
    const dateInput = document.getElementById('date');
    const dayOfWeekInput = document.getElementById('dayOfWeek');
    const studentSearchInput = document.getElementById('studentSearch');
    const studentDropdown = document.getElementById('studentDropdown');
    const studentNameHidden = document.getElementById('studentName');
    const studentIdInput = document.getElementById('studentId');
    const dropdownArrow = document.getElementById('dropdownArrow');
    
    const teacherSearchInput = document.getElementById('teacherSearch');
    const teacherDropdown = document.getElementById('teacherDropdown');
    const teacherNameHidden = document.getElementById('teacherName');
    const teacherIdInput = document.getElementById('teacherId');
    const teacherDropdownArrow = document.getElementById('teacherDropdownArrow');

    const subjectSearchInput = document.getElementById('subjectSearch');
    const subjectDropdown = document.getElementById('subjectDropdown');
    const subjectHidden = document.getElementById('subject');
    const subjectDropdownArrow = document.getElementById('subjectDropdownArrow');


    let studentsData = [];
    let filteredStudents = [];
    let selectedIndex = -1;
    let isDropdownOpen = false;

    let teachersData = [];
    let filteredTeachers = [];
    let selectedTeacherIndex = -1;
    let isTeacherDropdownOpen = false;

    let subjectsData = [];
    let skillsData = {};  // { "Subject Name": [{ skill, microskills }] }
    let filteredSubjects = [];
    let selectedSubjectIndex = -1;
    let isSubjectDropdownOpen = false;

    // ==========================================
    // AUTO-SAVE FUNCTIONALITY (Server-side)
    // ==========================================
    const AUTOSAVE_DELAY = 3000; // Save every 3 seconds after changes
    let autosaveTimeout = null;
    let currentTeacherForDraft = null; // Track which teacher's draft we're working on
    let currentStudentForDraft = null; // Track which student's draft we're working on

    // Fields to save
    const fieldsToSave = [
        'studentSearch', 'studentName', 'studentId', 'gradeLevel', 'studentGender',
        'date', 'dayOfWeek',
        'teacherSearch', 'teacherName', 'teacherId',
        'subjectSearch', 'subject',
        'materials', 'currentLesson', 'homework',
        'attention', 'retention', 'comprehension', 'cooperation', 'engagement', 'conversation',
        'activitiesFinished', 'activitiesNotFinished'
    ];

    function collectFormData() {
        const draft = {
            fields: {},
            starRatings: {},
            skillsRatings: collectSkillsData()
        };

        // Save regular fields
        fieldsToSave.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    draft.fields[fieldId] = element.checked;
                } else {
                    draft.fields[fieldId] = element.value;
                }
            }
        });

        // Save star ratings
        ['attention', 'retention', 'comprehension', 'cooperation', 'engagement', 'conversation'].forEach(rating => {
            const input = document.getElementById(rating);
            if (input) {
                draft.starRatings[rating] = input.value;
            }
        });

        return draft;
    }

    async function saveFormDraft() {
        const teacherName = teacherNameHidden.value;
        const studentName = studentNameHidden.value;

        if (!teacherName || !studentName) {
            // Need both teacher and student selected to save
            return;
        }

        currentTeacherForDraft = teacherName;
        currentStudentForDraft = studentName;
        const draftData = collectFormData();

        try {
            const response = await fetch('/api/draft/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacherName, studentName, draftData })
            });

            if (response.ok) {
                showAutosaveIndicator();
            }
        } catch (error) {
            console.error('Error saving draft to server:', error);
        }
    }


    async function loadServerDraft(teacherName, studentName) {
        try {
            const response = await fetch(`/api/draft/load/${encodeURIComponent(teacherName)}/${encodeURIComponent(studentName)}`);
            const result = await response.json();

            if (result.success && result.draft) {
                restoreFormFromDraft(result.draft);
                showDraftRestoredNotification(result.savedAt);
                return true;
            }
        } catch (error) {
            console.error('Error loading draft from server:', error);
        }
        return false;
    }

    // Check if teacher has any pending drafts and show notification
    async function checkTeacherPendingDrafts(teacherName) {
        try {
            const response = await fetch(`/api/drafts/teacher/${encodeURIComponent(teacherName)}`);
            const result = await response.json();

            if (result.success && result.drafts && result.drafts.length > 0) {
                showPendingDraftsNotification(result.drafts);
            }
        } catch (error) {
            console.error('Error checking pending drafts:', error);
        }
    }

    function showPendingDraftsNotification(drafts) {
        // Remove any existing notification
        const existing = document.querySelector('.pending-drafts-notification');
        if (existing) existing.remove();

        const draftsList = drafts.map(d =>
            `<div class="pending-draft-item" data-student="${d.studentName}">
                <span class="student-name">${d.studentName}</span>
                <span class="saved-time">${d.savedAtFormatted}</span>
            </div>`
        ).join('');

        const notification = document.createElement('div');
        notification.className = 'pending-drafts-notification';
        notification.innerHTML = `
            <div class="pending-drafts-content">
                <div class="pending-drafts-header">
                    <span class="pending-icon">📝</span>
                    <strong>You have ${drafts.length} pending draft${drafts.length > 1 ? 's' : ''}</strong>
                    <button class="pending-dismiss" onclick="this.closest('.pending-drafts-notification').remove()">✕</button>
                </div>
                <p class="pending-hint">Select a student below to continue:</p>
                <div class="pending-drafts-list">${draftsList}</div>
            </div>
        `;
        document.body.appendChild(notification);

        // Add click handlers to draft items
        notification.querySelectorAll('.pending-draft-item').forEach(item => {
            item.addEventListener('click', () => {
                const studentName = item.dataset.student;
                // Find and select the student
                const student = studentsData.find(s => s.fullName === studentName);
                if (student) {
                    selectStudent(student);
                }
                notification.remove();
            });
        });

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 15000);
    }

    function restoreFormFromDraft(draft) {
        // Restore regular fields
        Object.entries(draft.fields || {}).forEach(([fieldId, value]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });

        // Restore star ratings with visual update
        Object.entries(draft.starRatings || {}).forEach(([rating, value]) => {
            const input = document.getElementById(rating);
            if (input) {
                input.value = value;
                const starContainer = document.querySelector(`[data-rating="${rating}"]`);
                if (starContainer) {
                    updateStarDisplay(starContainer, parseInt(value) || 0);
                }
            }
        });

        // Restore skills ratings if subject has skills
        const restoredSubject = draft.fields?.subject;
        if (restoredSubject && skillsData[restoredSubject]) {
            const skillsColumn = document.getElementById('skillsColumn');
            skillsColumn.style.display = '';
            renderSkillRatings(skillsData[restoredSubject]);

            // Restore saved skill values
            if (draft.skillsRatings && Object.keys(draft.skillsRatings).length > 0) {
                Object.entries(draft.skillsRatings).forEach(([skillName, value]) => {
                    const item = document.querySelector(`.skill-rating-item[data-skill="${CSS.escape(skillName)}"]`);
                    if (!item) return;
                    const hiddenInput = item.querySelector('input[type="hidden"]');
                    if (value === 'NA') {
                        const naBtn = item.querySelector('.seg-btn-na');
                        if (naBtn) {
                            naBtn.classList.add('selected');
                            item.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
                            if (hiddenInput) hiddenInput.value = 'NA';
                        }
                    } else {
                        const btn = item.querySelector(`.seg-btn[data-value="${value}"]`);
                        if (btn) {
                            item.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
                            item.querySelector('.seg-btn-na')?.classList.remove('selected');
                            btn.classList.add('selected');
                            if (hiddenInput) hiddenInput.value = value;
                        }
                    }
                });
            }
        }

        // Recalculate day of week based on restored date (in case draft had wrong day)
        if (typeof updateDayOfWeek === 'function') {
            updateDayOfWeek();
        }

        // Check if restored date is not today and highlight if needed
        if (typeof checkDateMismatch === 'function') {
            checkDateMismatch();
        }
    }

    async function clearFormDraft() {
        const teacherName = currentTeacherForDraft || teacherNameHidden.value;
        const studentName = currentStudentForDraft || studentNameHidden.value;
        if (teacherName && studentName) {
            try {
                await fetch(`/api/draft/delete/${encodeURIComponent(teacherName)}/${encodeURIComponent(studentName)}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.error('Error deleting draft:', error);
            }
        }
        currentTeacherForDraft = null;
        currentStudentForDraft = null;
        hideAutosaveIndicator();
    }

    function showAutosaveIndicator() {
        let indicator = document.getElementById('autosaveIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autosaveIndicator';
            indicator.className = 'autosave-indicator';
            indicator.innerHTML = '💾 Draft saved to server';
            document.body.appendChild(indicator);
        }
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 2000);
    }

    function hideAutosaveIndicator() {
        const indicator = document.getElementById('autosaveIndicator');
        if (indicator) {
            indicator.classList.remove('show');
        }
    }

    function showDraftRestoredNotification(savedAt) {
        const savedTime = savedAt ? new Date(savedAt).toLocaleString() : 'recently';
        const notification = document.createElement('div');
        notification.className = 'draft-restored-notification';
        notification.innerHTML = `
            <div class="draft-restored-content">
                <span class="draft-icon">📋</span>
                <div class="draft-message">
                    <strong>Draft Restored</strong>
                    <p>Your previous work (saved ${savedTime}) has been recovered.</p>
                </div>
                <button class="draft-dismiss" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
        `;
        document.body.appendChild(notification);

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 6000);
    }

    function scheduleAutosave() {
        if (autosaveTimeout) {
            clearTimeout(autosaveTimeout);
        }
        autosaveTimeout = setTimeout(saveFormDraft, AUTOSAVE_DELAY);
    }

    // Attach autosave to form inputs
    function initializeAutosave() {
        // Listen to all input changes
        reportForm.addEventListener('input', scheduleAutosave);
        reportForm.addEventListener('change', scheduleAutosave);
    }

    // ==========================================
    // END AUTO-SAVE FUNCTIONALITY
    // ==========================================

    // Helper function to extract first name from brackets
    function extractFirstName(fullName) {
        const match = fullName.match(/^\[([^\]]+)\]/);
        return match ? match[1] : fullName;
    }

    // Function to highlight strongest and weakest sentences
    function highlightSentiment(text) {
        // Positive indicator words with weights
        const positiveWords = {
            'excellent': 5, 'outstanding': 5, 'exceptional': 5, 'impressive': 4,
            'strong': 3, 'strengths': 3, 'proficient': 4, 'skilled': 3,
            'talented': 4, 'creative': 3, 'enthusiastic': 3, 'engaged': 3,
            'confident': 3, 'improved': 3, 'progress': 3,
            'successful': 4, 'achievement': 3, 'achieves': 3, 'mastered': 5,
            'mastery': 4, 'excels': 5, 'excelled': 5, 'demonstrates': 2,
            'great': 3, 'well': 2, 'better': 2, 'best': 4,
            'consistently': 2, 'active': 2, 'participates': 2, 'attentive': 3,
            'focused': 3, 'understands': 2, 'understanding': 2, 'comprehends': 3,
            'grasps': 3, 'bright': 3, 'advanced': 4, 'superior': 5,
            'remarkable': 4, 'wonderful': 4, 'fantastic': 4, 'amazing': 4,
            'commendable': 4, 'praise': 3, 'positive': 2, 'cooperative': 2,
            'completing': 2, 'completed': 2, 'successfully': 3
        };

        // Negative indicator words with weights
        const negativeWords = {
            'struggle': -4, 'struggles': -4, 'struggling': -4, 'difficulty': -3,
            'difficulties': -3, 'challenging': -2, 'challenges': -3, 'weak': -4,
            'weakness': -4, 'weaknesses': -4, 'poor': -4, 'low': -3, 'below': -3,
            'lacking': -3, 'needs': -2, 'requires': -2, 'improvement': -1,
            'concerns': -3, 'concerning': -3, 'issue': -3, 'issues': -3,
            'problem': -4, 'problems': -4, 'unable': -4, 'cannot': -4,
            'failed': -5, 'failure': -5, 'incomplete': -3, 'missing': -3,
            'absent': -3, 'distracted': -3, 'unfocused': -3, 'confused': -4,
            'confusion': -4, 'misunderstands': -4, 'misunderstanding': -4,
            'inadequate': -4, 'insufficient': -3, 'limited': -3, 'slow': -3,
            'behind': -3, 'frustration': -3, 'frustrated': -3, 'hesitant': -3,
            'reluctant': -3, 'avoid': -3, 'avoids': -3, 'resistant': -3, 'minimal': -3,
            'lower': -2, 'affecting': -2
        };

        // Negative context phrases that override positive words
        const negativeContexts = [
            'however', 'but', 'although', 'though', 'yet', 'unfortunately',
            'not met', 'did not', 'was not', 'were not', 'has not', 'have not',
            'may not', 'might not', 'could not', 'would not', 'should not',
            'suggest that', 'indicating', 'need for'
        ];

        // Split text into sentences
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        // Calculate sentiment score for each sentence
        const sentenceScores = sentences.map(sentence => {
            let score = 0;
            const lowerSentence = sentence.toLowerCase();

            // Check for negative context markers
            const hasNegativeContext = negativeContexts.some(context =>
                lowerSentence.includes(context.toLowerCase())
            );

            // Check positive words
            Object.entries(positiveWords).forEach(([word, weight]) => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                const matches = lowerSentence.match(regex);
                if (matches) {
                    // If sentence has negative context, reduce positive word impact
                    const modifier = hasNegativeContext ? 0.3 : 1;
                    score += weight * matches.length * modifier;
                }
            });

            // Check negative words
            Object.entries(negativeWords).forEach(([word, weight]) => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                const matches = lowerSentence.match(regex);
                if (matches) score += weight * matches.length;
            });

            // Apply negative context penalty if present
            if (hasNegativeContext) {
                score -= 2; // Additional penalty for negative context
            }

            return { sentence: sentence.trim(), score };
        });

        // Find strongest (most positive) and weakest (most negative) sentences
        let strongestSentence = sentenceScores[0];
        let weakestSentence = sentenceScores[0];

        sentenceScores.forEach(item => {
            if (item.score > strongestSentence.score) strongestSentence = item;
            if (item.score < weakestSentence.score) weakestSentence = item;
        });

        // Only highlight if there's a significant difference
        let highlightedText = text;

        if (strongestSentence.score > 3) {
            const escapedSentence = strongestSentence.sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            highlightedText = highlightedText.replace(
                new RegExp(escapedSentence, 'g'),
                `<span style="background-color: #d1fae5; color: #065f46; padding: 2px 4px; border-radius: 3px; font-weight: 500;">${strongestSentence.sentence}</span>`
            );
        }

        if (weakestSentence.score < -3 && strongestSentence.sentence !== weakestSentence.sentence) {
            const escapedSentence = weakestSentence.sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            highlightedText = highlightedText.replace(
                new RegExp(escapedSentence, 'g'),
                `<span style="color: #dc2626; font-weight: 600;">${weakestSentence.sentence}</span>`
            );
        }

        return highlightedText;
    }

    // New AI-powered function to highlight phrases using font color
    function highlightSentimentAI(text, sentimentData) {
        if (!sentimentData) return text;

        let highlightedText = text;

        // Highlight positive phrase in green (font color only)
        if (sentimentData.positive) {
            const escapedPhrase = sentimentData.positive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            try {
                highlightedText = highlightedText.replace(
                    new RegExp(escapedPhrase, 'gi'),
                    `<span style="color: #16a34a; font-weight: 600;">${sentimentData.positive}</span>`
                );
            } catch (e) {
                console.error('Error highlighting positive phrase:', e);
            }
        }

        // Highlight negative phrase in red (font color only)
        if (sentimentData.negative) {
            const escapedPhrase = sentimentData.negative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            try {
                highlightedText = highlightedText.replace(
                    new RegExp(escapedPhrase, 'gi'),
                    `<span style="color: #dc2626; font-weight: 600;">${sentimentData.negative}</span>`
                );
            } catch (e) {
                console.error('Error highlighting negative phrase:', e);
            }
        }

        return highlightedText;
    }

    // Set today's date as default
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
    updateDayOfWeek();
    
    // Load data from Notion
    loadStudents();
    loadTeachers();
    loadSubjects();
    // Initialize star ratings
    initializeStarRatings();

    // Initialize auto-save functionality
    initializeAutosave();

    // Update day of week when date changes
    dateInput.addEventListener('change', function() {
        updateDayOfWeek();
        checkDateMismatch();
    });

    // Function to check if date is not today and highlight it red
    function checkDateMismatch() {
        const currentDateValue = dateInput.value;
        const todayStr = new Date().toISOString().split('T')[0];

        if (currentDateValue && currentDateValue !== todayStr) {
            // Date is NOT today - highlight red
            dateInput.style.backgroundColor = '#fee2e2';
            dateInput.style.borderColor = '#ef4444';
            dateInput.style.color = '#dc2626';
            dateInput.style.fontWeight = 'bold';
        } else {
            // Date is today - normal style
            dateInput.style.backgroundColor = '';
            dateInput.style.borderColor = '';
            dateInput.style.color = '';
            dateInput.style.fontWeight = '';
        }
    }

    // Check date mismatch on page load
    checkDateMismatch();

    // Auto-refresh date when page becomes visible again (handles overnight sessions)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            const currentDateValue = dateInput.value;
            const todayStr = new Date().toISOString().split('T')[0];

            // If the date in the form is not today, update it
            if (currentDateValue && currentDateValue !== todayStr) {
                dateInput.value = todayStr;
                updateDayOfWeek();
                checkDateMismatch();

                // Show a subtle notification that date was updated
                const notification = document.createElement('div');
                notification.className = 'date-updated-notification';
                notification.innerHTML = `📅 Date automatically updated to today (${todayStr})`;
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #3b82f6;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 10000;
                    font-size: 14px;
                    animation: slideIn 0.3s ease;
                `;
                document.body.appendChild(notification);

                setTimeout(() => {
                    notification.style.opacity = '0';
                    notification.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => notification.remove(), 300);
                }, 4000);
            }
        }
    });
    
    // Add search functionality for students
    studentSearchInput.addEventListener('input', handleSearch);
    studentSearchInput.addEventListener('keydown', handleKeydown);
    studentSearchInput.addEventListener('focus', showDropdown);
    
    // Add dropdown arrow functionality for students
    dropdownArrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown();
    });
    
    // Add search functionality for teachers
    teacherSearchInput.addEventListener('input', handleTeacherSearch);
    teacherSearchInput.addEventListener('keydown', handleTeacherKeydown);
    teacherSearchInput.addEventListener('focus', showTeacherDropdown);
    
    // Add dropdown arrow functionality for teachers
    teacherDropdownArrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTeacherDropdown();
    });

    // Add search functionality for subjects
    subjectSearchInput.addEventListener('input', handleSubjectSearch);
    subjectSearchInput.addEventListener('keydown', handleSubjectKeydown);
    subjectSearchInput.addEventListener('focus', showSubjectDropdown);

    // Add dropdown arrow functionality for subjects
    subjectDropdownArrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSubjectDropdown();
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!studentSearchInput.contains(e.target) && !studentDropdown.contains(e.target) && !dropdownArrow.contains(e.target)) {
            hideDropdown();
        }
        if (!teacherSearchInput.contains(e.target) && !teacherDropdown.contains(e.target) && !teacherDropdownArrow.contains(e.target)) {
            hideTeacherDropdown();
        }
        if (!subjectSearchInput.contains(e.target) && !subjectDropdown.contains(e.target) && !subjectDropdownArrow.contains(e.target)) {
            hideSubjectDropdown();
        }
    });

    async function loadStudents() {
        try {
            const response = await fetch('/api/students');
            if (response.ok) {
                studentsData = await response.json();
                populateStudentDropdown();
            } else {
                console.error('Failed to load students');
                studentSearchInput.placeholder = 'Failed to load students';
            }
        } catch (error) {
            console.error('Error loading students:', error);
            studentSearchInput.placeholder = 'Error loading students';
        }
    }
    
    function populateStudentDropdown() {
        studentSearchInput.placeholder = `Type to search ${studentsData.length} students...`;
        filteredStudents = studentsData;
    }
    
    async function loadTeachers() {
        try {
            const response = await fetch('/api/teachers');
            if (response.ok) {
                teachersData = await response.json();
                populateTeacherDropdown();
            } else {
                console.error('Failed to load teachers');
                teacherSearchInput.placeholder = 'Failed to load teachers';
            }
        } catch (error) {
            console.error('Error loading teachers:', error);
            teacherSearchInput.placeholder = 'Error loading teachers';
        }
    }

    function populateTeacherDropdown() {
        teacherSearchInput.placeholder = `Type to search ${teachersData.length} teachers...`;
        filteredTeachers = teachersData;
    }

    async function loadSubjects() {
        try {
            const response = await fetch('/api/skills');
            if (response.ok) {
                skillsData = await response.json();
                subjectsData = Object.keys(skillsData).sort();
                filteredSubjects = subjectsData;
                subjectSearchInput.placeholder = `Select a subject...`;
            } else {
                console.error('Failed to load subjects/skills');
                subjectSearchInput.placeholder = 'Failed to load subjects';
            }
        } catch (error) {
            console.error('Error loading subjects:', error);
            subjectSearchInput.placeholder = 'Error loading subjects';
        }
    }
    
    function handleSearch() {
        const searchTerm = studentSearchInput.value.toLowerCase();
        filteredStudents = studentsData.filter(student => 
            student.fullName.toLowerCase().includes(searchTerm)
        );
        selectedIndex = -1;
        renderDropdown();
        showDropdown();
    }
    
    function handleKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredStudents.length - 1);
            renderDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            renderDropdown();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && filteredStudents[selectedIndex]) {
                selectStudent(filteredStudents[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    }
    
    function renderDropdown() {
        studentDropdown.innerHTML = '';
        
        if (filteredStudents.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-item no-results';
            noResults.textContent = 'No students found';
            studentDropdown.appendChild(noResults);
        } else {
            filteredStudents.forEach((student, index) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                if (index === selectedIndex) {
                    item.classList.add('selected');
                }
                item.textContent = student.fullName;
                item.addEventListener('click', () => selectStudent(student));
                studentDropdown.appendChild(item);
            });
        }
    }
    
    async function selectStudent(student) {
        studentSearchInput.value = student.fullName;
        studentNameHidden.value = student.fullName;
        studentIdInput.value = student.studentId;
        currentStudentForDraft = student.fullName;

        // Populate new fields with TBD if blank
        document.getElementById('gradeLevel').value = student.gradeLevel || 'TBD';
        document.getElementById('studentGender').value = student.gender || '';

        hideDropdown();

        // Load draft if both teacher and student are selected
        const teacherName = teacherNameHidden.value;
        if (teacherName) {
            await loadServerDraft(teacherName, student.fullName);
        }
    }
    
    function showDropdown() {
        if (filteredStudents.length > 0 || studentSearchInput.value.length > 0) {
            renderDropdown();
            studentDropdown.classList.add('show');
        }
    }
    
    function hideDropdown() {
        studentDropdown.classList.remove('show');
        isDropdownOpen = false;
        dropdownArrow.classList.remove('open');
    }
    
    function toggleDropdown() {
        if (isDropdownOpen) {
            hideDropdown();
        } else {
            filteredStudents = studentsData; // Show all students
            renderDropdown();
            showDropdown();
            studentSearchInput.focus();
            isDropdownOpen = true;
            dropdownArrow.classList.add('open');
        }
    }
    
    // Teacher dropdown functions
    function handleTeacherSearch() {
        const searchTerm = teacherSearchInput.value.toLowerCase();
        filteredTeachers = teachersData.filter(teacher => 
            teacher.fullName.toLowerCase().includes(searchTerm)
        );
        selectedTeacherIndex = -1;
        renderTeacherDropdown();
        showTeacherDropdown();
    }
    
    function handleTeacherKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedTeacherIndex = Math.min(selectedTeacherIndex + 1, filteredTeachers.length - 1);
            renderTeacherDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedTeacherIndex = Math.max(selectedTeacherIndex - 1, -1);
            renderTeacherDropdown();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedTeacherIndex >= 0 && filteredTeachers[selectedTeacherIndex]) {
                selectTeacher(filteredTeachers[selectedTeacherIndex]);
            }
        } else if (e.key === 'Escape') {
            hideTeacherDropdown();
        }
    }
    
    function renderTeacherDropdown() {
        teacherDropdown.innerHTML = '';
        
        if (filteredTeachers.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-item no-results';
            noResults.textContent = 'No teachers found';
            teacherDropdown.appendChild(noResults);
        } else {
            filteredTeachers.forEach((teacher, index) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                if (index === selectedTeacherIndex) {
                    item.classList.add('selected');
                }
                item.textContent = teacher.fullName;
                item.addEventListener('click', () => selectTeacher(teacher));
                teacherDropdown.appendChild(item);
            });
        }
    }
    
    async function selectTeacher(teacher) {
        teacherSearchInput.value = teacher.fullName;
        teacherNameHidden.value = teacher.fullName;
        teacherIdInput.value = teacher.teacherId;
        currentTeacherForDraft = teacher.fullName;
        hideTeacherDropdown();

        // Check if this teacher has any pending drafts
        await checkTeacherPendingDrafts(teacher.fullName);
    }
    
    function showTeacherDropdown() {
        if (filteredTeachers.length > 0 || teacherSearchInput.value.length > 0) {
            renderTeacherDropdown();
            teacherDropdown.classList.add('show');
        }
    }
    
    function hideTeacherDropdown() {
        teacherDropdown.classList.remove('show');
        isTeacherDropdownOpen = false;
        teacherDropdownArrow.classList.remove('open');
    }
    
    function toggleTeacherDropdown() {
        if (isTeacherDropdownOpen) {
            hideTeacherDropdown();
        } else {
            filteredTeachers = teachersData; // Show all teachers
            renderTeacherDropdown();
            showTeacherDropdown();
            teacherSearchInput.focus();
            isTeacherDropdownOpen = true;
            teacherDropdownArrow.classList.add('open');
        }
    }

    // Subject dropdown functions
    function handleSubjectSearch() {
        const searchTerm = subjectSearchInput.value.toLowerCase();
        filteredSubjects = subjectsData.filter(subject =>
            subject.toLowerCase().includes(searchTerm)
        );
        selectedSubjectIndex = -1;
        renderSubjectDropdown();
        showSubjectDropdown();
    }

    function handleSubjectKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSubjectIndex = Math.min(selectedSubjectIndex + 1, filteredSubjects.length - 1);
            renderSubjectDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSubjectIndex = Math.max(selectedSubjectIndex - 1, -1);
            renderSubjectDropdown();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedSubjectIndex >= 0 && filteredSubjects[selectedSubjectIndex]) {
                selectSubject(filteredSubjects[selectedSubjectIndex]);
            }
        } else if (e.key === 'Escape') {
            hideSubjectDropdown();
        }
    }

    function renderSubjectDropdown() {
        subjectDropdown.innerHTML = '';

        if (filteredSubjects.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-item no-results';
            noResults.textContent = 'No subjects found';
            subjectDropdown.appendChild(noResults);
        } else {
            filteredSubjects.forEach((subject, index) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                if (index === selectedSubjectIndex) {
                    item.classList.add('selected');
                }
                item.textContent = subject;
                item.addEventListener('click', () => selectSubject(subject));
                subjectDropdown.appendChild(item);
            });
        }
    }

    function selectSubject(subject) {
        subjectSearchInput.value = subject;
        subjectHidden.value = subject;
        hideSubjectDropdown();

        // Show/hide skills column based on subject skills data
        const skillsColumn = document.getElementById('skillsColumn');
        if (skillsData[subject] && skillsData[subject].length > 0) {
            skillsColumn.style.display = '';
            renderSkillRatings(skillsData[subject]);
        } else {
            skillsColumn.style.display = 'none';
            document.getElementById('skillsRatingContainer').innerHTML = '';
        }
    }

    function showSubjectDropdown() {
        if (filteredSubjects.length > 0) {
            renderSubjectDropdown();
            subjectDropdown.classList.add('show');
        }
    }

    function hideSubjectDropdown() {
        subjectDropdown.classList.remove('show');
        isSubjectDropdownOpen = false;
        subjectDropdownArrow.classList.remove('open');
    }

    function toggleSubjectDropdown() {
        if (isSubjectDropdownOpen) {
            hideSubjectDropdown();
        } else {
            filteredSubjects = subjectsData; // Show all subjects
            renderSubjectDropdown();
            showSubjectDropdown();
            subjectSearchInput.focus();
            isSubjectDropdownOpen = true;
            subjectDropdownArrow.classList.add('open');
        }
    }

    // ==========================================
    // Subject Skills Rating Functions
    // ==========================================

    function renderSkillRatings(skills) {
        const container = document.getElementById('skillsRatingContainer');
        container.innerHTML = '';

        skills.forEach(skillObj => {
            const item = document.createElement('div');
            item.className = 'skill-rating-item';
            item.setAttribute('data-skill', skillObj.skill);

            const label = document.createElement('label');
            label.textContent = skillObj.skill;

            const btnGroup = document.createElement('div');
            btnGroup.className = 'seg-btn-group';

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = 'skill_' + skillObj.skill;
            hiddenInput.value = '0';

            // Create number buttons 1-5
            for (let i = 1; i <= 5; i++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'seg-btn';
                btn.setAttribute('data-value', i);
                btn.textContent = i;
                btn.addEventListener('click', function() {
                    // Deselect all in this group
                    btnGroup.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
                    naBtn.classList.remove('selected');
                    // Select this one
                    btn.classList.add('selected');
                    hiddenInput.value = i;
                    scheduleAutosave();
                });
                btnGroup.appendChild(btn);
            }

            // N/A button
            const naBtn = document.createElement('button');
            naBtn.type = 'button';
            naBtn.className = 'seg-btn-na';
            naBtn.textContent = 'N/A';
            naBtn.addEventListener('click', function() {
                btnGroup.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
                naBtn.classList.toggle('selected');
                hiddenInput.value = naBtn.classList.contains('selected') ? 'NA' : '0';
                scheduleAutosave();
            });

            item.appendChild(label);
            item.appendChild(btnGroup);
            item.appendChild(naBtn);
            item.appendChild(hiddenInput);
            container.appendChild(item);
        });
    }

    function collectSkillsData() {
        const result = {};
        const items = document.querySelectorAll('.skill-rating-item');
        items.forEach(item => {
            const skillName = item.getAttribute('data-skill');
            const hiddenInput = item.querySelector('input[type="hidden"]');
            if (hiddenInput && hiddenInput.value !== '0') {
                result[skillName] = hiddenInput.value === 'NA' ? 'NA' : parseInt(hiddenInput.value);
            }
        });
        return result;
    }

    function updateDayOfWeek() {
        // Parse date correctly to avoid timezone issues
        // "2026-01-30" should be treated as local date, not UTC
        const dateValue = dateInput.value;
        if (!dateValue) return;

        const [year, month, day] = dateValue.split('-').map(Number);
        const date = new Date(year, month - 1, day);  // month is 0-indexed
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[date.getDay()];

        // Always display the actual day
        dayOfWeekInput.value = dayName;

        // Show a note for weekends
        if (dayName === 'Sunday' || dayName === 'Saturday') {
            dayOfWeekInput.style.color = '#94a3b8';
            dayOfWeekInput.title = 'Weekend selected - reports are typically for weekdays';
        } else {
            dayOfWeekInput.style.color = '';
            dayOfWeekInput.title = '';
        }
    }

    // Note: Old toggle switch removed - per-skill met status is now handled by skill tags
    
    function initializeStarRatings() {
        const starRatings = document.querySelectorAll('.star-rating');
        
        starRatings.forEach(rating => {
            const stars = rating.querySelectorAll('.star');
            const ratingName = rating.getAttribute('data-rating');
            const hiddenInput = document.getElementById(ratingName);
            
            stars.forEach((star, index) => {
                // Click event
                star.addEventListener('click', () => {
                    const value = parseInt(star.getAttribute('data-value'));
                    hiddenInput.value = value;
                    updateStarDisplay(rating, value);
                });
                
                // Hover events
                star.addEventListener('mouseenter', () => {
                    const value = parseInt(star.getAttribute('data-value'));
                    highlightStars(rating, value);
                });
                
                rating.addEventListener('mouseleave', () => {
                    const currentValue = parseInt(hiddenInput.value);
                    updateStarDisplay(rating, currentValue);
                });
            });
        });
    }
    
    function updateStarDisplay(rating, value) {
        const stars = rating.querySelectorAll('.star');
        stars.forEach((star, index) => {
            const starValue = parseInt(star.getAttribute('data-value'));
            if (starValue <= value) {
                star.classList.add('active');
                star.classList.remove('hover');
            } else {
                star.classList.remove('active');
                star.classList.remove('hover');
            }
        });
    }
    
    function highlightStars(rating, value) {
        const stars = rating.querySelectorAll('.star');
        stars.forEach((star, index) => {
            const starValue = parseInt(star.getAttribute('data-value'));
            if (starValue <= value) {
                star.classList.add('hover');
            } else {
                star.classList.remove('hover');
            }
        });
    }

    // Handle form submission
    reportForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validation
        const studentName = document.getElementById('studentName').value.trim();
        const teacherName = document.getElementById('teacherName').value.trim();
        const subject = document.getElementById('subject').value.trim();
        const materials = document.getElementById('materials').value.trim();
        const currentLesson = document.getElementById('currentLesson').value.trim();
        const homework = document.getElementById('homework').value.trim();
        const activitiesFinished = document.getElementById('activitiesFinished').value.trim();
        const activitiesNotFinished = document.getElementById('activitiesNotFinished').value.trim();

        // Check all 6 ratings
        const attention = parseInt(document.getElementById('attention').value);
        const retention = parseInt(document.getElementById('retention').value);
        const comprehension = parseInt(document.getElementById('comprehension').value);
        const cooperation = parseInt(document.getElementById('cooperation').value);
        const engagement = parseInt(document.getElementById('engagement').value);
        const conversation = parseInt(document.getElementById('conversation').value);

        const errors = [];

        if (!studentName) errors.push('Student Name');
        if (!teacherName) errors.push('Teacher Name');
        if (!subject) errors.push('Subject');
        if (!materials) errors.push('Textbook/Materials');
        if (!currentLesson) errors.push('Current Lesson');
        if (!homework) errors.push('Homework');
        if (!activitiesFinished) errors.push('Activities Finished Today');
        if (!activitiesNotFinished) errors.push('Activities Did NOT Finish Today');

        // Check all ratings are filled
        if (attention === 0) errors.push('Attention Rating');
        if (retention === 0) errors.push('Retention Rating');
        if (comprehension === 0) errors.push('Comprehension Rating');
        if (cooperation === 0) errors.push('Cooperation Rating');
        if (engagement === 0) errors.push('Engagement Rating');
        if (conversation === 0) errors.push('Conversation Rating');

        // Check subject skills ratings are filled (if skills column is visible)
        const skillsColumn = document.getElementById('skillsColumn');
        if (skillsColumn && skillsColumn.style.display !== 'none') {
            const skillItems = document.querySelectorAll('#skillsRatingContainer .skill-rating-item');
            skillItems.forEach(item => {
                const hiddenInput = item.querySelector('input[type="hidden"]');
                const label = item.querySelector('label');
                if (hiddenInput && (!hiddenInput.value || hiddenInput.value === '0')) {
                    const skillName = label ? label.textContent.trim() : 'Unknown Skill';
                    errors.push(`${skillName} (Subject Skill)`);
                }
            });
        }

        if (errors.length > 0) {
            alert('Please fill in the following required fields:\n\n' + errors.join('\n'));
            return;
        }

        // Show confirmation dialog before generating report
        const formDate = document.getElementById('date').value;
        const todayStr = new Date().toISOString().split('T')[0];
        const isDateNotToday = formDate !== todayStr;

        let dateWarning = '';
        if (isDateNotToday) {
            dateWarning = `\n🚨 WARNING: The date (${formDate}) is NOT today (${todayStr})!\n` +
                `   If this is unintentional, click Cancel and fix the date.\n`;
        }

        const confirmMessage = `⚠️ PLEASE CONFIRM BEFORE GENERATING REPORT\n\n` +
            `This action will:\n` +
            `✓ Consume AI tokens (costs money)\n` +
            `✓ Save data permanently to the database\n` +
            `✓ Create a duplicate entry if sent again\n\n` +
            `Please review all data carefully before proceeding.\n\n` +
            `Student: ${studentName}\n` +
            `Teacher: ${teacherName}\n` +
            `Subject: ${subject}\n` +
            `Date: ${formDate}` + (isDateNotToday ? ' ⚠️' : '') + `\n` +
            dateWarning + `\n` +
            `Do you want to generate this report?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        generateReport();
    });
    
    // Handle clear form
    clearFormBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear the form? This will also delete your saved draft.')) {
            reportForm.reset();
            clearFormDraft(); // Clear auto-saved draft
            reportOutput.classList.remove('show');
            dateInput.value = today.toISOString().split('T')[0];
            updateDayOfWeek();
            studentSearchInput.value = '';
            studentNameHidden.value = '';
            studentIdInput.value = '';
            document.getElementById('gradeLevel').value = '';
            teacherSearchInput.value = '';
            teacherNameHidden.value = '';
            teacherIdInput.value = '';
            subjectSearchInput.value = '';
            subjectHidden.value = '';

            // Hide and clear skills column
            document.getElementById('skillsColumn').style.display = 'none';
            document.getElementById('skillsRatingContainer').innerHTML = '';

            // Reset star ratings
            const starRatings = document.querySelectorAll('.star-rating');
            starRatings.forEach(rating => {
                const ratingName = rating.getAttribute('data-rating');
                const hiddenInput = document.getElementById(ratingName);
                hiddenInput.value = 0;
                updateStarDisplay(rating, 0);
            });

            hideDropdown();
            hideTeacherDropdown();
            hideSubjectDropdown();
        }
    });
    
    async function generateReport() {
        const studentName = document.getElementById('studentName').value;
        const teacherName = document.getElementById('teacherName').value;
        const date = document.getElementById('date').value;
        const dayOfWeek = document.getElementById('dayOfWeek').value;
        const subject = document.getElementById('subject').value;


        const ratings = {
            attention: document.getElementById('attention').value,
            retention: document.getElementById('retention').value,
            comprehension: document.getElementById('comprehension').value,
            cooperation: document.getElementById('cooperation').value,
            engagement: document.getElementById('engagement').value,
            conversation: document.getElementById('conversation').value,
        };

        const materials = document.getElementById('materials').value;
        const currentLesson = document.getElementById('currentLesson').value;
        const homework = document.getElementById('homework').value;
        const activitiesFinished = document.getElementById('activitiesFinished').value;
        const activitiesNotFinished = document.getElementById('activitiesNotFinished').value;
        const studentGender = document.getElementById('studentGender').value;

        const skills = collectSkillsData();

        const formData = {
            studentName,
            studentId: document.getElementById('studentId').value,
            teacherName,
            teacherId: document.getElementById('teacherId').value,
            date,
            dayOfWeek,
            subject,
            ratings,
            skills,
            currentLesson,
            materials,
            homework,
            activitiesFinished,
            activitiesNotFinished,
            studentGender,
            gradeLevel: document.getElementById('gradeLevel').value,
            classType: document.getElementById('classType') ? document.getElementById('classType').value : 'Online'
        };

        // Generate report HTML
        const reportHTML = `
            <div class="report-card">
                <div class="report-header">
                    <img src="assets/ican-logo.png" alt="ICAN Logo" class="report-logo">
                    <h2 class="report-title">ICAN STELLAR ONLINE REPORT</h2>
                </div>
                
                <div class="report-body">
                    <div class="report-main">
                        <!-- Student Profile -->
                        <div class="report-info-section">
                            <h3 class="section-title">Student Profile</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Date:</span>
                                    <span class="info-value">${date}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Day:</span>
                                    <span class="info-value">${dayOfWeek}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Student:</span>
                                    <span class="info-value">${studentName.toUpperCase()}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">ID:</span>
                                    <span class="info-value">${document.getElementById('studentId').value || '#N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Grade Level:</span>
                                    <span class="info-value">${document.getElementById('gradeLevel').value || 'TBD'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Gender:</span>
                                    <span class="info-value">${document.getElementById('studentGender').value || 'TBD'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Class Details -->
                        <div class="report-info-section">
                            <h3 class="section-title">Class Details</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Teacher:</span>
                                    <span class="info-value">${extractFirstName(teacherName)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Teacher ID:</span>
                                    <span class="info-value">${document.getElementById('teacherId').value || '#N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Subject:</span>
                                    <span class="info-value">${subject}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Materials:</span>
                                    <span class="info-value">${document.getElementById('materials').value || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Current Lesson:</span>
                                    <span class="info-value">${currentLesson || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Homework:</span>
                                    <span class="info-value">${homework || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="report-ratings-skills-row">
                            <div class="report-ratings-section">
                                <h3 class="section-title">Class Participation</h3>
                                <div class="ratings-grid">
                                    <div class="rating-item">
                                        <span class="rating-label">Attention</span>
                                        <span class="rating-stars">${getStars(ratings.attention)}</span>
                                    </div>
                                    <div class="rating-item">
                                        <span class="rating-label">Retention</span>
                                        <span class="rating-stars">${getStars(ratings.retention)}</span>
                                    </div>
                                    <div class="rating-item">
                                        <span class="rating-label">Comprehension</span>
                                        <span class="rating-stars">${getStars(ratings.comprehension)}</span>
                                    </div>
                                    <div class="rating-item">
                                        <span class="rating-label">Cooperation</span>
                                        <span class="rating-stars">${getStars(ratings.cooperation)}</span>
                                    </div>
                                    <div class="rating-item">
                                        <span class="rating-label">Engagement</span>
                                        <span class="rating-stars">${getStars(ratings.engagement)}</span>
                                    </div>
                                    <div class="rating-item">
                                        <span class="rating-label">Conversation</span>
                                        <span class="rating-stars">${getStars(ratings.conversation)}</span>
                                    </div>
                                </div>
                            </div>
                            ${Object.keys(skills).length > 0 ? `
                            <div class="report-skills-section">
                                <h3 class="section-title">Subject Skills</h3>
                                <div class="skills-grid">
                                    ${Object.entries(skills).map(([name, score]) => `
                                    <div class="skill-row">
                                        <span class="skill-name">${name}</span>
                                        <span class="skill-score${score === 'NA' ? ' na' : ''}">${score === 'NA' ? 'N/A' : score + '/5'}</span>
                                    </div>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        <div class="report-comments-section">
                            <h3 class="section-title">Written Report</h3>
                            <div class="narrative-container">
                                <div class="narrative-text" id="narrativeDisplay">Generating narrative report...</div>
                                <textarea class="narrative-textarea hidden" id="narrativeTextarea"></textarea>
                                <div class="narrative-controls">
                                    <button class="edit-narrative-btn" id="editNarrativeBtn" onclick="editNarrative()">✏️ Edit Report</button>
                                    <button class="save-narrative-btn hidden" id="saveNarrativeBtn" onclick="saveNarrative()">💾 Save</button>
                                    <button class="revert-narrative-btn hidden" id="revertNarrativeBtn" onclick="revertNarrative()">↩️ Revert</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="report-actions">
                    <button class="download-button" onclick="downloadReportAsImage()">📸 Download as Image</button>
                </div>
            </div>
        `;
        
        reportOutput.innerHTML = reportHTML;
        reportOutput.classList.add('show');

        // Mark narrative as not ready yet
        window.narrativeReady = false;

        // Scroll to report
        reportOutput.scrollIntoView({ cooperation: 'smooth' });

        // Generate or enhance narrative with AI
        try {
            const response = await fetch('/api/generate-narrative', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const result = await response.json();
                const narrativeDisplay = document.getElementById('narrativeDisplay');
                const narrativeTextarea = document.getElementById('narrativeTextarea');

                // Highlight AI-identified positive and negative phrases in the narrative
                const highlightedNarrative = highlightSentimentAI(result.narrative, result.sentiment);

                narrativeDisplay.innerHTML = highlightedNarrative;
                narrativeTextarea.value = result.narrative;

                // Store original narrative for revert functionality
                window.originalNarrative = result.narrative;

                // Mark narrative as ready for download
                window.narrativeReady = true;

                // Clear auto-saved draft after successful submission
                clearFormDraft();
            } else {
                document.getElementById('narrativeDisplay').innerHTML = 'Failed to generate narrative report. Please try again.';
                window.narrativeReady = false;
            }
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('narrativeDisplay').innerHTML = 'Error connecting to report generator. Please ensure the server is running.';
            window.narrativeReady = false;
        }
    }

    // Narrative editing functions
    window.editNarrative = function() {
        const narrativeDisplay = document.getElementById('narrativeDisplay');
        const narrativeTextarea = document.getElementById('narrativeTextarea');
        const editBtn = document.getElementById('editNarrativeBtn');
        const saveBtn = document.getElementById('saveNarrativeBtn');
        const revertBtn = document.getElementById('revertNarrativeBtn');

        // Switch to edit mode
        narrativeDisplay.classList.add('hidden');
        narrativeTextarea.classList.remove('hidden');
        editBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
        revertBtn.classList.remove('hidden');

        narrativeTextarea.focus();
    };

    window.saveNarrative = function() {
        const narrativeDisplay = document.getElementById('narrativeDisplay');
        const narrativeTextarea = document.getElementById('narrativeTextarea');
        const editBtn = document.getElementById('editNarrativeBtn');
        const saveBtn = document.getElementById('saveNarrativeBtn');
        const revertBtn = document.getElementById('revertNarrativeBtn');

        // Save the edited text
        narrativeDisplay.innerHTML = narrativeTextarea.value;

        // Switch back to display mode
        narrativeDisplay.classList.remove('hidden');
        narrativeTextarea.classList.add('hidden');
        editBtn.classList.remove('hidden');
        saveBtn.classList.add('hidden');
        revertBtn.classList.add('hidden');
    };

    window.revertNarrative = function() {
        const narrativeDisplay = document.getElementById('narrativeDisplay');
        const narrativeTextarea = document.getElementById('narrativeTextarea');
        const editBtn = document.getElementById('editNarrativeBtn');
        const saveBtn = document.getElementById('saveNarrativeBtn');
        const revertBtn = document.getElementById('revertNarrativeBtn');

        // Revert to original AI-generated text
        narrativeTextarea.value = window.originalNarrative;
        narrativeDisplay.innerHTML = window.originalNarrative;

        // Switch back to display mode
        narrativeDisplay.classList.remove('hidden');
        narrativeTextarea.classList.add('hidden');
        editBtn.classList.remove('hidden');
        saveBtn.classList.add('hidden');
        revertBtn.classList.add('hidden');
    };
    
    function getStars(rating) {
        const num = parseInt(rating);
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= num) {
                stars += '<span style="color:#fbbf24;">★</span>';
            } else {
                stars += '<span style="color:#d1d5db;">★</span>';
            }
        }
        return stars;
    }

    
    // Make downloadReportAsImage available globally
    window.downloadReportAsImage = async function() {
        // Check if narrative is ready before allowing download
        if (!window.narrativeReady) {
            alert('⏳ Please wait for the AI-generated written report to fully load before downloading.\n\nThe report is still being generated...');
            return;
        }

        try {
            const reportElement = document.querySelector('.report-card');
            if (!reportElement) {
                alert('No report found to download');
                return;
            }

            // Hide the action buttons and edit controls temporarily
            const actionsElement = reportElement.querySelector('.report-actions');
            if (actionsElement) {
                actionsElement.style.display = 'none';
            }
            const narrativeControls = reportElement.querySelector('.narrative-controls');
            if (narrativeControls) {
                narrativeControls.style.display = 'none';
            }

            // Store original styles
            const originalOverflow = reportElement.style.overflow;
            const originalWidth = reportElement.style.width;

            // Set fixed width and hide overflow to prevent edge issues
            reportElement.style.overflow = 'hidden';
            reportElement.style.width = reportElement.offsetWidth + 'px';

            // Force a reflow to ensure proper sizing
            reportElement.offsetHeight;

            // Generate canvas with better settings
            const canvas = await html2canvas(reportElement, {
                backgroundColor: '#ffffff',
                scale: 3,
                useCORS: true,
                allowTaint: true,
                logging: false,
                scrollX: 0,
                scrollY: -window.scrollY,
                windowWidth: document.documentElement.offsetWidth,
                windowHeight: document.documentElement.offsetHeight,
                width: reportElement.offsetWidth,
                height: reportElement.offsetHeight
            });

            // Restore original styles
            reportElement.style.overflow = originalOverflow;
            reportElement.style.width = originalWidth;
            
            // Show the action buttons and edit controls again
            if (actionsElement) {
                actionsElement.style.display = 'block';
            }
            if (narrativeControls) {
                narrativeControls.style.display = '';
            }
            
            // Create download link
            const link = document.createElement('a');
            const studentName = document.getElementById('studentName').value.replace(/\s+/g, '-') || 'student';
            const today = new Date().toISOString().split('T')[0];
            link.download = `ican-stellar-report-${studentName}-${today}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
        } catch (error) {
            console.error('Error generating image:', error);
            alert('Error generating report image. Please try again.');
        }
    };
});