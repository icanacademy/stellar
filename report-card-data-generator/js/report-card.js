document.addEventListener('DOMContentLoaded', async function () {
    const studentSelect = document.getElementById('studentSelect');
    const generateBtn = document.getElementById('generateBtn');
    const printBtn = document.getElementById('printBtn');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const reportCard = document.getElementById('reportCard');

    // Report card elements
    const rcStudentName = document.getElementById('rcStudentName');
    const rcGradeLevel = document.getElementById('rcGradeLevel');
    const rcDuration = document.getElementById('rcDuration');
    const gradeTableHeader = document.getElementById('gradeTableHeader');
    const gradeTableBody = document.getElementById('gradeTableBody');
    const narrativesContainer = document.getElementById('narrativesContainer');
    const dateRangeGroup = document.getElementById('dateRangeGroup');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const aeSection = document.getElementById('aeSection');
    const aeContainer = document.getElementById('aeContainer');
    const narrativesActions = document.getElementById('narrativesActions');
    const generateNarrativesBtn = document.getElementById('generateNarrativesBtn');

    var AE_DOMAINS = [
        { number: 'I', name: 'Study Habits' },
        { number: 'II', name: 'Organization' },
        { number: 'III', name: 'Homework Accomplishment' },
        { number: 'IV', name: 'Cooperative Learning Skill' },
        { number: 'V', name: 'Independent Seat Work' },
        { number: 'VI', name: 'Motivation' }
    ];

    let currentData = null;

    // Frontend cache: keyed by "student|from|to" → { data, narratives: { subjectSlug: analysisObj } }
    var reportCache = {};

    // Tracks deactivated subject rows (by name, or '__vocab__' for Integrated Vocabulary)
    var deactivatedSubjects = new Set();

    // Load students and set up shared nav
    await loadStudents(studentSelect);
    setActiveNav();
    updateNavLinks(studentSelect.value);

    studentSelect.addEventListener('change', function () {
        updateNavLinks(studentSelect.value);
        onStudentChange();
    });
    generateBtn.addEventListener('click', onGenerateClick);
    printBtn.addEventListener('click', function () { window.print(); });
    generateNarrativesBtn.addEventListener('click', function () {
        narrativesActions.style.display = 'none';
        renderNarrativePlaceholders(currentData.subjects);
        loadNarratives(studentSelect.value, currentData.subjects, getCacheKey());
    });

    // Academic Enabler toggle
    var aeToggle = document.getElementById('aeToggle');
    aeToggle.addEventListener('change', function () {
        if (aeToggle.checked) {
            deactivatedSubjects.delete('__ae__');
        } else {
            deactivatedSubjects.add('__ae__');
        }
        aeSection.classList.toggle('rc-row-deactivated', !aeToggle.checked);
    });

    // Restore student from URL param (after listeners are attached)
    restoreStudentFromURL(studentSelect);

    function getCacheKey() {
        return studentSelect.value + '|' + dateFrom.value + '|' + dateTo.value;
    }

    async function onStudentChange() {
        deactivatedSubjects.clear();
        var student = studentSelect.value;
        if (!student) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generate';
            dateRangeGroup.style.display = 'none';
            reportCard.style.display = 'none';
            printBtn.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch date range for this student and populate pickers
        try {
            var res = await fetch('/api/student-date-range?student=' + encodeURIComponent(student));
            if (res.ok) {
                var range = await res.json();
                dateFrom.value = range.min;
                dateTo.value = range.max;
                dateRangeGroup.style.display = 'flex';
            }
        } catch (err) {
            console.error('Error fetching date range:', err);
        }

        // If we have a cache for this exact student+date combo, show it immediately
        var key = getCacheKey();
        if (reportCache[key]) {
            showCachedReport(key);
            generateBtn.disabled = false;
            generateBtn.textContent = 'Regenerate';
        } else {
            reportCard.style.display = 'none';
            printBtn.style.display = 'none';
            emptyState.style.display = 'block';
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate';
        }
    }

    function onGenerateClick() {
        var student = studentSelect.value;
        if (!student) return;

        var key = getCacheKey();
        // If cached, clear cache and fetch fresh
        if (reportCache[key]) {
            delete reportCache[key];
        }
        deactivatedSubjects.clear();
        generateReportCard(student, dateFrom.value, dateTo.value, key);
    }

    function showCachedReport(cacheKey) {
        var cached = reportCache[cacheKey];
        if (!cached) return;

        currentData = cached.data;
        emptyState.style.display = 'none';
        loadingState.style.display = 'none';

        renderHeader(currentData);
        renderGradeTable(currentData);
        renderGradeChart(currentData);

        // Render narratives from cache if available, otherwise show generate button
        var hasNarratives = Object.keys(cached.narratives).length > 0;
        if (hasNarratives) {
            narrativesActions.style.display = 'none';
            renderNarrativesFromCache(currentData.subjects, cached.narratives);
        } else {
            showNarrativeButton();
        }

        reportCard.style.display = 'block';
        printBtn.style.display = 'inline-block';

        if (currentData.weeks.length > 8) {
            reportCard.classList.add('landscape-mode');
        } else {
            reportCard.classList.remove('landscape-mode');
        }

        fetchAndRenderAE();
        fetchAndRenderRA();
    }

    function renderNarrativesFromCache(subjects, narrativeCache) {
        narrativesContainer.innerHTML = '';
        subjects.forEach(function (subj) {
            var card = document.createElement('div');
            card.className = 'narrative-card';
            if (deactivatedSubjects.has(subj.name)) card.classList.add('rc-row-deactivated');
            card.id = 'narrative-' + slugify(subj.name);

            var headerHtml =
                '<div class="narrative-card-header">' +
                    '<h4>' + escapeHtml(subj.name) + '</h4>' +
                    '<span class="narrative-teacher">Teacher: ' + escapeHtml(subj.teacher) + '</span>' +
                '</div>';

            var slug = slugify(subj.name);
            var cached = narrativeCache[slug];

            if (cached && cached.status === 'done') {
                card.innerHTML = headerHtml + buildNarrativeHtml(cached.analysis);
            } else if (cached && cached.status === 'error') {
                card.innerHTML = headerHtml +
                    '<div class="narrative-error">Unable to generate analysis for this subject.</div>';
            } else {
                // Still loading or never started — show as completed placeholder
                card.innerHTML = headerHtml +
                    '<div class="narrative-loading">' +
                        '<div class="mini-spinner"></div>' +
                        '<p>Generating AI analysis...</p>' +
                    '</div>';
            }

            narrativesContainer.appendChild(card);
        });
    }

    async function generateReportCard(student, from, to, cacheKey) {
        // Show loading
        emptyState.style.display = 'none';
        reportCard.style.display = 'none';
        printBtn.style.display = 'none';
        loadingState.style.display = 'block';
        generateBtn.disabled = true;

        try {
            var url = '/api/full-report-card?student=' + encodeURIComponent(student);
            if (from) url += '&from=' + encodeURIComponent(from);
            if (to) url += '&to=' + encodeURIComponent(to);

            var res = await fetch(url);
            if (!res.ok) throw new Error('Failed to generate report card');
            currentData = await res.json();

            // Initialize cache entry
            reportCache[cacheKey] = { data: currentData, narratives: {} };

            renderHeader(currentData);
            renderGradeTable(currentData);
            renderGradeChart(currentData);
            showNarrativeButton();

            // Show report card
            loadingState.style.display = 'none';
            reportCard.style.display = 'block';
            printBtn.style.display = 'inline-block';
            generateBtn.disabled = false;
            generateBtn.textContent = 'Regenerate';

            // Toggle landscape mode for many weeks
            if (currentData.weeks.length > 8) {
                reportCard.classList.add('landscape-mode');
            } else {
                reportCard.classList.remove('landscape-mode');
            }

            // Fetch Academic Enabler data
            fetchAndRenderAE();
            fetchAndRenderRA();
        } catch (err) {
            console.error('Error generating report card:', err);
            loadingState.style.display = 'none';
            emptyState.style.display = 'block';
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate';
            alert('Error generating report card: ' + err.message);
        }
    }

    function renderHeader(data) {
        rcStudentName.textContent = data.student;
        rcGradeLevel.textContent = data.gradeLevel;
        rcDuration.textContent = data.duration.fromFormatted + ' - ' + data.duration.toFormatted;

        // Set year from duration end date
        var year = data.duration.to ? new Date(data.duration.to).getFullYear() : new Date().getFullYear();
        document.getElementById('rcYear').textContent = year;

        // Set certificate name
        document.getElementById('rcCertName').textContent = data.student;
    }

    function renderGradeTable(data) {
        // Build header: [Toggle] | Subject | Teacher | Week 1..N | Average
        gradeTableHeader.innerHTML = '';

        var thToggle = document.createElement('th');
        thToggle.className = 'rc-toggle-col no-print';
        gradeTableHeader.appendChild(thToggle);

        var thSubject = document.createElement('th');
        thSubject.className = 'rc-subject-col';
        thSubject.textContent = 'Subject';
        gradeTableHeader.appendChild(thSubject);

        var thTeacher = document.createElement('th');
        thTeacher.className = 'rc-teacher-col';
        thTeacher.textContent = 'Teacher';
        gradeTableHeader.appendChild(thTeacher);

        data.weeks.forEach(function (w) {
            var th = document.createElement('th');
            th.textContent = w.label;
            th.title = w.startDate + ' to ' + w.endDate;
            gradeTableHeader.appendChild(th);
        });

        var thAvg = document.createElement('th');
        thAvg.className = 'rc-avg-col';
        thAvg.textContent = 'Average';
        gradeTableHeader.appendChild(thAvg);

        // Build body rows
        gradeTableBody.innerHTML = '';

        // Subject rows
        data.subjects.forEach(function (subj) {
            var tr = document.createElement('tr');
            if (deactivatedSubjects.has(subj.name)) tr.classList.add('rc-row-deactivated');

            // Toggle cell
            var tdToggle = document.createElement('td');
            tdToggle.className = 'rc-toggle-cell no-print';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !deactivatedSubjects.has(subj.name);
            cb.className = 'rc-row-toggle';
            cb.addEventListener('change', function () {
                if (cb.checked) {
                    deactivatedSubjects.delete(subj.name);
                } else {
                    deactivatedSubjects.add(subj.name);
                }
                tr.classList.toggle('rc-row-deactivated', !cb.checked);
                var narrativeCard = document.getElementById('narrative-' + slugify(subj.name));
                if (narrativeCard) narrativeCard.classList.toggle('rc-row-deactivated', !cb.checked);
                recalcGeneralAvg(data);
                renderGradeChart(data);
            });
            tdToggle.appendChild(cb);
            tr.appendChild(tdToggle);

            // Subject name
            var tdName = document.createElement('td');
            tdName.className = 'rc-subject-cell';
            tdName.textContent = subj.name;
            tr.appendChild(tdName);

            // Teacher
            var tdTeacher = document.createElement('td');
            tdTeacher.className = 'rc-teacher-cell';
            tdTeacher.textContent = subj.teacher;
            tr.appendChild(tdTeacher);

            // Weekly grades (click to edit)
            var avgRef = { td: null };
            data.weeks.forEach(function (w) {
                var td = document.createElement('td');
                var grade = subj.weeklyGrades[w.number];
                if (grade) {
                    td.className = 'grade-cell-bg grade-bg-' + grade.letterGrade;
                    td.innerHTML = '<div class="grade-cell">' +
                        '<span class="grade-letter grade-' + grade.letterGrade + '">' + grade.letterGrade + '</span>' +
                        '<span class="grade-pct">' + grade.percentage + '%</span>' +
                        '</div>';
                } else {
                    td.innerHTML = '<span class="grade-empty">-</span>';
                }
                makeGradeCellEditable(td,
                    function() { return subj.weeklyGrades[w.number]; },
                    function(g) { if (g) subj.weeklyGrades[w.number] = g; else delete subj.weeklyGrades[w.number]; },
                    function() { recalcSubjectAvgAndRender(subj, data, avgRef.td); recalcGeneralAvg(data); }
                );
                tr.appendChild(td);
            });

            // Average
            var tdAvg = document.createElement('td');
            if (subj.average) {
                tdAvg.className = 'grade-cell-bg grade-bg-' + subj.average.letterGrade;
                tdAvg.innerHTML = '<div class="grade-cell">' +
                    '<span class="grade-letter grade-' + subj.average.letterGrade + '">' + subj.average.letterGrade + '</span>' +
                    '<span class="grade-pct">' + subj.average.percentage + '%</span>' +
                    '</div>';
            } else {
                tdAvg.innerHTML = '<span class="grade-empty">-</span>';
            }
            avgRef.td = tdAvg;
            tr.appendChild(tdAvg);

            gradeTableBody.appendChild(tr);
        });

        // Integrated Vocabulary row
        var vocabRow = document.createElement('tr');
        vocabRow.className = 'rc-vocab-row';
        if (deactivatedSubjects.has('__vocab__')) vocabRow.classList.add('rc-row-deactivated');

        // Vocab toggle
        var tdVocabToggle = document.createElement('td');
        tdVocabToggle.className = 'rc-toggle-cell no-print';
        var vocabCb = document.createElement('input');
        vocabCb.type = 'checkbox';
        vocabCb.checked = !deactivatedSubjects.has('__vocab__');
        vocabCb.className = 'rc-row-toggle';
        vocabCb.addEventListener('change', function () {
            if (vocabCb.checked) {
                deactivatedSubjects.delete('__vocab__');
            } else {
                deactivatedSubjects.add('__vocab__');
            }
            vocabRow.classList.toggle('rc-row-deactivated', !vocabCb.checked);
            recalcGeneralAvg(data);
            renderGradeChart(data);
        });
        tdVocabToggle.appendChild(vocabCb);
        vocabRow.appendChild(tdVocabToggle);

        var tdVocabName = document.createElement('td');
        tdVocabName.className = 'rc-subject-cell';
        tdVocabName.textContent = 'Integrated Vocabulary';
        vocabRow.appendChild(tdVocabName);

        var tdVocabTeacher = document.createElement('td');
        tdVocabTeacher.className = 'rc-teacher-cell';
        tdVocabTeacher.textContent = 'All';
        vocabRow.appendChild(tdVocabTeacher);

        var vocabAvgRef = { td: null };
        data.weeks.forEach(function (w) {
            var td = document.createElement('td');
            var grade = data.integratedVocabulary.weeklyGrades[w.number];
            if (grade) {
                td.className = 'grade-cell-bg grade-bg-' + grade.letterGrade;
                td.innerHTML = '<div class="grade-cell">' +
                    '<span class="grade-letter grade-' + grade.letterGrade + '">' + grade.letterGrade + '</span>' +
                    '<span class="grade-pct">' + grade.percentage + '%</span>' +
                    '</div>';
            } else {
                td.innerHTML = '<span class="grade-empty">-</span>';
            }
            makeGradeCellEditable(td,
                function() { return data.integratedVocabulary.weeklyGrades[w.number]; },
                function(g) { if (g) data.integratedVocabulary.weeklyGrades[w.number] = g; else delete data.integratedVocabulary.weeklyGrades[w.number]; },
                function() { recalcVocabAvgAndRender(data, vocabAvgRef.td); recalcGeneralAvg(data); }
            );
            vocabRow.appendChild(td);
        });

        // Vocab average
        var tdVocabAvg = document.createElement('td');
        if (data.integratedVocabulary.average) {
            var avg = data.integratedVocabulary.average;
            tdVocabAvg.className = 'grade-cell-bg grade-bg-' + avg.letterGrade;
            tdVocabAvg.innerHTML = '<div class="grade-cell">' +
                '<span class="grade-letter grade-' + avg.letterGrade + '">' + avg.letterGrade + '</span>' +
                '<span class="grade-pct">' + avg.percentage + '%</span>' +
                '</div>';
        } else {
            tdVocabAvg.innerHTML = '<span class="grade-empty">-</span>';
        }
        vocabAvgRef.td = tdVocabAvg;
        vocabRow.appendChild(tdVocabAvg);

        gradeTableBody.appendChild(vocabRow);

        // General Average row
        var genAvgRow = document.createElement('tr');
        genAvgRow.className = 'rc-general-avg-row';
        genAvgRow.id = 'generalAvgRow';

        var tdGenToggle = document.createElement('td');
        tdGenToggle.className = 'no-print';
        genAvgRow.appendChild(tdGenToggle);

        var tdGenLabel = document.createElement('td');
        tdGenLabel.setAttribute('colspan', '2');
        tdGenLabel.innerHTML = '<strong>General Average</strong>';
        genAvgRow.appendChild(tdGenLabel);

        data.weeks.forEach(function (w) {
            var td = document.createElement('td');
            td.className = 'rc-gen-avg-week';
            td.dataset.week = w.number;
            genAvgRow.appendChild(td);
        });

        var tdGenAvg = document.createElement('td');
        tdGenAvg.id = 'generalAvgCell';
        genAvgRow.appendChild(tdGenAvg);

        gradeTableBody.appendChild(genAvgRow);

        recalcGeneralAvg(data);
    }

    function recalcGeneralAvg(data) {
        // Overall average
        var totalPct = 0, count = 0;

        data.subjects.forEach(function (subj) {
            if (!deactivatedSubjects.has(subj.name) && subj.average) {
                totalPct += subj.average.percentage;
                count++;
            }
        });

        if (!deactivatedSubjects.has('__vocab__') && data.integratedVocabulary && data.integratedVocabulary.average) {
            totalPct += data.integratedVocabulary.average.percentage;
            count++;
        }

        var genAvgCell = document.getElementById('generalAvgCell');
        if (count > 0) {
            var avg = Math.round(totalPct / count * 10) / 10;
            var letter = getLetterGrade(avg);
            genAvgCell.className = 'grade-cell-bg grade-bg-' + letter;
            genAvgCell.innerHTML = '<div class="grade-cell">' +
                '<span class="grade-letter grade-' + letter + '">' + letter + '</span>' +
                '<span class="grade-pct">' + avg + '%</span>' +
                '</div>';
        } else {
            genAvgCell.className = '';
            genAvgCell.innerHTML = '<span class="grade-empty">-</span>';
        }

        // Per-week averages
        data.weeks.forEach(function (w) {
            var weekTotal = 0, weekCount = 0;

            data.subjects.forEach(function (subj) {
                if (!deactivatedSubjects.has(subj.name) && subj.weeklyGrades[w.number]) {
                    weekTotal += subj.weeklyGrades[w.number].percentage;
                    weekCount++;
                }
            });

            if (!deactivatedSubjects.has('__vocab__') && data.integratedVocabulary && data.integratedVocabulary.weeklyGrades[w.number]) {
                weekTotal += data.integratedVocabulary.weeklyGrades[w.number].percentage;
                weekCount++;
            }

            var weekCell = document.querySelector('#generalAvgRow td[data-week="' + w.number + '"]');
            if (weekCell) {
                if (weekCount > 0) {
                    var weekAvg = Math.round(weekTotal / weekCount * 10) / 10;
                    var wLetter = getLetterGrade(weekAvg);
                    weekCell.className = 'rc-gen-avg-week grade-cell-bg grade-bg-' + wLetter;
                    weekCell.innerHTML = '<div class="grade-cell">' +
                        '<span class="grade-letter grade-' + wLetter + '">' + wLetter + '</span>' +
                        '<span class="grade-pct">' + weekAvg + '%</span>' +
                        '</div>';
                } else {
                    weekCell.className = 'rc-gen-avg-week';
                    weekCell.innerHTML = '<span class="grade-empty">-</span>';
                }
            }
        });
    }

    function getLetterGrade(pct) {
        if (pct >= 90) return 'A';
        if (pct >= 85) return 'P';
        if (pct >= 80) return 'AP';
        if (pct >= 75) return 'D';
        return 'B';
    }

    // -- Inline score editing helpers --

    function updateGradeCell(td, grade, isOverridden) {
        td.className = 'rc-editable';
        if (grade) {
            td.classList.add('grade-cell-bg', 'grade-bg-' + grade.letterGrade);
            if (isOverridden) td.classList.add('rc-overridden');
            td.innerHTML = '<div class="grade-cell">' +
                '<span class="grade-letter grade-' + grade.letterGrade + '">' + grade.letterGrade + '</span>' +
                '<span class="grade-pct">' + grade.percentage + '%</span>' +
                '</div>';
        } else {
            td.innerHTML = '<span class="grade-empty">-</span>';
        }
    }

    function makeGradeCellEditable(td, getGradeFn, setGradeFn, afterCommitFn) {
        // Snapshot the original computed grade so we can restore it later
        var orig = getGradeFn();
        var originalGrade = orig ? { percentage: orig.percentage, letterGrade: orig.letterGrade } : null;

        function isOverridden(grade) {
            if (grade && originalGrade) return grade.percentage !== originalGrade.percentage;
            if (grade || originalGrade) return true;
            return false;
        }

        function renderCell(grade) {
            var overridden = isOverridden(grade);
            updateGradeCell(td, grade, overridden);
            if (overridden) appendResetBtn();
        }

        function appendResetBtn() {
            var btn = document.createElement('button');
            btn.className = 'rc-reset-btn no-print';
            btn.title = 'Reset to original' + (originalGrade ? ' (' + originalGrade.percentage + '%)' : '');
            btn.innerHTML = '&times;';
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var restored = originalGrade ? { percentage: originalGrade.percentage, letterGrade: originalGrade.letterGrade } : null;
                setGradeFn(restored);
                updateGradeCell(td, originalGrade, false);
                afterCommitFn();
            });
            td.appendChild(btn);
        }

        td.classList.add('rc-editable');
        td.addEventListener('click', function(e) {
            if (e.target.closest('.rc-reset-btn')) return;
            if (td.querySelector('.rc-edit-input')) return;

            var currentGrade = getGradeFn();
            var input = document.createElement('input');
            input.type = 'number';
            input.className = 'rc-edit-input';
            input.min = 0;
            input.max = 100;
            input.step = 0.1;
            input.value = currentGrade ? currentGrade.percentage : '';

            td.innerHTML = '';
            td.className = 'rc-editing';
            td.appendChild(input);
            input.focus();
            input.select();

            var committed = false;

            function commit() {
                if (committed) return;
                committed = true;

                var val = parseFloat(input.value);
                if (input.value.trim() !== '' && !isNaN(val) && val >= 0 && val <= 100) {
                    var rounded = Math.round(val * 10) / 10;
                    var letter = getLetterGrade(rounded);
                    setGradeFn({ percentage: rounded, letterGrade: letter });
                } else if (input.value.trim() === '') {
                    setGradeFn(null);
                }
                // Invalid input: data unchanged, just re-render current state
                renderCell(getGradeFn());
                afterCommitFn();
            }

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') {
                    committed = true;
                    renderCell(getGradeFn());
                }
            });
        });
    }

    function recalcSubjectAvgAndRender(subj, data, avgTd) {
        var total = 0, count = 0;
        data.weeks.forEach(function(w) {
            var g = subj.weeklyGrades[w.number];
            if (g) { total += g.percentage; count++; }
        });
        if (count > 0) {
            var avg = Math.round(total / count * 10) / 10;
            subj.average = { percentage: avg, letterGrade: getLetterGrade(avg) };
        } else {
            subj.average = null;
        }
        if (avgTd) {
            avgTd.className = '';
            if (subj.average) {
                avgTd.className = 'grade-cell-bg grade-bg-' + subj.average.letterGrade;
                avgTd.innerHTML = '<div class="grade-cell">' +
                    '<span class="grade-letter grade-' + subj.average.letterGrade + '">' + subj.average.letterGrade + '</span>' +
                    '<span class="grade-pct">' + subj.average.percentage + '%</span>' +
                    '</div>';
            } else {
                avgTd.innerHTML = '<span class="grade-empty">-</span>';
            }
        }
    }

    function recalcVocabAvgAndRender(data, avgTd) {
        var total = 0, count = 0;
        data.weeks.forEach(function(w) {
            var g = data.integratedVocabulary.weeklyGrades[w.number];
            if (g) { total += g.percentage; count++; }
        });
        if (count > 0) {
            var avg = Math.round(total / count * 10) / 10;
            data.integratedVocabulary.average = { percentage: avg, letterGrade: getLetterGrade(avg) };
        } else {
            data.integratedVocabulary.average = null;
        }
        if (avgTd) {
            avgTd.className = '';
            if (data.integratedVocabulary.average) {
                var a = data.integratedVocabulary.average;
                avgTd.className = 'grade-cell-bg grade-bg-' + a.letterGrade;
                avgTd.innerHTML = '<div class="grade-cell">' +
                    '<span class="grade-letter grade-' + a.letterGrade + '">' + a.letterGrade + '</span>' +
                    '<span class="grade-pct">' + a.percentage + '%</span>' +
                    '</div>';
            } else {
                avgTd.innerHTML = '<span class="grade-empty">-</span>';
            }
        }
    }

    function renderNarrativePlaceholders(subjects) {
        narrativesContainer.innerHTML = '';
        subjects.forEach(function (subj) {
            var card = document.createElement('div');
            card.className = 'narrative-card';
            if (deactivatedSubjects.has(subj.name)) card.classList.add('rc-row-deactivated');
            card.id = 'narrative-' + slugify(subj.name);

            card.innerHTML =
                '<div class="narrative-card-header">' +
                    '<h4>' + escapeHtml(subj.name) + '</h4>' +
                    '<span class="narrative-teacher">Teacher: ' + escapeHtml(subj.teacher) + '</span>' +
                '</div>' +
                '<div class="narrative-loading">' +
                    '<div class="mini-spinner"></div>' +
                    '<p>Generating AI analysis...</p>' +
                '</div>';

            narrativesContainer.appendChild(card);
        });
    }

    async function loadNarratives(student, subjects, cacheKey) {
        // Process with max 3 concurrent requests
        var queue = subjects.slice();
        var active = 0;
        var maxConcurrent = 3;

        function processNext() {
            while (active < maxConcurrent && queue.length > 0) {
                var subj = queue.shift();
                active++;
                fetchNarrative(student, subj.name, cacheKey).then(function () {
                    active--;
                    processNext();
                });
            }
        }

        processNext();
    }

    async function fetchNarrative(student, subjectName, cacheKey) {
        var cardId = 'narrative-' + slugify(subjectName);
        var card = document.getElementById(cardId);
        if (!card) return;

        var slug = slugify(subjectName);

        try {
            var res = await fetch('/api/ai-analysis?student=' + encodeURIComponent(student) + '&subject=' + encodeURIComponent(subjectName));
            if (!res.ok) throw new Error('Failed');
            var result = await res.json();

            // Cache the narrative
            if (reportCache[cacheKey]) {
                reportCache[cacheKey].narratives[slug] = { status: 'done', analysis: result.analysis };
            }

            renderNarrative(card, result.analysis);
        } catch (err) {
            console.error('AI analysis error for ' + subjectName + ':', err);

            // Cache the error too so we don't retry on re-view
            if (reportCache[cacheKey]) {
                reportCache[cacheKey].narratives[slug] = { status: 'error' };
            }

            var loading = card.querySelector('.narrative-loading');
            if (loading) {
                loading.outerHTML = '<div class="narrative-error">Unable to generate analysis for this subject.</div>';
            }
        }
    }

    function buildNarrativeHtml(analysis) {
        return '<div class="narrative-subsection strengths">' +
                '<h5>Strengths</h5>' +
                formatParagraphs(analysis.strengths) +
            '</div>' +
            '<div class="narrative-subsection improvements">' +
                '<h5>Points for Improvement</h5>' +
                formatParagraphs(analysis.improvements) +
            '</div>' +
            '<div class="narrative-subsection recommendations">' +
                '<h5>Recommendations</h5>' +
                formatParagraphs(analysis.recommendations) +
            '</div>';
    }

    function renderNarrative(card, analysis) {
        var loading = card.querySelector('.narrative-loading');
        if (!loading) return;
        loading.outerHTML = buildNarrativeHtml(analysis);
    }

    function formatParagraphs(text) {
        if (!text) return '<p>No data available.</p>';
        var paragraphs = text.split('\n\n').filter(function (p) { return p.trim(); });
        if (paragraphs.length === 0) return '<p>No data available.</p>';
        return paragraphs.map(function (p) { return '<p>' + escapeHtml(p.trim()) + '</p>'; }).join('');
    }

    function slugify(str) {
        return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showNarrativeButton() {
        narrativesActions.style.display = 'block';
        narrativesContainer.innerHTML = '';
    }

    // ── ICAN Reading Assessment integration ──
    var raSection = document.getElementById('raSection');
    var raContainer = document.getElementById('raContainer');
    var raToggle = document.getElementById('raToggle');
    var currentRA = null;
    var raSaveTimer = null;

    raToggle.addEventListener('change', function () {
        if (raToggle.checked) {
            deactivatedSubjects.delete('__ra__');
        } else {
            deactivatedSubjects.add('__ra__');
        }
        raSection.classList.toggle('rc-row-deactivated', !raToggle.checked);
    });

    var RA_METRICS = [
        { key: 'readingLevel', title: 'Reading Comprehension Level', icon: '📖', inputType: 'number', unit: '', hasProgressBar: false },
        { key: 'readingProgress', title: 'Reading Comprehension Progress', icon: '📊', inputType: 'number', unit: '%', hasProgressBar: true },
        { key: 'gbwt', title: 'Grade Basic Word Test', icon: '📝', inputType: 'text', unit: '', hasProgressBar: false },
        { key: 'readingSpeed', title: 'Reading Speed Rate', icon: '⚡', inputType: 'number', unit: ' WPM', hasProgressBar: false }
    ];

    async function fetchAndRenderRA() {
        raSection.style.display = 'none';
        try {
            var res = await fetch('/api/reading-assessment');
            if (!res.ok) throw new Error('Failed to fetch RA data');
            var allEntries = await res.json();

            var studentName = currentData.student;
            var rcFrom = dateFrom.value;
            var rcTo = dateTo.value;

            var matched = allEntries.filter(function (e) {
                if (!e.student.toLowerCase().startsWith(studentName.toLowerCase())) return false;
                var parts = e.season.split('_');
                var seasonFrom = parts[0];
                var seasonTo = parts[1];
                return seasonFrom <= rcTo && seasonTo >= rcFrom;
            });

            if (matched.length > 0) {
                currentRA = matched[0];
            } else {
                // Create new empty entry
                var season = rcFrom + '_' + rcTo;
                var body = {
                    student: studentName,
                    season: season,
                    readingLevel: { initial: null, final: null },
                    readingProgress: { initial: null, final: null },
                    gbwt: { initial: '', final: '' },
                    readingSpeed: { initial: null, final: null }
                };
                var createRes = await fetch('/api/reading-assessment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!createRes.ok) throw new Error('Failed to create RA entry');
                currentRA = await createRes.json();
            }

            renderRACards(currentRA);
            raSection.style.display = '';
            raToggle.checked = !deactivatedSubjects.has('__ra__');
            raSection.classList.toggle('rc-row-deactivated', deactivatedSubjects.has('__ra__'));
        } catch (err) {
            console.error('Error fetching RA data:', err);
        }
    }

    function renderRACards(entry) {
        raContainer.innerHTML = '';
        RA_METRICS.forEach(function (metric) {
            var data = entry[metric.key] || { initial: null, final: null };

            var card = document.createElement('div');
            card.className = 'rc-ra-card';

            // Icon
            var iconDiv = document.createElement('div');
            iconDiv.className = 'rc-ra-card-icon';
            iconDiv.textContent = metric.icon;
            card.appendChild(iconDiv);

            // Content
            var content = document.createElement('div');
            content.className = 'rc-ra-card-content';

            var title = document.createElement('div');
            title.className = 'rc-ra-card-title';
            title.textContent = metric.title;
            content.appendChild(title);

            var valuesRow = document.createElement('div');
            valuesRow.className = 'rc-ra-card-values';

            // Initial group
            var initialGroup = document.createElement('div');
            initialGroup.className = 'rc-ra-value-group';
            var initialLabel = document.createElement('div');
            initialLabel.className = 'rc-ra-label';
            initialLabel.textContent = 'Initial';
            var initialVal = document.createElement('div');
            initialVal.className = 'rc-ra-value';
            initialVal.textContent = formatRAValue(data.initial, metric);
            initialGroup.appendChild(initialVal);
            initialGroup.appendChild(initialLabel);
            if (metric.hasProgressBar) {
                var iProg = document.createElement('div');
                iProg.className = 'rc-ra-progress-bar';
                iProg.innerHTML = '<div class="rc-ra-progress-fill" style="width:' + (parseFloat(data.initial) || 0) + '%"></div>';
                initialGroup.appendChild(iProg);
            }
            makeRAValueEditable(initialVal, metric, 'initial', entry);
            valuesRow.appendChild(initialGroup);

            // Arrow
            var arrow = document.createElement('div');
            arrow.className = 'rc-ra-arrow';
            arrow.textContent = '→';
            valuesRow.appendChild(arrow);

            // Final group
            var finalGroup = document.createElement('div');
            finalGroup.className = 'rc-ra-value-group';
            var finalLabel = document.createElement('div');
            finalLabel.className = 'rc-ra-label';
            finalLabel.textContent = 'Final';
            var finalVal = document.createElement('div');
            finalVal.className = 'rc-ra-value';
            finalVal.textContent = formatRAValue(data.final, metric);
            finalGroup.appendChild(finalVal);
            finalGroup.appendChild(finalLabel);
            if (metric.hasProgressBar) {
                var fProg = document.createElement('div');
                fProg.className = 'rc-ra-progress-bar';
                fProg.innerHTML = '<div class="rc-ra-progress-fill" style="width:' + (parseFloat(data.final) || 0) + '%"></div>';
                finalGroup.appendChild(fProg);
            }
            makeRAValueEditable(finalVal, metric, 'final', entry);
            valuesRow.appendChild(finalGroup);

            content.appendChild(valuesRow);
            card.appendChild(content);
            raContainer.appendChild(card);
        });
    }

    function formatRAValue(val, metric) {
        if (val === null || val === undefined || val === '') return '--';
        return val + metric.unit;
    }

    function makeRAValueEditable(el, metric, phase, entry) {
        el.addEventListener('click', function () {
            if (el.querySelector('.rc-ra-edit-input')) return;

            var currentVal = entry[metric.key] ? entry[metric.key][phase] : null;
            var input = document.createElement('input');
            input.type = metric.inputType;
            input.className = 'rc-ra-edit-input';
            if (metric.inputType === 'number') {
                input.min = 0;
                input.step = 1;
            }
            input.value = (currentVal !== null && currentVal !== undefined) ? currentVal : '';

            el.textContent = '';
            el.appendChild(input);
            input.focus();
            input.select();

            var committed = false;

            function commit() {
                if (committed) return;
                committed = true;

                if (!entry[metric.key]) {
                    entry[metric.key] = { initial: null, final: null };
                }

                if (metric.inputType === 'number') {
                    var num = parseFloat(input.value);
                    entry[metric.key][phase] = (input.value.trim() !== '' && !isNaN(num)) ? num : null;
                } else {
                    entry[metric.key][phase] = input.value.trim();
                }

                el.textContent = formatRAValue(entry[metric.key][phase], metric);

                // Update progress bar if applicable
                if (metric.hasProgressBar) {
                    var group = el.closest('.rc-ra-value-group');
                    if (group) {
                        var fill = group.querySelector('.rc-ra-progress-fill');
                        if (fill) {
                            fill.style.width = (parseFloat(entry[metric.key][phase]) || 0) + '%';
                        }
                    }
                }

                saveRA(entry);
            }

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') {
                    committed = true;
                    el.textContent = formatRAValue(entry[metric.key] ? entry[metric.key][phase] : null, metric);
                }
            });
        });
    }

    function saveRA(entry) {
        if (raSaveTimer) clearTimeout(raSaveTimer);
        raSaveTimer = setTimeout(function () {
            fetch('/api/reading-assessment/' + entry.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            }).catch(function (err) {
                console.error('Error saving RA:', err);
            });
        }, 500);
    }

    // ── Grade Visual Report Chart ──

    var SUBJECT_COLORS = [
        '#00b894',  // green
        '#fdcb6e',  // yellow
        '#0984e3',  // blue
        '#d63031',  // red
        '#6c5ce7',  // purple
        '#e17055',  // orange
        '#00cec9',  // teal
        '#fd79a8',  // pink
    ];

    var gradeChartInstance = null;
    var gradeChartSection = document.getElementById('gradeChartSection');
    var gradeChartToggle = document.getElementById('gradeChartToggle');

    gradeChartToggle.addEventListener('change', function () {
        if (gradeChartToggle.checked) {
            deactivatedSubjects.delete('__gradeChart__');
        } else {
            deactivatedSubjects.add('__gradeChart__');
        }
        gradeChartSection.classList.toggle('rc-row-deactivated', !gradeChartToggle.checked);
    });

    function renderGradeChart(data) {
        if (gradeChartInstance) {
            gradeChartInstance.destroy();
            gradeChartInstance = null;
        }

        var labels = data.weeks.map(function (w) { return w.label; });
        var datasets = [];
        var colorIdx = 0;

        // Subject datasets
        data.subjects.forEach(function (subj) {
            if (deactivatedSubjects.has(subj.name)) return;
            var values = data.weeks.map(function (w) {
                var g = subj.weeklyGrades[w.number];
                return g ? g.percentage : null;
            });
            datasets.push({
                label: subj.name,
                data: values,
                backgroundColor: SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length],
                borderColor: SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length],
                borderWidth: 1
            });
            colorIdx++;
        });

        // Integrated Vocabulary dataset
        if (!deactivatedSubjects.has('__vocab__') && data.integratedVocabulary) {
            var vocabValues = data.weeks.map(function (w) {
                var g = data.integratedVocabulary.weeklyGrades[w.number];
                return g ? g.percentage : null;
            });
            datasets.push({
                label: 'Integrated Vocabulary',
                data: vocabValues,
                backgroundColor: SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length],
                borderColor: SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length],
                borderWidth: 1
            });
        }

        var ctx = document.getElementById('gradeChart').getContext('2d');
        gradeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                devicePixelRatio: 2,
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        ticks: {
                            stepSize: 25
                        },
                        grid: {
                            color: function (context) {
                                return context.tick.value % 25 === 0 ? '#e0e0e0' : 'transparent';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            padding: 15,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        gradeChartSection.style.display = '';
        gradeChartToggle.checked = !deactivatedSubjects.has('__gradeChart__');
        gradeChartSection.classList.toggle('rc-row-deactivated', deactivatedSubjects.has('__gradeChart__'));
    }

    // ── Academic Enabler Charts ──

    var aeChartsContainer = document.getElementById('aeChartsContainer');

    function computeAESkillAvg(entry, domainName, skillName) {
        if (!entry || !entry.ratings || !entry.ratings[domainName]) return null;
        var teacherScores = entry.ratings[domainName][skillName];
        if (!teacherScores) return null;
        var activeTeachers = entry.activeTeachers || entry.teachers || [];
        var sum = 0, count = 0;
        activeTeachers.forEach(function (t) {
            if (teacherScores[t] !== undefined) { sum += teacherScores[t]; count++; }
        });
        return count > 0 ? sum / count : null;
    }

    var aeChartInstances = [];

    function renderAECharts(initial, final) {
        // Destroy previous chart instances
        aeChartInstances.forEach(function (c) { c.destroy(); });
        aeChartInstances = [];
        aeChartsContainer.innerHTML = '';

        if (!initial && !final) {
            aeChartsContainer.style.display = 'none';
            return;
        }

        var hasAnyData = false;

        AE_DOMAINS.forEach(function (domain) {
            // Get skill names from whichever entry exists
            var sourceEntry = initial || final;
            if (!sourceEntry || !sourceEntry.ratings || !sourceEntry.ratings[domain.name]) return;

            var skillNames = Object.keys(sourceEntry.ratings[domain.name]);
            if (skillNames.length === 0) return;

            // Compute per-skill averages
            var initialAvgs = [];
            var finalAvgs = [];
            var labels = [];

            skillNames.forEach(function (skill) {
                labels.push(skill);
                initialAvgs.push(computeAESkillAvg(initial, domain.name, skill));
                finalAvgs.push(computeAESkillAvg(final, domain.name, skill));
            });

            // Add "Average" row
            var iDomainAvg = computeAEDomainAvg(initial, domain.name);
            var fDomainAvg = computeAEDomainAvg(final, domain.name);
            labels.push('Average');
            initialAvgs.push(iDomainAvg);
            finalAvgs.push(fDomainAvg);

            // Skip if no data at all
            var hasData = initialAvgs.some(function (v) { return v !== null; }) ||
                          finalAvgs.some(function (v) { return v !== null; });
            if (!hasData) return;

            hasAnyData = true;

            // Create container
            var block = document.createElement('div');
            block.className = 'rc-ae-chart-block';

            var title = document.createElement('h4');
            title.textContent = domain.number + '. ' + domain.name;
            block.appendChild(title);

            var canvasWrap = document.createElement('div');
            canvasWrap.className = 'rc-ae-chart-canvas-wrap';
            var canvasHeight = labels.length * 40 + 60;
            canvasWrap.style.height = canvasHeight + 'px';

            var canvas = document.createElement('canvas');
            canvasWrap.appendChild(canvas);
            block.appendChild(canvasWrap);
            aeChartsContainer.appendChild(block);

            // Build datasets
            var datasets = [];
            if (initial) {
                datasets.push({
                    label: 'Initial',
                    data: initialAvgs,
                    backgroundColor: '#74b9ff',
                    borderColor: '#74b9ff',
                    borderWidth: 1
                });
            }
            if (final) {
                datasets.push({
                    label: 'Final',
                    data: finalAvgs,
                    backgroundColor: '#00b894',
                    borderColor: '#00b894',
                    borderWidth: 1
                });
            }

            var chart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    devicePixelRatio: 2,
                    scales: {
                        x: {
                            min: 50,
                            max: 100,
                            ticks: { stepSize: 10 }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                boxWidth: 12,
                                padding: 10,
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });

            aeChartInstances.push(chart);
        });

        aeChartsContainer.style.display = hasAnyData ? '' : 'none';
    }

    // Academic Enabler integration
    async function fetchAndRenderAE() {
        aeSection.style.display = 'none';
        try {
            var res = await fetch('/api/academic-enabler');
            if (!res.ok) throw new Error('Failed to fetch AE data');
            var allEntries = await res.json();

            // Match student: entry.student starts with currentData.student
            var studentName = currentData.student;
            var studentEntries = allEntries.filter(function (e) {
                return e.student.toLowerCase().startsWith(studentName.toLowerCase());
            });

            // Match season: overlap with report card date range
            var rcFrom = dateFrom.value;
            var rcTo = dateTo.value;

            var matchedEntries = studentEntries.filter(function (e) {
                var parts = e.season.split('_');
                var seasonFrom = parts[0];
                var seasonTo = parts[1];
                return seasonFrom <= rcTo && seasonTo >= rcFrom;
            });

            if (matchedEntries.length === 0) return;

            var initial = matchedEntries.find(function (e) { return e.type === 'initial'; });
            var final = matchedEntries.find(function (e) { return e.type === 'final'; });

            if (!initial && !final) return;

            renderAETable(initial, final);
            renderAECharts(initial, final);
            aeSection.style.display = '';
        } catch (err) {
            console.error('Error fetching AE data:', err);
        }
    }

    function computeAEDomainAvg(entry, domainName) {
        if (!entry || !entry.ratings || !entry.ratings[domainName]) return null;

        var domain = entry.ratings[domainName];
        var activeTeachers = entry.activeTeachers || entry.teachers || [];
        var skillAvgs = [];

        Object.keys(domain).forEach(function (skillName) {
            var teacherScores = domain[skillName];
            var sum = 0, count = 0;

            activeTeachers.forEach(function (teacher) {
                if (teacherScores[teacher] !== undefined) {
                    sum += teacherScores[teacher];
                    count++;
                }
            });

            if (count > 0) {
                skillAvgs.push(sum / count);
            }
        });

        if (skillAvgs.length === 0) return null;

        var total = skillAvgs.reduce(function (a, b) { return a + b; }, 0);
        return total / skillAvgs.length;
    }

    function getAEGrade(score) {
        if (score >= 90) return { letter: 'E', key: 'e' };
        if (score >= 80) return { letter: 'G', key: 'g' };
        if (score >= 70) return { letter: 'P', key: 'p' };
        return { letter: 'VP', key: 'vp' };
    }

    function renderAETable(initial, final) {
        var hasInitial = !!initial;
        var hasFinal = !!final;

        var html = '<table class="rc-ae-table">';
        html += '<thead><tr>';
        html += '<th>Domain</th>';
        if (hasInitial) html += '<th>I</th>';
        if (hasFinal) html += '<th>F</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        AE_DOMAINS.forEach(function (d) {
            var iAvg = hasInitial ? computeAEDomainAvg(initial, d.name) : null;
            var fAvg = hasFinal ? computeAEDomainAvg(final, d.name) : null;

            html += '<tr>';
            html += '<td class="rc-ae-domain-cell">' + d.number + '. ' + escapeHtml(d.name) + '</td>';

            if (hasInitial) {
                if (iAvg !== null) {
                    var iGrade = getAEGrade(iAvg);
                    html += '<td class="rc-ae-score-cell"><span class="rc-ae-grade rc-ae-grade-' + iGrade.key + '">' + iGrade.letter + '</span><span class="rc-ae-score">' + iAvg.toFixed(1) + '</span></td>';
                } else {
                    html += '<td class="rc-ae-score-cell"><span class="rc-ae-empty">-</span></td>';
                }
            }

            if (hasFinal) {
                if (fAvg !== null) {
                    var fGrade = getAEGrade(fAvg);
                    html += '<td class="rc-ae-score-cell"><span class="rc-ae-grade rc-ae-grade-' + fGrade.key + '">' + fGrade.letter + '</span><span class="rc-ae-score">' + fAvg.toFixed(1) + '</span></td>';
                } else {
                    html += '<td class="rc-ae-score-cell"><span class="rc-ae-empty">-</span></td>';
                }
            }

            html += '</tr>';
        });

        html += '</tbody></table>';
        aeContainer.innerHTML = html;

        // Restore toggle state
        aeToggle.checked = !deactivatedSubjects.has('__ae__');
        aeSection.classList.toggle('rc-row-deactivated', deactivatedSubjects.has('__ae__'));
    }
});
