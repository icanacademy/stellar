/**
 * Shared utilities for all report-card-data-generator pages.
 */

/**
 * Fetches the student list from /api/students and populates a <select> element.
 * @param {HTMLSelectElement} selectEl - The student dropdown.
 * @returns {Promise<string[]>} - Array of student names loaded.
 */
async function loadStudents(selectEl) {
    try {
        var res = await fetch('/api/students');
        if (!res.ok) throw new Error('Failed to load students');
        var students = await res.json();
        students.forEach(function (s) {
            var opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            selectEl.appendChild(opt);
        });
        return students;
    } catch (err) {
        console.error('Error loading students:', err);
        return [];
    }
}

/**
 * Reads the ?student= query param from the current URL.
 * @returns {string|null}
 */
function getStudentFromURL() {
    var params = new URLSearchParams(window.location.search);
    return params.get('student') || null;
}

/**
 * Updates all nav links on the page to include the current student selection.
 * Nav links must have a data-href attribute with the base path.
 * @param {string} studentValue
 */
function updateNavLinks(studentValue) {
    document.querySelectorAll('.btn-nav[data-href]').forEach(function (link) {
        var base = link.getAttribute('data-href');
        if (studentValue) {
            link.href = base + '?student=' + encodeURIComponent(studentValue);
        } else {
            link.href = base;
        }
    });
}

/**
 * Marks the nav link matching the current path as active,
 * and preserves the current ?student= param in all nav links.
 */
function setActiveNav() {
    var currentPath = window.location.pathname;
    var student = getStudentFromURL();
    document.querySelectorAll('.btn-nav[data-href]').forEach(function (link) {
        if (link.getAttribute('data-href') === currentPath) {
            link.classList.add('active');
        }
        if (student) {
            var base = link.getAttribute('data-href');
            link.href = base + '?student=' + encodeURIComponent(student);
        }
    });
}

/**
 * On page load, if ?student= param exists, select that student in the dropdown
 * and trigger the change event. Must be called AFTER loadStudents() resolves
 * and AFTER event listeners are attached.
 * @param {HTMLSelectElement} selectEl
 */
function restoreStudentFromURL(selectEl) {
    var student = getStudentFromURL();
    if (student && selectEl) {
        selectEl.value = student;
        if (selectEl.value === student) {
            selectEl.dispatchEvent(new Event('change'));
        }
    }
}
