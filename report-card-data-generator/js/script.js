document.addEventListener('DOMContentLoaded', async function() {
    // DOM Elements
    const studentSelect = document.getElementById('studentSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    const generateBtn = document.getElementById('generateBtn');
    const clearBtn = document.getElementById('clearBtn');
    const resultsSection = document.getElementById('resultsSection');
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    const emptyState = document.getElementById('emptyState');
    const tableBody = document.getElementById('tableBody');
    const teacherBody = document.getElementById('teacherBody');
    const filterInfo = document.getElementById('filterInfo');
    const recordCount = document.getElementById('recordCount');
    const copyBtn = document.getElementById('copyBtn');
    const copyConfirmation = document.getElementById('copyConfirmation');
    const generateAiBtn = document.getElementById('generateAiBtn');
    const aiLoadingState = document.getElementById('aiLoadingState');
    const aiContent = document.getElementById('aiContent');
    const strengthsContent = document.getElementById('strengthsContent');
    const improvementsContent = document.getElementById('improvementsContent');
    const recommendationsContent = document.getElementById('recommendationsContent');

    let currentData = [];

    // Load students and set up shared nav
    await loadStudents(studentSelect);
    setActiveNav();
    updateNavLinks(studentSelect.value);

    // Event Listeners
    studentSelect.addEventListener('change', onStudentChange);
    subjectSelect.addEventListener('change', checkFormValidity);
    generateBtn.addEventListener('click', generateReport);
    clearBtn.addEventListener('click', clearForm);
    copyBtn.addEventListener('click', copyToClipboard);
    generateAiBtn.addEventListener('click', generateAIAnalysis);

    // Restore student from URL param (after listeners are attached)
    restoreStudentFromURL(studentSelect);

    // Handle student selection change
    async function onStudentChange() {
        const selectedStudent = studentSelect.value;
        updateNavLinks(selectedStudent);

        // Clear subject dropdown
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';

        // Hide results when changing student
        resultsSection.style.display = 'none';
        aiAnalysisSection.style.display = 'none';
        emptyState.style.display = 'block';
        currentData = [];

        if (!selectedStudent) {
            checkFormValidity();
            return;
        }

        // Fetch subjects for the selected student from API
        try {
            const response = await fetch(`/api/subjects?student=${encodeURIComponent(selectedStudent)}`);
            if (response.ok) {
                const subjects = await response.json();

                // Populate subject dropdown
                subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectSelect.appendChild(option);
                });
            } else {
                console.error('Failed to load subjects');
            }
        } catch (error) {
            console.error('Error loading subjects:', error);
        }

        checkFormValidity();
    }

    // Check if form is valid to enable generate button
    function checkFormValidity() {
        const isValid = studentSelect.value && subjectSelect.value;
        generateBtn.disabled = !isValid;
    }

    // Generate report card data
    async function generateReport() {
        const student = studentSelect.value;
        const subject = subjectSelect.value;

        if (!student || !subject) {
            alert('Please select both student and subject');
            return;
        }

        try {
            const response = await fetch(`/api/report-card-data?student=${encodeURIComponent(student)}&subject=${encodeURIComponent(subject)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch report data');
            }

            const result = await response.json();

            if (!result.data || result.data.length === 0) {
                alert('No data found for this student and subject combination');
                return;
            }

            currentData = result.data;
            displayData(result.data, student, subject);
        } catch (error) {
            console.error('Error generating report:', error);
            showError('Error generating report: ' + error.message);
        }
    }

    // Display data in table
    function displayData(data, student, subject) {
        // Hide empty state, show results
        emptyState.style.display = 'none';
        resultsSection.style.display = 'block';
        aiAnalysisSection.style.display = 'block';
        aiContent.style.display = 'none';

        // Update filter info
        filterInfo.textContent = `Student: ${student} | Subject: ${subject}`;
        recordCount.textContent = `${data.length} record${data.length !== 1 ? 's' : ''} found`;

        // Clear table and teacher column
        tableBody.innerHTML = '';
        teacherBody.innerHTML = '';

        // Populate table and teacher names
        data.forEach(row => {
            // Create table row
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>${row.date || ''}</td>
                <td>${row.bookMaterialsScore || ''}</td>
                <td>${row.bookMaterialsTotal || ''}</td>
                <td>${row.vocabularyScore || ''}</td>
                <td>${row.vocabularyTotal || ''}</td>
                <td>${row.classVideoScore || ''}</td>
                <td>${row.classVideoTotal || ''}</td>
                <td>${row.homeworkScore || ''}</td>
                <td>${row.homeworkTotal || ''}</td>
                <td>${row.homeworkVocabScore || ''}</td>
                <td>${row.homeworkVocabTotal || ''}</td>
                <td>${row.weeklyTestScore || ''}</td>
                <td>${row.weeklyTestTotal || ''}</td>
            `;

            tableBody.appendChild(tr);

            // Create teacher name row
            const teacherRow = document.createElement('div');
            teacherRow.className = 'teacher-row';
            teacherRow.textContent = row.teacherName || '-';
            teacherBody.appendChild(teacherRow);
        });
    }

    // Copy table to clipboard
    async function copyToClipboard() {
        try {
            let clipboardText = '';

            // Get all rows from table
            const rows = tableBody.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const rowData = Array.from(cells).map(cell => cell.textContent).join('\t');
                clipboardText += rowData + '\n';
            });

            await navigator.clipboard.writeText(clipboardText);

            // Show confirmation
            copyConfirmation.style.display = 'block';
            setTimeout(() => {
                copyConfirmation.style.display = 'none';
            }, 3000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            alert('Failed to copy to clipboard');
        }
    }

    // Generate AI Analysis
    async function generateAIAnalysis() {
        const student = studentSelect.value;
        const subject = subjectSelect.value;

        if (!student || !subject || currentData.length === 0) {
            alert('Please generate report data first');
            return;
        }

        // Show loading state
        aiLoadingState.style.display = 'block';
        aiContent.style.display = 'none';
        generateAiBtn.disabled = true;

        try {
            const response = await fetch(`/api/ai-analysis?student=${encodeURIComponent(student)}&subject=${encodeURIComponent(subject)}`);

            if (!response.ok) {
                throw new Error('Failed to generate AI analysis');
            }

            const result = await response.json();
            const analysis = result.analysis;

            // Display analysis (text paragraphs, not lists)
            strengthsContent.innerHTML = formatText(analysis.strengths);
            improvementsContent.innerHTML = formatText(analysis.improvements);
            recommendationsContent.innerHTML = formatText(analysis.recommendations);

            // Show content
            aiLoadingState.style.display = 'none';
            aiContent.style.display = 'block';
        } catch (error) {
            console.error('Error generating AI analysis:', error);
            aiLoadingState.style.display = 'none';
            alert('Error generating AI analysis: ' + error.message);
        } finally {
            generateAiBtn.disabled = false;
        }
    }

    // Format text for display
    function formatText(text) {
        if (!text) return '<p>No data available</p>';

        // Split by double newlines to handle paragraphs
        const paragraphs = text.split('\n\n').filter(p => p.trim());

        if (paragraphs.length === 0) return '<p>No data available</p>';

        return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    }

    // Format list for display (backup function)
    function formatList(items) {
        if (!items || items.length === 0) return '<p>No data available</p>';
        return '<ul>' + items.map(item => `<li>${item}</li>`).join('') + '</ul>';
    }

    // Clear form and results
    function clearForm() {
        studentSelect.value = '';
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        generateBtn.disabled = true;
        resultsSection.style.display = 'none';
        aiAnalysisSection.style.display = 'none';
        emptyState.style.display = 'block';
        currentData = [];
        updateNavLinks('');
    }

    // Show error message
    function showError(message) {
        alert(message);
    }
});
